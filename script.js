'use strict';
/* ===== Icons (inline SVG, no external library) ===== */
const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4v4M16 14h3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><path d="M6 14h12v7H6z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
};
const ic = (n) => '<svg class="ic" viewBox="0 0 24 24">' + (ICONS[n] || '') + '</svg>';

/* ===== App object and state ===== */
const App = { views: {}, ui: {} };
const state = App.state = {
  apiUrl: localStorage.getItem('pos_api') || '',
  token: sessionStorage.getItem('pos_token') || '',
  user: null, settings: {}, products: [], sales: [], saleItems: [],
  expenses: [], movements: [], users: {}, view: 'dashboard'
};
const dayKey = (value) => {
  if (value == null || value === '') return '';
  // Sheets often returns date-only fields (not timestamps). Keep their calendar
  // date as-is instead of parsing YYYY-MM-DD as UTC and shifting it by the TZ.
  if (typeof value === 'string') {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) return dateOnly[1] + '-' + dateOnly[2] + '-' + dateOnly[3];
  }
  const d = new Date(value);
  if (isNaN(d)) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const part = (type) => parts.find((p) => p.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
};
/* ===== Small utilities (shared by all files) ===== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const tz = () => state.settings.TimeZone || 'Asia/Manila';
const money = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num(n));
const fmtDateTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-PH', { timeZone: tz(), dateStyle: 'medium', timeStyle: 'short' }); };
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { timeZone: tz(), dateStyle: 'medium' }); };
const todayKey = () => dayKey(new Date().toISOString());
const addDays = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isAdmin = () => !!state.user && state.user.Role === 'admin';
const userName = (id) => state.users[id] || id || '';
const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms || 200); }; };
const isLow = (p) => num(p.Stock) > 0 && num(p.Stock) <= num(p.LowStockThreshold);
const isOut = (p) => num(p.Stock) <= 0;
const stockBadge = (p) => isOut(p) ? '<span class="badge bad">Out of stock</span>' : isLow(p) ? '<span class="badge warn">Low: ' + num(p.Stock) + '</span>' : '<span class="badge ok">' + num(p.Stock) + ' ' + esc(p.Unit) + '</span>';
const categories = () => Array.from(new Set(state.products.map((p) => p.Category).filter(Boolean))).sort();
const emptyState = (icon, text) => '<div class="empty">' + ic(icon) + '<div>' + esc(text) + '</div></div>';

function fld(id, label, val, attrs) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val) + '" ' + (attrs || '') + '></div>';
}
function selectHtml(id, label, options, selected) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' +
    options.map((o) => { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>';
}
function downloadCSV(name, rows) {
  const cell = (v) => {
    v = v == null ? '' : v;
    if (typeof v === 'string' && /^[=+\-@]/.test(v) && isNaN(v)) v = "'" + v; // spreadsheet formula guard
    v = String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ===== Feedback UI: toast, loader, modal, confirm ===== */
