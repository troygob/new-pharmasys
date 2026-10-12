-- ============================================================
-- Lab 27 / 28: roles and role-based security
-- Uses your EXISTING public.users table (the one purchases, sales,
-- prescriptions and inventory_transactions already point to).
-- Run ONCE in Supabase > SQL Editor.  Safe to re-run.
-- ============================================================

-- 0) Remove the earlier draft table if you ever created it (harmless if absent)
drop table if exists public.user_profiles cascade;

-- 1) Allow the five roles from the lab outline
--    (the table only allowed Admin / Pharmacist / Cashier)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.users'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.users
  add constraint users_role_check
  check (role in ('Admin', 'Pharmacist', 'Cashier', 'Inventory Staff', 'Manager'));

-- 2) Every new login automatically gets a users row (Cashier, but INACTIVE until an Admin activates it)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (user_id, full_name, email, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    'Inactive'
  )
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Create a users row for logins that already exist but have none
insert into public.users (user_id, full_name, email)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1)), email
from auth.users
on conflict do nothing;

-- 4) Make sure your admin account is an Admin   (EDIT THE EMAIL if yours differs)
update public.users set role = 'Admin', status = 'Active' where email = 'admin@gmail.com';

-- 5) Helper: the signed-in user's role (only while the account is Active)
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where user_id = auth.uid() and status = 'Active'
$$;

-- 6) Who can see / change the users table
alter table public.users enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'users' loop
    execute format('drop policy %I on public.users', p.policyname);
  end loop;
end $$;

create policy users_select on public.users for select to authenticated
  using (user_id = auth.uid() or public.app_role() = 'Admin');
create policy users_update on public.users for update to authenticated
  using (public.app_role() = 'Admin')
  with check (public.app_role() = 'Admin');
-- (no insert/delete policy: the trigger creates rows; deleting a login removes its row)

-- 7) SAFETY: stop if nobody would be able to administer the system
do $$
begin
  if not exists (select 1 from public.users where role = 'Admin' and status = 'Active') then
    raise exception 'No active Admin found. Fix the email in step 4, then run this script again.';
  end if;
end $$;

-- 8) Role-based access on every data table ---------------------------------
-- NOTE: this REPLACES any existing policies on the tables below.
create or replace function public.apply_rbac(
  tbl text, read_roles text[], insert_roles text[], update_roles text[], delete_roles text[]
) returns void language plpgsql as $$
declare pol record;
begin
  if to_regclass('public.' || tbl) is null then
    raise notice 'Skipping % (table does not exist)', tbl;
    return;
  end if;

  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl loop
    execute format('drop policy %I on public.%I', pol.policyname, tbl);
  end loop;
  execute format('alter table public.%I enable row level security', tbl);

  if coalesce(array_length(read_roles, 1), 0) > 0 then
    execute format('create policy rbac_select on public.%I for select to authenticated using (public.app_role() = any (%L::text[]))', tbl, read_roles);
  end if;
  if coalesce(array_length(insert_roles, 1), 0) > 0 then
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check (public.app_role() = any (%L::text[]))', tbl, insert_roles);
  end if;
  if coalesce(array_length(update_roles, 1), 0) > 0 then
    execute format('create policy rbac_update on public.%I for update to authenticated using (public.app_role() = any (%L::text[])) with check (public.app_role() = any (%L::text[]))', tbl, update_roles, update_roles);
  end if;
  if coalesce(array_length(delete_roles, 1), 0) > 0 then
    execute format('create policy rbac_delete on public.%I for delete to authenticated using (public.app_role() = any (%L::text[]))', tbl, delete_roles);
  end if;
end $$;

--          table                 who can READ                                              who can INSERT                                  who can UPDATE                                   who can DELETE
select public.apply_rbac('categories',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

select public.apply_rbac('medicines',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

select public.apply_rbac('suppliers',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);

select public.apply_rbac('medicine_suppliers',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin','Inventory Staff']);

-- inventory: a Cashier may only UPDATE (a sale deducts stock), never add batches
select public.apply_rbac('inventory',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist','Inventory Staff'],
  array['Admin','Pharmacist','Inventory Staff','Cashier'],
  array['Admin']);

-- audit trail: anyone who touches stock can ADD a row; nobody can edit or delete one
select public.apply_rbac('inventory_transactions',
  array['Admin','Pharmacist','Inventory Staff','Manager'],
  array['Admin','Pharmacist','Cashier','Inventory Staff'],
  array[]::text[], array[]::text[]);

select public.apply_rbac('sales',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin','Pharmacist','Cashier'], array['Admin','Pharmacist','Cashier'], array['Admin']);
select public.apply_rbac('sale_items',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin','Pharmacist','Cashier'], array['Admin','Pharmacist','Cashier'], array['Admin']);
select public.apply_rbac('payments',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin','Pharmacist','Cashier'], array['Admin','Pharmacist','Cashier'], array['Admin']);

select public.apply_rbac('prescriptions',
  array['Admin','Pharmacist','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);
select public.apply_rbac('prescription_items',
  array['Admin','Pharmacist','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

select public.apply_rbac('purchases',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);
select public.apply_rbac('purchase_items',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);

drop function public.apply_rbac(text, text[], text[], text[], text[]);

-- Check the result
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, cmd;
