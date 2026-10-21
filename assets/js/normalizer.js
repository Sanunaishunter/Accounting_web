/**
 * normalizer.js - 把原始記帳文字整理成 parser 好處理的格式
 *
 * 只動兩種內容，其餘行原樣保留：
 *  1. ⚠️ 備忘行（含日期行底下的獨立備忘）
 *  2. 類別行裡「不是人名」的項目（例如 晚餐：傑森烤肉裕毛屋棉花田），會被拉成 ⚠️ 備忘
 *
 * ⚠️ 行規則：
 *  - 以 、 或 「+文字」 拆成一個品項一行；名稱前綴（米媽媽、泰禎，好市多）與品項交叉組合
 *  - 每項金額統一寫成 +$金額；沒有金額補 +$0000
 *  - 算式保留在括號內：單價*數量 -> (190*20)+$3800、+200-230 -> (+200-230)+$-30
 *
 * 純函式、不碰 DOM／DB，Node 與瀏覽器皆可使用。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Normalizer = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_CATEGORIES = ["早餐", "中餐", "晚餐", "點心", "電費", "飲料", "文具", "牛奶"];
  const WARN = "⚠️";

  const DATE_LINE = /^\d{1,2}\/\d{1,2}(?:[、,，]\d{1,2}\/\d{1,2})*(?:[（(].*[）)])?$/;
  const DATE_PREFIX = /^\d{1,2}\/\d{1,2}(?:[、]\d{1,2}\/\d{1,2})*/;
  const CATEGORY_LINE = /^(.+?)([：:])(.*)$/;
  const SPLIT_PLUS_TEXT = /[+＋](?![\d$＄])/;
  const CONNECTOR = /^(還有|以及)/;
  const NUM = "\\d+(?:\\.\\d+)?";

  function isWarnLine(line) {
    return line.includes("⚠");
  }

  function stripWarn(line) {
    return line.replaceAll("⚠️", "").replaceAll("⚠", "").trim();
  }

  function evalExpr(expr) {
    if (!/^[\d.+\-*/\s]+$/.test(expr)) return null;
    try {
      const v = Function(`"use strict";return (${expr})`)();
      return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
    } catch (e) {
      return null;
    }
  }

  function editDistanceAtMostOne(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  class Normalizer {
    constructor(opts) {
      opts = opts || {};
      this.categories = opts.categories && opts.categories.length ? opts.categories : DEFAULT_CATEGORIES;
      this.names = [...new Set(opts.names || [])].filter(Boolean).sort((a, b) => b.length - a.length);
      this.flags = [];
      this.derived = [];
    }

    flag(msg) {
      this.flags.push(msg);
    }

    // ---- 名稱判斷 ----

    /** 開頭的已知名稱（含「家」後綴）；沒有則回傳 "" */
    leadingName(str) {
      for (const n of this.names) {
        if (str.startsWith(n + "家")) return n + "家";
        if (str.startsWith(n)) return n;
      }
      return "";
    }

    isKnownToken(token) {
      if (this.names.includes(token)) return true;
      return token.endsWith("家") && this.names.includes(token.slice(0, -1));
    }

    // ---- 單一品項：算出 名稱 + 金額 ----

    formatItem(item, nameSuffix) {
      item = item.trim();
      const addSuffix = (name) => (nameSuffix && !name.includes(nameSuffix) ? name + nameSuffix : name);
      let m;

      // 已整理過：... +$金額
      if ((m = new RegExp(`^(.*?)(\\+[$＄]-?${NUM})$`).exec(item))) {
        return addSuffix(m[1]) + m[2].replace("＄", "$").replace("＋", "+");
      }
      // +算式：+200-230
      if ((m = new RegExp(`^(.*?)[+＋](${NUM}(?:[+\\-*/]${NUM})+)$`).exec(item))) {
        const v = evalExpr("+" + m[2]);
        if (v !== null) {
          this.flag(`「${item}」含算式，已寫成 (+${m[2]})+$${v}，請確認`);
          return `${addSuffix(m[1])}(+${m[2]})+$${v}`;
        }
      }
      // +金額
      if ((m = new RegExp(`^(.*?)[+＋](${NUM})$`).exec(item))) {
        return `${addSuffix(m[1])}+$${m[2]}`;
      }
      // 單價*數量：190*20
      if ((m = new RegExp(`^(.*?)(${NUM}(?:\\*${NUM})+)$`).exec(item)) && m[1]) {
        const v = evalExpr(m[2]);
        if (v !== null) {
          this.derived.push({ kind: "product", item, value: v });
          return `${addSuffix(m[1])}(${m[2]})+$${v}`;
        }
      }
      // 名稱後面直接接數字：多益1200
      if ((m = new RegExp(`^(.*[^\\d.\\s*+\\-])(${NUM})$`).exec(item))) {
        this.derived.push({ kind: "trailing", item, value: Number(m[2]) });
        this.flag(`「${item}」尾端數字視為金額 +$${m[2]}，請確認`);
        return `${addSuffix(m[1] + m[2])}+$${m[2]}`;
      }
      return `${addSuffix(item)}+$0000`;
    }

    // ---- ⚠️ 內容：拆項、交叉組合 ----

    splitItems(text) {
      return text
        .split(/[、,，]/)
        .flatMap((seg) => seg.split(SPLIT_PLUS_TEXT))
        .map((s) => s.trim().replace(CONNECTOR, "").trim())
        .filter(Boolean);
    }

    memoItems(content) {
      const comma = content.search(/[，,]/);
      if (comma >= 0) {
        const left = content.slice(0, comma);
        const tokens = left.split("、").map((s) => s.trim());
        if (tokens.length && tokens.every((t) => this.isKnownToken(t))) {
          const items = this.splitItems(content.slice(comma + 1));
          return tokens.flatMap((t) => items.map((it) => t + it));
        }
      }
      const items = this.splitItems(content);
      if (items.length > 1) {
        const prefix = this.leadingName(items[0]);
        if (prefix && items[0].length > prefix.length) {
          return items.map((it, i) => (i > 0 && !this.leadingName(it) ? prefix + it : it));
        }
      }
      return items;
    }

    /** 一行 ⚠️ 備忘（或獨立備忘）-> 多行 ⚠️ */
    memoLines(content, datePrefix, nameSuffix) {
      content = stripWarn(content);
      let prefix = datePrefix || "";
      const dm = DATE_PREFIX.exec(content);
      if (dm) {
        prefix = dm[0];
        content = content.slice(dm[0].length);
      }
      const items = this.memoItems(content);
      if (!items.length) return [`${WARN}${prefix ? " " + prefix : ""}${content}${WARN}`];
      return items.map((it) => `${WARN}${prefix ? " " + prefix : ""}${this.formatItem(it, nameSuffix)}${WARN}`);
    }

    // ---- 類別行：把非人名項目拉出來 ----

    classifyPersonItem(item, base) {
      let core = item.trim();
      let prev;
      do {
        prev = core;
        core = core.replace(/[+＋][$＄]?[\d.+\-*/]+$/, "").replace(/\*\d+(?:\.\d+)?$/, "");
      } while (core !== prev);
      core = core.replace(/\d+$/, "") || core;

      const allowed = new Set(["", base, ...this.categories]);
      for (const n of this.names) {
        if (core.startsWith(n) && allowed.has(core.slice(n.length))) return "person";
      }
      const bare = this.categories.reduce((s, c) => (s.endsWith(c) ? s.slice(0, -c.length) : s), core);
      if (bare.length >= 2) {
        for (const n of this.names) {
          if (n.length >= 2 && bare !== n && editDistanceAtMostOne(bare, n)) {
            this.flag(`「${item}」疑似「${n}」的錯字，保留在原位`);
            return "person";
          }
        }
      }
      return "other";
    }

    categoryLine(line, m) {
      const base = m[1].trim().replace(/\*\d+(?:\.\d+)?$/, "").trim();
      if (!this.categories.includes(base)) {
        this.flag(`未知類別「${base}」，該行未處理`);
        return { line, memos: [] };
      }
      const content = m[3].trim();
      if (!content || content === "無") return { line, memos: [] };

      const kept = [];
      const memos = [];
      for (const item of content.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)) {
        if (this.classifyPersonItem(item, base) === "person") {
          kept.push(item);
        } else {
          memos.push(...this.memoLines(item, "", base === "電費" ? "電費" : ""));
        }
      }
      if (!memos.length) return { line, memos: [] };
      return { line: `${m[1].trim()}${m[2]}${kept.join("、")}`, memos };
    }

    // ---- 主流程 ----

    normalize(text) {
      this.flags = [];
      this.derived = [];
      const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
      const out = [];
      let block = null; // { insertAt, prefix }

      const addMemos = (memos) => {
        if (!memos.length) return;
        out.splice(block.insertAt, 0, ...memos);
        block.insertAt += memos.length;
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (DATE_LINE.test(line)) {
          const multi = /[、,，]/.test(line);
          block = {
            insertAt: out.length + 1,
            prefix: multi ? line.replace(/[（(].*[）)]$/, "").trim() : "",
            fresh: true,
          };
          out.push(rawLine);
          continue;
        }
        if (!block) {
          out.push(rawLine);
          continue;
        }
        if (!line) {
          out.push(rawLine);
          if (block.fresh && block.insertAt === out.length - 1) block.insertAt = out.length;
          continue;
        }

        const adjacent = block.insertAt === out.length;
        block.fresh = false;

        if (isWarnLine(line)) {
          out.push(...this.memoLines(line, block.prefix));
          if (adjacent) block.insertAt = out.length;
          continue;
        }

        const m = CATEGORY_LINE.exec(line);
        if (m) {
          const res = this.categoryLine(line, m);
          out.push(res.line === line ? rawLine : res.line);
          addMemos(res.memos);
          continue;
        }

        // 不屬於任何類別的獨立行 -> 備忘
        this.flag(`獨立行「${line}」轉為 ⚠️ 備忘`);
        out.push(...this.memoLines(line, block.prefix));
        if (adjacent) block.insertAt = out.length;
      }

      return { text: out.join("\n"), flags: this.flags, derived: this.derived };
    }
  }

  // ===== 獨立檢查：用不同於轉換器的角度驗證輸出 =====

  function sumAmounts(text) {
    let total = 0;
    for (const raw of text.split("\n")) {
      if (DATE_LINE.test(raw.trim())) continue;
      const line = raw.replace(/\([^)]*\)/g, "");
      const re = new RegExp(`[+＋][$＄]?(-?${NUM}(?:[+\\-*/]${NUM})*)`, "g");
      let m;
      while ((m = re.exec(line))) {
        const v = evalExpr(m[1].startsWith("-") ? m[1] : "+" + m[1]);
        if (v !== null) total += v;
      }
    }
    return total;
  }

  function cjkChars(text) {
    return new Set(text.replace(/還有|以及/g, "").match(/[一-鿿]/g) || []);
  }

  function check(input, output, derived, opts) {
    const categories = (opts && opts.categories) || DEFAULT_CATEGORIES;
    const problems = [];
    const inLines = String(input).replace(/\r\n?/g, "\n").split("\n").map((s) => s.trim());
    const outLines = String(output).split("\n").map((s) => s.trim());

    const seq = (ls, pick) => ls.map(pick).filter(Boolean).join("|");
    const dateOf = (l) => (DATE_LINE.test(l) ? l : "");
    if (seq(inLines, dateOf) !== seq(outLines, dateOf)) problems.push("日期行與原文不一致");

    const catOf = (l) => {
      if (isWarnLine(l)) return "";
      const m = CATEGORY_LINE.exec(l);
      if (!m) return "";
      const base = m[1].trim().replace(/\*\d+(?:\.\d+)?$/, "").trim();
      return categories.includes(base) ? base : "";
    };
    if (seq(inLines, catOf) !== seq(outLines, catOf)) problems.push("類別行的數量或順序與原文不一致");

    outLines.filter(isWarnLine).forEach((l) => {
      if (!new RegExp(`^⚠️ ?.+[+][$＄]-?${NUM}⚠️$`).test(l)) problems.push(`⚠️ 行格式不符：${l}`);
    });

    const outChars = cjkChars(output);
    const lost = [...cjkChars(input)].filter((c) => !outChars.has(c));
    if (lost.length) problems.push(`原文的字在輸出中消失：${lost.join("")}`);

    const derivedSum = (derived || []).reduce((s, d) => s + d.value, 0);
    const diff = sumAmounts(output) - sumAmounts(input) - derivedSum;
    if (Math.abs(diff) > 0.001) {
      problems.push(`金額合計不符：輸入 ${sumAmounts(input)} + 推算 ${derivedSum} ≠ 輸出 ${sumAmounts(output)}`);
    }

    (derived || []).forEach((d) => {
      if (d.kind === "trailing" && !input.includes(String(d.value))) problems.push(`推算金額 ${d.value} 在原文中找不到`);
    });

    return { ok: problems.length === 0, problems };
  }

  function normalize(text, opts) {
    const n = new Normalizer(opts);
    const res = n.normalize(text);
    const verdict = check(text, res.text, res.derived, opts);
    return { text: res.text, flags: res.flags, derived: res.derived, ok: verdict.ok, problems: verdict.problems };
  }

  return { Normalizer, normalize, check, DEFAULT_CATEGORIES };
});
