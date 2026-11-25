import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ThemePreference } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { hasPermission } from "../lib/rbac";

export function SettingsPage() {
  const { profile, settings, updateSettings } = useAuth();
  const { preference, setPreference } = useTheme();
  const { notify } = useToast();

  const canEditPharmacy = hasPermission(profile?.role, "edit_pharmacy_settings");

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [pharmName, setPharmName] = useState(settings.pharmacy_name);
  const [pharmAddr, setPharmAddr] = useState(settings.pharmacy_address);
  const [receiptFooter, setReceiptFooter] = useState(settings.receipt_footer);
  const [soonDays, setSoonDays] = useState(String(settings.expiring_soon_days));
  const [savingConfig, setSavingConfig] = useState(false);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      notify("Passwords do not match.", "error");
      return;
    }
    setSavingPw(true);
    try {
      await api.updatePassword(newPw);
      setNewPw("");
      setConfirmPw("");
      notify("Password updated.", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update password.", "error");
    } finally {
      setSavingPw(false);
    }
  };

  const handleSavePharmacy = async (e: FormEvent) => {
    e.preventDefault();
    const days = Math.max(1, parseInt(soonDays, 10) || 30);
    setSavingConfig(true);
    try {
      await updateSettings({
        pharmacy_name: pharmName.trim() || "PharmaSys Pharmacy",
        pharmacy_address: pharmAddr.trim(),
        receipt_footer: receiptFooter.trim() || "THANK YOU!",
        expiring_soon_days: days,
      });
      notify("Pharmacy settings saved.", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save settings.", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Account profile, display theme, and receipt preferences.
        </p>
      </div>

      {/* Account & Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold">My Account</h2>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Name</div>
              <div className="font-medium">{profile?.full_name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Email</div>
              <div className="font-mono text-xs">{profile?.email}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Role</div>
              <div className="font-medium">{profile?.role || "Unassigned"}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold">Appearance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose a lighting mode tailored for daytime counter work or low-light shifts.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(["light", "dark", "system"] as ThemePreference[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPreference(mode)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  preference === mode
                    ? "border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Pharmacy Configuration (Admin) */}
      {canEditPharmacy && (
        <form
          onSubmit={handleSavePharmacy}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-semibold">
            Pharmacy &amp; Receipt Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Pharmacy Name
              </label>
              <input
                type="text"
                required
                value={pharmName}
                onChange={(e) => setPharmName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Expiring Soon Threshold (Days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={soonDays}
                onChange={(e) => setSoonDays(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Address (Printed on Receipts)
              </label>
              <input
                type="text"
                value={pharmAddr}
                onChange={(e) => setPharmAddr(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Receipt Footer Note
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingConfig ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </form>
      )}

      {/* Password Update */}
      <form
        onSubmit={handlePasswordChange}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 space-y-4"
      >
        <h2 className="font-display text-sm font-semibold">Change Password</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPw}
            className="rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingPw ? "Updating..." : "Update Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
