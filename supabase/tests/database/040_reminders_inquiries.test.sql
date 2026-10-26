-- Event reminders (owner-only) and housing inquiries + private attachments.
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
select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'alice@example.test', '{"full_name": "Alice", "phone": "+14045550142"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'bob@example.test', '{"full_name": "Bob"}');
select tests.create_user('ad000000-0000-4000-8000-0000000000ad', 'admin@example.test', '{"full_name": "Ada Admin"}');
select tests.create_user('ba000000-0000-4000-8000-0000000000ba', 'banned@example.test', '{"full_name": "Banned"}');
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-0000000000ad';
update public.profiles set status = 'banned' where id = 'ba000000-0000-4000-8000-0000000000ba';

-- ===============================================================================================
-- Event reminders (owner only)
-- ===============================================================================================
select tests.login_anon();
select throws_ok($$select count(*) from public.event_reminders$$, '42501', null, 'guest cannot read reminders');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('e1', now() + interval '3 days')$$,
  '42501', null, 'guest cannot create reminders');

select tests.login('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.event_reminders (event_id, event_title, event_starts_at)
  values ('event-far', 'Budgeting basics', now() + interval '3 days')$$, 'resident sets a reminder');
select ok((select abs(extract(epoch from (remind_at - (event_starts_at - interval '24 hours')))) < 1
           from public.event_reminders where event_id = 'event-far'),
  'remind_at is 24 h before the start (Q-004)');
select lives_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('event-soon', now() + interval '5 hours')$$,
  'reminder for an event later today');
select ok((select abs(extract(epoch from (remind_at - (event_starts_at - interval '1 hour')))) < 1
           from public.event_reminders where event_id = 'event-soon'),
  'falls back to 1 h before');
select lives_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('event-now', now() + interval '20 minutes')$$,
  'reminder for an event about to start');
select ok((select remind_at <= now() from public.event_reminders where event_id = 'event-now'), 'falls back to now');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('event-far', now() + interval '3 days')$$,
  '23505', null, 'a duplicate reminder is rejected (409 through PostgREST)');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('event-past', now() - interval '1 hour')$$,
  '22023', null, 'cannot set a reminder for an event that already started');
select throws_ok($$insert into public.event_reminders (user_id, event_id, event_starts_at)
  values ('b0000000-0000-4000-8000-00000000000b', 'event-x', now() + interval '3 days')$$,
  '42501', null, 'cannot create a reminder for someone else');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at, sent_at) values ('event-y', now() + interval '3 days', now())$$,
  '42501', null, 'cannot set sent_at');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at, remind_at) values ('event-y', now() + interval '3 days', now())$$,
  '42501', null, 'cannot choose remind_at');
select throws_ok($$update public.event_reminders set sent_at = now()$$, '42501', null, 'cannot update reminders');
select is((select count(*)::int from public.event_reminders), 3, 'resident sees their reminders');

select tests.login('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.event_reminders), 0, 'another resident sees none of them');
delete from public.event_reminders where event_id = 'event-far';
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.event_reminders), 0, 'admins only see their own reminders too');
delete from public.event_reminders where event_id = 'event-far';
select tests.login('a0000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.event_reminders where event_id = 'event-far'), 1,
  'neither another resident nor an admin could delete it');
select lives_ok($$delete from public.event_reminders where event_id = 'event-far'$$, 'owner deletes their reminder');
select is((select count(*)::int from public.event_reminders where event_id = 'event-far'), 0, 'reminder is gone');

select tests.login('ba000000-0000-4000-8000-0000000000ba');
select throws_ok($$insert into public.event_reminders (event_id, event_starts_at) values ('e1', now() + interval '3 days')$$,
  '42501', null, 'banned users cannot create reminders');
select tests.logout();
reset role;

-- Cron claim (service role helper): due reminders are claimed once, with the owner's tokens.
insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[alice-phone]', 'a0000000-0000-4000-8000-00000000000a', 'ios');
create temp table claimed on commit drop as select * from public.claim_due_event_reminders(500);
select is((select count(*)::int from claimed where user_id = 'a0000000-0000-4000-8000-00000000000a'), 1,
  'only the due reminder is claimed');
select is((select tokens from claimed where event_id = 'event-now'), array['ExponentPushToken[alice-phone]'],
  'claimed reminder carries the owner''s tokens');
select is((select count(*)::int from public.claim_due_event_reminders(500) where user_id = 'a0000000-0000-4000-8000-00000000000a'), 0,
  'a second run claims nothing (never sent twice)');
update public.event_reminders set event_starts_at = now() + interval '2 days' where event_id = 'event-now';
select ok((select sent_at is null and remind_at > now() from public.event_reminders where event_id = 'event-now'),
  'rescheduling re-arms the reminder');
select tests.login('a0000000-0000-4000-8000-00000000000a');
select throws_ok($$select * from public.claim_due_event_reminders(10)$$, '42501', null, 'clients cannot claim reminders');
select tests.logout();
reset role;

-- ===============================================================================================
-- Housing inquiries
-- ===============================================================================================
select tests.login_anon();
select throws_ok($$insert into public.housing_inquiries (housing_program_id, message, preferred_contact) values ('p1', 'Hi', 'email')$$,
  '42501', null, 'guest cannot create inquiries');
select throws_ok($$select count(*) from public.housing_inquiries$$, '42501', null, 'guest cannot read inquiries');

select tests.login('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.housing_inquiries (housing_program_id, housing_program_title, message, preferred_contact)
  values ('program-rent', 'Emergency rental assistance', 'I am behind on rent.', 'phone')$$, 'resident sends an inquiry');
