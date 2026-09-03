// ---------- Мои финансы ----------

// молочная палитра: приход — голубой, расход — бургунди, остаток — шалфейный, копилки — розовый
const BLUE = "#4E86B0";        // приход
const BURGUNDY = "#8A2B3F";    // расход
const SAGE = "#5E8F79";        // остаток
const ROSE = "#C2758F";        // копилки и акцент
const GOLD = "#C79A4B";
const LILAC = "#A98FC4", BLUSH = "#D98FA8", SKY = "#7FB3CC", CARAMEL = "#C9915E";
const PALETTE = [ROSE, BURGUNDY, BLUE, SAGE, CARAMEL, LILAC, BLUSH, SKY];

const DEFAULT_CATEGORIES = [
  { id: "salary", label: "Зарплата", type: "income", color: BLUE, builtin: true },
  { id: "bonus", label: "Бонус", type: "income", color: SKY, builtin: true },
  { id: "card", label: "Кредитка", type: "expense", color: BURGUNDY, builtin: true },
  { id: "edu", label: "Кредит на обучение", type: "expense", color: BLUE, builtin: true },
  { id: "beauty", label: "Ногти / брови", type: "expense", color: LILAC, builtin: true },
  { id: "savings", label: "Копилка", type: "expense", color: ROSE, builtin: true },
  { id: "other", label: "Прочее", type: "expense", color: BLUSH, builtin: true },
];

const DEFAULT_GOALS = [
  { id: "main", name: "Общая копилка", target: 200000, base: 0, color: ROSE },
  { id: "bag", name: "Сумка", target: 50000, base: 0, color: CARAMEL },
  { id: "lips", name: "Губы", target: 20000, base: 0, color: BLUSH },
];

const fmt = (n) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";
const fmtShort = (n) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));

function pad2(n) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthKey(dateStr) { return String(dateStr).slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}
function prevMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function slug(s) {
  return "c_" + s.toLowerCase().trim().replace(/[^a-zа-я0-9]+/gi, "-").replace(/(^-|-$)/g, "") + "_" + Date.now().toString(36);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ---------- хранение ----------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { state.error = "Не удалось сохранить данные."; }
}

function loadGoals() {
  const saved = loadJSON("kfin:goals", null);
  if (Array.isArray(saved) && saved.length) return saved;
  // перенос со старой версии: одна копилка + отдельная стартовая сумма
  const goals = DEFAULT_GOALS.map((g) => ({ ...g }));
  const rawBase = localStorage.getItem("kfin:savingsBase");
  if (rawBase != null) {
    const oldBase = Number(rawBase);
    if (Number.isFinite(oldBase)) goals[0].base = oldBase;
  }
  return goals;
}

const state = {
  tab: "overview",
  slide: "",
  transactions: loadJSON("kfin:transactions", []),
  categories: loadJSON("kfin:categories", DEFAULT_CATEGORIES),
  goals: loadGoals(),
  error: null,
  notice: null,
  form: { kind: "expense", categoryId: "card", amount: "", note: "", date: todayStr() },
  editingId: null,
  savingsAmount: "",
  activeGoalId: "main",
  editingGoalId: null,
  goalDraft: { name: "", target: "", base: "" },
  addingGoal: false,
  addingCategory: false,
  newCatName: "",
  newCatColor: PALETTE[0],
};

function persistTx() { save("kfin:transactions", state.transactions); }
function persistCategories() { save("kfin:categories", state.categories); }
function persistGoals() { save("kfin:goals", state.goals); }

function catById(id) {
  return state.categories.find((c) => c.id === id) || state.categories[state.categories.length - 1];
}
function goalById(id) {
  return state.goals.find((g) => g.id === id) || state.goals[0];
}

