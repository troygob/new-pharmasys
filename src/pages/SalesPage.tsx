import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
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
  calculateCartTotal,
  type FefoBatchSlice,
  formatDateTime,
  formatMoney,
  medLabel,
  searchMedicines,
} from "../lib/utils";
import type {
  CartItem,
  InventoryBatch,
  Medicine,
  PaymentMethod,
  Prescription,
  SaleReceipt,
  SaleSummary,
} from "../types/pharmacy";

interface CatalogItem extends Medicine {
  price: number;
}

export function SalesPage({
  initialPrescriptionId,
  onConsumeInitialPrescription,
}: {
  initialPrescriptionId?: number | null;
  onConsumeInitialPrescription?: () => void;
}) {
  const { profile, settings } = useAuth();
  const { notify } = useToast();
  const canProcess = hasPermission(profile?.role, "process_sales");

  const [tab, setTab] = useState<"pos" | "history">(
    canProcess ? "pos" : "history"
  );
  const [mobilePosPane, setMobilePosPane] = useState<"catalog" | "cart">("catalog");

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [medSearch, setMedSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [discount, setDiscount] = useState("0");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [attachedRx, setAttachedRx] = useState<Prescription | null>(null);

  // Payment modal state
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [cashTendered, setCashTendered] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);

  // Receipt modal state
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [receiptIsReprint, setReceiptIsReprint] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [medsData, batchData, rxData, salesData] = await Promise.all([
        api.getMedicines(),
        api.getInventoryBatches(),
        api.getPrescriptions().catch(() => [] as Prescription[]),
        api.getSales(60),
      ]);
      setMedicines(medsData);
      setBatches(batchData);
      setPrescriptions(
        rxData.filter((r) =>
          ["Pending", "Partially Dispensed"].includes(r.status)
        )
      );
      setSales(salesData);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not load sales workspace.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Single-pass FEFO batch indexing & expired-only detection (eliminates 3x redundant queries)
  const { catalog, batchesByMedicine, blockedExpired } = useMemo(() => {
    const validByMed: Record<number, FefoBatchSlice[]> = {};
    const expiredOnlyMap = new Map<
      number,
      { medicine_id: number; medicine_name: string; strength: string | null; medicine_code: string; quantity: number; batches: string[] }
    >();

    for (const b of batches) {
      if (b.quantity <= 0) continue;
      if (b.expiry_status === "Expired") {
        const entry = expiredOnlyMap.get(b.medicine_id) ?? {
          medicine_id: b.medicine_id,
          medicine_name: b.medicine_name,
          strength: b.strength,
          medicine_code: b.medicine_code,
          quantity: 0,
          batches: [],
        };
        entry.quantity += b.quantity;
        entry.batches.push(`${b.batch_number} (expired ${b.expiration_date})`);
        expiredOnlyMap.set(b.medicine_id, entry);
      } else {
        (validByMed[b.medicine_id] ??= []).push({
          qty: b.quantity,
          price: b.selling_price,
        });
      }
    }

    const cat: CatalogItem[] = [];
    for (const m of medicines) {
      if (m.status !== "Active" || m.quantity_on_hand <= 0) continue;
      const slices = validByMed[m.medicine_id];
      if (!slices?.length) continue;
      cat.push({ ...m, price: slices[0].price });
    }

    const blocked = [...expiredOnlyMap.values()].filter(
      (e) => !(e.medicine_id in validByMed)
    );

    return {
      catalog: cat,
      batchesByMedicine: validByMed,
      blockedExpired: blocked,
    };
  }, [batches, medicines]);

  // Auto-attach prescription if navigated from Prescriptions page
  const attachPrescription = useCallback(
    (rx: Prescription) => {
      setAttachedRx(rx);
      setCustomerName(rx.patient_name);
      const nextCart: CartItem[] = [];
      for (const item of rx.items) {
        const remainingOnRx = item.quantity - item.quantity_dispensed;
        if (remainingOnRx <= 0) continue;
        const catItem = catalog.find((c) => c.medicine_id === item.medicine_id);
        if (!catItem) continue;
        const maxQty = Math.min(catItem.quantity_on_hand, remainingOnRx);
        if (maxQty <= 0) continue;
        nextCart.push({
          medicine_id: catItem.medicine_id,
          code: catItem.medicine_code,
          label: medLabel(catItem),
          price: catItem.price,
          max: maxQty,
          qty: maxQty,
          requires_prescription: catItem.requires_prescription,
        });
      }
      setCart(nextCart);
      setTab("pos");
      notify(`Attached prescription ${rx.prescription_no}.`, "info");
    },
    [catalog, notify]
  );

  useEffect(() => {
    if (!initialPrescriptionId || !prescriptions.length || !catalog.length) return;
    const match = prescriptions.find(
      (p) => p.prescription_id === initialPrescriptionId
    );
    if (match) {
      attachPrescription(match);
      onConsumeInitialPrescription?.();
    }
  }, [
    initialPrescriptionId,
    prescriptions,
    catalog.length,
    attachPrescription,
    onConsumeInitialPrescription,
  ]);

  const filteredCatalog = useMemo(() => {
    return searchMedicines(
      catalog as unknown as Record<string, unknown>[],
      medSearch
    ).slice(0, 12) as unknown as CatalogItem[];
  }, [catalog, medSearch]);

  const matchedBlocked = useMemo(() => {
    if (!medSearch.trim()) return [];
    return searchMedicines(
      blockedExpired as unknown as Record<string, unknown>[],
      medSearch
    ) as typeof blockedExpired;
  }, [blockedExpired, medSearch]);

  const addToCart = (item: CatalogItem) => {
    if (item.requires_prescription && !attachedRx) {
      notify(
        `${medLabel(item)} requires a prescription. Attach an Rx first.`,
        "error"
      );
      return;
    }

    let maxAllowed = item.quantity_on_hand;
    if (attachedRx) {
      const rxItem = attachedRx.items.find(
        (i) => i.medicine_id === item.medicine_id
      );
      const remaining = rxItem ? rxItem.quantity - rxItem.quantity_dispensed : 0;
      if (remaining <= 0) {
        notify(
          `${medLabel(item)} is not remaining on ${attachedRx.prescription_no}.`,
          "error"
        );
        return;
      }
      maxAllowed = Math.min(maxAllowed, remaining);
    }

    setCart((prev) => {
      const idx = prev.findIndex((c) => c.medicine_id === item.medicine_id);
      if (idx >= 0) {
        const existing = prev[idx];
        if (existing.qty >= maxAllowed) {
          notify(`Maximum available (${maxAllowed}) reached for ${existing.label}.`, "info");
          return prev;
        }
        return prev.map((c, i) => (i === idx ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...prev,
        {
          medicine_id: item.medicine_id,
          code: item.medicine_code,
          label: medLabel(item),
          price: item.price,
          max: maxAllowed,
          qty: 1,
          requires_prescription: item.requires_prescription,
        },
      ];
    });
  };

  const updateCartQty = (medicineId: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.medicine_id !== medicineId));
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.medicine_id === medicineId
          ? { ...c, qty: Math.min(Math.max(1, Math.floor(qty)), c.max) }
          : c
      )
    );
  };

  const detachPrescription = () => {
    setAttachedRx(null);
    setCustomerName("Walk-in Customer");
    setCart((prev) => prev.filter((c) => !c.requires_prescription));
  };

  const subtotal = useMemo(
    () => calculateCartTotal(batchesByMedicine, cart),
    [batchesByMedicine, cart]
  );
  const numericDiscount = Math.max(0, Number(discount) || 0);
  const netTotal = Math.max(0, Math.round((subtotal - numericDiscount) * 100) / 100);
  const totalUnits = cart.reduce((s, c) => s + c.qty, 0);

  const openPaymentModal = () => {
    if (!cart.length) return;
    if (numericDiscount > subtotal) {
      notify("Discount cannot exceed cart subtotal.", "error");
      return;
    }
    if (netTotal <= 0) {
      notify("Net total must be greater than zero.", "error");
      return;
    }
    setPayMethod("Cash");
    setCashTendered("");
    setPayRef("");
    setPayError("");
    setPayOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (paying) return;
    setPayError("");

    let tenderedVal: number | null = null;
    if (payMethod === "Cash") {
      tenderedVal = Number(cashTendered);
      if (!cashTendered || !Number.isFinite(tenderedVal) || tenderedVal <= 0) {
        setPayError("Enter the cash amount received.");
        return;
      }
      if (Math.round(tenderedVal * 100) < Math.round(netTotal * 100)) {
        setPayError(
          `Insufficient cash: ${formatMoney(netTotal - tenderedVal)} short.`
        );
        return;
      }
    }

    setPaying(true);
    try {
      const saleId = await api.checkoutSale({
        items: cart.map((c) => ({ medicine_id: c.medicine_id, quantity: c.qty })),
        customer_name: customerName.trim() || "Walk-in Customer",
        prescription_id: attachedRx?.prescription_id ?? null,
        discount: numericDiscount,
        payment_method: payMethod,
        amount_tendered: tenderedVal,
        reference_no: payMethod === "Cash" ? null : payRef.trim() || null,
      });

      setPayOpen(false);
      setCart([]);
      setAttachedRx(null);
      setDiscount("0");
      setCustomerName("Walk-in Customer");
      notify("Sale completed and inventory updated.", "success");

      const [rcpt] = await Promise.all([api.getSaleReceipt(saleId), loadAll()]);
      setReceiptIsReprint(false);
      setReceipt(rcpt);
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "Could not complete checkout."
      );
    } finally {
      setPaying(false);
    }
  };

  const openReceipt = async (saleId: number) => {
    try {
      const rcpt = await api.getSaleReceipt(saleId);
      setReceiptIsReprint(true);
      setReceipt(rcpt);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not load receipt.", "error");
    }
  };

  const filteredSales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.sale_no.toLowerCase().includes(q) ||
        (s.customer_name || "").toLowerCase().includes(q) ||
        (s.cashier_name || "").toLowerCase().includes(q)
    );
  }, [sales, historySearch]);

  const cashChange = useMemo(() => {
    if (payMethod !== "Cash" || !cashTendered) return 0;
    const diff = Number(cashTendered) - netTotal;
    return diff > 0 ? Math.round(diff * 100) / 100 : 0;
  }, [payMethod, cashTendered, netTotal]);

  return (
    <div className="space-y-5">
      {/* Top Bar + Segmented View Switcher */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Point of Sale &amp; Transactions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Automatic FEFO batch selection with expiry enforcement.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 self-start sm:self-auto">
          {canProcess && (
            <button
              type="button"
              onClick={() => setTab("pos")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === "pos"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              POS Terminal
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === "history"
                ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Sales History ({sales.length})
          </button>
        </div>
      </div>

      {/* POS Terminal */}
      {tab === "pos" && canProcess && (
        <div className="no-print space-y-4">
          {/* Mobile Pane Switcher */}
          <div className="lg:hidden flex items-center gap-2 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setMobilePosPane("catalog")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                mobilePosPane === "catalog"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Catalog ({catalog.length})
            </button>
            <button
              type="button"
              onClick={() => setMobilePosPane("cart")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                mobilePosPane === "cart"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Cart ({totalUnits}) · {formatMoney(netTotal)}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Medicine Search & Rx Attachment */}
            <div
              className={`lg:col-span-7 space-y-4 ${
                mobilePosPane === "cart" ? "hidden lg:block" : ""
              }`}
            >
              {/* Optional Prescription Selector */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>
                      {attachedRx
                        ? `Dispensing Rx ${attachedRx.prescription_no} · ${attachedRx.patient_name}`
                        : "Prescription Dispensing (optional)"}
                    </span>
                  </div>
                  {attachedRx ? (
                    <button
                      type="button"
                      onClick={detachPrescription}
                      className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline self-start sm:self-auto"
                    >
                      Detach Rx
                    </button>
                  ) : (
                    <select
                      aria-label="Attach a pending prescription"
                      value=""
                      onChange={(e) => {
                        const rx = prescriptions.find(
                          (r) => String(r.prescription_id) === e.target.value
                        );
                        if (rx) attachPrescription(rx);
                      }}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                    >
                      <option value="">
                        {prescriptions.length
                          ? `Attach pending Rx (${prescriptions.length})...`
                          : "No pending prescriptions"}
                      </option>
                      {prescriptions.map((r) => (
                        <option key={r.prescription_id} value={r.prescription_id}>
                          {r.prescription_no} — {r.patient_name} ({r.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Search & Catalog Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="relative">
                    <Search
                      className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={medSearch}
                      onChange={(e) => setMedSearch(e.target.value)}
                      placeholder="Search by medicine name, generic, code, strength, or form..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0E151E] pl-9 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                    />
                  </div>
                </div>

                {matchedBlocked.length > 0 && (
                  <div className="px-4 py-3 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 space-y-1">
                    {matchedBlocked.map((b) => (
                      <div
                        key={b.medicine_id}
                        className="flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Sale blocked:</span>{" "}
                          {medLabel(b)} only has expired stock ({b.batches.join(", ")}).
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {loading ? (
                  <TableSkeleton rows={5} cols={4} />
                ) : filteredCatalog.length === 0 ? (
                  <EmptyState
                    title="No sellable medicines match your search"
                    description="Only active medicines with unexpired stock in inventory appear here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-2.5">Medicine</th>
                          <th className="px-4 py-2.5 text-right">Price</th>
                          <th className="px-4 py-2.5 text-right">Stock</th>
                          <th className="px-4 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {filteredCatalog.map((m) => (
                          <tr
                            key={m.medicine_id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {medLabel(m)}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-mono">{m.medicine_code}</span>
                                {" · "}
                                {m.dosage_form}
                                {m.requires_prescription && (
                                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                                    {" · "}Rx required
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {formatMoney(m.price)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {m.quantity_on_hand}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => addToCart(m)}
                                className="inline-flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Add</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Checkout Cart */}
            <div
              className={`lg:col-span-5 ${
                mobilePosPane === "catalog" ? "hidden lg:block" : ""
              }`}
            >
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-4 sm:p-5 space-y-4 lg:sticky lg:top-20">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <h2 className="font-display text-base font-semibold">
                      Current Order
                    </h2>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCart([]);
                        setAttachedRx(null);
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      Clear cart
                    </button>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="pos-customer"
                    className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Customer / Patient Name
                  </label>
                  <input
                    id="pos-customer"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  />
                </div>

                {cart.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    Select medicines from the catalog to start an order.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={item.medicine_id}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {item.label}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {formatMoney(item.price)} each · max {item.max}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQty(item.medicine_id, item.qty - 1)
                            }
                            aria-label={`Decrease ${item.label}`}
                            className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={item.max}
                            value={item.qty}
                            onChange={(e) =>
                              updateCartQty(
                                item.medicine_id,
                                Number(e.target.value)
                              )
                            }
                            aria-label={`Quantity for ${item.label}`}
                            className="w-12 text-center font-mono text-xs tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] py-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQty(item.medicine_id, item.qty + 1)
                            }
                            aria-label={`Increase ${item.label}`}
                            className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.medicine_id, 0)}
                            aria-label={`Remove ${item.label}`}
                            className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Subtotal ({totalUnits} units)</span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
                    <label htmlFor="pos-discount">Discount (&#8369;)</label>
                    <input
                      id="pos-discount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-24 text-right font-mono text-xs tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2 py-1 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 font-display text-base font-semibold">
                    <span>Total Due</span>
                    <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                      {formatMoney(netTotal)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!cart.length}
                  onClick={openPaymentModal}
                  className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40"
                >
                  Proceed to Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales History */}
      {tab === "history" && (
        <div className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search sale no., customer, or cashier..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0E151E] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Showing {filteredSales.length} recent transactions
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filteredSales.length === 0 ? (
            <EmptyState title="No sales match your filter" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Sale No.</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Payment</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredSales.map((s) => (
                    <tr
                      key={s.sale_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">
                        {s.sale_no}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDateTime(s.sale_date)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div>{s.customer_name || "Walk-in Customer"}</div>
                        {s.prescription_no && (
                          <div className="text-xs font-mono text-slate-400">
                            {s.prescription_no}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        {s.payment_methods.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                        {formatMoney(s.total_amount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText
                          label={s.status}
                          tone={s.status === "Completed" ? "success" : "danger"}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openReceipt(s.sale_id)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      <Modal
        open={payOpen}
        onClose={() => !paying && setPayOpen(false)}
        title="Complete Payment"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E151E] p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {customerName || "Walk-in Customer"} · {totalUnits} item(s)
              </div>
              <div className="font-display text-xl font-semibold tabular-nums mt-0.5">
                {formatMoney(netTotal)}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="pay-method"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Payment Method
            </label>
            <select
              id="pay-method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            >
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>

          {payMethod === "Cash" ? (
            <div className="space-y-2">
              <label
                htmlFor="cash-tendered"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Cash Received
              </label>
              <input
                id="cash-tendered"
                type="number"
                min={0}
                step="0.01"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                placeholder={netTotal.toFixed(2)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <span>Change Due</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatMoney(cashChange)}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="pay-ref"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Reference Number (optional)
              </label>
              <input
                id="pay-ref"
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Transaction / Approval code"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          {payError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {payError}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={paying}
              onClick={() => setPayOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={paying}
              onClick={handleConfirmPayment}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {paying ? "Processing..." : "Confirm Payment"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Printable Receipt Modal */}
      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        maxWidthClass="max-w-sm"
      >
        {receipt && (
          <div className="print-sheet font-mono text-xs space-y-3">
            <div className="text-center space-y-0.5">
              <div className="text-sm font-bold">{settings.pharmacy_name}</div>
              {settings.pharmacy_address && (
                <div className="text-slate-500 dark:text-slate-400">
                  {settings.pharmacy_address}
                </div>
              )}
              <div className="pt-1 font-semibold tracking-wider">
                SALES RECEIPT
              </div>
              {receiptIsReprint && <div>*** REPRINT ***</div>}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-0.5">
              <div>Tx: {receipt.sale_no}</div>
              <div>Date: {formatDateTime(receipt.sale_date)}</div>
              {receipt.cashier_name && <div>Staff: {receipt.cashier_name}</div>}
              <div>Customer: {receipt.customer_name || "Walk-in"}</div>
              {receipt.prescription_no && (
                <div>Rx: {receipt.prescription_no}</div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1.5">
              {receipt.items.map((item, idx) => (
                <div key={idx}>
                  <div>{medLabel(item)}</div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400 tabular-nums">
                    <span>
                      &nbsp;&nbsp;{item.quantity} x {formatMoney(item.unit_price)}
                    </span>
                    <span>{formatMoney(item.quantity * item.unit_price)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1 tabular-nums">
              {receipt.discount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>SUBTOTAL</span>
                    <span>{formatMoney(receipt.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DISCOUNT</span>
                    <span>-{formatMoney(receipt.discount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{formatMoney(receipt.total_amount)}</span>
              </div>
              {receipt.payments.map((p, i) => (
                <div key={i} className="space-y-0.5 pt-1">
                  {p.payment_method === "Cash" ? (
                    <>
                      <div className="flex justify-between">
                        <span>CASH</span>
                        <span>{formatMoney(p.amount_tendered)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CHANGE</span>
                        <span>{formatMoney(p.change_amount)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span>{p.payment_method.toUpperCase()}</span>
                      <span>{formatMoney(p.amount)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 text-center text-slate-500 dark:text-slate-400">
              {settings.receipt_footer}
            </div>

            <div className="no-print flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 font-sans">
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
