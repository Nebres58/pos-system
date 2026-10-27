'use strict';
/* ===== Dashboard, transactions, expenses and business settings ===== */

const txTotal = (s) => r2(Math.max(0, num(s.AmountPaid) - num(s.ChangeAmount)));
const txDateValue = (s) => s.DateTime || s.Date || s.CreatedAt || '';
const txDateKey = (s) => dayKey(txDateValue(s));
const txTime = (s) => { const d = new Date(txDateValue(s)); return isNaN(d) ? 0 : d.getTime(); };
const txStatus = (s) => { const status = String(s.Status || 'Completed').toLowerCase(); return status === 'refunded' ? 'Refunded' : 'Completed'; };
App.views.dashboard = function (el) {
  const today = todayKey();
  const sales = state.sales.filter((s) => txDateKey(s) === today && txStatus(s) !== 'Refunded');
  const revenue = r2(sales.reduce((sum, s) => sum + txTotal(s), 0));
  const expenses = state.expenses.filter((x) => dayKey(x.DateTime || x.Date || x.CreatedAt) === today);
  const expenseTotal = r2(expenses.reduce((sum, x) => sum + num(x.Amount), 0));
  const low = state.products.filter((p) => p.Status === 'Active' && (isLow(p) || isOut(p)));
  const recent = state.sales.slice().sort((a, b) => txTime(b) - txTime(a)).slice(0, 5);
  const stat = (label, value, cls) => '<div class="stat ' + (cls || '') + '"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div></div>';
  el.innerHTML = '<div class="spread"><h2>Dashboard</h2><span class="muted">Today</span></div>' +
    '<div class="grid-cards" style="margin-top:10px">' + stat('Sales', money(revenue), 'pos') + stat('Transactions', sales.length) +
    stat('Expenses', money(expenseTotal), expenseTotal ? 'neg' : '') + stat('Net after expenses', money(revenue - expenseTotal), revenue >= expenseTotal ? 'pos' : 'neg') + '</div>' +
    '<div class="section-title"><h3>Stock alerts</h3><button class="btn btn-sm" data-go="inventory">Inventory</button></div>' +
    '<div class="card">' + (low.length ? low.slice(0, 8).map((p) => '<div class="list-item"><div class="grow"><div class="title">' + esc(p.Name) + '</div><div class="sub">' + esc(p.SKU) + '</div></div>' + stockBadge(p) + '</div>').join('') : emptyState('check', 'No low-stock products.')) + '</div>' +
    '<div class="section-title"><h3>Recent transactions</h3><button class="btn btn-sm" data-go="transactions">View all</button></div>' +
    '<div class="card">' + (recent.length ? recent.map((s) => '<button class="list-item" data-tx="' + esc(s.TransactionID) + '" style="width:100%;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;cursor:pointer"><span class="grow"><span class="title">' + esc(s.TransactionID) + '</span><span class="sub" style="display:block">' + esc(fmtDateTime(txDateValue(s))) + ' · ' + esc(s.PaymentMethod) + '</span></span><strong>' + money(txTotal(s)) + '</strong></button>').join('') : emptyState('receipt', 'No transactions yet.')) + '</div>';
  el.onclick = (e) => {
    const go = e.target.closest('[data-go]'), tx = e.target.closest('[data-tx]');
    if (go) App.navigate(go.dataset.go);
    if (tx) showTransaction(tx.dataset.tx);
  };
};
App.views.transactions = function (el) {
  const u = App.ui.transactions = App.ui.transactions || { q: '', from: '', to: '', status: 'All' };
  el.innerHTML = '<h2 style="margin-bottom:10px">Transactions</h2>' +
    '<div class="searchbar">' + ic('search') + '<input id="txSearch" type="search" placeholder="Search receipt or cashier" value="' + esc(u.q) + '"></div>' +
    '<div class="grid2"><div class="field"><label for="txFrom">From</label><input id="txFrom" type="date" value="' + esc(u.from) + '"></div>' +
    '<div class="field"><label for="txTo">To</label><input id="txTo" type="date" value="' + esc(u.to) + '"></div></div>' +
    selectHtml('txStatus', 'Status', ['All', 'Completed', 'Refunded'], u.status) + '<div id="txList"></div>';
  const draw = () => {
    const q = u.q.toLowerCase();
    const rows = state.sales.filter((s) => {
      const date = txDateKey(s), status = txStatus(s);
      return (!u.from || date >= u.from) && (!u.to || date <= u.to) && (u.status === 'All' || status === u.status) &&
        (!q || String(s.TransactionID).toLowerCase().includes(q) || String(userName(s.CashierID)).toLowerCase().includes(q));
    }).slice().sort((a, b) => txTime(b) - txTime(a)).slice(0, 500);
    $('txList').innerHTML = rows.length ? '<div class="card tbl-wrap"><table><thead><tr><th>Date</th><th>Receipt</th><th>Cashier</th><th>Payment</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>' +
      rows.map((s) => '<tr data-tx="' + esc(s.TransactionID) + '" tabindex="0" role="button" style="cursor:pointer"><td>' + esc(fmtDateTime(s.DateTime)) + '</td><td>' + esc(s.TransactionID) + '</td><td>' + esc(userName(s.CashierID)) + '</td><td>' + esc(s.PaymentMethod) + '</td><td>' + (txStatus(s) === 'Refunded' ? '<span class="badge bad">Refunded</span>' : '<span class="badge ok">Completed</span>') + '</td><td class="num">' + money(txTotal(s)) + '</td></tr>').join('') +
      '</tbody></table></div><p class="muted" style="font-size:.78rem">Showing up to 500 matching transactions.</p>' : '<div class="card">' + emptyState('receipt', 'No transactions match your filters.') + '</div>';
  };
  draw();
  $('txSearch').addEventListener('input', debounce((e) => { u.q = e.target.value; draw(); }));
  $('txFrom').onchange = (e) => { u.from = e.target.value; draw(); };
  $('txTo').onchange = (e) => { u.to = e.target.value; draw(); };
  $('txStatus').onchange = (e) => { u.status = e.target.value; draw(); };
  $('txList').onclick = (e) => { const row = e.target.closest('[data-tx]'); if (row) showTransaction(row.dataset.tx); };
  $('txList').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { const row = e.target.closest('[data-tx]'); if (row) { e.preventDefault(); showTransaction(row.dataset.tx); } } };
};

