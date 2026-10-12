-- Stage 3: Supplier Management  (run in Supabase > SQL Editor)
create table if not exists suppliers (
  supplier_id    bigint generated always as identity primary key,
  supplier_code  text not null unique,
  supplier_name  text not null,
  contact_person text,
  contact_no     text,
  email          text,
  address        text,
  status         text not null default 'Active' check (status in ('Active','Inactive')),
  created_at     timestamptz not null default now()
);

alter table suppliers enable row level security;

create policy "suppliers_select" on suppliers for select to authenticated using (true);
create policy "suppliers_insert" on suppliers for insert to authenticated with check (true);
create policy "suppliers_update" on suppliers for update to authenticated using (true) with check (true);
-- No DELETE policy on purpose: suppliers are deactivated, never deleted.
