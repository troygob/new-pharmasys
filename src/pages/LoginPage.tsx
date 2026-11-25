import { useState, type FormEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";
import { ALL_ROLES } from "../lib/rbac";
import type { UserRole } from "../types/pharmacy";

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  Admin: "Full system, users, catalog, POS & reports",
  Pharmacist: "Prescriptions, POS, catalog & expiration",
  Cashier: "POS checkout, Rx-linked sales & receipts",
  "Inventory Staff": "Stock-in, adjustments, suppliers & expiry",
  Manager: "Cross-module read access & analytics reports",
};

export function LoginPage() {
  const { signIn, signInDemoRole } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0);

  const startLockout = () => {
    let remaining = 30;
    setLockSeconds(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      setLockSeconds(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        setFailedAttempts(0);
      }
    }, 1000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (lockSeconds > 0 || busy) return;
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const nextFails = failedAttempts + 1;
      setFailedAttempts(nextFails);
      setError(err instanceof Error ? err.message : "Could not sign in.");
      if (nextFails >= 5) startLockout();
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRole = async (role: UserRole) => {
    setError("");
    setBusy(true);
    try {
      await signInDemoRole(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F6F8F9] dark:bg-[#0B1117] text-slate-900 dark:text-slate-100 px-4 py-6">
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            PharmaSys
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {resolvedTheme === "dark" ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>

      <main className="w-full max-w-md mx-auto my-8">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
            Sign in to workspace
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Access inventory tracking, prescriptions, and point-of-sale tools.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@pharmacy.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E151E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
            </div>

            {(error || lockSeconds > 0) && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                {lockSeconds > 0
                  ? `Too many failed attempts. Try again in ${lockSeconds}s.`
                  : error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || lockSeconds > 0}
              className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {!api.isLiveSupabase && (
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Interactive Role Preview
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Local Sandbox
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickRole(role)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E151E] hover:border-teal-500/60 hover:bg-teal-50/40 dark:hover:bg-teal-950/30 px-3 py-2 text-left transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {role}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {ROLE_DESCRIPTIONS[role]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-500 dark:text-slate-500">
        PharmaSys Pharmacy Operations
      </footer>
    </div>
  );
}
