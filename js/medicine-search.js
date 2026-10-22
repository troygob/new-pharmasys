// medicine-search.js - reusable medicine search (Lab 5).
// Load it after auth.js on any page that lists medicines.
//
//   searchMedicines(list, "paracetamol 500")   -> the matching rows
//   medicineMatches(row, "amox cap")           -> true / false for one row
//
// A row matches when EVERY word typed appears somewhere in its code, name,
// generic name, category, dosage form, strength or batch number (any that exist).
const MEDICINE_SEARCH_FIELDS = [
  "medicine_code", "medicine_name", "generic_name",
  "category_name", "dosage_form", "strength", "batch_number",
];

function medicineMatches(row, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = MEDICINE_SEARCH_FIELDS.map(f => String(row[f] ?? "")).join(" ").toLowerCase();
  return words.every(w => haystack.includes(w));
}

function searchMedicines(list, query) {
  return list.filter(row => medicineMatches(row, query));
}
