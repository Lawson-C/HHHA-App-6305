-- Blight reports: reporter privacy, server-owned fields, moderation, duplicate check, photos/Storage.
-- One transaction, rolled back at the end: safe to run against a shared database.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---- helpers (rolled back with the transaction) ---------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.create_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_meta, '{}'::jsonb, now(), now())
  returning id
$$;
create function tests.login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;
create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
-- Act as the database owner again (also clears the JWT claims).
create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;


-- ---- fixtures --------------------------------------------------------------------------------
select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'alice@example.test', '{"full_name": "Alice"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'bob@example.test', '{"full_name": "Bob"}');
select tests.create_user('ad000000-0000-4000-8000-0000000000ad', 'admin@example.test', '{"full_name": "Ada Admin"}');
select tests.create_user('ba000000-0000-4000-8000-0000000000ba', 'banned@example.test', '{"full_name": "Banned"}');
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-0000000000ad';
update public.profiles set status = 'banned' where id = 'ba000000-0000-4000-8000-0000000000ba';

-- Alice's resolved and removed reports (inserted as the owner of the database).
insert into public.blight_reports (id, reporter_id, category, latitude, longitude, status, resolution_note)
values (990101, 'a0000000-0000-4000-8000-00000000000a', 'vacant_lot', 33.75, -84.43, 'resolved', 'Cleared by the City'),
       (990102, 'a0000000-0000-4000-8000-00000000000a', 'vacant_lot', 33.75, -84.43, 'removed', null),
       (990103, 'b0000000-0000-4000-8000-00000000000b', 'other', 33.75, -84.43, 'submitted', null);

-- ---- guest -----------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select count(*) from public.blight_reports$$, '42501', null, 'guest cannot read the base table');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude) values ('other', 33.76, -84.42)$$,
  '42501', null, 'guest cannot create reports');
select is((select count(*)::int from public.public_blight_reports where id in (990101, 990102)), 0,
  'resolved and removed reports are not public');

-- ---- resident creates ------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.blight_reports (category, description, latitude, longitude, address, keep_name_private)
  values ('illegal_dumping', 'Tires <script>x</script>behind the store', 33.7625, -84.4211, 'Joseph E. Boone Blvd NW', true)$$,
  'resident creates a report');
select tests.logout();
reset role;
create temp table alice_report on commit drop as
  select id from public.blight_reports
  where reporter_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'submitted' order by id desc limit 1;
grant select on alice_report to anon, authenticated;
select tests.login('a0000000-0000-4000-8000-00000000000a');
select is((select reporter_id from public.blight_reports where id = (select id from alice_report)),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'reporter is the caller');
select is((select status::text from public.blight_reports where id = (select id from alice_report)), 'submitted',
  'status starts as submitted');
select is((select jsonb_array_length(status_history) from public.blight_reports where id = (select id from alice_report)), 1,
  'status_history has the submitted entry');
select is((select status_history -> 0 ->> 'status' from public.blight_reports where id = (select id from alice_report)), 'submitted',
  'status_history entry is submitted');
select is((select description from public.blight_reports where id = (select id from alice_report)), 'Tires xbehind the store',
  'description is sanitized (tags stripped)');
select isnt((select id from alice_report), null, 'report gets a numeric id ("Report #N")');

select throws_ok($$insert into public.blight_reports (reporter_id, category, latitude, longitude)
  values ('b0000000-0000-4000-8000-00000000000b', 'other', 33.76, -84.42)$$,
  '42501', null, 'resident cannot file a report as someone else');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude, status)
  values ('other', 33.76, -84.42, 'resolved')$$, '42501', null, 'resident cannot choose the status');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude, status_history)
  values ('other', 33.76, -84.42, '[]')$$, '42501', null, 'resident cannot supply status_history');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude) values ('other', 40.71, -74.00)$$,
  '23514', null, 'coordinates outside District 3 are rejected');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude, description)
  values ('other', 33.76, -84.42, repeat('x', 2001))$$, '23514', null, 'description longer than 2000 is rejected');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude) values ('graffiti', 33.76, -84.42)$$,
  '22P02', null, 'unknown category is rejected');

-- Owner sees all their own statuses, with private fields.
select is((select count(*)::int from public.blight_reports where id in (990101, 990102)), 2,
  'owner sees their resolved and removed reports');
select is((select resolution_note from public.blight_reports where id = 990101), 'Cleared by the City',
  'owner sees the resolution note');
select lives_ok($$update public.blight_reports set status = 'resolved' where id = (select id from alice_report)$$,
  'update statement by the owner runs...');
select is((select status::text from public.blight_reports where id = (select id from alice_report)), 'submitted',
  '...but changes nothing: residents cannot moderate their own report');
