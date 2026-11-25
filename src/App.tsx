import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { canAccessModule, getLandingModule } from "./lib/rbac";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage, type InventorySection } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { MedicinesPage } from "./pages/MedicinesPage";
import { PrescriptionsPage } from "./pages/PrescriptionsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { UsersPage } from "./pages/UsersPage";
import type { ModuleId } from "./types/pharmacy";

function WorkspaceRouter() {
  const { profile, loading, signOut } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [pendingRxId, setPendingRxId] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.role) return;
    if (!canAccessModule(profile.role, activeModule)) {
      setActiveModule(getLandingModule(profile.role));
    }
  }, [profile?.role, activeModule]);

  useEffect(() => {
    if (profile?.role) {
      setActiveModule(getLandingModule(profile.role));
    }
  }, [profile?.id, profile?.role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F8F9] dark:bg-[#0B1117] text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  if (!profile) {
    return <LoginPage />;
  }

  if (profile.status !== "Active" || !profile.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F8F9] dark:bg-[#0B1117] px-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-6 text-center space-y-3">
          <h1 className="font-display text-lg font-semibold">
            {profile.status !== "Active" ? "Account Inactive" : "Role Not Assigned"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {profile.status !== "Active"
              ? "Your account has been deactivated. Contact an administrator."
              : "Your account has no active role assigned yet. Ask an administrator to assign your role."}
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const safeModule = canAccessModule(profile.role, activeModule)
    ? activeModule
    : getLandingModule(profile.role);

  const renderPage = () => {
    switch (safeModule) {
      case "dashboard":
        return <DashboardPage onNavigate={setActiveModule} />;
      case "sales":
        return (
          <SalesPage
            initialPrescriptionId={pendingRxId}
            onConsumeInitialPrescription={() => setPendingRxId(null)}
          />
        );
      case "prescriptions":
        return (
          <PrescriptionsPage
            onDispenseInPos={(rxId) => {
              setPendingRxId(rxId);
              setActiveModule("sales");
            }}
          />
        );
      case "medicines":
      case "categories":
        return (
          <MedicinesPage
            activeTab={safeModule}
            onTabChange={(t) => setActiveModule(t)}
          />
        );
      case "suppliers":
      case "medicine-suppliers":
        return (
          <SuppliersPage
            activeTab={safeModule}
            onTabChange={(t) => setActiveModule(t)}
          />
        );
      case "inventory":
      case "stock-in":
      case "stock-adjustment":
      case "expiration":
        return (
          <InventoryPage
            activeSection={safeModule as InventorySection}
            onSectionChange={(s) => setActiveModule(s)}
          />
        );
      case "reports":
        return <ReportsPage />;
      case "users":
        return <UsersPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setActiveModule} />;
    }
  };

  return (
    <Layout activeModule={safeModule} onNavigate={setActiveModule}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceRouter />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
