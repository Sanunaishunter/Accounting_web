/**
 * input.js - 輸入頁面（月曆模式）
 */
(function () {
  "use strict";

  const now = new Date();
  const CUR_YEAR = now.getFullYear();
  const CUR_MONTH = now.getMonth() + 1;

  const state = {
    year: CUR_YEAR,
    month: CUR_MONTH,
    selectedDate: null, // day number currently open
    calendarData: {}, // {day: text} staged for current year/month
  };

  function yearOptions() {
    const opts = [];
    for (let y = CUR_YEAR - 2; y <= CUR_YEAR + 2; y++) opts.push(y);
    return opts;
  }

  function fillYearMonthSelects() {
    const years = yearOptions();
    ["select-year", "clear-year"].forEach((id) => {
      const sel = document.getElementById(id);
      sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
      sel.value = state.year;
    });
    ["select-month", "clear-month"].forEach((id) => {
      const sel = document.getElementById(id);
      sel.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
        .map((m) => `<option value="${m}">${m}月</option>`)
        .join("");
      sel.value = state.month;
    });
    document.getElementById("select-year").value = state.year;
    document.getElementById("select-month").value = state.month;
  }

  function renderPersonList() {
    const persons = DB.getAllPersons();
    const el = document.getElementById("person-list");
    el.innerHTML = persons.length
      ? persons.map((p) => `<span class="person-tag">${Utils.escapeHtml(p.name)}</span>`).join(" ")
      : `<p class="text-dim">尚未建立人員</p>`;
  }

  function renderCalendar() {
    document.getElementById("calendar-title").textContent = `${state.year} 年 ${state.month} 月`;
    const weeks = Utils.monthCalendar(state.year, state.month);
    const datesWithData = DB.getDatesWithData(state.year, state.month);

    let html = Utils.WEEKDAYS.map((w) => `<div class="cal-head">${w}</div>`).join("");
    weeks.forEach((week) => {
      week.forEach((day) => {
        if (day === 0) {
          html += `<div class="cal-day empty"></div>`;
          return;
        }
        const hasData = datesWithData.has(day);
        const hasStaged = day in state.calendarData;
        const isSelected = state.selectedDate === day;
        let cls = "cal-day";
        if (hasData) cls += " has-data";
        else if (hasStaged) cls += " has-staged";
        if (isSelected) cls += " selected";
        const icon = hasData ? "🟢" : hasStaged ? "📝" : "";
        html += `<div class="${cls}" data-day="${day}">${icon}${icon ? " " : ""}${day}</div>`;
      });
    });
    document.getElementById("calendar-grid").innerHTML = html;

    document.querySelectorAll(".cal-day[data-day]").forEach((el) => {
      el.addEventListener("click", () => {
        state.selectedDate = parseInt(el.dataset.day, 10);
        renderCalendar();
        renderDayEditor();
      });
    });
  }

  function renderDayEditor() {
    const container = document.getElementById("day-editor");
    if (!state.selectedDate) {
      container.innerHTML = "";
      return;
    }
    const day = state.selectedDate;
    const dateTitle = Utils.formatDateTitle(state.year, state.month, day);
    const dateStr = Utils.toDateStr(state.year, state.month, day);

    const existingExpenses = DB.getExpensesByDate(dateStr);
    const existingMemos = DB.getMemosByDate(dateStr);
    const currentText = state.calendarData[day] || "";

    let existingHtml = "";
    if (existingExpenses.length || existingMemos.length) {
      existingHtml = `
        <div class="alert info">此日期已有 ${existingExpenses.length} 筆支出、${existingMemos.length} 筆備忘</div>
        <details class="expander"><summary>查看現有資料</summary>
          ${existingExpenses
            .map((e) => `<div>• ${Utils.escapeHtml(e.category)} | ${Utils.escapeHtml(e.person)} | $${e.amount} × ${e.quantity}</div>`)
            .join("")}
          ${existingMemos.map((m) => `<div>• 📝 ${Utils.escapeHtml(m.content)}</div>`).join("")}
        </details>
        <button class="danger" id="btn-clear-day" style="margin-top:0.5rem">🗑️ 清除此日資料</button>
      `;
    }

    container.innerHTML = `
      <hr class="divider" />
      <h3>📅 ${dateTitle}</h3>
      ${existingHtml}
      <div class="field">
        <label>輸入記帳資料</label>
        <textarea id="day-input" rows="8" placeholder="範例（日期行會被忽略）：
${state.month}/${day}（${Utils.weekdayName(state.year, state.month, day)}）
早餐：小明、小華
中餐：阿鵰、泰禎
點心：阿鵰點心+60
晚餐：傑森*2
牛奶*1.5：小明">${Utils.escapeHtml(currentText)}</textarea>
      </div>
      <div class="btn-row">
        <button id="btn-day-stage">💾 暫存</button>
        <button class="primary" id="btn-day-save">✅ 儲存並關閉</button>
        <button id="btn-day-cancel">❌ 取消</button>
      </div>
      <div id="day-preview"></div>
    `;

    document.getElementById("btn-clear-day")?.addEventListener("click", () => {
      const result = DB.deleteDayData(dateStr);
      Utils.toast(`已刪除 ${result.expenses} 筆支出、${result.memos} 筆備忘`, "warning");
      renderCalendar();
      renderDayEditor();
    });

    const input = document.getElementById("day-input");
    const updatePreview = () => renderDayPreview(input.value, dateStr);
    input.addEventListener("input", updatePreview);
    updatePreview();

    document.getElementById("btn-day-stage").addEventListener("click", () => {
      state.calendarData[day] = input.value;
      Utils.toast("已暫存");
      renderCalendar();
      renderStagedSection();
    });

    document.getElementById("btn-day-save").addEventListener("click", () => {
      const text = input.value;
      if (text.trim()) {
        const result = processSingleDay(state.year, state.month, day, text);
        Utils.toast(result.message, result.status === "warning" ? "warning" : "success");
        delete state.calendarData[day];
      }
      state.selectedDate = null;
      renderCalendar();
      renderDayEditor();
      renderStagedSection();
    });

    document.getElementById("btn-day-cancel").addEventListener("click", () => {
      state.selectedDate = null;
      renderCalendar();
      renderDayEditor();
    });
  }

  function renderDayPreview(text, dateStr) {
    const el = document.getElementById("day-preview");
    if (!text.trim()) {
      el.innerHTML = "";
      return;
    }
    const result = Parser.parseAccountingText(text, dateStr);
    const success = result.expenses.filter((e) => e.status === Parser.ParseStatus.SUCCESS);

    let html = `<hr class="divider" /><p><strong>預覽解析結果：</strong></p>`;
    if (success.length) {
      html += `<div class="alert success">✓ ${success.length} 筆可成功儲存</div>`;
      html += success
        .slice(0, 5)
        .map((e) => `<div>• ${Utils.escapeHtml(e.category)} | ${Utils.escapeHtml(e.person)} | $${e.amount} × ${e.quantity}</div>`)
        .join("");
      if (success.length > 5) html += `<div class="text-dim">... 還有 ${success.length - 5} 筆</div>`;
    }
    if (result.pending.length) {
      html += `<div class="alert warning">⚠️ ${result.pending.length} 筆無法識別（將送審核）</div>`;
      html += result.pending.slice(0, 3).map((p) => `<div>• 「${Utils.escapeHtml(p.raw_text)}」</div>`).join("");
    }
    if (result.duplicates.length) {
      html += `<div class="alert info">🔄 ${result.duplicates.length} 筆重複（將跳過）</div>`;
    }
    el.innerHTML = html;
  }

  function processSingleDay(year, month, day, text) {
    const dateStr = Utils.toDateStr(year, month, day);
    const result = { date: dateStr, success_count: 0, pending_count: 0, duplicate_count: 0, memo_count: 0, status: "success", message: "" };

    if (!text.trim()) {
      result.status = "skipped";
      result.message = "無資料";
      return result;
    }

    const parsed = Parser.parseAccountingText(text, dateStr);

    parsed.expenses.forEach((exp) => {
      if (exp.status === Parser.ParseStatus.SUCCESS) {
        DB.addExpense({ date: exp.date, category: exp.category, person: exp.person, amount: exp.amount, quantity: exp.quantity, note: exp.note });
        result.success_count++;
      }
    });

    parsed.pending.forEach((item) => {
      DB.addPendingReview(item.raw_text, item.source_line, item.date);
      result.pending_count++;
    });

    parsed.memos.forEach((memo) => {
      DB.addMemo(memo.date, memo.content, memo.person);
      result.memo_count++;
    });

    result.duplicate_count = parsed.duplicates.length;

    if (result.pending_count > 0) {
      result.status = "warning";
      result.message = `${result.success_count} 筆成功，${result.pending_count} 筆待審核`;
    } else if (result.success_count > 0) {
      result.status = "success";
      result.message = `${result.success_count} 筆成功`;
    } else {
      result.status = "skipped";
      result.message = "無有效資料";
    }
    if (result.duplicate_count > 0) result.message += `（${result.duplicate_count} 筆重複跳過）`;

    return result;
  }

  function renderStagedSection() {
    const section = document.getElementById("staged-section");
    const days = Object.keys(state.calendarData);
    if (!days.length) {
      section.innerHTML = `<div class="alert info">點擊月曆上的日期，輸入資料後按「暫存」，再使用批次輸入一次儲存所有資料</div>`;
      return;
    }
    section.innerHTML = `
      <p>已暫存 <strong>${days.length}</strong> 天的資料</p>
      <details class="expander"><summary>查看暫存資料</summary>
        ${days
          .sort((a, b) => a - b)
          .map((d) => {
            const text = state.calendarData[d];
            const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;
            return `<div>• ${state.month}/${d}：${Utils.escapeHtml(preview)}</div>`;
          })
          .join("")}
      </details>
      <div class="btn-row">
        <button class="primary" id="btn-batch-start">🚀 開始批次輸入</button>
        <button id="btn-batch-clear">🗑️ 清除所有暫存</button>
      </div>
    `;

    document.getElementById("btn-batch-start").addEventListener("click", runBatch);
    document.getElementById("btn-batch-clear").addEventListener("click", () => {
      state.calendarData = {};
      renderCalendar();
      renderStagedSection();
    });
  }

  function runBatch() {
    const progressEl = document.getElementById("batch-progress");
    const days = Object.keys(state.calendarData).map(Number).sort((a, b) => a - b);
    const logs = [];

    days.forEach((day) => {
      const text = state.calendarData[day];
      const result = processSingleDay(state.year, state.month, day, text);
      const icon = result.status === "success" ? "✓" : result.status === "warning" ? "⚠️" : "⏭️";
      logs.push({ text: `${state.month}/${day} ${icon} ${result.message}`, status: result.status });
    });

    progressEl.innerHTML = `
      <p><strong>批次處理進度：</strong></p>
      ${logs
        .map((l) => {
          const cls = l.status === "success" ? "success" : l.status === "warning" ? "warning" : "info";
          return `<div class="alert ${cls}">${Utils.escapeHtml(l.text)}</div>`;
        })
        .join("")}
      <div class="alert success">批次輸入完成！共處理 ${days.length} 天</div>
    `;

    state.calendarData = {};
    renderCalendar();
    renderStagedSection();
  }

  // ===== 整月批次輸入 =====

  let bulkState = { safeItems: [], conflictItems: [], pendingItems: [], memos: [] };

  function renderBulkPreview() {
    const text = document.getElementById("bulk-text").value;
    const el = document.getElementById("bulk-preview");
    if (!text.trim()) {
      el.innerHTML = "";
      return;
    }
    const result = Parser.parseAccountingText(text, null, state.year);
    const success = result.expenses.filter((e) => e.status === Parser.ParseStatus.SUCCESS);
    const duplicate = result.expenses.filter((e) => e.status === Parser.ParseStatus.DUPLICATE);

    let html = `<div class="metrics">
      <div class="metric"><div class="label">可儲存</div><div class="value">${success.length}</div></div>
      <div class="metric"><div class="label">待審核</div><div class="value">${result.pending.length}</div></div>
      <div class="metric"><div class="label">重複</div><div class="value">${duplicate.length}</div></div>
      <div class="metric"><div class="label">備忘</div><div class="value">${result.memos.length}</div></div>
    </div>`;

    if (success.length) {
      html += `<details class="expander"><summary>預覽 ${success.length} 筆可儲存記錄</summary>
        ${success.map((e) => `<div>${e.date} | ${Utils.escapeHtml(e.category)} | ${Utils.escapeHtml(e.person)} | $${e.amount} × ${e.quantity}</div>`).join("")}
      </details>`;
    }
    if (result.pending.length) {
      html += `<details class="expander"><summary>⚠️ ${result.pending.length} 筆無法識別</summary>
        ${result.pending.map((p) => `<div>[${p.date}] 「${Utils.escapeHtml(p.raw_text)}」← ${Utils.escapeHtml(p.source_line)}</div>`).join("")}
      </details>`;
    }
    if (duplicate.length) {
      html += `<details class="expander"><summary>🔄 ${duplicate.length} 筆重複（儲存時會跳過）</summary>
        ${duplicate.map((e) => `<div>${e.date} | ${Utils.escapeHtml(e.category)} | ${Utils.escapeHtml(e.person)}</div>`).join("")}
      </details>`;
    }
    el.innerHTML = html;
  }

  function renderBulkConflict() {
    const el = document.getElementById("bulk-conflict");
    if (!bulkState.conflictItems.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <div class="alert warning">⚠️ 發現 ${bulkState.conflictItems.length} 筆資料與資料庫中相同日期+金額的紀錄重複，請確認是否保留：</div>
      ${bulkState.conflictItems
        .map((c, i) => {
          const exp = c.exp;
          const existingHtml = c.existing
            .map((ex) => `<div>• ${ex.date} | ${Utils.escapeHtml(ex.category)} | ${Utils.escapeHtml(ex.person)} | $${ex.amount} × ${ex.quantity}</div>`)
            .join("");
          return `<details class="expander" open>
            <summary>⚠️ ${exp.date} | ${Utils.escapeHtml(exp.category)} | ${Utils.escapeHtml(exp.person)} | $${exp.amount} × ${exp.quantity}</summary>
            <p><strong>資料庫已存在（相同日期＋金額）：</strong></p>
            ${existingHtml}
            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.88rem;margin-top:0.5rem">
              <input type="checkbox" class="conflict-keep" data-idx="${i}" style="width:auto" /> 保留此筆（插入資料庫）
            </label>
          </details>`;
        })
        .join("")}
      <div class="btn-row">
        <button class="primary" id="btn-bulk-confirm">✅ 確認儲存</button>
        <button id="btn-bulk-cancel">❌ 取消</button>
      </div>
    `;

    document.getElementById("btn-bulk-confirm").addEventListener("click", () => {
      let saved = 0, skipped = 0;
      bulkState.safeItems.forEach((item) => {
        DB.addExpense(item);
        saved++;
      });
      document.querySelectorAll(".conflict-keep").forEach((cb) => {
        const idx = parseInt(cb.dataset.idx, 10);
        if (cb.checked) {
          DB.addExpense(bulkState.conflictItems[idx].exp);
          saved++;
        } else {
          skipped++;
        }
      });
      let pendingCount = 0;
      bulkState.pendingItems.forEach((item) => {
        DB.addPendingReview(item.raw_text, item.source_line, item.date);
        pendingCount++;
      });
      let memoCount = 0;
      bulkState.memos.forEach((memo) => {
        DB.addMemo(memo.date, memo.content, memo.person);
        memoCount++;
      });

      bulkState = { safeItems: [], conflictItems: [], pendingItems: [], memos: [] };
      let msg = `${saved} 筆支出、${memoCount} 筆備忘已儲存`;
      if (pendingCount > 0) msg += `，${pendingCount} 筆送審核`;
      if (skipped > 0) msg += `，${skipped} 筆重複略過`;
      Utils.toast(msg);
      document.getElementById("bulk-text").value = "";
      renderBulkPreview();
      renderBulkConflict();
      renderCalendar();
    });

    document.getElementById("btn-bulk-cancel").addEventListener("click", () => {
      bulkState = { safeItems: [], conflictItems: [], pendingItems: [], memos: [] };
      renderBulkConflict();
    });
  }

  function bulkSave() {
    const text = document.getElementById("bulk-text").value;
    if (!text.trim()) return;
    const parsed = Parser.parseAccountingText(text, null, state.year);

    const safeItems = [];
    const conflictItems = [];

    parsed.expenses.forEach((exp) => {
      if (exp.status !== Parser.ParseStatus.SUCCESS) return;
      const existing = DB.findExpensesByDateAndAmount(exp.date, exp.amount);
      const item = { date: exp.date, category: exp.category, person: exp.person, amount: exp.amount, quantity: exp.quantity, note: exp.note };
      if (existing.length) {
        conflictItems.push({ exp: item, existing });
      } else {
        safeItems.push(item);
      }
    });

    if (conflictItems.length) {
      bulkState = {
        safeItems,
        conflictItems,
        pendingItems: parsed.pending,
        memos: parsed.memos.map((m) => ({ date: m.date, content: m.content, person: m.person })),
      };
      renderBulkConflict();
    } else {
      let saved = 0;
      safeItems.forEach((item) => {
        DB.addExpense(item);
        saved++;
      });
      let pendingCount = 0;
      parsed.pending.forEach((item) => {
        DB.addPendingReview(item.raw_text, item.source_line, item.date);
        pendingCount++;
      });
      let memoCount = 0;
      parsed.memos.forEach((memo) => {
        DB.addMemo(memo.date, memo.content, memo.person);
        memoCount++;
      });
      const duplicateCount = parsed.expenses.filter((e) => e.status === Parser.ParseStatus.DUPLICATE).length;

      if (saved > 0 || memoCount > 0) {
        let msg = `${saved} 筆支出、${memoCount} 筆備忘已儲存`;
        if (pendingCount > 0) msg += `，${pendingCount} 筆送審核`;
        if (duplicateCount > 0) msg += `，${duplicateCount} 筆重複跳過`;
        Utils.toast(msg);
      } else if (pendingCount > 0) {
        Utils.toast(`0 筆儲存，${pendingCount} 筆待審核`, "warning");
      } else {
        Utils.toast("無有效資料", "info");
      }

      if (saved > 0) {
        document.getElementById("bulk-text").value = "";
        renderBulkPreview();
        renderCalendar();
      }
    }
  }

  function updateClearCaption() {
    const y = document.getElementById("clear-year").value;
    const m = document.getElementById("clear-month").value;
    document.getElementById("clear-caption").textContent = `將清除 ${y}/${m} 的支出、待審核、備忘`;
  }

  function bindStaticEvents() {
    document.getElementById("select-year").addEventListener("change", (e) => {
      state.year = parseInt(e.target.value, 10);
      state.selectedDate = null;
      renderCalendar();
      renderDayEditor();
    });
    document.getElementById("select-month").addEventListener("change", (e) => {
      state.month = parseInt(e.target.value, 10);
      state.selectedDate = null;
      renderCalendar();
      renderDayEditor();
    });

    document.getElementById("btn-add-person").addEventListener("click", () => {
      const name = document.getElementById("new-person-name").value.trim();
      const aliases = document.getElementById("new-person-aliases").value.trim();
      if (!name) return;
      try {
        DB.addPerson(name, aliases);
        Utils.toast(`已新增：${name}`);
        document.getElementById("new-person-name").value = "";
        document.getElementById("new-person-aliases").value = "";
        renderPersonList();
      } catch (e) {
        Utils.toast(`新增失敗：${e.message}`, "danger");
      }
    });

    document.getElementById("clear-year").addEventListener("change", updateClearCaption);
    document.getElementById("clear-month").addEventListener("change", updateClearCaption);
    document.getElementById("confirm-clear").addEventListener("change", (e) => {
      document.getElementById("btn-clear-month").disabled = !e.target.checked;
    });
    document.getElementById("btn-clear-month").addEventListener("click", () => {
      const y = parseInt(document.getElementById("clear-year").value, 10);
      const m = parseInt(document.getElementById("clear-month").value, 10);
      const result = DB.clearMonthData(y, m);
      const total = result.expenses + result.pending + result.memos;
      if (total > 0) {
        Utils.toast(`已清除 ${y}/${m}：${result.expenses} 筆支出、${result.pending} 筆待審核、${result.memos} 筆備忘`);
      } else {
        Utils.toast(`${y}/${m} 無資料`, "info");
      }
      document.getElementById("confirm-clear").checked = false;
      document.getElementById("btn-clear-month").disabled = true;
      renderCalendar();
    });

    document.getElementById("bulk-text").addEventListener("input", renderBulkPreview);
    document.getElementById("btn-bulk-save").addEventListener("click", bulkSave);
  }

  function init() {
    DB.init();
    fillYearMonthSelects();
    renderPersonList();
    renderCalendar();
    renderDayEditor();
    renderStagedSection();
    updateClearCaption();
    bindStaticEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
