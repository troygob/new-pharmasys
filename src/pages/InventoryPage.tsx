import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, PackagePlus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  StatTile,
  StatusText,
  TableSkeleton,
} from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { hasPermission } from "../lib/rbac";
import {
  exportCsv,
  formatCount,
  formatDate,
  formatDateTime,
  formatDaysRemaining,
  formatMoney,
  medLabel,
  searchMedicines,
  todayIsoDate,
} from "../lib/utils";
import type {
  InventoryBatch,
  InventoryTransaction,
  LowStockItem,
  Medicine,
  MedicineSupplierLink,
  Supplier,
} from "../types/pharmacy";

export type InventorySection =
  | "inventory"
  | "stock-in"
  | "stock-adjustment"
  | "expiration";

type AdjustmentPreset = "Damaged" | "Expired" | "Returned" | "Adjustment";

const ADJUSTMENT_TYPES: Record<
  AdjustmentPreset,
  { db: "DAMAGED" | "EXPIRED" | "RETURN" | "ADJUSTMENT"; sign: 1 | -1 | 0; hint: string }
> = {
  Damaged: { db: "DAMAGED", sign: -1, hint: "Removes broken or unsellable units." },
  Expired: { db: "EXPIRED", sign: -1, hint: "Writes off expired batch stock." },
  Returned: { db: "RETURN", sign: 1, hint: "Adds returned units back to the batch." },
  Adjustment: { db: "ADJUSTMENT", sign: 0, hint: "Manual count reconciliation (+/-)." },
};

