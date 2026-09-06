/**
 * relations.js - 關係表管理頁面
 */
(function () {
  "use strict";

  function personOptions(selected) {
    const persons = DB.getAllPersons();
    return persons
      .map((p) => `<option value="${Utils.escapeHtml(p.name)}" ${p.name === selected ? "selected" : ""}>${Utils.escapeHtml(p.name)}</option>`)
      .join("");
  }

  function render() {
    DB.init();
    const proxies = DB.getPersonProxies();
    const persons = DB.getAllPersons();

    document.getElementById("proxy-count").textContent = proxies.length;
    document.getElementById("proxy-quick-list").innerHTML = proxies
      .map((p) => `<div class="text-dim" style="font-size:0.85rem">• ${Utils.escapeHtml(p.keyword)} → ${Utils.escapeHtml(p.proxy_for)}</div>`)
      .join("");

    const listEl = document.getElementById("proxy-list");
    if (!proxies.length) {
      listEl.innerHTML = `<div class="alert info">尚無對應關係，請在下方新增。</div>`;
    } else {
      listEl.innerHTML = proxies
        .map(
          (p) => `
        <div class="panel" data-id="${p.id}">
          <div class="flex-between">
            <div>
              <strong>${Utils.escapeHtml(p.keyword)}</strong> → <code>${Utils.escapeHtml(p.proxy_for)}</code>
              ${p.note ? `<div class="text-muted">${Utils.escapeHtml(p.note)}</div>` : ""}
            </div>
            <button class="danger small btn-del-proxy">❌ 刪除</button>
          </div>
          <details class="expander"><summary>編輯</summary>
            <div class="cards-grid" style="grid-template-columns:repeat(3,1fr)">
              <div class="field"><label>關鍵字</label><input type="text" class="edit-keyword" value="${Utils.escapeHtml(p.keyword)}" /></div>
              <div class="field"><label>代理人員</label><select class="edit-proxy-for">${personOptions(p.proxy_for)}</select></div>
              <div class="field"><label>說明</label><input type="text" class="edit-note" value="${Utils.escapeHtml(p.note || "")}" /></div>
            </div>
            <button class="primary small btn-update-proxy">更新</button>
          </details>
        </div>`
        )
        .join("");

      listEl.querySelectorAll(".panel[data-id]").forEach((panel) => {
        const id = parseInt(panel.dataset.id, 10);
        panel.querySelector(".btn-del-proxy").addEventListener("click", () => {
          const p = proxies.find((p) => p.id === id);
          DB.deletePersonProxy(id);
          Utils.toast(`已刪除「${p?.keyword || ""}」`, "warning");
          render();
        });
        panel.querySelector(".btn-update-proxy").addEventListener("click", () => {
          const keyword = panel.querySelector(".edit-keyword").value;
          const proxyFor = panel.querySelector(".edit-proxy-for").value;
          const note = panel.querySelector(".edit-note").value;
          DB.updatePersonProxy(id, keyword, proxyFor, note);
          Utils.toast("已更新");
          render();
        });
      });
    }

    document.getElementById("new-proxy-for").innerHTML = `<option value=""></option>` + personOptions();
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    document.getElementById("btn-add-proxy").addEventListener("click", () => {
      const keyword = document.getElementById("new-keyword").value.trim();
      const proxyFor = document.getElementById("new-proxy-for").value;
      const note = document.getElementById("new-note").value.trim();
      if (!keyword || !proxyFor) {
        Utils.toast("關鍵字與代理人員皆為必填", "danger");
        return;
      }
      try {
        DB.addPersonProxy(keyword, proxyFor, note);
        Utils.toast(`已新增：「${keyword}」→ ${proxyFor}`);
        document.getElementById("new-keyword").value = "";
        document.getElementById("new-note").value = "";
        render();
      } catch (e) {
        Utils.toast(e.message, "danger");
      }
    });
  });
})();
