'use strict';
/* ===== POS: cart, checkout, receipt ===== */
const cart = App.cart = { items: {}, discount: '', method: 'Cash', received: '', key: '', sig: '', busy: false, owner: '' };
const PAY_METHODS = ['Cash', 'E-Wallet', 'Card', 'Other'];
const newKey = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const allowNegative = () => state.settings.AllowNegativeStock === 'true';
const posKv = (k, v) => '<div class="kv"><span class="muted">' + k + '</span><span>' + v + '</span></div>';

function resetCart() { cart.items = {}; cart.discount = ''; cart.received = ''; cart.key = ''; cart.sig = ''; cart.busy = false; }

function cartLines() {
  const out = [];
  Object.keys(cart.items).forEach((id) => {
    const p = state.products.find((x) => x.ProductID === id && x.Status === 'Active');
    if (p) out.push({ p: p, q: cart.items[id] }); else delete cart.items[id];
  });
  return out;
}
// Same maths as the server (the server recalculates everything and is the final authority).
function calcTotals() {
  const lines = cartLines();
  const gross = r2(lines.reduce((s, l) => s + num(l.p.SellingPrice) * l.q, 0));
  const rawDisc = Math.max(0, num(cart.discount));
  const over = rawDisc > gross;
  const discount = r2(Math.min(rawDisc, gross));
  const rate = num(state.settings.TaxRate), incl = state.settings.TaxInclusive === 'true';
  const taxable = r2(gross - discount);
  let tax, due;
  if (incl) { tax = r2(taxable * rate / (100 + rate)); due = taxable; }
  else { tax = r2(taxable * rate / 100); due = r2(taxable + tax); }
  return { lines: lines, gross: gross, discount: discount, over: over, taxable: taxable, tax: tax, due: due, rate: rate, incl: incl, count: lines.reduce((s, l) => s + l.q, 0) };
}
function setQty(id, q) {
  const p = state.products.find((x) => x.ProductID === id);
  if (!p) return false;
  q = Math.floor(q);
  if (q <= 0) delete cart.items[id];
  else if (!allowNegative() && q > num(p.Stock)) { toast('Only ' + num(p.Stock) + ' ' + p.Unit + ' of ' + p.Name + ' in stock', 'err'); return false; }
  else cart.items[id] = q;
  cart.key = '';
  return true;
}

/* ----- Cashier screen ----- */
App.views.pos = function (el) {
  if (cart.owner !== state.user.UserID) { resetCart(); cart.owner = state.user.UserID; }
  const u = App.ui.pos = App.ui.pos || { q: '', cat: 'All' };
  const active = state.products.filter((p) => p.Status === 'Active');
  el.innerHTML = '<h2 style="margin-bottom:10px">New Sale</h2>' +
    '<div class="searchbar">' + ic('search') + '<input id="sSearch" type="search" placeholder="Search name or SKU" value="' + esc(u.q) + '"></div>' +
    '<div class="chips" id="sCats"></div><div class="pgrid" id="sGrid"></div><div style="height:76px"></div><div class="cart-bar" id="cartBar"></div>';
  const draw = () => {
    const cats = ['All'].concat(Array.from(new Set(active.map((p) => p.Category))).sort());
    $('sCats').innerHTML = cats.map((c) => '<button class="chip ' + (u.cat === c ? 'active' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const q = u.q.toLowerCase();
    const list = active.filter((p) => (u.cat === 'All' || p.Category === u.cat) && (!q || String(p.Name).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q)))
      .sort((a, b) => String(a.Name).localeCompare(b.Name));
    $('sGrid').innerHTML = list.length ? list.map((p) => {
      const out = isOut(p) && !allowNegative(), inCart = cart.items[p.ProductID] || 0;
      return '<button class="pcard ' + (out ? 'out' : '') + '" data-id="' + esc(p.ProductID) + '"><span class="pname">' + esc(p.Name) + '</span><span class="pprice">' + money(p.SellingPrice) + '</span>' +
        '<span class="pstock">' + (out ? 'Out of stock' : num(p.Stock) + ' ' + esc(p.Unit) + ' left') + (inCart ? ' · in cart: ' + inCart : '') + '</span></button>';
    }).join('') : '<div style="grid-column:1/-1">' + emptyState('box', active.length ? 'No products match.' : 'No active products yet. Add products first.') + '</div>';
    updateCartBar();
  };
  draw();
  $('sSearch').addEventListener('input', debounce((e) => { u.q = e.target.value; draw(); }));
  $('sCats').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { u.cat = b.dataset.c; draw(); } };
  $('sGrid').onclick = (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const p = state.products.find((x) => x.ProductID === b.dataset.id);
    if (isOut(p) && !allowNegative()) return toast(p.Name + ' is out of stock', 'err');
    if (setQty(p.ProductID, (cart.items[p.ProductID] || 0) + 1)) draw();
  };
};
function updateCartBar() {
  const bar = $('cartBar'); if (!bar) return;
  const t = calcTotals();
  bar.innerHTML = t.count ? '<button class="btn btn-primary" id="cartOpen">' + ic('cart') + ' View cart · ' + t.count + ' item' + (t.count > 1 ? 's' : '') + ' · ' + money(t.due) + '</button>' : '';
  if ($('cartOpen')) $('cartOpen').onclick = openCart;
}

