-- Profiles: creation trigger, own-row access, protected columns, blocked accounts.
-- Every test file is one transaction that is rolled back, so it is safe on a shared database.
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
select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'alice@example.test',
  '{"full_name": "  Alice <b>Resident</b> ", "phone": "+14045550142", "role": "admin"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'bob.builder@example.test',
  '{"phone": "404-555-0100"}');
select tests.create_user('ad000000-0000-4000-8000-0000000000ad', 'admin@example.test', '{"full_name": "Ada Admin"}');
select tests.create_user('ba000000-0000-4000-8000-0000000000ba', 'banned@example.test', '{"full_name": "Banned"}');
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-0000000000ad';
update public.profiles set status = 'banned' where id = 'ba000000-0000-4000-8000-0000000000ba';

-- ---- creation trigger ------------------------------------------------------------------------
select is((select full_name from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  'Alice Resident', 'full_name comes from metadata, trimmed and stripped of tags');
select is((select phone from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  '+14045550142', 'a valid E.164 phone is kept');
select is((select role::text from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  'resident', 'role in user metadata is ignored: new profiles are residents');
select is((select status::text from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  'active', 'new profiles are active');
select is((select full_name from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b'),
  'bob.builder', 'full_name falls back to the email local part (Q-C)');
select is((select phone from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b'),
  null, 'an invalid phone from metadata is dropped');
select ok((select notif_health_warnings and notif_community_announcements and notif_meeting_reminders
           from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b'),
  'notification preferences default to on');

update auth.users set email = 'alice.new@example.test' where id = 'a0000000-0000-4000-8000-00000000000a';
select is((select email from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  'alice.new@example.test', 'the email mirror follows auth.users');

-- ---- guest -----------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'guest: no access to profiles');
select tests.logout();
reset role;

-- ---- resident --------------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-00000000000a');
select results_eq($$select id from public.profiles$$,
  $$values ('a0000000-0000-4000-8000-00000000000a'::uuid)$$, 'resident sees only their own profile');
select lives_ok($$update public.profiles
  set full_name = 'Alice R.', phone = '+14045550199', neighborhood = 'vine_city', text_size = 'large',
      language = 'es', notif_meeting_reminders = false
  where id = 'a0000000-0000-4000-8000-00000000000a'$$, 'resident updates their editable columns');
select is((select full_name || '|' || neighborhood || '|' || text_size || '|' || notif_meeting_reminders
           from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  'Alice R.|vine_city|large|false', 'editable columns were saved');
select throws_ok($$update public.profiles set phone = '555' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'phone must be E.164');
select throws_ok($$update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot change their own role');
select throws_ok($$update public.profiles set status = 'active' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot change their own status');
select throws_ok($$update public.profiles set suspended_until = now() where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot change suspended_until');
select throws_ok($$update public.profiles set email = 'x@example.test' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot change the email mirror');
select throws_ok($$update public.profiles set last_seen_at = now() where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot set last_seen_at directly');
select throws_ok($$insert into public.profiles (id, full_name) values (gen_random_uuid(), 'Mallory')$$,
  '42501', null, 'resident cannot insert profiles');
select throws_ok($$delete from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'resident cannot delete profiles');
-- Another resident's row is invisible, so the update matches nothing.
update public.profiles set full_name = 'Hacked' where id = 'b0000000-0000-4000-8000-00000000000b';
select lives_ok($$select public.touch_last_seen()$$, 'touch_last_seen works for a resident');
select tests.logout();
reset role;
select is((select full_name from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b'),
  'bob.builder', 'resident cannot update another resident''s profile');
select isnt((select last_seen_at from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  null, 'touch_last_seen stamps last_seen_at');

-- ---- banned user -----------------------------------------------------------------------------
select tests.login('ba000000-0000-4000-8000-0000000000ba');
select is((select status::text from public.profiles where id = 'ba000000-0000-4000-8000-0000000000ba'),
  'banned', 'a banned user can still read their own profile (to see why)');
update public.profiles set full_name = 'Still here' where id = 'ba000000-0000-4000-8000-0000000000ba';
select ok(not public.is_active_user(), 'is_active_user() is false when banned');
select tests.logout();
reset role;
select is((select full_name from public.profiles where id = 'ba000000-0000-4000-8000-0000000000ba'),
  'Banned', 'a banned user cannot update their profile');

-- ---- admin -----------------------------------------------------------------------------------
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select ok((select count(*) from public.profiles where id in (
  'a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b', 'ba000000-0000-4000-8000-0000000000ba')) = 3,
  'admin reads every profile');
select lives_ok($$update public.profiles set full_name = 'Robert' where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'admin may update another profile''s editable columns');
select throws_ok($$update public.profiles set role = 'admin' where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  '42501', null, 'even admins change roles only through admin_set_role');
select tests.logout();
reset role;

select * from finish();
rollback;
