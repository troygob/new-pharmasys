import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRole,
  canAccessModule,
  hasPermission,
  getLandingModule,
} from "../src/lib/rbac.ts";
import {
  medicineMatches,
  searchMedicines,
  calculateFefoTotal,
  calculateCartTotal,
} from "../src/lib/utils.ts";
import {
  cachedQuery,
  invalidateCache,
  clearAllCache,
} from "../src/lib/queryCache.ts";

test("normalizeRole handles casing, underscores, hyphens, and aliases", () => {
  assert.equal(normalizeRole("Admin"), "Admin");
  assert.equal(normalizeRole("  admin  "), "Admin");
  assert.equal(normalizeRole("administrator"), "Admin");
  assert.equal(normalizeRole("inventory_staff"), "Inventory Staff");
  assert.equal(normalizeRole("inventory-staff"), "Inventory Staff");
  assert.equal(normalizeRole("Inventory   Staff"), "Inventory Staff");
  assert.equal(normalizeRole("PHARMACIST"), "Pharmacist");
  assert.equal(normalizeRole("cashier"), "Cashier");
  assert.equal(normalizeRole("Manager"), "Manager");
  assert.equal(normalizeRole("unknown"), null);
  assert.equal(normalizeRole(null), null);
});

test("RBAC matrix resolves previously blocked modules while keeping Admin-only routes restricted", () => {
  // Manager: previously blocked from categories, suppliers, medicine-suppliers, stock-in
  for (const mod of [
    "dashboard",
    "sales",
    "prescriptions",
    "medicines",
    "categories",
    "suppliers",
    "medicine-suppliers",
    "inventory",
    "stock-in",
    "stock-adjustment",
    "expiration",
    "reports",
    "settings",
  ]) {
    assert.equal(canAccessModule("Manager", mod), true, `Manager should access ${mod}`);
  }
  assert.equal(canAccessModule("Manager", "users"), false);

  // Pharmacist: previously blocked from reports, suppliers, medicine-suppliers, stock-in
  for (const mod of ["reports", "suppliers", "medicine-suppliers", "stock-in"]) {
    assert.equal(canAccessModule("Pharmacist", mod), true, `Pharmacist should access ${mod}`);
  }
  assert.equal(canAccessModule("Pharmacist", "users"), false);
  assert.equal(hasPermission("Pharmacist", "receive_stock"), true);
  assert.equal(hasPermission("Pharmacist", "manage_users"), false);

  // Inventory Staff: previously blocked from dashboard, categories, reports
  for (const mod of ["dashboard", "categories", "reports", "inventory", "stock-in", "suppliers"]) {
    assert.equal(
      canAccessModule("inventory_staff", mod),
      true,
      `Inventory Staff should access ${mod}`
    );
  }
  assert.equal(canAccessModule("Inventory Staff", "sales"), false);
  assert.equal(canAccessModule("Inventory Staff", "users"), false);

  // Cashier: previously blocked from dashboard & read-only prescriptions
  assert.equal(canAccessModule("Cashier", "dashboard"), true);
  assert.equal(canAccessModule("Cashier", "prescriptions"), true);
  assert.equal(canAccessModule("Cashier", "sales"), true);
  assert.equal(canAccessModule("Cashier", "medicines"), true);
  assert.equal(hasPermission("Cashier", "view_prescriptions"), true);
  assert.equal(hasPermission("Cashier", "manage_prescriptions"), false);
  assert.equal(canAccessModule("Cashier", "users"), false);
  assert.equal(canAccessModule("Cashier", "stock-adjustment"), false);

  // Admin: full access
  assert.equal(canAccessModule("Admin", "users"), true);
  assert.equal(hasPermission("Admin", "edit_pharmacy_settings"), true);

  // Landing pages match operational workflows
  assert.equal(getLandingModule("Cashier"), "sales");
  assert.equal(getLandingModule("Inventory Staff"), "inventory");
  assert.equal(getLandingModule("Pharmacist"), "dashboard");
  assert.equal(getLandingModule("Manager"), "dashboard");
  assert.equal(getLandingModule("Admin"), "dashboard");
});

test("medicineMatches and searchMedicines filter multi-word queries across fields", () => {
  const rows = [
    {
      medicine_code: "MED-001",
      medicine_name: "Amoxicillin",
      generic_name: "Amoxicillin Trihydrate",
      category_name: "Antibiotics",
      dosage_form: "Capsule",
      strength: "500 mg",
      batch_number: "AMX-2026-A",
    },
    {
      medicine_code: "MED-002",
      medicine_name: "Biogesic",
      generic_name: "Paracetamol",
      category_name: "Analgesics",
      dosage_form: "Tablet",
      strength: "500 mg",
      batch_number: "PAR-2026-B",
    },
  ];

  assert.equal(medicineMatches(rows[0], "amox 500"), true);
  assert.equal(medicineMatches(rows[0], "paracetamol"), false);
  assert.equal(searchMedicines(rows, "antibiotics capsule").length, 1);
  assert.equal(searchMedicines(rows, "500 mg").length, 2);
  assert.equal(searchMedicines(rows, "").length, 2);
});

test("calculateFefoTotal and calculateCartTotal split pricing across expiring batches accurately", () => {
  const batches = [
    { qty: 3, price: 10.5 },
    { qty: 5, price: 12.0 },
  ];
  assert.equal(calculateFefoTotal(batches, 2), 21.0);
  assert.equal(calculateFefoTotal(batches, 5), 55.5); // 3*10.5 + 2*12.0

  const cartTotal = calculateCartTotal(
    {
      1: batches,
      2: [{ qty: 10, price: 4.25 }],
    },
    [
      { medicine_id: 1, qty: 4 }, // 3*10.5 + 1*12.0 = 43.5
      { medicine_id: 2, qty: 3 }, // 3*4.25 = 12.75
    ]
  );
  assert.equal(cartTotal, 56.25);
});

test("cachedQuery deduplicates concurrent fetches, caches by TTL, and invalidates by prefix", async () => {
  clearAllCache();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return { count: calls };
  };

  // Concurrent calls share one inflight request
  const [a, b] = await Promise.all([
    cachedQuery("inv:summary", fetcher, 5_000),
    cachedQuery("inv:summary", fetcher, 5_000),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { count: 1 });
  assert.deepEqual(b, { count: 1 });

  // Cached hit avoids re-fetch
  const c = await cachedQuery("inv:summary", fetcher, 5_000);
  assert.equal(calls, 1);
  assert.deepEqual(c, { count: 1 });

  // Prefix invalidation forces fresh fetch
  invalidateCache("inv:");
  const d = await cachedQuery("inv:summary", fetcher, 5_000);
  assert.equal(calls, 2);
  assert.deepEqual(d, { count: 2 });
  clearAllCache();
});