let toastTimer;
function toast(msg, type) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast ' + (type || '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), type === 'err' ? 5000 : 2500);
}
function loading(on) { $('loader').classList.toggle('hidden', !on); }
let topProgressRequests = 0, topProgressValue = 0, topProgressTimer = null, topProgressHide = null;
function beginTopProgress() {
  const bar = $('topProgress');
  clearTimeout(topProgressHide);
  if (topProgressRequests++ === 0) {
    topProgressValue = 8; bar.classList.remove('hidden'); bar.style.width = '8%';
  }
  if (!topProgressTimer) topProgressTimer = setInterval(() => {
    if (topProgressRequests) { topProgressValue += Math.max(0.3, (90 - topProgressValue) * 0.08); $('topProgress').style.width = topProgressValue + '%'; }
  }, 120);
}
function endTopProgress() {
  topProgressRequests = Math.max(0, topProgressRequests - 1);
  if (topProgressRequests) return;
  clearInterval(topProgressTimer); topProgressTimer = null;
  const bar = $('topProgress'); topProgressValue = 100; bar.style.width = '100%';
  topProgressHide = setTimeout(() => { bar.classList.add('hidden'); bar.style.width = '0'; topProgressValue = 0; }, 220);
}
let modalCancel = null;
async function api(action, payload, opts) {
  opts = opts || {};
  const url = opts.url || state.apiUrl;
  if (!url) throw new Error('API URL is not set');
  if (!navigator.onLine) { setSync('offline'); throw new Error('You are offline. Check your internet connection.'); }
  setSync('syncing');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  beginTopProgress();
  try {
    const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: payload || {}, token: opts.noAuth ? undefined : state.token }), signal: ctrl.signal });
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Unexpected server response. Check the URL and that the deployment access is "Anyone".'); }
    if (!json || typeof json.success !== 'boolean') throw new Error('Unexpected server response.');
    if (!json.success) {
      const err = new Error(json.message || 'Request failed'); err.server = true;
      setSync('connected');
      if (/session expired/i.test(err.message)) App.logout(true);
      throw err;
    }
    setSync('connected');
    return json;
  } catch (e) {
    if (!e.server) {
      setSync('failed');
      if (e.name === 'AbortError') e = new Error('The request timed out. Check your connection and try again.');
      else if (e instanceof TypeError) e = new Error('Cannot reach the server. Check your connection and API URL.');
    }
    throw e;
  } finally { clearTimeout(timer); endTopProgress(); }
}
// Runs an action with loader + toasts. Returns the response, or null on failure.
async function act(action, payload, okMsg) {
  loading(true);
  try { const r = await api(action, payload); toast(okMsg || r.message, 'ok'); return r; }
  catch (e) { toast(e.message, 'err'); return null; }
  finally { loading(false); }
}
async function loadAll() {
  const r = await api('getAll');
  const d = r.data;
  state.user = d.user; state.settings = d.settings || {};
  state.products = d.products || []; state.sales = d.sales || []; state.saleItems = d.saleItems || [];
  state.expenses = d.expenses || []; state.movements = d.movements || [];
  state.users = {}; state.users[d.user.UserID] = d.user.DisplayName;
  if (isAdmin()) { try { (await api('listUsers')).data.forEach((u) => { state.users[u.UserID] = u.DisplayName; }); } catch (e) { /* non-fatal */ } }
}
async function refresh() {
  try { await loadAll(); } catch (e) { toast(e.message, 'err'); }
  updateHeader(); render();
}

/* ===== Navigation ===== */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'pos', label: 'New Sale', icon: 'cart' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'inventory', label: 'Inventory', icon: 'layers' },
  { id: 'transactions', label: 'Transactions', icon: 'receipt' },
  { id: 'expenses', label: 'Expenses', icon: 'wallet', admin: true },
  { id: 'reports', label: 'Reports', icon: 'chart', admin: true },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];
const BOTTOM = ['dashboard', 'pos', 'products', 'transactions'];
const allowed = () => NAV.filter((n) => !n.admin || isAdmin());

