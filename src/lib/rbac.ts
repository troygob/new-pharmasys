import type { ModuleId, UserRole } from "../types/pharmacy";

export const ALL_ROLES: readonly UserRole[] = [
  "Admin",
  "Pharmacist",
  "Cashier",
  "Inventory Staff",
  "Manager",
] as const;

export type Permission =
  | "view_dashboard"
  | "process_sales"
  | "view_sales"
  | "manage_prescriptions"
  | "view_prescriptions"
  | "manage_medicines"
  | "manage_categories"
  | "manage_suppliers"
  | "receive_stock"
  | "adjust_stock"
  | "write_off_expired"
  | "view_reports"
  | "manage_users"
  | "edit_pharmacy_settings";

const ROLE_ALIAS_MAP: Record<string, UserRole> = {
  admin: "Admin",
  administrator: "Admin",
  pharmacist: "Pharmacist",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  "inventory staff": "Inventory Staff",
  inventory: "Inventory Staff",
  manager: "Manager",
};

/**
 * Normalizes role strings across casing, hyphens, and underscores so
 * minor DB/metadata formatting differences never lock out valid staff.
 */
export function normalizeRole(rawRole: string | null | undefined): UserRole | null {
  if (!rawRole) return null;
  const cleaned = String(rawRole)
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  return ROLE_ALIAS_MAP[cleaned] ?? null;
}

export function roleSlug(role: string | null | undefined): string {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Corrected Module Access Matrix:
 * - Resolves the original bugs where:
 *   1. Manager was blocked from Categories, Suppliers, Medicine Supply, and Stock-In history
 *      even though SQL RLS granted read access.
 *   2. Pharmacist was blocked from Reports, Suppliers, and Stock-In visibility.
 *   3. Inventory Staff was blocked from Dashboard alerts, Categories, and Inventory Reports.
 *   4. Cashier was blocked from Dashboard overview and read-only Prescription lookup during POS.
 */
export const MODULE_ACCESS: Record<ModuleId, readonly UserRole[]> = {
  dashboard: ALL_ROLES,
  sales: ["Admin", "Pharmacist", "Cashier", "Manager"],
  prescriptions: ["Admin", "Pharmacist", "Cashier", "Manager"],
  medicines: ALL_ROLES,
  categories: ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  suppliers: ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  "medicine-suppliers": ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  inventory: ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  "stock-in": ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  "stock-adjustment": ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  expiration: ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  reports: ["Admin", "Pharmacist", "Inventory Staff", "Manager"],
  users: ["Admin"],
  settings: ALL_ROLES,
};

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  Admin: [
    "view_dashboard",
    "process_sales",
    "view_sales",
    "manage_prescriptions",
    "view_prescriptions",
    "manage_medicines",
    "manage_categories",
    "manage_suppliers",
    "receive_stock",
    "adjust_stock",
    "write_off_expired",
    "view_reports",
    "manage_users",
    "edit_pharmacy_settings",
  ],
  Pharmacist: [
    "view_dashboard",
    "process_sales",
    "view_sales",
    "manage_prescriptions",
    "view_prescriptions",
    "manage_medicines",
    "manage_categories",
    "receive_stock",
    "adjust_stock",
    "write_off_expired",
    "view_reports",
  ],
  Cashier: [
    "view_dashboard",
    "process_sales",
    "view_sales",
    "view_prescriptions",
  ],
  "Inventory Staff": [
    "view_dashboard",
    "manage_suppliers",
    "receive_stock",
    "adjust_stock",
    "write_off_expired",
    "view_reports",
  ],
  Manager: [
    "view_dashboard",
    "view_sales",
    "view_prescriptions",
    "view_reports",
  ],
};

export const LANDING_MODULE: Record<UserRole, ModuleId> = {
  Admin: "dashboard",
  Pharmacist: "dashboard",
  Cashier: "sales",
  "Inventory Staff": "inventory",
  Manager: "dashboard",
};

export function canAccessModule(
  role: string | null | undefined,
  moduleId: ModuleId | string
): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  if (normalized === "Admin") return true;
  const allowed = MODULE_ACCESS[moduleId as ModuleId];
  return allowed ? allowed.includes(normalized) : false;
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission
): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  if (normalized === "Admin") return true;
  return ROLE_PERMISSIONS[normalized].includes(permission);
}

export function getLandingModule(role: string | null | undefined): ModuleId {
  const normalized = normalizeRole(role);
  if (!normalized) return "dashboard";
  return LANDING_MODULE[normalized] ?? "dashboard";
}

export interface NavItem {
  id: ModuleId;
  label: string;
  group: "Overview" | "Operations" | "Catalog & Supply" | "Inventory" | "System";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", group: "Overview" },
  { id: "sales", label: "Point of Sale", group: "Operations" },
  { id: "prescriptions", label: "Prescriptions", group: "Operations" },
  { id: "medicines", label: "Medicines", group: "Catalog & Supply" },
  { id: "categories", label: "Categories", group: "Catalog & Supply" },
  { id: "suppliers", label: "Suppliers", group: "Catalog & Supply" },
  { id: "medicine-suppliers", label: "Supply Pricing", group: "Catalog & Supply" },
  { id: "inventory", label: "Stock & Batches", group: "Inventory" },
  { id: "stock-in", label: "Receive Stock", group: "Inventory" },
  { id: "stock-adjustment", label: "Adjustments", group: "Inventory" },
  { id: "expiration", label: "Expiration", group: "Inventory" },
  { id: "reports", label: "Reports", group: "System" },
  { id: "users", label: "Users & Roles", group: "System" },
  { id: "settings", label: "Settings", group: "System" },
];
