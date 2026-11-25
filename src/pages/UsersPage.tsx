import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import {
  EmptyState,
  Modal,
  StatusText,
  TableSkeleton,
} from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import {
  ALL_ROLES,
  canAccessModule,
  MODULE_ACCESS,
  NAV_ITEMS,
} from "../lib/rbac";
import type { AccountStatus, ManagedUser, UserRole } from "../types/pharmacy";

export function UsersPage() {
  const { profile } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<"accounts" | "matrix">("accounts");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add Modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<UserRole>("Cashier");
  const [addPassword, setAddPassword] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit Modal
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("Cashier");
  const [editStatus, setEditStatus] = useState<AccountStatus>("Active");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not load users.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.createUser({
        email: addEmail,
        full_name: addName,
        role: addRole,
        password: addPassword,
      });
      setAddOpen(false);
      notify(`Created account for ${addEmail}.`, "success");
      loadUsers();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create user.", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    const isSelf = editUser.user_id === profile?.id;
    setSaving(true);
    try {
      await api.updateUser(editUser.user_id, {
        full_name: editName,
        ...(isSelf ? {} : { role: editRole, status: editStatus }),
      });
      setEditUser(null);
      notify("User account updated.", "success");
      loadUsers();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update user.", "error");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.full_name, u.role].some((v) =>
        (v || "").toLowerCase().includes(q)
      )
    );
  }, [users, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Users &amp; Role Access
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage staff accounts, active status, and verified role-based access rules.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setTab("accounts")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === "accounts"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Accounts ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("matrix")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === "matrix"
                  ? "bg-white dark:bg-[#151E29] text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              RBAC Matrix
            </button>
          </div>

          {tab === "accounts" && (
            <button
              type="button"
              onClick={() => {
                setAddName("");
                setAddEmail("");
                setAddRole("Cashier");
                setAddPassword("");
                setAddOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

      {tab === "accounts" ? (
        <>
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or role..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151E29] pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
            {loading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No users found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-xs font-medium text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filtered.map((u) => (
                      <tr key={u.user_id}>
                        <td className="px-4 py-2.5 font-medium">
                          {u.full_name || "—"}
                          {u.user_id === profile?.id && (
                            <span className="ml-1.5 text-xs text-slate-400">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                          {u.email}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium">
                          {u.role}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusText
                            label={u.status}
                            tone={u.status === "Active" ? "success" : "danger"}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditUser(u);
                              setEditName(u.full_name || "");
                              setEditRole(u.role);
                              setEditStatus(u.status);
                            }}
                            className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Module accessibility matrix enforced across navigation, route guards, and actions.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111923] text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Module</th>
                  {ALL_ROLES.map((r) => (
                    <th key={r} className="px-3 py-2.5 text-center whitespace-nowrap">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {NAV_ITEMS.filter((n) => n.id in MODULE_ACCESS).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {item.label}
                    </td>
                    {ALL_ROLES.map((role) => {
                      const allowed = canAccessModule(role, item.id);
                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          {allowed ? (
                            <Check
                              className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mx-auto"
                              aria-label="Allowed"
                            />
                          ) : (
                            <Minus
                              className="h-4 w-4 text-slate-300 dark:text-slate-700 mx-auto"
                              aria-label="Restricted"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <Modal
        open={addOpen}
        onClose={() => !adding && setAddOpen(false)}
        title="Add Staff Account"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddUser} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Role
            </label>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Temporary Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {adding ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={Boolean(editUser)}
        onClose={() => !saving && setEditUser(null)}
        title="Edit Account"
        maxWidthClass="max-w-md"
      >
        {editUser && (
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="text"
                disabled
                value={editUser.email}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0E151E] px-3 py-2 text-sm opacity-70"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Role
              </label>
              <select
                disabled={editUser.user_id === profile?.id}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm disabled:opacity-60"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                disabled={editUser.user_id === profile?.id}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            {editUser.user_id === profile?.id && (
              <p className="text-xs text-slate-500">
                Own role and status cannot be modified here to prevent self-lockout.
              </p>
            )}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