function renderNav() {
  const items = allowed();
  $('bottomNav').innerHTML = BOTTOM.map((id) => { const n = NAV.find((x) => x.id === id); return '<button data-nav="' + id + '" class="' + (state.view === id ? 'active' : '') + '">' + ic(n.icon) + '<span>' + n.label + '</span></button>'; }).join('') +
    '<button data-nav="more" class="' + (BOTTOM.indexOf(state.view) < 0 ? 'active' : '') + '">' + ic('more') + '<span>More</span></button>';
  $('drawerLinks').innerHTML = items.map((n) => '<button data-nav="' + n.id + '" class="' + (state.view === n.id ? 'active' : '') + '">' + ic(n.icon) + n.label + '</button>').join('') +
    '<hr><button data-nav="logout">' + ic('logout') + 'Log out</button>';
}
function openDrawer() { $('drawer').classList.add('open'); $('drawerBack').classList.remove('hidden'); }
function closeDrawer() { $('drawer').classList.remove('open'); $('drawerBack').classList.add('hidden'); }
function navigate(id) {
  if (id === 'more') return openDrawer();
  if (id === 'logout') { closeDrawer(); return App.logout(); }
  const n = NAV.find((x) => x.id === id);
  if (!n || (n.admin && !isAdmin())) return toast('That section is for the owner/admin only', 'err');
  state.view = id; closeDrawer(); render(); window.scrollTo(0, 0);
}
App.navigate = navigate;
function render() {
  const el = $('view'); const fn = App.views[state.view];
  el.innerHTML = '';
  if (fn) fn(el); else el.innerHTML = emptyState('alert', 'This section is not available yet.');
  renderNav();
}
App.render = render;
function updateHeader() {
  $('bizName').textContent = state.settings.BusinessName || 'POS';
  $('todayDate').textContent = new Date().toLocaleDateString('en-PH', { timeZone: tz(), weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  $('drawerUser').textContent = state.user ? state.user.DisplayName : '';
  $('drawerRole').textContent = state.user ? (state.user.Role === 'admin' ? 'Owner / Admin' : 'Cashier') : '';
}

/* ===== Screens: API setup, login, app ===== */
function showScreen(id) {
  ['screen-api', 'screen-login', 'app'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}
const URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+\/|macros\/)s\/[\w-]+\/exec$/;
function showApiScreen() { $('apiUrl').value = state.apiUrl; $('apiMsg').textContent = ''; showScreen('screen-api'); }
async function saveApiUrl() {
  const url = $('apiUrl').value.trim(), m = $('apiMsg'); m.className = 'msg';
  if (!URL_RE.test(url)) { m.textContent = 'That does not look like a Web app URL. It should start with https://script.google.com/macros/s/ and end with /exec'; return; }
  m.textContent = 'Testing connection...'; $('btnSaveApi').disabled = true;
  try {
    await api('ping', {}, { url: url, noAuth: true });
    state.apiUrl = url; localStorage.setItem('pos_api', url);
    m.textContent = ''; await showLogin();
  } catch (e) { m.className = 'msg'; m.textContent = 'Connection failed: ' + e.message; }
  finally { $('btnSaveApi').disabled = false; }
}
let needsSetup = false;
async function showLogin() {
  showScreen('screen-login'); $('loginMsg').textContent = '';
  try { needsSetup = (await api('ping', {}, { noAuth: true })).data.needsSetup; }
  catch (e) { needsSetup = false; $('loginMsg').textContent = e.message; }
  $('bootBox').classList.toggle('hidden', !needsSetup);
  $('loginTitle').textContent = needsSetup ? 'Create owner account' : 'Sign in';
  $('btnLogin').textContent = needsSetup ? 'Create account' : 'Sign in';
}
async function doLogin() {
  const u = $('loginUser').value.trim(), p = $('loginPass').value, m = $('loginMsg');
  m.textContent = '';
  if (!u || !p) { m.textContent = 'Enter your username and password'; return; }
  $('btnLogin').disabled = true;
  try {
    const r = needsSetup
      ? await api('bootstrap', { username: u, password: p, displayName: $('bootName').value, businessName: $('bootBiz').value }, { noAuth: true })
      : await api('login', { username: u, password: p }, { noAuth: true });
    state.token = r.data.token; sessionStorage.setItem('pos_token', state.token);
    $('loginPass').value = '';
    await enterApp();
  } catch (e) { m.textContent = e.message; }
  finally { $('btnLogin').disabled = false; }
}
async function enterApp() {
  loading(true);
  try { await loadAll(); } finally { loading(false); }
  showScreen('app'); updateHeader(); state.view = 'dashboard'; render();
}
App.logout = async function (silent) {
  if (!silent && state.token) { try { await api('logout'); } catch (e) { /* ignore */ } }
  state.token = ''; sessionStorage.removeItem('pos_token'); state.user = null;
  App.ui = {}; closeModal(); closeDrawer(); showLogin();
};
App.start = async function () {
  $('btnSaveApi').onclick = saveApiUrl;
  $('btnLogin').onclick = doLogin;
  $('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('btnChangeApi').onclick = showApiScreen;
  $('btnMenu').onclick = openDrawer;
  $('drawerBack').onclick = closeDrawer;
  $('btnSync').onclick = refresh;
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  $('bottomNav').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) navigate(b.dataset.nav); });
  $('drawerLinks').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) navigate(b.dataset.nav); });
  $('btnMenu').innerHTML = ic('menu'); $('btnSync').innerHTML = ic('refresh'); $('modalClose').innerHTML = ic('x');
  window.addEventListener('offline', () => setSync('offline'));
  window.addEventListener('online', () => setSync('connected'));
  if (!navigator.onLine) setSync('offline');
  if (!state.apiUrl) return showApiScreen();
  if (state.token) {
    try { await enterApp(); return; } catch (e) { state.token = ''; sessionStorage.removeItem('pos_token'); }
  }
  showLogin();
};

