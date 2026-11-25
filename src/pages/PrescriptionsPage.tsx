import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Printer, Search, ShoppingBag, Trash2 } from "lucide-react";
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
import { formatDate, medLabel, todayIsoDate } from "../lib/utils";
import type { Medicine, Prescription, PrescriptionStatus } from "../types/pharmacy";

interface DraftRxLine {
  medicine_id: string;
  quantity: string;
  dosage_instructions: string;
}

export function PrescriptionsPage({
  onDispenseInPos,
}: {
  onDispenseInPos: (prescriptionId: number) => void;
}) {
  const { profile, settings } = useAuth();
  const { notify } = useToast();
  const canManage = hasPermission(profile?.role, "manage_prescriptions");
  const canProcessSale = hasPermission(profile?.role, "process_sales");

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rxNo, setRxNo] = useState("");
  const [rxDate, setRxDate] = useState(todayIsoDate());
  const [patientName, setPatientName] = useState("");
  const [patientContact, setPatientContact] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftRxLine[]>([
    { medicine_id: "", quantity: "1", dosage_instructions: "" },
  ]);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState<Prescription | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Print preview
  const [printRx, setPrintRx] = useState<Prescription | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rxList, medList] = await Promise.all([
        api.getPrescriptions(),
        api.getMedicines(),
      ]);
      setPrescriptions(rxList);
      setMedicines(medList.filter((m) => m.status === "Active"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not load prescriptions.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateNextRxNo = () => {
    const compact = todayIsoDate().replace(/-/g, "");
    const prefix = `RX-${compact}-`;
    const nums = prescriptions
      .filter((r) => r.prescription_no.startsWith(prefix))
      .map((r) => parseInt(r.prescription_no.slice(prefix.length), 10) || 0);
    return `${prefix}${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
  };

  const openCreateModal = () => {
    setRxNo(generateNextRxNo());
    setRxDate(todayIsoDate());
    setPatientName("");
    setPatientContact("");
    setDoctorName("");
    setLicenseNo("");
    setNotes("");
    setLines([{ medicine_id: "", quantity: "1", dosage_instructions: "" }]);
    setCreateOpen(true);
  };

  const handleSaveRx = async (e: FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.medicine_id && Number(l.quantity) > 0);
    if (!validLines.length) {
      notify("Add at least one medicine with quantity greater than 0.", "error");
      return;
    }
    const medIds = validLines.map((l) => l.medicine_id);
    if (new Set(medIds).size !== medIds.length) {
      notify("Duplicate medicine in prescription items. Combine them into one row.", "error");
      return;
    }

    setSaving(true);
    try {
      await api.createPrescription({
        prescription_no: rxNo,
        patient_name: patientName,
        patient_contact: patientContact || null,
        doctor_name: doctorName,
        prescriber_license: licenseNo || null,
        prescription_date: rxDate,
        notes: notes || null,
        items: validLines.map((l) => ({
          medicine_id: Number(l.medicine_id),
          quantity: Number(l.quantity),
          dosage_instructions: l.dosage_instructions || null,
        })),
      });
      setCreateOpen(false);
      notify("Prescription recorded.", "success");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save prescription.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRx = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.cancelPrescription(cancelTarget.prescription_id);
      notify(`Cancelled ${cancelTarget.prescription_no}.`, "info");
      setCancelTarget(null);
      setSelectedRx(null);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not cancel prescription.", "error");
    } finally {
      setCancelling(false);
    }
  };

  const statusTone = (status: PrescriptionStatus) => {
    if (status === "Fully Dispensed") return "success";
    if (status === "Cancelled") return "danger";
    return "warning";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prescriptions.filter((rx) => {
      if (statusFilter !== "All" && rx.status !== statusFilter) return false;
      if (!q) return true;
      return [rx.prescription_no, rx.patient_name, rx.doctor_name].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [prescriptions, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Prescriptions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Track prescriber orders, dosage instructions, and dispensing progress.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors self-start sm:self-auto whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Prescription</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="no-print flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Rx no., patient, or doctor..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        <select
          aria-label="Filter prescriptions by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-sm"
        >
          <option value="All">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partially Dispensed">Partially Dispensed</option>
          <option value="Fully Dispensed">Fully Dispensed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Prescriptions Table */}
      <div className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No prescriptions found"
            description="Create a prescription order to link controlled medicines to POS dispensing."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Rx No.</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Patient</th>
                  <th className="px-4 py-2.5">Prescriber</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((rx) => (
                  <tr
                    key={rx.prescription_id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      {rx.prescription_no}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(rx.prescription_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{rx.patient_name}</div>
                      {rx.patient_contact && (
                        <div className="text-xs text-slate-400">
                          {rx.patient_contact}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {rx.doctor_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusText
                        label={rx.status}
                        tone={statusTone(rx.status)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      {canProcessSale &&
                        ["Pending", "Partially Dispensed"].includes(rx.status) && (
                          <button
                            type="button"
                            onClick={() => onDispenseInPos(rx.prescription_id)}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-700 px-2.5 py-1 text-xs font-medium text-white transition-colors"
                          >
                            <ShoppingBag className="h-3 w-3" />
                            <span>Dispense</span>
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => setSelectedRx(rx)}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rx Detail Modal */}
      <Modal
        open={Boolean(selectedRx)}
        onClose={() => setSelectedRx(null)}
        title={selectedRx ? `Prescription ${selectedRx.prescription_no}` : ""}
        maxWidthClass="max-w-xl"
      >
        {selectedRx && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Patient</div>
                <div className="font-medium">{selectedRx.patient_name}</div>
                {selectedRx.patient_contact && (
                  <div className="text-xs text-slate-500">{selectedRx.patient_contact}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Prescriber</div>
                <div className="font-medium">{selectedRx.doctor_name}</div>
                {selectedRx.prescriber_license && (
                  <div className="text-xs font-mono text-slate-500">
                    Lic: {selectedRx.prescriber_license}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Date</div>
                <div>{formatDate(selectedRx.prescription_date)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Status</div>
                <StatusText
                  label={selectedRx.status}
                  tone={statusTone(selectedRx.status)}
                />
              </div>
            </div>

            {selectedRx.notes && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E151E] p-3 text-xs text-slate-600 dark:text-slate-300">
                {selectedRx.notes}
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#111923] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2 text-right">Prescribed</th>
                    <th className="px-3 py-2 text-right">Dispensed</th>
                    <th className="px-3 py-2">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedRx.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">
                        {medLabel(item)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {item.quantity_dispensed}
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {item.dosage_instructions || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintRx(selectedRx);
                    setSelectedRx(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print View</span>
                </button>
                {canManage && selectedRx.status === "Pending" && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(selectedRx)}
                    className="rounded-lg border border-rose-200 dark:border-rose-900/60 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Cancel Rx
                  </button>
                )}
              </div>

              {canProcessSale &&
                ["Pending", "Partially Dispensed"].includes(selectedRx.status) && (
                  <button
                    type="button"
                    onClick={() => onDispenseInPos(selectedRx.prescription_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-medium text-white"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    <span>Dispense in POS</span>
                  </button>
                )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create Rx Modal */}
      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="New Prescription"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveRx} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Prescription No.
              </label>
              <input
                type="text"
                required
                value={rxNo}
                onChange={(e) => setRxNo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Prescription Date
              </label>
              <input
                type="date"
                required
                max={todayIsoDate()}
                value={rxDate}
                onChange={(e) => setRxDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Patient Name
              </label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Patient Contact
              </label>
              <input
                type="text"
                value={patientContact}
                onChange={(e) => setPatientContact(e.target.value)}
                placeholder="Optional phone"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Prescriber / Doctor
              </label>
              <input
                type="text"
                required
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr. ..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                License No.
              </label>
              <input
                type="text"
                value={licenseNo}
                onChange={(e) => setLicenseNo(e.target.value)}
                placeholder="PRC / License"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Prescribed Medicines
              </span>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { medicine_id: "", quantity: "1", dosage_instructions: "" },
                  ])
                }
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                + Add medicine row
              </button>
            </div>

            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <select
                  required
                  value={line.medicine_id}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, medicine_id: e.target.value } : l
                      )
                    )
                  }
                  className="sm:col-span-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-2 text-xs"
                >
                  <option value="">Select medicine...</option>
                  {medicines.map((m) => (
                    <option key={m.medicine_id} value={m.medicine_id}>
                      {m.medicine_code} — {medLabel(m)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, quantity: e.target.value } : l
                      )
                    )
                  }
                  placeholder="Qty"
                  className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-2 text-xs font-mono tabular-nums"
                />
                <input
                  type="text"
                  value={line.dosage_instructions}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx
                          ? { ...l, dosage_instructions: e.target.value }
                          : l
                      )
                    )
                  }
                  placeholder="Sig / dosage instructions"
                  className="sm:col-span-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-2.5 py-2 text-xs"
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove row"
                    className="sm:col-span-1 flex justify-center text-slate-400 hover:text-rose-600 p-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Clinical Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional pharmacist notes"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Prescription"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Print Rx Modal */}
      <Modal
        open={Boolean(printRx)}
        onClose={() => setPrintRx(null)}
        maxWidthClass="max-w-lg"
      >
        {printRx && (
          <div className="print-sheet space-y-4 text-sm">
            <div className="text-center border-b border-slate-300 dark:border-slate-700 pb-3">
              <div className="font-display text-lg font-bold">
                {settings.pharmacy_name}
              </div>
              {settings.pharmacy_address && (
                <div className="text-xs text-slate-500">
                  {settings.pharmacy_address}
                </div>
              )}
              <div className="mt-1 text-xs font-semibold tracking-widest">
                PRESCRIPTION SUMMARY
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <strong>Rx No:</strong> {printRx.prescription_no}
              </div>
              <div>
                <strong>Date:</strong> {formatDate(printRx.prescription_date)}
              </div>
              <div>
                <strong>Patient:</strong> {printRx.patient_name}
              </div>
              <div>
                <strong>Prescriber:</strong> {printRx.doctor_name}
              </div>
            </div>

            <table className="w-full text-left text-xs border-t border-b border-slate-300 dark:border-slate-700">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5">Medicine</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 pl-3">Instructions</th>
                </tr>
              </thead>
              <tbody>
                {printRx.items.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="py-1.5">{medLabel(item)}</td>
                    <td className="py-1.5 text-right font-mono">{item.quantity}</td>
                    <td className="py-1.5 pl-3">{item.dosage_instructions || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="no-print flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrintRx(null)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Prescription"
        description={`Cancel ${cancelTarget?.prescription_no ?? ""}? It will no longer be eligible for dispensing.`}
        confirmLabel="Cancel Rx"
        tone="danger"
        busy={cancelling}
        onConfirm={handleCancelRx}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
