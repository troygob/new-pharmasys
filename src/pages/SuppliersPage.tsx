import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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
import { formatMoney, medLabel } from "../lib/utils";
import type { Medicine, MedicineSupplierLink, Supplier } from "../types/pharmacy";

export function SuppliersPage({
  activeTab,
  onTabChange,
}: {
  activeTab: "suppliers" | "medicine-suppliers";
  onTabChange: (t: "suppliers" | "medicine-suppliers") => void;
}) {
  const { profile } = useAuth();
  const { notify } = useToast();
  const canManage = hasPermission(profile?.role, "manage_suppliers");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [links, setLinks] = useState<MedicineSupplierLink[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("Active");

  // Supplier Modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editingSup, setEditingSup] = useState<Supplier | null>(null);
  const [supCode, setSupCode] = useState("");
  const [supName, setSupName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [savingSup, setSavingSup] = useState(false);

  // Supply Link Modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<MedicineSupplierLink | null>(null);
  const [linkMedId, setLinkMedId] = useState("");
  const [linkSupId, setLinkSupId] = useState("");
  const [linkPrice, setLinkPrice] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  // Confirms
  const [toggleSup, setToggleSup] = useState<Supplier | null>(null);
  const [removeLink, setRemoveLink] = useState<MedicineSupplierLink | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [supData, linkData, medData] = await Promise.all([
        api.getSuppliers(),
        api.getMedicineSuppliers(),
        api.getMedicines(),
      ]);
      setSuppliers(supData);
      setLinks(linkData);
      setMedicines(medData.filter((m) => m.status === "Active"));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not load suppliers.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nextSupCode = () => {
    const nums = suppliers
      .map((s) => /^SUP(\d+)$/i.exec(s.supplier_code))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => parseInt(m[1], 10));
    return `SUP${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  };

  const openAddSup = () => {
    setEditingSup(null);
    setSupCode(nextSupCode());
    setSupName("");
    setContactPerson("");
    setContactNo("");
    setEmail("");
    setAddress("");
    setSupModalOpen(true);
  };

  const openEditSup = (s: Supplier) => {
    setEditingSup(s);
    setSupCode(s.supplier_code);
    setSupName(s.supplier_name);
    setContactPerson(s.contact_person || "");
    setContactNo(s.contact_no || "");
    setEmail(s.email || "");
    setAddress(s.address || "");
    setSupModalOpen(true);
  };

  const handleSaveSup = async (e: FormEvent) => {
    e.preventDefault();
    if (contactNo.trim() && !/^[0-9+\-\s()]{7,20}$/.test(contactNo.trim())) {
      notify("Enter a valid contact number.", "error");
      return;
    }
    setSavingSup(true);
    try {
      await api.saveSupplier({
        supplier_id: editingSup?.supplier_id,
        supplier_code: supCode,
        supplier_name: supName,
        contact_person: contactPerson || null,
        contact_no: contactNo || null,
        email: email || null,
        address: address || null,
      });
      setSupModalOpen(false);
      notify(editingSup ? "Supplier updated." : "Supplier added.", "success");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save supplier.", "error");
    } finally {
      setSavingSup(false);
    }
  };

  const handleSaveLink = async (e: FormEvent) => {
    e.preventDefault();
    const price = parseFloat(linkPrice);
    if (Number.isNaN(price) || price < 0) {
      notify("Enter a valid purchase price.", "error");
      return;
    }
    setSavingLink(true);
    try {
      await api.saveMedicineSupplier({
        medicine_supplier_id: editingLink?.medicine_supplier_id,
        medicine_id: Number(linkMedId),
        supplier_id: Number(linkSupId),
        purchase_price: price,
      });
      setLinkModalOpen(false);
      notify("Supply pricing saved.", "success");
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save link.", "error");
    } finally {
      setSavingLink(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (statusFilter !== "All" && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.supplier_code, s.supplier_name, s.contact_person, s.email].some(
        (v) => (v || "").toLowerCase().includes(q)
      );
    });
  }, [suppliers, search, statusFilter]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter((l) =>
      [l.medicine_name, l.medicine_code, l.supplier_name, l.supplier_code].some(
        (v) => (v || "").toLowerCase().includes(q)
      )
    );
  }, [links, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            {activeTab === "suppliers"
              ? "Supplier Directory"
              : "Supply Pricing Links"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage distributors and agreed unit purchase prices per medicine.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => onTabChange("suppliers")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === "suppliers"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Suppliers ({suppliers.length})
            </button>
            <button
              type="button"
              onClick={() => onTabChange("medicine-suppliers")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === "medicine-suppliers"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Supply Pricing ({links.length})
            </button>
          </div>

          {canManage && activeTab === "suppliers" && (
            <button
              type="button"
              onClick={openAddSup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Supplier</span>
            </button>
          )}
          {canManage && activeTab === "medicine-suppliers" && (
            <button
              type="button"
              onClick={() => {
                setEditingLink(null);
                setLinkMedId(medicines[0] ? String(medicines[0].medicine_id) : "");
                setLinkSupId(
                  suppliers.find((s) => s.status === "Active")?.supplier_id.toString() || ""
                );
                setLinkPrice("");
                setLinkModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Assign Price</span>
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
              activeTab === "suppliers"
                ? "Search code, supplier name, contact, email..."
                : "Search medicine or supplier..."
            }
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        {activeTab === "suppliers" && (
          <select
            aria-label="Filter suppliers by status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "All" | "Active" | "Inactive")
            }
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] px-3 py-2 text-sm"
          >
            <option value="Active">Active only</option>
            <option value="Inactive">Inactive only</option>
            <option value="All">All statuses</option>
          </select>
        )}
      </div>

      {activeTab === "suppliers" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState title="No suppliers match your filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5">Contact</th>
                    <th className="px-4 py-2.5">Status</th>
                    {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredSuppliers.map((s) => (
                    <tr
                      key={s.supplier_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {s.supplier_code}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{s.supplier_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {s.address || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <div>{s.contact_person || "—"}</div>
                        <div className="text-slate-400">
                          {[s.contact_no, s.email].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText
                          label={s.status}
                          tone={s.status === "Active" ? "success" : "danger"}
                        />
                      </td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditSup(s)}
                            className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setToggleSup(s)}
                            className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            {s.status === "Active" ? "Deactivate" : "Activate"}
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
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filteredLinks.length === 0 ? (
            <EmptyState title="No medicine-supplier price links found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Medicine</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5 text-right">Agreed Cost</th>
                    {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredLinks.map((l) => (
                    <tr
                      key={l.medicine_supplier_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{medLabel(l)}</div>
                        <div className="text-xs font-mono text-slate-400">
                          {l.medicine_code}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div>{l.supplier_name || "—"}</div>
                        <div className="text-xs font-mono text-slate-400">
                          {l.supplier_code}
                          {l.supplier_status === "Inactive" && " · Inactive"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                        {formatMoney(l.purchase_price)}
                      </td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLink(l);
                              setLinkMedId(String(l.medicine_id));
                              setLinkSupId(String(l.supplier_id));
                              setLinkPrice(l.purchase_price.toFixed(2));
                              setLinkModalOpen(true);
                            }}
                            className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Edit Price
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveLink(l)}
                            aria-label="Remove link"
                            className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* Supplier Modal */}
      <Modal
        open={supModalOpen}
        onClose={() => !savingSup && setSupModalOpen(false)}
        title={editingSup ? "Edit Supplier" : "Add Supplier"}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveSup} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Code
              </label>
              <input
                type="text"
                required
                value={supCode}
                onChange={(e) => setSupCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Supplier Name
              </label>
              <input
                type="text"
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setSupModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSup}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {savingSup ? "Saving..." : "Save Supplier"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supply Link Modal */}
      <Modal
        open={linkModalOpen}
        onClose={() => !savingLink && setLinkModalOpen(false)}
        title={editingLink ? "Update Agreed Purchase Price" : "Assign Supplier Price"}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveLink} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Medicine
            </label>
            <select
              disabled={Boolean(editingLink)}
              value={linkMedId}
              onChange={(e) => setLinkMedId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm disabled:opacity-60"
            >
              {medicines.map((m) => (
                <option key={m.medicine_id} value={m.medicine_id}>
                  {m.medicine_code} — {medLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Supplier
            </label>
            <select
              disabled={Boolean(editingLink)}
              value={linkSupId}
              onChange={(e) => setLinkSupId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm disabled:opacity-60"
            >
              {suppliers
                .filter((s) => s.status === "Active")
                .map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_code} — {s.supplier_name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Purchase Price (&#8369;)
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              required
              value={linkPrice}
              onChange={(e) => setLinkPrice(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setLinkModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingLink}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {savingLink ? "Saving..." : "Save Price"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleSup)}
        title="Confirm Supplier Status"
        description={`Set ${toggleSup?.supplier_name ?? ""} to ${
          toggleSup?.status === "Active" ? "Inactive" : "Active"
        }?`}
        onConfirm={async () => {
          if (!toggleSup) return;
          try {
            await api.toggleSupplierStatus(
              toggleSup.supplier_id,
              toggleSup.status
            );
            notify("Supplier status updated.", "success");
            setToggleSup(null);
            loadData();
          } catch (err) {
            notify(err instanceof Error ? err.message : "Failed to update.", "error");
          }
        }}
        onCancel={() => setToggleSup(null)}
      />

      <ConfirmDialog
        open={Boolean(removeLink)}
        title="Remove Supply Link"
        description={`Remove ${removeLink?.supplier_name ?? ""} as a supplier of ${
          removeLink ? medLabel(removeLink) : ""
        }?`}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!removeLink) return;
          try {
            await api.removeMedicineSupplier(removeLink.medicine_supplier_id);
            notify("Supply link removed.", "info");
            setRemoveLink(null);
            loadData();
          } catch (err) {
            notify(err instanceof Error ? err.message : "Failed to remove.", "error");
          }
        }}
        onCancel={() => setRemoveLink(null)}
      />
    </div>
  );
}
