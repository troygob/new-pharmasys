import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  StatusText,
  TableSkeleton,
} from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { hasPermission } from "../lib/rbac";
import {
  formatDate,
  formatMoney,
  medLabel,
  searchMedicines,
  todayIsoDate,
} from "../lib/utils";
import type { Category, InventoryBatch, Medicine } from "../types/pharmacy";

const DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Drops",
  "Ointment",
  "Cream",
  "Injection",
  "Inhaler",
  "Other",
];

export function MedicinesPage({
  activeTab,
  onTabChange,
}: {
  activeTab: "medicines" | "categories";
  onTabChange: (t: "medicines" | "categories") => void;
}) {
  const { profile } = useAuth();
  const { notify } = useToast();
  const canManageMeds = hasPermission(profile?.role, "manage_medicines");
  const canManageCats = hasPermission(profile?.role, "manage_categories");

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | "All">("Active");

  // Medicine Modal
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [medCode, setMedCode] = useState("");
  const [medName, setMedName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dosageForm, setDosageForm] = useState("Tablet");
  const [strength, setStrength] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("20");
  const [requiresRx, setRequiresRx] = useState(false);
  const [openQty, setOpenQty] = useState("0");
  const [openBatch, setOpenBatch] = useState("INITIAL");
  const [openCost, setOpenCost] = useState("0");
  const [openExpiry, setOpenExpiry] = useState("");
  const [savingMed, setSavingMed] = useState(false);

  // Medicine Details Modal
  const [detailMed, setDetailMed] = useState<Medicine | null>(null);
  const [detailBatches, setDetailBatches] = useState<InventoryBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Category Modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  // Status Toggle Confirm
  const [toggleTarget, setToggleTarget] = useState<
    | { kind: "medicine"; item: Medicine }
    | { kind: "category"; item: Category }
    | null
  >(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [medsData, catsData] = await Promise.all([
        api.getMedicines(),
        api.getCategories(),
      ]);
      setMedicines(medsData);
      setCategories(catsData);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load catalog.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nextMedCode = () => {
    const nums = medicines.map(
      (m) => parseInt(m.medicine_code.replace(/\D/g, ""), 10) || 0
    );
    return `MED-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
  };

  const openAddMedicine = () => {
    setEditingMed(null);
    setMedCode(nextMedCode());
    setMedName("");
    setGenericName("");
    setCategoryId("");
    setDosageForm("Tablet");
    setStrength("");
    setUnitPrice("0");
    setReorderLevel("20");
    setRequiresRx(false);
    setOpenQty("0");
    setOpenBatch("INITIAL");
    setOpenCost("0");
    setOpenExpiry("");
    setMedModalOpen(true);
  };

  const openEditMedicine = (m: Medicine) => {
    setEditingMed(m);
    setMedCode(m.medicine_code);
    setMedName(m.medicine_name);
    setGenericName(m.generic_name || "");
    setCategoryId(m.category_id ? String(m.category_id) : "");
    setDosageForm(m.dosage_form || "Tablet");
    setStrength(m.strength || "");
    setUnitPrice(String(m.unit_price));
    setReorderLevel(String(m.reorder_level));
    setRequiresRx(m.requires_prescription);
    setMedModalOpen(true);
  };

  const handleSaveMedicine = async (e: FormEvent) => {
    e.preventDefault();
    const price = parseFloat(unitPrice) || 0;
    const reorder = parseInt(reorderLevel, 10) || 0;
    if (price < 0 || reorder < 0) {
      notify("Price and reorder level cannot be negative.", "error");
      return;
    }

    const qty = parseInt(openQty, 10) || 0;
    if (!editingMed && qty > 0) {
      if (!openExpiry || openExpiry < todayIsoDate()) {
        notify("Enter a valid future expiry date for opening stock.", "error");
        return;
      }
    }

    setSavingMed(true);
    try {
      await api.saveMedicine({
        medicine_id: editingMed?.medicine_id,
        medicine_code: medCode,
        medicine_name: medName,
        generic_name: genericName || null,
        category_id: categoryId ? Number(categoryId) : null,
        dosage_form: dosageForm,
        strength: strength || null,
        unit_price: price,
        reorder_level: reorder,
        requires_prescription: requiresRx,
        opening_stock:
          !editingMed && qty > 0
            ? {
                quantity: qty,
                batch_number: openBatch || "INITIAL",
                purchase_price: parseFloat(openCost) || 0,
                expiration_date: openExpiry,
              }
            : undefined,
      });
      setMedModalOpen(false);
      notify(editingMed ? "Medicine updated." : "Medicine added.", "success");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save medicine.", "error");
    } finally {
      setSavingMed(false);
    }
  };

  const openDetails = async (m: Medicine) => {
    setDetailMed(m);
    setLoadingBatches(true);
    try {
      const b = await api.getMedicineBatches(m.medicine_id);
      setDetailBatches(b);
    } catch {
      setDetailBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    setSavingCat(true);
    try {
      await api.saveCategory({
        category_id: editingCat?.category_id,
        category_name: catName,
        description: catDesc || null,
      });
      setCatModalOpen(false);
      notify(editingCat ? "Category updated." : "Category added.", "success");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save category.", "error");
    } finally {
      setSavingCat(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      if (toggleTarget.kind === "medicine") {
        await api.toggleMedicineStatus(
          toggleTarget.item.medicine_id,
          toggleTarget.item.status
        );
      } else {
        await api.toggleCategoryStatus(
          toggleTarget.item.category_id,
          toggleTarget.item.status
        );
      }
      notify("Status updated.", "success");
      setToggleTarget(null);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update status.", "error");
    }
  };

  const filteredMedicines = useMemo(() => {
    const matched = searchMedicines(
      medicines as unknown as Record<string, unknown>[],
      search
    ) as unknown as Medicine[];
    return matched.filter((m) => {
      if (statusFilter !== "All" && m.status !== statusFilter) return false;
      if (catFilter && m.category_name !== catFilter) return false;
      return true;
    });
  }, [medicines, search, statusFilter, catFilter]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter(
      (c) =>
        !q ||
        c.category_name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );
  }, [categories, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            {activeTab === "medicines" ? "Medicine Catalog" : "Categories"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage product master data, pricing, reorder levels, and therapeutic classes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => onTabChange("medicines")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === "medicines"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Medicines ({medicines.length})
            </button>
            <button
              type="button"
              onClick={() => onTabChange("categories")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === "categories"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Categories ({categories.length})
            </button>
          </div>

          {activeTab === "medicines" && canManageMeds && (
            <button
              type="button"
              onClick={openAddMedicine}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Medicine</span>
            </button>
          )}
          {activeTab === "categories" && canManageCats && (
            <button
              type="button"
              onClick={() => {
                setEditingCat(null);
                setCatName("");
                setCatDesc("");
                setCatModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === "medicines"
                ? "Search code, name, generic, form, strength..."
                : "Search category name or description..."
            }
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>

        {activeTab === "medicines" && (
          <>
            <select
              aria-label="Filter by category"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categories
                .filter((c) => c.status === "Active")
                .map((c) => (
                  <option key={c.category_id} value={c.category_name}>
                    {c.category_name}
                  </option>
                ))}
            </select>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "Active" | "Inactive" | "All")
              }
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-sm"
            >
              <option value="Active">Active only</option>
              <option value="Inactive">Inactive only</option>
              <option value="All">All statuses</option>
            </select>
          </>
        )}
      </div>

      {/* Tables */}
      {activeTab === "medicines" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filteredMedicines.length === 0 ? (
            <EmptyState title="No medicines match your filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Medicine</th>
                    <th className="px-4 py-2.5">Category · Form</th>
                    <th className="px-4 py-2.5 text-right">Price</th>
                    <th className="px-4 py-2.5 text-right">On Hand</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredMedicines.map((m) => (
                    <tr
                      key={m.medicine_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {m.medicine_code}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {medLabel(m)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {m.generic_name || "—"}
                          {m.requires_prescription && (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {" · "}Rx
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        {m.category_name || "Uncategorized"} · {m.dosage_form}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatMoney(m.unit_price)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums font-medium ${
                          m.is_low_stock
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-slate-900 dark:text-slate-100"
                        }`}
                      >
                        {m.quantity_on_hand}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText
                          label={m.status}
                          tone={m.status === "Active" ? "success" : "danger"}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openDetails(m)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Batches
                        </button>
                        {canManageMeds && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditMedicine(m)}
                              className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setToggleTarget({ kind: "medicine", item: m })
                              }
                              className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {m.status === "Active" ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filteredCategories.length === 0 ? (
            <EmptyState title="No categories found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-right">Active Medicines</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredCategories.map((c) => (
                    <tr
                      key={c.category_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {c.category_name}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {c.description || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {c.medicine_count ?? 0}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText
                          label={c.status}
                          tone={c.status === "Active" ? "success" : "danger"}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setCatFilter(c.category_name);
                            onTabChange("medicines");
                          }}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          View Items
                        </button>
                        {canManageCats && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCat(c);
                                setCatName(c.category_name);
                                setCatDesc(c.description || "");
                                setCatModalOpen(true);
                              }}
                              className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setToggleTarget({ kind: "category", item: c })
                              }
                              className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {c.status === "Active" ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Medicine Add/Edit Modal */}
      <Modal
        open={medModalOpen}
        onClose={() => !savingMed && setMedModalOpen(false)}
        title={editingMed ? "Edit Medicine" : "Add Medicine"}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveMedicine} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Code
              </label>
              <input
                type="text"
                required
                value={medCode}
                onChange={(e) => setMedCode(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Medicine Name
              </label>
              <input
                type="text"
                required
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Generic Name
              </label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              >
                <option value="">Uncategorized</option>
                {categories
                  .filter((c) => c.status === "Active")
                  .map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Dosage Form
              </label>
              <select
                value={dosageForm}
                onChange={(e) => setDosageForm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              >
                {DOSAGE_FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Strength
              </label>
              <input
                type="text"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="e.g. 500 mg"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Unit Price (&#8369;)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Reorder Level
              </label>
              <input
                type="number"
                min={0}
                required
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={requiresRx}
              onChange={(e) => setRequiresRx(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Requires prescription to dispense</span>
          </label>

          {!editingMed && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Optional Opening Stock Batch
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={openQty}
                    onChange={(e) => setOpenQty(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Batch No.
                  </label>
                  <input
                    type="text"
                    value={openBatch}
                    onChange={(e) => setOpenBatch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Unit Cost
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={openCost}
                    onChange={(e) => setOpenCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={openExpiry}
                    onChange={(e) => setOpenExpiry(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setMedModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingMed}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {savingMed ? "Saving..." : "Save Medicine"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Medicine Batches Detail Modal */}
      <Modal
        open={Boolean(detailMed)}
        onClose={() => setDetailMed(null)}
        title={detailMed ? medLabel(detailMed) : ""}
        maxWidthClass="max-w-lg"
      >
        {detailMed && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Code:</span>{" "}
                <span className="font-mono">{detailMed.medicine_code}</span>
              </div>
              <div>
                <span className="text-slate-500">On Hand:</span>{" "}
                <span className="font-mono font-semibold">
                  {detailMed.quantity_on_hand}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Generic:</span>{" "}
                {detailMed.generic_name || "—"}
              </div>
              <div>
                <span className="text-slate-500">Reorder Level:</span>{" "}
                <span className="font-mono">{detailMed.reorder_level}</span>
              </div>
            </div>

            {loadingBatches ? (
              <TableSkeleton rows={3} cols={3} />
            ) : detailBatches.length === 0 ? (
              <EmptyState title="No inventory batches recorded yet." />
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#111923] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2">Expiry</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailBatches.map((b) => (
                      <tr key={b.inventory_id}>
                        <td className="px-3 py-2 font-mono">{b.batch_number}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {b.quantity}
                        </td>
                        <td className="px-3 py-2">{formatDate(b.expiration_date)}</td>
                        <td className="px-3 py-2">
                          <StatusText
                            label={b.expiry_status}
                            tone={
                              b.expiry_status === "Expired"
                                ? "danger"
                                : b.expiry_status === "Expiring Soon"
                                  ? "warning"
                                  : "success"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Category Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => !savingCat && setCatModalOpen(false)}
        title={editingCat ? "Edit Category" : "Add Category"}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Category Name
            </label>
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setCatModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCat}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {savingCat ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title="Confirm Status Change"
        description={
          toggleTarget?.kind === "medicine"
            ? `Switch ${toggleTarget.item.medicine_name} to ${
                toggleTarget.item.status === "Active" ? "Inactive" : "Active"
              }?`
            : `Switch ${toggleTarget?.item.category_name ?? ""} to ${
                toggleTarget?.item.status === "Active" ? "Inactive" : "Active"
              }?`
        }
        onConfirm={confirmToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
