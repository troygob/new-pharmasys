-- =====================================================================
-- PHARMACY MANAGEMENT SYSTEM - COMPLETE FRESH SCHEMA (Supabase / PostgreSQL)
--
-- Run the WHOLE file once in Supabase > SQL Editor.
--
-- !! DESTRUCTIVE: drops every pharmacy table, view and function in the
-- !! public schema and rebuilds them. Medicines, stock, suppliers,
-- !! prescriptions and sales are ERASED.
-- !! KEPT: your Supabase logins (auth.users) and each person's role/status.
--
-- Covers: everything the app uses today (Labs 1-14, 27-28) AND the tables,
-- rules, views and functions needed for Labs 15-26 (cart, dispensing,
-- payment, receipt, expiry blocking, reports, dashboard).
--
-- Written for the Philippines: "today" means Asia/Manila, not UTC.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) KEEP EACH USER'S ROLE/STATUS ACROSS THE WIPE
-- ---------------------------------------------------------------------
create table if not exists public._old_users_backup (
  user_id uuid, full_name text, role text, status text
);
do $$
begin
  if to_regclass('public.users') is not null then
    truncate public._old_users_backup;
    insert into public._old_users_backup (user_id, full_name, role, status)
    select user_id, full_name, role, status from public.users;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) WIPE
-- ---------------------------------------------------------------------
drop view if exists public.v_prescription_report, public.v_stock_in, public.v_payment_summary,
  public.v_sales_by_cashier, public.v_sales_by_medicine, public.v_daily_sales, public.v_dashboard,
  public.v_low_stock, public.v_inventory_batches, public.v_medicine_stock cascade;

drop function if exists public.handle_new_user() cascade;      -- also removes the auth.users trigger
drop function if exists public.checkout_sale(jsonb, text, bigint, numeric, text, numeric, text) cascade;

drop table if exists
  public.payments, public.sale_items, public.sales,
  public.prescription_items, public.prescriptions,
  public.inventory_transactions, public.purchase_items, public.purchases,
  public.inventory, public.medicine_suppliers, public.medicines,
  public.suppliers, public.categories, public.settings, public.users cascade;

drop sequence if exists public.sale_no_seq;
drop function if exists public.app_role() cascade;
drop function if exists public.expiring_soon_days() cascade;
drop function if exists public.pharmacy_today() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.trg_block_expired_sale() cascade;
drop function if exists public.trg_update_prescription_status() cascade;


-- ---------------------------------------------------------------------
-- 2) HELPERS
-- ---------------------------------------------------------------------
-- "Today" in Philippine time (Supabase servers run in UTC)
create function public.pharmacy_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create sequence public.sale_no_seq start 1;   -- SALE-00001, SALE-00002, ...
grant usage, select on sequence public.sale_no_seq to authenticated;


-- ---------------------------------------------------------------------
-- 3) TABLES
-- ---------------------------------------------------------------------

-- Staff accounts (one row per Supabase login)
create table public.users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  varchar not null,
  email      varchar not null unique,
  role       varchar not null default 'Cashier'
             check (role in ('Admin','Pharmacist','Cashier','Inventory Staff','Manager')),
  status     varchar not null default 'Inactive' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pharmacy-wide settings (name/address for receipts, expiry warning window, ...)
create table public.settings (
  key         text primary key,
  value       text not null,
  description text
);

create table public.categories (
  category_id   bigint generated always as identity primary key,
  category_name varchar not null unique,
  description   text,
  status        varchar not null default 'Active' check (status in ('Active','Inactive')),
  created_at    timestamptz not null default now()
);

