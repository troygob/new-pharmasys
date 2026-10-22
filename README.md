# Pharmacy Management System

Static HTML + JavaScript pages that talk to a Supabase (PostgreSQL) database.

## Setup
1. Create a Supabase project and put its URL and anon key in `config/supabase.js`.
2. Open Supabase > SQL Editor and run `database/pharmacy_schema.sql` (once; it rebuilds all tables).
3. Create your first login in Supabase > Authentication, then make sure its email matches the
   `update public.users ... where email = '...'` line near the end of the schema so it becomes Admin.
4. Open `login-page.html` (use a local server such as VS Code Live Server).

## Structure
```
new-pharmasys/
├── assets/      logo and images
├── config/      supabase.js   (database connection + logout)
├── css/         styles.css
├── js/          auth.js (roles, page access), sidebar.js (navigation), medicine-search.js (shared search)
├── database/    pharmacy_schema.sql (tables, views, security, checkout function)
└── *.html       one page per module
```
The suggested `controllers/`, `models/`, `views/` and `reports/` folders are not used: this project has
no server-side code. Each page holds its own logic, and the database does the heavy lifting.

## Pages
| Page | Module | Lab |
|---|---|---|
| index.html | Medicines | 4, 5 |
| categories.html | Categories | 3 |
| suppliers.html | Suppliers | 6 |
| medicine-suppliers.html | Medicine-Supplier | 7 |
| inventory.html | Inventory monitoring | 9 |
| stock-in.html | Stock-in | 8 |
| stock-adjustment.html | Adjustments / history | 10 |
| prescriptions.html | Prescriptions | 12-14 |
| sales.html | Sales | 15+ |
| dashboard.html, expiration.html, reports.html | placeholders | 20-26 |
| users.html, settings.html, login-page.html | Security | 27-28 |