/* ----- Cart and payment sheet ----- */
function openCart() {
  openModal('Cart', '<div id="cartRoot"><div id="cLines"></div>' +
    fld('cDisc', 'Discount (PHP, optional)', cart.discount, 'type="number" inputmode="decimal" min="0" step="0.01"') +
    '<div id="cSum"></div><div class="pay-methods" style="margin-top:12px">' + PAY_METHODS.map((m) => '<button class="chip ' + (cart.method === m ? 'active' : '') + '" data-m="' + m + '">' + m + '</button>').join('') + '</div>' +
    '<div id="cCash">' + fld('cRecv', 'Cash received (PHP)', cart.received, 'type="number" inputmode="decimal" min="0" step="0.01"') + '<div class="chips" id="cQuick"></div></div>' +
    '<p class="msg" id="cMsg"></p><button class="btn btn-primary btn-block" id="cPay"></button></div>');
  renderCartLines(); updateCartSummary();
  $('cDisc').addEventListener('input', (e) => { cart.discount = e.target.value; cart.key = ''; updateCartSummary(); updateCartBar(); });
  $('cRecv').addEventListener('input', (e) => { cart.received = e.target.value; updateCartSummary(); });
  $('cPay').onclick = doCheckout;
  $('cartRoot').onclick = (e) => {
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), rm = e.target.closest('[data-rm]'), m = e.target.closest('[data-m]'), q = e.target.closest('[data-q]');
    if (inc) setQty(inc.dataset.inc, (cart.items[inc.dataset.inc] || 0) + 1);
    else if (dec) setQty(dec.dataset.dec, (cart.items[dec.dataset.dec] || 0) - 1);
    else if (rm) setQty(rm.dataset.rm, 0);
    else if (m) { cart.method = m.dataset.m; cart.key = ''; $('cartRoot').querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('active', b === m)); }
    else if (q) { cart.received = q.dataset.q; $('cRecv').value = cart.received; }
    else return;
    renderCartLines(); updateCartSummary(); updateCartBar();
    if (App.state.view === 'pos' && (inc || dec || rm)) refreshGridOnly();
  };
}
function refreshGridOnly() { const g = $('sGrid'); if (g && App.state.view === 'pos') App.render(); }
function renderCartLines() {
  const t = calcTotals();
  if (!t.count) { closeModal(); updateCartBar(); return; }
  $('cLines').innerHTML = t.lines.map((l) => '<div class="cart-line"><div class="grow"><div style="font-weight:600">' + esc(l.p.Name) + '</div><div class="muted" style="font-size:.8rem">' + money(l.p.SellingPrice) + ' each</div></div>' +
    '<div class="qty"><button data-dec="' + esc(l.p.ProductID) + '">−</button><span>' + l.q + '</span><button data-inc="' + esc(l.p.ProductID) + '">+</button></div>' +
    '<strong style="min-width:76px;text-align:right">' + money(l.p.SellingPrice * l.q) + '</strong><button class="icon-btn" data-rm="' + esc(l.p.ProductID) + '" aria-label="Remove item">' + ic('x') + '</button></div>').join('');
}
function updateCartSummary() {
  if (!$('cSum')) return;
  const t = calcTotals();
  let h = posKv('Subtotal', money(t.gross));
  if (t.discount > 0) h += posKv('Discount', '− ' + money(t.discount));
  if (t.rate > 0) h += posKv(t.incl ? 'Tax (' + t.rate + '%, included)' : 'Tax (' + t.rate + '%)', money(t.tax));
  h += '<div class="kv total"><span>Total</span><span>' + money(t.due) + '</span></div>';
  if (cart.method === 'Cash' && cart.received !== '') {
    const recv = num(cart.received);
    h += recv >= t.due ? '<div class="kv"><span class="muted">Change</span><strong class="green">' + money(r2(recv - t.due)) + '</strong></div>' : '<div class="kv"><span class="muted">Short by</span><strong class="red">' + money(r2(t.due - recv)) + '</strong></div>';
  }
  $('cSum').innerHTML = h;
  $('cCash').classList.toggle('hidden', cart.method !== 'Cash');
  const opts = Array.from(new Set([t.due, Math.ceil(t.due / 50) * 50, Math.ceil(t.due / 100) * 100, Math.ceil(t.due / 500) * 500, Math.ceil(t.due / 1000) * 1000])).filter((v) => v >= t.due && v > 0).sort((a, b) => a - b).slice(0, 4);
  $('cQuick').innerHTML = opts.map((v) => '<button class="chip" data-q="' + v + '">' + (v === t.due ? 'Exact' : money(v)) + '</button>').join('');
  $('cMsg').textContent = t.over ? 'Discount cannot exceed the subtotal' : '';
  $('cPay').textContent = 'Charge ' + money(t.due);
  $('cPay').disabled = cart.busy || !t.count || t.over;
}