function showTransaction(id) {
  const s = state.sales.find((x) => x.TransactionID === id);
  if (!s) return toast('Transaction not found. Refresh and try again.', 'err');
  const items = state.saleItems.filter((x) => x.TransactionID === id);
  const kv = (k, v) => '<div class="kv"><span class="muted">' + k + '</span><span>' + v + '</span></div>';
  openModal('Transaction details', '<div class="spread"><strong>' + esc(s.TransactionID) + '</strong>' + (txStatus(s) === 'Refunded' ? '<span class="badge bad">Refunded</span>' : '<span class="badge ok">Completed</span>') + '</div>' +
    kv('Date', esc(fmtDateTime(s.DateTime))) + kv('Cashier', esc(userName(s.CashierID))) + kv('Payment', esc(s.PaymentMethod)) +
    '<div class="section-title"><h3>Items</h3></div>' + (items.length ? items.map((i) => '<div class="list-item"><span class="grow">' + esc(i.ProductName) + '<span class="sub" style="display:block">' + num(i.Quantity) + ' × ' + money(i.UnitPrice) + '</span></span><strong>' + money(num(i.Quantity) * num(i.UnitPrice)) + '</strong></div>').join('') : '<p class="muted">Item details unavailable.</p>') +
    '<div style="margin-top:10px">' + kv('Subtotal', money(s.GrossAmount)) + (num(s.DiscountAmount) ? kv('Discount', '− ' + money(s.DiscountAmount)) : '') + (num(s.TaxAmount) ? kv('Tax', money(s.TaxAmount)) : '') + '<div class="kv total"><span>Total</span><strong>' + money(txTotal(s)) + '</strong></div>' +
    (s.PaymentMethod === 'Cash' ? kv('Cash received', money(s.AmountPaid)) + kv('Change', money(s.ChangeAmount)) : '') + '</div>' +
    '<button class="btn btn-primary btn-block" id="txReceipt">' + ic('receipt') + ' View / print receipt</button>');
  $('txReceipt').onclick = () => App.showReceipt(id);
}

