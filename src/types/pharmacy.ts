export type UserRole =
  | "Admin"
  | "Pharmacist"
  | "Cashier"
  | "Inventory Staff"
  | "Manager";

export type AccountStatus = "Active" | "Inactive";

export type ModuleId =
  | "dashboard"
  | "sales"
  | "prescriptions"
  | "medicines"
  | "categories"
  | "suppliers"
  | "medicine-suppliers"
  | "inventory"
  | "stock-in"
  | "stock-adjustment"
  | "expiration"
  | "reports"
  | "users"
  | "settings";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  status: AccountStatus;
}

export interface ManagedUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: AccountStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  category_id: number;
  category_name: string;
  description: string | null;
  status: AccountStatus;
  medicine_count?: number;
}

export interface Medicine {
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  generic_name: string | null;
  category_id: number | null;
  category_name: string | null;
  dosage_form: string;
  strength: string | null;
  unit_price: number;
  reorder_level: number;
  requires_prescription: boolean;
  status: AccountStatus;
  quantity_on_hand: number;
  nearest_expiry: string | null;
  is_low_stock: boolean;
}

export interface Supplier {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  contact_person: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  status: AccountStatus;
}

export interface MedicineSupplierLink {
  medicine_supplier_id: number;
  medicine_id: number;
  supplier_id: number;
  purchase_price: number;
  medicine_code?: string;
  medicine_name?: string;
  strength?: string | null;
  supplier_code?: string;
  supplier_name?: string;
  supplier_status?: AccountStatus;
}

export type ExpiryStatus = "Valid" | "Expiring Soon" | "Expired";

export interface InventoryBatch {
  inventory_id: number;
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string;
  category_name: string | null;
  batch_number: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  stock_value: number;
  expiration_date: string;
  date_received: string;
  days_to_expiry: number;
  expiry_status: ExpiryStatus;
}

export interface LowStockItem {
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  strength: string | null;
  dosage_form: string;
  category_name: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  suggested_reorder_qty: number;
}

export type InventoryTransactionType =
  | "STOCK_IN"
  | "SALE"
  | "ADJUSTMENT"
  | "EXPIRED"
  | "DAMAGED"
  | "RETURN";

export interface InventoryTransaction {
  transaction_id: number;
  inventory_id: number;
  medicine_id: number;
  transaction_type: InventoryTransactionType;
  quantity_change: number;
  reference_type: string | null;
  reference_id: number | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
  medicine_code?: string;
  medicine_name?: string;
  strength?: string | null;
  batch_number?: string;
}

export type PrescriptionStatus =
  | "Pending"
  | "Partially Dispensed"
  | "Fully Dispensed"
  | "Cancelled";

export interface PrescriptionItem {
  prescription_item_id?: number;
  prescription_id?: number;
  medicine_id: number;
  medicine_code?: string;
  medicine_name?: string;
  strength?: string | null;
  dosage_form?: string;
  quantity: number;
  quantity_dispensed: number;
  dosage_instructions: string | null;
}

export interface Prescription {
  prescription_id: number;
  prescription_no: string;
  patient_name: string;
  patient_contact: string | null;
  doctor_name: string;
  prescriber_license: string | null;
  prescription_date: string;
  status: PrescriptionStatus;
  notes: string | null;
  created_at?: string;
  items: PrescriptionItem[];
}

export type PaymentMethod =
  | "Cash"
  | "Card"
  | "E-Wallet"
  | "GCash"
  | "Maya"
  | "Bank Transfer"
  | "Other";

export interface PaymentRecord {
  payment_id?: number;
  payment_method: PaymentMethod;
  amount: number;
  amount_tendered: number | null;
  change_amount: number;
  reference_no: string | null;
}

export interface SaleItemDetail {
  medicine_id: number;
  medicine_name: string;
  strength: string | null;
  quantity: number;
  unit_price: number;
}

export interface SaleSummary {
  sale_id: number;
  sale_no: string;
  sale_date: string;
  customer_name: string | null;
  cashier_name: string | null;
  prescription_no?: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: "Completed" | "Voided" | "Refunded";
  payment_methods: string[];
}

export interface SaleReceipt extends SaleSummary {
  items: SaleItemDetail[];
  payments: PaymentRecord[];
}

export interface DashboardSummary {
  todays_sales: number;
  todays_transactions: number;
  total_medicines: number;
  low_stock: number;
  expiring_soon_batches: number;
  expired_batches: number;
  pending_prescriptions: number;
}

export interface PharmacySettings {
  pharmacy_name: string;
  pharmacy_address: string;
  receipt_footer: string;
  expiring_soon_days: number;
}

export interface CartItem {
  medicine_id: number;
  code: string;
  label: string;
  price: number;
  max: number;
  qty: number;
  requires_prescription: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "int" | "money" | "date";
}

export interface ReportOutput {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
}