/* ----- Checkout ----- */
async function doCheckout() {
  if (cart.busy) return;
  const t = calcTotals(), msg = $('cMsg');
  const fail = (m) => { msg.textContent = m; };
  if (!t.count) return fail('The cart is empty');
  if (t.over) return fail('Discount cannot exceed the subtotal');
  if (cart.discount !== '' && num(cart.discount) < 0) return fail('Discount cannot be negative');
  for (const l of t.lines) { if (!allowNegative() && l.q > num(l.p.Stock)) return fail('Not enough stock for ' + l.p.Name + ' (available ' + num(l.p.Stock) + ')'); }
  if (cart.method === 'Cash') {
    if (cart.received === '' || num(cart.received) < t.due) return fail('Cash received must be at least ' + money(t.due));
  }
  const payload = { items: t.lines.map((l) => ({ productId: l.p.ProductID, quantity: l.q })), discount: t.discount, paymentMethod: cart.method, amountPaid: cart.method === 'Cash' ? num(cart.received) : t.due };
  // Reuse the same key only for an identical retry; any change gets a new key.
  const sig = JSON.stringify(payload);
  if (!cart.key || sig !== cart.sig) { cart.key = newKey(); cart.sig = sig; }
  cart.busy = true; $('cPay').disabled = true; loading(true); msg.textContent = '';
  try {
    const r = await api('checkout', Object.assign({ idempotencyKey: cart.key }, payload));
    const txId = r.data.transactionId;
    resetCart();
    loading(false);
    await refresh();
    showSaleComplete(txId, r.data);
  } catch (e) {
    cart.busy = false; loading(false);
    if ($('cPay')) {
      $('cPay').disabled = false;
      msg.textContent = e.server ? e.message : e.message + ' The sale was NOT confirmed. You can tap Charge again (duplicates are blocked) or check Transactions first.';
    } else toast(e.message, 'err');
    if (e.server && /stock|available/i.test(e.message)) refresh();
  }
}
function showSaleComplete(txId, d) {
  const s = state.sales.find((x) => x.TransactionID === txId);
  const due = s ? r2(num(s.AmountPaid) - num(s.ChangeAmount)) : num(d.amountDue);
  openModal('Sale complete',
    '<div style="text-align:center;padding:6px 0 14px"><div style="width:56px;height:56px;margin:0 auto 8px;border-radius:50%;background:var(--green-l);color:var(--green-d);display:flex;align-items:center;justify-content:center">' + ic('check') + '</div>' +
    '<h2>' + money(due) + '</h2><div class="muted" style="font-size:.85rem">' + esc(txId) + '</div>' +
    (d.duplicate ? '<p class="note">This sale was already recorded earlier. No duplicate was created.</p>' : '') + '</div>' +
    (s ? posKv('Payment', esc(s.PaymentMethod)) + (s.PaymentMethod === 'Cash' ? posKv('Cash received', money(s.AmountPaid)) + posKv('Change', '<strong class="green">' + money(s.ChangeAmount) + '</strong>') : '') : '') +
    '<div class="grid2" style="margin-top:14px"><button class="btn" id="rcPrint"' + (s ? '' : ' disabled') + '>' + ic('print') + ' Print receipt</button><button class="btn btn-primary" id="rcNew">New sale</button></div>');
  $('rcPrint').onclick = () => App.printReceipt(txId);
  $('rcNew').onclick = closeModal;
}