/* ===== Products ===== */
function profitInfo(p) {
  const profit = r2(num(p.SellingPrice) - num(p.CostPrice));
  const margin = num(p.SellingPrice) > 0 ? (profit / num(p.SellingPrice)) * 100 : 0;
  return { profit: profit, margin: margin };
}
App.views.products = function (el) {
  const u = App.ui.prod = App.ui.prod || { q: '', cat: 'All', status: 'Active', sort: 'name' };
  el.innerHTML = '<div class="spread"><h2>Products</h2>' + (isAdmin() ? '<button class="btn btn-primary btn-sm" id="pAdd">' + ic('plus') + ' Add</button>' : '') + '</div>' +
    '<div class="searchbar" style="margin-top:10px">' + ic('search') + '<input id="pSearch" type="search" placeholder="Search name or SKU" value="' + esc(u.q) + '"></div>' +
    '<div class="grid2" style="margin-bottom:8px">' +
    selectHtml('pStatus', 'Status', ['Active', 'Inactive', 'Archived', 'All'], u.status) +
    selectHtml('pSort', 'Sort by', [['name', 'Name'], ['price', 'Price (high)'], ['stock', 'Stock (low)'], ['margin', 'Margin (high)']], u.sort) + '</div>' +
    '<div class="chips" id="pCats"></div><div class="card" id="pList"></div>';
  const draw = () => {
    $('pCats').innerHTML = ['All'].concat(categories()).map((c) => '<button class="chip ' + (u.cat === c ? 'active' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const q = u.q.toLowerCase();
    let list = state.products.filter((p) => (u.status === 'All' || p.Status === u.status) && (u.cat === 'All' || p.Category === u.cat) &&
      (!q || String(p.Name).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q)));
    const sorts = { name: (a, b) => String(a.Name).localeCompare(b.Name), price: (a, b) => num(b.SellingPrice) - num(a.SellingPrice), stock: (a, b) => num(a.Stock) - num(b.Stock), margin: (a, b) => profitInfo(b).margin - profitInfo(a).margin };
    list.sort(sorts[u.sort]);
    $('pList').innerHTML = list.length ? list.map((p) => {
      const pi = profitInfo(p);
      return '<div class="list-item" data-id="' + esc(p.ProductID) + '" style="cursor:pointer"><div class="grow"><div class="title">' + esc(p.Name) + '</div><div class="sub">' + esc(p.SKU) + ' · ' + esc(p.Category) + (p.Status !== 'Active' ? ' · <span class="badge warn">' + esc(p.Status) + '</span>' : '') + '</div></div>' +
        '<div class="right"><div><strong>' + money(p.SellingPrice) + '</strong></div><div class="sub">' + pi.margin.toFixed(0) + '% margin</div>' + stockBadge(p) + '</div></div>';
    }).join('') : emptyState('box', state.products.length ? 'No products match your filters.' : 'No products yet. Tap Add to create your first product.');
  };
  draw();
  $('pSearch').addEventListener('input', debounce((e) => { u.q = e.target.value; draw(); }));
  $('pStatus').onchange = (e) => { u.status = e.target.value; draw(); };
  $('pSort').onchange = (e) => { u.sort = e.target.value; draw(); };
  $('pCats').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { u.cat = b.dataset.c; draw(); } };
  $('pList').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) openProductDetail(r.dataset.id); };
  if ($('pAdd')) $('pAdd').onclick = () => openProductForm(null);
};
function openProductDetail(id) {
  const p = state.products.find((x) => x.ProductID === id); if (!p) return;
  const pi = profitInfo(p);
  const kv = (k, v) => '<div class="kv"><span class="muted">' + k + '</span><span>' + v + '</span></div>';
  openModal(p.Name,
    kv('SKU', esc(p.SKU)) + kv('Category', esc(p.Category)) + (p.Description ? kv('Description', esc(p.Description)) : '') +
    kv('Selling price', money(p.SellingPrice)) + kv('Cost price', money(p.CostPrice)) +
    kv('Est. unit profit', '<strong class="' + (pi.profit >= 0 ? 'green' : 'red') + '">' + money(pi.profit) + ' (' + pi.margin.toFixed(1) + '%)</strong>') +
    kv('Stock', stockBadge(p)) + kv('Low-stock alert at', num(p.LowStockThreshold) + ' ' + esc(p.Unit)) + kv('Status', esc(p.Status)) +
    kv('Created', fmtDate(p.CreatedAt)) + kv('Updated', fmtDate(p.UpdatedAt)) +
    (isAdmin() ? '<div class="grid2" style="margin-top:14px"><button class="btn" id="dEdit">' + ic('edit') + ' Edit</button><button class="btn" id="dAdj">Adjust stock</button>' +
      '<button class="btn btn-ghost" id="dAct">' + (p.Status === 'Active' ? 'Deactivate' : 'Activate') + '</button>' +
      '<button class="btn btn-danger" id="dArc">' + (p.Status === 'Archived' ? 'Restore' : 'Archive') + '</button></div>' : ''));
  if (!isAdmin()) return;
  $('dEdit').onclick = () => openProductForm(p);
  $('dAdj').onclick = () => openAdjust(p);
  const setStatus = async (status, msg) => { if (await confirmBox(msg, 'Yes')) { const r = await act('setProductStatus', { ProductID: p.ProductID, status: status }); if (r) { closeModal(); refresh(); } } };
  $('dAct').onclick = () => setStatus(p.Status === 'Active' ? 'Inactive' : 'Active', (p.Status === 'Active' ? 'Deactivate' : 'Activate') + ' this product?');
  $('dArc').onclick = () => setStatus(p.Status === 'Archived' ? 'Active' : 'Archived', p.Status === 'Archived' ? 'Restore this product?' : 'Archive this product? Past sales stay intact.');
}
function openProductForm(p) {
  const isNew = !p;
  p = p || { Unit: 'pc', LowStockThreshold: state.settings.DefaultLowStock || 5 };
  openModal(isNew ? 'Add product' : 'Edit product',
    fld('fSku', 'SKU / product code', p.SKU, 'maxlength="40"') + fld('fName', 'Product name', p.Name, 'maxlength="100"') +
    '<div class="field"><label for="fCat">Category</label><input id="fCat" list="catOpts" maxlength="60" value="' + esc(p.Category) + '"><datalist id="catOpts">' + categories().map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist></div>' +
    '<div class="field"><label for="fDesc">Description (optional)</label><textarea id="fDesc" maxlength="300">' + esc(p.Description) + '</textarea></div>' +
    '<div class="grid2">' + fld('fPrice', 'Selling price (PHP)', p.SellingPrice, 'type="number" inputmode="decimal" min="0" step="0.01"') + fld('fCost', 'Cost price (PHP)', p.CostPrice, 'type="number" inputmode="decimal" min="0" step="0.01"') + '</div>' +
    '<div class="grid2">' + (isNew ? fld('fStock', 'Starting stock', p.Stock || 0, 'type="number" inputmode="numeric" min="0" step="1"') : '<div class="field"><label>Stock</label><div class="muted" style="padding:10px 0">' + num(p.Stock) + ' (change in Inventory)</div></div>') +
    fld('fLow', 'Low-stock alert at', p.LowStockThreshold, 'type="number" inputmode="numeric" min="0" step="1"') + '</div>' +
    fld('fUnit', 'Unit (pc, cup, kg...)', p.Unit, 'maxlength="20"') +
    '<p class="msg" id="fMsg"></p><button class="btn btn-primary btn-block" id="fSave">Save product</button>');
  $('fSave').onclick = async () => {
    const d = { ProductID: p.ProductID, SKU: $('fSku').value.trim(), Name: $('fName').value.trim(), Category: $('fCat').value.trim(), Description: $('fDesc').value.trim(),
      SellingPrice: $('fPrice').value, CostPrice: $('fCost').value, LowStockThreshold: $('fLow').value, Unit: $('fUnit').value.trim() };
    if (isNew) d.Stock = $('fStock').value;
    const bad = !d.SKU ? 'SKU is required' : !d.Name ? 'Name is required' : !d.Category ? 'Category is required' : !d.Unit ? 'Unit is required'
      : (d.SellingPrice === '' || num(d.SellingPrice) < 0) ? 'Enter a valid selling price' : (d.CostPrice === '' || num(d.CostPrice) < 0) ? 'Enter a valid cost price'
      : (d.LowStockThreshold === '' || num(d.LowStockThreshold) < 0) ? 'Enter a valid low-stock alert'
      : (isNew && (num(d.Stock) < 0 || num(d.Stock) !== Math.floor(num(d.Stock)))) ? 'Stock must be a whole number, 0 or more' : '';
    if (bad) { $('fMsg').textContent = bad; return; }
    $('fSave').disabled = true;
    const r = await act('saveProduct', d);
    if (r) { closeModal(); refresh(); } else $('fSave').disabled = false;
  };
}

