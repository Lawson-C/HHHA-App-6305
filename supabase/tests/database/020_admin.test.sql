-- Admin RPCs, last-admin invariant, append-only activity log, exports.
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
select tests.create_user('c0000000-0000-4000-8000-00000000000c', 'carol@example.test', '{"full_name": "Carol"}');
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-0000000000ad';
-- Shared databases may have real admins: make ours the only one for this transaction.
update public.profiles set role = 'resident'
where role = 'admin' and id <> 'ad000000-0000-4000-8000-0000000000ad';

-- ---- is_admin / is_active_user semantics -------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-00000000000a');
select ok(not public.is_admin(), 'resident: is_admin() is false');
select ok(public.is_active_user(), 'resident: is_active_user() is true');
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select ok(public.is_admin(), 'admin: is_admin() is true');
select tests.login_anon();
select throws_ok($$select public.is_admin()$$, '42501', null, 'guest cannot even call is_admin()');
select tests.logout();
reset role;

update public.profiles set status = 'suspended', suspended_until = null where id = 'c0000000-0000-4000-8000-00000000000c';
select tests.login('c0000000-0000-4000-8000-00000000000c');
select ok(not public.is_active_user(), 'suspended without an end date is blocked (indefinite)');
select tests.logout();
reset role;
update public.profiles set suspended_until = now() + interval '1 day' where id = 'c0000000-0000-4000-8000-00000000000c';
select tests.login('c0000000-0000-4000-8000-00000000000c');
select ok(not public.is_active_user(), 'suspended until the future is blocked');
select tests.logout();
reset role;
update public.profiles set suspended_until = now() - interval '1 minute' where id = 'c0000000-0000-4000-8000-00000000000c';
select tests.login('c0000000-0000-4000-8000-00000000000c');
select ok(public.is_active_user(), 'a suspension that has ended no longer blocks (Q-D)');
select tests.logout();
reset role;

-- ---- admin RPCs: who may call them ---------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select public.admin_set_role('a0000000-0000-4000-8000-00000000000a', 'admin')$$,
  '42501', null, 'guest cannot call admin_set_role');
select throws_ok($$select public.admin_summary()$$, '42501', null, 'guest cannot call admin_summary');
select tests.login('a0000000-0000-4000-8000-00000000000a');
select throws_ok($$select public.admin_set_role('a0000000-0000-4000-8000-00000000000a', 'admin')$$,
  '42501', null, 'resident cannot promote themselves');
select throws_ok($$select public.admin_set_status('b0000000-0000-4000-8000-00000000000b', 'banned')$$,
  '42501', null, 'resident cannot ban someone');
select throws_ok($$select public.admin_summary()$$, '42501', null, 'resident cannot read the admin summary');
select throws_ok($$select public.promote_admin_by_email('alice@example.test')$$,
  '42501', null, 'promote_admin_by_email is not callable by clients');

-- ---- last-admin invariant and self-protection ----------------------------------------------------
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select throws_ok($$select public.admin_set_role('ad000000-0000-4000-8000-0000000000ad', 'resident')$$,
  'P0001', 'At least one active admin must remain', 'the last active admin cannot demote themselves');
select throws_ok($$select public.admin_set_status('ad000000-0000-4000-8000-0000000000ad', 'banned')$$,
  'P0001', 'You can''t suspend or ban your own account', 'admins cannot ban themselves');
select throws_ok($$select public.admin_set_status('ad000000-0000-4000-8000-0000000000ad', 'suspended', now() + interval '1 day')$$,
  'P0001', 'You can''t suspend or ban your own account', 'admins cannot suspend themselves');
select throws_ok($$select public.admin_set_role('99999999-0000-4000-8000-000000000099', 'admin')$$,
  'P0002', null, 'unknown user → not found');

select is((select (public.admin_set_role('b0000000-0000-4000-8000-00000000000b', 'admin')).role::text),
  'admin', 'admin promotes Bob');
select tests.login('b0000000-0000-4000-8000-00000000000b');
select ok(public.is_admin(), 'Bob is now an admin');
select is((select (public.admin_set_status('ad000000-0000-4000-8000-0000000000ad', 'banned')).status::text),
  'banned', 'with another admin left, an admin can be banned');
select throws_ok($$select public.admin_set_role('b0000000-0000-4000-8000-00000000000b', 'resident')$$,
  'P0001', 'At least one active admin must remain', 'Bob is now the last active admin and cannot step down');
select tests.logout();
reset role;

select throws_ok($$update public.profiles set role = 'resident' where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'P0001', 'At least one active admin must remain', 'the invariant also holds for direct SQL (any path)');
select throws_ok($$update public.profiles set status = 'suspended' where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'P0001', 'At least one active admin must remain', 'suspending the last admin via SQL is rejected');
select throws_ok($$delete from auth.users where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'P0001', 'At least one active admin must remain', 'deleting the last admin''s account is rejected');

select tests.login('ad000000-0000-4000-8000-0000000000ad');
select throws_ok($$select public.admin_summary()$$, '42501', null, 'a banned admin loses admin access');
select tests.logout();
reset role;

-- ---- status changes + validation --------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-00000000000b');
select throws_ok($$select public.admin_set_status('a0000000-0000-4000-8000-00000000000a', 'banned', now() + interval '1 day')$$,
  '22023', null, 'suspended_until only applies to suspended');
select throws_ok($$select public.admin_set_status('a0000000-0000-4000-8000-00000000000a', 'suspended', now() - interval '1 hour')$$,
  '22023', null, 'suspended_until must be in the future');
select is((select (public.admin_set_status('a0000000-0000-4000-8000-00000000000a', 'suspended', now() + interval '7 days')).status::text),
  'suspended', 'admin suspends Alice for a week');