App.views.expenses = function (el) {
  if (!isAdmin()) { el.innerHTML = '<h2>Expenses</h2><div class="card">' + emptyState('alert', 'This section is for the owner/admin only.') + '</div>'; return; }
  const u = App.ui.expenses = App.ui.expenses || { q: '', from: '', to: '' };
  el.innerHTML = '<div class="spread"><h2>Expenses</h2><button class="btn btn-primary btn-sm" id="exAdd">' + ic('plus') + ' Add</button></div>' +
    '<div class="searchbar" style="margin-top:10px">' + ic('search') + '<input id="exSearch" type="search" placeholder="Search category or note" value="' + esc(u.q) + '"></div>' +
    '<div class="grid2"><div class="field"><label for="exFrom">From</label><input id="exFrom" type="date" value="' + esc(u.from) + '"></div><div class="field"><label for="exTo">To</label><input id="exTo" type="date" value="' + esc(u.to) + '"></div></div><div id="exList"></div>';
  const draw = () => {
    const q = u.q.toLowerCase();
    const rows = state.expenses.filter((x) => {
      const date = dayKey(x.DateTime || x.Date || x.CreatedAt), text = (String(x.Category || '') + ' ' + String(x.Description || x.Note || '')).toLowerCase();
      return (!u.from || date >= u.from) && (!u.to || date <= u.to) && (!q || text.includes(q));
    }).slice().sort((a, b) => new Date(b.DateTime || b.Date || b.CreatedAt) - new Date(a.DateTime || a.Date || a.CreatedAt));
    const total = rows.reduce((sum, x) => sum + num(x.Amount), 0);
    $('exList').innerHTML = '<div class="card"><div class="kv"><span class="muted">Filtered expenses</span><strong>' + money(total) + '</strong></div></div>' + (rows.length ? '<div class="card">' + rows.map((x) => '<div class="list-item"><span class="grow"><span class="title">' + esc(x.Category || 'Expense') + '</span><span class="sub" style="display:block">' + esc(fmtDateTime(x.DateTime || x.Date || x.CreatedAt)) + (x.Description || x.Note ? ' · ' + esc(x.Description || x.Note) : '') + '</span></span><strong>' + money(x.Amount) + '</strong></div>').join('') + '</div>' : '<div class="card">' + emptyState('wallet', 'No expenses match your filters.') + '</div>');
  };
  draw();
  $('exSearch').addEventListener('input', debounce((e) => { u.q = e.target.value; draw(); }));
  $('exFrom').onchange = (e) => { u.from = e.target.value; draw(); };
  $('exTo').onchange = (e) => { u.to = e.target.value; draw(); };
  $('exAdd').onclick = openExpenseForm;
};

function openExpenseForm() {
  openModal('Add expense', fld('exCategory', 'Category', '', 'maxlength="60" placeholder="e.g. Utilities"') +
    fld('exAmount', 'Amount (PHP)', '', 'type="number" inputmode="decimal" min="0.01" step="0.01"') +
    '<div class="field"><label for="exDescription">Note (optional)</label><textarea id="exDescription" maxlength="300"></textarea></div>' +
    '<p class="msg" id="exMsg"></p><button class="btn btn-primary btn-block" id="exSave">Save expense</button>');
  $('exSave').onclick = async () => {
    const category = $('exCategory').value.trim(), amount = $('exAmount').value, description = $('exDescription').value.trim();
    if (!category) { $('exMsg').textContent = 'Category is required'; return; }
    if (amount === '' || !isFinite(Number(amount)) || num(amount) <= 0) { $('exMsg').textContent = 'Enter an amount greater than zero'; return; }
    $('exSave').disabled = true;
    const r = await act('saveExpense', { Category: category, Amount: r2(num(amount)), Description: description });
    if (r) { closeModal(); await refresh(); } else if ($('exSave')) $('exSave').disabled = false;
  };
}

