/**
 * parser.js - 解析半結構化中文記帳文字
 * 對應原本 Python 版 parser.py，行為需保持一致：
 *  - 日期行 (`1/19（一）`) 忽略，改用傳入的 target_date
 *  - ⚠️ 開頭視為備忘，並嘗試比對 person_proxy 關鍵字
 *  - `類別：人名、人名` 基本格式
 *  - `人名+金額` 額外金額 / `人名240` 無加號亦可
 *  - `人名*次數` 或 `類別*次數：` 次數
 *  - 未知類別或無法解析的行，視為備忘
 */
(function (global) {
  "use strict";

  const MatchConfidence = { EXACT: "exact", PREFIX: "prefix", FUZZY: "fuzzy", NONE: "none" };
  const ParseStatus = {
    SUCCESS: "success",
    NEEDS_CONFIRM: "confirm",
    FAILED: "failed",
    DUPLICATE: "duplicate",
    SKIPPED: "skipped",
  };

  const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:[（(].*[）)])?$/;
  const CATEGORY_PATTERN = /^(.+?)[：:](.*)$/;
  const CATEGORY_QUANTITY_PATTERN = /^(.+?)\*(\d+(?:\.\d+)?)$/;
  const PERSON_AMOUNT_PATTERN = /^(.+?)[+＋](\d+)$/;
  const PERSON_QUANTITY_PATTERN = /^(.+?)\*(\d+(?:\.\d+)?)$/;

  /** Ratcliff/Obershelp 相似度比對，等同 Python difflib.SequenceMatcher(None, a, b).ratio() */
  function sequenceRatio(a, b) {
    if (a.length === 0 && b.length === 0) return 1.0;

    function findLongestMatch(aStart, aEnd, bStart, bEnd) {
      let bestI = aStart,
        bestJ = bStart,
        bestSize = 0;
      let j2len = {};
      for (let i = aStart; i < aEnd; i++) {
        const newj2len = {};
        for (let j = bStart; j < bEnd; j++) {
          if (a[i] === b[j]) {
            const k = (j2len[j - 1] || 0) + 1;
            newj2len[j] = k;
            if (k > bestSize) {
              bestI = i - k + 1;
              bestJ = j - k + 1;
              bestSize = k;
            }
          }
        }
        j2len = newj2len;
      }
      return [bestI, bestJ, bestSize];
    }

    function matchBlocks(aStart, aEnd, bStart, bEnd, acc) {
      const [i, j, k] = findLongestMatch(aStart, aEnd, bStart, bEnd);
      if (k > 0) {
        if (aStart < i && bStart < j) matchBlocks(aStart, i, bStart, j, acc);
        acc.push(k);
        if (i + k < aEnd && j + k < bEnd) matchBlocks(i + k, aEnd, j + k, bEnd, acc);
      }
      return acc;
    }

    const matches = matchBlocks(0, a.length, 0, b.length, []);
    const matchSum = matches.reduce((s, k) => s + k, 0);
    const total = a.length + b.length;
    if (total === 0) return 1.0;
    return (2.0 * matchSum) / total;
  }

  class ExpenseParser {
    constructor(year) {
      this.year = year || new Date().getFullYear();
      this.personsCache = {}; // name -> person
      this.aliasesCache = {}; // alias -> name
      this.categoryPrices = {};
      this.personProxyMapping = {};
      this._loadCache();
    }

    _loadCache() {
      const persons = DB.getAllPersons();
      persons.forEach((p) => {
        this.personsCache[p.name] = p;
        if (p.aliases) {
          p.aliases.split(",").forEach((alias) => {
            alias = alias.trim();
            if (alias) this.aliasesCache[alias] = p.name;
          });
        }
      });
      this.categoryPrices = DB.getAllCategoryPrices();
      this.personProxyMapping = DB.getPersonProxyMappings();
    }

    parseText(text, targetDate) {
      const result = { expenses: [], memos: [], pending: [], duplicates: [] };
      let currentDate = targetDate || "";

      const lines = text.trim().split("\n");
      for (let rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // 1. 日期行：忽略內容，若無 targetDate 則從文字解析
        const dateMatch = DATE_PATTERN.exec(line);
        if (dateMatch) {
          if (!targetDate) {
            const month = parseInt(dateMatch[1], 10);
            const day = parseInt(dateMatch[2], 10);
            currentDate = `${this.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }
          continue;
        }

        // 2. ⚠️ 備忘
        if (line.includes("⚠️") || line.includes("⚠")) {
          const content = line.replaceAll("⚠️", "").replaceAll("⚠", "").trim();
          if (content && currentDate) {
            let matchedPerson = null;
            for (const [keyword, person] of Object.entries(this.personProxyMapping)) {
              if (content.includes(keyword)) {
                matchedPerson = person;
                break;
              }
            }
            result.memos.push({ date: currentDate, content, has_warning: true, person: matchedPerson });
          }
          continue;
        }

        // 3. 類別行
        const categoryMatch = CATEGORY_PATTERN.exec(line);
        if (categoryMatch) {
          const categoryPart = categoryMatch[1].trim();
          const contentPart = categoryMatch[2].trim();

          if (contentPart === "無" || !contentPart) continue;

          const [category, defaultQty] = this._parseCategoryWithQuantity(categoryPart);

          if (!(category in this.categoryPrices)) {
            if (currentDate) result.memos.push({ date: currentDate, content: line, has_warning: false, person: null });
            continue;
          }

          this._parseExpenseItems(contentPart, category, defaultQty, currentDate, line, result);
          continue;
        }

        // 4. 獨立備忘
        if (currentDate) {
          result.memos.push({ date: currentDate, content: line, has_warning: false, person: null });
        }
      }

      return result;
    }

    _parseCategoryWithQuantity(categoryStr) {
      const m = CATEGORY_QUANTITY_PATTERN.exec(categoryStr);
      if (m) return [m[1], parseFloat(m[2])];
      return [categoryStr, 1.0];
    }

    _parseExpenseItems(content, category, defaultQty, date, sourceLine, result) {
      const items = content.split(/[、,，]/);
      for (let item of items) {
        item = item.trim();
        if (!item) continue;

        const expense = this._parseSingleItem(item, category, defaultQty, date, sourceLine);

        if (expense.status === ParseStatus.FAILED) {
          result.pending.push({ raw_text: item, source_line: sourceLine, date });
        } else if (expense.status === ParseStatus.DUPLICATE) {
          result.duplicates.push(expense);
        } else {
          result.expenses.push(expense);
        }
      }
    }

    _parseSingleItem(item, category, defaultQty, date, sourceLine) {
      let amount = 0;
      let quantity = defaultQty;
      let note = "";
      let personText = item;

      const amountMatch = PERSON_AMOUNT_PATTERN.exec(item);
      if (amountMatch) {
        personText = amountMatch[1];
        amount = parseInt(amountMatch[2], 10);
        note = `+${amount}`;
      } else {
        const extracted = this._extractPersonAndAmount(item);
        if (extracted) {
          personText = extracted[0];
          amount = extracted[1];
          note = `+${amount}`;
        }
      }

      const qtyMatch = PERSON_QUANTITY_PATTERN.exec(personText);
      if (qtyMatch) {
        personText = qtyMatch[1];
        quantity = parseFloat(qtyMatch[2]);
      }

      const [matchedName, confidence] = this._matchPerson(personText);

      if (amount === 0) {
        amount = this.categoryPrices[category] || 0;
      }

      let status;
      if (confidence === MatchConfidence.NONE) {
        status = ParseStatus.FAILED;
      } else if (confidence === MatchConfidence.FUZZY) {
        status = ParseStatus.NEEDS_CONFIRM;
      } else {
        status = ParseStatus.SUCCESS;
        if (matchedName && DB.expenseExists(date, category, matchedName)) {
          status = ParseStatus.DUPLICATE;
        }
      }

      return {
        date,
        category,
        person: matchedName || personText,
        amount,
        quantity,
        note,
        status,
        confidence,
        original_text: item,
        matched_person: matchedName,
      };
    }

    _extractPersonAndAmount(text) {
      text = text.trim();
      if (PERSON_QUANTITY_PATTERN.exec(text)) return null;

      const match = /^(.+?)(\d+)$/.exec(text);
      if (!match) return null;

      const potentialName = match[1];
      const amount = parseInt(match[2], 10);

      if (potentialName in this.personsCache || potentialName in this.aliasesCache) {
        return [potentialName, amount];
      }

      for (const name of Object.keys(this.personsCache)) {
        if (potentialName.startsWith(name)) return [potentialName, amount];
      }
      for (const alias of Object.keys(this.aliasesCache)) {
        if (potentialName.startsWith(alias)) return [potentialName, amount];
      }

      return null;
    }

    _matchPerson(text) {
      text = text.trim();

      if (text in this.personsCache) return [text, MatchConfidence.EXACT];
      if (text in this.aliasesCache) return [this.aliasesCache[text], MatchConfidence.EXACT];

      for (const name of Object.keys(this.personsCache)) {
        if (text.startsWith(name)) return [name, MatchConfidence.PREFIX];
      }
      for (const [alias, name] of Object.entries(this.aliasesCache)) {
        if (text.startsWith(alias)) return [name, MatchConfidence.PREFIX];
      }

      let bestMatch = null;
      let bestRatio = 0.0;
      const allNames = [...Object.keys(this.personsCache), ...Object.keys(this.aliasesCache)];
      for (const name of allNames) {
        const ratio = sequenceRatio(text, name);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMatch = name;
        }
      }

      if (bestRatio >= 0.6) {
        const actualName = this.aliasesCache[bestMatch] || bestMatch;
        return [actualName, MatchConfidence.FUZZY];
      }

      return [null, MatchConfidence.NONE];
    }
  }

  function parseAccountingText(text, targetDate, year) {
    const parser = new ExpenseParser(year);
    return parser.parseText(text, targetDate);
  }

  global.Parser = { ExpenseParser, parseAccountingText, MatchConfidence, ParseStatus, sequenceRatio };
})(window);