/* ===== Inventory ===== */
const MOVE_TYPES = [['RESTOCK', 'Stock added (restock)'], ['REDUCTION', 'Stock reduced'], ['DAMAGED', 'Damaged'], ['EXPIRED', 'Expired'], ['ADJUSTMENT', 'Set exact count']];
function openAdjust(p) {
  openModal('Adjust stock: ' + p.Name,
    '<p class="muted" style="margin-bottom:10px">Current stock: <strong>' + num(p.Stock) + ' ' + esc(p.Unit) + '</strong></p>' +
    selectHtml('aType', 'Type', MOVE_TYPES, 'RESTOCK') + fld('aQty', 'Quantity', '', 'type="number" inputmode="numeric" min="0" step="1"') +
    fld('aReason', 'Reason (required)', '', 'maxlength="200"') + '<p class="msg" id="aMsg"></p><button class="btn btn-primary btn-block" id="aSave">Save movement</button>');
  $('aType').onchange = () => { $('aQty').previousElementSibling.textContent = $('aType').value === 'ADJUSTMENT' ? 'New stock count' : 'Quantity'; };
  $('aSave').onclick = async () => {
    const q = $('aQty').value, reason = $('aReason').value.trim();
    if (q === '' || num(q) < 0 || num(q) !== Math.floor(num(q))) { $('aMsg').textContent = 'Enter a whole number, 0 or more'; return; }
    if (!reason) { $('aMsg').textContent = 'A reason is required'; return; }
    $('aSave').disabled = true;
    const r = await act('adjustStock', { ProductID: p.ProductID, type: $('aType').value, quantity: q, reason: reason });
    if (r) { closeModal(); refresh(); } else $('aSave').disabled = false;
  };
}
App.views.inventory = function (el) {
  const u = App.ui.inv = App.ui.inv || { tab: 'stock', q: '', cat: 'All', flt: 'all' };
  if (!isAdmin()) u.tab = 'stock';
  el.innerHTML = '<h2 style="margin-bottom:10px">Inventory</h2>' +
    (isAdmin() ? '<div class="tabs"><button class="tab ' + (u.tab === 'stock' ? 'active' : '') + '" data-t="stock">Current stock</button><button class="tab ' + (u.tab === 'history' ? 'active' : '') + '" data-t="history">Movement history</button></div>' : '') +
    '<div class="searchbar">' + ic('search') + '<input id="iSearch" type="search" placeholder="Search product" value="' + esc(u.q) + '"></div><div id="iBody"></div>';
  const draw = () => {
    const q = u.q.toLowerCase(), body = $('iBody');
    if (u.tab === 'history') {
      const rows = state.movements.filter((m) => !q || String(m.ProductName).toLowerCase().includes(q) || String(m.ReferenceID).toLowerCase().includes(q)).slice().reverse().slice(0, 300);
      body.innerHTML = rows.length ? '<div class="card tbl-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Prev</th><th class="num">New</th><th>Reason</th><th>Ref</th><th>By</th></tr></thead><tbody>' +
        rows.map((m) => '<tr><td>' + esc(fmtDateTime(m.DateTime)) + '</td><td>' + esc(m.ProductName) + '</td><td>' + esc(m.MovementType) + '</td><td class="num ' + (num(m.QuantityChange) < 0 ? 'red' : 'green') + '">' + num(m.QuantityChange) + '</td><td class="num">' + num(m.PreviousStock) + '</td><td class="num">' + num(m.NewStock) + '</td><td>' + esc(m.Reason) + '</td><td>' + esc(m.ReferenceID) + '</td><td>' + esc(userName(m.UserID)) + '</td></tr>').join('') +
        '</tbody></table></div><p class="muted" style="font-size:.78rem">Showing the latest 300 movements.</p>' : emptyState('layers', 'No stock movements yet.');
      return;
    }
    const base = state.products.filter((p) => p.Status !== 'Archived');
    const cats = ['All'].concat(Array.from(new Set(base.map((p) => p.Category))).sort());
    const list = base.filter((p) => (u.cat === 'All' || p.Category === u.cat) && (u.flt === 'all' || (u.flt === 'low' && isLow(p)) || (u.flt === 'out' && isOut(p))) && (!q || String(p.Name).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q)))
      .sort((a, b) => num(a.Stock) - num(b.Stock));
    const value = base.reduce((s, p) => s + num(p.Stock) * num(p.CostPrice), 0);
    body.innerHTML = '<div class="chips">' + [['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']].map((f) => '<button class="chip ' + (u.flt === f[0] ? 'active' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
      '<div class="chips">' + cats.map((c) => '<button class="chip ' + (u.cat === c ? 'active' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<div class="card"><div class="kv"><span class="muted">Inventory value (at cost)</span><strong>' + money(value) + '</strong></div></div>' +
      '<div class="card">' + (list.length ? list.map((p) => '<div class="list-item"><div class="grow"><div class="title">' + esc(p.Name) + '</div><div class="sub">' + esc(p.SKU) + ' · ' + esc(p.Category) + '</div></div><div class="right">' + stockBadge(p) + (isAdmin() ? '<div><button class="btn btn-sm" data-adj="' + esc(p.ProductID) + '" style="margin-top:6px">Adjust</button></div>' : '') + '</div></div>').join('') : emptyState('layers', 'No products match.')) + '</div>';
  };
  draw();
  el.querySelectorAll('.tab').forEach((b) => b.onclick = () => { u.tab = b.dataset.t; App.render(); });
  $('iSearch').addEventListener('input', debounce((e) => { u.q = e.target.value; draw(); }));
  $('iBody').onclick = (e) => {
    const f = e.target.closest('[data-f]'), c = e.target.closest('[data-c]'), a = e.target.closest('[data-adj]');
    if (f) { u.flt = f.dataset.f; draw(); } else if (c) { u.cat = c.dataset.c; draw(); }
    else if (a) { const p = state.products.find((x) => x.ProductID === a.dataset.adj); if (p) openAdjust(p); }
  };
};
