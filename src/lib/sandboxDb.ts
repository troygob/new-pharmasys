import type {
  AccountStatus,
  Category,
  DashboardSummary,
  ExpiryStatus,
  InventoryBatch,
  InventoryTransaction,
  LowStockItem,
  ManagedUser,
  Medicine,
  MedicineSupplierLink,
  PaymentMethod,
  PharmacySettings,
  Prescription,
  PrescriptionStatus,
  ReportOutput,
  SaleReceipt,
  SaleSummary,
  Supplier,
  UserProfile,
  UserRole,
} from "../types/pharmacy";
import { todayIsoDate } from "./utils";

function addDays(baseDateStr: string, days: number): string {
  const d = new Date(`${baseDateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(targetDateStr: string, todayStr: string): number {
  const t = new Date(`${targetDateStr}T00:00:00`).getTime();
  const c = new Date(`${todayStr}T00:00:00`).getTime();
  return Math.round((t - c) / 86_400_000);
}

interface RawMedicine {
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  generic_name: string | null;
  category_id: number | null;
  dosage_form: string;
  strength: string | null;
  unit_price: number;
  reorder_level: number;
  requires_prescription: boolean;
  status: AccountStatus;
}

interface RawBatch {
  inventory_id: number;
  medicine_id: number;
  batch_number: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  expiration_date: string;
  date_received: string;
}

interface RawPurchase {
  purchase_id: number;
  purchase_no: string;
  purchase_date: string;
  supplier_id: number;
  medicine_id: number;
  batch_number: string;
  quantity: number;
  unit_cost: number;
  expiration_date: string;
  status: "Received" | "Cancelled";
}

interface RawSale {
  sale_id: number;
  sale_no: string;
  prescription_id: number | null;
  user_id: string | null;
  cashier_name: string | null;
  customer_name: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: "Completed" | "Voided" | "Refunded";
  items: {
    medicine_id: number;
    inventory_id: number;
    quantity: number;
    unit_price: number;
  }[];
  payments: {
    payment_id: number;
    payment_method: PaymentMethod;
    amount: number;
    amount_tendered: number | null;
    change_amount: number;
    reference_no: string | null;
  }[];
}

const today = todayIsoDate();

class SandboxDatabase {
  private settings: PharmacySettings = {
    pharmacy_name: "PharmaSys Community Pharmacy",
    pharmacy_address: "142 Mabini St., Ermita, Manila",
    receipt_footer: "Thank you for trusting us with your health!",
    expiring_soon_days: 30,
  };

  private users: ManagedUser[] = [
    {
      user_id: "u-admin",
      email: "admin@gmail.com",
      full_name: "Dr. Elena Reyes",
      role: "Admin",
      status: "Active",
    },
    {
      user_id: "u-pharmacist",
      email: "pharmacist@pharmasys.local",
      full_name: "Marco Villanueva, RPh",
      role: "Pharmacist",
      status: "Active",
    },
    {
      user_id: "u-cashier",
      email: "cashier@pharmasys.local",
      full_name: "Camille Santos",
      role: "Cashier",
      status: "Active",
    },
    {
      user_id: "u-inventory",
      email: "inventory@pharmasys.local",
      full_name: "Rafael Mendoza",
      role: "Inventory Staff",
      status: "Active",
    },
    {
      user_id: "u-manager",
      email: "manager@pharmasys.local",
      full_name: "Clarisse Navarro",
      role: "Manager",
      status: "Active",
    },
  ];

  private currentUserId: string | null = null;

  private categories: Category[] = [
    { category_id: 1, category_name: "Antibiotics", description: "Prescription antimicrobial agents", status: "Active" },
    { category_id: 2, category_name: "Analgesics", description: "Pain relief & antipyretics", status: "Active" },
    { category_id: 3, category_name: "Antihistamines", description: "Allergy relief medications", status: "Active" },
    { category_id: 4, category_name: "Antacids", description: "Gastrointestinal & reflux care", status: "Active" },
    { category_id: 5, category_name: "Vitamins", description: "Daily supplements & immunity", status: "Active" },
    { category_id: 6, category_name: "Maintenance Medicines", description: "Cardiovascular & metabolic care", status: "Active" },
  ];

  private rawMedicines: RawMedicine[] = [
    { medicine_id: 1, medicine_code: "MED-0001", medicine_name: "Paracetamol", generic_name: "Acetaminophen", category_id: 2, dosage_form: "Tablet", strength: "500 mg", unit_price: 5.5, reorder_level: 80, requires_prescription: false, status: "Active" },
    { medicine_id: 2, medicine_code: "MED-0002", medicine_name: "Amoxicillin", generic_name: "Amoxicillin Trihydrate", category_id: 1, dosage_form: "Capsule", strength: "500 mg", unit_price: 18.0, reorder_level: 50, requires_prescription: true, status: "Active" },
    { medicine_id: 3, medicine_code: "MED-0003", medicine_name: "Cetirizine", generic_name: "Cetirizine Dihydrochloride", category_id: 3, dosage_form: "Tablet", strength: "10 mg", unit_price: 12.0, reorder_level: 40, requires_prescription: false, status: "Active" },
    { medicine_id: 4, medicine_code: "MED-0004", medicine_name: "Omeprazole", generic_name: "Omeprazole", category_id: 4, dosage_form: "Capsule", strength: "20 mg", unit_price: 22.5, reorder_level: 35, requires_prescription: false, status: "Active" },
    { medicine_id: 5, medicine_code: "MED-0005", medicine_name: "Losartan", generic_name: "Losartan Potassium", category_id: 6, dosage_form: "Tablet", strength: "50 mg", unit_price: 16.0, reorder_level: 60, requires_prescription: true, status: "Active" },
    { medicine_id: 6, medicine_code: "MED-0006", medicine_name: "Ascorbic Acid + Zinc", generic_name: "Vitamin C", category_id: 5, dosage_form: "Tablet", strength: "500 mg", unit_price: 9.0, reorder_level: 100, requires_prescription: false, status: "Active" },
    { medicine_id: 7, medicine_code: "MED-0007", medicine_name: "Azithromycin", generic_name: "Azithromycin Dihydrate", category_id: 1, dosage_form: "Tablet", strength: "500 mg", unit_price: 68.0, reorder_level: 25, requires_prescription: true, status: "Active" },
    { medicine_id: 8, medicine_code: "MED-0008", medicine_name: "Metformin", generic_name: "Metformin Hydrochloride", category_id: 6, dosage_form: "Tablet", strength: "500 mg", unit_price: 8.5, reorder_level: 70, requires_prescription: true, status: "Active" },
    { medicine_id: 9, medicine_code: "MED-0009", medicine_name: "Ibuprofen", generic_name: "Ibuprofen", category_id: 2, dosage_form: "Tablet", strength: "400 mg", unit_price: 11.0, reorder_level: 45, requires_prescription: false, status: "Active" },
  ];

  private suppliers: Supplier[] = [
    { supplier_id: 1, supplier_code: "SUP001", supplier_name: "Unilab Health Distribution", contact_person: "Liza Bautista", contact_no: "0917-555-0101", email: "orders@unilabdist.ph", address: "Mandaluyong City", status: "Active" },
    { supplier_id: 2, supplier_code: "SUP002", supplier_name: "Zuellig Pharma Logistics", contact_person: "Arnel Cruz", contact_no: "0918-555-0244", email: "supply@zuellig.ph", address: "Makati City", status: "Active" },
    { supplier_id: 3, supplier_code: "SUP003", supplier_name: "Metro Pacific MedSupply", contact_person: "Grace Lim", contact_no: "0920-555-0388", email: "sales@metropacmed.ph", address: "Pasig City", status: "Active" },
  ];

  private medSuppliers: { medicine_supplier_id: number; medicine_id: number; supplier_id: number; purchase_price: number }[] = [
    { medicine_supplier_id: 1, medicine_id: 1, supplier_id: 1, purchase_price: 3.1 },
    { medicine_supplier_id: 2, medicine_id: 2, supplier_id: 1, purchase_price: 11.5 },
    { medicine_supplier_id: 3, medicine_id: 3, supplier_id: 2, purchase_price: 7.2 },
    { medicine_supplier_id: 4, medicine_id: 4, supplier_id: 2, purchase_price: 14.0 },
    { medicine_supplier_id: 5, medicine_id: 5, supplier_id: 3, purchase_price: 9.8 },
    { medicine_supplier_id: 6, medicine_id: 6, supplier_id: 1, purchase_price: 5.0 },
    { medicine_supplier_id: 7, medicine_id: 7, supplier_id: 2, purchase_price: 42.0 },
    { medicine_supplier_id: 8, medicine_id: 8, supplier_id: 3, purchase_price: 4.9 },
  ];

  private rawBatches: RawBatch[] = [
    { inventory_id: 1, medicine_id: 1, batch_number: "PCM-26A", quantity: 140, purchase_price: 3.1, selling_price: 5.5, expiration_date: addDays(today, 220), date_received: addDays(today, -35) },
    { inventory_id: 2, medicine_id: 1, batch_number: "PCM-25X", quantity: 35, purchase_price: 3.0, selling_price: 5.0, expiration_date: addDays(today, 14), date_received: addDays(today, -180) },
    { inventory_id: 3, medicine_id: 2, batch_number: "AMX-108", quantity: 90, purchase_price: 11.5, selling_price: 18.0, expiration_date: addDays(today, 185), date_received: addDays(today, -20) },
    { inventory_id: 4, medicine_id: 3, batch_number: "CTZ-44B", quantity: 24, purchase_price: 7.2, selling_price: 12.0, expiration_date: addDays(today, 160), date_received: addDays(today, -45) },
    { inventory_id: 5, medicine_id: 4, batch_number: "OMP-88C", quantity: 65, purchase_price: 14.0, selling_price: 22.5, expiration_date: addDays(today, 19), date_received: addDays(today, -90) },
    { inventory_id: 6, medicine_id: 5, batch_number: "LOS-301", quantity: 120, purchase_price: 9.8, selling_price: 16.0, expiration_date: addDays(today, 310), date_received: addDays(today, -15) },
    { inventory_id: 7, medicine_id: 6, batch_number: "ASC-712", quantity: 75, purchase_price: 5.0, selling_price: 9.0, expiration_date: addDays(today, 270), date_received: addDays(today, -25) },
    { inventory_id: 8, medicine_id: 7, batch_number: "AZM-019", quantity: 12, purchase_price: 42.0, selling_price: 68.0, expiration_date: addDays(today, 120), date_received: addDays(today, -40) },
    { inventory_id: 9, medicine_id: 8, batch_number: "MET-509", quantity: 160, purchase_price: 4.9, selling_price: 8.5, expiration_date: addDays(today, 290), date_received: addDays(today, -12) },
    { inventory_id: 10, medicine_id: 9, batch_number: "IBU-099", quantity: 18, purchase_price: 6.4, selling_price: 11.0, expiration_date: addDays(today, -9), date_received: addDays(today, -365) },
  ];

  private purchases: RawPurchase[] = [
    { purchase_id: 1, purchase_no: "PO-20261110-0915", purchase_date: addDays(today, -15), supplier_id: 3, medicine_id: 5, batch_number: "LOS-301", quantity: 120, unit_cost: 9.8, expiration_date: addDays(today, 310), status: "Received" },
    { purchase_id: 2, purchase_no: "PO-20261113-1420", purchase_date: addDays(today, -12), supplier_id: 3, medicine_id: 8, batch_number: "MET-509", quantity: 160, unit_cost: 4.9, expiration_date: addDays(today, 290), status: "Received" },
  ];

  private prescriptions: Prescription[] = [
    {
      prescription_id: 1,
      prescription_no: `RX-${today.replace(/-/g, "")}-001`,
      patient_name: "Mateo Alcaraz",
      patient_contact: "0917-223-8891",
      doctor_name: "Dr. Josefina Lim",
      prescriber_license: "PRC-0098412",
      prescription_date: today,
      status: "Pending",
      notes: "Take after meals; complete full 7-day course.",
      items: [
        { prescription_item_id: 1, prescription_id: 1, medicine_id: 2, medicine_code: "MED-0002", medicine_name: "Amoxicillin", strength: "500 mg", dosage_form: "Capsule", quantity: 21, quantity_dispensed: 0, dosage_instructions: "1 capsule every 8 hours for 7 days" },
        { prescription_item_id: 2, prescription_id: 1, medicine_id: 1, medicine_code: "MED-0001", medicine_name: "Paracetamol", strength: "500 mg", dosage_form: "Tablet", quantity: 10, quantity_dispensed: 0, dosage_instructions: "1 tablet every 6 hours as needed for fever" },
      ],
    },
    {
      prescription_id: 2,
      prescription_no: `RX-${today.replace(/-/g, "")}-002`,
      patient_name: "Rosa Mendoza",
      patient_contact: "0919-884-1120",
      doctor_name: "Dr. Antonio Dizon",
      prescriber_license: "PRC-0112045",
      prescription_date: today,
      status: "Partially Dispensed",
      notes: "Monthly hypertension & glucose maintenance.",
      items: [
        { prescription_item_id: 3, prescription_id: 2, medicine_id: 5, medicine_code: "MED-0005", medicine_name: "Losartan", strength: "50 mg", dosage_form: "Tablet", quantity: 30, quantity_dispensed: 15, dosage_instructions: "1 tablet once daily every morning" },
        { prescription_item_id: 4, prescription_id: 2, medicine_id: 8, medicine_code: "MED-0008", medicine_name: "Metformin", strength: "500 mg", dosage_form: "Tablet", quantity: 30, quantity_dispensed: 0, dosage_instructions: "1 tablet twice daily with meals" },
      ],
    },
  ];

  private sales: RawSale[] = [
    {
      sale_id: 1,
      sale_no: "SALE-00001",
      prescription_id: null,
      user_id: "u-cashier",
      cashier_name: "Camille Santos",
      customer_name: "Walk-in Customer",
      sale_date: new Date().toISOString(),
      subtotal: 120.0,
      discount: 0,
      total_amount: 120.0,
      status: "Completed",
      items: [
        { medicine_id: 3, inventory_id: 4, quantity: 5, unit_price: 12.0 },
        { medicine_id: 6, inventory_id: 7, quantity: 6, unit_price: 9.0 },
      ],
      payments: [
        { payment_id: 1, payment_method: "Cash", amount: 120.0, amount_tendered: 200.0, change_amount: 80.0, reference_no: null },
      ],
    },
    {
      sale_id: 2,
      sale_no: "SALE-00002",
      prescription_id: 2,
      user_id: "u-pharmacist",
      cashier_name: "Marco Villanueva, RPh",
      customer_name: "Rosa Mendoza",
      sale_date: new Date().toISOString(),
      subtotal: 240.0,
      discount: 0,
      total_amount: 240.0,
      status: "Completed",
      items: [
        { medicine_id: 5, inventory_id: 6, quantity: 15, unit_price: 16.0 },
      ],
      payments: [
        { payment_id: 2, payment_method: "GCash", amount: 240.0, amount_tendered: 240.0, change_amount: 0, reference_no: "GC-8829104" },
      ],
    },
  ];

  private transactions: InventoryTransaction[] = [
    {
      transaction_id: 1,
      inventory_id: 6,
      medicine_id: 5,
      transaction_type: "STOCK_IN",
      quantity_change: 120,
      reference_type: "purchase",
      reference_id: 1,
      user_id: "u-inventory",
      notes: "Received from Metro Pacific MedSupply (SUP003) @ 9.80 - PO-20261110-0915",
      created_at: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    },
    {
      transaction_id: 2,
      inventory_id: 4,
      medicine_id: 3,
      transaction_type: "SALE",
      quantity_change: -5,
      reference_type: "sale",
      reference_id: 1,
      user_id: "u-cashier",
      notes: "Sold 5 x Cetirizine",
      created_at: new Date(Date.now() - 3_600_000 * 3).toISOString(),
    },
    {
      transaction_id: 3,
      inventory_id: 6,
      medicine_id: 5,
      transaction_type: "SALE",
      quantity_change: -15,
      reference_type: "sale",
      reference_id: 2,
      user_id: "u-pharmacist",
      notes: "Sold 15 x Losartan",
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ];

  private nextIds = {
    category: 10,
    medicine: 15,
    supplier: 10,
    medSupplier: 20,
    batch: 20,
    purchase: 10,
    prescription: 10,
    rxItem: 20,
    sale: 10,
    payment: 10,
    tx: 20,
  };

  getProfile(): UserProfile | null {
    if (!this.currentUserId) return null;
    const u = this.users.find((x) => x.user_id === this.currentUserId);
    if (!u) return null;
    return {
      id: u.user_id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      status: u.status,
    };
  }

  signIn(email: string, password: string): UserProfile {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || !password.trim()) {
      throw new Error("Invalid email or password.");
    }
    if (user.email === "admin@gmail.com" && password !== "admin" && password.length < 4) {
      throw new Error("Invalid email or password.");
    }
    if (user.status !== "Active") {
      throw new Error("This account is inactive. Contact an administrator.");
    }
    this.currentUserId = user.user_id;
    return this.getProfile()!;
  }

  signInAsRole(role: UserRole): UserProfile {
    const user = this.users.find((u) => u.role === role && u.status === "Active");
    if (!user) throw new Error(`No active ${role} account found.`);
    this.currentUserId = user.user_id;
    return this.getProfile()!;
  }

  signOut(): void {
    this.currentUserId = null;
  }

  getSettings(): PharmacySettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<PharmacySettings>): PharmacySettings {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  getCategories(): Category[] {
    return this.categories
      .map((c) => ({
        ...c,
        medicine_count: this.rawMedicines.filter(
          (m) => m.category_id === c.category_id && m.status === "Active"
        ).length,
      }))
      .sort((a, b) => a.category_name.localeCompare(b.category_name));
  }

  saveCategory(payload: {
    category_id?: number;
    category_name: string;
    description: string | null;
  }): void {
    const dup = this.categories.find(
      (c) =>
        c.category_name.toLowerCase() === payload.category_name.toLowerCase() &&
        c.category_id !== payload.category_id
    );
    if (dup) throw new Error("A category with that name already exists.");
    if (payload.category_id) {
      const target = this.categories.find((c) => c.category_id === payload.category_id);
      if (target) {
        target.category_name = payload.category_name;
        target.description = payload.description;
      }
    } else {
      this.categories.push({
        category_id: ++this.nextIds.category,
        category_name: payload.category_name,
        description: payload.description,
        status: "Active",
      });
    }
  }

  toggleCategoryStatus(id: number): void {
    const cat = this.categories.find((c) => c.category_id === id);
    if (cat) cat.status = cat.status === "Active" ? "Inactive" : "Active";
  }

  getMedicines(): Medicine[] {
    const now = todayIsoDate();
    return this.rawMedicines
      .map((m) => {
        const cat = this.categories.find((c) => c.category_id === m.category_id);
        const validBatches = this.rawBatches.filter(
          (b) => b.medicine_id === m.medicine_id && b.expiration_date >= now
        );
        const qty = validBatches.reduce((sum, b) => sum + b.quantity, 0);
        const dates = validBatches
          .filter((b) => b.quantity > 0)
          .map((b) => b.expiration_date)
          .sort();
        return {
          ...m,
          category_name: cat?.category_name ?? null,
          quantity_on_hand: qty,
          nearest_expiry: dates[0] ?? null,
          is_low_stock: qty <= m.reorder_level,
        };
      })
      .sort((a, b) => a.medicine_name.localeCompare(b.medicine_name));
  }

  saveMedicine(
    payload: Omit<RawMedicine, "medicine_id" | "status"> & {
      medicine_id?: number;
      opening_stock?: {
        quantity: number;
        batch_number: string;
        purchase_price: number;
        expiration_date: string;
      };
    }
  ): void {
    const dup = this.rawMedicines.find(
      (m) =>
        m.medicine_code.toLowerCase() === payload.medicine_code.toLowerCase() &&
        m.medicine_id !== payload.medicine_id
    );
    if (dup) throw new Error("A medicine with that code already exists.");

    if (payload.medicine_id) {
      const m = this.rawMedicines.find((x) => x.medicine_id === payload.medicine_id);
      if (m) {
        Object.assign(m, {
          medicine_code: payload.medicine_code,
          medicine_name: payload.medicine_name,
          generic_name: payload.generic_name,
          category_id: payload.category_id,
          dosage_form: payload.dosage_form,
          strength: payload.strength,
          unit_price: payload.unit_price,
          reorder_level: payload.reorder_level,
          requires_prescription: payload.requires_prescription,
        });
      }
    } else {
      const medId = ++this.nextIds.medicine;
      this.rawMedicines.push({
        medicine_id: medId,
        medicine_code: payload.medicine_code,
        medicine_name: payload.medicine_name,
        generic_name: payload.generic_name,
        category_id: payload.category_id,
        dosage_form: payload.dosage_form,
        strength: payload.strength,
        unit_price: payload.unit_price,
        reorder_level: payload.reorder_level,
        requires_prescription: payload.requires_prescription,
        status: "Active",
      });
      if (payload.opening_stock && payload.opening_stock.quantity > 0) {
        const batchId = ++this.nextIds.batch;
        this.rawBatches.push({
          inventory_id: batchId,
          medicine_id: medId,
          batch_number: payload.opening_stock.batch_number || "INITIAL",
          quantity: payload.opening_stock.quantity,
          purchase_price: payload.opening_stock.purchase_price,
          selling_price: payload.unit_price,
          expiration_date: payload.opening_stock.expiration_date,
          date_received: todayIsoDate(),
        });
        this.transactions.unshift({
          transaction_id: ++this.nextIds.tx,
          inventory_id: batchId,
          medicine_id: medId,
          transaction_type: "ADJUSTMENT",
          quantity_change: payload.opening_stock.quantity,
          reference_type: "manual",
          reference_id: null,
          user_id: this.currentUserId,
          notes: "Opening stock added from Medicines catalog",
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  toggleMedicineStatus(id: number): void {
    const m = this.rawMedicines.find((x) => x.medicine_id === id);
    if (m) m.status = m.status === "Active" ? "Inactive" : "Active";
  }

  getSuppliers(): Supplier[] {
    return [...this.suppliers].sort((a, b) =>
      a.supplier_name.localeCompare(b.supplier_name)
    );
  }

  saveSupplier(
    payload: Omit<Supplier, "supplier_id" | "status"> & { supplier_id?: number }
  ): void {
    const dup = this.suppliers.find(
      (s) =>
        s.supplier_code.toLowerCase() === payload.supplier_code.toLowerCase() &&
        s.supplier_id !== payload.supplier_id
    );
    if (dup) throw new Error("A supplier with that code already exists.");

    if (payload.supplier_id) {
      const s = this.suppliers.find((x) => x.supplier_id === payload.supplier_id);
      if (s) Object.assign(s, payload);
    } else {
      this.suppliers.push({
        supplier_id: ++this.nextIds.supplier,
        ...payload,
        status: "Active",
      });
    }
  }

  toggleSupplierStatus(id: number): void {
    const s = this.suppliers.find((x) => x.supplier_id === id);
    if (s) s.status = s.status === "Active" ? "Inactive" : "Active";
  }

  getMedicineSuppliers(): MedicineSupplierLink[] {
    return this.medSuppliers
      .map((l) => {
        const m = this.rawMedicines.find((x) => x.medicine_id === l.medicine_id);
        const s = this.suppliers.find((x) => x.supplier_id === l.supplier_id);
        return {
          ...l,
          medicine_code: m?.medicine_code,
          medicine_name: m?.medicine_name,
          strength: m?.strength,
          supplier_code: s?.supplier_code,
          supplier_name: s?.supplier_name,
          supplier_status: s?.status,
        };
      })
      .sort((a, b) => b.medicine_supplier_id - a.medicine_supplier_id);
  }

  saveMedicineSupplier(payload: {
    medicine_supplier_id?: number;
    medicine_id: number;
    supplier_id: number;
    purchase_price: number;
  }): void {
    if (payload.medicine_supplier_id) {
      const link = this.medSuppliers.find(
        (l) => l.medicine_supplier_id === payload.medicine_supplier_id
      );
      if (link) link.purchase_price = payload.purchase_price;
      return;
    }
    const dup = this.medSuppliers.find(
      (l) =>
        l.medicine_id === payload.medicine_id && l.supplier_id === payload.supplier_id
    );
    if (dup) {
      throw new Error(
        'That supplier is already assigned to this medicine. Use "Edit price" instead.'
      );
    }
    this.medSuppliers.push({
      medicine_supplier_id: ++this.nextIds.medSupplier,
      medicine_id: payload.medicine_id,
      supplier_id: payload.supplier_id,
      purchase_price: payload.purchase_price,
    });
  }

  removeMedicineSupplier(id: number): void {
    this.medSuppliers = this.medSuppliers.filter((l) => l.medicine_supplier_id !== id);
  }

  getInventoryBatches(): InventoryBatch[] {
    const now = todayIsoDate();
    const soonDays = this.settings.expiring_soon_days;
    return this.rawBatches
      .map((b) => {
        const m = this.rawMedicines.find((x) => x.medicine_id === b.medicine_id)!;
        const c = this.categories.find((x) => x.category_id === m.category_id);
        const diff = daysBetween(b.expiration_date, now);
        const expiry_status: ExpiryStatus =
          diff < 0 ? "Expired" : diff <= soonDays ? "Expiring Soon" : "Valid";
        return {
          inventory_id: b.inventory_id,
          medicine_id: b.medicine_id,
          medicine_code: m.medicine_code,
          medicine_name: m.medicine_name,
          generic_name: m.generic_name,
          strength: m.strength,
          dosage_form: m.dosage_form,
          category_name: c?.category_name ?? null,
          batch_number: b.batch_number,
          quantity: b.quantity,
          purchase_price: b.purchase_price,
          selling_price: b.selling_price,
          stock_value: Math.round(b.quantity * b.purchase_price * 100) / 100,
          expiration_date: b.expiration_date,
          date_received: b.date_received,
          days_to_expiry: diff,
          expiry_status,
        };
      })
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date));
  }

  getLowStock(): LowStockItem[] {
    return this.getMedicines()
      .filter((m) => m.status === "Active" && m.is_low_stock)
      .map((m) => ({
        medicine_id: m.medicine_id,
        medicine_code: m.medicine_code,
        medicine_name: m.medicine_name,
        strength: m.strength,
        dosage_form: m.dosage_form,
        category_name: m.category_name,
        quantity_on_hand: m.quantity_on_hand,
        reorder_level: m.reorder_level,
        suggested_reorder_qty: Math.max(m.reorder_level * 2 - m.quantity_on_hand, 1),
      }));
  }

  getInventoryTransactions(limit = 200): InventoryTransaction[] {
    return this.transactions.slice(0, limit).map((tx) => {
      const m = this.rawMedicines.find((x) => x.medicine_id === tx.medicine_id);
      const b = this.rawBatches.find((x) => x.inventory_id === tx.inventory_id);
      return {
        ...tx,
        medicine_code: m?.medicine_code,
        medicine_name: m?.medicine_name,
        strength: m?.strength,
        batch_number: b?.batch_number,
      };
    });
  }

  receiveStock(payload: {
    supplier_id: number;
    medicine_id: number;
    batch_number: string;
    quantity: number;
    purchase_price: number;
    selling_price: number;
    expiration_date: string;
  }): string {
    const supplier = this.suppliers.find((s) => s.supplier_id === payload.supplier_id);
    if (!supplier) throw new Error("Supplier not found.");

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const poNo = `PO-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const purchaseId = ++this.nextIds.purchase;

    this.purchases.push({
      purchase_id: purchaseId,
      purchase_no: poNo,
      purchase_date: todayIsoDate(),
      supplier_id: payload.supplier_id,
      medicine_id: payload.medicine_id,
      batch_number: payload.batch_number,
      quantity: payload.quantity,
      unit_cost: payload.purchase_price,
      expiration_date: payload.expiration_date,
      status: "Received",
    });

    let batch = this.rawBatches.find(
      (b) =>
        b.medicine_id === payload.medicine_id &&
        b.batch_number.toLowerCase() === payload.batch_number.toLowerCase()
    );
    if (batch) {
      batch.quantity += payload.quantity;
      batch.purchase_price = payload.purchase_price;
      batch.selling_price = payload.selling_price;
      batch.expiration_date = payload.expiration_date;
    } else {
      batch = {
        inventory_id: ++this.nextIds.batch,
        medicine_id: payload.medicine_id,
        batch_number: payload.batch_number,
        quantity: payload.quantity,
        purchase_price: payload.purchase_price,
        selling_price: payload.selling_price,
        expiration_date: payload.expiration_date,
        date_received: todayIsoDate(),
      };
      this.rawBatches.push(batch);
    }

    this.transactions.unshift({
      transaction_id: ++this.nextIds.tx,
      inventory_id: batch.inventory_id,
      medicine_id: payload.medicine_id,
      transaction_type: "STOCK_IN",
      quantity_change: payload.quantity,
      reference_type: "purchase",
      reference_id: purchaseId,
      user_id: this.currentUserId,
      notes: `Received from ${supplier.supplier_name} (${supplier.supplier_code}) @ ${payload.purchase_price.toFixed(2)} - ${poNo}`,
      created_at: new Date().toISOString(),
    });

    return poNo;
  }

  adjustStock(payload: {
    inventory_id: number;
    transaction_type: "ADJUSTMENT" | "DAMAGED" | "EXPIRED" | "RETURN";
    label: string;
    quantity_change: number;
    reason: string;
    remarks?: string;
  }): { oldQty: number; newQty: number } {
    const batch = this.rawBatches.find((b) => b.inventory_id === payload.inventory_id);
    if (!batch) throw new Error("Batch not found.");
    const oldQty = batch.quantity;
    const newQty = oldQty + payload.quantity_change;
    if (newQty < 0) {
      throw new Error(`Insufficient batch quantity: only ${oldQty} units left.`);
    }
    batch.quantity = newQty;
    const noteBody = `[${payload.label}] ${payload.reason}${payload.remarks ? ` - ${payload.remarks}` : ""}. Qty ${oldQty} -> ${newQty}`;
    this.transactions.unshift({
      transaction_id: ++this.nextIds.tx,
      inventory_id: batch.inventory_id,
      medicine_id: batch.medicine_id,
      transaction_type: payload.transaction_type,
      quantity_change: payload.quantity_change,
      reference_type: "manual",
      reference_id: null,
      user_id: this.currentUserId,
      notes: noteBody,
      created_at: new Date().toISOString(),
    });
    return { oldQty, newQty };
  }

  writeOffExpired(inventoryId: number): number {
    const batch = this.rawBatches.find((b) => b.inventory_id === inventoryId);
    if (!batch || batch.quantity <= 0) return 0;
    const oldQty = batch.quantity;
    batch.quantity = 0;
    this.transactions.unshift({
      transaction_id: ++this.nextIds.tx,
      inventory_id: batch.inventory_id,
      medicine_id: batch.medicine_id,
      transaction_type: "EXPIRED",
      quantity_change: -oldQty,
      reference_type: "manual",
      reference_id: null,
      user_id: this.currentUserId,
      notes: `[Expired] Past expiration date (${batch.expiration_date}). Qty ${oldQty} -> 0`,
      created_at: new Date().toISOString(),
    });
    return oldQty;
  }

  getPrescriptions(): Prescription[] {
    return [...this.prescriptions]
      .map((rx) => ({
        ...rx,
        items: rx.items.map((item) => {
          const m = this.rawMedicines.find((x) => x.medicine_id === item.medicine_id);
          return {
            ...item,
            medicine_code: m?.medicine_code,
            medicine_name: m?.medicine_name,
            strength: m?.strength,
            dosage_form: m?.dosage_form,
          };
        }),
      }))
      .sort((a, b) => b.prescription_id - a.prescription_id);
  }

  createPrescription(payload: {
    prescription_no: string;
    patient_name: string;
    patient_contact: string | null;
    doctor_name: string;
    prescriber_license: string | null;
    prescription_date: string;
    notes: string | null;
    items: { medicine_id: number; quantity: number; dosage_instructions: string | null }[];
  }): number {
    if (
      this.prescriptions.some(
        (r) => r.prescription_no.toLowerCase() === payload.prescription_no.toLowerCase()
      )
    ) {
      throw new Error("A prescription with that number already exists.");
    }
    const rxId = ++this.nextIds.prescription;
    this.prescriptions.unshift({
      prescription_id: rxId,
      prescription_no: payload.prescription_no,
      patient_name: payload.patient_name,
      patient_contact: payload.patient_contact,
      doctor_name: payload.doctor_name,
      prescriber_license: payload.prescriber_license,
      prescription_date: payload.prescription_date,
      status: "Pending",
      notes: payload.notes,
      created_at: new Date().toISOString(),
      items: payload.items.map((i) => ({
        prescription_item_id: ++this.nextIds.rxItem,
        prescription_id: rxId,
        medicine_id: i.medicine_id,
        quantity: i.quantity,
        quantity_dispensed: 0,
        dosage_instructions: i.dosage_instructions,
      })),
    });
    return rxId;
  }

  cancelPrescription(prescriptionId: number): void {
    const rx = this.prescriptions.find((r) => r.prescription_id === prescriptionId);
    if (!rx || rx.status !== "Pending") {
      throw new Error("This prescription is no longer Pending, so it cannot be cancelled.");
    }
    rx.status = "Cancelled";
  }

  checkoutSale(payload: {
    items: { medicine_id: number; quantity: number }[];
    customer_name: string | null;
    prescription_id: number | null;
    discount: number;
    payment_method: PaymentMethod;
    amount_tendered: number | null;
    reference_no: string | null;
  }): number {
    const nowDate = todayIsoDate();
    const profile = this.getProfile();
    if (!payload.items.length) throw new Error("The cart is empty.");

    let rx: Prescription | undefined;
    if (payload.prescription_id != null) {
      rx = this.prescriptions.find(
        (r) => r.prescription_id === payload.prescription_id
      );
      if (!rx) throw new Error("Prescription not found.");
      if (rx.status === "Cancelled" || rx.status === "Fully Dispensed") {
        throw new Error(`Prescription ${rx.prescription_no} is already ${rx.status.toLowerCase()}.`);
      }
    }

    const saleItems: RawSale["items"] = [];
    let subtotal = 0;

    // Validate & collect FEFO deductions
    const plannedDeductions: { batch: RawBatch; take: number; med: RawMedicine }[] = [];

    for (const line of payload.items) {
      const med = this.rawMedicines.find((m) => m.medicine_id === line.medicine_id);
      if (!med) throw new Error("Medicine does not exist.");
      if (med.status !== "Active") throw new Error(`${med.medicine_name} is inactive.`);
      if (med.requires_prescription && !rx) {
        throw new Error(`${med.medicine_name} requires a prescription.`);
      }
      if (rx) {
        const rxi = rx.items.find((i) => i.medicine_id === line.medicine_id);
        if (!rxi) throw new Error(`${med.medicine_name} is not on prescription ${rx.prescription_no}.`);
        const left = rxi.quantity - rxi.quantity_dispensed;
        if (line.quantity > left) {
          throw new Error(
            `Cannot dispense ${line.quantity} x ${med.medicine_name}: only ${left} remaining.`
          );
        }
      }

      const eligibleBatches = this.rawBatches
        .filter(
          (b) =>
            b.medicine_id === line.medicine_id &&
            b.quantity > 0 &&
            b.expiration_date >= nowDate
        )
        .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date) || a.inventory_id - b.inventory_id);

      let remaining = line.quantity;
      for (const batch of eligibleBatches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.quantity);
        plannedDeductions.push({ batch, take, med });
        subtotal += take * batch.selling_price;
        remaining -= take;
      }

      if (remaining > 0) {
        const available = eligibleBatches.reduce((s, b) => s + b.quantity, 0);
        throw new Error(
          `Insufficient stock for ${med.medicine_name}: available ${available}, requested ${line.quantity}.`
        );
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const discount = Math.max(0, payload.discount || 0);
    if (discount > subtotal) throw new Error("Discount cannot exceed subtotal.");
    const total = Math.round((subtotal - discount) * 100) / 100;
    if (total <= 0) throw new Error("Sale total must be greater than zero.");

    const tendered =
      payload.payment_method === "Cash"
        ? (payload.amount_tendered ?? total)
        : total;
    if (payload.payment_method === "Cash" && tendered < total) {
      throw new Error(`Insufficient payment: total is ${total}, received ${tendered}.`);
    }

    // Apply mutations atomically
    const saleId = ++this.nextIds.sale;
    const saleNo = `SALE-${String(saleId).padStart(5, "0")}`;

    for (const d of plannedDeductions) {
      d.batch.quantity -= d.take;
      saleItems.push({
        medicine_id: d.med.medicine_id,
        inventory_id: d.batch.inventory_id,
        quantity: d.take,
        unit_price: d.batch.selling_price,
      });
      this.transactions.unshift({
        transaction_id: ++this.nextIds.tx,
        inventory_id: d.batch.inventory_id,
        medicine_id: d.med.medicine_id,
        transaction_type: "SALE",
        quantity_change: -d.take,
        reference_type: "sale",
        reference_id: saleId,
        user_id: profile?.id ?? null,
        notes: `Sold ${d.take} x ${d.med.medicine_name}`,
        created_at: new Date().toISOString(),
      });
    }

    if (rx) {
      for (const line of payload.items) {
        const rxi = rx.items.find((i) => i.medicine_id === line.medicine_id);
        if (rxi) rxi.quantity_dispensed += line.quantity;
      }
      const totalReq = rx.items.reduce((s, i) => s + i.quantity, 0);
      const totalDisp = rx.items.reduce((s, i) => s + i.quantity_dispensed, 0);
      rx.status =
        totalDisp === 0
          ? "Pending"
          : totalDisp >= totalReq
            ? "Fully Dispensed"
            : "Partially Dispensed";
    }

    this.sales.unshift({
      sale_id: saleId,
      sale_no: saleNo,
      prescription_id: payload.prescription_id,
      user_id: profile?.id ?? null,
      cashier_name: profile?.full_name || profile?.email || "Staff",
      customer_name: payload.customer_name?.trim() || rx?.patient_name || "Walk-in Customer",
      sale_date: new Date().toISOString(),
      subtotal,
      discount,
      total_amount: total,
      status: "Completed",
      items: saleItems,
      payments: [
        {
          payment_id: ++this.nextIds.payment,
          payment_method: payload.payment_method,
          amount: total,
          amount_tendered: tendered,
          change_amount: Math.round((tendered - total) * 100) / 100,
          reference_no: payload.reference_no,
        },
      ],
    });

    return saleId;
  }

  getSales(limit = 50): SaleSummary[] {
    return this.sales.slice(0, limit).map((s) => {
      const rx = s.prescription_id
        ? this.prescriptions.find((r) => r.prescription_id === s.prescription_id)
        : null;
      return {
        sale_id: s.sale_id,
        sale_no: s.sale_no,
        sale_date: s.sale_date,
        customer_name: s.customer_name,
        cashier_name: s.cashier_name,
        prescription_no: rx?.prescription_no ?? null,
        subtotal: s.subtotal,
        discount: s.discount,
        total_amount: s.total_amount,
        status: s.status,
        payment_methods: [...new Set(s.payments.map((p) => p.payment_method))],
      };
    });
  }

  getSaleReceipt(saleId: number): SaleReceipt {
    const s = this.sales.find((x) => x.sale_id === saleId);
    if (!s) throw new Error("Sale not found.");
    const rx = s.prescription_id
      ? this.prescriptions.find((r) => r.prescription_id === s.prescription_id)
      : null;
    return {
      sale_id: s.sale_id,
      sale_no: s.sale_no,
      sale_date: s.sale_date,
      customer_name: s.customer_name,
      cashier_name: s.cashier_name,
      prescription_no: rx?.prescription_no ?? null,
      subtotal: s.subtotal,
      discount: s.discount,
      total_amount: s.total_amount,
      status: s.status,
      payment_methods: [...new Set(s.payments.map((p) => p.payment_method))],
      items: s.items.map((i) => {
        const m = this.rawMedicines.find((x) => x.medicine_id === i.medicine_id);
        return {
          medicine_id: i.medicine_id,
          medicine_name: m?.medicine_name ?? "Medicine",
          strength: m?.strength ?? null,
          quantity: i.quantity,
          unit_price: i.unit_price,
        };
      }),
      payments: s.payments,
    };
  }

  getDashboardSummary(): DashboardSummary {
    const now = todayIsoDate();
    const todaysSales = this.sales.filter(
      (s) => s.status === "Completed" && s.sale_date.slice(0, 10) === now
    );
    const batches = this.getInventoryBatches();
    const meds = this.getMedicines().filter((m) => m.status === "Active");
    return {
      todays_sales: todaysSales.reduce((sum, s) => sum + s.total_amount, 0),
      todays_transactions: todaysSales.length,
      total_medicines: meds.length,
      low_stock: meds.filter((m) => m.is_low_stock).length,
      expiring_soon_batches: batches.filter(
        (b) => b.quantity > 0 && b.expiry_status === "Expiring Soon"
      ).length,
      expired_batches: batches.filter(
        (b) => b.quantity > 0 && b.expiry_status === "Expired"
      ).length,
      pending_prescriptions: this.prescriptions.filter((r) =>
        ["Pending", "Partially Dispensed"].includes(r.status)
      ).length,
    };
  }

  getUsers(): ManagedUser[] {
    return [...this.users].sort((a, b) => a.email.localeCompare(b.email));
  }

  createUser(payload: {
    email: string;
    full_name: string;
    role: UserRole;
  }): void {
    const clean = payload.email.trim().toLowerCase();
    if (this.users.some((u) => u.email.toLowerCase() === clean)) {
      throw new Error("That email is already registered.");
    }
    this.users.push({
      user_id: `u-${Date.now()}`,
      email: clean,
      full_name: payload.full_name.trim(),
      role: payload.role,
      status: "Active",
    });
  }

  updateUser(
    userId: string,
    payload: { full_name: string; role?: UserRole; status?: AccountStatus }
  ): void {
    const u = this.users.find((x) => x.user_id === userId);
    if (!u) throw new Error("User not found.");
    u.full_name = payload.full_name.trim();
    if (payload.role) u.role = payload.role;
    if (payload.status) u.status = payload.status;
  }

  runReport(reportId: string, from: string, to: string): ReportOutput {
    const inRange = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
    const completedSales = this.sales.filter(
      (s) => s.status === "Completed" && inRange(s.sale_date)
    );

    switch (reportId) {
      case "daily-sales": {
        const byDay = new Map<string, { tx: number; total: number }>();
        for (const s of completedSales) {
          const day = s.sale_date.slice(0, 10);
          const cur = byDay.get(day) ?? { tx: 0, total: 0 };
          cur.tx += 1;
          cur.total += s.total_amount;
          byDay.set(day, cur);
        }
        const rows = [...byDay.entries()].map(([day, v]) => ({
          sale_day: day,
          transactions: v.tx,
          total_sales: v.total,
        }));
        return {
          columns: [
            { key: "sale_day", label: "Date", type: "date" },
            { key: "transactions", label: "Transactions", type: "int" },
            { key: "total_sales", label: "Total Sales", type: "money" },
          ],
          rows,
          totals: {
            sale_day: "Total",
            transactions: rows.reduce((s, r) => s + Number(r.transactions), 0),
            total_sales: rows.reduce((s, r) => s + Number(r.total_sales), 0),
          },
        };
      }
      case "sales-by-medicine": {
        const map = new Map<number, { code: string; name: string; units: number; rev: number }>();
        for (const s of completedSales) {
          for (const item of s.items) {
            const m = this.rawMedicines.find((x) => x.medicine_id === item.medicine_id);
            const cur = map.get(item.medicine_id) ?? {
              code: m?.medicine_code ?? "",
              name: m ? `${m.medicine_name}${m.strength ? " " + m.strength : ""}` : "Unknown",
              units: 0,
              rev: 0,
            };
            cur.units += item.quantity;
            cur.rev += item.quantity * item.unit_price;
            map.set(item.medicine_id, cur);
          }
        }
        const rows = [...map.values()].map((v) => ({
          medicine_code: v.code,
          medicine: v.name,
          units_sold: v.units,
          revenue: v.rev,
        }));
        return {
          columns: [
            { key: "medicine_code", label: "Code" },
            { key: "medicine", label: "Medicine" },
            { key: "units_sold", label: "Units Sold", type: "int" },
            { key: "revenue", label: "Revenue", type: "money" },
          ],
          rows,
          totals: {
            medicine_code: "Total",
            medicine: "",
            units_sold: rows.reduce((s, r) => s + Number(r.units_sold), 0),
            revenue: rows.reduce((s, r) => s + Number(r.revenue), 0),
          },
        };
      }
      case "sales-by-cashier": {
        const map = new Map<string, { tx: number; total: number }>();
        for (const s of completedSales) {
          const name = s.cashier_name || "Staff";
          const cur = map.get(name) ?? { tx: 0, total: 0 };
          cur.tx += 1;
          cur.total += s.total_amount;
          map.set(name, cur);
        }
        const rows = [...map.entries()].map(([cashier, v]) => ({
          cashier,
          transactions: v.tx,
          total_sales: v.total,
        }));
        return {
          columns: [
            { key: "cashier", label: "Cashier" },
            { key: "transactions", label: "Transactions", type: "int" },
            { key: "total_sales", label: "Total Sales", type: "money" },
          ],
          rows,
          totals: {
            cashier: "Total",
            transactions: rows.reduce((s, r) => s + Number(r.transactions), 0),
            total_sales: rows.reduce((s, r) => s + Number(r.total_sales), 0),
          },
        };
      }
      case "payment-summary": {
        const map = new Map<string, { tx: number; total: number }>();
        for (const s of completedSales) {
          for (const p of s.payments) {
            const cur = map.get(p.payment_method) ?? { tx: 0, total: 0 };
            cur.tx += 1;
            cur.total += p.amount;
            map.set(p.payment_method, cur);
          }
        }
        const rows = [...map.entries()].map(([method, v]) => ({
          payment_method: method,
          transactions: v.tx,
          total_amount: v.total,
        }));
        return {
          columns: [
            { key: "payment_method", label: "Method" },
            { key: "transactions", label: "Transactions", type: "int" },
            { key: "total_amount", label: "Amount", type: "money" },
          ],
          rows,
          totals: {
            payment_method: "Total",
            transactions: rows.reduce((s, r) => s + Number(r.transactions), 0),
            total_amount: rows.reduce((s, r) => s + Number(r.total_amount), 0),
          },
        };
      }
      case "inventory-stock": {
        const rows = this.getMedicines()
          .filter((m) => m.status === "Active")
          .map((m) => ({
            medicine_code: m.medicine_code,
            medicine: `${m.medicine_name}${m.strength ? " " + m.strength : ""}`,
            category: m.category_name ?? "—",
            quantity_on_hand: m.quantity_on_hand,
            reorder_level: m.reorder_level,
            unit_price: m.unit_price,
          }));
        return {
          columns: [
            { key: "medicine_code", label: "Code" },
            { key: "medicine", label: "Medicine" },
            { key: "category", label: "Category" },
            { key: "quantity_on_hand", label: "On Hand", type: "int" },
            { key: "reorder_level", label: "Reorder Level", type: "int" },
            { key: "unit_price", label: "Unit Price", type: "money" },
          ],
          rows,
          totals: {
            medicine_code: "Total",
            medicine: "",
            category: "",
            quantity_on_hand: rows.reduce((s, r) => s + Number(r.quantity_on_hand), 0),
            reorder_level: "",
            unit_price: "",
          },
        };
      }
      case "low-stock": {
        const rows = this.getLowStock().map((l) => ({
          medicine_code: l.medicine_code,
          medicine: `${l.medicine_name}${l.strength ? " " + l.strength : ""}`,
          category: l.category_name ?? "—",
          quantity_on_hand: l.quantity_on_hand,
          reorder_level: l.reorder_level,
          suggested_reorder_qty: l.suggested_reorder_qty,
        }));
        return {
          columns: [
            { key: "medicine_code", label: "Code" },
            { key: "medicine", label: "Medicine" },
            { key: "category", label: "Category" },
            { key: "quantity_on_hand", label: "On Hand", type: "int" },
            { key: "reorder_level", label: "Reorder Level", type: "int" },
            { key: "suggested_reorder_qty", label: "Suggested Reorder", type: "int" },
          ],
          rows,
        };
      }
      case "stock-in": {
        const rows = this.purchases
          .filter((p) => p.status !== "Cancelled" && inRange(p.purchase_date))
          .map((p) => {
            const sup = this.suppliers.find((s) => s.supplier_id === p.supplier_id);
            const med = this.rawMedicines.find((m) => m.medicine_id === p.medicine_id);
            return {
              purchase_no: p.purchase_no,
              purchase_date: p.purchase_date,
              supplier: sup?.supplier_name ?? "—",
              medicine: med ? `${med.medicine_name}${med.strength ? " " + med.strength : ""}` : "—",
              batch_number: p.batch_number,
              quantity: p.quantity,
              line_total: p.quantity * p.unit_cost,
            };
          });
        return {
          columns: [
            { key: "purchase_no", label: "PO No." },
            { key: "purchase_date", label: "Date", type: "date" },
            { key: "supplier", label: "Supplier" },
            { key: "medicine", label: "Medicine" },
            { key: "batch_number", label: "Batch" },
            { key: "quantity", label: "Quantity", type: "int" },
            { key: "line_total", label: "Cost Total", type: "money" },
          ],
          rows,
          totals: {
            purchase_no: "Total",
            purchase_date: "",
            supplier: "",
            medicine: "",
            batch_number: "",
            quantity: rows.reduce((s, r) => s + Number(r.quantity), 0),
            line_total: rows.reduce((s, r) => s + Number(r.line_total), 0),
          },
        };
      }
      case "expiration": {
        const rows = this.getInventoryBatches()
          .filter((b) => b.quantity > 0)
          .map((b) => ({
            medicine: `${b.medicine_code} · ${b.medicine_name}${b.strength ? " " + b.strength : ""}`,
            batch_number: b.batch_number,
            quantity: b.quantity,
            expiration_date: b.expiration_date,
            expiry_status: b.expiry_status,
          }));
        return {
          columns: [
            { key: "medicine", label: "Medicine" },
            { key: "batch_number", label: "Batch" },
            { key: "quantity", label: "Quantity", type: "int" },
            { key: "expiration_date", label: "Expiration", type: "date" },
            { key: "expiry_status", label: "Status" },
          ],
          rows,
          totals: {
            medicine: "Total",
            batch_number: "",
            quantity: rows.reduce((s, r) => s + Number(r.quantity), 0),
            expiration_date: "",
            expiry_status: "",
          },
        };
      }
      case "prescriptions":
      default: {
        const rows = this.getPrescriptions()
          .filter((rx) => inRange(rx.prescription_date))
          .flatMap((rx) =>
            rx.items.map((item) => ({
              prescription_no: rx.prescription_no,
              prescription_date: rx.prescription_date,
              patient_name: rx.patient_name,
              medicine: `${item.medicine_name ?? ""}${item.strength ? " " + item.strength : ""}`,
              quantity: item.quantity,
              dispensed: item.quantity_dispensed,
              remaining: item.quantity - item.quantity_dispensed,
              status: rx.status,
            }))
          );
        return {
          columns: [
            { key: "prescription_no", label: "Rx No." },
            { key: "prescription_date", label: "Date", type: "date" },
            { key: "patient_name", label: "Patient" },
            { key: "medicine", label: "Medicine" },
            { key: "quantity", label: "Prescribed", type: "int" },
            { key: "dispensed", label: "Dispensed", type: "int" },
            { key: "remaining", label: "Remaining", type: "int" },
            { key: "status", label: "Status" },
          ],
          rows,
        };
      }
    }
  }
}

export const sandboxDb = new SandboxDatabase();
