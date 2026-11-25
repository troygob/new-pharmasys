import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
  EmptyState,
  StatTile,
  StatusText,
  TableSkeleton,
} from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { canAccessModule } from "../lib/rbac";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDaysRemaining,
  formatMoney,
  medLabel,
} from "../lib/utils";
import type {
  DashboardSummary,
  InventoryBatch,
  InventoryTransaction,
  LowStockItem,
  ModuleId,
} from "../types/pharmacy";

export function DashboardPage({
  onNavigate,
}: {
  onNavigate: (mod: ModuleId) => void;
}) {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [expiring, setExpiring] = useState<InventoryBatch[]>([]);
  const [recentTx, setRecentTx] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const canInventory = canAccessModule(profile?.role, "inventory");
      const [dash, low, batches, txs] = await Promise.all([
        api.getDashboard(),
        canInventory ? api.getLowStock() : Promise.resolve([]),
        canInventory ? api.getInventoryBatches() : Promise.resolve([]),
        canInventory ? api.getInventoryTransactions(8) : Promise.resolve([]),
      ]);
      setSummary(dash);
      setLowStock(low.slice(0, 5));
      setExpiring(
        batches
          .filter((b) => b.quantity > 0 && b.expiry_status !== "Valid")
          .slice(0, 5)
      );
      setRecentTx(txs);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load dashboard metrics."
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadData();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const navIfAllowed = (mod: ModuleId) =>
    canAccessModule(profile?.role, mod) ? () => onNavigate(mod) : undefined;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Operations Overview
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
              : "Loading live pharmacy metrics"}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canAccessModule(profile?.role, "sales") && (
            <button
              type="button"
              onClick={() => onNavigate("sales")}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors whitespace-nowrap"
            >
              Open Point of Sale
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadData();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Primary 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Today's Sales"
          value={summary ? formatMoney(summary.todays_sales) : "—"}
          note={
            summary
              ? `${formatCount(summary.todays_transactions)} completed transaction${summary.todays_transactions === 1 ? "" : "s"}`
              : "Loading"
          }
          onClick={navIfAllowed("sales")}
        />
        <StatTile
          label="Low Stock Alerts"
          value={summary ? formatCount(summary.low_stock) : "—"}
          note="Active items at or below reorder level"
          tone={summary && summary.low_stock > 0 ? "warning" : "success"}
          onClick={navIfAllowed("inventory")}
        />
        <StatTile
          label="Expiring / Expired Batches"
          value={
            summary
              ? formatCount(
                  summary.expiring_soon_batches + summary.expired_batches
                )
              : "—"
          }
          note={
            summary
              ? `${summary.expired_batches} expired · ${summary.expiring_soon_batches} expiring soon`
              : "Loading"
          }
          tone={
            summary && summary.expired_batches > 0
              ? "danger"
              : summary && summary.expiring_soon_batches > 0
                ? "warning"
                : "success"
          }
          onClick={navIfAllowed("expiration")}
        />
        <StatTile
          label="Pending Prescriptions"
          value={summary ? formatCount(summary.pending_prescriptions) : "—"}
          note={
            summary
              ? `${formatCount(summary.total_medicines)} active catalog items`
              : "Loading"
          }
          tone={summary && summary.pending_prescriptions > 0 ? "warning" : "neutral"}
          onClick={navIfAllowed("prescriptions")}
        />
      </div>

      {/* Action Queues (Visible to Inventory & Clinical Roles) */}
      {canAccessModule(profile?.role, "inventory") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expiring & Expired Queue */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">
                Expiration Watchlist
              </h2>
              <button
                type="button"
                onClick={() => onNavigate("expiration")}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : expiring.length === 0 ? (
              <EmptyState
                title="All stocked batches are valid"
                description="No batches are currently expired or within the expiring-soon threshold."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Medicine · Batch</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5">Expiry</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {expiring.map((b) => (
                      <tr
                        key={b.inventory_id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {medLabel(b)}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {b.batch_number}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {b.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <div>{formatDate(b.expiration_date)}</div>
                          <div className="text-slate-400">
                            {formatDaysRemaining(b.days_to_expiry)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusText
                            label={b.expiry_status}
                            tone={
                              b.expiry_status === "Expired" ? "danger" : "warning"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Low Stock Reorder Queue */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">
                Low Stock &amp; Reorder Queue
              </h2>
              <button
                type="button"
                onClick={() => onNavigate("stock-in")}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                <span>Receive stock</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : lowStock.length === 0 ? (
              <EmptyState
                title="Stock levels are healthy"
                description="Every active medicine is currently above its configured reorder threshold."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-4 py-2.5 text-right">On Hand</th>
                      <th className="px-4 py-2.5 text-right">Reorder At</th>
                      <th className="px-4 py-2.5 text-right">Suggested</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {lowStock.map((item) => (
                      <tr
                        key={item.medicine_id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {medLabel(item)}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {item.medicine_code} · {item.category_name || "Uncategorized"}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                          {item.quantity_on_hand}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {item.reorder_level}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-teal-700 dark:text-teal-400">
                          +{item.suggested_reorder_qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Recent Inventory Activity */}
      {canAccessModule(profile?.role, "stock-adjustment") && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">
              Recent Stock Movements
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("stock-adjustment")}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              <span>Full audit log</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : recentTx.length === 0 ? (
            <EmptyState title="No recent stock movements recorded." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Medicine · Batch</th>
                    <th className="px-4 py-2.5 text-right">Change</th>
                    <th className="px-4 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {recentTx.map((tx) => (
                    <tr
                      key={tx.transaction_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDateTime(tx.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText
                          label={tx.transaction_type.replace("_", " ")}
                          tone={
                            tx.quantity_change > 0
                              ? "success"
                              : tx.transaction_type === "EXPIRED" ||
                                  tx.transaction_type === "DAMAGED"
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
                          <span className="ml-2 text-xs font-mono text-slate-500 dark:text-slate-400">
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
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {tx.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
