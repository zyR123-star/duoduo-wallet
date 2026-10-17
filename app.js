(() => {
  "use strict";

  const DB_NAME = "duoduo-wallet";
  const DB_VERSION = 1;
  const STORE = "transactions";
  const APP_VERSION = 1;

  const EXPENSE_CATEGORIES = [
    { id: "exp-food", name: "餐饮", mark: "餐", color: "#ff8fba", soft: "#fff0f6", ink: "#b75c83" },
    { id: "exp-transport", name: "交通", mark: "行", color: "#71cfb9", soft: "#e9fbf7", ink: "#238f78" },
    { id: "exp-shopping", name: "购物", mark: "购", color: "#ffd56a", soft: "#fff6dd", ink: "#916500" },
    { id: "exp-daily", name: "日用", mark: "日", color: "#8ea0ff", soft: "#edf0ff", ink: "#4f6ef7" },
    { id: "exp-fun", name: "娱乐", mark: "娱", color: "#b78cff", soft: "#f4edff", ink: "#7552b8" },
    { id: "exp-study", name: "学习", mark: "学", color: "#62b7e9", soft: "#eaf5ff", ink: "#287ab2" },
    { id: "exp-health", name: "健康", mark: "健", color: "#f27b76", soft: "#fff0f0", ink: "#c45156" },
    { id: "exp-home", name: "房租", mark: "房", color: "#9d8bea", soft: "#f0edff", ink: "#6854bd" },
    { id: "exp-gift", name: "人情", mark: "礼", color: "#ff9d78", soft: "#fff2ea", ink: "#ad6039" },
    { id: "exp-other", name: "其他", mark: "其", color: "#a69cac", soft: "#f2f0f4", ink: "#716779" }
  ];

  const INCOME_CATEGORIES = [
    { id: "inc-allowance", name: "生活费", mark: "生", color: "#71cfb9", soft: "#e9fbf7", ink: "#238f78" },
    { id: "inc-salary", name: "工资", mark: "薪", color: "#8ea0ff", soft: "#edf0ff", ink: "#4f6ef7" },
    { id: "inc-parttime", name: "兼职", mark: "兼", color: "#62b7e9", soft: "#eaf5ff", ink: "#287ab2" },
    { id: "inc-gift", name: "红包", mark: "红", color: "#ff8fba", soft: "#fff0f6", ink: "#b75c83" },
    { id: "inc-refund", name: "退款", mark: "退", color: "#ffd56a", soft: "#fff6dd", ink: "#916500" },
    { id: "inc-other", name: "其他", mark: "其", color: "#a69cac", soft: "#f2f0f4", ink: "#716779" }
  ];

  const CATEGORIES = {
    expense: EXPENSE_CATEGORIES,
    income: INCOME_CATEGORIES
  };
  const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const ACCOUNTS = ["微信", "支付宝", "银行卡", "现金"];

  const state = {
    view: "home",
    month: startOfMonth(new Date()),
    filter: "all",
    search: "",
    transactions: [],
    editingId: null,
    draftType: "expense",
    draftCategory: EXPENSE_CATEGORIES[0].id,
    draftAccount: "微信"
  };

  let db;
  let toastTimer;

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    setInitialView();
    renderMonthLabels();

    try {
      db = await openDatabase();
      state.transactions = await dbGetAll();
      renderAll();
      requestPersistentStorage();
    } catch (error) {
      console.error(error);
      showToast("账本暂时无法打开，请刷新重试");
      renderAll();
    }

    registerServiceWorker();
  }

  function cacheElements() {
    [
      "heroMonthLabel", "statsMonthLabel", "monthExpense", "monthIncome", "monthBalance",
      "recentList", "ledgerCount", "ledgerSearch", "ledgerFilter", "ledgerList",
      "statsDonut", "statsTotal", "statsIncome", "statsBalance", "categoryRank",
      "trendChart", "recordSummary", "storageSummary", "exportJsonButton",
      "importButton", "importInput", "exportCsvButton", "headerAddButton",
      "tabAddButton", "sheetLayer", "sheetBackdrop", "sheetClose", "sheetEyebrow",
      "sheetTitle", "transactionForm", "typeSwitch", "amountInput", "categoryGrid",
      "accountChips", "dateInput", "noteInput", "deleteButton", "toast"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    document.querySelectorAll("[data-month]").forEach((button) => {
      button.addEventListener("click", () => {
        const offset = Number(button.dataset.month);
        state.month = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1);
        renderAll();
      });
    });

    document.querySelectorAll("[data-quick]").forEach((button) => {
      button.addEventListener("click", () => openSheet(button.dataset.quick));
    });

    elements.headerAddButton.addEventListener("click", () => openSheet("expense"));
    elements.tabAddButton.addEventListener("click", () => openSheet("expense"));
    elements.sheetClose.addEventListener("click", closeSheet);
    elements.sheetBackdrop.addEventListener("click", closeSheet);
    elements.transactionForm.addEventListener("submit", saveTransaction);
    elements.deleteButton.addEventListener("click", deleteCurrentTransaction);

    elements.typeSwitch.addEventListener("click", (event) => {
      const button = event.target.closest("[data-type]");
      if (!button) return;
      state.draftType = button.dataset.type;
      if (!CATEGORIES[state.draftType].some((item) => item.id === state.draftCategory)) {
        state.draftCategory = CATEGORIES[state.draftType][0].id;
      }
      renderSheetChoices();
      updateSheetCopy();
    });

    elements.categoryGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.draftCategory = button.dataset.category;
      renderSheetChoices();
    });

    elements.accountChips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-account]");
      if (!button) return;
      state.draftAccount = button.dataset.account;
      renderSheetChoices();
    });

    elements.amountInput.addEventListener("input", normalizeAmountInput);
    elements.amountInput.addEventListener("blur", finishAmountInput);
    elements.ledgerSearch.addEventListener("input", () => {
      state.search = elements.ledgerSearch.value.trim().toLowerCase();
      renderLedger();
    });

    elements.ledgerFilter.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.filter = button.dataset.filter;
      elements.ledgerFilter.querySelectorAll("button").forEach((item) => {
        item.classList.toggle("is-on", item === button);
      });
      renderLedger();
    });

    elements.recentList.addEventListener("click", editFromList);
    elements.ledgerList.addEventListener("click", editFromList);
    elements.exportJsonButton.addEventListener("click", exportBackup);
    elements.exportCsvButton.addEventListener("click", exportCsv);
    elements.importButton.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", importBackup);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.sheetLayer.hidden) closeSheet();
    });
    window.addEventListener("hashchange", setInitialView);
    window.addEventListener("beforeunload", () => {
      if (db) db.close();
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("date", "date");
          store.createIndex("type", "type");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbGetAll() {
    return runStoreRequest("readonly", (store) => store.getAll());
  }

  function dbPut(transaction) {
    return runStoreRequest("readwrite", (store) => store.put(transaction));
  }

  function dbDelete(id) {
    return runStoreRequest("readwrite", (store) => store.delete(id));
  }

  function dbReplace(items) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      items.forEach((item) => store.put(item));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function runStoreRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function renderAll() {
    renderMonthLabels();
    renderHome();
    renderLedger();
    renderStats();
    renderSettings();
  }

  function renderMonthLabels() {
    const label = formatMonth(state.month);
    elements.heroMonthLabel.textContent = label;
    elements.statsMonthLabel.textContent = label;
  }

  function renderHome() {
    const items = transactionsForMonth(state.month);
    const summary = summarize(items);
    elements.monthExpense.textContent = formatCurrency(summary.expense);
    elements.monthIncome.textContent = formatCurrency(summary.income);
    elements.monthBalance.textContent = formatCurrency(summary.balance);
    elements.monthBalance.classList.toggle("is-negative", summary.balance < 0);

    const recent = sortTransactions(items).slice(0, 5);
    elements.recentList.innerHTML = recent.length
      ? recent.map((item) => billRow(item, true)).join("")
      : emptyState("这个月还没有账单", "点下方加号，记下第一笔");
  }

  function renderLedger() {
    const query = state.search;
    const items = sortTransactions(state.transactions).filter((item) => {
      if (state.filter !== "all" && item.type !== state.filter) return false;
      if (!query) return true;
      const category = getCategory(item.categoryId);
      return [
        item.note,
        item.account,
        item.date,
        category ? category.name : ""
      ].join(" ").toLowerCase().includes(query);
    });

    elements.ledgerCount.textContent = `${items.length} 笔`;
    elements.ledgerList.innerHTML = items.length
      ? groupTransactions(items)
      : emptyState(query ? "没有找到相符的账单" : "账本还是空的", query ? "换个关键词试试" : "记一笔后，明细会出现在这里");
  }

  function renderStats() {
    const items = transactionsForMonth(state.month);
    const summary = summarize(items);
    const expenseItems = items.filter((item) => item.type === "expense");
    const grouped = new Map();

    expenseItems.forEach((item) => {
      grouped.set(item.categoryId, (grouped.get(item.categoryId) || 0) + item.amount);
    });

    const ranking = [...grouped.entries()]
      .map(([id, amount]) => ({ category: getCategory(id), amount }))
      .filter((item) => item.category)
      .sort((a, b) => b.amount - a.amount);

      elements.statsTotal.textContent = formatCurrency(summary.expense, false);
    elements.statsIncome.textContent = formatCurrency(summary.income);
    elements.statsBalance.textContent = formatCurrency(summary.balance);

    if (summary.expense > 0) {
      let cursor = 0;
      const stops = ranking.map((item) => {
        const start = cursor;
        cursor += item.amount / summary.expense * 360;
        return `${item.category.color} ${start}deg ${cursor}deg`;
      });
      elements.statsDonut.style.background = `conic-gradient(${stops.join(",")})`;
    } else {
      elements.statsDonut.style.background = "";
    }

    elements.categoryRank.innerHTML = ranking.length
      ? ranking.map((item) => {
        const percent = Math.round(item.amount / summary.expense * 100);
        return `
          <div class="rank-row">
            <div class="rank-meta">
              <i class="rank-dot" style="background:${item.category.color}"></i>
              <strong>${escapeHtml(item.category.name)}</strong>
              <span>${percent}%</span>
            </div>
            <span class="rank-amount">${formatCurrency(item.amount)}</span>
            <div class="rank-track"><i style="width:${Math.max(percent, 3)}%;background:${item.category.color}"></i></div>
          </div>`;
      }).join("")
      : `<div class="empty-inner"><strong>这个月还没有支出</strong><span>记下消费后，这里会自动分类</span></div>`;

    renderTrend(expenseItems, state.month);
  }

  function renderTrend(items, monthDate) {
    const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const bins = [];
    for (let start = 1; start <= days; start += 5) {
      const end = Math.min(start + 4, days);
      const amount = items
        .filter((item) => {
          const day = Number(item.date.slice(8, 10));
          return day >= start && day <= end;
        })
        .reduce((sum, item) => sum + item.amount, 0);
      bins.push({ start, end, amount });
    }

    while (bins.length < 6) bins.push({ start: 0, end: 0, amount: 0 });
    while (bins.length > 6) {
      const last = bins.pop();
      bins[bins.length - 1].end = last.end;
      bins[bins.length - 1].amount += last.amount;
    }

    const max = Math.max(...bins.map((item) => item.amount), 0);
    elements.trendChart.innerHTML = bins.map((bin) => {
      const height = bin.amount && max ? Math.max(8, Math.round(bin.amount / max * 122)) : 3;
      const label = bin.start ? `${bin.start}-${bin.end}` : "-";
      return `
        <div class="trend-bar-wrap" title="${label}日 ${formatCurrency(bin.amount)}">
          <i class="trend-bar${bin.amount ? "" : " is-empty"}" style="height:${height}px"></i>
          <span>${label}</span>
        </div>`;
    }).join("");
  }

  function renderSettings() {
    elements.recordSummary.textContent = `${state.transactions.length} 笔账单`;
    updateStorageSummary();
  }

  async function updateStorageSummary() {
    if (!navigator.storage || !navigator.storage.estimate) {
      elements.storageSummary.textContent = "账单已保存在本机";
      return;
    }
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ? formatBytes(estimate.usage) : "很少";
      elements.storageSummary.textContent = `本机占用 ${used}，不会自动上传`;
    } catch {
      elements.storageSummary.textContent = "账单已保存在本机";
    }
  }

  function setView(view) {
    const allowed = ["home", "ledger", "stats", "settings"];
    if (!allowed.includes(view)) view = "home";
    state.view = view;
    document.querySelectorAll(".view").forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.view === view);
    });
    if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function setInitialView() {
    setView(location.hash.slice(1) || "home");
  }

  function openSheet(type = "expense", transaction = null) {
    state.editingId = transaction ? transaction.id : null;
    state.draftType = transaction ? transaction.type : type;
    state.draftCategory = transaction ? transaction.categoryId : CATEGORIES[state.draftType][0].id;
    state.draftAccount = transaction ? transaction.account : "微信";

    elements.amountInput.value = transaction ? (transaction.amount / 100).toFixed(2) : "";
    elements.dateInput.value = transaction ? transaction.date : localDateString(new Date());
    elements.noteInput.value = transaction ? transaction.note : "";
    elements.deleteButton.hidden = !transaction;

    updateSheetCopy();
    renderSheetChoices();
    elements.sheetLayer.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => elements.amountInput.focus(), 120);
  }

  function closeSheet() {
    elements.sheetLayer.hidden = true;
    document.body.style.overflow = "";
    elements.transactionForm.reset();
    state.editingId = null;
  }

  function updateSheetCopy() {
    const income = state.draftType === "income";
    elements.sheetTitle.textContent = state.editingId
      ? "修改这一笔"
      : income ? "今天收到了什么" : "今天花了什么";
    elements.sheetEyebrow.textContent = state.editingId ? "编辑账单" : "新账单";
    elements.typeSwitch.querySelectorAll("[data-type]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.type === state.draftType);
    });
  }

  function renderSheetChoices() {
    elements.categoryGrid.innerHTML = CATEGORIES[state.draftType].map((category) => `
      <button class="category-option${category.id === state.draftCategory ? " is-on" : ""}"
        type="button" data-category="${category.id}">
        <span class="category-badge" style="background:${category.soft};color:${category.ink}">${category.mark}</span>
        <span>${escapeHtml(category.name)}</span>
      </button>`).join("");

    elements.accountChips.innerHTML = ACCOUNTS.map((account) => `
      <button class="account-chip${account === state.draftAccount ? " is-on" : ""}"
        type="button" data-account="${escapeHtml(account)}">${escapeHtml(account)}</button>`).join("");
  }

  async function saveTransaction(event) {
    event.preventDefault();
    const amount = Math.round(Number(elements.amountInput.value) * 100);
    const date = elements.dateInput.value;

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("请先填写金额");
      elements.amountInput.focus();
      return;
    }
    if (!date) {
      showToast("请选择账单日期");
      elements.dateInput.focus();
      return;
    }

    const existing = state.transactions.find((item) => item.id === state.editingId);
    const now = new Date().toISOString();
    const transaction = {
      id: existing ? existing.id : createId(),
      type: state.draftType,
      amount,
      categoryId: state.draftCategory,
      account: state.draftAccount,
      date,
      note: elements.noteInput.value.trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    try {
      await dbPut(transaction);
      state.transactions = await dbGetAll();
      const savedMonth = new Date(`${date}T00:00:00`);
      state.month = startOfMonth(savedMonth);
      closeSheet();
      renderAll();
      showToast(existing ? "账单已更新" : `${state.draftType === "expense" ? "支出" : "收入"}已记下`);
    } catch (error) {
      console.error(error);
      showToast("保存失败，请再试一次");
    }
  }

  async function deleteCurrentTransaction() {
    if (!state.editingId) return;
    const item = state.transactions.find((transaction) => transaction.id === state.editingId);
    if (!item) return;
    if (!window.confirm(`确认删除这笔 ${formatCurrency(item.amount)} 的账单吗？`)) return;

    try {
      await dbDelete(item.id);
      state.transactions = await dbGetAll();
      closeSheet();
      renderAll();
      showToast("账单已删除");
    } catch (error) {
      console.error(error);
      showToast("删除失败，请再试一次");
    }
  }

  function editFromList(event) {
    const button = event.target.closest("[data-edit]");
    if (!button) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.edit);
    if (transaction) openSheet(transaction.type, transaction);
  }

  function exportBackup() {
    const payload = {
      app: "duoduo-wallet",
      schemaVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      transactions: state.transactions
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `多多钱包-备份-${localDateString(new Date())}.json`);
    showToast("完整备份已导出");
  }

  function exportCsv() {
    const header = ["日期", "类型", "金额", "分类", "账户", "备注"];
    const rows = sortTransactions(state.transactions).map((item) => [
      item.date,
      item.type === "expense" ? "支出" : "收入",
      (item.amount / 100).toFixed(2),
      getCategory(item.categoryId)?.name || "其他",
      item.account,
      item.note
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `多多钱包-账单-${localDateString(new Date())}.csv`);
    showToast("表格已导出");
  }

  async function importBackup(event) {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      if (!payload || !Array.isArray(payload.transactions)) {
        throw new Error("not a wallet backup");
      }
      const items = payload.transactions.map(sanitizeTransaction).filter(Boolean);
      const message = `备份中有 ${items.length} 笔账单。恢复后会替换当前 ${state.transactions.length} 笔，确认继续吗？`;
      if (!window.confirm(message)) return;
      await dbReplace(items);
      state.transactions = await dbGetAll();
      renderAll();
      showToast("备份已恢复");
    } catch (error) {
      console.error(error);
      showToast("这个备份文件无法识别");
    }
  }

  function sanitizeTransaction(item) {
    if (!item || !["expense", "income"].includes(item.type)) return null;
    const amount = Math.round(Number(item.amount));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const date = String(item.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const category = getCategory(item.categoryId, item.type);
    const account = ACCOUNTS.includes(item.account) ? item.account : "现金";
    const now = new Date().toISOString();
    return {
      id: String(item.id || createId()),
      type: item.type,
      amount,
      categoryId: category ? category.id : CATEGORIES[item.type].slice(-1)[0].id,
      account,
      date,
      note: String(item.note || "").slice(0, 80),
      createdAt: String(item.createdAt || now),
      updatedAt: String(item.updatedAt || now)
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function normalizeAmountInput() {
    let value = elements.amountInput.value.replace(/[^\d.]/g, "");
    const parts = value.split(".");
    value = parts.shift() + (parts.length ? `.${parts.join("").slice(0, 2)}` : "");
    elements.amountInput.value = value;
  }

  function finishAmountInput() {
    const amount = Number(elements.amountInput.value);
    if (Number.isFinite(amount) && amount > 0) {
      elements.amountInput.value = amount.toFixed(2);
    }
  }

  function billRow(item, showDate = false) {
    const category = getCategory(item.categoryId);
    const isIncome = item.type === "income";
    const title = item.note || category?.name || "未分类";
    const metaParts = [category?.name || "未分类", item.account];
    if (showDate) metaParts.unshift(formatBillDate(item.date));
    return `
      <button class="bill-row" type="button" data-edit="${escapeHtml(item.id)}">
        <span class="category-badge" style="background:${category?.soft || "#f2f0f4"};color:${category?.ink || "#716779"}">${category?.mark || "记"}</span>
        <span class="bill-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(metaParts.join(" · "))}</span>
        </span>
        <span class="bill-amount${isIncome ? " income" : ""}">${isIncome ? "+" : "-"}${formatCurrency(item.amount)}</span>
      </button>`;
  }

  function groupTransactions(items) {
    const groups = new Map();
    items.forEach((item) => {
      if (!groups.has(item.date)) groups.set(item.date, []);
      groups.get(item.date).push(item);
    });
    return [...groups.entries()].map(([date, dayItems]) => {
      const expense = dayItems
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0);
      return `
        <section class="date-group">
          <div class="date-heading">
            <strong>${escapeHtml(formatBillDate(date))}</strong>
            <span>支出 ${formatCurrency(expense)}</span>
          </div>
          <div class="bill-list">${dayItems.map((item) => billRow(item)).join("")}</div>
        </section>`;
    }).join("");
  }

  function emptyState(title, detail) {
    return `
      <div class="empty-state">
        <div class="empty-inner">
          <span class="empty-cloud" aria-hidden="true">
            <svg viewBox="0 0 56 44">
              <path d="M15 40C7 40 3 34 5 28c1-5 5-8 10-8 2-10 17-15 24-6 8-2 14 4 14 11 0 9-7 15-16 15H15z" fill="#fff" stroke="#5b526b" stroke-width="3.2" stroke-linejoin="round"/>
              <circle cx="24" cy="29" r="2.4" fill="#5b526b"/>
              <circle cx="39" cy="29" r="2.4" fill="#5b526b"/>
              <path d="M27 35c3 3 7 3 10 0" fill="none" stroke="#5b526b" stroke-width="2.4" stroke-linecap="round"/>
            </svg>
          </span>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
      </div>`;
  }

  function transactionsForMonth(monthDate) {
    const key = localMonthKey(monthDate);
    return state.transactions.filter((item) => item.date.startsWith(key));
  }

  function summarize(items) {
    const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
    return { income, expense, balance: income - expense };
  }

  function sortTransactions(items) {
    return [...items].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      return byDate || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function getCategory(id, type) {
    if (type) return CATEGORIES[type].find((item) => item.id === id);
    return ALL_CATEGORIES.find((item) => item.id === id);
  }

  function formatCurrency(cents, withSymbol = true) {
    const numeric = Number(cents) || 0;
    const value = Math.abs(numeric) / 100;
    const text = new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
    return `${numeric < 0 ? "-" : ""}${withSymbol ? "¥" : ""}${text}`;
  }

  function formatMonth(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  function formatBillDate(value) {
    const today = localDateString(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = localDateString(yesterdayDate);
    if (value === today) return "今天";
    if (value === yesterday) return "昨天";
    const date = new Date(`${value}T00:00:00`);
    const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    return `${date.getMonth() + 1}月${date.getDate()}日 ${week}`;
  }

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function localMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-on");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-on"), 2200);
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      await navigator.storage.persist();
    } catch {
      // 存储仍会正常保存在浏览器允许的空间里。
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }
})();
