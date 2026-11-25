import type { CartItem } from "../types/pharmacy";

export function formatMoney(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  return (
    "\u20B1" +
    (Number.isFinite(num) ? num : 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function formatCount(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return (Number.isFinite(num) ? num : 0).toLocaleString("en-PH");
}

export function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const normalized = dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDaysRemaining(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days);
    return `${abs} day${abs === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function medLabel(m: {
  medicine_name?: string | null;
  strength?: string | null;
}): string {
  return [m.medicine_name, m.strength].filter(Boolean).join(" ").trim() || "Unknown Medicine";
}

const MEDICINE_SEARCH_FIELDS = [
  "medicine_code",
  "medicine_name",
  "generic_name",
  "category_name",
  "dosage_form",
  "strength",
  "batch_number",
] as const;

export function medicineMatches(
  row: Record<string, unknown>,
  query: string
): boolean {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const haystack = MEDICINE_SEARCH_FIELDS.map((field) =>
    String(row[field] ?? "")
  )
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function searchMedicines<T extends Record<string, unknown>>(
  list: T[],
  query: string
): T[] {
  if (!query.trim()) return list;
  return list.filter((item) => medicineMatches(item, query));
}

export interface FefoBatchSlice {
  qty: number;
  price: number;
}

/**
 * Calculates total price using First-Expired-First-Out (FEFO) batch slices.
 */
export function calculateFefoTotal(
  batches: readonly FefoBatchSlice[],
  quantity: number
): number {
  let remaining = quantity;
  let total = 0;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, batch.qty);
    total += taken * batch.price;
    remaining -= taken;
  }
  return Math.round(total * 100) / 100;
}

export function calculateCartTotal(
  batchesByMedicine: Record<number, readonly FefoBatchSlice[]>,
  cart: readonly Pick<CartItem, "medicine_id" | "qty">[]
): number {
  const total = cart.reduce((sum, line) => {
    const batches = batchesByMedicine[line.medicine_id] || [];
    return sum + calculateFefoTotal(batches, line.qty);
  }, 0);
  return Math.round(total * 100) / 100;
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escapeCell = (v: string | number | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCell).join(",")].concat(
    rows.map((r) => r.map(escapeCell).join(","))
  );
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