select throws_ok($$delete from public.blight_reports where id = (select id from alice_report)$$, '42501', null,
  'residents cannot delete reports');

-- ---- duplicate check (Q-013) -----------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.nearby_blight_reports('illegal_dumping', 33.7627, -84.4212)), 1,
  'same category within 50 m is reported as a possible duplicate');
select is((select count(*)::int from public.nearby_blight_reports('vacant_lot', 33.7627, -84.4212)), 0,
  'a different category is not a duplicate');
select is((select count(*)::int from public.nearby_blight_reports('illegal_dumping', 33.7700, -84.4211)), 0,
  'more than 50 m away is not a duplicate');

-- ---- other resident --------------------------------------------------------------------------
select is((select count(*)::int from public.blight_reports where reporter_id = 'a0000000-0000-4000-8000-00000000000a'), 0,
  'another resident cannot see Alice''s reports in the base table');

-- ---- public view -----------------------------------------------------------------------------
select tests.login_anon();
select is((select count(*)::int from public.public_blight_reports where id = (select id from alice_report)), 1,
  'the active report is public');
select is((select category::text from public.public_blight_reports where id = (select id from alice_report)), 'illegal_dumping',
  'public row has the category');
select is((select count(*)::int from public.public_blight_reports_near(33.7625, -84.4211, 1) where id = (select id from alice_report)), 1,
  'public_blight_reports_near finds it');
select ok((select distance_km < 0.01 from public.public_blight_reports_near(33.7625, -84.4211, 1) where id = (select id from alice_report)),
  'distance_km is returned');
select throws_ok($$select * from public.public_blight_reports_near(33.76, -84.42, 500)$$, '22023', null,
  'radius is capped at 50 km');
select throws_ok($$select * from public.nearby_blight_reports('other', 33.76, -84.42)$$, '42501', null,
  'guests cannot call the duplicate check');
select tests.logout();
reset role;
select ok(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'public_blight_reports'
      and column_name in ('reporter_id', 'keep_name_private', 'resolution_note')),
  'public_blight_reports never exposes reporter_id, keep_name_private or resolution_note');

-- ---- banned user -----------------------------------------------------------------------------
select tests.login('ba000000-0000-4000-8000-0000000000ba');
select throws_ok($$insert into public.blight_reports (category, latitude, longitude) values ('other', 33.76, -84.42)$$,
  '42501', null, 'banned users cannot create reports');
select tests.logout();
reset role;

-- ---- admin moderation ------------------------------------------------------------------------
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is((select reporter_id from public.blight_reports where id = (select id from alice_report)),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'admins see the reporter');
select is((select full_name from public.profiles where id = (select reporter_id from public.blight_reports where id = (select id from alice_report))),
  'Alice', 'admins can resolve the reporter''s name');
select lives_ok($$update public.blight_reports set status = 'under_review' where id = (select id from alice_report)$$,
  'admin moves the report to under_review');
select lives_ok($$update public.blight_reports set status = 'resolved', resolution_note = 'Hauled away' where id = (select id from alice_report)$$,
  'admin resolves the report');
select is((select jsonb_array_length(status_history) from public.blight_reports where id = (select id from alice_report)), 3,
  'status_history appended on every status change');
select is((select status_history -> 2 ->> 'status' from public.blight_reports where id = (select id from alice_report)), 'resolved',
  'last history entry is resolved');
select isnt((select resolved_at from public.blight_reports where id = (select id from alice_report)), null,
  'resolved_at is set');
select throws_ok($$update public.blight_reports set reporter_id = 'b0000000-0000-4000-8000-00000000000b' where id = (select id from alice_report)$$,
  '42501', null, 'not even admins can reassign the reporter');
select throws_ok($$update public.blight_reports set status_history = '[]' where id = (select id from alice_report)$$,
  '42501', null, 'status_history is server-maintained');
select lives_ok($$update public.blight_reports set address = 'Corrected address' where id = (select id from alice_report)$$,
  'admin edits without a status change');
select lives_ok($$update public.blight_reports set status = 'removed' where id = 990101$$, 'admin soft-deletes a report');
select throws_ok($$delete from public.blight_reports where id = 990101$$, '42501', null, 'not even admins can hard-delete');
select is((select count(*)::int from public.admin_activity_log
           where target_type = 'blight_report' and target_id = (select id::text from alice_report)
             and action = 'report_status_changed' and actor_id = 'ad000000-0000-4000-8000-0000000000ad'), 2,
  'status changes are logged with the admin');
select is((select count(*)::int from public.admin_activity_log
           where target_type = 'blight_report' and target_id = (select id::text from alice_report) and action = 'report_edited'), 1,
  'edits are logged as report_edited');
