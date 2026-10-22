// Keep visited sidebar pages alive so switching sections does not reload them.
(() => {
  const embedded = window.parent !== window;

  function routePath(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.endsWith(".html")) return null;
      return url.pathname + url.search;
    } catch (_) {
      return null;
    }
  }

  function sidebarLink(event) {
    const link = event.target.closest(".sidebar-nav a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self") ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const path = routePath(link.href);
    if (!path) return;
    event.preventDefault();

    if (embedded) {
      window.parent.postMessage({ type: "pharmacy:navigate", path }, window.location.origin);
    } else {
      navigate(path);
    }
  }

  document.addEventListener("click", sidebarLink);
  if (embedded) return;

  const initialPath = routePath(window.location.href);
  const initialTitle = document.title;
  const pages = new Map();
  let activePath = initialPath;

  function setTitle(title) {
    if (title) document.title = title;
  }

  function focusFrame(frame) {
    try { frame.contentWindow.focus(); } catch (_) { /* Frame may still be loading. */ }
  }

  function activate(path, addHistory = false) {
    if (!path) return;
    if (addHistory && path !== activePath) {
      const url = new URL(path, window.location.origin);
      window.history.pushState({ pharmacyRoute: path }, "", url.pathname + url.search);
    }
    activePath = path;

    if (path === initialPath) {
      pages.forEach(frame => { frame.style.display = "none"; });
      setTitle(initialTitle);
      const app = document.querySelector(".app-layout");
      if (app && window.anime?.animate) {
        window.anime.animate(app, { opacity: [0.94, 1], duration: 180, ease: "out(3)" });
      }
      return;
    }

    let frame = pages.get(path);
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = "Pharmacy Management page";
      frame.setAttribute("aria-label", "Pharmacy Management page");
      frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;background:#EEF9FA;z-index:999;display:none;";
      frame.addEventListener("load", () => {
        frame.dataset.loaded = "true";
        if (activePath === path) showFrame(frame);
      });
      pages.set(path, frame);
      document.body.appendChild(frame);
      frame.src = new URL(path, window.location.origin).href;
    }
    if (frame.dataset.loaded === "true") showFrame(frame);
  }

  function showFrame(frame) {
    pages.forEach(item => { item.style.display = item === frame ? "block" : "none"; });
    setTitle(frame.contentDocument?.title);
    if (window.anime?.animate) {
      window.anime.animate(frame, { opacity: [0.96, 1], duration: 160, ease: "out(3)" });
    }
    focusFrame(frame);
  }

  function navigate(path) {
    if (path === activePath) return;
    activate(path, true);
  }

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.data?.type !== "pharmacy:navigate") return;
    const sourceIsAppFrame = [...pages.values()].some(frame => frame.contentWindow === event.source);
    const path = routePath(event.data.path);
    if (sourceIsAppFrame && path) navigate(path);
  });

  window.addEventListener("popstate", () => {
    const path = routePath(window.location.href);
    if (path) activate(path);
  });
})();
