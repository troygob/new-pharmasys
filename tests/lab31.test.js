// Lab 31 unit tests for the production browser modules, using Node's built-in runner.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadBrowserModule(relativePath, exportedNames, globals = {}) {
  const context = vm.createContext({
    location: { pathname: "/login-page.html" },
    ...globals,
  });
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInContext(`${source}\nglobalThis.__unitExports = { ${exportedNames.join(", ")} };`, context, {
    filename: relativePath,
  });
  return context.__unitExports;
}

const { medicineMatches, searchMedicines } = loadBrowserModule(
  "js/medicine-search.js",
  ["medicineMatches", "searchMedicines"],
);
const { roleSlug, canAccess } = loadBrowserModule(
  "js/auth.js",
  ["roleSlug", "canAccess"],
);
const { calculateFefoTotal, calculateCartTotal } = loadBrowserModule(
  "js/sales-calculations.js",
  ["calculateFefoTotal", "calculateCartTotal"],
);

test("medicine search matches code without regard to case", () => {
  assert.equal(medicineMatches({ medicine_code: "MED-001" }, "med-001"), true);
});

test("medicine search requires every query word to match across fields", () => {
  assert.equal(medicineMatches({ medicine_name: "Amoxicillin", strength: "500 mg" }, "amoxicillin 500"), true);
  assert.equal(medicineMatches({ medicine_name: "Amoxicillin", strength: "250 mg" }, "amoxicillin 500"), false);
});

test("medicine search matches generic name, category, dosage form, and batch", () => {
  const row = { generic_name: "Paracetamol", category_name: "Analgesics", dosage_form: "Tablet", batch_number: "B-24" };
  for (const query of ["paracetamol", "analgesics", "tablet", "b-24"]) {
    assert.equal(medicineMatches(row, query), true, `query ${query}`);
  }
});

test("blank medicine search returns every item", () => {
  const rows = [{ medicine_name: "A" }, { medicine_name: "B" }];
  assert.deepEqual(Array.from(searchMedicines(rows, "  ")), rows);
});

test("medicine search filters out non-matches", () => {
  const rows = [{ medicine_name: "Amoxicillin" }, { medicine_name: "Paracetamol" }];
  assert.deepEqual(Array.from(searchMedicines(rows, "amox")), [rows[0]]);
});

test("admin can access every page", () => {
  assert.equal(canAccess("Admin", "users.html"), true);
  assert.equal(canAccess("Admin", "unlisted.html"), true);
});

test("cashier can access sales", () => {
  assert.equal(canAccess("Cashier", "sales.html"), true);
});

test("cashier cannot access user management", () => {
  assert.equal(canAccess("Cashier", "users.html"), false);
});

test("inventory staff can access stock-in", () => {
  assert.equal(canAccess("Inventory Staff", "stock-in.html"), true);
});

test("pharmacist can access categories", () => {
  assert.equal(canAccess("Pharmacist", "categories.html"), true);
});

test("manager can access reports", () => {
  assert.equal(canAccess("Manager", "reports.html"), true);
});

test("missing role and unlisted page are denied", () => {
  assert.equal(canAccess(null, "sales.html"), false);
  assert.equal(canAccess("Cashier", "unlisted.html"), false);
});

test("role slug converts spaces to underscores and handles empty values", () => {
  assert.equal(roleSlug("Inventory Staff"), "inventory_staff");
  assert.equal(roleSlug(null), "");
});

test("FEFO total uses the first-expiring batch price", () => {
  assert.equal(calculateFefoTotal([{ qty: 5, price: 2.5 }], 3), 7.5);
});

test("FEFO total splits quantity across batches in expiry order", () => {
  const batches = [{ qty: 2, price: 1.1 }, { qty: 3, price: 1.25 }];
  assert.equal(calculateFefoTotal(batches, 3), 3.45);
});

test("FEFO total for zero quantity is zero", () => {
  assert.equal(calculateFefoTotal([{ qty: 2, price: 10 }], 0), 0);
});

test("cart total combines multiple medicines and rounds to cents", () => {
  const batches = { 1: [{ qty: 2, price: 1.1 }, { qty: 2, price: 1.25 }], 2: [{ qty: 4, price: 0.5 }] };
  const cart = [{ medicine_id: 1, qty: 3 }, { medicine_id: 2, qty: 2 }];
  assert.equal(calculateCartTotal(batches, cart), 4.45);
});