select isnt((select suspended_until from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
  null, 'suspended_until is stored');
select is((select (public.admin_set_status('a0000000-0000-4000-8000-00000000000a', 'active')).suspended_until),
  null, 'reactivating clears suspended_until');
select is((select (public.admin_set_role('a0000000-0000-4000-8000-00000000000a', 'admin')).role::text), 'admin', 'grant');
select is((select (public.admin_set_role('a0000000-0000-4000-8000-00000000000a', 'resident')).role::text), 'resident', 'revoke');

-- ---- activity log entries ----------------------------------------------------------------------
select is((select count(*)::int from public.admin_activity_log
           where action = 'role_granted' and target_id = 'b0000000-0000-4000-8000-00000000000b'
             and actor_id = 'ad000000-0000-4000-8000-0000000000ad'),
  1, 'role_granted logged with the acting admin');
select is((select count(*)::int from public.admin_activity_log
           where action = 'account_banned' and target_id = 'ad000000-0000-4000-8000-0000000000ad'
             and actor_id = 'b0000000-0000-4000-8000-00000000000b'),
  1, 'account_banned logged');
select is((select count(*)::int from public.admin_activity_log
           where action in ('account_suspended', 'account_reactivated', 'role_revoked')
             and target_id = 'a0000000-0000-4000-8000-00000000000a'),
  3, 'suspend / reactivate / revoke logged');
select is((select actor_full_name from public.admin_activity
           where action = 'role_granted' and target_id = 'b0000000-0000-4000-8000-00000000000b'),
  'Ada Admin', 'admin_activity view includes the actor''s name');

select ok((public.admin_summary() -> 'users' ->> 'admins')::int >= 1, 'admin_summary counts admins');
select ok(public.admin_summary() ?& array['reports', 'inquiries', 'users', 'notifications'], 'admin_summary shape');

-- ---- append-only log -------------------------------------------------------------------------
select throws_ok($$update public.admin_activity_log set details = '{}'$$, '42501', null, 'admins cannot update the log');
select throws_ok($$delete from public.admin_activity_log$$, '42501', null, 'admins cannot delete from the log');
select throws_ok($$insert into public.admin_activity_log (action, target_type) values ('data_exported', 'x')$$,
  '42501', null, 'admins cannot write log entries directly');
select throws_ok($$select public.log_admin_action('data_exported', 'x', null)$$, '42501', null,
  'log_admin_action is not callable by clients');

select tests.login('c0000000-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.admin_activity_log), 0, 'residents see no log entries');
select is((select count(*)::int from public.admin_activity), 0, 'residents see nothing in admin_activity');
select throws_ok($$insert into public.admin_activity_log (action, target_type) values ('data_exported', 'x')$$,
  '42501', null, 'residents cannot write log entries');
select tests.login_anon();
select throws_ok($$select count(*) from public.admin_activity_log$$, '42501', null, 'guests cannot read the log');
select throws_ok($$select count(*) from public.admin_activity$$, '42501', null, 'guests cannot read admin_activity');
select tests.logout();
reset role;

select throws_ok($$update public.admin_activity_log set details = '{}'$$, '42501', 'admin_activity_log is append-only',
  'not even the database owner can update the log');
select throws_ok($$delete from public.admin_activity_log$$, '42501', 'admin_activity_log is append-only',
  'not even the database owner can delete from the log');

-- ---- exports (Q-007: no reporter / contact details; formula injection neutralized; logged) ----
insert into public.blight_reports (id, reporter_id, category, latitude, longitude, address, description)
values (990001, 'c0000000-0000-4000-8000-00000000000c', 'illegal_dumping', 33.76, -84.42, '=HYPERLINK("http://evil")', '+1 tires');

select tests.login('c0000000-0000-4000-8000-00000000000c');
select throws_ok($$select * from public.export_blight_reports()$$, '42501', null, 'residents cannot export');
select throws_ok($$select * from public.export_housing_inquiries()$$, '42501', null, 'residents cannot export inquiries');
select tests.login('b0000000-0000-4000-8000-00000000000b');
select is((select address from public.export_blight_reports() where id = 990001), '''=HYPERLINK("http://evil")',
  'export prefixes formula-like cells with an apostrophe');
select is((select description from public.export_blight_reports() where id = 990001), '''+1 tires',
  'export neutralizes a leading +');
select tests.logout();
reset role;
select ok(not exists (
    select 1 from information_schema.parameters
    where specific_schema = 'public' and parameter_mode = 'OUT'
      and specific_name like 'export\_%'
      and parameter_name in ('reporter_id', 'user_id', 'email', 'phone', 'full_name', 'message', 'admin_notes', 'keep_name_private')),
  'exports have no reporter or contact columns');
select ok((select count(*) from public.admin_activity_log
           where action = 'data_exported' and actor_id = 'b0000000-0000-4000-8000-00000000000b') >= 2,
  'exports are logged as data_exported');

-- ---- initial admin script --------------------------------------------------------------------
select is(public.promote_admin_by_email('CAROL@example.test'), 'carol@example.test is now an admin.',
  'promote_admin_by_email works for the team (case-insensitive)');
select is(public.promote_admin_by_email('carol@example.test'), 'carol@example.test is already an admin.',
  'promote_admin_by_email is a no-op for an existing admin');
select throws_ok($$select public.promote_admin_by_email('nobody@example.test')$$, 'P0002', null,
  'promote_admin_by_email: unknown email');
select is((select actor_id from public.admin_activity_log
           where action = 'role_granted' and target_id = 'c0000000-0000-4000-8000-00000000000c'),
  null, 'script promotions are logged with no actor');

select * from finish();
rollback;
