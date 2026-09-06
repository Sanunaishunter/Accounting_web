/**
 * utils.js - 共用工具函式
 */
(function (global) {
  "use strict";

  const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
  const MONTH_NAMES = {
    1: "一月", 2: "二月", 3: "三月", 4: "四月",
    5: "五月", 6: "六月", 7: "七月", 8: "八月",
    9: "九月", 10: "十月", 11: "十一月", 12: "十二月",
  };
  const CATEGORY_ORDER = ["早餐", "中餐", "晚餐", "牛奶", "點心", "飲料", "文具"];
  const CATEGORY_DISPLAY = {
    "早餐": "早餐", "中餐": "午餐", "晚餐": "晚餐", "牛奶": "鮮奶",
    "點心": "點心", "飲料": "飲料", "文具": "文具",
  };
  const MEMO_AMOUNT_RE = /[+＋$＄]\s*[$＄]?\s*(\d+(?:\.\d+)?)/;

  function getMonthName(m) {
    return MONTH_NAMES[m] || `${m}月`;
  }

  /** JS getDay(): 0=Sun..6=Sat -> 轉成中文（週一為一） */
  function weekdayName(year, month, day) {
    const jsDay = new Date(year, month - 1, day).getDay(); // 0=Sun
    const idx = (jsDay + 6) % 7; // 0=Mon..6=Sun
    return WEEKDAYS[idx];
  }

  function formatDateTitle(year, month, day) {
    return `${month}/${day}（${weekdayName(year, month, day)}）`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateStr(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  function splitDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
    return { y, m, d };
  }

  function shortDate(dateStr) {
    const { m, d } = splitDate(dateStr);
    return `${m}/${d}`;
  }

  function fmtMoney(n) {
    return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  /** 產生月曆週次陣列（週一開始），0 代表非本月 */
  function monthCalendar(year, month) {
    const first = new Date(year, month - 1, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0=Mon
    const total = daysInMonth(year, month);
    const weeks = [];
    let week = new Array(firstWeekday).fill(0);
    for (let d = 1; d <= total; d++) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(0);
      weeks.push(week);
    }
    return weeks;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(msg, type = "success") {
    const container = document.getElementById("toast-container") || (() => {
      const c = document.createElement("div");
      c.id = "toast-container";
      document.body.appendChild(c);
      return c;
    })();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  function toCSV(rows, headers) {
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      lines.push(headers.map((h) => csvEscape(r[h])).join(","));
    });
    return "﻿" + lines.join("\n");
  }

  global.Utils = {
    WEEKDAYS, MONTH_NAMES, CATEGORY_ORDER, CATEGORY_DISPLAY, MEMO_AMOUNT_RE,
    getMonthName, weekdayName, formatDateTitle, pad2, toDateStr, splitDate,
    shortDate, fmtMoney, escapeHtml, daysInMonth, monthCalendar, downloadFile,
    toast, toCSV,
  };
})(window);
