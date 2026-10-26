'use strict';
/* ===== Sales and expense reports ===== */
App.views.reports = function (el) {
  if (!isAdmin()) {
    el.innerHTML = '<h2>Reports</h2><div class="card">' + emptyState('alert', 'This section is for the owner/admin only.') + '</div>';
    return;
  }

  const today = todayKey();
  const u = App.ui.reports = App.ui.reports || { from: addDays(today, -29), to: today };
  if (App.ui.reportChart) { App.ui.reportChart.destroy(); App.ui.reportChart = null; }
  el.innerHTML = '<div class="spread"><h2>Reports</h2><button class="btn btn-sm" id="repRefresh">' + ic('refresh') + ' Refresh data</button></div>' +
    '<div class="grid2"><div class="field"><label for="repFrom">From</label><input id="repFrom" type="date" value="' + esc(u.from) + '"></div>' +
    '<div class="field"><label for="repTo">To</label><input id="repTo" type="date" value="' + esc(u.to) + '"></div></div>' +
    '<p class="msg" id="repMsg"></p><div id="repContent"></div>';

  const draw = () => {
    const from = u.from, to = u.to, msg = $('repMsg'), content = $('repContent');
    if (App.ui.reportChart) { App.ui.reportChart.destroy(); App.ui.reportChart = null; }
    if (!from || !to || from > to) {
      msg.textContent = 'Choose a valid date range (From must be on or before To).';
      content.innerHTML = '';
      return;
    }
    msg.textContent = '';
    const sales = state.sales.filter((s) => {
      const d = dayKey(s.DateTime);
      return d >= from && d <= to;
    });
    const expenses = state.expenses.filter((x) => {
      const d = dayKey(x.DateTime || x.Date || x.CreatedAt);
      return d >= from && d <= to;
    });
    const daily = Object.create(null), payments = Object.create(null), products = Object.create(null), salesById = Object.create(null);
    const saleIds = new Set();
    let salesTotal = 0, refunded = 0, completed = 0;
    sales.forEach((s) => {
      const date = dayKey(s.DateTime), isRefunded = s.Status === 'Refunded';
      saleIds.add(s.TransactionID);
      salesById[s.TransactionID] = s;
      if (isRefunded) { refunded++; return; }
      const total = Math.max(0, num(s.AmountPaid) - num(s.ChangeAmount));
      salesTotal += total;
      completed++;
      (daily[date] || (daily[date] = { sales: 0, expenses: 0, count: 0 })).sales += total;
      daily[date].count++;
      const method = s.PaymentMethod || 'Other';
      payments[method] = (payments[method] || 0) + total;
    });
    expenses.forEach((x) => {
      const date = dayKey(x.DateTime || x.Date || x.CreatedAt), amount = num(x.Amount);
      (daily[date] || (daily[date] = { sales: 0, expenses: 0, count: 0 })).expenses += amount;
    });
    state.saleItems.forEach((item) => {
      if (!saleIds.has(item.TransactionID)) return;
      const sale = salesById[item.TransactionID];
      if (!sale || sale.Status === 'Refunded') return;
      const id = item.ProductID || item.ProductName || 'Unknown';
      const p = products[id] || (products[id] = { name: item.ProductName || 'Unknown product', qty: 0, total: 0 });
      const qty = num(item.Quantity);
      p.qty += qty;
      p.total += qty * num(item.UnitPrice);
    });

    const expenseTotal = expenses.reduce((sum, x) => sum + num(x.Amount), 0);
    const net = salesTotal - expenseTotal;
    const days = Object.keys(daily).sort();
    days.forEach((d) => { daily[d].sales = r2(daily[d].sales); daily[d].expenses = r2(daily[d].expenses); });
    const productRows = Object.keys(products).map((id) => products[id]).sort((a, b) => b.total - a.total);
    const paymentRows = Object.keys(payments).sort().map((name) => [name, r2(payments[name])]);
    const stat = (label, value, cls) => '<div class="stat ' + (cls || '') + '"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div></div>';
    const dailyRows = days.slice(-120);
    content.innerHTML = '<div class="grid-cards">' + stat('Net sales', money(salesTotal), 'pos') + stat('Completed transactions', completed) +
      stat('Expenses', money(expenseTotal), expenseTotal ? 'neg' : '') + stat('Net after expenses', money(net), net >= 0 ? 'pos' : 'neg') + '</div>' +
      (refunded ? '<p class="note">' + refunded + ' refunded transaction' + (refunded === 1 ? '' : 's') + ' excluded from sales totals.</p>' : '') +
      '<div class="card"><div class="section-title"><h3>Sales and expenses</h3></div><div class="chart-box"><canvas id="repChart" aria-label="Sales and expenses chart"></canvas></div></div>' +
      '<div class="section-title"><h3>Daily summary</h3><button class="btn btn-sm" id="repDailyCsv">' + ic('download') + ' CSV</button></div>' +
      '<div class="card tbl-wrap"><table><thead><tr><th>Date</th><th class="num">Transactions</th><th class="num">Sales</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead><tbody>' +
      (dailyRows.length ? dailyRows.slice().reverse().map((d) => '<tr><td>' + esc(d) + '</td><td class="num">' + daily[d].count + '</td><td class="num">' + money(daily[d].sales) + '</td><td class="num">' + money(daily[d].expenses) + '</td><td class="num">' + money(daily[d].sales - daily[d].expenses) + '</td></tr>').join('') : '<tr><td colspan="5">No activity in this date range.</td></tr>') +
      '</tbody></table></div>' + (days.length > 120 ? '<p class="muted" style="font-size:.78rem">Showing the latest 120 active days; CSV includes the full range.</p>' : '') +
      '<div class="section-title"><h3>Sales by payment method</h3></div><div class="card tbl-wrap"><table><thead><tr><th>Payment method</th><th class="num">Sales</th></tr></thead><tbody>' +
      (paymentRows.length ? paymentRows.map((r) => '<tr><td>' + esc(r[0]) + '</td><td class="num">' + money(r[1]) + '</td></tr>').join('') : '<tr><td colspan="2">No sales in this date range.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="section-title"><h3>Best-selling products</h3><button class="btn btn-sm" id="repProductCsv">' + ic('download') + ' CSV</button></div><div class="card tbl-wrap"><table><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">Sales</th></tr></thead><tbody>' +
      (productRows.length ? productRows.slice(0, 100).map((p) => '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.qty + '</td><td class="num">' + money(p.total) + '</td></tr>').join('') : '<tr><td colspan="3">No product sales in this date range.</td></tr>') +
      '</tbody></table></div>';

    const dailyCsv = [['Date', 'Transactions', 'Sales (PHP)', 'Expenses (PHP)', 'Net (PHP)']].concat(days.map((d) => [d, daily[d].count, daily[d].sales, daily[d].expenses, r2(daily[d].sales - daily[d].expenses)]));
    $('repDailyCsv').onclick = () => downloadCSV('daily-report-' + from + '-to-' + to + '.csv', dailyCsv);
    $('repProductCsv').onclick = () => downloadCSV('product-report-' + from + '-to-' + to + '.csv', [['Product', 'Quantity', 'Sales (PHP)']].concat(productRows.map((p) => [p.name, p.qty, r2(p.total)])));

    const chartLabels = days.length > 90 ? Array.from(new Set(days.map((d) => d.slice(0, 7)))) : days;
    const chartSales = chartLabels.map(() => 0), chartExpenses = chartLabels.map(() => 0), chartIndex = Object.create(null);
    chartLabels.forEach((label, i) => { chartIndex[label] = i; });
    days.forEach((d) => {
      const index = chartIndex[days.length > 90 ? d.slice(0, 7) : d];
      chartSales[index] += daily[d].sales;
      chartExpenses[index] += daily[d].expenses;
    });
    chartSales.forEach((v, i) => { chartSales[i] = r2(v); chartExpenses[i] = r2(chartExpenses[i]); });
    if (typeof Chart === 'function' && chartLabels.length) {
      App.ui.reportChart = new Chart($('repChart').getContext('2d'), {
        type: 'line',
        data: { labels: chartLabels, datasets: [
          { label: 'Sales', data: chartSales, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)', fill: true, tension: .25 },
          { label: 'Expenses', data: chartExpenses, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.08)', fill: true, tension: .25 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true } } }
      });
    } else if (!chartLabels.length) {
      $('repChart').parentElement.innerHTML = '<div class="empty">No activity to chart in this date range.</div>';
    } else {
      $('repChart').parentElement.innerHTML = '<div class="empty">Chart unavailable. Check your connection and refresh.</div>';
    }
  };

  $('repFrom').onchange = (e) => { u.from = e.target.value; draw(); };
  $('repTo').onchange = (e) => { u.to = e.target.value; draw(); };
  $('repRefresh').onclick = refresh;
  draw();
};