App.views.settings = function (el) {
  const s = state.settings;
  el.innerHTML = '<h2 style="margin-bottom:10px">Settings</h2>' +
    '<div class="card"><h3 style="margin-bottom:10px">Business details</h3>' +
    fld('setBusiness', 'Business name', s.BusinessName || '', 'maxlength="80"') + fld('setAddress', 'Address', s.BusinessAddress || '', 'maxlength="200"') +
    fld('setContact', 'Contact', s.BusinessContact || '', 'maxlength="100"') + fld('setFooter', 'Receipt footer', s.ReceiptFooter || '', 'maxlength="200"') +
    '<div class="grid2">' + fld('setTax', 'Tax rate (%)', s.TaxRate || '0', 'type="number" min="0" max="100" step="0.01"') + fld('setLow', 'Default low-stock alert', s.DefaultLowStock || '5', 'type="number" min="0" step="1"') + '</div>' +
    selectHtml('setTimezone', 'Time zone', [[s.TimeZone || 'Asia/Manila', s.TimeZone || 'Asia/Manila'], ['Asia/Manila', 'Asia/Manila'], ['UTC', 'UTC'], ['Asia/Singapore', 'Asia/Singapore'], ['America/Los_Angeles', 'America/Los_Angeles'], ['America/New_York', 'America/New_York'], ['Europe/London', 'Europe/London']], s.TimeZone || 'Asia/Manila') +
    '<label class="row" style="margin:4px 0 12px"><input id="setTaxIncl" type="checkbox" style="width:20px;min-height:20px" ' + (s.TaxInclusive === 'true' ? 'checked' : '') + '> Tax is included in listed prices</label>' +
    '<label class="row" style="margin-bottom:12px"><input id="setNegative" type="checkbox" style="width:20px;min-height:20px" ' + (s.AllowNegativeStock === 'true' ? 'checked' : '') + '> Allow sales when stock is insufficient</label>' +
    (isAdmin() ? '<p class="msg" id="setMsg"></p><button class="btn btn-primary btn-block" id="setSave">Save settings</button>' : '<p class="note">Only the owner/admin can change business settings.</p>') + '</div>';
  if (!isAdmin()) {
    ['setBusiness', 'setAddress', 'setContact', 'setFooter', 'setTax', 'setLow', 'setTimezone', 'setTaxIncl', 'setNegative'].forEach((id) => { $(id).disabled = true; });
    return;
  }
  $('setSave').onclick = async () => {
    const tax = $('setTax').value, low = $('setLow').value;
    if (tax === '' || !isFinite(Number(tax)) || num(tax) < 0 || num(tax) > 100) { $('setMsg').textContent = 'Tax rate must be from 0 to 100'; return; }
    if (low === '' || !isFinite(Number(low)) || num(low) < 0 || num(low) !== Math.floor(num(low))) { $('setMsg').textContent = 'Default low-stock alert must be a whole number, 0 or more'; return; }
    const values = { BusinessName: $('setBusiness').value.trim(), BusinessAddress: $('setAddress').value.trim(), BusinessContact: $('setContact').value.trim(), ReceiptFooter: $('setFooter').value.trim(), TaxRate: String(r2(num(tax))), TaxInclusive: $('setTaxIncl').checked ? 'true' : 'false', AllowNegativeStock: $('setNegative').checked ? 'true' : 'false', DefaultLowStock: String(num(low)), TimeZone: $('setTimezone').value };
    if (!values.BusinessName) { $('setMsg').textContent = 'Business name is required'; return; }
    $('setSave').disabled = true;
    const r = await act('saveSettings', values);
    if (r) { await refresh(); toast('Settings saved', 'ok'); } else if ($('setSave')) $('setSave').disabled = false;
  };
};
