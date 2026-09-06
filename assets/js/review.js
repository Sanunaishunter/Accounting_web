/**
 * review.js - 待審核頁面
 */
(function () {
  "use strict";

  function render() {
    DB.init();
    renderPending();
    renderPersonManage();
  }

  function renderPending() {
    const el = document.getElementById("pending-list");
    const pending = DB.getAllPendingReviews();
    const persons = DB.getAllPersons();
    const personNames = persons.map((p) => p.name);

    if (!pending.length) {
      el.innerHTML = `<div class="alert success">🎉 沒有待審核的項目！</div>`;
      return;
    }

    el.innerHTML = `
      <div class="alert info">共有 ${pending.length} 筆待審核項目</div>
      ${pending
        .map((item) => {
          const options = personNames.map((n) => `<option value="${Utils.escapeHtml(n)}">${Utils.escapeHtml(n)}</option>`).join("");
          return `
          <div class="panel" data-id="${item.id}">
            <div class="flex-between" style="align-items:flex-start">
              <div>
                <p><strong>原始文字：</strong> ${Utils.escapeHtml(item.raw_text)}</p>
                <p><strong>來源行：</strong> ${Utils.escapeHtml(item.source_line)}</p>
                <p><strong>日期：</strong> ${item.date}</p>
                <p class="text-muted">建立時間：${new Date(item.created_at).toLocaleString("zh-Hant-TW")}</p>
              </div>
              <div style="min-width:280px">
                <p><strong>處理選項：</strong></p>
                ${
                  personNames.length
                    ? `
                  <select class="review-person-select">
                    <option value="">選擇人員</option>
                    ${options}
                  </select>
                  <div class="btn-row">
                    <button class="btn-alias primary small" disabled>是別名</button>
                    <button class="btn-new-person small">是新人員</button>
                    <button class="btn-ignore small">忽略此項</button>
                  </div>`
                    : `
                  <div class="alert warning">尚無人員資料，請先到輸入頁面新增人員</div>
                  <div class="btn-row">
                    <button class="btn-new-person small primary">新增為人員</button>
                    <button class="btn-ignore small">忽略</button>
                  </div>`
                }
              </div>
            </div>
          </div>`;
        })
        .join("")}
    `;

    el.querySelectorAll(".panel[data-id]").forEach((panel) => {
      const id = parseInt(panel.dataset.id, 10);
      const item = pending.find((p) => p.id === id);
      const select = panel.querySelector(".review-person-select");
      const aliasBtn = panel.querySelector(".btn-alias");

      if (select && aliasBtn) {
        select.addEventListener("change", () => {
          aliasBtn.disabled = !select.value;
          aliasBtn.textContent = select.value ? `是「${select.value}」的別名` : "是別名";
        });
        aliasBtn.addEventListener("click", () => {
          const personName = select.value;
          if (!personName) return;
          const person = persons.find((p) => p.name === personName);
          if (person) DB.addAliasToPerson(person.id, item.raw_text);
          DB.deletePendingReview(item.id);
          Utils.toast(`已將「${item.raw_text}」加為「${personName}」的別名`);
          render();
        });
      }

      panel.querySelector(".btn-new-person").addEventListener("click", () => {
        try {
          DB.addPerson(item.raw_text);
          DB.deletePendingReview(item.id);
          Utils.toast(`已新增人員：${item.raw_text}`);
          render();
        } catch (e) {
          Utils.toast(`新增失敗：${e.message}`, "danger");
        }
      });

      panel.querySelector(".btn-ignore").addEventListener("click", () => {
        DB.deletePendingReview(item.id);
        Utils.toast("已忽略", "info");
        render();
      });
    });
  }

  function renderPersonManage() {
    const el = document.getElementById("person-manage-list");
    const persons = DB.getAllPersons();
    if (!persons.length) {
      el.innerHTML = `<p class="text-dim">尚無人員資料</p>`;
      return;
    }

    el.innerHTML = `
      <div class="btn-row" style="margin-top:0">
        <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem">
          <input type="checkbox" id="person-select-all" style="width:auto" /> 全選
        </label>
        <button class="btn-delete-selected danger small" disabled>🗑️ 刪除已選取人員 (<span class="selected-count">0</span>)</button>
      </div>
      ${persons
        .map(
          (p) => `
        <details class="expander" data-id="${p.id}">
          <summary style="display:flex;align-items:center;gap:0.5rem">
            <input type="checkbox" class="person-select-cb" data-id="${p.id}" style="width:auto;flex:none" />
            <span>${Utils.escapeHtml(p.name)}</span>
          </summary>
          <div class="field">
            <label>別名（逗號分隔）</label>
            <input type="text" class="edit-alias" value="${Utils.escapeHtml(p.aliases || "")}" />
          </div>
          <div class="btn-row">
            <button class="btn-update-alias small">更新別名</button>
            <button class="btn-delete-person danger small">🗑️ 刪除人員</button>
          </div>
        </details>`
        )
        .join("")}
    `;

    const selectAllCb = el.querySelector("#person-select-all");
    const deleteSelectedBtn = el.querySelector(".btn-delete-selected");
    const selectedCountEl = el.querySelector(".selected-count");
    const checkboxes = () => Array.from(el.querySelectorAll(".person-select-cb"));

    function updateBulkState() {
      const boxes = checkboxes();
      const selected = boxes.filter((cb) => cb.checked);
      selectedCountEl.textContent = selected.length;
      deleteSelectedBtn.disabled = selected.length === 0;
      selectAllCb.checked = boxes.length > 0 && selected.length === boxes.length;
      selectAllCb.indeterminate = selected.length > 0 && selected.length < boxes.length;
    }

    checkboxes().forEach((cb) => {
      // 避免點擊選取框連動觸發 <summary> 展開/收合
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", updateBulkState);
    });

    selectAllCb.addEventListener("click", (e) => e.stopPropagation());
    selectAllCb.addEventListener("change", () => {
      checkboxes().forEach((cb) => (cb.checked = selectAllCb.checked));
      updateBulkState();
    });

    deleteSelectedBtn.addEventListener("click", () => {
      const selectedIds = checkboxes()
        .filter((cb) => cb.checked)
        .map((cb) => parseInt(cb.dataset.id, 10));
      if (!selectedIds.length) return;
      const names = persons.filter((p) => selectedIds.includes(p.id)).map((p) => p.name);
      if (!confirm(`確定要刪除以下 ${names.length} 位人員嗎？此動作無法復原。\n\n${names.join("、")}`)) return;
      selectedIds.forEach((id) => DB.deletePerson(id));
      Utils.toast(`已刪除 ${names.length} 位人員：${names.join("、")}`, "warning");
      render();
    });

    el.querySelectorAll("details[data-id]").forEach((d) => {
      const id = parseInt(d.dataset.id, 10);
      d.querySelector(".btn-update-alias").addEventListener("click", () => {
        const val = d.querySelector(".edit-alias").value;
        DB.updatePersonAliases(id, val);
        Utils.toast("已更新");
        render();
      });
      d.querySelector(".btn-delete-person").addEventListener("click", () => {
        const p = DB.getAllPersons().find((p) => p.id === id);
        DB.deletePerson(id);
        Utils.toast(`已刪除：${p?.name || ""}`, "warning");
        render();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    document.getElementById("btn-quick-add").addEventListener("click", () => {
      const name = document.getElementById("quick-add-name").value.trim();
      const aliases = document.getElementById("quick-add-aliases").value.trim();
      if (!name) return;
      try {
        DB.addPerson(name, aliases);
        Utils.toast(`已新增：${name}`);
        document.getElementById("quick-add-name").value = "";
        document.getElementById("quick-add-aliases").value = "";
        render();
      } catch (e) {
        Utils.toast(`新增失敗：${e.message}`, "danger");
      }
    });
  });
})();
