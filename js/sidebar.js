// sidebar.js - shared sidebar for every page. Only shows the links the signed-in role may open.
(async function () {
  const links = [
    { href: "dashboard.html",          label: "Dashboard"       },
    { href: "course.html",             label: "Course Management"  },
    { href: "index.html",              label: "Medicines"       },
    { href: "categories.html",         label: "Categories"      },
    { href: "suppliers.html",          label: "Suppliers"       },
    { href: "medicine-suppliers.html", label: "Medicine Supply" },
    { href: "inventory.html",          label: "Inventory"       },
    { href: "stock-in.html",           label: "Stock In"        },
    { href: "stock-adjustment.html",   label: "Stock Adjustment" },
    { href: "prescriptions.html",      label: "Prescriptions"   },
    { href: "sales.html",              label: "Sales"           },
    { href: "expiration.html",         label: "Expiration"      },
    { href: "reports.html",            label: "Reports"         },
    { href: "users.html",              label: "Users"           },
    { href: "settings.html",           label: "Settings"        },
  ];

  const me = await getProfile();
  if (!me) return;                       // guardPage() is sending them to the login page

  const esc = (s) => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
  const current = currentPage();

  const nav = links
    .filter(l => canAccess(me.role, l.href))
    .map(l => `<a href="${l.href}" class="sidebar-link${l.href === current ? " active" : ""}">${l.label}</a>`)
    .join("");

  document.getElementById("sidebar").innerHTML = `
    <div class="sidebar-header">
      <img src="./assets/medicine.png" alt="Pharmacy Management System" class="sidebar-logo">
    </div>
    <nav class="sidebar-nav">
      ${nav}
      <a href="#" class="sidebar-link" onclick="logout()">Logout</a>
    </nav>
    <div class="sidebar-user">
      <div class="sidebar-user-name">${esc(me.full_name || me.email)}</div>
      <div class="sidebar-user-role">${esc(me.role || "No role")}</div>
    </div>`;
})();
