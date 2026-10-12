// auth.js - roles, page access and session guard.
// Load it AFTER supabase.js on every page.

// Role names are stored exactly like this in public.users.role
const ALL_ROLES = ["Admin", "Pharmacist", "Cashier", "Inventory Staff", "Manager"];

// "Inventory Staff" -> "inventory_staff"  (used by data-hide="..." attributes in the HTML)
const roleSlug = (role) => String(role || "").toLowerCase().replace(/\s+/g, "_");

// Which roles may open which page. A page that is not listed is blocked for everyone except administrators.
const PAGE_ACCESS = {
  "index.html":              ALL_ROLES,                                   // medicines / inventory (view)
  "categories.html":         ["Admin", "Pharmacist"],
  "suppliers.html":          ["Admin", "Inventory Staff"],
  "medicine-suppliers.html": ["Admin", "Inventory Staff"],
  "stock-in.html":           ["Admin", "Inventory Staff"],
  "stock-adjustment.html":   ["Admin", "Pharmacist", "Inventory Staff", "Manager"],  // Manager: history only (form is hidden)
  "sales.html":              ["Admin", "Cashier", "Pharmacist", "Manager"],
  "users.html":              ["Admin"],
  "settings.html":           ALL_ROLES,                                   // own account + password
};

// Where each role lands after logging in
const LANDING_PAGE = {
  "Admin":           "index.html",
  "Pharmacist":      "index.html",
  "Cashier":         "sales.html",
  "Inventory Staff": "stock-in.html",
  "Manager":         "index.html",
};

let _profilePromise = null;

// The signed-in user + their role (or null when nobody is signed in)
function getProfile(force = false) {
  if (!_profilePromise || force) {
    _profilePromise = (async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabaseClient
        .from("users")
        .select("full_name, role, status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) console.error("Could not load profile:", error.message);

      return {
        id:        session.user.id,
        email:     session.user.email,
        full_name: data?.full_name || null,
        role:      data?.role || null,
        status:    data?.status || "Active",
      };
    })();
  }
  return _profilePromise;
}

function currentPage() {
  return location.pathname.split("/").pop() || "index.html";
}

function canAccess(role, page) {
  if (!role) return false;
  if (role === "Admin") return true;
  return (PAGE_ACCESS[page] || []).includes(role);
}

// Redirects away when the user is not allowed on this page, and hides
// controls marked  data-hide="role1 role2"  from those roles.
async function guardPage() {
  const me = await getProfile();
  if (!me) { location.replace("login-page.html"); return null; }
  if (me.status !== "Active") { location.replace("denied.html?reason=inactive"); return null; }
  if (!me.role)               { location.replace("denied.html?reason=norole");   return null; }
  if (!canAccess(me.role, currentPage())) { location.replace("denied.html?reason=forbidden"); return null; }

  const style = document.createElement("style");
  style.textContent = `[data-hide~="${roleSlug(me.role)}"] { display: none !important; }`;
  document.head.appendChild(style);
  return me;
}

// Every page except these two is protected automatically
if (!["login-page.html", "denied.html"].includes(currentPage())) guardPage();
