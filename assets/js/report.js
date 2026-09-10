/**
 * report.js - 統計報表頁面
 */
(function () {
  "use strict";

  const CATEGORY_ORDER = Utils.CATEGORY_ORDER;
  const CATEGORY_DISPLAY = Utils.CATEGORY_DISPLAY;

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    reportType: "monthly",
    manageMode: false,
    compare: { person: null, months: [] },
  };

  // ===== 資料組裝輔助 =====

  function buildCategoryDetails(expenses) {
    const details = {};
    CATEGORY_ORDER.forEach((cat) => {
      const rows = expenses
        .filter((e) => e.category === cat)
        .map((e) => `${Utils.shortDate(e.date)}: $${(e.amount * e.quantity).toFixed(0)}`);
      if (rows.length) details[cat] = rows;
    });
    return details;
  }

  function categoryTotalsFromExpenses(expenses) {
    const totals = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount * e.quantity;
    });
    return totals;
  }

  function categorizeMemosByPerson(memos, personNames) {
    const personMemos = {};
    personNames.forEach((n) => (personMemos[n] = []));
    const uncategorized = [];

    memos.forEach((memo) => {
      let matched = false;
      if (memo.person && memo.person in personMemos) {
        personMemos[memo.person].push(memo);
        matched = true;
      } else {
        for (const name of personNames) {
          if (memo.content.includes(name)) {
            personMemos[name].push(memo);
            matched = true;
            break;
          }
        }
      }
      if (!matched) uncategorized.push(memo);
    });

    return { personMemos, uncategorized };
  }

  function splitMemoAmounts(personMemos) {
    const memoWithAmt = [];
    const memoNoAmt = [];
    (personMemos || []).forEach((memo) => {
      const displayDate = Utils.shortDate(memo.date);
      const who = memo.person || "";
      const content = memo.content;
      const m = Utils.MEMO_AMOUNT_RE.exec(content);
      if (m) {
        const amount = Math.trunc(parseFloat(m[1]));
        const idx = m.index;
        const desc = (content.slice(0, idx).trimEnd() + " " + content.slice(idx + m[0].length).trimStart()).trim();
        memoWithAmt.push([displayDate, who, desc || content, amount]);
      } else {
        memoNoAmt.push([displayDate, who, content]);
      }
    });
    const memoSubtotal = memoWithAmt.reduce((s, [, , , amt]) => s + amt, 0);
    return { memoWithAmt, memoNoAmt, memoSubtotal };
  }

  function buildCardHtml(person, categoryTotals, monthLabel, personMemos, categoryDetails) {
    categoryDetails = categoryDetails || {};
    const subtotal = CATEGORY_ORDER.reduce((s, cat) => s + (categoryTotals[cat] || 0), 0);
    const { memoWithAmt, memoNoAmt, memoSubtotal } = splitMemoAmounts(personMemos);
    const total = subtotal + memoSubtotal;

    let catRows = "";
    CATEGORY_ORDER.forEach((cat) => {
      const amount = categoryTotals[cat] || 0;
      const displayName = CATEGORY_DISPLAY[cat] || cat;
      let amtCell;
      if (categoryDetails[cat] && categoryDetails[cat].length) {
        const tip = categoryDetails[cat].join("<br>");
        amtCell = `<span class="tooltip-container">${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}<span class="tooltip-text">${tip}</span></span>`;
      } else {
        amtCell = amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
      }
      catRows += `    <tr><td class="label">${Utils.categoryIcon(cat)} ${Utils.escapeHtml(displayName)}</td><td class="sym">$</td><td class="amt">${amtCell}</td></tr>\n`;
    });

    let memoAmtTable = "";
    if (memoWithAmt.length) {
      let rows = "";
      memoWithAmt.forEach(([d, w, desc, amt]) => {
        rows += `    <tr><td class="memo-date">${d}</td><td class="memo-who">${Utils.escapeHtml(w)}</td><td>${Utils.escapeHtml(desc)}</td><td class="sym">+$</td><td class="amt">${amt.toLocaleString()}</td></tr>\n`;
      });
      rows += `    <tr class="divider"><td colspan="3">備忘小計</td><td class="sym">+$</td><td class="amt">${memoSubtotal.toLocaleString()}</td></tr>\n`;
      memoAmtTable = `\n  <table style="margin-top:1rem">\n    <tr><td colspan="5" class="section-title">備忘加項：</td></tr>\n${rows}  </table>`;
    }

    let memoNoAmtTable = "";
    if (memoNoAmt.length) {
      let rows = "";
      memoNoAmt.forEach(([d, w, desc]) => {
        rows += `    <tr><td class="memo-date">${d}</td><td class="memo-who">${Utils.escapeHtml(w)}</td><td colspan="3">${Utils.escapeHtml(desc)}</td></tr>\n`;
      });
      memoNoAmtTable = `\n  <table style="margin-top:1rem">\n    <tr><td colspan="5" class="section-title">無金額備忘：</td></tr>\n${rows}  </table>`;
    }

    let pendingNote = "";
    if (memoNoAmt.length) {
      pendingNote = memoNoAmt.map(([d, w, desc]) => `+ ${d} ${w}${desc}（待補）`).join("；");
    }

    return `<div class="report">
  <h3 style="margin-bottom:2px">${Utils.escapeHtml(monthLabel)}</h3>
  <div style="color:#aaa;font-size:16px;margin-bottom:0.5rem">${Utils.escapeHtml(person)}</div>
  <table>
${catRows}    <tr class="divider"><td>Sub Total</td><td class="sym">$</td><td class="amt">${subtotal.toLocaleString()}</td></tr>
  </table>${memoAmtTable}${memoNoAmtTable}
  <table style="margin-top:1rem">
    <tr class="total-row"><td>Total</td><td class="sym">$</td><td class="amt">${total.toLocaleString()}</td><td style="color:#888;font-size:13px;padding-left:12px">${Utils.escapeHtml(pendingNote)}</td></tr>
  </table>
</div>`;
  }

  function buildCardText(person, categoryTotals, monthLabel, personMemos, categoryDetails) {
    categoryDetails = categoryDetails || {};
    const subtotal = CATEGORY_ORDER.reduce((s, cat) => s + (categoryTotals[cat] || 0), 0);
    const { memoWithAmt, memoNoAmt, memoSubtotal } = splitMemoAmounts(personMemos);
    const total = subtotal + memoSubtotal;

    const lines = [];
    lines.push(monthLabel);
    lines.push(person);
    lines.push("");
    CATEGORY_ORDER.forEach((cat) => {
      const amount = categoryTotals[cat] || 0;
      const displayName = CATEGORY_DISPLAY[cat] || cat;
      lines.push(`${Utils.categoryIcon(cat)} ${displayName}\t$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
      if (categoryDetails[cat] && categoryDetails[cat].length) {
        categoryDetails[cat].forEach((d) => lines.push(`    - ${d}`));
      }
    });
    lines.push(`Sub Total\t$${subtotal.toLocaleString()}`);

    if (memoWithAmt.length) {
      lines.push("");
      lines.push("備忘加項：");
      memoWithAmt.forEach(([d, w, desc, amt]) => {
        lines.push(`${d} ${w} ${desc}\t+$${amt.toLocaleString()}`);
      });
      lines.push(`備忘小計\t+$${memoSubtotal.toLocaleString()}`);
    }

    if (memoNoAmt.length) {
      lines.push("");
      lines.push("無金額備忘：");
      memoNoAmt.forEach(([d, w, desc]) => {
        lines.push(`${d} ${w} ${desc}`);
      });
    }

    lines.push("");
    let totalLine = `Total\t$${total.toLocaleString()}`;
    if (memoNoAmt.length) {
      const pendingNote = memoNoAmt.map(([d, w, desc]) => `+ ${d} ${w}${desc}（待補）`).join("；");
      totalLine += `\t${pendingNote}`;
    }
    lines.push(totalLine);

    return lines.join("\n");
  }

  // ===== 側欄 =====

  function fillSidebar() {
    const years = DB.getExpenseYears();
    const availableYears = years.length ? years : [new Date().getFullYear()];
    const yearSel = document.getElementById("filter-year");
    yearSel.innerHTML = availableYears.map((y) => `<option value="${y}">${y}</option>`).join("");
    if (!availableYears.includes(state.year)) state.year = availableYears[0];
    yearSel.value = state.year;

    fillMonthSelect();

    document.getElementById("report-type").value = state.reportType;
    document.getElementById("manage-mode").checked = state.manageMode;
  }

  function fillMonthSelect() {
    const months = DB.getExpenseMonths(state.year);
    const availableMonths = months.length ? months : Array.from({ length: 12 }, (_, i) => i + 1);
    const monthSel = document.getElementById("filter-month");
    monthSel.innerHTML = availableMonths.map((m) => `<option value="${m}">${m}月</option>`).join("");
    if (!availableMonths.includes(state.month)) state.month = availableMonths[0];
    monthSel.value = state.month;
  }

  // ===== 全員月報 =====

  function renderMonthlyReport(main) {
    const persons = DB.getAllPersons();
    const personNames = persons.map((p) => p.name);
    const expenses = DB.getExpenses({ year: state.year, month: state.month });
    const memos = DB.getMemos({ year: state.year, month: state.month });
    const { personMemos, uncategorized } = categorizeMemosByPerson(memos, personNames);

    if (!expenses.length && !memos.length) {
      main.innerHTML = `<div class="alert info">${state.year}年${state.month}月 尚無資料</div>`;
      return;
    }

    const monthLabel = `${state.year} ${Utils.getMonthName(state.month)}`;
    let html = "";
    let grandTotal = 0;
    const personData = {};

    personNames.forEach((person) => {
      const personExpenses = expenses.filter((e) => e.person === person);
      const personMemoList = personMemos[person] || [];
      const categoryTotals = categoryTotalsFromExpenses(personExpenses);
      const categoryDetails = buildCategoryDetails(personExpenses);
      const cardHtml = buildCardHtml(person, categoryTotals, monthLabel, personMemoList, categoryDetails);
      grandTotal += personExpenses.reduce((s, e) => s + e.amount * e.quantity, 0);
      personData[person] = { categoryTotals, personMemoList, categoryDetails };

      html += `<div class="card-block" data-person="${Utils.escapeHtml(person)}">
        ${cardHtml}
        <div class="btn-row">
          <button class="btn-export-card small">📄 輸出報表</button>
        </div>
        ${state.manageMode && personExpenses.length ? renderManageExpenses(personExpenses, "monthly") : ""}
        ${state.manageMode && personMemoList.length ? renderManageMemos(personMemoList, "monthly") : ""}
        <hr class="divider" />
      </div>`;
    });

    html += `<div class="metric" style="max-width:260px"><div class="label">全體總計</div><div class="value">${Utils.fmtMoney(grandTotal)}</div></div>`;

    if (uncategorized.length) {
      html += `<hr class="divider" /><h3>📝 備忘（未歸類）</h3>${renderUncategorizedMemos(uncategorized)}`;
    }

    main.innerHTML = html;

    main.querySelectorAll(".card-block").forEach((block) => {
      const person = block.dataset.person;
      block.querySelector(".btn-export-card").addEventListener("click", () => {
        const { categoryTotals, personMemoList, categoryDetails } = personData[person];
        exportSingleCard(person, monthLabel, categoryTotals, personMemoList, categoryDetails);
      });
    });

    bindManageHandlers(main, () => renderMonthlyReport(main));
  }

  function renderManageExpenses(expenses, keyPrefix) {
    const rows = expenses
      .map((e) => {
        const catDisplay = CATEGORY_DISPLAY[e.category] || e.category;
        const dateShort = e.date.split("-")[2];
        const label = `${dateShort}日 ${catDisplay} $${(e.amount * e.quantity).toFixed(0)}`;
        return `<div><button class="btn-del-expense danger small" data-id="${e.id}">❌ ${Utils.escapeHtml(label)}</button></div>`;
      })
      .join("");
    return `<details class="expander"><summary>🗑️ 刪除記錄</summary>${rows}</details>`;
  }

  function renderManageMemos(memos) {
    const rows = memos
      .map((m) => {
        const label = `${Utils.shortDate(m.date)} ${m.content}`;
        return `<div><button class="btn-del-memo danger small" data-id="${m.id}">❌ ${Utils.escapeHtml(label)}</button></div>`;
      })
      .join("");
    return `<details class="expander"><summary>🗑️ 刪除備忘</summary>${rows}</details>`;
  }

  function renderUncategorizedMemos(memos) {
    return memos
      .map((m) => {
        const label = `<strong>${Utils.shortDate(m.date)}</strong> ${Utils.escapeHtml(m.content)}`;
        return state.manageMode
          ? `<div class="flex-between"><span>• ${label}</span><button class="btn-del-memo danger small" data-id="${m.id}">❌</button></div>`
          : `<div>• ${label}</div>`;
      })
      .join("");
  }

  function bindManageHandlers(main, rerender) {
    main.querySelectorAll(".btn-del-expense").forEach((btn) => {
      btn.addEventListener("click", () => {
        DB.deleteExpense(parseInt(btn.dataset.id, 10));
        Utils.toast("已刪除");
        rerender();
      });
    });
    main.querySelectorAll(".btn-del-memo").forEach((btn) => {
      btn.addEventListener("click", () => {
        DB.deleteMemo(parseInt(btn.dataset.id, 10));
        rerender();
      });
    });
  }

  function exportSingleCard(person, monthLabel, categoryTotals, personMemoList, categoryDetails) {
    const text = buildCardText(person, categoryTotals, monthLabel, personMemoList, categoryDetails);
    Utils.downloadFile(`${state.year}${Utils.pad2(state.month)}_${person}.txt`, text, "text/plain;charset=utf-8");
  }

  // ===== 月份比較 =====

  function renderCompareReport(main) {
    const persons = DB.getAllPersons();
    const personNames = persons.map((p) => p.name);
    if (!state.compare.person || !personNames.includes(state.compare.person)) {
      state.compare.person = personNames[0] || null;
    }
    const availableMonths = DB.getExpenseMonths(state.year);
    if (!state.compare.months.length) {
      state.compare.months = availableMonths.slice(0, 3);
    }

    main.innerHTML = `
      <h2>月份比較</h2>
      <div class="field" style="max-width:280px">
        <label>選擇人員</label>
        <select id="compare-person">${personNames.map((n) => `<option value="${Utils.escapeHtml(n)}" ${n === state.compare.person ? "selected" : ""}>${Utils.escapeHtml(n)}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>選擇月份（可多選）</label>
        <div id="compare-months" class="btn-row"></div>
      </div>
      <div id="compare-cards" class="cards-flex"></div>
      <div id="compare-summary"></div>
    `;

    const monthsWrap = document.getElementById("compare-months");
    monthsWrap.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
      .map(
        (m) => `<label style="display:inline-flex;align-items:center;gap:0.3rem;border:1px solid var(--border);padding:0.3rem 0.6rem;border-radius:6px">
          <input type="checkbox" class="compare-month-cb" value="${m}" ${state.compare.months.includes(m) ? "checked" : ""} style="width:auto" /> ${m}月
        </label>`
      )
      .join("");

    function refresh() {
      renderCompareBody(main);
    }

    document.getElementById("compare-person").addEventListener("change", (e) => {
      state.compare.person = e.target.value;
      refresh();
    });
    monthsWrap.querySelectorAll(".compare-month-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const m = parseInt(cb.value, 10);
        if (cb.checked) {
          if (!state.compare.months.includes(m)) state.compare.months.push(m);
        } else {
          state.compare.months = state.compare.months.filter((x) => x !== m);
        }
        state.compare.months.sort((a, b) => a - b);
        renderCompareBody(main);
      });
    });

    renderCompareBody(main);
  }

  function renderCompareBody(main) {
    const cardsEl = document.getElementById("compare-cards");
    const summaryEl = document.getElementById("compare-summary");
    const person = state.compare.person;
    const months = state.compare.months;

    if (!person) {
      cardsEl.innerHTML = `<div class="alert info">尚無人員資料</div>`;
      summaryEl.innerHTML = "";
      return;
    }
    if (!months.length) {
      cardsEl.innerHTML = `<div class="alert warning">請選擇至少一個月份</div>`;
      summaryEl.innerHTML = "";
      return;
    }

    const yearlyExpenses = DB.getExpenses({ year: state.year, persons: [person] });
    if (!yearlyExpenses.length) {
      cardsEl.innerHTML = `<div class="alert info">${Utils.escapeHtml(person)} 在 ${state.year} 年尚無資料</div>`;
      summaryEl.innerHTML = "";
      return;
    }

    let cardsHtml = "";
    const summary = [];
    months.forEach((m) => {
      const monthExpenses = yearlyExpenses.filter((e) => parseInt(e.date.slice(5, 7), 10) === m);
      const categoryTotals = categoryTotalsFromExpenses(monthExpenses);
      const categoryDetails = buildCategoryDetails(monthExpenses);
      const monthLabel = `${state.year} ${Utils.getMonthName(m)}`;
      const cardHtml = buildCardHtml(person, categoryTotals, monthLabel, [], categoryDetails);
      cardsHtml += `<div class="card-wrap" data-month="${m}">${cardHtml}
        ${state.manageMode && monthExpenses.length ? renderManageExpenses(monthExpenses) : ""}
      </div>`;
      const total = monthExpenses.reduce((s, e) => s + e.amount * e.quantity, 0);
      summary.push({ 月份: Utils.getMonthName(m), 總計: Utils.fmtMoney(total) });
    });

    cardsEl.innerHTML = cardsHtml;
    bindManageHandlers(cardsEl, () => renderCompareBody(main));

    summaryEl.innerHTML = `
      <h3>月份總計比較</h3>
      <table class="simple-table">
        <thead><tr><th>月份</th><th>總計</th></tr></thead>
        <tbody>${summary.map((s) => `<tr><td>${s.月份}</td><td>${s.總計}</td></tr>`).join("")}</tbody>
      </table>
    `;
  }

  // ===== 年度統計 =====

  function renderYearlyReport(main) {
    const persons = DB.getAllPersons();
    const personNames = persons.map((p) => p.name);
    const yearlyExpenses = DB.getExpenses({ year: state.year });
    const yearlyMemos = DB.getMemos({ year: state.year });
    const { personMemos, uncategorized } = categorizeMemosByPerson(yearlyMemos, personNames);

    if (!yearlyExpenses.length) {
      main.innerHTML = `<div class="alert info">${state.year} 年尚無資料</div>`;
      return;
    }

    let html = `<h2>${state.year} 年度統計</h2><div class="cards-grid">`;
    let grandTotal = 0;

    personNames.forEach((person) => {
      const personExpenses = yearlyExpenses.filter((e) => e.person === person);
      const categoryTotals = categoryTotalsFromExpenses(personExpenses);
      const categoryDetails = buildCategoryDetails(personExpenses);
      let totalAmount = 0;
      let rows = "";
      CATEGORY_ORDER.forEach((cat) => {
        const amount = categoryTotals[cat] || 0;
        const displayName = CATEGORY_DISPLAY[cat] || cat;
        totalAmount += amount;
        if (categoryDetails[cat] && categoryDetails[cat].length) {
          const tip = categoryDetails[cat].join("<br>");
          rows += `<div class="tooltip-container">${Utils.categoryIcon(cat)} ${Utils.escapeHtml(displayName)}　$${amount.toLocaleString()}<span class="tooltip-text">${tip}</span></div>`;
        } else {
          rows += `<div>${Utils.categoryIcon(cat)} ${Utils.escapeHtml(displayName)}　$${amount.toLocaleString()}</div>`;
        }
      });
      grandTotal += totalAmount;

      const pMemos = personMemos[person] || [];
      const memoHtml = pMemos.length
        ? `<p class="text-muted" style="margin-top:0.5rem">📝 備忘</p>${pMemos
            .map((m) => `<small>• ${Utils.shortDate(m.date)} ${Utils.escapeHtml(m.content)}</small><br/>`)
            .join("")}`
        : "";

      html += `<div class="panel" data-person="${Utils.escapeHtml(person)}">
        <div class="text-dim" style="font-size:0.85rem">${state.year} 全年</div>
        <h3 style="margin:0.2rem 0 0.6rem">${Utils.escapeHtml(person)}</h3>
        ${rows}
        <p style="margin-top:0.6rem"><strong>Total $${totalAmount.toLocaleString()}</strong></p>
        ${state.manageMode && personExpenses.length ? renderManageExpenses(personExpenses) : ""}
        ${memoHtml}
      </div>`;
    });
    html += `</div>`;

    html += `<div class="metric" style="max-width:260px"><div class="label">全年總計</div><div class="value">${Utils.fmtMoney(grandTotal)}</div></div>`;

    // 月度趨勢
    const monthlyTotals = new Array(13).fill(0);
    yearlyExpenses.forEach((e) => {
      const m = parseInt(e.date.slice(5, 7), 10);
      monthlyTotals[m] += e.amount * e.quantity;
    });
    const maxVal = Math.max(...monthlyTotals.slice(1), 1);
    html += `<hr class="divider" /><h3>月度趨勢</h3><div class="bar-chart">`;
    for (let m = 1; m <= 12; m++) {
      const v = monthlyTotals[m];
      const heightPct = Math.round((v / maxVal) * 100);
      html += `<div class="bar-col">
        <div class="bar-value">${v ? Math.round(v).toLocaleString() : ""}</div>
        <div class="bar" style="height:${heightPct}%"></div>
        <div class="bar-label">${Utils.getMonthName(m)}</div>
      </div>`;
    }
    html += `</div>`;

    if (uncategorized.length) {
      html += `<hr class="divider" /><h3>📝 全年備忘（未歸類）</h3>${renderUncategorizedMemos(uncategorized)}`;
    }

    main.innerHTML = html;
    bindManageHandlers(main, () => renderYearlyReport(main));
  }

  // ===== 查詢 =====

  function fillQueryOptions() {
    const persons = DB.getAllPersons();
    document.getElementById("query-person").innerHTML =
      `<option value="">全部</option>` + persons.map((p) => `<option value="${Utils.escapeHtml(p.name)}">${Utils.escapeHtml(p.name)}</option>`).join("");
    document.getElementById("query-category").innerHTML =
      `<option value="">全部</option>` + CATEGORY_ORDER.map((c) => `<option value="${c}">${Utils.escapeHtml(CATEGORY_DISPLAY[c] || c)}</option>`).join("");
  }

  function runQuery() {
    const person = document.getElementById("query-person").value;
    const category = document.getElementById("query-category").value;
    const amount = parseInt(document.getElementById("query-amount").value, 10) || 0;

    let list = DB.getExpenses({ year: state.year });
    if (person) list = list.filter((e) => e.person === person);
    if (category) list = list.filter((e) => e.category === category);
    if (amount > 0) list = list.filter((e) => e.amount * e.quantity === amount);

    const el = document.getElementById("query-result");
    if (!list.length) {
      el.innerHTML = `<div class="alert warning">查無資料</div>`;
      return;
    }
    el.innerHTML =
      `<div class="alert success">找到 ${list.length} 筆記錄</div>` +
      list
        .map((e) => {
          const catDisplay = CATEGORY_DISPLAY[e.category] || e.category;
          return `<div>📅 ${e.date} (${Utils.shortDate(e.date)}) | ${Utils.escapeHtml(e.person)} | ${Utils.categoryIcon(e.category)} ${Utils.escapeHtml(catDisplay)} | $${e.amount}×${e.quantity}=$${(e.amount * e.quantity).toFixed(0)}</div>`;
        })
        .join("");
  }

  // ===== 匯出 =====

  function exportCSV() {
    const list = state.reportType === "yearly" ? DB.getExpenses({ year: state.year }) : DB.getExpenses({ year: state.year, month: state.month });
    if (!list.length) {
      Utils.toast("無資料可匯出", "info");
      return;
    }
    const rows = list.map((e) => ({ ...e, total: (e.amount * e.quantity).toFixed(2) }));
    const csv = Utils.toCSV(rows, ["id", "date", "category", "person", "amount", "quantity", "note", "total"]);
    const filename = `expenses_${state.year}_${state.reportType === "yearly" ? "all" : state.month}.csv`;
    Utils.downloadFile(filename, csv, "text/csv;charset=utf-8");
  }

  function exportTextReport() {
    const persons = DB.getAllPersons();
    const personNames = persons.map((p) => p.name);
    const isYearly = state.reportType === "yearly";
    const expenses = isYearly ? DB.getExpenses({ year: state.year }) : DB.getExpenses({ year: state.year, month: state.month });
    const memos = isYearly ? DB.getMemos({ year: state.year }) : DB.getMemos({ year: state.year, month: state.month });
    const monthLabel = isYearly ? `${state.year} 全年` : `${state.year} ${Utils.getMonthName(state.month)}`;

    if (!expenses.length) {
      Utils.toast("無資料可匯出", "info");
      return;
    }

    const { personMemos, uncategorized } = categorizeMemosByPerson(memos, personNames);
    const sections = [`${monthLabel} 月結報表`];
    personNames.forEach((person) => {
      const personExpenses = expenses.filter((e) => e.person === person);
      const personMemoList = personMemos[person] || [];
      if (!personExpenses.length && !personMemoList.length) return;
      const categoryTotals = categoryTotalsFromExpenses(personExpenses);
      const categoryDetails = buildCategoryDetails(personExpenses);
      sections.push(buildCardText(person, categoryTotals, monthLabel, personMemoList, categoryDetails));
    });

    if (uncategorized.length) {
      const rows = uncategorized.map((m) => `${Utils.shortDate(m.date)} ${m.person || ""} ${m.content}`);
      sections.push(`備忘（未歸類）\n\n${rows.join("\n")}`);
    }

    const fullText = sections.join("\n\n" + "=".repeat(30) + "\n\n");
    const filename = `report_${state.year}_${isYearly ? "all" : state.month}.txt`;
    Utils.downloadFile(filename, fullText, "text/plain;charset=utf-8");
  }

  // ===== 主流程 =====

  function renderMain() {
    const main = document.getElementById("report-main");
    if (state.reportType === "monthly") renderMonthlyReport(main);
    else if (state.reportType === "compare") renderCompareReport(main);
    else renderYearlyReport(main);
  }

  function init() {
    DB.init();
    fillSidebar();
    fillQueryOptions();
    renderMain();

    document.getElementById("filter-year").addEventListener("change", (e) => {
      state.year = parseInt(e.target.value, 10);
      fillMonthSelect();
      state.compare.months = [];
      renderMain();
    });
    document.getElementById("filter-month").addEventListener("change", (e) => {
      state.month = parseInt(e.target.value, 10);
      renderMain();
    });
    document.getElementById("report-type").addEventListener("change", (e) => {
      state.reportType = e.target.value;
      renderMain();
    });
    document.getElementById("manage-mode").addEventListener("change", (e) => {
      state.manageMode = e.target.checked;
      renderMain();
    });
    document.getElementById("btn-query").addEventListener("click", runQuery);
    document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
    document.getElementById("btn-export-txt").addEventListener("click", exportTextReport);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
