/**
 * db.js - localStorage 資料層
 * 對應原本 Python 版 database.py 的 SQLite 操作，改用瀏覽器 localStorage 儲存。
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "accounting_data_v1";

  const DEFAULT_CATEGORIES = {
    "早餐": 70,
    "中餐": 150,
    "晚餐": 150,
    "牛奶": 40,
    "點心": 0,
    "飲料": 0,
    "文具": 0,
  };

  const DEFAULT_PERSONS = ["阿鵰", "泰禎", "紫緹", "牧恩", "咏恩", "傑森", "崴崴"];

  const DEFAULT_PROXIES = [
    { keyword: "台北媽媽", proxy_for: "牧恩", note: "牧恩的媽媽" },
    { keyword: "米媽媽", proxy_for: "傑森", note: "傑森的媽媽" },
  ];

  let _data = null;

  function defaultData() {
    const persons = DEFAULT_PERSONS.map((name, i) => ({ id: i + 1, name, aliases: "" }));
    const proxies = DEFAULT_PROXIES.map((p, i) => ({ id: i + 1, ...p }));
    return {
      nextIds: {
        persons: persons.length + 1,
        expenses: 1,
        pendingReviews: 1,
        memos: 1,
        personProxies: proxies.length + 1,
      },
      persons: persons,
      categoryPrices: { ...DEFAULT_CATEGORIES },
      expenses: [],
      pendingReviews: [],
      memos: [],
      personProxies: proxies,
    };
  }

  function load() {
    if (_data) return _data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _data = JSON.parse(raw);
        // 補齊可能缺少的欄位（版本升級用）
        _data.nextIds = _data.nextIds || {};
        _data.persons = _data.persons || [];
        _data.categoryPrices = _data.categoryPrices || { ...DEFAULT_CATEGORIES };
        _data.expenses = _data.expenses || [];
        _data.pendingReviews = _data.pendingReviews || [];
        _data.memos = _data.memos || [];
        _data.personProxies = _data.personProxies || [];
      } else {
        _data = defaultData();
        persist();
      }
    } catch (e) {
      console.error("讀取資料失敗，使用預設資料", e);
      _data = defaultData();
    }
    return _data;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
  }

  function nextId(kind) {
    const d = load();
    const id = d.nextIds[kind] || 1;
    d.nextIds[kind] = id + 1;
    return id;
  }

  // ========== Persons ==========

  function getAllPersons() {
    const d = load();
    return [...d.persons].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }

  function addPerson(name, aliases) {
    name = (name || "").trim();
    aliases = (aliases || "").trim();
    if (!name) throw new Error("人員名稱不可為空");
    const d = load();
    if (d.persons.some((p) => p.name === name)) {
      throw new Error(`人員「${name}」已存在`);
    }
    const person = { id: nextId("persons"), name, aliases };
    d.persons.push(person);
    persist();
    return person.id;
  }

  function updatePersonAliases(personId, aliases) {
    const d = load();
    const p = d.persons.find((p) => p.id === personId);
    if (!p) return false;
    p.aliases = (aliases || "").trim();
    persist();
    return true;
  }

  function addAliasToPerson(personId, newAlias) {
    newAlias = (newAlias || "").trim();
    if (!newAlias) return false;
    const d = load();
    const p = d.persons.find((p) => p.id === personId);
    if (!p) return false;
    const list = p.aliases ? p.aliases.split(",").map((a) => a.trim()).filter(Boolean) : [];
    if (list.includes(newAlias)) return false;
    list.push(newAlias);
    p.aliases = list.join(",");
    persist();
    return true;
  }

  function deletePerson(personId) {
    const d = load();
    const before = d.persons.length;
    d.persons = d.persons.filter((p) => p.id !== personId);
    persist();
    return d.persons.length < before;
  }

  // ========== Category Prices ==========

  function getAllCategoryPrices() {
    const d = load();
    const sorted = {};
    Object.keys(d.categoryPrices)
      .sort((a, b) => a.localeCompare(b, "zh-Hant"))
      .forEach((k) => (sorted[k] = d.categoryPrices[k]));
    return sorted;
  }

  function updateCategoryPrice(category, price) {
    if (price < 0) throw new Error("單價不可為負數");
    const d = load();
    if (!(category in d.categoryPrices)) return false;
    d.categoryPrices[category] = price;
    persist();
    return true;
  }

  // ========== Expenses ==========

  function addExpense({ date, category, person, amount, quantity = 1, note = "" }) {
    if (!date || !category || !person) throw new Error("日期、類別、人員皆為必填");
    if (amount < 0) throw new Error("金額不可為負數");
    if (quantity <= 0) throw new Error("數量必須大於 0");
    const d = load();
    const exp = { id: nextId("expenses"), date, category, person, amount, quantity, note };
    d.expenses.push(exp);
    persist();
    return exp.id;
  }

  function expenseExists(date, category, person) {
    const d = load();
    return d.expenses.some((e) => e.date === date && e.category === category && e.person === person);
  }

  function getExpenses({ year, month, persons } = {}) {
    const d = load();
    let list = d.expenses;
    if (year !== undefined && year !== null) {
      list = list.filter((e) => e.date.slice(0, 4) === String(year));
    }
    if (month !== undefined && month !== null) {
      list = list.filter((e) => parseInt(e.date.slice(5, 7), 10) === month);
    }
    if (persons && persons.length) {
      list = list.filter((e) => persons.includes(e.person));
    }
    list = [...list].sort((a, b) =>
      a.date === b.date
        ? a.category === b.category
          ? a.person.localeCompare(b.person, "zh-Hant")
          : a.category.localeCompare(b.category, "zh-Hant")
        : a.date.localeCompare(b.date)
    );
    return list;
  }

  function deleteExpense(id) {
    const d = load();
    const before = d.expenses.length;
    d.expenses = d.expenses.filter((e) => e.id !== id);
    persist();
    return d.expenses.length < before;
  }

  function getExpenseYears() {
    const d = load();
    const years = new Set(d.expenses.map((e) => parseInt(e.date.slice(0, 4), 10)));
    return [...years].sort((a, b) => b - a);
  }

  function getExpenseMonths(year) {
    const d = load();
    const months = new Set(
      d.expenses.filter((e) => e.date.slice(0, 4) === String(year)).map((e) => parseInt(e.date.slice(5, 7), 10))
    );
    return [...months].sort((a, b) => a - b);
  }

  function getDatesWithData(year, month) {
    const d = load();
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const days = new Set();
    d.expenses.forEach((e) => {
      if (e.date.startsWith(ym)) days.add(parseInt(e.date.slice(8, 10), 10));
    });
    d.memos.forEach((m) => {
      if (m.date.startsWith(ym)) days.add(parseInt(m.date.slice(8, 10), 10));
    });
    return days;
  }

  function getExpensesByDate(date) {
    const d = load();
    return d.expenses
      .filter((e) => e.date === date)
      .sort((a, b) => (a.category === b.category ? a.person.localeCompare(b.person, "zh-Hant") : a.category.localeCompare(b.category, "zh-Hant")));
  }

  function findExpensesByDateAndAmount(date, amount) {
    const d = load();
    return d.expenses
      .filter((e) => e.date === date && e.amount === amount)
      .sort((a, b) => (a.category === b.category ? a.person.localeCompare(b.person, "zh-Hant") : a.category.localeCompare(b.category, "zh-Hant")));
  }

  function deleteExpensesByDate(date) {
    const d = load();
    const before = d.expenses.length;
    d.expenses = d.expenses.filter((e) => e.date !== date);
    persist();
    return before - d.expenses.length;
  }

  function deleteDayData(date) {
    const d = load();
    const expBefore = d.expenses.length;
    d.expenses = d.expenses.filter((e) => e.date !== date);
    const expenses = expBefore - d.expenses.length;

    const memoBefore = d.memos.length;
    d.memos = d.memos.filter((m) => m.date !== date);
    const memos = memoBefore - d.memos.length;

    const pendBefore = d.pendingReviews.length;
    d.pendingReviews = d.pendingReviews.filter((p) => p.date !== date);
    const pending = pendBefore - d.pendingReviews.length;

    persist();
    return { expenses, memos, pending };
  }

  // ========== Pending Review ==========

  function addPendingReview(rawText, sourceLine, date) {
    const d = load();
    const item = {
      id: nextId("pendingReviews"),
      raw_text: (rawText || "").trim(),
      source_line: (sourceLine || "").trim(),
      date,
      created_at: new Date().toISOString(),
    };
    d.pendingReviews.push(item);
    persist();
    return item.id;
  }

  function getAllPendingReviews() {
    const d = load();
    return [...d.pendingReviews].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  function deletePendingReview(id) {
    const d = load();
    const before = d.pendingReviews.length;
    d.pendingReviews = d.pendingReviews.filter((p) => p.id !== id);
    persist();
    return d.pendingReviews.length < before;
  }

  // ========== Person Proxy ==========

  function getPersonProxies() {
    const d = load();
    return [...d.personProxies].sort((a, b) => a.keyword.localeCompare(b.keyword, "zh-Hant"));
  }

  function getPersonProxyMappings() {
    const d = load();
    const map = {};
    d.personProxies.forEach((p) => (map[p.keyword] = p.proxy_for));
    return map;
  }

  function addPersonProxy(keyword, proxyFor, note = "") {
    keyword = (keyword || "").trim();
    proxyFor = (proxyFor || "").trim();
    if (!keyword) throw new Error("關鍵字不可為空");
    if (!proxyFor) throw new Error("代理人員不可為空");
    const d = load();
    if (d.personProxies.some((p) => p.keyword === keyword)) {
      throw new Error(`關鍵字「${keyword}」已存在`);
    }
    const item = { id: nextId("personProxies"), keyword, proxy_for: proxyFor, note: (note || "").trim() };
    d.personProxies.push(item);
    persist();
    return item.id;
  }

  function updatePersonProxy(id, keyword, proxyFor, note = "") {
    const d = load();
    const p = d.personProxies.find((p) => p.id === id);
    if (!p) return false;
    p.keyword = (keyword || "").trim();
    p.proxy_for = (proxyFor || "").trim();
    p.note = (note || "").trim();
    persist();
    return true;
  }

  function deletePersonProxy(id) {
    const d = load();
    const before = d.personProxies.length;
    d.personProxies = d.personProxies.filter((p) => p.id !== id);
    persist();
    return d.personProxies.length < before;
  }

  // ========== Memos ==========

  function addMemo(date, content, person = null) {
    content = (content || "").trim();
    if (!content) return -1;
    const d = load();
    if (d.memos.some((m) => m.date === date && m.content === content)) return -1;
    const memo = { id: nextId("memos"), date, content, person: person || null };
    d.memos.push(memo);
    persist();
    return memo.id;
  }

  function getMemosByDate(date) {
    const d = load();
    return d.memos.filter((m) => m.date === date).sort((a, b) => a.id - b.id);
  }

  function getMemos({ year, month } = {}) {
    const d = load();
    let list = d.memos;
    if (year !== undefined && year !== null) {
      list = list.filter((m) => m.date.slice(0, 4) === String(year));
    }
    if (month !== undefined && month !== null) {
      list = list.filter((m) => parseInt(m.date.slice(5, 7), 10) === month);
    }
    return [...list].sort((a, b) => (a.date === b.date ? a.id - b.id : b.date.localeCompare(a.date)));
  }

  function deleteMemo(id) {
    const d = load();
    const before = d.memos.length;
    d.memos = d.memos.filter((m) => m.id !== id);
    persist();
    return d.memos.length < before;
  }

  // ========== 清除資料 ==========

  function clearMonthData(year, month) {
    if (month < 1 || month > 12) throw new Error("月份必須在 1-12 之間");
    const d = load();
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    const expBefore = d.expenses.length;
    d.expenses = d.expenses.filter((e) => !e.date.startsWith(ym));
    const expenses = expBefore - d.expenses.length;

    const pendBefore = d.pendingReviews.length;
    d.pendingReviews = d.pendingReviews.filter((p) => !p.date.startsWith(ym));
    const pending = pendBefore - d.pendingReviews.length;

    const memoBefore = d.memos.length;
    d.memos = d.memos.filter((m) => !m.date.startsWith(ym));
    const memos = memoBefore - d.memos.length;

    persist();
    return { expenses, pending, memos };
  }

  // ========== 備份 / 還原 ==========

  function exportData() {
    return JSON.stringify(load(), null, 2);
  }

  function importData(jsonText) {
    const parsed = JSON.parse(jsonText);
    _data = parsed;
    persist();
  }

  function resetAll() {
    _data = defaultData();
    persist();
  }

  global.DB = {
    init: load,
    getAllPersons,
    addPerson,
    updatePersonAliases,
    addAliasToPerson,
    deletePerson,
    getAllCategoryPrices,
    updateCategoryPrice,
    addExpense,
    expenseExists,
    getExpenses,
    deleteExpense,
    getExpenseYears,
    getExpenseMonths,
    getDatesWithData,
    getExpensesByDate,
    findExpensesByDateAndAmount,
    deleteExpensesByDate,
    deleteDayData,
    addPendingReview,
    getAllPendingReviews,
    deletePendingReview,
    getPersonProxies,
    getPersonProxyMappings,
    addPersonProxy,
    updatePersonProxy,
    deletePersonProxy,
    addMemo,
    getMemosByDate,
    getMemos,
    deleteMemo,
    clearMonthData,
    exportData,
    importData,
    resetAll,
  };
})(window);