// ---------- расчёты ----------
function totals(txs) {
  const list = txs || state.transactions;
  const totalIncome = list.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = list.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
}
function goalInfo(goal) {
  const deposited = state.transactions
    .filter((t) => t.categoryId === "savings" && t.kind === "expense" && (t.goalId || "main") === goal.id)
    .reduce((s, t) => s + t.amount, 0);
  const current = (Number(goal.base) || 0) + deposited;
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return { current, target, pct, left: Math.max(0, target - current) };
}
function savingsTotal() {
  return state.goals.reduce((s, g) => s + goalInfo(g).current, 0);
}
function txByMonth(kindFilter) {
  const map = new Map();
  for (const t of state.transactions) {
    if (kindFilter && t.kind !== kindFilter) continue;
    const mk = monthKey(t.date);
    if (!map.has(mk)) map.set(mk, []);
    map.get(mk).push(t);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}
function monthCompare() {
  const cur = monthKey(todayStr());
  const prev = prevMonthKey(cur);
  const inMonth = (mk) => state.transactions.filter((t) => monthKey(t.date) === mk);
  return { cur, prev, curT: totals(inMonth(cur)), prevT: totals(inMonth(prev)) };
}
function categoryBreakdown(monthFilter) {
  const map = new Map();
  for (const t of state.transactions) {
    if (t.kind !== "expense") continue;
    if (monthFilter && monthKey(t.date) !== monthFilter) continue;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  }
  const rows = [...map.entries()].map(([id, sum]) => ({ cat: catById(id), sum }));
  rows.sort((a, b) => b.sum - a.sum);
  return rows;
}

// ---------- иконки ----------
const ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
  wallet: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z"/><path d="M16 7V5a1 1 0 0 0-1-1H6a2 2 0 0 0-2 2v1"/><circle cx="17" cy="13" r="1.5"/></svg>',
  bag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  piggy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4c-3.9 0-7 2.7-7 6.5 0 1.6.6 3 1.6 4.1L5 18h3l.7-1.4c.7.2 1.5.4 2.3.4h1c3.9 0 7-2.7 7-6.5S15.9 4 12 4h-1Z"/><path d="M17 9h.5a1.5 1.5 0 0 1 0 3H17"/><path d="M8 10v.01"/><path d="M9 18v2M13 18v2"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  pen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  save: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>',
  load: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></svg>',
  chevron: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const TABS = [
  { id: "overview", label: "Обзор", icon: "home" },
  { id: "income", label: "Приход", icon: "wallet" },
  { id: "expenses", label: "Расходы", icon: "bag" },
  { id: "savings", label: "Копилки", icon: "piggy" },
];

// ---------- действия ----------
function resetForm(kind) {
  const cat = state.categories.find((c) => c.type === kind);
  state.form = { kind, categoryId: cat ? cat.id : "other", amount: "", note: "", date: todayStr() };
  state.editingId = null;
}

function submitTransaction(kind) {
  const amt = Number(state.form.amount);
  if (!amt || amt <= 0) { state.error = "Укажите сумму больше нуля."; render(); return; }
  state.error = null;
  let cat = catById(state.form.categoryId);
  if (!cat || cat.type !== kind) cat = state.categories.find((c) => c.type === kind) || cat;

  if (state.editingId) {
    state.transactions = state.transactions.map((t) => t.id === state.editingId
      ? { ...t, kind, categoryId: cat.id, amount: amt, note: state.form.note.trim(), date: state.form.date || todayStr() }
      : t);
    state.notice = "Запись изменена.";
  } else {
    state.transactions = [{ id: uid(), kind, categoryId: cat.id, amount: amt, note: state.form.note.trim(), date: state.form.date || todayStr() }, ...state.transactions];
  }
  persistTx();
  resetForm(kind);
  render();
}

function startEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  state.editingId = id;
  state.form = { kind: t.kind, categoryId: t.categoryId, amount: String(t.amount), note: t.note || "", date: t.date };
  state.error = null;
  state.notice = null;
  state.tab = t.kind === "income" ? "income" : "expenses";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
  resetForm(state.form.kind);
  render();
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  if (state.editingId === id) resetForm(state.form.kind);
  persistTx();
  render();
}

function addSavingsDeposit() {
  const amt = Number(state.savingsAmount);
  if (!amt || amt <= 0) { state.error = "Укажите сумму больше нуля."; render(); return; }
  const goal = goalById(state.activeGoalId);
  state.error = null;
  state.transactions = [{ id: uid(), kind: "expense", categoryId: "savings", goalId: goal.id, amount: amt, note: `Пополнение: ${goal.name}`, date: todayStr() }, ...state.transactions];
  state.savingsAmount = "";
  persistTx();
  render();
}

function saveGoal() {
  const name = state.goalDraft.name.trim();
  const target = Number(state.goalDraft.target);
  const rawBase = String(state.goalDraft.base).trim();
  const base = rawBase === "" ? 0 : Number(rawBase);
  if (!name) { state.error = "Введите название копилки."; render(); return; }
  if (!Number.isFinite(target) || target <= 0) { state.error = "Цель должна быть числом больше нуля."; render(); return; }
  if (!Number.isFinite(base) || base < 0) { state.error = "«Уже накоплено» должно быть числом."; render(); return; }
  state.error = null;
  if (state.editingGoalId) {
    state.goals = state.goals.map((g) => g.id === state.editingGoalId ? { ...g, name, target, base } : g);
  } else {
    state.goals = [...state.goals, { id: slug(name), name, target, base, color: PALETTE[state.goals.length % PALETTE.length] }];
  }
  persistGoals();
  state.editingGoalId = null;
  state.addingGoal = false;
  state.goalDraft = { name: "", target: "", base: "" };
  render();
}

