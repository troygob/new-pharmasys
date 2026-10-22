# Lab 31: Unit Testing Record

Run the suite from the project root with:

```sh
node --test tests/lab31.test.js
```

| Module | Test cases | Expected result |
|---|---|---|
| Medicine search (`js/medicine-search.js`) | Code search is case-insensitive; all query words must match; generic name/category/dosage form/batch fields are searchable; blank query returns all rows; unmatched rows are excluded. | Correct matching rows are returned. |
| Role access (`js/auth.js`) | Admin access; cashier allowed and denied pages; inventory staff stock-in access; pharmacist category access; manager report access; missing role and unlisted pages are denied; role slug conversion. | Access matches the configured page/role matrix. |
| Sales totals (`js/sales-calculations.js`) | Single-batch total; quantity spanning batches; zero quantity; multi-medicine cart total and cent rounding. | FEFO batch prices and cart totals are calculated correctly. |

The tests exercise production JavaScript modules with Node's built-in test runner and require no database or third-party packages. They do not test Supabase queries, SQL constraints/triggers, `checkout_sale`, row-level security, browser rendering, or end-to-end workflows; those require integration/system tests.
