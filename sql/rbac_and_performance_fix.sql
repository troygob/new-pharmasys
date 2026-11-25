-- =============================================================================
-- PharmaSys RBAC Alignment & Query Performance Migration (Idempotent)
-- Safe to run against an existing Supabase / PostgreSQL database created from
-- sql/pharmacy-schema.sql.
-- =============================================================================

begin;

-- 1) Normalize public.app_role() so whitespace or casing differences never lock
--    out active staff accounts.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select case lower(regexp_replace(trim(role), '[-_]+', ' ', 'g'))
    when 'admin'           then 'Admin'
    when 'administrator'   then 'Admin'
    when 'pharmacist'      then 'Pharmacist'
    when 'cashier'         then 'Cashier'
    when 'inventory staff' then 'Inventory Staff'
    when 'inventory'       then 'Inventory Staff'
    when 'manager'         then 'Manager'
    else trim(role)
  end
  from public.users
  where user_id = auth.uid()
    and lower(trim(status)) = 'active'
  limit 1
$$;

-- 2) Align RLS policies with the operational RBAC matrix so POS, Rx lookup,
--    and receiving workflows are never blocked at the DB layer.

-- Prescriptions & Items: Cashier needs SELECT for POS Rx dispensing & receipts.
drop policy if exists rbac_select on public.prescriptions;
create policy rbac_select on public.prescriptions
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Cashier','Manager']::text[]));

drop policy if exists rbac_select on public.prescription_items;
create policy rbac_select on public.prescription_items
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Cashier','Manager']::text[]));

-- Suppliers & Supply Pricing: Pharmacist needs SELECT for supplier/cost lookup.
drop policy if exists rbac_select on public.suppliers;
create policy rbac_select on public.suppliers
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff','Manager']::text[]));

drop policy if exists rbac_select on public.medicine_suppliers;
create policy rbac_select on public.medicine_suppliers
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff','Manager']::text[]));

-- Purchases & Purchase Items: Pharmacist can read and receive stock alongside Inventory Staff.
drop policy if exists rbac_select on public.purchases;
create policy rbac_select on public.purchases
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff','Manager']::text[]));

drop policy if exists rbac_insert on public.purchases;
create policy rbac_insert on public.purchases
  for insert to authenticated
  with check (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]));

drop policy if exists rbac_update on public.purchases;
create policy rbac_update on public.purchases
  for update to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]))
  with check (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]));

drop policy if exists rbac_select on public.purchase_items;
create policy rbac_select on public.purchase_items
  for select to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff','Manager']::text[]));

drop policy if exists rbac_insert on public.purchase_items;
create policy rbac_insert on public.purchase_items
  for insert to authenticated
  with check (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]));

drop policy if exists rbac_update on public.purchase_items;
create policy rbac_update on public.purchase_items
  for update to authenticated
  using (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]))
  with check (public.app_role() = any (array['Admin','Pharmacist','Inventory Staff']::text[]));

-- 3) Performance Indexes for Dashboard KPIs, FEFO Checkout, Reports & Auth
create index if not exists idx_sales_manila_day
  on public.sales (((sale_date at time zone 'Asia/Manila')::date))
  where status = 'Completed';

create index if not exists idx_inventory_med_qty_expiry
  on public.inventory (medicine_id, expiration_date)
  where quantity > 0;

create index if not exists idx_invtx_ref_created
  on public.inventory_transactions (reference_type, created_at desc);

create index if not exists idx_users_uid_status
  on public.users (user_id, status);

create index if not exists idx_medsup_medicine
  on public.medicine_suppliers (medicine_id);

commit;

notify pgrst, 'reload schema';
