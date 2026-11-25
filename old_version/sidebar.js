// sidebar.js - shared sidebar for every page
(function () {
  const links = [
    { href: "index.html",      label: "Inventory"  },
    { href: "categories.html", label: "Categories" },
    { href: "suppliers.html",  label: "Suppliers"  },
    { href: "medicine-suppliers.html", label: "Medicine Suppliers" },
    { href: "stock_in.html",   label: "Stock In"   },
    { href: "sales.html",      label: "Sales"      },
    { href: "settings.html",   label: "Settings"   },
    
  ];

  // Highlight the link that matches the current page
  const current = location.pathname.split("/").pop() || "index.html";

  const nav = links.map(l =>
    `<a href="${l.href}" class="sidebar-link${l.href === current ? " active" : ""}">${l.label}</a>`
  ).join("");

  document.getElementById("sidebar").innerHTML = `
    <div class="sidebar-header"><h2>Pharmacy Management System</h2></div>
    <nav class="sidebar-nav">
      ${nav}
      <a href="#" class="sidebar-link" onclick="logout()">Logout</a>
    </nav>`;
})();