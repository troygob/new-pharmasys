-- Lab 7: Medicine-Supplier relationship (run in Supabase > SQL Editor)
-- Many-to-many: a medicine can have many suppliers, a supplier can supply many medicines.
create table if not exists medicine_suppliers (
  medicine_supplier_id bigint generated always as identity primary key,
  medicine_id    bigint not null references medicines(medicine_id),
  supplier_id    bigint not null references suppliers(supplier_id),
  purchase_price numeric(10,2) not null check (purchase_price >= 0),
  created_at     timestamptz not null default now(),
  unique (medicine_id, supplier_id)   -- same pair can't be assigned twice
);

alter table medicine_suppliers enable row level security;

create policy "ms_select" on medicine_suppliers for select to authenticated using (true);
create policy "ms_insert" on medicine_suppliers for insert to authenticated with check (true);
create policy "ms_update" on medicine_suppliers for update to authenticated using (true) with check (true);
create policy "ms_delete" on medicine_suppliers for delete to authenticated using (true);
