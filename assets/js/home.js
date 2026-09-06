/**
 * home.js - 首頁邏輯
 */
(function () {
  "use strict";

  function render() {
    DB.init();

    const persons = DB.getAllPersons();
    const expenses = DB.getExpenses();
    const pending = DB.getAllPendingReviews();
    const categoryPrices = DB.getAllCategoryPrices();

    const total = expenses.reduce((s, e) => s + e.amount * e.quantity, 0);

    document.getElementById("metrics").innerHTML = `
      <div class="metric"><div class="label">人員數</div><div class="value">${persons.length}</div></div>
      <div class="metric"><div class="label">支出記錄</div><div class="value">${expenses.length}</div></div>
      <div class="metric"><div class="label">待審核</div><div class="value">${pending.length}</div></div>
      <div class="metric"><div class="label">總支出</div><div class="value">${Utils.fmtMoney(total)}</div></div>
    `;

    renderCategoryPrices(categoryPrices);
    renderRecent(expenses);

    document.getElementById("today-date").textContent = new Date().toLocaleDateString("zh-Hant-TW", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });

    document.getElementById("btn-export").addEventListener("click", () => {
      const json = DB.exportData();
      const filename = `accounting_backup_${new Date().toISOString().slice(0, 10)}.json`;
      Utils.downloadFile(filename, json, "application/json");
      Utils.toast("已匯出備份檔案");
    });

    document.getElementById("btn-import").addEventListener("click", () => {
      document.getElementById("file-import").click();
    });

    document.getElementById("file-import").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          DB.importData(reader.result);
          Utils.toast("已匯入備份資料");
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          Utils.toast("匯入失敗：" + err.message, "danger");
        }
      };
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (!confirm("確定要清除所有資料嗎？此動作無法復原（建議先匯出備份）。")) return;
      DB.resetAll();
      Utils.toast("已重置所有資料", "warning");
      setTimeout(() => location.reload(), 800);
    });
  }

  function renderCategoryPrices(categoryPrices) {
    const grid = document.getElementById("category-price-grid");
    grid.innerHTML = Object.entries(categoryPrices)
      .map(
        ([category, price]) => `
        <div class="field">
          <label>${Utils.categoryIcon(category)} ${Utils.escapeHtml(category)}</label>
          <input type="number" min="0" step="10" value="${price}" data-category="${Utils.escapeHtml(category)}" class="price-input" />
        </div>`
      )
      .join("");

    grid.querySelectorAll(".price-input").forEach((input) => {
      input.addEventListener("change", () => {
        const category = input.dataset.category;
        const newPrice = parseInt(input.value, 10) || 0;
        DB.updateCategoryPrice(category, newPrice);
        Utils.toast(`${category} 已更新為 $${newPrice}`);
      });
    });
  }

  function renderRecent(expenses) {
    const section = document.getElementById("recent-section");
    if (!expenses.length) {
      section.innerHTML = "";
      return;
    }
    const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    section.innerHTML = `
      <hr class="divider" />
      <h2>最近記錄</h2>
      <table class="simple-table">
        <thead><tr><th>日期</th><th>類別</th><th>人員</th><th>金額</th></tr></thead>
        <tbody>
          ${recent
            .map(
              (e) => `<tr>
                <td data-label="日期">${e.date}</td>
                <td data-label="類別">${Utils.categoryIcon(e.category)} ${Utils.escapeHtml(e.category)}</td>
                <td data-label="人員">${Utils.escapeHtml(e.person)}</td>
                <td data-label="金額">$${e.amount} × ${e.quantity} = $${(e.amount * e.quantity).toLocaleString()}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  document.addEventListener("DOMContentLoaded", render);
})();