create table public.suppliers (
  supplier_id    bigint generated always as identity primary key,
  supplier_code  varchar not null unique,
  supplier_name  varchar not null,
  contact_person varchar,
  contact_no     varchar,
  email          varchar,
  address        text,
  status         varchar not null default 'Active' check (status in ('Active','Inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.medicines (
  medicine_id           bigint generated always as identity primary key,
  medicine_code         varchar not null unique,
  medicine_name         varchar not null,
  generic_name          varchar,
  category_id           bigint references public.categories(category_id),
  dosage_form           varchar not null check (dosage_form in
                        ('Tablet','Capsule','Syrup','Suspension','Injection','Cream',
                         'Ointment','Drops','Inhaler','Powder','Other')),
  strength              varchar,
  unit_price            numeric(10,2) not null default 0 check (unit_price >= 0),
  reorder_level         integer not null default 10 check (reorder_level >= 0),
  requires_prescription boolean not null default false,
  status                varchar not null default 'Active' check (status in ('Active','Inactive')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Which supplier sells which medicine, and at what price (many-to-many)
create table public.medicine_suppliers (
  medicine_supplier_id bigint generated always as identity primary key,
  medicine_id    bigint not null references public.medicines(medicine_id),
  supplier_id    bigint not null references public.suppliers(supplier_id),
  purchase_price numeric(10,2) not null check (purchase_price >= 0),
  created_at     timestamptz not null default now(),
  unique (medicine_id, supplier_id)
);

-- Stock on the shelf, one row per medicine + batch
create table public.inventory (
  inventory_id    bigint generated always as identity primary key,
  medicine_id     bigint not null references public.medicines(medicine_id),
  batch_number    varchar not null,
  quantity        integer not null default 0 check (quantity >= 0),
  purchase_price  numeric(10,2) not null check (purchase_price >= 0),
  selling_price   numeric(10,2) not null check (selling_price >= 0),
  expiration_date date not null,
  date_received   date not null default public.pharmacy_today(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (medicine_id, batch_number)
);

-- Stock-in documents
create table public.purchases (
  purchase_id   bigint generated always as identity primary key,
  purchase_no   varchar not null unique,
  supplier_id   bigint not null references public.suppliers(supplier_id),
  user_id       uuid references public.users(user_id),
  purchase_date date not null default public.pharmacy_today(),
  total_amount  numeric(12,2) not null default 0 check (total_amount >= 0),
  status        varchar not null default 'Received' check (status in ('Pending','Received','Cancelled')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.purchase_items (
  purchase_item_id bigint generated always as identity primary key,
  purchase_id      bigint not null references public.purchases(purchase_id),
  medicine_id      bigint not null references public.medicines(medicine_id),
  batch_number     varchar not null,
  quantity         integer not null check (quantity > 0),
  unit_cost        numeric(10,2) not null check (unit_cost >= 0),
  expiration_date  date not null,
  line_total       numeric(12,2) generated always as (quantity * unit_cost) stored
);

-- Audit trail of every stock movement (insert-only: never edited or deleted)
create table public.inventory_transactions (
  transaction_id   bigint generated always as identity primary key,
  inventory_id     bigint not null references public.inventory(inventory_id),
  medicine_id      bigint not null references public.medicines(medicine_id),
  transaction_type varchar not null check (transaction_type in
                   ('PURCHASE','SALE','ADJUSTMENT','RETURN','EXPIRED','STOCK_OUT','DAMAGED')),
  quantity_change  integer not null check (quantity_change <> 0),
  reference_type   varchar,                 -- 'purchase' | 'sale' | 'manual'
  reference_id     bigint,
  user_id          uuid references public.users(user_id),
  notes            text,
  created_at       timestamptz not null default now()
);

create table public.prescriptions (
  prescription_id    bigint generated always as identity primary key,
  prescription_no    varchar not null unique,
  patient_name       varchar not null,
  patient_contact    text,
  doctor_name        varchar not null,
  prescriber_license text,
  prescription_date  date not null default public.pharmacy_today(),
  user_id            uuid references public.users(user_id),
  status             varchar not null default 'Pending'
                     check (status in ('Pending','Partially Dispensed','Fully Dispensed','Cancelled')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.prescription_items (
  prescription_item_id bigint generated always as identity primary key,
  prescription_id      bigint not null references public.prescriptions(prescription_id),
  medicine_id          bigint not null references public.medicines(medicine_id),
  quantity             integer not null check (quantity > 0),
  quantity_dispensed   integer not null default 0,
  dosage_instructions  text,
  unique (prescription_id, medicine_id),
  check (quantity_dispensed >= 0 and quantity_dispensed <= quantity)
);

create table public.sales (
  sale_id         bigint generated always as identity primary key,
  sale_no         varchar not null unique
                  default ('SALE-' || lpad(nextval('public.sale_no_seq')::text, 5, '0')),
  prescription_id bigint references public.prescriptions(prescription_id),
  user_id         uuid references public.users(user_id),
  cashier_name    varchar,                                  -- snapshot, for receipts/reports
  customer_name   varchar,
  sale_date       timestamptz not null default now(),
  subtotal        numeric(12,2) not null default 0 check (subtotal >= 0),
  discount        numeric(12,2) not null default 0 check (discount >= 0),
  total_amount    numeric(12,2) not null default 0 check (total_amount >= 0),
  status          varchar not null default 'Completed' check (status in ('Completed','Voided','Refunded')),
  created_at      timestamptz not null default now()
);

create table public.sale_items (
  sale_item_id bigint generated always as identity primary key,
  sale_id      bigint not null references public.sales(sale_id),
  medicine_id  bigint not null references public.medicines(medicine_id),
  inventory_id bigint not null references public.inventory(inventory_id),   -- the batch it came from
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  line_total   numeric(12,2) generated always as (quantity * unit_price) stored
);

create table public.payments (
  payment_id      bigint generated always as identity primary key,
  sale_id         bigint not null references public.sales(sale_id),
  payment_method  varchar not null check (payment_method in
                  ('Cash','Card','E-Wallet','GCash','Maya','Bank Transfer','Other')),
  amount          numeric(12,2) not null check (amount > 0),       -- amount applied to the sale
  amount_tendered numeric(12,2),                                    -- cash handed over
  change_amount   numeric(12,2) not null default 0 check (change_amount >= 0),
  reference_no    varchar,                                          -- card / e-wallet reference
  payment_date    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (amount_tendered is null or amount_tendered >= amount)
);


-- ---------------------------------------------------------------------
-- 4) INDEXES
-- ---------------------------------------------------------------------
create index idx_medicines_category      on public.medicines (category_id);
create index idx_medicines_name          on public.medicines (lower(medicine_name));
create index idx_medsup_supplier         on public.medicine_suppliers (supplier_id);
create index idx_inventory_medicine      on public.inventory (medicine_id);
create index idx_inventory_expiry        on public.inventory (expiration_date);
create index idx_purchases_supplier      on public.purchases (supplier_id);
create index idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index idx_invtx_medicine_date     on public.inventory_transactions (medicine_id, created_at desc);
create index idx_invtx_inventory         on public.inventory_transactions (inventory_id);
create index idx_rx_patient              on public.prescriptions (lower(patient_name));
create index idx_rx_status               on public.prescriptions (status);
create index idx_rx_items_rx             on public.prescription_items (prescription_id);
create index idx_sales_date              on public.sales (sale_date desc);
create index idx_sales_user              on public.sales (user_id);
create index idx_sale_items_sale         on public.sale_items (sale_id);
create index idx_sale_items_medicine     on public.sale_items (medicine_id);
create index idx_sale_items_inventory    on public.sale_items (inventory_id);
create index idx_payments_sale           on public.payments (sale_id);


-- ---------------------------------------------------------------------
-- 5) SETTINGS + HELPERS THAT READ THEM
-- ---------------------------------------------------------------------
insert into public.settings (key, value, description) values
  ('pharmacy_name',      'ABC PHARMACY',  'Printed at the top of receipts'),
  ('pharmacy_address',   '',              'Printed on receipts'),
  ('receipt_footer',     'THANK YOU!',    'Printed at the bottom of receipts'),
  ('expiring_soon_days', '30',            'A batch is "Expiring Soon" when it expires within this many days');

create function public.expiring_soon_days() returns integer
language sql stable as $$
  select coalesce((select value::int from public.settings where key = 'expiring_soon_days'), 30)
$$;


-- ---------------------------------------------------------------------
-- 6) TRIGGERS
-- ---------------------------------------------------------------------
create trigger trg_users_updated     before update on public.users         for each row execute function public.set_updated_at();
create trigger trg_suppliers_updated before update on public.suppliers     for each row execute function public.set_updated_at();
create trigger trg_medicines_updated before update on public.medicines     for each row execute function public.set_updated_at();
create trigger trg_inventory_updated before update on public.inventory     for each row execute function public.set_updated_at();
create trigger trg_purchases_updated before update on public.purchases     for each row execute function public.set_updated_at();
create trigger trg_rx_updated        before update on public.prescriptions for each row execute function public.set_updated_at();

-- Lab 21: an expired batch can never be sold, whoever tries to insert the sale line
create function public.trg_block_expired_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_expiry date; v_med bigint; v_name text; v_batch text;
begin
  select i.expiration_date, i.medicine_id, m.medicine_name, i.batch_number
    into v_expiry, v_med, v_name, v_batch
  from inventory i join medicines m on m.medicine_id = i.medicine_id
  where i.inventory_id = new.inventory_id;

  if v_med is distinct from new.medicine_id then
    raise exception 'Inventory batch does not belong to the selected medicine.';
  end if;
  if v_expiry < public.pharmacy_today() then
    raise exception 'SALE BLOCKED: % (batch %) expired on % and cannot be sold.', v_name, v_batch, v_expiry;
  end if;
  return new;
end $$;

create trigger trg_sale_items_block_expired
  before insert on public.sale_items
  for each row execute function public.trg_block_expired_sale();

-- Lab 14/16: prescription status follows what has been dispensed
create function public.trg_update_prescription_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total int; v_done int;
begin
  select sum(quantity), sum(quantity_dispensed) into v_total, v_done
  from prescription_items where prescription_id = new.prescription_id;

  update prescriptions
     set status = case when v_done >= v_total then 'Fully Dispensed'
                       when v_done > 0         then 'Partially Dispensed'
                       else 'Pending' end
   where prescription_id = new.prescription_id and status <> 'Cancelled';
  return null;
end $$;

create trigger trg_rx_items_status
  after insert or update of quantity, quantity_dispensed on public.prescription_items
  for each row execute function public.trg_update_prescription_status();


-- ---------------------------------------------------------------------
-- 7) VIEWS  (security_invoker = the caller's own permissions apply)
-- ---------------------------------------------------------------------

-- Used by the Inventory page. Expired batches are NOT counted as stock on hand.
create view public.v_medicine_stock with (security_invoker = true) as
select s.*, (s.quantity_on_hand <= s.reorder_level) as is_low_stock
from (
  select m.*,
         c.category_name,
         coalesce(sum(i.quantity) filter (where i.expiration_date >= public.pharmacy_today()), 0)::int
           as quantity_on_hand,
         min(i.expiration_date) filter (where i.quantity > 0
                                          and i.expiration_date >= public.pharmacy_today())
           as nearest_expiry
  from public.medicines m
  left join public.categories c on c.category_id = m.category_id
  left join public.inventory  i on i.medicine_id = m.medicine_id
  group by m.medicine_id, c.category_name
) s;

-- Labs 9, 20, 22: every batch with its expiry status and value
create view public.v_inventory_batches with (security_invoker = true) as
select i.inventory_id, i.medicine_id, m.medicine_code, m.medicine_name, m.generic_name, m.strength,
       m.dosage_form, c.category_name, i.batch_number, i.quantity,
       i.purchase_price, i.selling_price,
       (i.quantity * i.purchase_price) as stock_value,
       i.expiration_date, i.date_received,
       (i.expiration_date - public.pharmacy_today()) as days_to_expiry,
       case when i.expiration_date <  public.pharmacy_today() then 'Expired'
            when i.expiration_date <= public.pharmacy_today() + public.expiring_soon_days() then 'Expiring Soon'
            else 'Valid' end as expiry_status
from public.inventory i
join public.medicines m on m.medicine_id = i.medicine_id
left join public.categories c on c.category_id = m.category_id;

-- Lab 11: reorder list. Suggested quantity = restock up to 2 x reorder level (change the 2 if you like)
create view public.v_low_stock with (security_invoker = true) as
select medicine_id, medicine_code, medicine_name, strength, dosage_form, category_name,
       quantity_on_hand, reorder_level,
       greatest(reorder_level * 2 - quantity_on_hand, 1) as suggested_reorder_qty
from public.v_medicine_stock
where status = 'Active' and is_low_stock;

-- Lab 26: dashboard numbers in one row
create view public.v_dashboard with (security_invoker = true) as
select
  (select coalesce(sum(total_amount), 0) from public.sales
    where status = 'Completed' and (sale_date at time zone 'Asia/Manila')::date = public.pharmacy_today()) as todays_sales,
  (select count(*) from public.sales
    where status = 'Completed' and (sale_date at time zone 'Asia/Manila')::date = public.pharmacy_today()) as todays_transactions,
  (select count(*) from public.medicines where status = 'Active') as total_medicines,
  (select count(*) from public.v_medicine_stock where status = 'Active' and is_low_stock) as low_stock,
  (select count(*) from public.inventory
    where quantity > 0 and expiration_date >= public.pharmacy_today()
      and expiration_date <= public.pharmacy_today() + public.expiring_soon_days()) as expiring_soon_batches,
  (select count(*) from public.inventory
    where quantity > 0 and expiration_date < public.pharmacy_today()) as expired_batches,
  (select count(*) from public.prescriptions
    where status in ('Pending','Partially Dispensed')) as pending_prescriptions;

-- Lab 23: sales reports (one row per day; sum the rows for weekly / monthly totals)
create view public.v_daily_sales with (security_invoker = true) as
select (sale_date at time zone 'Asia/Manila')::date as sale_day,
       count(*) as transactions, sum(total_amount) as total_sales
from public.sales where status = 'Completed'
group by 1;

create view public.v_sales_by_medicine with (security_invoker = true) as
select (s.sale_date at time zone 'Asia/Manila')::date as sale_day,
       m.medicine_id, m.medicine_code, m.medicine_name, m.strength, c.category_name,
       sum(si.quantity) as units_sold, sum(si.line_total) as revenue
from public.sale_items si
join public.sales s     on s.sale_id = si.sale_id and s.status = 'Completed'
join public.medicines m on m.medicine_id = si.medicine_id
left join public.categories c on c.category_id = m.category_id
group by 1, m.medicine_id, m.medicine_code, m.medicine_name, m.strength, c.category_name;

create view public.v_sales_by_cashier with (security_invoker = true) as
select (sale_date at time zone 'Asia/Manila')::date as sale_day,
       user_id, cashier_name, count(*) as transactions, sum(total_amount) as total_sales
from public.sales where status = 'Completed'
group by 1, user_id, cashier_name;

create view public.v_payment_summary with (security_invoker = true) as
select (s.sale_date at time zone 'Asia/Manila')::date as sale_day,
       p.payment_method, count(*) as transactions, sum(p.amount) as total_amount
from public.payments p
join public.sales s on s.sale_id = p.sale_id and s.status = 'Completed'
group by 1, p.payment_method;

-- Lab 24: stock-in / supplier purchases
create view public.v_stock_in with (security_invoker = true) as
select p.purchase_id, p.purchase_no, p.purchase_date, p.status,
       sup.supplier_id, sup.supplier_code, sup.supplier_name,
       m.medicine_code, m.medicine_name, m.strength,
       pi.batch_number, pi.quantity, pi.unit_cost, pi.line_total, pi.expiration_date
from public.purchases p
join public.purchase_items pi on pi.purchase_id = p.purchase_id
join public.suppliers sup     on sup.supplier_id = p.supplier_id
join public.medicines m       on m.medicine_id = pi.medicine_id;

-- Lab 25: prescription report
create view public.v_prescription_report with (security_invoker = true) as
select rx.prescription_id, rx.prescription_no, rx.prescription_date, rx.patient_name, rx.doctor_name,
       m.medicine_code, m.medicine_name, m.strength,
       pi.quantity, pi.quantity_dispensed, (pi.quantity - pi.quantity_dispensed) as quantity_remaining,
       rx.status
from public.prescriptions rx
join public.prescription_items pi on pi.prescription_id = rx.prescription_id
join public.medicines m           on m.medicine_id = pi.medicine_id;


-- ---------------------------------------------------------------------
-- 8) LOGIN -> USERS ROW, AND ROLE HELPER
-- ---------------------------------------------------------------------
-- Every new login gets a users row. It starts INACTIVE until an Admin activates it.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (user_id, full_name, email, status)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          new.email, 'Inactive')
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The signed-in user's role (only while the account is Active)
create function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where user_id = auth.uid() and status = 'Active'
$$;


-- ---------------------------------------------------------------------
-- 9) CHECKOUT  (Labs 15-19, 21) - one atomic call: sale + stock + payment + prescription
--
-- JavaScript:
--   const { data: saleId, error } = await supabaseClient.rpc("checkout_sale", {
--     p_items: [{ medicine_id: 1, quantity: 2 }, { medicine_id: 5, quantity: 1 }],
--     p_customer_name: "Walk-in Customer",   // optional
--     p_prescription_id: null,               // or a prescription_id to dispense an Rx
--     p_discount: 0,
--     p_payment_method: "Cash",
--     p_amount_tendered: 500,                // cash handed over (ignored for non-cash)
--     p_reference_no: null                   // card / e-wallet reference
--   });
--   // error.message is user-readable, e.g. "Insufficient stock for Paracetamol 500 mg: available 5, requested 20."
--
-- It deducts stock first-expiring-first-out, skips expired batches, writes the audit
-- rows, records the payment and change, and updates the prescription - or does none of it.
-- ---------------------------------------------------------------------
create function public.checkout_sale(
  p_items           jsonb,
  p_customer_name   text    default null,
  p_prescription_id bigint  default null,
  p_discount        numeric default 0,
  p_payment_method  text    default 'Cash',
  p_amount_tendered numeric default null,
  p_reference_no    text    default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_role      text := public.app_role();
  v_uid       uuid := auth.uid();
  v_cashier   text;
  v_sale_id   bigint;
  v_line      record;
  v_batch     record;
  v_med       record;
  v_rx        record;
  v_rxi       record;
  v_remaining int;
  v_take      int;
  v_available int;
  v_subtotal  numeric := 0;
  v_discount  numeric := coalesce(p_discount, 0);
  v_total     numeric;
  v_tendered  numeric;
begin
  if v_role is null or v_role not in ('Admin','Pharmacist','Cashier') then
    raise exception 'You are not allowed to process sales.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty.';
  end if;
  if v_discount < 0 then raise exception 'Discount cannot be negative.'; end if;

  select full_name into v_cashier from users where user_id = v_uid;

  if p_prescription_id is not null then
    select * into v_rx from prescriptions where prescription_id = p_prescription_id for update;
    if not found then raise exception 'Prescription not found.'; end if;
    if v_rx.status in ('Cancelled','Fully Dispensed') then
      raise exception 'Prescription % is already %.', v_rx.prescription_no, lower(v_rx.status);
    end if;
  end if;

  insert into sales (prescription_id, user_id, cashier_name, customer_name)
  values (p_prescription_id, v_uid, v_cashier,
          coalesce(nullif(trim(p_customer_name), ''),
                   (select patient_name from prescriptions where prescription_id = p_prescription_id),
                   'Walk-in Customer'))
  returning sale_id into v_sale_id;

  -- one pass per medicine (duplicate cart lines are merged)
  for v_line in
    select (e ->> 'medicine_id')::bigint as medicine_id, sum((e ->> 'quantity')::int) as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantity must be greater than zero.';
    end if;

    select * into v_med from medicines where medicine_id = v_line.medicine_id;
    if not found then raise exception 'Medicine % does not exist.', v_line.medicine_id; end if;
    if v_med.status <> 'Active' then
      raise exception '% is inactive and cannot be sold.', v_med.medicine_name;
    end if;
    if v_med.requires_prescription and p_prescription_id is null then
      raise exception '% requires a prescription.', v_med.medicine_name;
    end if;

    if p_prescription_id is not null then
      select * into v_rxi from prescription_items
       where prescription_id = p_prescription_id and medicine_id = v_line.medicine_id for update;
      if not found then
        raise exception '% is not on prescription %.', v_med.medicine_name, v_rx.prescription_no;
      end if;
      if v_line.quantity > v_rxi.quantity - v_rxi.quantity_dispensed then
        raise exception 'Cannot dispense % x %: only % remaining on prescription %.',
          v_line.quantity, v_med.medicine_name, v_rxi.quantity - v_rxi.quantity_dispensed, v_rx.prescription_no;
      end if;
    end if;

    -- take stock from the batches that expire first; expired batches are skipped
    v_remaining := v_line.quantity;
    for v_batch in
      select inventory_id, quantity, selling_price from inventory
       where medicine_id = v_line.medicine_id and quantity > 0
         and expiration_date >= public.pharmacy_today()
       order by expiration_date, inventory_id
       for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_batch.quantity);

      insert into sale_items (sale_id, medicine_id, inventory_id, quantity, unit_price)
      values (v_sale_id, v_line.medicine_id, v_batch.inventory_id, v_take, v_batch.selling_price);

      update inventory set quantity = quantity - v_take where inventory_id = v_batch.inventory_id;

      insert into inventory_transactions
        (inventory_id, medicine_id, transaction_type, quantity_change, reference_type, reference_id, user_id, notes)
      values
        (v_batch.inventory_id, v_line.medicine_id, 'SALE', -v_take, 'sale', v_sale_id, v_uid,
         'Sold ' || v_take || ' x ' || v_med.medicine_name);

      v_subtotal  := v_subtotal + v_take * v_batch.selling_price;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      select coalesce(sum(quantity), 0) into v_available from inventory
       where medicine_id = v_line.medicine_id and expiration_date >= public.pharmacy_today();
      raise exception 'Insufficient stock for % %: available %, requested %.',
        v_med.medicine_name, coalesce(v_med.strength, ''), v_available, v_line.quantity;
    end if;

    if p_prescription_id is not null then
      update prescription_items
         set quantity_dispensed = quantity_dispensed + v_line.quantity
       where prescription_item_id = v_rxi.prescription_item_id;
    end if;
  end loop;

  if v_discount > v_subtotal then raise exception 'Discount cannot be more than the subtotal.'; end if;
  v_total := v_subtotal - v_discount;
  if v_total <= 0 then raise exception 'The sale total must be greater than zero.'; end if;

  -- payment
  if p_payment_method = 'Cash' then
    v_tendered := coalesce(p_amount_tendered, v_total);
    if v_tendered < v_total then
      raise exception 'Insufficient payment: total is %, received %.', v_total, v_tendered;
    end if;
  else
    v_tendered := v_total;          -- card / e-wallet: exact amount, no change
  end if;

  update sales set subtotal = v_subtotal, discount = v_discount, total_amount = v_total
   where sale_id = v_sale_id;

  insert into payments (sale_id, payment_method, amount, amount_tendered, change_amount, reference_no)
  values (v_sale_id, p_payment_method, v_total, v_tendered, v_tendered - v_total,
          nullif(trim(p_reference_no), ''));

  return v_sale_id;
end $$;

revoke all on function public.checkout_sale(jsonb, text, bigint, numeric, text, numeric, text) from public, anon;
grant execute on function public.checkout_sale(jsonb, text, bigint, numeric, text, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 10) SECURITY: ROW LEVEL SECURITY BY ROLE (Lab 28)
-- ---------------------------------------------------------------------
alter table public.users enable row level security;
create policy users_select on public.users for select to authenticated
  using (user_id = auth.uid() or public.app_role() = 'Admin');
create policy users_update on public.users for update to authenticated
  using (public.app_role() = 'Admin') with check (public.app_role() = 'Admin');
-- no insert/delete policy: the login trigger creates rows, deleting a login removes its row

create function public._apply_rbac(
  tbl text, read_roles text[], insert_roles text[], update_roles text[], delete_roles text[]
) returns void language plpgsql as $$
begin
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

--                                READ                                                  INSERT                                UPDATE                                DELETE
select public._apply_rbac('settings',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin'], array['Admin'], array['Admin']);

select public._apply_rbac('categories',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

select public._apply_rbac('medicines',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

select public._apply_rbac('suppliers',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);

select public._apply_rbac('medicine_suppliers',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin','Inventory Staff']);

-- Cashiers do NOT write to inventory directly: checkout_sale() does it for them
select public._apply_rbac('inventory',
  array['Admin','Pharmacist','Cashier','Inventory Staff','Manager'],
  array['Admin','Pharmacist','Inventory Staff'], array['Admin','Pharmacist','Inventory Staff'], array['Admin']);

-- audit trail: add-only
select public._apply_rbac('inventory_transactions',
  array['Admin','Pharmacist','Inventory Staff','Manager'],
  array['Admin','Pharmacist','Inventory Staff'], array[]::text[], array[]::text[]);

select public._apply_rbac('purchases',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);
select public._apply_rbac('purchase_items',
  array['Admin','Inventory Staff','Manager'],
  array['Admin','Inventory Staff'], array['Admin','Inventory Staff'], array['Admin']);

select public._apply_rbac('prescriptions',
  array['Admin','Pharmacist','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);
select public._apply_rbac('prescription_items',
  array['Admin','Pharmacist','Manager'],
  array['Admin','Pharmacist'], array['Admin','Pharmacist'], array['Admin']);

-- Sales records are created by checkout_sale() only (so every sale is validated and deducts stock).
-- Direct edits: Admin only. Nobody can delete financial records.
select public._apply_rbac('sales',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin'], array['Admin'], array[]::text[]);
select public._apply_rbac('sale_items',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin'], array['Admin'], array[]::text[]);
select public._apply_rbac('payments',
  array['Admin','Pharmacist','Cashier','Manager'],
  array['Admin'], array['Admin'], array[]::text[]);

drop function public._apply_rbac(text, text[], text[], text[], text[]);


-- ---------------------------------------------------------------------
-- 11) STARTER DATA
-- ---------------------------------------------------------------------
insert into public.categories (category_name) values
  ('Antibiotics'), ('Analgesics'), ('Antihistamines'), ('Antacids'),
  ('Vitamins'), ('Cough and Cold'), ('Maintenance Medicines'), ('First Aid');


-- ---------------------------------------------------------------------
-- 12) RESTORE USERS (keeps roles/status from before the wipe)
-- ---------------------------------------------------------------------
insert into public.users (user_id, full_name, email, role, status)
select au.id,
       coalesce(nullif(b.full_name, ''), nullif(au.raw_user_meta_data ->> 'full_name', ''), split_part(au.email, '@', 1)),
       au.email,
       coalesce(b.role, 'Cashier'),
       coalesce(b.status, 'Inactive')
from auth.users au
left join public._old_users_backup b on b.user_id = au.id
on conflict do nothing;

drop table public._old_users_backup;

-- >>> EDIT THE EMAIL if your admin account is different <<<
update public.users set role = 'Admin', status = 'Active' where email = 'admin@gmail.com';

do $$
begin
  if not exists (select 1 from public.users where role = 'Admin' and status = 'Active') then
    raise warning 'NO ACTIVE ADMIN. Fix the email in the UPDATE above and run just that UPDATE statement.';
  end if;
end $$;

-- Make the API pick up the new tables and functions right away
notify pgrst, 'reload schema';

-- Quick check: tables and how many policies each has
select c.relname as table_name, count(p.policyname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where c.relkind = 'r'
group by c.relname order by c.relname;