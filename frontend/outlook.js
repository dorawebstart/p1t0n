(function () {
  'use strict';
  // Fire outlook section: map of probabilities, KPIs, proof charts. Data: public/data/outlook/ (analysis/forecast.py).
  // Written with AI assistance (Claude Code) from the team's design; reviewed by Team P1t0n.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var PAL = ['#1b0c41', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746'];
  function hex(h) { var v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function pal(t) {
    t = Math.max(0, Math.min(1, t)); var n = PAL.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
    var a = hex(PAL[i]), b = hex(PAL[i + 1]);
    return [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(',');
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }

  if (!document.getElementById('ol-map') || typeof L === 'undefined') return;
  var map = L.map('ol-map', { worldCopyJump: true, zoomSnap: 0.25, minZoom: 1, scrollWheelZoom: false }).setView([20, 10], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 10, className: 'dark-map-tiles' }).addTo(map);
  var rows = [], byKey = {}, month = (new Date().getMonth() + 1) % 12 + 1;   // the coming month

  var Layer = L.GridLayer.extend({
    createTile: function (coords) {
      var tile = document.createElement('canvas'), size = this.getTileSize();
      tile.width = size.x; tile.height = size.y;
      var ctx = tile.getContext('2d'), origin = coords.scaleBy(size), z = coords.z;
      var nw = map.unproject(origin, z), se = map.unproject(origin.add(size), z);
      for (var i = 0; i < rows.length; i++) {
        var la = rows[i][0], lo = rows[i][1], p = rows[i][2] / 1000;
        if (p < 0.05) continue;
        if (la > nw.lat || la + 1 < se.lat || lo > se.lng || lo + 1 < nw.lng) continue;
        var p1 = map.project([la + 1, lo], z).subtract(origin), p2 = map.project([la, lo + 1], z).subtract(origin);
        var w = p2.x - p1.x, h = p2.y - p1.y, rgb = pal(p);
        if (w < 6) { ctx.fillStyle = 'rgba(' + rgb + ',' + (0.35 + 0.65 * p).toFixed(2) + ')'; ctx.fillRect(Math.floor(p1.x), Math.floor(p1.y), Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); continue; }
        var cx = p1.x + w / 2, cy = p1.y + h / 2, r = Math.min(w, h) * 0.5;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + rgb + ',1)'); g.addColorStop(0.35, 'rgba(' + rgb + ',0.82)');
        g.addColorStop(0.65, 'rgba(' + rgb + ',0.34)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
      }
      return tile;
    }
  });
  var layer = new Layer({ updateWhenZooming: false, keepBuffer: 2 }).addTo(map);

  map.on('click', function (e) {
    var ll = e.latlng.wrap(), la = Math.floor(ll.lat), lo = Math.floor(ll.lng), r = byKey[la + '_' + lo];
    var html = '<b>' + Math.abs(la) + '°' + (la >= 0 ? 'N' : 'S') + ', ' + Math.abs(lo) + '°' + (lo >= 0 ? 'E' : 'W') + '</b> · ' + FULL[month - 1] + '<br>' +
      (r ? 'Active fire month: <b>' + (r[2] / 10).toFixed(1) + '%</b><br>Expected hotspots: ' + r[3] : 'Probability below 2 %');
    L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
  });

  function load(m) {
    month = m;
    document.getElementById('ol-month-title').textContent = FULL[m - 1];
    Array.prototype.forEach.call(document.querySelectorAll('#ol-months .seg-btn'), function (b) { var on = +b.dataset.m === m; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    get('./public/data/outlook/2026-' + String(m).padStart(2, '0') + '.json').then(function (d) {
      rows = d; byKey = {};
      d.forEach(function (r) { byKey[r[0] + '_' + r[1]] = r; });
      var n = d.filter(function (r) { return r[2] >= 500; }).length;
      document.getElementById('ol-count').textContent = '· ' + n + ' cells ≥ 50 %';
      layer.redraw();
    });
  }
  var box = document.getElementById('ol-months');
  // buttons for the next 12 months, starting with the coming one
  for (var k = 0; k < 12; k++) {
    (function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn'; b.textContent = MONTHS[m - 1]; b.dataset.m = m;
      b.addEventListener('click', function () { load(m); });
      box.appendChild(b);
    })((month - 1 + k) % 12 + 1);
  }
  load(month);
  // reveal on scroll; Leaflet needs a size refresh once the section is on screen
  var revealEls = document.querySelectorAll('#outlook .reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); map.invalidateSize(); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    Array.prototype.forEach.call(revealEls, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('in-view'); });
  }
  setTimeout(function () { Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('in-view'); }); }, 6000);

  function kpi(id, items) {
    var el = document.getElementById(id); el.textContent = '';
    items.forEach(function (it) {
      var d = document.createElement('div'); d.className = 'ol-kpi';
      var b = document.createElement('b'); b.textContent = it[0];
      var s = document.createElement('span'); s.textContent = it[1];
      d.appendChild(b); d.appendChild(s); el.appendChild(d);
    });
  }
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e); return e;
  }
  function text(parent, x, y, t, anchor) { var e = svgEl('text', { x: x, y: y, 'text-anchor': anchor || 'middle' }, parent); e.textContent = t; return e; }

  get('./public/data/outlook/metrics.json').then(function (mt) {
    var t = mt.test, u = mt.ukraine_2026;
    document.getElementById('ol-formula').textContent =
      'e(c,y,m) = 1 if H(c,y,m) ≥ ' + mt.threshold + '\n' +
      'w(y)     = 0.5^((2025 − y) / ' + (mt.half_life_years === null ? '∞' : mt.half_life_years) + ')\n' +
      'p(c,m)   = (Σ w·e + ' + mt.prior_strength + '·p₀(m)) / (Σ w + ' + mt.prior_strength + ')\n' +
      'E(c,m)   = Σ w·H / Σ w';
    kpi('ol-kpis-test', [
      [t.auc.toFixed(2), 'ROC AUC (1 = perfect, 0.5 = coin)'],
      [(t.bss_vs_persistence * 100).toFixed(0) + '%', 'better than “same as last year” (Brier skill)'],
      [(t.bss_vs_climatology * 100).toFixed(1) + '%', 'better than plain 25-year average']
    ]);
    kpi('ol-kpis-ua', [
      [u.auc.toFixed(2), 'ROC AUC, ' + u.cells + ' cells × 10 months'],
      [(u.bss_vs_climatology * 100).toFixed(1) + '%', 'Brier skill vs plain average'],
      [pct(u.event_rate), 'of cell-months were active']
    ]);
    document.getElementById('ol-notes').textContent = mt.notes;
    var hs = mt.half_life_years === null ? '∞' : mt.half_life_years;
    document.getElementById('ol-choice').textContent = 'Chosen: half-life h = ' + hs + ' years, prior strength a = ' + mt.prior_strength + '.';
    var hl = [], pr = [], cell = {};
    mt.choice_grid.forEach(function (g) {
      var hk = g.half_life === null ? '∞' : g.half_life;
      if (hl.indexOf(hk) < 0) hl.push(hk);
      if (pr.indexOf(g.prior) < 0) pr.push(g.prior);
      cell[hk + '|' + g.prior] = g.brier;
    });
    var tb = document.createElement('table'), tr = document.createElement('tr'), th0 = document.createElement('th');
    th0.textContent = 'h ↓  a →'; tr.appendChild(th0);
    pr.forEach(function (a) { var th = document.createElement('th'); th.textContent = a; tr.appendChild(th); });
    tb.appendChild(tr);
    hl.forEach(function (hk) {
      var row = document.createElement('tr'), td0 = document.createElement('th');
      td0.textContent = hk; row.appendChild(td0);
      pr.forEach(function (a) {
        var td = document.createElement('td'), v = cell[hk + '|' + a];
        td.textContent = v === undefined ? '' : v.toFixed(4);
        if (String(hk) === String(hs) && a === mt.prior_strength) td.className = 'best';
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    document.getElementById('ol-grid').appendChild(tb);

    // Ukraine 2026 bars
    var s = document.getElementById('ol-ua'), W = 520, H = 240, L0 = 46, B = 200, T0 = 14;
    var max = Math.max.apply(null, u.monthly.map(function (r) { return Math.max(r.expected, r.observed); })) || 1;
    var bw = (W - L0 - 10) / u.monthly.length;
    [0, 0.5, 1].forEach(function (f) { var y = B - (B - T0) * f; svgEl('line', { x1: L0, x2: W - 6, y1: y, y2: y, stroke: 'rgba(255,255,255,.08)' }, s); text(s, L0 - 6, y + 4, Math.round(max * f / 1000) + 'k', 'end'); });
    u.monthly.forEach(function (r, i) {
      var x = L0 + i * bw + 4, he = (B - T0) * r.expected / max, ho = (B - T0) * r.observed / max;
      svgEl('rect', { x: x, y: B - he, width: bw / 2 - 4, height: he, fill: '#0072B2', rx: 2 }, s);
      svgEl('rect', { x: x + bw / 2 - 2, y: B - ho, width: bw / 2 - 4, height: ho, fill: '#E69F00', rx: 2 }, s);
      text(s, x + bw / 2 - 3, B + 16, MONTHS[i]);
    });
    svgEl('rect', { x: L0, y: 226, width: 10, height: 10, fill: '#0072B2' }, s); text(s, L0 + 16, 235, 'expected (forecast)', 'start');
    svgEl('rect', { x: L0 + 170, y: 226, width: 10, height: 10, fill: '#E69F00' }, s); text(s, L0 + 186, 235, 'observed 2026', 'start');

    // reliability
    var r = document.getElementById('ol-rel'), S = 190, X0 = 60, Y0 = 210;
    svgEl('line', { x1: X0, y1: Y0, x2: X0 + S, y2: Y0 - S, stroke: 'rgba(255,255,255,.25)', 'stroke-dasharray': '4 4' }, r);
    svgEl('line', { x1: X0, y1: Y0, x2: X0 + S, y2: Y0, stroke: 'rgba(255,255,255,.2)' }, r);
    svgEl('line', { x1: X0, y1: Y0, x2: X0, y2: Y0 - S, stroke: 'rgba(255,255,255,.2)' }, r);
    [0, 0.5, 1].forEach(function (f) { text(r, X0 + S * f, Y0 + 16, pct(f)); text(r, X0 - 8, Y0 - S * f + 4, pct(f), 'end'); });
    text(r, X0 + S / 2, Y0 + 30, 'forecast probability');
    var pts = t.reliability.map(function (b) { return [X0 + S * b.forecast, Y0 - S * b.observed, b]; });
    svgEl('polyline', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), fill: 'none', stroke: '#ff9e44', 'stroke-width': 2 }, r);
    pts.forEach(function (p) { var c = svgEl('circle', { cx: p[0], cy: p[1], r: 4 + Math.min(6, Math.log10(p[2].n)), fill: '#ff5e2b' }, r); var tt = svgEl('title', {}, c); tt.textContent = p[2].n + ' cell-months: forecast ' + pct(p[2].forecast) + ', observed ' + pct(p[2].observed); });
    var lx = X0 + S + 30;
    text(r, lx, 40, 'Brier score', 'start');
    text(r, lx, 58, 'model        ' + t.brier.toFixed(4), 'start');
    text(r, lx, 74, 'average      ' + t.brier_climatology.toFixed(4), 'start');
    text(r, lx, 90, 'last year    ' + t.brier_persistence.toFixed(4), 'start');
    text(r, lx, 116, 'lower = better', 'start');
    text(r, lx, 140, t.n.toLocaleString('en-US') + ' cell-months', 'start');
  }).catch(function () { document.getElementById('ol-notes').textContent = 'Outlook metrics are not available.'; });
})();
