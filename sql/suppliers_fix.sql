-- Fix for: "Could not find the 'contact_no' column of 'suppliers' in the schema cache"
-- A suppliers table already existed with different columns, so the CREATE TABLE was skipped.
-- This adds any missing columns to the existing table.
alter table suppliers add column if not exists supplier_code  text;
alter table suppliers add column if not exists supplier_name  text;
alter table suppliers add column if not exists contact_person text;
alter table suppliers add column if not exists contact_no     text;
alter table suppliers add column if not exists email          text;
alter table suppliers add column if not exists address        text;
alter table suppliers add column if not exists status         text not null default 'Active';

-- Make supplier codes unique (ignore the error if it already exists)
create unique index if not exists suppliers_supplier_code_key on suppliers (supplier_code);

-- Refresh Supabase's schema cache so the new columns are seen immediately
notify pgrst, 'reload schema';