select is((select count(*)::int from public.admin_activity_log
           where target_type = 'blight_report' and target_id = '990101' and action = 'report_removed'), 1,
  'removal is logged as report_removed');
select tests.logout();
reset role;

-- Account deletion anonymizes reports (Q-003 default) without an audit entry.
select lives_ok($$delete from auth.users where id = 'b0000000-0000-4000-8000-00000000000b'$$, 'a resident account can be deleted');
select is((select reporter_id from public.blight_reports where id = 990103), null,
  'deleting an account anonymizes its reports (Q-003 default)');
select is((select count(*)::int from public.admin_activity_log where target_type = 'blight_report' and target_id = '990103'), 0,
  'anonymization is not logged as an admin edit');

-- ===============================================================================================
-- Photos: Storage bucket blight-photos + blight_report_photos rows
-- ===============================================================================================
select ok((select public and file_size_limit = 10485760
                  and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
                  and cardinality(allowed_mime_types) = 3
           from storage.buckets where id = 'blight-photos'),
  'blight-photos: public, 10 MB, JPEG/PNG/WebP only');

insert into public.blight_reports (id, reporter_id, category, latitude, longitude)
values (990201, 'a0000000-0000-4000-8000-00000000000a', 'standing_water', 33.77, -84.41);

select tests.login('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/p1.jpg')$$,
  'reporter uploads a photo to their report folder');
select lives_ok($$insert into public.blight_report_photos (report_id, storage_path) values (990201, '990201/p1.jpg')$$,
  'reporter attaches the uploaded photo');
select throws_ok($$insert into public.blight_report_photos (report_id, storage_path) values (990201, '990201/never-uploaded.jpg')$$,
  '42501', null, 'cannot attach a photo that was not uploaded');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/evil.svg')$$,
  '42501', null, 'non-image extensions are rejected');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', 'a0000000-0000-4000-8000-00000000000a/990201/p.jpg')$$,
  '42501', null, 'paths must be {report_id}/{file} (no user id in public URLs)');
select lives_ok($$insert into storage.objects (bucket_id, name)
  select 'blight-photos', '990201/p' || g || '.jpg' from generate_series(2, 5) g$$, 'up to five photos');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/p6.jpg')$$,
  '42501', null, 'a sixth upload is rejected');
select lives_ok($$insert into public.blight_report_photos (report_id, storage_path)
  select 990201, '990201/p' || g || '.jpg' from generate_series(2, 5) g$$, 'attach photos 2-5');
select is((select cardinality(photo_paths) from public.public_blight_reports where id = 990201), 5,
  'public view lists the photo paths');
select tests.logout();
reset role;

-- Max 5 rows even for trusted writers.
insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/p6.jpg');
select throws_ok($$insert into public.blight_report_photos (report_id, storage_path) values (990201, '990201/p6.jpg')$$,
  'P0001', 'A report can have at most 5 photos', 'the database enforces at most 5 photos per report');

select tests.create_user('c0000000-0000-4000-8000-00000000000c', 'carol@example.test', '{"full_name": "Carol"}');
select tests.login('c0000000-0000-4000-8000-00000000000c');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/x.jpg')$$,
  '42501', null, 'another resident cannot upload to someone else''s report');
select throws_ok($$insert into public.blight_report_photos (report_id, storage_path) values (990201, '990201/p6.jpg')$$,
  '42501', null, 'another resident cannot attach photos to someone else''s report');
select is((select count(*)::int from public.blight_report_photos where report_id = 990201), 0,
  'another resident cannot read the photo rows of the base table');
select tests.login_anon();
select throws_ok($$insert into storage.objects (bucket_id, name) values ('blight-photos', '990201/anon.jpg')$$,
  '42501', null, 'guests cannot upload');
select throws_ok($$select count(*) from public.blight_report_photos$$, '42501', null, 'guests cannot read photo rows directly');
select tests.logout();
reset role;

-- Uploads close once the report is under review.
update public.blight_reports set status = 'under_review' where id = 990201;
delete from public.blight_report_photos where storage_path = '990201/p5.jpg';
select tests.login('a0000000-0000-4000-8000-00000000000a');
select throws_ok($$insert into public.blight_report_photos (report_id, storage_path) values (990201, '990201/p5.jpg')$$,
  '42501', null, 'photos cannot be added after the report left submitted');
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select lives_ok($$delete from public.blight_report_photos where storage_path = '990201/p4.jpg'$$, 'admins can take a photo down');
select tests.logout();
reset role;
select is((select count(*)::int from public.blight_report_photos where report_id = 990201), 3, 'photo row was removed');

select * from finish();
rollback;