function deleteGoal(id) {
  if (state.goals.length <= 1) { state.error = "Должна остаться хотя бы одна копилка."; render(); return; }
  const used = state.transactions.some((t) => (t.goalId || "main") === id);
  if (used) { state.error = "Нельзя удалить копилку, в которую уже откладывали."; render(); return; }
  state.error = null;
  state.goals = state.goals.filter((g) => g.id !== id);
  if (state.activeGoalId === id) state.activeGoalId = state.goals[0].id;
  persistGoals();
  render();
}

function addCategory() {
  const name = state.newCatName.trim();
  if (!name) { state.error = "Введите название категории."; render(); return; }
  if (state.categories.some((c) => c.type === "expense" && c.label.toLowerCase() === name.toLowerCase())) {
    state.error = "Такая категория уже есть."; render(); return;
  }
  state.error = null;
  const cat = { id: slug(name), label: name, type: "expense", color: state.newCatColor, builtin: false };
  state.categories = [...state.categories, cat];
  persistCategories();
  state.form.categoryId = cat.id;
  state.newCatName = "";
  state.addingCategory = false;
  render();
}

function deleteCategory(id) {
  if (state.transactions.some((t) => t.categoryId === id)) {
    state.error = "Нельзя удалить категорию, по которой уже есть записи."; render(); return;
  }
  state.error = null;
  state.categories = state.categories.filter((c) => c.id !== id);
  if (state.form.categoryId === id) {
    const fb = state.categories.find((c) => c.type === state.form.kind);
    if (fb) state.form.categoryId = fb.id;
  }
  persistCategories();
  render();
}

// ---------- сохранение / восстановление ----------
function exportData() {
  try {
    const payload = {
      app: "moi-finansy", version: 2, exportedAt: new Date().toISOString(),
      transactions: state.transactions, categories: state.categories, goals: state.goals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moi-finansy-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    state.error = null;
    state.notice = "Файл сохранён. Положите его в «Файлы».";
    render();
  } catch (e) {
    state.error = "Не удалось сохранить файл."; render();
  }
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.transactions)) throw new Error("bad format");
      state.transactions = data.transactions;
      if (Array.isArray(data.categories) && data.categories.length) state.categories = data.categories;
      if (Array.isArray(data.goals) && data.goals.length) {
        state.goals = data.goals;
      } else if (Number.isFinite(Number(data.savingsBase))) {
        // файл из старой версии
        state.goals = DEFAULT_GOALS.map((g) => ({ ...g }));
        state.goals[0].base = Number(data.savingsBase);
      }
      state.activeGoalId = state.goals[0].id;
      persistTx(); persistCategories(); persistGoals();
      state.error = null;
      state.notice = `Восстановлено записей: ${state.transactions.length}`;
      render();
    } catch (e) {
      state.error = "Не удалось прочитать файл. Нужен файл, выгруженный из этого приложения.";
      render();
    }
  };
  reader.onerror = () => { state.error = "Не удалось прочитать файл."; render(); };
  reader.readAsText(file);
}

// ---------- элементы ----------
function amountSpan(value, color, sizeClass) {
  return `<span class="kfin-mono ${sizeClass}" style="color:${color}" data-amount="${value}">${fmt(value)}</span>`;
}

