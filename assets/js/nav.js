/**
 * nav.js - 共用導覽列
 */
(function (global) {
  "use strict";

  const PAGES = [
    { href: "index.html", icon: "💰", label: "首頁" },
    { href: "input.html", icon: "📝", label: "輸入" },
    { href: "review.html", icon: "🔍", label: "審核" },
    { href: "report.html", icon: "📊", label: "報表" },
    { href: "relations.html", icon: "🔗", label: "關係表" },
  ];

  function currentFile() {
    const path = location.pathname.split("/").pop();
    return path || "index.html";
  }

  function renderNav(mount) {
    const cur = currentFile();
    const active = PAGES.find((p) => p.href === cur) || PAGES[0];

    const links = PAGES.map(
      (p) =>
        `<a class="nav-link${p.href === cur ? " active" : ""}" href="${p.href}">${p.icon} ${p.label}</a>`
    ).join("");

    const bottomItems = PAGES.map(
      (p) => `
      <a class="bottom-nav-item${p.href === cur ? " active" : ""}" href="${p.href}">
        <span class="icon">${p.icon}</span>
        <span>${p.label}</span>
      </a>`
    ).join("");

    mount.innerHTML = `
      <header class="topbar">
        <div class="brand">💰 ${active.href === "index.html" ? "記帳系統" : active.label}</div>
        <nav class="nav-links">${links}</nav>
      </header>
      <nav class="bottom-nav" aria-label="主導覽">
        <div class="bottom-nav-inner">${bottomItems}</div>
      </nav>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("app-nav");
    if (mount) renderNav(mount);
  });

  global.Nav = { renderNav };
})(window);
