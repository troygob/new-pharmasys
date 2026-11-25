import { cachedQuery, clearAllCache, invalidateCache } from "./queryCache";
import { normalizeRole } from "./rbac";
import { sandboxDb } from "./sandboxDb";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type {
  AccountStatus,
  Category,
  DashboardSummary,
  InventoryBatch,
  InventoryTransaction,
  InventoryTransactionType,
  LowStockItem,
  ManagedUser,
  Medicine,
  MedicineSupplierLink,
  PaymentMethod,
  PharmacySettings,
  Prescription,
  ReportOutput,
  SaleReceipt,
  SaleSummary,
  Supplier,
  UserProfile,
  UserRole,
} from "../types/pharmacy";

export const api = {
  isLiveSupabase: isSupabaseConfigured,

  async getSessionProfile(): Promise<UserProfile | null> {
    if (!supabase) return sandboxDb.getProfile();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const client = supabase;
    return cachedQuery(
      `profile:${session.user.id}`,
      async () => {
        const { data, error } = await client
          .from("users")
          .select("full_name, role, status")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) {
          return {
            id: session.user.id,
            email: session.user.email ?? "",
            full_name: null,
            role: null,
            status: "Inactive" as AccountStatus,
          };
        }
        return {
          id: session.user.id,
          email: session.user.email ?? "",
          full_name: data.full_name ?? null,
          role: normalizeRole(data.role),
          status: (data.status as AccountStatus) ?? "Inactive",
        };
      },
      60_000
    );
  },

  async signIn(email: string, password: string): Promise<UserProfile> {
    clearAllCache();
    if (!supabase) return sandboxDb.signIn(email, password);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await this.getSessionProfile();
    if (!profile || profile.status !== "Active") {
      await supabase.auth.signOut();
      throw new Error("This account is inactive. Contact an administrator.");
    }
    return profile;
  },

  async signInDemoRole(role: UserRole): Promise<UserProfile> {
    clearAllCache();
    return sandboxDb.signInAsRole(role);
  },

  async signOut(): Promise<void> {
    clearAllCache();
    if (!supabase) {
      sandboxDb.signOut();
      return;
    }
    await supabase.auth.signOut();
  },

  async updatePassword(newPassword: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  async getSettings(): Promise<PharmacySettings> {
    if (!supabase) return sandboxDb.getSettings();
    const client = supabase;
    return cachedQuery(
      "settings",
      async () => {
        const { data, error } = await client
          .from("settings")
          .select("key, value");
        if (error) throw new Error(error.message);
        const map: Record<string, string> = {};
        for (const row of data ?? []) {
          map[row.key] = row.value ?? "";
        }
        return {
          pharmacy_name: map.pharmacy_name || "PharmaSys Pharmacy",
          pharmacy_address: map.pharmacy_address || "",
          receipt_footer: map.receipt_footer || "THANK YOU!",
          expiring_soon_days: Math.max(1, Number(map.expiring_soon_days) || 30),
        };
      },
      120_000
    );
  },

  async updateSettings(patch: Partial<PharmacySettings>): Promise<PharmacySettings> {
    invalidateCache("settings", "dashboard", "inventory");
    if (!supabase) return sandboxDb.updateSettings(patch);
    const entries = Object.entries(patch).map(([key, val]) => ({
      key,
      value: String(val ?? ""),
    }));
    for (const item of entries) {
      const { error } = await supabase
        .from("settings")
        .upsert(item, { onConflict: "key" });
      if (error) throw new Error(error.message);
    }
    return this.getSettings();
  },

  async getDashboard(): Promise<DashboardSummary> {
    if (!supabase) return sandboxDb.getDashboardSummary();
    const client = supabase;
    return cachedQuery(
      "dashboard",
      async () => {
        const { data, error } = await client
          .from("v_dashboard")
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as DashboardSummary;
      },
      15_000
    );
  },

  async getCategories(): Promise<Category[]> {
    if (!supabase) return sandboxDb.getCategories();
    const client = supabase;
    return cachedQuery(
      "categories",
      async () => {
        // Optimized single query using embedded count instead of loading all medicine rows
        const { data, error } = await client
          .from("categories")
          .select("category_id, category_name, description, status, medicines(count)")
          .order("category_name", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: Record<string, unknown>) => {
          const meds = row.medicines as { count: number }[] | undefined;
          return {
            category_id: Number(row.category_id),
            category_name: String(row.category_name),
            description: (row.description as string | null) ?? null,
            status: (row.status as AccountStatus) ?? "Active",
            medicine_count: meds?.[0]?.count ?? 0,
          };
        });
      },
      60_000
    );
  },

  async saveCategory(payload: {
    category_id?: number;
    category_name: string;
    description: string | null;
  }): Promise<void> {
    invalidateCache("categories", "medicines");
    if (!supabase) {
      sandboxDb.saveCategory(payload);
      return;
    }
    const record = {
      category_name: payload.category_name.trim(),
      description: payload.description?.trim() || null,
    };
    const { error } = payload.category_id
      ? await supabase
          .from("categories")
          .update(record)
          .eq("category_id", payload.category_id)
      : await supabase.from("categories").insert(record);
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "A category with that name already exists."
          : error.message
      );
    }
  },

  async toggleCategoryStatus(id: number, currentStatus: AccountStatus): Promise<void> {
    invalidateCache("categories");
    if (!supabase) {
      sandboxDb.toggleCategoryStatus(id);
      return;
    }
    const next = currentStatus === "Active" ? "Inactive" : "Active";
    const { error } = await supabase
      .from("categories")
      .update({ status: next })
      .eq("category_id", id);
    if (error) throw new Error(error.message);
  },

  async getMedicines(): Promise<Medicine[]> {
    if (!supabase) return sandboxDb.getMedicines();
    const client = supabase;
    return cachedQuery(
      "medicines",
      async () => {
        const { data, error } = await client
          .from("v_medicine_stock")
          .select(
            "medicine_id, medicine_code, medicine_name, generic_name, category_id, category_name, dosage_form, strength, unit_price, reorder_level, requires_prescription, status, quantity_on_hand, nearest_expiry, is_low_stock"
          )
          .order("medicine_name", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as Medicine[];
      },
      20_000
    );
  },

  async getMedicineBatches(medicineId: number): Promise<InventoryBatch[]> {
    if (!supabase) {
      return sandboxDb
        .getInventoryBatches()
        .filter((b) => b.medicine_id === medicineId);
    }
    const { data, error } = await supabase
      .from("v_inventory_batches")
      .select("*")
      .eq("medicine_id", medicineId)
      .order("expiration_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as InventoryBatch[];
  },

  async saveMedicine(payload: {
    medicine_id?: number;
    medicine_code: string;
    medicine_name: string;
    generic_name: string | null;
    category_id: number | null;
    dosage_form: string;
    strength: string | null;
    unit_price: number;
    reorder_level: number;
    requires_prescription: boolean;
    opening_stock?: {
      quantity: number;
      batch_number: string;
      purchase_price: number;
      expiration_date: string;
    };
  }): Promise<void> {
    invalidateCache("medicines", "categories", "inventory", "dashboard");
    if (!supabase) {
      sandboxDb.saveMedicine(payload);
      return;
    }
    const record = {
      medicine_code: payload.medicine_code.trim(),
      medicine_name: payload.medicine_name.trim(),
      generic_name: payload.generic_name?.trim() || null,
      category_id: payload.category_id || null,
      dosage_form: payload.dosage_form,
      strength: payload.strength?.trim() || null,
      unit_price: payload.unit_price,
      reorder_level: payload.reorder_level,
      requires_prescription: payload.requires_prescription,
    };

    if (payload.medicine_id) {
      const { error } = await supabase
        .from("medicines")
        .update(record)
        .eq("medicine_id", payload.medicine_id);
      if (error) throw new Error(error.message);
      return;
    }

    const { data: created, error } = await supabase
      .from("medicines")
      .insert(record)
      .select("medicine_id")
      .single();
    if (error) throw new Error(error.message);

    if (payload.opening_stock && payload.opening_stock.quantity > 0) {
      const profile = await this.getSessionProfile();
      const { data: batch, error: invErr } = await supabase
        .from("inventory")
        .insert({
          medicine_id: created.medicine_id,
          batch_number: payload.opening_stock.batch_number.trim() || "INITIAL",
          quantity: payload.opening_stock.quantity,
          purchase_price: payload.opening_stock.purchase_price,
          selling_price: payload.unit_price,
          expiration_date: payload.opening_stock.expiration_date,
        })
        .select("inventory_id")
        .single();
      if (invErr) throw new Error(invErr.message);

      await supabase.from("inventory_transactions").insert({
        inventory_id: batch.inventory_id,
        medicine_id: created.medicine_id,
        transaction_type: "ADJUSTMENT",
        quantity_change: payload.opening_stock.quantity,
        reference_type: "manual",
        user_id: profile?.id,
        notes: "Opening stock added from Medicines catalog",
      });
    }
  },

  async toggleMedicineStatus(id: number, currentStatus: AccountStatus): Promise<void> {
    invalidateCache("medicines", "categories", "dashboard");
    if (!supabase) {
      sandboxDb.toggleMedicineStatus(id);
      return;
    }
    const next = currentStatus === "Active" ? "Inactive" : "Active";
    const { error } = await supabase
      .from("medicines")
      .update({ status: next })
      .eq("medicine_id", id);
    if (error) throw new Error(error.message);
  },

  async getSuppliers(): Promise<Supplier[]> {
    if (!supabase) return sandboxDb.getSuppliers();
    const client = supabase;
    return cachedQuery(
      "suppliers",
      async () => {
        const { data, error } = await client
          .from("suppliers")
          .select("supplier_id, supplier_code, supplier_name, contact_person, contact_no, email, address, status")
          .order("supplier_name", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as Supplier[];
      },
      60_000
    );
  },

  async saveSupplier(
    payload: Omit<Supplier, "supplier_id" | "status"> & { supplier_id?: number }
  ): Promise<void> {
    invalidateCache("suppliers", "med-suppliers");
    if (!supabase) {
      sandboxDb.saveSupplier(payload);
      return;
    }
    const record = {
      supplier_code: payload.supplier_code.trim().toUpperCase(),
      supplier_name: payload.supplier_name.trim(),
      contact_person: payload.contact_person?.trim() || null,
      contact_no: payload.contact_no?.trim() || null,
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
    };
    const { error } = payload.supplier_id
      ? await supabase
          .from("suppliers")
          .update(record)
          .eq("supplier_id", payload.supplier_id)
      : await supabase.from("suppliers").insert(record);
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "A supplier with that code already exists."
          : error.message
      );
    }
  },

  async toggleSupplierStatus(id: number, currentStatus: AccountStatus): Promise<void> {
    invalidateCache("suppliers", "med-suppliers");
    if (!supabase) {
      sandboxDb.toggleSupplierStatus(id);
      return;
    }
    const next = currentStatus === "Active" ? "Inactive" : "Active";
    const { error } = await supabase
      .from("suppliers")
      .update({ status: next })
      .eq("supplier_id", id);
    if (error) throw new Error(error.message);
  },

  async getMedicineSuppliers(): Promise<MedicineSupplierLink[]> {
    if (!supabase) return sandboxDb.getMedicineSuppliers();
    const client = supabase;
    return cachedQuery(
      "med-suppliers",
      async () => {
        const { data, error } = await client
          .from("medicine_suppliers")
          .select(
            "medicine_supplier_id, medicine_id, supplier_id, purchase_price, medicines(medicine_code, medicine_name, strength), suppliers(supplier_code, supplier_name, status)"
          )
          .order("medicine_supplier_id", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: Record<string, unknown>) => {
          const med = row.medicines as Record<string, unknown> | null;
          const sup = row.suppliers as Record<string, unknown> | null;
          return {
            medicine_supplier_id: Number(row.medicine_supplier_id),
            medicine_id: Number(row.medicine_id),
            supplier_id: Number(row.supplier_id),
            purchase_price: Number(row.purchase_price),
            medicine_code: med?.medicine_code as string | undefined,
            medicine_name: med?.medicine_name as string | undefined,
            strength: (med?.strength as string | null) ?? null,
            supplier_code: sup?.supplier_code as string | undefined,
            supplier_name: sup?.supplier_name as string | undefined,
            supplier_status: sup?.status as AccountStatus | undefined,
          };
        });
      },
      30_000
    );
  },

  async saveMedicineSupplier(payload: {
    medicine_supplier_id?: number;
    medicine_id: number;
    supplier_id: number;
    purchase_price: number;
  }): Promise<void> {
    invalidateCache("med-suppliers");
    if (!supabase) {
      sandboxDb.saveMedicineSupplier(payload);
      return;
    }
    const { error } = payload.medicine_supplier_id
      ? await supabase
          .from("medicine_suppliers")
          .update({ purchase_price: payload.purchase_price })
          .eq("medicine_supplier_id", payload.medicine_supplier_id)
      : await supabase.from("medicine_suppliers").insert({
          medicine_id: payload.medicine_id,
          supplier_id: payload.supplier_id,
          purchase_price: payload.purchase_price,
        });
    if (error) {
      throw new Error(
        error.code === "23505"
          ? 'That supplier is already assigned to this medicine. Use "Edit price" instead.'
          : error.message
      );
    }
  },

  async removeMedicineSupplier(id: number): Promise<void> {
    invalidateCache("med-suppliers");
    if (!supabase) {
      sandboxDb.removeMedicineSupplier(id);
      return;
    }
    const { error } = await supabase
      .from("medicine_suppliers")
      .delete()
      .eq("medicine_supplier_id", id);
    if (error) throw new Error(error.message);
  },

  async getInventoryBatches(): Promise<InventoryBatch[]> {
    if (!supabase) return sandboxDb.getInventoryBatches();
    const client = supabase;
    return cachedQuery(
      "inventory:batches",
      async () => {
        const { data, error } = await client
          .from("v_inventory_batches")
          .select("*")
          .order("expiration_date", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as InventoryBatch[];
      },
      20_000
    );
  },

  async getLowStock(): Promise<LowStockItem[]> {
    if (!supabase) return sandboxDb.getLowStock();
    const client = supabase;
    return cachedQuery(
      "inventory:low",
      async () => {
        const { data, error } = await client
          .from("v_low_stock")
          .select("*")
          .order("medicine_name", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as LowStockItem[];
      },
      20_000
    );
  },

  async getInventoryTransactions(limit = 200): Promise<InventoryTransaction[]> {
    if (!supabase) return sandboxDb.getInventoryTransactions(limit);
    const client = supabase;
    return cachedQuery(
      `inventory:tx:${limit}`,
      async () => {
        const { data, error } = await client
          .from("inventory_transactions")
          .select(
            "transaction_id, inventory_id, medicine_id, transaction_type, quantity_change, reference_type, reference_id, user_id, notes, created_at, medicines(medicine_code, medicine_name, strength), inventory(batch_number)"
          )
          .order("transaction_id", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: Record<string, unknown>) => {
          const med = row.medicines as Record<string, unknown> | null;
          const inv = row.inventory as Record<string, unknown> | null;
          return {
            transaction_id: Number(row.transaction_id),
            inventory_id: Number(row.inventory_id),
            medicine_id: Number(row.medicine_id),
            transaction_type: row.transaction_type as InventoryTransactionType,
            quantity_change: Number(row.quantity_change),
            reference_type: (row.reference_type as string | null) ?? null,
            reference_id: row.reference_id ? Number(row.reference_id) : null,
            user_id: (row.user_id as string | null) ?? null,
            notes: (row.notes as string | null) ?? null,
            created_at: String(row.created_at),
            medicine_code: med?.medicine_code as string | undefined,
            medicine_name: med?.medicine_name as string | undefined,
            strength: (med?.strength as string | null) ?? null,
            batch_number: inv?.batch_number as string | undefined,
          };
        });
      },
      15_000
    );
  },

  async receiveStock(payload: {
    supplier_id: number;
    medicine_id: number;
    batch_number: string;
    quantity: number;
    purchase_price: number;
    selling_price: number;
    expiration_date: string;
  }): Promise<string> {
    invalidateCache("inventory", "medicines", "dashboard");
    if (!supabase) return sandboxDb.receiveStock(payload);

    const profile = await this.getSessionProfile();
    const suppliers = await this.getSuppliers();
    const supplier = suppliers.find((s) => s.supplier_id === payload.supplier_id);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const poNo = `PO-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const { data: purchase, error: pErr } = await supabase
      .from("purchases")
      .insert({
        purchase_no: poNo,
        supplier_id: payload.supplier_id,
        user_id: profile?.id,
        total_amount: payload.quantity * payload.purchase_price,
        status: "Received",
        notes: "Received via Inventory Stock-In",
      })
      .select("purchase_id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: piErr } = await supabase.from("purchase_items").insert({
      purchase_id: purchase.purchase_id,
      medicine_id: payload.medicine_id,
      batch_number: payload.batch_number,
      quantity: payload.quantity,
      unit_cost: payload.purchase_price,
      expiration_date: payload.expiration_date,
    });
    if (piErr) {
      await supabase
        .from("purchases")
        .update({ status: "Cancelled", notes: piErr.message })
        .eq("purchase_id", purchase.purchase_id);
      throw new Error(piErr.message);
    }

    const { data: existing } = await supabase
      .from("inventory")
      .select("inventory_id, quantity")
      .eq("medicine_id", payload.medicine_id)
      .eq("batch_number", payload.batch_number)
      .maybeSingle();

    let inventoryId: number;
    if (existing) {
      const { error } = await supabase
        .from("inventory")
        .update({
          quantity: existing.quantity + payload.quantity,
          purchase_price: payload.purchase_price,
          selling_price: payload.selling_price,
          expiration_date: payload.expiration_date,
        })
        .eq("inventory_id", existing.inventory_id);
      if (error) throw new Error(error.message);
      inventoryId = existing.inventory_id;
    } else {
      const { data: created, error } = await supabase
        .from("inventory")
        .insert({
          medicine_id: payload.medicine_id,
          batch_number: payload.batch_number,
          quantity: payload.quantity,
          purchase_price: payload.purchase_price,
          selling_price: payload.selling_price,
          expiration_date: payload.expiration_date,
        })
        .select("inventory_id")
        .single();
      if (error) throw new Error(error.message);
      inventoryId = created.inventory_id;
    }

    const { error: txErr } = await supabase.from("inventory_transactions").insert({
      inventory_id: inventoryId,
      medicine_id: payload.medicine_id,
      transaction_type: "STOCK_IN",
      quantity_change: payload.quantity,
      reference_type: "purchase",
      reference_id: purchase.purchase_id,
      user_id: profile?.id,
      notes: `Received from ${supplier?.supplier_name ?? "Supplier"} (${supplier?.supplier_code ?? ""}) @ ${payload.purchase_price.toFixed(2)} - ${poNo}`,
    });
    if (txErr) throw new Error(txErr.message);
    return poNo;
  },

  async adjustStock(payload: {
    inventory_id: number;
    medicine_id: number;
    transaction_type: "ADJUSTMENT" | "DAMAGED" | "EXPIRED" | "RETURN";
    label: string;
    quantity_change: number;
    reason: string;
    remarks?: string;
  }): Promise<{ oldQty: number; newQty: number }> {
    invalidateCache("inventory", "medicines", "dashboard");
    if (!supabase) return sandboxDb.adjustStock(payload);

    const profile = await this.getSessionProfile();
    const { data: fresh, error: readErr } = await supabase
      .from("inventory")
      .select("quantity")
      .eq("inventory_id", payload.inventory_id)
      .single();
    if (readErr) throw new Error(readErr.message);

    const oldQty = fresh.quantity as number;
    const newQty = oldQty + payload.quantity_change;
    if (newQty < 0) {
      throw new Error(`Stock changed: only ${oldQty} units remain in this batch.`);
    }

    const { data: updated, error: upErr } = await supabase
      .from("inventory")
      .update({ quantity: newQty })
      .eq("inventory_id", payload.inventory_id)
      .eq("quantity", oldQty)
      .select("inventory_id");
    if (upErr) throw new Error(upErr.message);
    if (!updated?.length) {
      throw new Error("Batch quantity was updated by someone else. Please refresh and retry.");
    }

    const notes = `[${payload.label}] ${payload.reason}${payload.remarks ? ` - ${payload.remarks}` : ""}. Qty ${oldQty} -> ${newQty}`;
    const { error: txErr } = await supabase.from("inventory_transactions").insert({
      inventory_id: payload.inventory_id,
      medicine_id: payload.medicine_id,
      transaction_type: payload.transaction_type,
      quantity_change: payload.quantity_change,
      reference_type: "manual",
      user_id: profile?.id,
      notes,
    });
    if (txErr) {
      await supabase
        .from("inventory")
        .update({ quantity: oldQty })
        .eq("inventory_id", payload.inventory_id)
        .eq("quantity", newQty);
      throw new Error(txErr.message);
    }
    return { oldQty, newQty };
  },

  async writeOffExpired(batch: InventoryBatch): Promise<number> {
    invalidateCache("inventory", "medicines", "dashboard");
    if (!supabase) return sandboxDb.writeOffExpired(batch.inventory_id);
    const res = await this.adjustStock({
      inventory_id: batch.inventory_id,
      medicine_id: batch.medicine_id,
      transaction_type: "EXPIRED",
      label: "Expired",
      quantity_change: -batch.quantity,
      reason: `Past expiration date (${batch.expiration_date})`,
    });
    return res.oldQty;
  },

  async getPrescriptions(): Promise<Prescription[]> {
    if (!supabase) return sandboxDb.getPrescriptions();
    const client = supabase;
    return cachedQuery(
      "prescriptions",
      async () => {
        const { data, error } = await client
          .from("prescriptions")
          .select(
            "prescription_id, prescription_no, patient_name, patient_contact, doctor_name, prescriber_license, prescription_date, status, notes, created_at, prescription_items(prescription_item_id, medicine_id, quantity, quantity_dispensed, dosage_instructions, medicines(medicine_code, medicine_name, strength, dosage_form))"
          )
          .order("prescription_date", { ascending: false })
          .order("prescription_id", { ascending: false })
          .limit(150);
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: Record<string, unknown>) => ({
          prescription_id: Number(row.prescription_id),
          prescription_no: String(row.prescription_no),
          patient_name: String(row.patient_name),
          patient_contact: (row.patient_contact as string | null) ?? null,
          doctor_name: String(row.doctor_name),
          prescriber_license: (row.prescriber_license as string | null) ?? null,
          prescription_date: String(row.prescription_date),
          status: row.status as Prescription["status"],
          notes: (row.notes as string | null) ?? null,
          created_at: row.created_at as string | undefined,
          items: ((row.prescription_items as Record<string, unknown>[]) ?? []).map(
            (i) => {
              const med = i.medicines as Record<string, unknown> | null;
              return {
                prescription_item_id: Number(i.prescription_item_id),
                prescription_id: Number(row.prescription_id),
                medicine_id: Number(i.medicine_id),
                medicine_code: med?.medicine_code as string | undefined,
                medicine_name: med?.medicine_name as string | undefined,
                strength: (med?.strength as string | null) ?? null,
                dosage_form: med?.dosage_form as string | undefined,
                quantity: Number(i.quantity),
                quantity_dispensed: Number(i.quantity_dispensed),
                dosage_instructions: (i.dosage_instructions as string | null) ?? null,
              };
            }
          ),
        }));
      },
      20_000
    );
  },

  async createPrescription(payload: {
    prescription_no: string;
    patient_name: string;
    patient_contact: string | null;
    doctor_name: string;
    prescriber_license: string | null;
    prescription_date: string;
    notes: string | null;
    items: { medicine_id: number; quantity: number; dosage_instructions: string | null }[];
  }): Promise<number> {
    invalidateCache("prescriptions", "dashboard");
    if (!supabase) return sandboxDb.createPrescription(payload);

    const profile = await this.getSessionProfile();
    const { data: rx, error } = await supabase
      .from("prescriptions")
      .insert({
        prescription_no: payload.prescription_no.trim().toUpperCase(),
        patient_name: payload.patient_name.trim(),
        patient_contact: payload.patient_contact?.trim() || null,
        doctor_name: payload.doctor_name.trim(),
        prescriber_license: payload.prescriber_license?.trim() || null,
        prescription_date: payload.prescription_date,
        user_id: profile?.id,
        notes: payload.notes?.trim() || null,
      })
      .select("prescription_id")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "A prescription with that number already exists."
          : error.message
      );
    }

    const { error: itemErr } = await supabase.from("prescription_items").insert(
      payload.items.map((item) => ({
        prescription_id: rx.prescription_id,
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        dosage_instructions: item.dosage_instructions?.trim() || null,
      }))
    );
    if (itemErr) throw new Error(itemErr.message);
    return rx.prescription_id;
  },

  async cancelPrescription(prescriptionId: number): Promise<void> {
    invalidateCache("prescriptions", "dashboard");
    if (!supabase) {
      sandboxDb.cancelPrescription(prescriptionId);
      return;
    }
    const { data, error } = await supabase
      .from("prescriptions")
      .update({ status: "Cancelled" })
      .eq("prescription_id", prescriptionId)
      .eq("status", "Pending")
      .select("prescription_id");
    if (error) throw new Error(error.message);
    if (!data?.length) {
      throw new Error("This prescription is no longer Pending, so it cannot be cancelled.");
    }
  },

  async getSales(limit = 50): Promise<SaleSummary[]> {
    if (!supabase) return sandboxDb.getSales(limit);
    const client = supabase;
    return cachedQuery(
      `sales:list:${limit}`,
      async () => {
        const { data, error } = await client
          .from("sales")
          .select(
            "sale_id, sale_no, sale_date, customer_name, cashier_name, subtotal, discount, total_amount, status, prescriptions(prescription_no), payments(payment_method)"
          )
          .order("sale_date", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? []).map((row: Record<string, unknown>) => {
          const rx = row.prescriptions as { prescription_no?: string } | null;
          const pays = (row.payments as { payment_method: string }[]) ?? [];
          return {
            sale_id: Number(row.sale_id),
            sale_no: String(row.sale_no),
            sale_date: String(row.sale_date),
            customer_name: (row.customer_name as string | null) ?? null,
            cashier_name: (row.cashier_name as string | null) ?? null,
            prescription_no: rx?.prescription_no ?? null,
            subtotal: Number(row.subtotal),
            discount: Number(row.discount),
            total_amount: Number(row.total_amount),
            status: row.status as SaleSummary["status"],
            payment_methods: [...new Set(pays.map((p) => p.payment_method))],
          };
        });
      },
      15_000
    );
  },

  async getSaleReceipt(saleId: number): Promise<SaleReceipt> {
    if (!supabase) return sandboxDb.getSaleReceipt(saleId);
    const { data, error } = await supabase
      .from("sales")
      .select(
        "sale_id, sale_no, sale_date, customer_name, cashier_name, subtotal, discount, total_amount, status, prescriptions(prescription_no), sale_items(medicine_id, quantity, unit_price, medicines(medicine_name, strength)), payments(payment_method, amount, amount_tendered, change_amount, reference_no)"
      )
      .eq("sale_id", saleId)
      .single();
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    const rx = row.prescriptions as { prescription_no?: string } | null;
    const rawItems = (row.sale_items as Record<string, unknown>[]) ?? [];
    const pays = (row.payments as SaleReceipt["payments"]) ?? [];
    return {
      sale_id: Number(row.sale_id),
      sale_no: String(row.sale_no),
      sale_date: String(row.sale_date),
      customer_name: (row.customer_name as string | null) ?? null,
      cashier_name: (row.cashier_name as string | null) ?? null,
      prescription_no: rx?.prescription_no ?? null,
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      total_amount: Number(row.total_amount),
      status: row.status as SaleReceipt["status"],
      payment_methods: [...new Set(pays.map((p) => p.payment_method))],
      items: rawItems.map((i) => {
        const m = i.medicines as Record<string, unknown> | null;
        return {
          medicine_id: Number(i.medicine_id),
          medicine_name: String(m?.medicine_name ?? "Medicine"),
          strength: (m?.strength as string | null) ?? null,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        };
      }),
      payments: pays,
    };
  },

  async checkoutSale(payload: {
    items: { medicine_id: number; quantity: number }[];
    customer_name: string | null;
    prescription_id: number | null;
    discount: number;
    payment_method: PaymentMethod;
    amount_tendered: number | null;
    reference_no: string | null;
  }): Promise<number> {
    invalidateCache("sales", "inventory", "medicines", "prescriptions", "dashboard");
    if (!supabase) return sandboxDb.checkoutSale(payload);
    const { data, error } = await supabase.rpc("checkout_sale", {
      p_items: payload.items,
      p_customer_name: payload.customer_name,
      p_prescription_id: payload.prescription_id,
      p_discount: payload.discount,
      p_payment_method: payload.payment_method,
      p_amount_tendered: payload.amount_tendered,
      p_reference_no: payload.reference_no,
    });
    if (error) throw new Error(error.message);
    return Number(data);
  },

  async getUsers(): Promise<ManagedUser[]> {
    if (!supabase) return sandboxDb.getUsers();
    const { data, error } = await supabase
      .from("users")
      .select("user_id, email, full_name, role, status, created_at, updated_at")
      .order("email", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((u: Record<string, unknown>) => ({
      user_id: String(u.user_id),
      email: String(u.email),
      full_name: (u.full_name as string | null) ?? null,
      role: normalizeRole(u.role as string) ?? "Cashier",
      status: (u.status as AccountStatus) ?? "Inactive",
      created_at: u.created_at as string | undefined,
      updated_at: u.updated_at as string | undefined,
    }));
  },

  async createUser(payload: {
    email: string;
    full_name: string;
    role: UserRole;
    password: string;
  }): Promise<void> {
    if (!supabase) {
      sandboxDb.createUser(payload);
      return;
    }
    const { data: created, error } = await supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      options: { data: { full_name: payload.full_name.trim() } },
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Failed to create user account.");
    const { error: upErr } = await supabase
      .from("users")
      .update({
        full_name: payload.full_name.trim(),
        role: payload.role,
        status: "Active",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", created.user.id);
    if (upErr) throw new Error(upErr.message);
  },

  async updateUser(
    userId: string,
    payload: { full_name: string; role?: UserRole; status?: AccountStatus }
  ): Promise<void> {
    invalidateCache(`profile:${userId}`);
    if (!supabase) {
      sandboxDb.updateUser(userId, payload);
      return;
    }
    const record: Record<string, unknown> = {
      full_name: payload.full_name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (payload.role) record.role = payload.role;
    if (payload.status) record.status = payload.status;
    const { error } = await supabase
      .from("users")
      .update(record)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async runReport(reportId: string, from: string, to: string): Promise<ReportOutput> {
    if (!supabase) return sandboxDb.runReport(reportId, from, to);

    // Server-side date-bounded queries instead of unbounded pagination loops
    switch (reportId) {
      case "daily-sales": {
        const { data, error } = await supabase
          .from("v_daily_sales")
          .select("sale_day, transactions, total_sales")
          .gte("sale_day", from)
          .lte("sale_day", to)
          .order("sale_day", { ascending: true });
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Record<string, string | number | null>[];
        return {
          columns: [
            { key: "sale_day", label: "Date", type: "date" },
            { key: "transactions", label: "Transactions", type: "int" },
            { key: "total_sales", label: "Total Sales", type: "money" },
          ],
          rows,
          totals: {
            sale_day: "Total",
            transactions: rows.reduce((s, r) => s + Number(r.transactions || 0), 0),
            total_sales: rows.reduce((s, r) => s + Number(r.total_sales || 0), 0),
          },
        };
      }
      case "sales-by-medicine": {
        const { data, error } = await supabase
          .from("v_sales_by_medicine")
          .select("medicine_id, medicine_code, medicine_name, strength, units_sold, revenue")
          .gte("sale_day", from)
          .lte("sale_day", to);
        if (error) throw new Error(error.message);
        const agg = new Map<number, { code: string; med: string; units: number; rev: number }>();
        for (const r of data ?? []) {
          const cur = agg.get(r.medicine_id) ?? {
            code: r.medicine_code,
            med: `${r.medicine_name}${r.strength ? " " + r.strength : ""}`,
            units: 0,
            rev: 0,
          };
          cur.units += Number(r.units_sold || 0);
          cur.rev += Number(r.revenue || 0);
          agg.set(r.medicine_id, cur);
        }
        const rows = [...agg.values()]
          .sort((a, b) => b.rev - a.rev)
          .map((v) => ({
            medicine_code: v.code,
            medicine: v.med,
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
            units_sold: rows.reduce((s, r) => s + Number(r.units_sold || 0), 0),
            revenue: rows.reduce((s, r) => s + Number(r.revenue || 0), 0),
          },
        };
      }
      case "sales-by-cashier": {
        const { data, error } = await supabase
          .from("v_sales_by_cashier")
          .select("cashier_name, transactions, total_sales")
          .gte("sale_day", from)
          .lte("sale_day", to);
        if (error) throw new Error(error.message);
        const agg = new Map<string, { tx: number; total: number }>();
        for (const r of data ?? []) {
          const k = r.cashier_name || "Staff";
          const cur = agg.get(k) ?? { tx: 0, total: 0 };
          cur.tx += Number(r.transactions || 0);
          cur.total += Number(r.total_sales || 0);
          agg.set(k, cur);
        }
        const rows = [...agg.entries()].map(([cashier, v]) => ({
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
            transactions: rows.reduce((s, r) => s + Number(r.transactions || 0), 0),
            total_sales: rows.reduce((s, r) => s + Number(r.total_sales || 0), 0),
          },
        };
      }
      case "payment-summary": {
        const { data, error } = await supabase
          .from("v_payment_summary")
          .select("payment_method, transactions, total_amount")
          .gte("sale_day", from)
          .lte("sale_day", to);
        if (error) throw new Error(error.message);
        const agg = new Map<string, { tx: number; total: number }>();
        for (const r of data ?? []) {
          const cur = agg.get(r.payment_method) ?? { tx: 0, total: 0 };
          cur.tx += Number(r.transactions || 0);
          cur.total += Number(r.total_amount || 0);
          agg.set(r.payment_method, cur);
        }
        const rows = [...agg.entries()].map(([payment_method, v]) => ({
          payment_method,
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
            transactions: rows.reduce((s, r) => s + Number(r.transactions || 0), 0),
            total_amount: rows.reduce((s, r) => s + Number(r.total_amount || 0), 0),
          },
        };
      }
      case "inventory-stock": {
        const meds = await this.getMedicines();
        const rows = meds
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
        };
      }
      case "low-stock": {
        const low = await this.getLowStock();
        const rows = low.map((l) => ({
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
        const { data, error } = await supabase
          .from("v_stock_in")
          .select("purchase_no, purchase_date, supplier_name, medicine_name, strength, batch_number, quantity, line_total")
          .gte("purchase_date", from)
          .lte("purchase_date", to)
          .neq("status", "Cancelled")
          .order("purchase_date", { ascending: false });
        if (error) throw new Error(error.message);
        const rows = (data ?? []).map((r) => ({
          purchase_no: r.purchase_no,
          purchase_date: r.purchase_date,
          supplier: r.supplier_name,
          medicine: `${r.medicine_name}${r.strength ? " " + r.strength : ""}`,
          batch_number: r.batch_number,
          quantity: r.quantity,
          line_total: r.line_total,
        }));
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
        };
      }
      case "expiration": {
        const batches = await this.getInventoryBatches();
        const rows = batches
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
        };
      }
      case "prescriptions":
      default: {
        const { data, error } = await supabase
          .from("v_prescription_report")
          .select("*")
          .gte("prescription_date", from)
          .lte("prescription_date", to)
          .order("prescription_date", { ascending: false });
        if (error) throw new Error(error.message);
        const rows = (data ?? []).map((r) => ({
          prescription_no: r.prescription_no,
          prescription_date: r.prescription_date,
          patient_name: r.patient_name,
          medicine: `${r.medicine_name}${r.strength ? " " + r.strength : ""}`,
          quantity: r.quantity,
          dispensed: r.quantity_dispensed,
          remaining: r.quantity_remaining,
          status: r.status,
        }));
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
  },
};