select is((select status::text from public.housing_inquiries where housing_program_id = 'program-rent'), 'new', 'status starts new');
select is((select user_id from public.housing_inquiries where housing_program_id = 'program-rent'),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'owner is the caller');
select throws_ok($$insert into public.housing_inquiries (housing_program_id, message, preferred_contact, status)
  values ('p', 'm', 'email', 'closed')$$, '42501', null, 'cannot choose the status');
select throws_ok($$insert into public.housing_inquiries (user_id, housing_program_id, message, preferred_contact)
  values ('b0000000-0000-4000-8000-00000000000b', 'p', 'm', 'email')$$, '42501', null, 'cannot file an inquiry as someone else');
select throws_ok($$insert into public.housing_inquiries (housing_program_id, message, preferred_contact)
  values ('p', repeat('x', 4001), 'email')$$, '23514', null, 'message longer than 4000 is rejected');
select throws_ok($$insert into public.housing_inquiries (housing_program_id, message, preferred_contact)
  values ('p', 'm', 'fax')$$, '22P02', null, 'preferred_contact must be email or phone');
select throws_ok($$select admin_notes from public.housing_inquiries$$, '42501', null, 'residents cannot read admin_notes');
select lives_ok($$update public.housing_inquiries set status = 'closed'$$, 'update by the owner runs...');
select is((select status::text from public.housing_inquiries where housing_program_id = 'program-rent'), 'new',
  '...but changes nothing: residents cannot change status');
select is((select count(*)::int from public.admin_housing_inquiries), 0, 'residents see nothing in admin_housing_inquiries');

select tests.login('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.housing_inquiries), 0, 'another resident sees none of Alice''s inquiries');

select tests.login('ba000000-0000-4000-8000-0000000000ba');
select throws_ok($$insert into public.housing_inquiries (housing_program_id, message, preferred_contact) values ('p', 'm', 'email')$$,
  '42501', null, 'banned users cannot send inquiries');

select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.housing_inquiries where housing_program_id = 'program-rent'), 1, 'admins see every inquiry');
select is((select resident_phone from public.admin_housing_inquiries where housing_program_id = 'program-rent'), '+14045550142',
  'admin view includes the resident''s contact details');
select lives_ok($$update public.housing_inquiries set status = 'in_progress', admin_notes = 'Called back' where housing_program_id = 'program-rent'$$,
  'admin updates status and notes');
select is((select admin_notes from public.admin_housing_inquiries where housing_program_id = 'program-rent'), 'Called back',
  'admin notes saved');
select throws_ok($$update public.housing_inquiries set message = 'edited' where housing_program_id = 'program-rent'$$,
  '42501', null, 'admins can only change status and notes');
select throws_ok($$delete from public.housing_inquiries$$, '42501', null, 'nobody deletes inquiries through the API');
select is((select count(*)::int from public.admin_activity_log
           where action = 'inquiry_status_changed' and actor_id = 'ad000000-0000-4000-8000-0000000000ad'
             and details ->> 'to' = 'in_progress'), 1, 'inquiry status changes are logged');
select tests.logout();
reset role;

-- ---- attachments (private bucket) ------------------------------------------------------------
select ok((select not public and file_size_limit = 10485760
                  and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
                  and cardinality(allowed_mime_types) = 4
           from storage.buckets where id = 'inquiry-attachments'),
  'inquiry-attachments: private, 10 MB, PDF/JPEG/PNG/HEIC');
create temp table alice_inquiry on commit drop as
  select id from public.housing_inquiries where housing_program_id = 'program-rent';
grant select on alice_inquiry to anon, authenticated;

select tests.login('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into storage.objects (bucket_id, name)
  values ('inquiry-attachments', 'a0000000-0000-4000-8000-00000000000a/' || (select id from alice_inquiry) || '/lease.pdf')$$,
  'owner uploads an attachment into their inquiry folder');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('inquiry-attachments', 'b0000000-0000-4000-8000-00000000000b/' || (select id from alice_inquiry) || '/x.pdf')$$,
  '42501', null, 'cannot upload into someone else''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('inquiry-attachments', 'a0000000-0000-4000-8000-00000000000a/' || gen_random_uuid() || '/x.pdf')$$,
  '42501', null, 'cannot upload for an inquiry that does not exist');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('inquiry-attachments', 'a0000000-0000-4000-8000-00000000000a/' || (select id from alice_inquiry) || '/x.exe')$$,
  '42501', null, 'only pdf/jpeg/png/heic file names are accepted');
select lives_ok($$insert into storage.objects (bucket_id, name)
  select 'inquiry-attachments', 'a0000000-0000-4000-8000-00000000000a/' || (select id from alice_inquiry) || '/doc' || g || '.png'
  from generate_series(2, 5) g$$, 'up to five attachments');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('inquiry-attachments', 'a0000000-0000-4000-8000-00000000000a/' || (select id from alice_inquiry) || '/doc6.png')$$,
  '42501', null, 'a sixth attachment is rejected');
select is((select count(*)::int from storage.objects where bucket_id = 'inquiry-attachments'
           and name like 'a0000000-0000-4000-8000-00000000000a/%'), 5, 'owner can list their attachments');

select tests.login('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'inquiry-attachments'
           and name like 'a0000000-0000-4000-8000-00000000000a/%'), 0, 'another resident cannot see them');
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from storage.objects where bucket_id = 'inquiry-attachments'
           and name like 'a0000000-0000-4000-8000-00000000000a/%'), 5, 'admins can read them');
select is((select jsonb_array_length(attachments) from public.admin_housing_inquiries where id = (select id from alice_inquiry)), 5,
  'admin view lists the attachments');
select tests.login_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'inquiry-attachments'), 0, 'guests cannot see attachments');
select tests.logout();
reset role;

select * from finish();
rollback;