function donutChart(rows, total) {
  if (!rows.length || total <= 0) return "";
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const segments = rows.map(({ cat, sum }) => {
    const frac = sum / total;
    const len = frac * C;
    const seg = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${cat.color}" stroke-width="22"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 70 70)"></circle>`;
    offset += len;
    return seg;
  }).join("");
  return `<div class="flex items-center gap-3">
    <svg width="140" height="140" viewBox="0 0 140 140" class="flex-shrink-0">
      ${segments}
      <text x="70" y="66" text-anchor="middle" fill="var(--ink-dim)" font-size="11" font-family="IBM Plex Sans, sans-serif">всего</text>
      <text x="70" y="84" text-anchor="middle" fill="var(--ink)" font-size="15" font-family="IBM Plex Mono, monospace">${esc(fmtShort(total))}</text>
    </svg>
    <div class="flex-1 min-w-0 space-y-2">
      ${rows.slice(0, 5).map(({ cat, sum }) => `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${cat.color}"></span>
            <span class="text-xs truncate" style="color:var(--ink-dim)">${esc(cat.label)}</span>
          </div>
          <span class="kfin-mono text-xs flex-shrink-0" style="color:var(--ink)">${Math.round((sum / total) * 100)}%</span>
        </div>`).join("")}
    </div>
  </div>`;
}

function txRow(t, opts) {
  const cat = catById(t.categoryId);
  const editing = state.editingId === t.id;
  return `<div class="kfin-row flex items-center justify-between px-3 py-3" style="background:${editing ? "rgba(194,117,143,.10)" : "var(--bg-card)"};${opts && opts.border ? "border-top:1px solid var(--line)" : ""}">
    <div class="flex items-center gap-2 min-w-0">
      <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${cat.color}"></span>
      <div class="min-w-0">
        <div class="text-sm truncate" style="color:var(--ink)">${esc(cat.label)}${t.note ? `<span style="color:var(--ink-dim)"> · ${esc(t.note)}</span>` : ""}</div>
        <div class="kfin-mono text-[10px]" style="color:var(--ink-dim)">${esc(new Date(t.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }))}</div>
      </div>
    </div>
    <div class="flex items-center gap-1 flex-shrink-0">
      <span class="kfin-mono text-sm" style="color:${t.kind === "income" ? BLUE : BURGUNDY}">${t.kind === "income" ? "+" : "−"}${fmt(t.amount)}</span>
      <button class="tap" data-action="edit-tx" data-id="${t.id}" style="color:var(--ink-dim)" aria-label="Изменить">${ICONS.pen}</button>
      <button class="tap" data-action="delete-tx" data-id="${t.id}" style="color:var(--ink-dim)" aria-label="Удалить">${ICONS.x}</button>
    </div>
  </div>`;
}

function txHistory(kindFilter) {
  const groups = txByMonth(kindFilter);
  if (!groups.length) {
    return `<div class="text-sm py-8 text-center rounded-2xl card" style="color:var(--ink-dim)">Пока пусто</div>`;
  }
  return `<div class="space-y-4">${groups.map(([mk, list]) => {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    const sum = sorted.reduce((s, t) => s + t.amount, 0);
    return `<div class="rounded-2xl overflow-hidden" style="border:1px solid var(--line)">
      <div class="px-3 py-2 flex items-center justify-between" style="background:var(--bg-soft)">
        <span class="text-xs" style="color:var(--ink-dim)">${esc(monthLabel(mk))}</span>
        <span class="kfin-mono text-xs" style="color:var(--ink-dim)">${esc(fmt(sum))}</span>
      </div>
      ${sorted.map((t, i) => txRow(t, { border: true })).join("")}
    </div>`;
  }).join("")}</div>`;
}

// ---------- экраны ----------
function renderOverview() {
  const { totalIncome, totalExpense, balance } = totals();
  const { cur, curT, prevT } = monthCompare();
  const rows = categoryBreakdown(cur);
  const diff = curT.totalExpense - prevT.totalExpense;
  const savings = savingsTotal();

  return `<div class="kfin-panel">
    <section class="rounded-2xl mb-5 overflow-hidden card">
      <div class="grid grid-cols-3 text-center">
        <div class="py-4 border-r"><div class="text-[10px] uppercase tracking-wide mb-1" style="color:var(--ink-dim)">Приход</div>${amountSpan(totalIncome, BLUE, "text-base")}</div>
        <div class="py-4 border-r"><div class="text-[10px] uppercase tracking-wide mb-1" style="color:var(--ink-dim)">Расход</div>${amountSpan(totalExpense, BURGUNDY, "text-base")}</div>
        <div class="py-4"><div class="text-[10px] uppercase tracking-wide mb-1" style="color:var(--ink-dim)">Остаток</div>${amountSpan(balance, balance >= 0 ? SAGE : BURGUNDY, "text-base")}</div>
      </div>
    </section>

    <section class="rounded-2xl mb-5 p-4 card">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-xs uppercase tracking-wide" style="color:var(--ink-dim)">${esc(monthLabel(cur))}</span>
        ${prevT.totalExpense > 0 ? `<span class="kfin-mono text-xs" style="color:${diff > 0 ? BURGUNDY : BLUE}">${diff > 0 ? "+" : "−"}${esc(fmt(Math.abs(diff)))} к прошлому</span>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><div class="text-[10px] uppercase mb-1" style="color:var(--ink-dim)">Пришло</div>${amountSpan(curT.totalIncome, BLUE, "text-lg")}</div>
        <div><div class="text-[10px] uppercase mb-1" style="color:var(--ink-dim)">Потрачено</div>${amountSpan(curT.totalExpense, BURGUNDY, "text-lg")}</div>
      </div>
      ${rows.length ? donutChart(rows, curT.totalExpense) : `<div class="text-sm py-4 text-center" style="color:var(--ink-dim)">В этом месяце трат ещё нет</div>`}
    </section>

    <button data-action="goto" data-tab="savings" class="w-full text-left rounded-2xl mb-5 p-4 card">
      <div class="flex items-baseline justify-between mb-2">
        <span class="text-xs uppercase tracking-wide" style="color:var(--ink-dim)">Копилки · ${state.goals.length}</span>
        <span style="color:var(--ink-dim)">${ICONS.chevron}</span>
      </div>
      ${amountSpan(savings, ROSE, "text-2xl")}
      <div class="space-y-2 mt-3">
        ${state.goals.map((g) => {
          const gi = goalInfo(g);
          return `<div>
            <div class="flex justify-between text-xs mb-1"><span style="color:var(--ink-dim)">${esc(g.name)}</span><span class="kfin-mono" style="color:var(--ink-dim)">${esc(fmtShort(gi.current))} / ${esc(fmtShort(gi.target))}</span></div>
            <div class="h-2 rounded-full overflow-hidden" style="background:var(--line)"><div class="h-full rounded-full transition-all duration-700" style="width:${gi.pct}%;background:${g.color}"></div></div>
          </div>`;
        }).join("")}
      </div>
    </button>

    <div class="grid grid-cols-2 gap-3 mb-6">
      <button data-action="goto" data-tab="income" class="rounded-2xl p-4 text-left card">
        <div class="mb-2" style="color:${BLUE}">${ICONS.wallet}</div>
        <div class="text-base" style="color:var(--ink)">Приход</div>
        <div class="kfin-mono text-xs mt-1" style="color:var(--ink-dim)">что пришло на карту</div>
      </button>
      <button data-action="goto" data-tab="expenses" class="rounded-2xl p-4 text-left card">
        <div class="mb-2" style="color:${BURGUNDY}">${ICONS.bag}</div>
        <div class="text-base" style="color:var(--ink)">Расходы</div>
        <div class="kfin-mono text-xs mt-1" style="color:var(--ink-dim)">записать трату</div>
      </button>
    </div>

    <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Последние записи</div>
    <div class="rounded-2xl overflow-hidden mb-6" style="border:1px solid var(--line)">
      ${state.transactions.length === 0
        ? `<div class="text-sm py-8 text-center" style="background:var(--bg-card);color:var(--ink-dim)">Пока пусто</div>`
        : state.transactions.slice(0, 6).map((t, i) => txRow(t, { border: i > 0 })).join("")}
    </div>

    <section class="mt-6">
      <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Данные</div>
      <div class="grid grid-cols-2 gap-3">
        <button data-action="export" class="rounded-2xl p-4 text-left card">
          <div class="mb-2" style="color:${SAGE}">${ICONS.save}</div>
          <div class="text-base" style="color:var(--ink)">Сохранить</div>
          <div class="kfin-mono text-xs mt-1" style="color:var(--ink-dim)">записи в файл</div>
        </button>
        <label class="rounded-2xl p-4 text-left card" style="display:block;cursor:pointer">
          <div class="mb-2" style="color:${CARAMEL}">${ICONS.load}</div>
          <div class="text-base" style="color:var(--ink)">Восстановить</div>
          <div class="kfin-mono text-xs mt-1" style="color:var(--ink-dim)">из файла</div>
          <input type="file" accept="application/json,.json" data-bind="importFile" style="display:none" />
        </label>
      </div>
    </section>
  </div>`;
}

function formBlock(kind) {
  const cats = state.categories.filter((c) => c.type === kind);
  const editing = !!state.editingId;
  const selId = state.form.kind === kind ? state.form.categoryId : (cats[0] && cats[0].id);
  return `<section class="rounded-2xl mb-5 p-4 card">
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wide" style="color:var(--ink-dim)">${editing ? "Изменение записи" : (kind === "income" ? "Новый приход" : "Новая трата")}</span>
      ${editing ? `<button data-action="cancel-edit" class="text-xs underline" style="color:var(--ink-dim)">отмена</button>` : ""}
    </div>
    <select data-bind="categoryId" class="w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)">
      ${cats.map((c) => `<option value="${c.id}" ${selId === c.id ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
    </select>
    <input data-bind="amount" value="${esc(state.form.kind === kind ? state.form.amount : "")}" placeholder="Сумма, ₽" inputmode="decimal" class="kfin-mono w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
    <input type="date" data-bind="date" value="${esc(state.form.date)}" class="kfin-mono w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
    <input data-bind="note" value="${esc(state.form.note)}" placeholder="Заметка${kind === "expense" ? " (например: кофе)" : ""}" class="w-full px-3 rounded-xl mb-3" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
    <button data-action="${kind === "income" ? "add-income" : "add-expense"}" class="btn btn-paper w-full">${editing ? "Сохранить изменения" : (kind === "income" ? "Добавить приход" : "Добавить трату")}</button>
  </section>`;
}

function renderIncome() {
  const { totalIncome } = totals();
  return `<div class="kfin-panel">
    <section class="rounded-2xl mb-5 p-4 card">
      <div class="text-xs uppercase tracking-wide mb-2" style="color:var(--ink-dim)">Итого прихода</div>
      ${amountSpan(totalIncome, BLUE, "text-3xl")}
    </section>
    ${formBlock("income")}
    <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Журнал</div>
    ${txHistory("income")}
  </div>`;
}

function renderExpenses() {
  const { totalExpense } = totals();
  const cats = state.categories.filter((c) => c.type === "expense");
  const rows = categoryBreakdown(null);
  return `<div class="kfin-panel">
    <section class="rounded-2xl mb-5 p-4 card">
      <div class="text-xs uppercase tracking-wide mb-2" style="color:var(--ink-dim)">Итого расхода</div>
      ${amountSpan(totalExpense, BURGUNDY, "text-3xl")}
    </section>
    ${formBlock("expense")}

    <section class="mb-5">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs uppercase tracking-wide" style="color:var(--ink-dim)">Категории</span>
        ${!state.addingCategory ? `<button data-action="show-add-category" class="text-xs underline" style="color:var(--ink-dim)">+ добавить</button>` : ""}
      </div>
      ${state.addingCategory ? `
      <div class="rounded-xl p-3 mb-3" style="background:var(--bg-card);border:1px dashed var(--line)">
        <input data-bind="newCatName" value="${esc(state.newCatName)}" placeholder="Название категории" class="w-full px-3 rounded-lg mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
        <div class="flex gap-1.5 mb-3 flex-wrap">
          ${PALETTE.map((c) => `<button data-action="pick-color" data-color="${c}" class="w-7 h-7 rounded-full flex-shrink-0" style="background:${c};outline:${state.newCatColor === c ? "2px solid var(--ink)" : "none"};outline-offset:2px" aria-label="цвет"></button>`).join("")}
        </div>
        <div class="flex gap-2">
          <button data-action="save-category" class="btn btn-mint flex-1">Сохранить</button>
          <button data-action="cancel-add-category" class="btn px-4" style="color:var(--ink-dim);border:1px solid var(--line)">отмена</button>
        </div>
      </div>` : ""}
      <div class="flex flex-wrap gap-2">
        ${cats.map((c) => `<div class="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-full card" style="color:var(--ink)">
          <span class="w-2 h-2 rounded-full" style="background:${c.color}"></span>${esc(c.label)}
          ${!c.builtin ? `<button data-action="delete-category" data-id="${c.id}" style="color:var(--ink-dim)" aria-label="удалить">${ICONS.x}</button>` : ""}
        </div>`).join("")}
      </div>
    </section>

    ${rows.length ? `<section class="rounded-2xl mb-5 p-4 card">
      <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">По категориям · за всё время</div>
      ${donutChart(rows, totalExpense)}
    </section>` : ""}

    <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Журнал</div>
    ${txHistory("expense")}
  </div>`;
}

function renderSavings() {
  const total = savingsTotal();
  return `<div class="kfin-panel">
    <section class="rounded-2xl mb-5 p-5 text-center card">
      <div class="text-xs uppercase tracking-wide mb-2" style="color:var(--ink-dim)">Всего накоплено</div>
      ${amountSpan(total, ROSE, "text-4xl")}
    </section>

    <section class="rounded-2xl mb-5 p-4 card">
      <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Отложить</div>
      <select data-bind="activeGoal" class="w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)">
        ${state.goals.map((g) => `<option value="${g.id}" ${state.activeGoalId === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
      </select>
      <input data-bind="savingsAmount" value="${esc(state.savingsAmount)}" placeholder="Сумма, ₽" inputmode="decimal" class="kfin-mono w-full px-3 rounded-xl mb-3" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
      <button data-action="add-savings" class="btn btn-mint w-full">Отложить</button>
    </section>

    <div class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wide" style="color:var(--ink-dim)">Мои копилки</span>
      ${!state.addingGoal && !state.editingGoalId ? `<button data-action="show-add-goal" class="text-xs underline" style="color:var(--ink-dim)">+ новая копилка</button>` : ""}
    </div>

    ${(state.addingGoal || state.editingGoalId) ? `
    <div class="rounded-2xl p-4 mb-4 card" style="border:1px dashed var(--line)">
      <input data-bind="goalName" value="${esc(state.goalDraft.name)}" placeholder="Название (например: Шуба)" class="w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
      <input data-bind="goalTarget" value="${esc(state.goalDraft.target)}" placeholder="Цель, ₽" inputmode="numeric" class="kfin-mono w-full px-3 rounded-xl mb-2" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
      <input data-bind="goalBase" value="${esc(state.goalDraft.base)}" placeholder="Уже накоплено, ₽" inputmode="numeric" class="kfin-mono w-full px-3 rounded-xl mb-3" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)" />
      <div class="flex gap-2">
        <button data-action="save-goal" class="btn btn-mint flex-1">Сохранить</button>
        <button data-action="cancel-goal" class="btn px-4" style="color:var(--ink-dim);border:1px solid var(--line)">отмена</button>
      </div>
    </div>` : ""}

    <div class="space-y-3 mb-6">
      ${state.goals.map((g) => {
        const gi = goalInfo(g);
        const done = gi.target > 0 && gi.current >= gi.target;
        return `<div class="rounded-2xl p-4 card">
          <div class="flex items-center justify-between mb-2">
            <span class="text-base" style="color:var(--ink)">${esc(g.name)}</span>
            <div class="flex items-center gap-1">
              <button class="tap" data-action="edit-goal" data-id="${g.id}" style="color:var(--ink-dim)" aria-label="Изменить">${ICONS.pen}</button>
              <button class="tap" data-action="delete-goal" data-id="${g.id}" style="color:var(--ink-dim)" aria-label="Удалить">${ICONS.x}</button>
            </div>
          </div>
          <div class="flex items-end justify-between mb-2">
            ${amountSpan(gi.current, g.color, "text-xl")}
            <span class="kfin-mono text-xs" style="color:var(--ink-dim)">из ${esc(fmt(gi.target))}</span>
          </div>
          <div class="h-3 rounded-full overflow-hidden" style="background:var(--line)">
            <div class="h-full rounded-full transition-all duration-700 ${done ? "kfin-goldbar" : ""}" style="width:${gi.pct}%;${done ? "" : `background:${g.color}`}"></div>
          </div>
          <div class="kfin-mono text-xs mt-2" style="color:var(--ink-dim)">${done ? "цель достигнута" : `осталось ${esc(fmt(gi.left))} · ${gi.pct.toFixed(1)}%`}</div>
        </div>`;
      }).join("")}
    </div>

    <div class="text-xs uppercase tracking-wide mb-3" style="color:var(--ink-dim)">Пополнения</div>
    ${(() => {
      const list = state.transactions.filter((t) => t.categoryId === "savings");
      if (!list.length) return `<div class="text-sm py-8 text-center rounded-2xl card" style="color:var(--ink-dim)">Пока пусто</div>`;
      return `<div class="rounded-2xl overflow-hidden" style="border:1px solid var(--line)">
        ${list.slice(0, 20).map((t, i) => txRow(t, { border: i > 0 })).join("")}
      </div>`;
    })()}
  </div>`;
}

function renderTab() {
  if (state.tab === "overview") return renderOverview();
  if (state.tab === "income") return renderIncome();
  if (state.tab === "expenses") return renderExpenses();
  return renderSavings();
}

function render() {
  const root = document.getElementById("app");
  const slideClass = state.slide ? ` ${state.slide}` : "";
  root.innerHTML = `
    <div class="app-shell${slideClass}">
      <header class="mb-5">
        <h1 class="kfin-serif text-3xl" style="color:var(--ink)">Мои финансы</h1>
      </header>

      ${state.error ? `<div class="text-sm mb-4 px-3 py-3 rounded-xl flex items-center justify-between" style="background:rgba(138,43,63,.10);color:${BURGUNDY};border:1px solid ${BURGUNDY}">
        <span>${esc(state.error)}</span>
        <button class="tap" data-action="dismiss-error">${ICONS.x}</button>
      </div>` : ""}

      ${state.notice ? `<div class="text-sm mb-4 px-3 py-3 rounded-xl flex items-center justify-between" style="background:rgba(194,117,143,.12);color:${ROSE};border:1px solid ${ROSE}">
        <span>${esc(state.notice)}</span>
        <button class="tap" data-action="dismiss-notice">${ICONS.x}</button>
      </div>` : ""}

      ${renderTab()}
    </div>

    <nav class="fixed bottom-0 left-0 right-0 bottom-nav">
      <div class="app-shell grid grid-cols-4" style="padding:0;max-width:448px">
        ${TABS.map(({ id, label, icon }) => `
          <button data-action="goto" data-tab="${id}" class="flex flex-col items-center gap-1 ${state.tab === id ? "kfin-tab-active" : ""}">
            <span class="kfin-tab-icon" style="color:${state.tab === id ? ROSE : "var(--ink-dim)"}">${ICONS[icon]}</span>
            <span class="text-[10px]" style="color:${state.tab === id ? ROSE : "var(--ink-dim)"}">${label}</span>
          </button>`).join("")}
      </div>
    </nav>
  `;
  state.slide = "";
  animateAmounts(root);
}

// ---------- анимация чисел ----------
const prevAmounts = new Map();
function animateAmounts(root) {
  root.querySelectorAll("[data-amount]").forEach((el, idx) => {
    const key = state.tab + ":" + idx;
    const target = Number(el.dataset.amount);
    const from = prevAmounts.has(key) ? prevAmounts.get(key) : target;
    prevAmounts.set(key, target);
    if (from === target) { el.textContent = fmt(target); return; }
    const duration = 450, start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ---------- переключение вкладок ----------
function goTab(id) {
  if (id === state.tab) return;
  const from = TABS.findIndex((t) => t.id === state.tab);
  const to = TABS.findIndex((t) => t.id === id);
  state.slide = to > from ? "slide-left" : "slide-right";
  state.tab = id;
  render();
  window.scrollTo({ top: 0 });
}
function shiftTab(dir) {
  const i = TABS.findIndex((t) => t.id === state.tab);
  const next = i + dir;
  if (next < 0 || next >= TABS.length) return;
  goTab(TABS[next].id);
}

// ---------- события ----------
document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    if (a === "goto") goTab(el.dataset.tab);
    else if (a === "dismiss-error") { state.error = null; render(); }
    else if (a === "dismiss-notice") { state.notice = null; render(); }
    else if (a === "add-income") submitTransaction("income");
    else if (a === "add-expense") submitTransaction("expense");
    else if (a === "edit-tx") startEdit(el.dataset.id);
    else if (a === "cancel-edit") cancelEdit();
    else if (a === "delete-tx") deleteTransaction(el.dataset.id);
    else if (a === "add-savings") addSavingsDeposit();
    else if (a === "export") exportData();
    else if (a === "show-add-category") { state.addingCategory = true; render(); }
    else if (a === "cancel-add-category") { state.addingCategory = false; render(); }
    else if (a === "pick-color") { state.newCatColor = el.dataset.color; render(); }
    else if (a === "save-category") addCategory();
    else if (a === "delete-category") deleteCategory(el.dataset.id);
    else if (a === "show-add-goal") { state.addingGoal = true; state.editingGoalId = null; state.goalDraft = { name: "", target: "", base: "" }; render(); }
    else if (a === "cancel-goal") { state.addingGoal = false; state.editingGoalId = null; state.goalDraft = { name: "", target: "", base: "" }; render(); }
    else if (a === "save-goal") saveGoal();
    else if (a === "delete-goal") deleteGoal(el.dataset.id);
    else if (a === "edit-goal") {
      const g = goalById(el.dataset.id);
      state.editingGoalId = g.id;
      state.addingGoal = false;
      state.goalDraft = { name: g.name, target: String(g.target), base: String(g.base || 0) };
      render();
    }
  });

  app.addEventListener("input", (e) => {
    const el = e.target.closest("[data-bind]");
    if (!el) return;
    const b = el.dataset.bind;
    if (b === "amount") state.form.amount = el.value;
    else if (b === "note") state.form.note = el.value;
    else if (b === "date") state.form.date = el.value;
    else if (b === "savingsAmount") state.savingsAmount = el.value;
    else if (b === "newCatName") state.newCatName = el.value;
    else if (b === "goalName") state.goalDraft.name = el.value;
    else if (b === "goalTarget") state.goalDraft.target = el.value;
    else if (b === "goalBase") state.goalDraft.base = el.value;
  });

  app.addEventListener("change", (e) => {
    const el = e.target.closest("[data-bind]");
    if (!el) return;
    const b = el.dataset.bind;
    if (b === "importFile") {
      const file = el.files && el.files[0];
      if (file) importData(file);
      el.value = "";
    } else if (b === "categoryId") {
      state.form.categoryId = el.value;
      state.form.kind = catById(el.value).type;
    } else if (b === "activeGoal") {
      state.activeGoalId = el.value;
    }
  });

  // свайп между вкладками
  let sx = 0, sy = 0, tracking = false;
  app.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  app.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8) shiftTab(dx < 0 ? 1 : -1);
  }, { passive: true });

  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
});