export function InventoryPage({
  activeSection,
  onSectionChange,
}: {
  activeSection: InventorySection;
  onSectionChange: (s: InventorySection) => void;
}) {
  const { profile, settings } = useAuth();
  const { notify } = useToast();

  const canReceive = hasPermission(profile?.role, "receive_stock");
  const canAdjust = hasPermission(profile?.role, "adjust_stock");
  const canWriteOff = hasPermission(profile?.role, "write_off_expired");

  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplyLinks, setSupplyLinks] = useState<MedicineSupplierLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [batchSubTab, setBatchSubTab] = useState<"batches" | "low">("batches");
  const [statusFilter, setStatusFilter] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  // Quick Stock-In Form State
  const [inSupplierId, setInSupplierId] = useState("");
  const [inMedicineId, setInMedicineId] = useState("");
  const [inBatchNo, setInBatchNo] = useState("");
  const [inQty, setInQty] = useState("");
  const [inCost, setInCost] = useState("");
  const [inSell, setInSell] = useState("");
  const [inExpiry, setInExpiry] = useState("");
  const [inSaving, setInSaving] = useState(false);

  // Quick Adjustment Modal (usable directly from any batch row or Adjustments tab)
  const [adjModalBatch, setAdjModalBatch] = useState<InventoryBatch | null>(null);
  const [adjPreset, setAdjPreset] = useState<AdjustmentPreset>("Damaged");
  const [adjDirection, setAdjDirection] = useState<"-" | "+">("-");
  const [adjQty, setAdjQty] = useState("1");
  const [adjReason, setAdjReason] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  // Write-off Confirms
  const [writeOffBatch, setWriteOffBatch] = useState<InventoryBatch | null>(null);
  const [writeOffAllOpen, setWriteOffAllOpen] = useState(false);
  const [writingOff, setWritingOff] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [b, l, t, m, s, ms] = await Promise.all([
        api.getInventoryBatches(),
        api.getLowStock(),
        api.getInventoryTransactions(200),
        api.getMedicines(),
        api.getSuppliers().catch(() => [] as Supplier[]),
        api.getMedicineSuppliers().catch(() => [] as MedicineSupplierLink[]),
      ]);
      setBatches(b);
      setLowStock(l);
      setTransactions(t);
      setMedicines(m.filter((x) => x.status === "Active"));
      setSuppliers(s.filter((x) => x.status === "Active"));
      setSupplyLinks(ms);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not load inventory.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pre-fill Stock-In prices when medicine/supplier changes
  useEffect(() => {
    if (!inMedicineId) return;
    const med = medicines.find((m) => String(m.medicine_id) === inMedicineId);
    if (med && !inSell) {
      setInSell(med.unit_price.toFixed(2));
    }
    if (inSupplierId) {
      const link = supplyLinks.find(
        (l) =>
          String(l.medicine_id) === inMedicineId &&
          String(l.supplier_id) === inSupplierId
      );
      if (link) setInCost(link.purchase_price.toFixed(2));
    }
  }, [inMedicineId, inSupplierId, medicines, supplyLinks, inSell]);

  const jumpToReceiveForMedicine = (medicineId: number, suggestedQty?: number) => {
    const med = medicines.find((m) => m.medicine_id === medicineId);
    const link = supplyLinks.find((l) => l.medicine_id === medicineId);
    setInMedicineId(String(medicineId));
    if (link) {
      setInSupplierId(String(link.supplier_id));
      setInCost(link.purchase_price.toFixed(2));
    }
    if (med) setInSell(med.unit_price.toFixed(2));
    if (suggestedQty) setInQty(String(suggestedQty));
    onSectionChange("stock-in");
  };

  const openAdjustForBatch = (batch: InventoryBatch) => {
    setAdjModalBatch(batch);
    setAdjPreset(batch.expiry_status === "Expired" ? "Expired" : "Damaged");
    setAdjDirection("-");
    setAdjQty("1");
    setAdjReason("");
  };

  const handleReceiveStock = async (e: FormEvent) => {
    e.preventDefault();
    const qty = parseInt(inQty, 10);
    const buy = parseFloat(inCost);
    const sell = parseFloat(inSell);
    if (!inSupplierId || !inMedicineId) {
      notify("Select both a supplier and a medicine.", "error");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      notify("Quantity must be a positive whole number.", "error");
      return;
    }
    if (Number.isNaN(buy) || buy < 0 || Number.isNaN(sell) || sell < 0) {
      notify("Enter valid purchase and selling prices.", "error");
      return;
    }
    if (!inExpiry || inExpiry <= todayIsoDate()) {
      notify("Expiration date must be in the future.", "error");
      return;
    }

    setInSaving(true);
    try {
      const poNo = await api.receiveStock({
        supplier_id: Number(inSupplierId),
        medicine_id: Number(inMedicineId),
        batch_number: inBatchNo.trim(),
        quantity: qty,
        purchase_price: buy,
        selling_price: sell,
        expiration_date: inExpiry,
      });
      notify(`Stock received: +${qty} units (${poNo}).`, "success");
      setInBatchNo("");
      setInQty("");
      setInExpiry("");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not receive stock.", "error");
    } finally {
      setInSaving(false);
    }
  };

  const handleSaveAdjustment = async (e: FormEvent) => {
    e.preventDefault();
    if (!adjModalBatch) return;
    const qty = parseInt(adjQty, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      notify("Enter a valid positive quantity.", "error");
      return;
    }
    const cfg = ADJUSTMENT_TYPES[adjPreset];
    const sign = cfg.sign !== 0 ? cfg.sign : adjDirection === "+" ? 1 : -1;
    const delta = sign * qty;

    setAdjSaving(true);
    try {
      const res = await api.adjustStock({
        inventory_id: adjModalBatch.inventory_id,
        medicine_id: adjModalBatch.medicine_id,
        transaction_type: cfg.db,
        label: adjPreset,
        quantity_change: delta,
        reason: adjReason.trim() || adjPreset,
      });
      notify(
        `Batch ${adjModalBatch.batch_number} updated: ${res.oldQty} -> ${res.newQty}.`,
        "success"
      );
      setAdjModalBatch(null);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Adjustment failed.", "error");
    } finally {
      setAdjSaving(false);
    }
  };

  const handleWriteOffSingle = async () => {
    if (!writeOffBatch) return;
    setWritingOff(true);
    try {
      const removed = await api.writeOffExpired(writeOffBatch);
      notify(`Wrote off ${removed} expired unit(s) from ${writeOffBatch.batch_number}.`, "success");
      setWriteOffBatch(null);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Write-off failed.", "error");
    } finally {
      setWritingOff(false);
    }
  };

  const handleWriteOffAll = async () => {
    const expiredList = batches.filter(
      (b) => b.quantity > 0 && b.expiry_status === "Expired"
    );
    if (!expiredList.length) return;
    setWritingOff(true);
    try {
      let count = 0;
      for (const b of expiredList) {
        await api.writeOffExpired(b);
        count += 1;
      }
      notify(`Removed ${count} expired batch(es) from sellable stock.`, "success");
      setWriteOffAllOpen(false);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Bulk write-off failed.", "error");
    } finally {
      setWritingOff(false);
    }
  };

  const lowIds = useMemo(
    () => new Set(lowStock.map((l) => l.medicine_id)),
    [lowStock]
  );

  const batchDisplayStatus = useCallback(
    (b: InventoryBatch) => {
      if (b.quantity <= 0) return "Empty";
      if (b.expiry_status === "Expired") return "Expired";
      if (b.expiry_status === "Expiring Soon") return "Expiring Soon";
      if (lowIds.has(b.medicine_id)) return "Low Stock";
      return "Available";
    },
    [lowIds]
  );

  const filteredBatches = useMemo(() => {
    const searched = searchMedicines(
      batches as unknown as Record<string, unknown>[],
      search
    ) as unknown as InventoryBatch[];
    return searched.filter((b) => {
      const st = batchDisplayStatus(b);
      if (hideEmpty && st === "Empty" && statusFilter !== "Empty") return false;
      if (statusFilter && st !== statusFilter) return false;
      return true;
    });
  }, [batches, search, hideEmpty, statusFilter, batchDisplayStatus]);

  const expiredBatches = useMemo(
    () => batches.filter((b) => b.quantity > 0 && b.expiry_status === "Expired"),
    [batches]
  );
  const soonBatches = useMemo(
    () => batches.filter((b) => b.quantity > 0 && b.expiry_status === "Expiring Soon"),
    [batches]
  );
  const sellableBatches = useMemo(
    () => batches.filter((b) => b.quantity > 0 && b.expiry_status !== "Expired"),
    [batches]
  );

  const filteredExpiration = useMemo(() => {
    const active = batches.filter((b) => b.quantity > 0);
    const searched = searchMedicines(
      active as unknown as Record<string, unknown>[],
      search
    ) as unknown as InventoryBatch[];
    if (!statusFilter) return searched;
    return searched.filter((b) => b.expiry_status === statusFilter);
  }, [batches, search, statusFilter]);

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((tx) =>
      [tx.medicine_name, tx.medicine_code, tx.batch_number, tx.notes, tx.transaction_type].some(
        (v) => (v || "").toLowerCase().includes(q)
      )
    );
  }, [transactions, search]);

  return (
    <div className="space-y-5">
      {/* Unified Inventory Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Inventory Operations
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Batch stock levels, receiving, manual adjustments, and expiration tracking in one place.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 overflow-x-auto max-w-full">
          {(
            [
              { id: "inventory", label: "Stock & Batches" },
              { id: "stock-in", label: "Receive Stock" },
              { id: "stock-adjustment", label: "Adjustments & Log" },
              { id: "expiration", label: `Expiration (${expiredBatches.length + soonBatches.length})` },
            ] as { id: InventorySection; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter("");
                onSectionChange(tab.id);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeSection === tab.id
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Sellable Units"
          value={formatCount(sellableBatches.reduce((s, b) => s + b.quantity, 0))}
          note={`${sellableBatches.length} active batches`}
        />
        <StatTile
          label="Stock Value (Cost)"
          value={formatMoney(
            sellableBatches.reduce((s, b) => s + Number(b.stock_value), 0)
          )}
          note="Unexpired inventory"
        />
        <StatTile
          label="Low Stock Items"
          value={formatCount(lowStock.length)}
          tone={lowStock.length > 0 ? "warning" : "success"}
          onClick={() => {
            onSectionChange("inventory");
            setBatchSubTab("low");
          }}
        />
        <StatTile
          label="Expired Batches"
          value={formatCount(expiredBatches.length)}
          note={`${soonBatches.length} expiring within ${settings.expiring_soon_days}d`}
          tone={expiredBatches.length > 0 ? "danger" : "success"}
          onClick={() => onSectionChange("expiration")}
        />
      </div>

      {/* SECTION 1: STOCK & BATCHES */}
      {activeSection === "inventory" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search medicine, code, or batch..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm"
                />
              </div>

              <div className="inline-flex p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29]">
                <button
                  type="button"
                  onClick={() => setBatchSubTab("batches")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    batchSubTab === "batches"
                      ? "bg-teal-600 text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  All Batches
                </button>
                <button
                  type="button"
                  onClick={() => setBatchSubTab("low")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    batchSubTab === "low"
                      ? "bg-teal-600 text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Low Stock ({lowStock.length})
                </button>
              </div>
            </div>

            {batchSubTab === "batches" && (
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  aria-label="Filter batch status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-xs"
                >
                  <option value="">All statuses</option>
                  <option value="Available">Available</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Expiring Soon">Expiring Soon</option>
                  <option value="Expired">Expired</option>
                  <option value="Empty">Empty</option>
                </select>

                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={hideEmpty}
                    onChange={(e) => setHideEmpty(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600"
                  />
                  <span>Hide empty</span>
                </label>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : batchSubTab === "batches" ? (
              filteredBatches.length === 0 ? (
                <EmptyState title="No inventory batches match your filters" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">Medicine</th>
                        <th className="px-4 py-2.5">Batch</th>
                        <th className="px-4 py-2.5 text-right">Qty</th>
                        <th className="px-4 py-2.5 text-right">Sell Price</th>
                        <th className="px-4 py-2.5">Expires</th>
                        <th className="px-4 py-2.5">Status</th>
                        {(canAdjust || canReceive) && (
                          <th className="px-4 py-2.5 text-right">Quick Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredBatches.map((b) => {
                        const st = batchDisplayStatus(b);
                        const tone =
                          st === "Available"
                            ? "success"
                            : st === "Expired" || st === "Empty"
                              ? "danger"
                              : "warning";
                        return (
                          <tr
                            key={b.inventory_id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{medLabel(b)}</div>
                              <div className="text-xs text-slate-400 font-mono">
                                {b.medicine_code}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">
                              {b.batch_number}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                              {b.quantity}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {formatMoney(b.selling_price)}
                            </td>
                            <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                              {formatDate(b.expiration_date)}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusText label={st} tone={tone} />
                            </td>
                            {(canAdjust || canReceive) && (
                              <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1.5">
                                {canAdjust && b.quantity > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openAdjustForBatch(b)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <SlidersHorizontal className="h-3 w-3" />
                                    <span>Adjust</span>
                                  </button>
                                )}
                                {canReceive && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      jumpToReceiveForMedicine(b.medicine_id)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                                  >
                                    <PackagePlus className="h-3 w-3" />
                                    <span>Restock</span>
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : lowStock.length === 0 ? (
              <EmptyState title="No medicines are currently low on stock" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">On Hand</th>
                      <th className="px-4 py-2.5 text-right">Reorder At</th>
                      <th className="px-4 py-2.5 text-right">Suggested</th>
                      {canReceive && <th className="px-4 py-2.5 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {lowStock.map((l) => (
                      <tr key={l.medicine_id}>
                        <td className="px-4 py-2.5 font-medium">
                          {medLabel(l)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {l.category_name || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                          {l.quantity_on_hand}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {l.reorder_level}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400 font-medium">
                          +{l.suggested_reorder_qty}
                        </td>
                        {canReceive && (
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                jumpToReceiveForMedicine(
                                  l.medicine_id,
                                  l.suggested_reorder_qty
                                )
                              }
                              className="rounded-md bg-teal-600 hover:bg-teal-700 px-3 py-1 text-xs font-medium text-white"
                            >
                              Receive Stock
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: RECEIVE STOCK (STOCK-IN) */}
      {activeSection === "stock-in" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {canReceive ? (
            <form
              onSubmit={handleReceiveStock}
              className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 space-y-4"
            >
              <h2 className="font-display text-base font-semibold">
                Receive Supplier Delivery
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Supplier
                </label>
                <select
                  required
                  value={inSupplierId}
                  onChange={(e) => setInSupplierId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
                >
                  <option value="">Select active supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_code} — {s.supplier_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Medicine
                </label>
                <select
                  required
                  value={inMedicineId}
                  onChange={(e) => {
                    setInMedicineId(e.target.value);
                    const med = medicines.find(
                      (m) => String(m.medicine_id) === e.target.value
                    );
                    if (med) setInSell(med.unit_price.toFixed(2));
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
                >
                  <option value="">Select active medicine...</option>
                  {medicines.map((m) => (
                    <option key={m.medicine_id} value={m.medicine_id}>
                      {m.medicine_code} — {medLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Batch Number
                  </label>
                  <input
                    type="text"
                    required
                    value={inBatchNo}
                    onChange={(e) => setInBatchNo(e.target.value)}
                    placeholder="e.g. BATCH-2026A"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Quantity Received
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={inQty}
                    onChange={(e) => setInQty(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Unit Cost (&#8369;)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={inCost}
                    onChange={(e) => setInCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Selling Price (&#8369;)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={inSell}
                    onChange={(e) => setInSell(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Expiration Date
                </label>
                <input
                  type="date"
                  required
                  min={todayIsoDate()}
                  value={inExpiry}
                  onChange={(e) => setInExpiry(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={inSaving}
                className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {inSaving ? "Recording..." : "Receive Stock into Inventory"}
              </button>
            </form>
          ) : (
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 text-sm text-slate-500">
              Your role has read-only visibility for Stock-In history.
            </div>
          )}

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold">
              Recent Stock-In Receipts
            </div>
            {loading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Medicine · Batch</th>
                      <th className="px-4 py-2.5 text-right">Added</th>
                      <th className="px-4 py-2.5">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {transactions
                      .filter((t) => t.transaction_type === "STOCK_IN")
                      .slice(0, 15)
                      .map((t) => (
                        <tr key={t.transaction_id}>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            {formatDateTime(t.created_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {medLabel({
                                medicine_name: t.medicine_name,
                                strength: t.strength,
                              })}
                            </span>{" "}
                            <span className="font-mono text-slate-400">
                              {t.batch_number}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                            +{t.quantity_change}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">
                            {t.notes || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: ADJUSTMENTS & AUDIT TRAIL */}
      {activeSection === "stock-adjustment" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search audit log by medicine, batch, or notes..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm"
              />
            </div>
            {canAdjust && batches.some((b) => b.quantity > 0) && (
              <button
                type="button"
                onClick={() => {
                  const first = batches.find((b) => b.quantity > 0);
                  if (first) openAdjustForBatch(first);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-medium text-white self-start sm:self-auto"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Record Adjustment</span>
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : filteredTx.length === 0 ? (
              <EmptyState title="No inventory transactions found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Medicine · Batch</th>
                      <th className="px-4 py-2.5 text-right">Change</th>
                      <th className="px-4 py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredTx.map((tx) => (
                      <tr
                        key={tx.transaction_id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                          {formatDateTime(tx.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusText
                            label={tx.transaction_type.replace("_", " ")}
                            tone={
                              tx.quantity_change > 0
                                ? "success"
                                : tx.transaction_type === "DAMAGED" ||
                                    tx.transaction_type === "EXPIRED"
                                  ? "danger"
                                  : "warning"
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">
                            {medLabel({
                              medicine_name: tx.medicine_name,
                              strength: tx.strength,
                            })}
                          </span>
                          {tx.batch_number && (
                            <span className="ml-2 font-mono text-xs text-slate-400">
                              {tx.batch_number}
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono tabular-nums font-medium ${
                            tx.quantity_change > 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          {tx.quantity_change > 0 ? "+" : ""}
                          {tx.quantity_change}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-md">
                          {tx.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: EXPIRATION MONITOR */}
      {activeSection === "expiration" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search medicine or batch..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <select
                aria-label="Filter by expiry status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-xs"
              >
                <option value="">All stocked batches</option>
                <option value="Expired">Expired</option>
                <option value="Expiring Soon">Expiring Soon</option>
                <option value="Valid">Valid</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportCsv(
                    `expiration-${todayIsoDate()}.csv`,
                    ["Medicine", "Batch", "Qty", "Expiry", "Days", "Cost Value", "Status"],
                    filteredExpiration.map((b) => [
                      medLabel(b),
                      b.batch_number,
                      b.quantity,
                      b.expiration_date,
                      b.days_to_expiry,
                      b.stock_value.toFixed(2),
                      b.expiry_status,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
              {canWriteOff && expiredBatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWriteOffAllOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-medium text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Write Off All Expired ({expiredBatches.length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : filteredExpiration.length === 0 ? (
              <EmptyState title="No stocked batches match this expiry filter" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-4 py-2.5">Batch</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5">Expiry Date</th>
                      <th className="px-4 py-2.5 text-right">Value (Cost)</th>
                      <th className="px-4 py-2.5">Status</th>
                      {canWriteOff && <th className="px-4 py-2.5 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredExpiration.map((b) => (
                      <tr key={b.inventory_id}>
                        <td className="px-4 py-2.5 font-medium">{medLabel(b)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {b.batch_number}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {b.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div>{formatDate(b.expiration_date)}</div>
                          <div className="text-slate-400">
                            {formatDaysRemaining(b.days_to_expiry)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatMoney(b.stock_value)}
                        </td>
                        <td className="px-4 py-2.5">
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
                        {canWriteOff && (
                          <td className="px-4 py-2.5 text-right">
                            {b.expiry_status === "Expired" && (
                              <button
                                type="button"
                                onClick={() => setWriteOffBatch(b)}
                                className="rounded-md border border-rose-200 dark:border-rose-900/60 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                Write Off
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Stock Adjustment Modal */}
      <Modal
        open={Boolean(adjModalBatch)}
        onClose={() => !adjSaving && setAdjModalBatch(null)}
        title="Record Stock Adjustment"
        maxWidthClass="max-w-md"
      >
        {adjModalBatch && (
          <form onSubmit={handleSaveAdjustment} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Select Batch
              </label>
              <select
                value={adjModalBatch.inventory_id}
                onChange={(e) => {
                  const found = batches.find(
                    (b) => String(b.inventory_id) === e.target.value
                  );
                  if (found) setAdjModalBatch(found);
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              >
                {batches
                  .filter((b) => b.quantity > 0)
                  .map((b) => (
                    <option key={b.inventory_id} value={b.inventory_id}>
                      {medLabel(b)} · Batch {b.batch_number} (Qty: {b.quantity})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Reason Type
                </label>
                <select
                  value={adjPreset}
                  onChange={(e) => setAdjPreset(e.target.value as AdjustmentPreset)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
                >
                  <option value="Damaged">Damaged (-)</option>
                  <option value="Expired">Expired (-)</option>
                  <option value="Returned">Returned (+)</option>
                  <option value="Adjustment">Count Adjustment (+/-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Quantity (Current: {adjModalBatch.quantity})
                </label>
                <div className="flex gap-1.5">
                  {ADJUSTMENT_TYPES[adjPreset].sign === 0 && (
                    <select
                      aria-label="Adjustment direction"
                      value={adjDirection}
                      onChange={(e) => setAdjDirection(e.target.value as "+" | "-")}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2 py-2 text-sm font-mono"
                    >
                      <option value="-">-</option>
                      <option value="+">+</option>
                    </select>
                  )}
                  <input
                    type="number"
                    min={1}
                    required
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {ADJUSTMENT_TYPES[adjPreset].hint}
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Audit Note
              </label>
              <input
                type="text"
                required
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Reason for adjustment..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdjModalBatch(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjSaving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {adjSaving ? "Saving..." : "Apply Adjustment"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(writeOffBatch)}
        title="Write Off Expired Batch"
        description={`Set batch ${writeOffBatch?.batch_number ?? ""} (${
          writeOffBatch ? medLabel(writeOffBatch) : ""
        }) quantity from ${writeOffBatch?.quantity ?? 0} to 0 and log an EXPIRED audit transaction?`}
        confirmLabel="Write Off Stock"
        tone="danger"
        busy={writingOff}
        onConfirm={handleWriteOffSingle}
        onCancel={() => setWriteOffBatch(null)}
      />

      <ConfirmDialog
        open={writeOffAllOpen}
        title="Write Off All Expired Batches"
        description={`Remove all ${expiredBatches.length} expired batch(es) from stock and record EXPIRED audit rows?`}
        confirmLabel="Write Off All"
        tone="danger"
        busy={writingOff}
        onConfirm={handleWriteOffAll}
        onCancel={() => setWriteOffAllOpen(false)}
      />
    </div>
  );
}
