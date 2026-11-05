// Shared Anime.js motion for the static Pharmacy Manager pages.
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animationEngine = () => window.anime && window.anime.animate;
  const modalOpen = new WeakSet();
  const modalClosing = new WeakSet();
  const animatedRows = new WeakSet();
  const animatedCards = new WeakSet();

  function animate(targets, options) {
    const engine = animationEngine();
    if (!engine || reduceMotion.matches || !targets || !targets.length && !targets.nodeType) return;
    engine(targets, options);
  }

  function enterPage() {
    const header = document.querySelector("header .inner");
    if (header) animate(header, {
      opacity: [0, 1], translateY: [8, 0], duration: 420, ease: "out(3)",
    });

    const content = document.querySelectorAll(
      "main > *:not(.course-tables-layout), .course-tables-layout > section, .login-card, .denied-card"
    );
    content.forEach((element, index) => animate(element, {
      opacity: [0, 1], translateY: [12, 0], duration: 460, ease: "out(3)",
      delay: Math.min(index * 55, 220),
    }));

    const sidebar = document.getElementById("sidebar");
    if (sidebar) watchSidebar(sidebar);
    document.querySelectorAll("tbody").forEach(watchRows);
    document.querySelectorAll(".dash-grid").forEach(watchCards);
    document.querySelectorAll(".modal-backdrop").forEach(watchModal);
    watchNewModals();
  }

  function watchSidebar(sidebar) {
    const animateLinks = () => sidebar.querySelectorAll(".sidebar-link").forEach((link, index) => {
      if (link.dataset.motionReady) return;
      link.dataset.motionReady = "true";
      animate(link, { opacity: [0, 1], translateX: [-8, 0], duration: 300, ease: "out(3)", delay: Math.min(index * 22, 180) });
    });
    animateLinks();
    new MutationObserver(animateLinks).observe(sidebar, { childList: true, subtree: true });
  }

  function watchRows(body) {
    const animateRows = () => {
      [...body.querySelectorAll("tr")].forEach((row, index) => {
        if (animatedRows.has(row)) return;
        animatedRows.add(row);
        if (index > 11) return;
        animate(row, { opacity: [0, 1], translateY: [7, 0], duration: 280, ease: "out(3)", delay: Math.min(index * 20, 160) });
      });
    };
    animateRows();
    new MutationObserver(animateRows).observe(body, { childList: true });
  }

  function watchCards(container) {
    const animateCards = () => container.querySelectorAll(".dash-card").forEach((card, index) => {
      if (animatedCards.has(card)) return;
      animatedCards.add(card);
      animate(card, { opacity: [0, 1], translateY: [10, 0], duration: 380, ease: "out(3)", delay: index * 45 });
    });
    animateCards();
    new MutationObserver(animateCards).observe(container, { childList: true });
  }

  function showModal(backdrop) {
    if (modalOpen.has(backdrop)) return;
    modalOpen.add(backdrop);
    animate(backdrop, { opacity: [0, 1], duration: 180, ease: "out(2)" });
    const panel = backdrop.querySelector(".modal");
    if (panel) animate(panel, { opacity: [0, 1], translateY: [12, 0], scale: [0.985, 1], duration: 240, ease: "out(3)" });
  }

  function watchModal(backdrop) {
    if (backdrop.classList.contains("open")) showModal(backdrop);
    new MutationObserver(records => records.forEach(record => {
      const wasOpen = record.oldValue?.split(/\s+/).includes("open");
      const isOpen = backdrop.classList.contains("open");
      if (isOpen) {
        if (!modalClosing.has(backdrop)) showModal(backdrop);
        return;
      }
      if (modalClosing.has(backdrop)) {
        modalClosing.delete(backdrop);
        modalOpen.delete(backdrop);
        return;
      }
      if (!wasOpen || !modalOpen.has(backdrop)) return;
      modalClosing.add(backdrop);
      backdrop.classList.add("open");
      const panel = backdrop.querySelector(".modal");
      const engine = animationEngine();
      if (!engine || reduceMotion.matches) {
        modalClosing.delete(backdrop);
        modalOpen.delete(backdrop);
        backdrop.classList.remove("open");
        return;
      }
      engine(backdrop, {
        opacity: [1, 0], duration: 150, ease: "in(2)",
        onComplete: () => {
          modalClosing.delete(backdrop);
          modalOpen.delete(backdrop);
          backdrop.classList.remove("open");
        },
      });
      if (panel) engine(panel, { opacity: [1, 0], translateY: [0, 8], scale: [1, 0.99], duration: 150, ease: "in(2)" });
    })).observe(backdrop, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  }

  function watchNewModals() {
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.(".modal-backdrop")) watchModal(node);
      node.querySelectorAll?.(".modal-backdrop").forEach(watchModal);
    }))).observe(document.body, { childList: true, subtree: true });
  }

  function bindHoverMotion() {
    document.addEventListener("pointerover", event => {
      if (reduceMotion.matches) return;
      const target = event.target.closest("button, .sidebar-link, .stat-card.clickable, a.dash-card, tbody tr");
      if (!target || target.contains(event.relatedTarget)) return;
      animate(target, { scale: 1.015, translateY: -1, duration: 130, ease: "out(3)" });
    });
    document.addEventListener("pointerout", event => {
      if (reduceMotion.matches) return;
      const target = event.target.closest("button, .sidebar-link, .stat-card.clickable, a.dash-card, tbody tr");
      if (!target || target.contains(event.relatedTarget)) return;
      animate(target, { scale: 1, translateY: 0, duration: 160, ease: "out(3)" });
    });
  }

  function init() {
    enterPage();
    bindHoverMotion();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