/* ----- Receipts (shared with Transactions) ----- */
App.receiptHtml = function (txId) {
  const s = state.sales.find((x) => x.TransactionID === txId);
  if (!s) return '';
  const st = state.settings, items = state.saleItems.filter((i) => i.TransactionID === txId);
  const due = r2(num(s.AmountPaid) - num(s.ChangeAmount));
  const l = (a, b) => '<div class="l"><span>' + a + '</span><span>' + b + '</span></div>';
  return '<div class="rc"><h3>' + esc(st.BusinessName || 'Receipt') + '</h3>' +
    (st.BusinessAddress ? '<div class="c">' + esc(st.BusinessAddress) + '</div>' : '') + (st.BusinessContact ? '<div class="c">' + esc(st.BusinessContact) + '</div>' : '') + '<hr>' +
    '<div>Receipt: ' + esc(s.TransactionID) + '</div><div>Date: ' + esc(fmtDateTime(s.DateTime)) + '</div><div>Cashier: ' + esc(userName(s.CashierID)) + '</div><hr>' +
    items.map((i) => '<div>' + esc(i.ProductName) + '</div>' + l(num(i.Quantity) + ' x ' + money(i.UnitPrice), money(num(i.Quantity) * num(i.UnitPrice)))).join('') + '<hr>' +
    l('Subtotal', money(s.GrossAmount)) + (num(s.DiscountAmount) > 0 ? l('Discount', '-' + money(s.DiscountAmount)) : '') +
    (num(s.TaxAmount) > 0 ? l(st.TaxInclusive === 'true' ? 'Tax (included)' : 'Tax', money(s.TaxAmount)) : '') +
    '<div class="l" style="font-weight:bold;font-size:14px"><span>TOTAL</span><span>' + money(due) + '</span></div><hr>' +
    l('Payment', esc(s.PaymentMethod)) + (s.PaymentMethod === 'Cash' ? l('Cash', money(s.AmountPaid)) + l('Change', money(s.ChangeAmount)) : '') +
    (s.Status === 'Refunded' ? '<hr><div class="c"><strong>*** REFUNDED ***</strong></div>' : '') +
    '<hr><div class="c">' + esc(st.ReceiptFooter || 'Thank you!') + '</div></div>';
};
App.printReceipt = function (txId) {
  const h = App.receiptHtml(txId);
  if (!h) return toast('Receipt not found. Refresh and try again.', 'err');
  $('receipt').innerHTML = h;
  window.print(); // opens the browser print dialog (print or save as PDF)
};
App.showReceipt = function (txId) {
  const h = App.receiptHtml(txId);
  if (!h) return toast('Receipt not found', 'err');
  openModal('Receipt', '<div style="border:1px dashed var(--line);padding:14px;border-radius:12px;background:#fff">' + h + '</div><button class="btn btn-primary btn-block" id="rcPrint2">' + ic('print') + ' Print / Save as PDF</button>');
  $('rcPrint2').onclick = () => App.printReceipt(txId);
};