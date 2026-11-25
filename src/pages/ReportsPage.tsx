import { useCallback, useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { EmptyState, TableSkeleton } from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import {
  exportCsv,
  formatCount,
  formatDate,
  formatMoney,
  todayIsoDate,
} from "../lib/utils";
import type { ReportOutput } from "../types/pharmacy";

interface ReportDefinition {
  id: string;
  group: string;
  title: string;
  usesDates: boolean;
}

const REPORT_DEFS: ReportDefinition[] = [
  { id: "daily-sales", group: "Sales", title: "Daily Sales Summary", usesDates: true },
  { id: "sales-by-medicine", group: "Sales", title: "Sales by Medicine", usesDates: true },
  { id: "sales-by-cashier", group: "Sales", title: "Sales by Cashier", usesDates: true },
  { id: "payment-summary", group: "Sales", title: "Payment Method Summary", usesDates: true },
  { id: "inventory-stock", group: "Inventory", title: "Current Stock Snapshot", usesDates: false },
  { id: "low-stock", group: "Inventory", title: "Low Stock Reorder List", usesDates: false },
  { id: "stock-in", group: "Purchases & Rx", title: "Stock-In / Supplier Purchases", usesDates: true },
  { id: "expiration", group: "Purchases & Rx", title: "Expiration Report", usesDates: false },
  { id: "prescriptions", group: "Purchases & Rx", title: "Prescription Dispensing Report", usesDates: true },
];

function monthStartIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

export function ReportsPage() {
  const { settings } = useAuth();
  const { notify } = useToast();

  const [reportId, setReportId] = useState("daily-sales");
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIsoDate);
  const [output, setOutput] = useState<ReportOutput | null>(null);
  const [loading, setLoading] = useState(true);

  const activeDef = REPORT_DEFS.find((r) => r.id === reportId) ?? REPORT_DEFS[0];

  const generate = useCallback(async () => {
    if (activeDef.usesDates && fromDate > toDate) {
      notify("Start date cannot be after end date.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.runReport(reportId, fromDate, toDate);
      setOutput(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate report.", "error");
      setOutput(null);
    } finally {
      setLoading(false);
    }
  }, [activeDef.usesDates, fromDate, notify, reportId, toDate]);

  useEffect(() => {
    generate();
  }, [generate]);

  const applyPreset = (kind: "today" | "week" | "month") => {
    const end = new Date();
    const start = new Date();
    if (kind === "week") start.setDate(end.getDate() - 6);
    if (kind === "month") start.setDate(1);
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    setFromDate(fmt(start));
    setToDate(fmt(end));
  };

  const formatCell = (
    val: string | number | null | undefined,
    type?: "text" | "int" | "money" | "date"
  ) => {
    if (val == null || val === "") return "—";
    if (type === "money") return formatMoney(val);
    if (type === "int") return formatCount(val);
    if (type === "date") return formatDate(String(val));
    return String(val);
  };

  const handleExport = () => {
    if (!output) return;
    exportCsv(
      `${reportId}-report-${todayIsoDate()}.csv`,
      output.columns.map((c) => c.label),
      output.rows.map((r) =>
        output.columns.map((c) =>
          c.type === "money" && r[c.key] != null
            ? Number(r[c.key]).toFixed(2)
            : r[c.key]
        )
      )
    );
  };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Pharmacy Reports
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Generate, print, or export operational and financial summaries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!output || output.rows.length === 0}
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            disabled={!output}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <label
            htmlFor="report-select"
            className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
          >
            Report Type
          </label>
          <select
            id="report-select"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
          >
            {["Sales", "Inventory", "Purchases & Rx"].map((grp) => (
              <optgroup key={grp} label={grp}>
                {REPORT_DEFS.filter((r) => r.group === grp).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {activeDef.usesDates && (
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["today", "week", "month"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 capitalize"
                >
                  {preset === "week" ? "7d" : preset === "month" ? "Month" : "Today"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Report Sheet */}
      <div className="print-sheet rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {settings.pharmacy_name}
            </div>
            <h2 className="font-display text-base font-semibold">
              {activeDef.title}
            </h2>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {activeDef.usesDates
              ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
              : `As of ${formatDate(todayIsoDate())}`}
            {output && ` · ${output.rows.length} row(s)`}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : !output || output.rows.length === 0 ? (
          <EmptyState
            title="No records for this period"
            description="Adjust the date range or switch report type."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                <tr>
                  {output.columns.map((c) => (
                    <th
                      key={c.key}
                      className={`px-4 py-2.5 ${
                        c.type === "int" || c.type === "money" ? "text-right" : ""
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {output.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    {output.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2.5 ${
                          c.type === "int" || c.type === "money"
                            ? "text-right font-mono tabular-nums"
                            : ""
                        }`}
                      >
                        {formatCell(row[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {output.totals && (
                <tfoot className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-[#111923] font-semibold">
                  <tr>
                    {output.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2.5 ${
                          c.type === "int" || c.type === "money"
                            ? "text-right font-mono tabular-nums"
                            : ""
                        }`}
                      >
                        {output.totals?.[c.key] === "Total"
                          ? "Total"
                          : output.totals?.[c.key] === "" ||
                              output.totals?.[c.key] == null
                            ? ""
                            : formatCell(output.totals[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
