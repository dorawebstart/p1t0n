/**
 * Harmonized Fire Calendar — Team P1t0n, NASA Space Apps Challenge 2026 (local event: Dnipro).
 * Design and first version: Mykhailo Revuzhenko (P1t0n). Rework with AI assistance (Claude).
 *
 * All data come through window.P1t0nAPI (api.js). This file never invents numbers:
 * if a file is missing, the UI says so.
 */
(function () {
  'use strict';

  var API = window.P1t0nAPI;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Inferno-like, perceptually uniform, colour-blind safe sequential scale (9 steps).
  var PALETTE = ['#1b0c41', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746'];
  var NODATA_COLOR = 'rgba(255,255,255,0.04)';
  var ANOMALY_Z = 2;

  var SERIES = {
    harmonized: { field: 'harmonized_count', label: 'Harmonized count', short: 'Harmonized (Suomi NPP scale)' },
    modis: { field: 'modis_count', label: 'Raw MODIS count', short: 'Raw MODIS (Terra + Aqua)' },
    viirs: { field: 'viirs_count', label: 'Raw VIIRS count', short: 'Raw VIIRS (Suomi NPP)' }
  };
  var CAL_COLUMNS = ['region_id', 'year', 'month', 'modis_count', 'viirs_count', 'harmonized_count', 'median_count', 'anomaly', 'p25_count', 'p75_count'];
  var FIRE_COLUMNS = ['date', 'lat', 'lon', 'frp', 'sensor', 'satellite', 'region_id'];

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    manifest: null,
    regions: [],
    regionId: null,
    rows: [],          // all calendar rows of the region, sorted
    from: null,        // 'YYYY-MM'
    to: null,
    series: 'harmonized',
    anomaliesOnly: false,
    selected: null,    // 'YYYY-MM'
    fireMonths: null,  // array of 'YYYY-MM' or null when unknown
    fires: [],         // points currently on the map (after filters)
    pointsFilter: 'all',
    scale: null,
    worldMonths: null, // months that have a world_cells file, or null when unknown
    layerPref: 'world',// layer the user asked for: 'world' | 'ukraine'
    layer: null,       // layer actually drawn
    cells: null,       // {list: [[lat, lon, count]], byKey: {}, lo, hi, month}
    lastFit: null
  };

  var map = null;
  var firesLayer = null;
  var cellsLayer = null;
  var canvasRenderer = null;
  var bgPaused = false; // the background globe stops rendering while the 3D chart is on screen
  var WORLD_VIEW = [[-60, -180], [75, 180]];

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ym(y, m) { return y + '-' + pad2(m); }
  function ymKey(row) { return ym(row.year, row.month); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fmtInt(v) { return isNum(v) ? Math.round(v).toLocaleString('en-US') : 'n/a'; }
  function fmtNum(v, d) {
    if (!isNum(v)) return 'n/a';
    return v.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: 0 });
  }
  function fmtZ(v) { return isNum(v) ? (v > 0 ? '+' : '') + v.toFixed(2) : 'n/a'; }
  // Compact numbers for axes: 950, 12k, 1.6M
  function fmtCompact(v) {
    if (!isNum(v)) return '';
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v * 100) / 100);
  }
  // Interpolate the inferno palette at t in [0, 1].
  function paletteAt(t) {
    t = Math.max(0, Math.min(1, isNum(t) ? t : 0));
    var n = PALETTE.length - 1;
    var i = Math.min(n - 1, Math.floor(t * n));
    var f = t * n - i;
    var a = hexRgb(PALETTE[i]), b = hexRgb(PALETTE[i + 1]);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }
  function hexRgb(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function monthLabel(key) {
    if (!key) return '—';
    var p = key.split('-');
    return MONTHS_LONG[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  // Months from manifest.preliminary_from on are near-real-time (NRT) data; default: 2026.
  function prelimFrom() {
    var pf = state.manifest && state.manifest.preliminary_from;
    return /^\d{4}-\d{2}$/.test(String(pf)) ? pf : '2026-01';
  }
  function isPrelim(key) { return key >= prelimFrom(); }
  function isPrelimYear(y) { return ym(y, 12) >= prelimFrom(); }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function regionName(id) {
    for (var i = 0; i < state.regions.length; i++) if (state.regions[i].id === id) return state.regions[i].name;
    return id || '—';
  }
  function regionById(id) {
    for (var i = 0; i < state.regions.length; i++) if (state.regions[i].id === id) return state.regions[i];
    return null;
  }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function seriesValue(row) {
    if (!row) return null;
    var v = row[SERIES[state.series].field];
    return isNum(v) ? v : null;
  }
  function rowsInRange() {
    var from = state.from, to = state.to;
    return state.rows.filter(function (r) { var k = ymKey(r); return k >= from && k <= to; });
  }
  function findRow(key) {
    for (var i = 0; i < state.rows.length; i++) if (ymKey(state.rows[i]) === key) return state.rows[i];
    return null;
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadCSV(columns, rows, filename) {
    var lines = [columns.join(',')];
    rows.forEach(function (r) {
      lines.push(columns.map(function (c) { return csvCell(r[c]); }).join(','));
    });
    downloadBlob(new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), filename);
  }

  /* ---------- colour scale (square-root bins, labelled with real numbers) ---------- */

  function buildScale(values) {
    var vals = values.filter(isNum);
    if (!vals.length) return null;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var n = PALETTE.length;
    var sMin = Math.sqrt(Math.max(0, min));
    var sMax = Math.sqrt(Math.max(0, max));
    var edges = [];
    for (var i = 0; i <= n; i++) {
      var s = sMin + (sMax - sMin) * (i / n);
      edges.push(s * s);
    }
    return {
      min: min, max: max, edges: edges,
      color: function (v) {
        if (!isNum(v)) return NODATA_COLOR;
        if (max === min) return PALETTE[n - 1];
        var t = (Math.sqrt(Math.max(0, v)) - sMin) / (sMax - sMin);
        var idx = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
        return PALETTE[idx];
      }
    };
  }

  function renderLegend(scale) {
    var box = $('legend-scale');
    box.textContent = '';
    if (!scale) { box.textContent = 'No data'; return; }
    // compact labels (973k, 1.6M) on every other step so large world numbers do not overlap
    function short(v) {
      if (!isNum(v)) return '';
      var a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e4) return Math.round(v / 1e3) + 'k';
      return fmtInt(v);
    }
    PALETTE.forEach(function (c, i) {
      var item = document.createElement('div');
      item.className = 'legend-step';
      var sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = c;
      var lab = document.createElement('span');
      lab.className = 'legend-num';
      lab.textContent = i % 2 === 0 ? short(scale.edges[i]) : '';
      item.appendChild(sw);
      item.appendChild(lab);
      item.title = fmtInt(scale.edges[i]) + ' – ' + fmtInt(scale.edges[i + 1]) + ' hotspots';
      box.appendChild(item);
    });
    var end = document.createElement('div');
    end.className = 'legend-step legend-end';
    var lab2 = document.createElement('span');
    lab2.className = 'legend-num';
    lab2.textContent = short(scale.max);
    end.appendChild(lab2);
    box.appendChild(end);
  }

  /* ---------- startup ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    safe(initBackground);
    safe(initSpotlightCards);
    safe(initScrollSpy);
    safe(initMap);
    bindEvents();
    loadAll();
  });

  function safe(fn) {
    try { fn(); } catch (e) { if (window.console) console.warn('[P1t0n] optional feature failed:', e); }
  }

  function loadAll() {
    if (!API) {
      setStatus('error', 'Data module missing');
      showCalendarEmpty('Data module (api.js) could not be loaded.');
      return;
    }
    // Charts of the Problem and Method sections load on their own; a missing file only hides that chart.
    safe(initRawChart);
    safe(initValidationChart);
    safe(function () { responsiveChart($('chart-noise'), drawNoiseChart); });
    API.getCalendar('UKR').then(function (rows) { safe(function () { initAugustChart(rows); }); });

    Promise.all([API.getManifest(), API.getRegions(), API.getMetrics(), API.getCoefficients()])
      .then(function (res) {
        var manifest = res[0], regions = res[1];
        state.manifest = manifest;
        applyManifest(manifest);
        renderMetrics(res[2]);
        state.metrics = res[2];
        safe(updateValidationBadge);
        renderCoefficients(res[3]);
        setupRegions(regions);
        return loadCalendar();
      })
      .catch(function (e) {
        if (window.console) console.error(e);
        showCalendarEmpty('No data for this selection.');
      });
  }

  function applyManifest(m) {
    if (!m) {
      setStatus('error', 'Data index missing');
      return;
    }
    if (m.fake === true) {
      $('demo-banner').hidden = false;
      setStatus('demo', 'Demo data');
    } else {
      var d = m.generated_at ? String(m.generated_at).slice(0, 10) : '';
      setStatus('live', 'Pipeline data' + (d ? ' · ' + d : ''));
    }
    if (Array.isArray(m.world_cell_months)) {
      state.worldMonths = m.world_cell_months.filter(function (s) { return /^\d{4}-\d{2}$/.test(s); }).sort();
    }
    if (Array.isArray(m.fire_months)) {
      state.fireMonths = m.fire_months.filter(function (s) { return /^\d{4}-\d{2}$/.test(s); }).sort();
    } else if (Array.isArray(m.files)) {
      state.fireMonths = m.files.map(function (f) {
        var mt = /^fires\/UA\/(\d{4}-\d{2})\.json$/.exec(f);
        return mt ? mt[1] : null;
      }).filter(Boolean).sort();
    }
  }

  function setStatus(kind, text) {
    var badge = $('data-status-badge');
    badge.className = 'status-pill status-' + kind;
    badge.querySelector('.status-text').textContent = text;
  }

  /* ---------- regions ---------- */

  function setupRegions(regions) {
    var select = $('region-select');
    select.textContent = '';
    state.regions = Array.isArray(regions) ? regions.filter(function (r) { return r && r.id; }) : [];
    if (!state.regions.length) {
      var o = document.createElement('option');
      o.value = '';
      o.textContent = 'No regions available';
      select.appendChild(o);
      select.disabled = true;
      return;
    }
    // Groups: Ukraine, Ukrainian oblasts, World & countries (World first, then A–Z by name).
    function byName(a, b) { return String(a.name || a.id).localeCompare(String(b.name || b.id), 'en'); }
    var ua = state.regions.filter(function (r) { return r.id === 'UKR'; });
    var oblasts = state.regions.filter(function (r) { return r.id.indexOf('UKR-') === 0; }).sort(byName);
    var world = state.regions.filter(function (r) { return r.id === 'WORLD'; });
    var countries = state.regions.filter(function (r) {
      return r.id !== 'UKR' && r.id !== 'WORLD' && r.id.indexOf('UKR-') !== 0;
    }).sort(byName);
    [['Ukraine', ua], ['Ukrainian oblasts', oblasts], ['World & countries', world.concat(countries)]].forEach(function (g) {
      if (!g[1].length) return;
      var og = document.createElement('optgroup');
      og.label = g[0];
      g[1].forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name || r.id;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
    // The site opens on the whole world (the product is global); Ukraine is one click away.
    var has = function (id) { return state.regions.some(function (r) { return r.id === id; }); };
    state.regionId = has('WORLD') ? 'WORLD' : (has('UKR') ? 'UKR' : state.regions[0].id);
    select.value = state.regionId;
  }

  /* ---------- calendar ---------- */

  function loadCalendar() {
    if (!state.regionId) { showCalendarEmpty('No data for this selection.'); return Promise.resolve(); }
    var id = state.regionId;
    return API.getCalendar(id).then(function (rows) {
      if (id !== state.regionId) return;
      var clean = Array.isArray(rows) ? rows.filter(function (r) {
        return r && isNum(r.year) && isNum(r.month) && r.month >= 1 && r.month <= 12;
      }) : [];
      clean.sort(function (a, b) { return a.year - b.year || a.month - b.month; });
      state.rows = clean;

      if (!clean.length) {
        state.from = state.to = state.selected = null;
        showCalendarEmpty('No data for this selection.');
        updateReadout();
        loadFires();
        return;
      }
      var first = ymKey(clean[0]), last = ymKey(clean[clean.length - 1]);
      var fromIn = $('month-from'), toIn = $('month-to');
      setText('to-help', 'Last month shown. Data: ' + first + ' … ' + last + '.');
      // Keep the user's range if it still fits; otherwise use the full range.
      // A range that ran to the end of the previous zone's data keeps running to the end.
      if (state.to && state.to === state.lastRowKey) state.to = last;
      state.lastRowKey = last;
      if (!state.from || state.from < first || state.from > last) state.from = first;
      if (!state.to || state.to > last || state.to < first) state.to = last;
      if (state.from > state.to) { state.from = first; state.to = last; }
      fromIn.value = state.from;
      toIn.value = state.to;
      if (!state.selected || state.selected < state.from || state.selected > state.to || !findRow(state.selected)) {
        var inRange = rowsInRange();
        state.selected = inRange.length ? ymKey(inRange[inRange.length - 1]) : null;
      }
      renderCalendar();
      loadFires();
    });
  }

  function showCalendarEmpty(msg) {
    $('heatmap-grid').textContent = '';
    $('heatmap-grid').hidden = true;
    var e = $('heatmap-empty');
    e.textContent = msg || 'No data for this selection.';
    e.hidden = false;
    renderLegend(null);
    state.scale = null;
  }

  function seriesMedians(rowsAll) {
    // Harmonized: the contract's median_count. Raw series: median of that series over all years of the region.
    var med = [];
    for (var m = 1; m <= 12; m++) {
      var monthRows = rowsAll.filter(function (r) { return r.month === m; });
      if (state.series === 'harmonized') {
        var mc = null;
        for (var i = 0; i < monthRows.length; i++) if (isNum(monthRows[i].median_count)) { mc = monthRows[i].median_count; break; }
        med.push(mc);
      } else {
        med.push(median(monthRows.map(seriesValue).filter(isNum)));
      }
    }
    return med;
  }

  function renderCalendar() {
    var grid = $('heatmap-grid');
    hideTooltip();
    grid.textContent = '';

    var shown = rowsInRange();
    var values = shown.map(seriesValue);
    var hasValues = values.some(isNum);
    setText('heatmap-title', regionName(state.regionId) + ' — ' + SERIES[state.series].short);
    setText('legend-title', SERIES[state.series].label + ' per month');

    if (!shown.length || !hasValues) {
      showCalendarEmpty('No data for this selection.');
      updateReadout();
      return;
    }
    grid.hidden = false;
    $('heatmap-empty').hidden = true;

    var medians = seriesMedians(state.rows);
    var scale = buildScale(values.concat(medians));
    state.scale = scale;
    renderLegend(scale);

    var corner = document.createElement('div');
    corner.className = 'hm-header-cell';
    corner.textContent = 'Year';
    grid.appendChild(corner);
    MONTHS.forEach(function (m) {
      var th = document.createElement('div');
      th.className = 'hm-header-cell';
      th.textContent = m;
      grid.appendChild(th);
    });

    var fy = parseInt(state.from.slice(0, 4), 10);
    var ty = parseInt(state.to.slice(0, 4), 10);
    for (var y = ty; y >= fy; y--) {
      var yl = document.createElement('div');
      yl.className = 'hm-year-label';
      yl.textContent = String(y) + (isPrelimYear(y) ? '*' : '');
      if (isPrelimYear(y)) yl.title = 'Preliminary near-real-time data from ' + prelimFrom();
      grid.appendChild(yl);

      for (var m = 1; m <= 12; m++) {
        var key = ym(y, m);
        var cell = document.createElement('div');
        cell.className = 'hm-cell';
        var inRange = key >= state.from && key <= state.to;
        var row = inRange ? findRow(key) : null;
        var v = seriesValue(row);

        if (!row || !isNum(v)) {
          cell.classList.add('nodata');
          cell.style.background = NODATA_COLOR;
          if (!inRange) cell.classList.add('outside');
        } else {
          cell.style.background = scale.color(v);
          cell.tabIndex = 0;
          cell.setAttribute('role', 'button');
          cell.setAttribute('data-key', key);
          cell.setAttribute('aria-label', monthLabel(key) + ': ' + fmtInt(v));
          var z = row.anomaly;
          var isAnom = isNum(z) && Math.abs(z) > ANOMALY_Z;
          if (isAnom) cell.classList.add(z > 0 ? 'anomaly-high' : 'anomaly-low');
          if (state.anomaliesOnly && !isAnom) cell.classList.add('dimmed');
          if (key === state.selected) cell.classList.add('selected');
          attachCellEvents(cell, key, row);
        }
        grid.appendChild(cell);
      }
    }

    // Median row
    var ml = document.createElement('div');
    ml.className = 'hm-year-label hm-median-label';
    ml.textContent = 'Median';
    ml.title = state.series === 'harmonized'
      ? 'Median of the harmonized count for each month over all years'
      : 'Median of this raw series for each month over all years with data';
    grid.appendChild(ml);
    medians.forEach(function (mv, i) {
      var c = document.createElement('div');
      c.className = 'hm-cell hm-median' + (isNum(mv) ? '' : ' nodata');
      c.style.background = isNum(mv) ? scale.color(mv) : NODATA_COLOR;
      c.title = MONTHS_LONG[i] + ' median: ' + fmtInt(mv);
      grid.appendChild(c);
    });

    updateReadout();
  }

  function tooltipContent(key, row) {
    var frag = document.createDocumentFragment();
    var title = document.createElement('strong');
    title.textContent = monthLabel(key) + ' · ' + regionName(state.regionId);
    frag.appendChild(title);
    var lines = [
      ['Harmonized', fmtInt(row.harmonized_count)],
      ['MODIS', fmtInt(row.modis_count)],
      ['VIIRS (SNPP)', fmtInt(row.viirs_count)],
      ['Median', fmtInt(row.median_count)],
      ['z', fmtZ(row.anomaly)]
    ];
    lines.forEach(function (l) {
      var d = document.createElement('div');
      d.textContent = l[0] + ': ' + l[1];
      frag.appendChild(d);
    });
    if (isPrelim(key)) {
      var p = document.createElement('div');
      p.className = 'tt-note';
      p.textContent = 'Preliminary (near-real-time) data';
      frag.appendChild(p);
    }
    return frag;
  }

  function showTooltip(x, y, key, row) {
    var tt = $('heatmap-tooltip');
    tt.textContent = '';
    tt.appendChild(tooltipContent(key, row));
    tt.classList.remove('hidden');
    var w = tt.offsetWidth, h = tt.offsetHeight;
    var left = Math.min(x + 14, window.innerWidth - w - 8);
    var top = y + 14 + h > window.innerHeight ? y - h - 10 : y + 14;
    tt.style.left = Math.max(8, left) + 'px';
    tt.style.top = Math.max(8, top) + 'px';
  }
  function hideTooltip() { var tt = $('heatmap-tooltip'); if (tt) tt.classList.add('hidden'); }

  function attachCellEvents(cell, key, row) {
    cell.addEventListener('mousemove', function (e) { showTooltip(e.clientX, e.clientY, key, row); });
    cell.addEventListener('mouseleave', hideTooltip);
    function choose(e) {
      e.stopPropagation();
      selectMonth(key);
      // Tap support: show the tooltip next to the tapped cell.
      var target = $('heatmap-grid').querySelector('.hm-cell.selected') || cell;
      var r = target.getBoundingClientRect();
      showTooltip(r.right, r.top, key, row);
    }
    cell.addEventListener('click', choose);
    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(e); }
    });
  }

  function selectMonth(key) {
    state.selected = key;
    var cells = $('heatmap-grid').querySelectorAll('.hm-cell.selected');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('selected');
    var sel = $('heatmap-grid').querySelector('.hm-cell[data-key="' + key + '"]');
    if (sel) sel.classList.add('selected');
    updateReadout();
    loadFires();
  }

  function updateReadout() {
    var key = state.selected;
    var row = key ? findRow(key) : null;
    setText('kpi-region-name', regionName(state.regionId));
    setText('kpi-value-label', SERIES[state.series].label);

    if (!row) {
      ['kpi-period', 'kpi-value', 'kpi-anomaly', 'ro-value', 'ro-median', 'ro-z', 'ro-range', 'ro-noise', 'val-modis', 'val-viirs', 'val-harm']
        .forEach(function (id) { setText(id, '—'); });
      setText('insp-date', regionName(state.regionId));
      setText('insp-summary', state.rows.length ? 'Select a cell in the calendar.' : 'No data for this selection.');
      setText('kpi-anomaly-desc', 'vs median of the month');
      ['bar-modis', 'bar-viirs', 'bar-harm'].forEach(function (id) { $(id).style.width = '0'; });
      return;
    }

    var v = seriesValue(row);
    var medians = seriesMedians(state.rows);
    var med = medians[row.month - 1];
    var z = row.anomaly;

    setText('kpi-period', key);
    setText('kpi-value', fmtInt(v));
    setText('kpi-value-sub', isPrelim(key) ? 'preliminary (near-real-time)' : 'hotspots in the month');
    var kz = $('kpi-anomaly');
    kz.textContent = isNum(z) ? fmtZ(z) + 'σ' : 'n/a';
    kz.classList.toggle('is-anomaly', isNum(z) && Math.abs(z) > ANOMALY_Z);
    setText('kpi-anomaly-desc', !isNum(z) ? 'not available'
      : z > ANOMALY_Z ? 'well above the usual level'
      : z < -ANOMALY_Z ? 'well below the usual level'
      : 'within the usual range');

    setText('insp-date', monthLabel(key) + ' · ' + regionName(state.regionId) + ' · ' + SERIES[state.series].short);
    setText('ro-value', fmtInt(v));
    setText('ro-median', fmtInt(med));
    setText('ro-z', isNum(z) ? fmtZ(z) + (state.series === 'harmonized' ? '' : ' (harmonized)') : 'n/a');
    if (isNum(row.p25_count) && isNum(row.p75_count)) {
      setText('ro-range', fmtInt(row.p25_count) + ' – ' + fmtInt(row.p75_count) + (state.series === 'harmonized' ? '' : ' (harmonized)'));
    } else {
      setText('ro-range', 'not available in this data');
    }
    setText('ro-noise', isNum(v) && v > 0 ? '± ' + fmtNum(100 / Math.sqrt(v), 1) + ' %' : 'n/a');

    var summary;
    if (!isNum(v)) summary = 'This series has no value for the selected month (raw VIIRS starts in 2012).';
    else if (!isNum(med)) summary = 'No median available for this month.';
    else {
      var ratio = med > 0 ? v / med : null;
      summary = fmtInt(v) + ' hotspots vs a median of ' + fmtInt(med) +
        (ratio !== null ? ' (' + fmtNum(ratio, 2) + '× the median).' : '.');
    }
    setText('insp-summary', summary);

    var modis = row.modis_count, viirs = row.viirs_count, harm = row.harmonized_count;
    var maxBar = Math.max(1, isNum(modis) ? modis : 0, isNum(viirs) ? viirs : 0, isNum(harm) ? harm : 0);
    [['modis', modis], ['viirs', viirs], ['harm', harm]].forEach(function (p) {
      $('bar-' + p[0]).style.width = (isNum(p[1]) ? (p[1] / maxBar) * 100 : 0) + '%';
      setText('val-' + p[0], fmtInt(p[1]));
    });
  }

  /* ---------- downloads: calendar ---------- */

  function exportCalendarCSV() {
    var rows = rowsInRange();
    if (!rows.length) { alert('No data for this selection.'); return; }
    var cols = CAL_COLUMNS.filter(function (c) {
      if (c !== 'p25_count' && c !== 'p75_count') return true;
      return rows.some(function (r) { return r[c] !== undefined; });
    });
    downloadCSV(cols, rows, 'P1t0n_calendar_' + state.regionId + '_' + state.from + '_' + state.to + '.csv');
  }

  function exportCalendarPNG() {
    var rows = rowsInRange();
    var scale = state.scale;
    if (!rows.length || !scale) { alert('No data for this selection.'); return; }

    var fy = parseInt(state.from.slice(0, 4), 10);
    var ty = parseInt(state.to.slice(0, 4), 10);
    var nYears = ty - fy + 1;
    var cw = 44, ch = 22, gap = 2, left = 70, top = 96;
    var gridW = 12 * (cw + gap);
    var width = left + gridW + 30;
    var height = top + (nYears + 1) * (ch + gap) + 24 + 120;
    var dpr = 2;
    var canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 18px Inter, Arial, sans-serif';
    ctx.fillText('Harmonized Fire Calendar — ' + regionName(state.regionId), 20, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Inter, Arial, sans-serif';
    ctx.fillText(SERIES[state.series].short + ' · ' + state.from + ' to ' + state.to + ' · hotspots per month', 20, 52);
    if (state.manifest && state.manifest.fake === true) {
      ctx.fillStyle = '#fca50a';
      ctx.fillText('DEMO DATA — synthetic numbers', 20, 72);
    }

    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    MONTHS.forEach(function (m, i) { ctx.fillText(m, left + i * (cw + gap) + cw / 2, top - 8); });

    var medians = seriesMedians(state.rows);
    var yPos = top;
    for (var y = ty; y >= fy; y--) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(String(y) + (isPrelimYear(y) ? '*' : ''), left - 8, yPos + ch / 2 + 4);
      for (var m = 1; m <= 12; m++) {
        var key = ym(y, m);
        var x = left + (m - 1) * (cw + gap);
        var row = (key >= state.from && key <= state.to) ? findRow(key) : null;
        var v = seriesValue(row);
        ctx.fillStyle = isNum(v) ? scale.color(v) : '#14161c';
        ctx.fillRect(x, yPos, cw, ch);
        if (row && isNum(v) && isNum(row.anomaly) && Math.abs(row.anomaly) > ANOMALY_Z) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          if (row.anomaly < 0) ctx.setLineDash([3, 2]);
          ctx.strokeRect(x + 1, yPos + 1, cw - 2, ch - 2);
          ctx.setLineDash([]);
        }
      }
      yPos += ch + gap;
    }
    yPos += 6;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('Median', left - 8, yPos + ch / 2 + 4);
    medians.forEach(function (mv, i) {
      ctx.fillStyle = isNum(mv) ? scale.color(mv) : '#14161c';
      ctx.fillRect(left + i * (cw + gap), yPos, cw, ch);
    });
    yPos += ch + 30;

    // Numeric legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(SERIES[state.series].label + ' per month', left, yPos - 8);
    var sw = gridW / PALETTE.length;
    PALETTE.forEach(function (c, i) {
      ctx.fillStyle = c;
      ctx.fillRect(left + i * sw, yPos, sw - 1, 12);
    });
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i <= PALETTE.length; i += 3) {
      ctx.fillText(fmtInt(scale.edges[i]), left + i * sw, yPos + 26);
    }
    yPos += 46;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, Arial, sans-serif';
    ctx.fillText('Blue outline: |z| > 2 (dashed = below median). * preliminary from ' + prelimFrom() + '. Source: NASA FIRMS. Team P1t0n.', 20, yPos);

    canvas.toBlob(function (blob) {
      if (blob) downloadBlob(blob, 'P1t0n_calendar_' + state.regionId + '_' + state.series + '_' + state.from + '_' + state.to + '.png');
    }, 'image/png');
  }

  /* ---------- metrics & coefficients ---------- */

  function renderMetrics(metrics) {
    var rows = document.querySelectorAll('#metrics-table tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-key');
      var block = metrics && metrics[key] && typeof metrics[key] === 'object' ? metrics[key] : null;
      var cells = rows[i].querySelectorAll('td');
      if (!block) {
        // One honest message instead of four invented numbers.
        for (var k = cells.length - 1; k > 0; k--) rows[i].removeChild(cells[k]);
        cells[0].colSpan = 4;
        cells[0].textContent = 'pending validation';
        cells[0].className = 'pending pending-row';
        continue;
      }
      for (var j = 0; j < cells.length; j++) {
        var mk = cells[j].getAttribute('data-m');
        var val = block ? block[mk] : null;
        if (!block) {
          cells[j].textContent = 'pending validation';
          cells[j].className = 'pending';
        } else if (isNum(val)) {
          // mae: hotspots per month; *_pct: percent; r2: unitless
          cells[j].textContent = /_pct$/.test(mk)
            ? (mk === 'bias_pct' && val > 0 ? '+' : '') + val.toFixed(1) + ' %'
            : mk === 'r2' ? val.toFixed(2) : Math.round(val).toLocaleString('en-US');
          cells[j].className = '';
        } else {
          cells[j].textContent = 'n/a';
          cells[j].className = 'pending';
        }
      }
    }
    var raw = [];
    ['ukraine', 'world'].forEach(function (k) {
      var b = metrics && metrics[k] && metrics[k].raw_modis;
      if (b && isNum(b.r2) && isNum(b.bias_pct)) {
        raw.push((k === 'ukraine' ? 'Ukraine' : 'World') + ': R² ' + b.r2.toFixed(2) + ', bias ' + b.bias_pct.toFixed(1) + ' %');
      }
    });
    setText('metrics-raw', raw.length ? 'For comparison, raw MODIS without harmonization — ' + raw.join('; ') + '.' : '');
    setText('metrics-reference', metrics && metrics.viirs_reference ? 'VIIRS reference: ' + metrics.viirs_reference : '');
    var notes = metrics && metrics.notes ? metrics.notes : 'Validation results are not published yet.';
    if (metrics && metrics.fake === true) notes = 'Demo values, not real validation. ' + notes;
    setText('metrics-notes', notes);
  }

  function renderCoefficients(coefs) {
    var table = $('coef-table');
    var missing = $('coef-missing');
    var list = Array.isArray(coefs) ? coefs.filter(function (c) { return c && isNum(c.month); }) : [];
    if (!list.length) {
      table.hidden = true;
      missing.hidden = false;
      var cc = $('chart-coef');
      if (cc && cc.parentNode) cc.parentNode.hidden = true;
      return;
    }
    list.sort(function (a, b) { return a.month - b.month; });
    var tbody = table.querySelector('tbody');
    tbody.textContent = '';
    list.forEach(function (c) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = MONTHS_LONG[c.month - 1] || String(c.month);
      var a = document.createElement('td');
      a.textContent = isNum(c.k_aqua) ? c.k_aqua.toFixed(2) : 'n/a';
      var t = document.createElement('td');
      t.textContent = isNum(c.k_terra) ? c.k_terra.toFixed(2) : 'n/a';
      tr.appendChild(th); tr.appendChild(a); tr.appendChild(t);
      tbody.appendChild(tr);
    });
    table.hidden = false;
    missing.hidden = true;
    safe(function () { drawCoefChart(list); });
  }

  /* ---------- map ---------- */

  function initMap() {
    if (typeof L === 'undefined') {
      $('map-block').hidden = true;
      $('map-unavailable').hidden = false;
      return;
    }
    map = L.map('map', { center: [20, 10], zoom: 2, minZoom: 1, maxZoom: 14, zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false, worldCopyJump: true });
    // Trackpad pinch arrives as many small wheel events with ctrlKey (Ctrl + mouse wheel too): zoom the
    // map, not the page. Small deltas are accumulated so a slow pinch still zooms in 0.25 steps
    // (a single event alone would be snapped back). Plain wheel keeps scrolling the page.
    // Touch pinch on phones is Leaflet's own touchZoom.
    var pinchAcc = 0;
    function zoomBy(dz, pt) {
      var z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + dz));
      if (z !== map.getZoom()) map.setZoomAround(pt, z, { animate: false });
    }
    map.getContainer().addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
      pinchAcc += -dy * 0.01;
      var steps = pinchAcc > 0 ? Math.floor(pinchAcc / 0.25) : Math.ceil(pinchAcc / 0.25);
      if (steps !== 0) {
        pinchAcc -= steps * 0.25;
        zoomBy(steps * 0.25, map.mouseEventToContainerPoint(e));
      }
    }, { passive: false });
    // Safari (macOS) sends pinch as gesture events: zoom the map instead of the page.
    var gestureStartZoom = null;
    map.getContainer().addEventListener('gesturestart', function (e) { e.preventDefault(); gestureStartZoom = map.getZoom(); });
    map.getContainer().addEventListener('gesturechange', function (e) {
      e.preventDefault();
      if (gestureStartZoom === null || !e.scale) return;
      var target = Math.round((gestureStartZoom + Math.log2(e.scale)) * 4) / 4;
      zoomBy(target - map.getZoom(), map.getSize().divideBy(2));
    });
    map.getContainer().addEventListener('gestureend', function (e) { e.preventDefault(); gestureStartZoom = null; });
    // Zoom level readout and "reset view" under the +/- buttons.
    var ZoomInfo = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'leaflet-bar zoom-info');
        var btn = L.DomUtil.create('a', 'zoom-reset', box);
        btn.href = '#';
        btn.setAttribute('role', 'button');
        btn.title = 'Reset view to the selected zone';
        btn.setAttribute('aria-label', 'Reset map view');
        btn.textContent = '⟲';
        var lvl = L.DomUtil.create('span', 'zoom-level', box);
        lvl.title = 'Current zoom level';
        function upd() { lvl.textContent = 'z ' + (Math.round(map.getZoom() * 4) / 4).toString(); }
        map.on('zoomend', upd);
        upd();
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(btn, 'click', function (ev) { L.DomEvent.preventDefault(ev); fitMap(true); });
        return box;
      }
    });
    new ZoomInfo().addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    canvasRenderer = L.canvas({ padding: 0.5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      className: 'dark-map-tiles'
    }).addTo(map);
    firesLayer = L.layerGroup().addTo(map);
    cellsLayer = createCellsLayer();
    map.on('click', onMapClick);
    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { map.invalidateSize(); fitMap(true); }, 200);
    });
  }

  // World cells drawn on canvas tiles: each tile draws only the cells it covers, so ~9k cells stay smooth.
  function createCellsLayer() {
    var Layer = L.GridLayer.extend({
      createTile: function (coords) {
        var tile = document.createElement('canvas');
        var size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        var c = state.cells;
        if (!c || !c.list.length) return tile;
        var ctx = tile.getContext('2d');
        var origin = coords.scaleBy(size);
        var z = coords.z;
        var nw = map.unproject(origin, z), se = map.unproject(origin.add(size), z);
        var deg = c.deg;
        var logLo = Math.log(c.lo), span = Math.log(c.hi) - logLo;
        ctx.globalAlpha = 0.88;
        for (var i = 0; i < c.list.length; i++) {
          var lat = c.list[i][0], lon = c.list[i][1], n = c.list[i][c.idx];
          if (lat > nw.lat || lat + deg < se.lat || lon > se.lng || lon + deg < nw.lng) continue;
          var p1 = map.project([lat + deg, lon], z).subtract(origin);
          var p2 = map.project([lat, lon + deg], z).subtract(origin);
          ctx.fillStyle = paletteAt(span > 0 ? (Math.log(n) - logLo) / span : 1);
          var w = p2.x - p1.x, h = p2.y - p1.y;
          if (w < 6) {
            // Whole-world view: a cell is a few pixels, a filled square reads as a dot anyway.
            ctx.fillRect(Math.floor(p1.x), Math.floor(p1.y), Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
          } else {
            // Zoomed in: one dot per 1° cell, centred in the cell, so the grid does not look like blocks.
            ctx.beginPath();
            ctx.arc(p1.x + w / 2, p1.y + h / 2, Math.min(w, h) * 0.42, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        return tile;
      }
    });
    return new Layer({ pane: 'overlayPane', updateWhenZooming: false, keepBuffer: 2 });
  }

  function onMapClick(e) {
    if (state.layer !== 'world' || !state.cells) return;
    var deg = state.cells.deg;
    var ll = e.latlng.wrap();
    var lat = Math.floor(ll.lat / deg) * deg, lon = Math.floor(ll.lng / deg) * deg;
    var row = state.cells.byKey[lat + '_' + lon];
    var n = row ? row[state.cells.idx] : null;
    var box = document.createElement('div');
    box.className = 'popup-box';
    function ns(v, pos, neg) { return Math.abs(v) + '°' + (v >= 0 ? pos : neg); }
    var line1 = document.createElement('div');
    line1.textContent = ns(lat, 'N', 'S') + '..' + ns(lat + deg, 'N', 'S') + ', ' + ns(lon, 'E', 'W') + '..' + ns(lon + deg, 'E', 'W');
    var line2 = document.createElement('div');
    line2.textContent = (isNum(n) && n > 0 ? fmtInt(n) + ' hotspots' : 'No hotspots recorded') + ' · ' + monthLabel(state.cells.month);
    var line3 = document.createElement('div');
    line3.className = 'popup-sub';
    line3.textContent = SERIES[state.cells.series].short +
      (row && row.length >= 5 ? ' · harmonized ' + fmtInt(row[2]) + ', MODIS ' + fmtInt(row[3]) + ', VIIRS ' + fmtInt(row[4]) : '');
    box.appendChild(line1); box.appendChild(line2); box.appendChild(line3);
    L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
  }

  function boundsFor(id) {
    if (id === 'WORLD') return WORLD_VIEW;
    var r = regionById(id);
    var bbox = r && Array.isArray(r.bbox) && r.bbox.length === 4 ? r.bbox : null;
    if (!bbox || !bbox.every(isNum)) return null;
    function cl(v) { return Math.max(-85, Math.min(85, v)); }
    return [[cl(bbox[1]), bbox[0]], [cl(bbox[3]), bbox[2]]];
  }

  // Fit when the region or the drawn layer changed (or on resize), not on every month click.
  function fitMap(force) {
    if (!map) return;
    map.invalidateSize();
    var size = map.getSize();
    if (!size.x || !size.y) return;
    var isUA = state.regionId && state.regionId.indexOf('UKR') === 0;
    // Ukraine points are only in Ukraine: for another region, show Ukraine instead of an empty view.
    var target = state.layer === 'ukraine' && !isUA ? 'UKR' : state.regionId;
    var key = target + '|' + state.layer;
    if (!force && key === state.lastFit) return;
    var b = boundsFor(target);
    if (!b) return;
    state.lastFit = key;
    map.fitBounds(b, { padding: [10, 10], animate: !reduceMotion });
  }

  function worldAvailable(key) {
    return !!(key && state.worldMonths && state.worldMonths.indexOf(key) !== -1);
  }

  function setLayerButtons(layer) {
    var btns = document.querySelectorAll('#layer-toggle .seg-btn');
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute('data-layer') === layer;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('points-tools').hidden = layer !== 'ukraine';
    $('cells-tools').hidden = layer !== 'world';
    $('legend-points').hidden = layer !== 'ukraine';
    $('legend-cells').hidden = layer !== 'world';
  }

  function showMapNote(text) {
    var n = $('map-note');
    n.textContent = text || '';
    n.hidden = !text;
  }

  function worldRangeText() {
    var w = state.worldMonths;
    return w && w.length ? w[0].slice(0, 4) + '–' + w[w.length - 1].slice(0, 4) : 'no months yet';
  }

  // Entry point used by the calendar: redraw the map for the selected month.
  function loadFires() {
    var key = state.selected;
    var layer = state.layerPref === 'world' && worldAvailable(key) ? 'world' : 'ukraine';
    if (state.layerPref === 'world' && key && !worldAvailable(key)) {
      showMapNote('World cells are available for ' + worldRangeText() + '; ' + key.slice(0, 4) +
        (isPrelim(key) ? ' shows Ukraine points (preliminary).' : ' shows Ukraine points where available.'));
    } else {
      showMapNote('');
    }
    state.layer = layer;
    setLayerButtons(layer);
    if (layer === 'world') loadCells(key);
    else loadPoints(key);
  }

  function clearCells() {
    state.cells = null;
    if (map && cellsLayer && map.hasLayer(cellsLayer)) map.removeLayer(cellsLayer);
  }

  function loadCells(key) {
    state.fires = [];
    if (firesLayer) firesLayer.clearLayers();
    setText('map-title', 'World cells (1°)');
    setText('map-status', 'Loading world cells for ' + key + '…');
    API.getWorldCells(key).then(function (rows) {
      if (key !== state.selected || state.layer !== 'world') return;
      var deg = state.manifest && isNum(state.manifest.world_cell_deg) ? state.manifest.world_cell_deg : 1;
      // Row = [lat, lon, harmonized, modis, viirs]; the map draws the series chosen in the toggles.
      var series = state.series, idx = { harmonized: 2, modis: 3, viirs: 4 }[series] || 2;
      var all = Array.isArray(rows) ? rows.filter(function (r) {
        return Array.isArray(r) && isNum(r[0]) && isNum(r[1]);
      }) : [];
      var list = all.filter(function (r) { return isNum(r[idx]) && r[idx] > 0; });
      var byKey = {};
      all.forEach(function (r) { byKey[r[0] + '_' + r[1]] = r; });
      if (!list.length) {
        clearCells();
        renderCellsLegend(null);
        var why = series === 'viirs' && key < '2012-02' ? ' — Suomi NPP VIIRS starts in January 2012' : '';
        setText('map-title', 'World cells (1°) · ' + SERIES[series].short);
        setText('map-status', 'No ' + SERIES[series].label.toLowerCase() + ' for ' + monthLabel(key) + why + '.');
        fitMap();
        return;
      }
      var lo = Infinity, hi = -Infinity, total = 0;
      list.forEach(function (r) {
        if (r[idx] < lo) lo = r[idx];
        if (r[idx] > hi) hi = r[idx];
        total += r[idx];
      });
      // Draw large counts last so they stay on top.
      list.sort(function (a, b) { return a[idx] - b[idx]; });
      state.cells = { list: list, byKey: byKey, lo: lo, hi: hi, deg: deg, month: key, idx: idx, series: series };
      setText('map-title', 'World cells (1°) · ' + SERIES[series].short);
      if (map && cellsLayer) {
        if (!map.hasLayer(cellsLayer)) cellsLayer.addTo(map);
        else cellsLayer.redraw();
      }
      renderCellsLegend(state.cells);
      var what = { harmonized: 'harmonized hotspots (Suomi NPP scale)', modis: 'raw MODIS hotspots (Terra + Aqua)', viirs: 'raw VIIRS hotspots (Suomi NPP)' }[series];
      setText('map-status', fmtInt(list.length) + ' cells with hotspots · ' + fmtInt(Math.round(total)) + ' ' +
        what + ' worldwide in ' + monthLabel(key) + '. Click a cell for its numbers.');
      fitMap();
    });
  }

  function renderCellsLegend(c) {
    var grad = $('cells-gradient'), ticks = $('cells-ticks');
    ticks.textContent = '';
    setText('cells-legend-title', { harmonized: 'Harmonized hotspots', modis: 'Raw MODIS hotspots', viirs: 'Raw VIIRS hotspots' }[state.series] + ' per 1° cell');
    if (!c) { grad.style.background = 'none'; setText('cells-sub', 'No data'); return; }
    var stops = [];
    for (var i = 0; i <= 10; i++) stops.push(paletteAt(i / 10) + ' ' + (i * 10) + '%');
    grad.style.background = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
    var logLo = Math.log(c.lo), span = Math.log(c.hi) - logLo;
    var vals = [c.lo];
    for (var p = Math.ceil(Math.log10(c.lo)); Math.pow(10, p) < c.hi; p++) {
      var v = Math.pow(10, p);
      if (v > c.lo) vals.push(v);
    }
    vals.push(c.hi);
    vals.forEach(function (v, idx) {
      var pos = span > 0 ? (Math.log(v) - logLo) / span : 1;
      // skip powers of ten that would collide with the end labels
      if (idx > 0 && idx < vals.length - 1 && (pos < 0.1 || pos > 0.86)) return;
      var t = document.createElement('span');
      t.className = 'cells-tick';
      t.style.left = (pos * 100) + '%';
      t.textContent = fmtCompact(v);
      ticks.appendChild(t);
    });
    setText('cells-sub', 'Log scale · colour range of ' + monthLabel(c.month));
  }

  function loadPoints(key) {
    clearCells();
    state.fires = [];
    if (firesLayer) firesLayer.clearLayers();
    var isUA = state.regionId && state.regionId.indexOf('UKR') === 0;
    var available = state.fireMonths && state.fireMonths.length ? state.fireMonths.join(', ') : 'none yet';

    setText('map-title', isUA ? regionName(state.regionId) + ' hotspots' : 'Ukraine hotspots');
    if (!key) { setText('map-status', 'Select a month in the calendar.'); fitMap(); return; }
    if (state.fireMonths && state.fireMonths.indexOf(key) === -1) {
      setText('map-status', 'No point data for ' + key + '. Point data available for: ' + available + '.');
      fitMap();
      return;
    }
    setText('map-status', 'Loading points for ' + key + '…');
    var regionAtStart = state.regionId;
    API.getFires(key).then(function (pts) {
      if (key !== state.selected || regionAtStart !== state.regionId || state.layer !== 'ukraine') return;
      if (!Array.isArray(pts)) {
        setText('map-status', 'No point data for ' + key + '. Point data available for: ' + available + '.');
        fitMap();
        return;
      }
      var filtered = pts.filter(function (p) {
        if (!p || !isNum(p.lat) || !isNum(p.lon)) return false;
        // An oblast shows its own points; Ukraine or any non-Ukrainian region shows all of Ukraine.
        if (isUA && state.regionId !== 'UKR' && p.region_id !== state.regionId) return false;
        if (state.pointsFilter !== 'all' && p.sensor !== state.pointsFilter) return false;
        return true;
      });
      state.fires = filtered;
      drawFires();
      var filterTxt = state.pointsFilter === 'all' ? 'MODIS + VIIRS' : state.pointsFilter;
      setText('map-status', fmtInt(filtered.length) + ' hotspots (' + filterTxt + ') in ' +
        (isUA ? regionName(state.regionId) : 'Ukraine') + ', ' + monthLabel(key) +
        (isPrelim(key) ? ' — preliminary data' : '') + '.');
      fitMap();
    });
  }

  function drawFires() {
    if (!map || !firesLayer) return;
    firesLayer.clearLayers();
    // Draw weak fires first so strong ones stay visible on top.
    var pts = state.fires.slice().sort(function (a, b) { return (a.frp || 0) - (b.frp || 0); });
    pts.forEach(function (pt) {
      var frp = isNum(pt.frp) ? pt.frp : null;
      var color = frp === null ? '#94a3b8' : frp > 80 ? '#ef4444' : frp >= 25 ? '#f97316' : '#fbbf24';
      var marker = L.circleMarker([pt.lat, pt.lon], {
        renderer: canvasRenderer, radius: 3, fillColor: color, stroke: false, fillOpacity: 0.8
      });
      marker.bindPopup(function () { return popupFor(pt, frp); });
      marker.addTo(firesLayer);
    });
  }

  function popupFor(pt, frp) {
    var box = document.createElement('div');
    box.className = 'popup-box';
    [
      ['Sensor', (pt.sensor || 'n/a') + (pt.satellite ? ' (' + pt.satellite + ')' : '')],
      ['Date', pt.date || 'n/a'],
      ['FRP', frp === null ? 'n/a' : fmtNum(frp, 1) + ' MW'],
      ['Region', regionName(pt.region_id)],
      ['Lat, lon', pt.lat.toFixed(4) + ', ' + pt.lon.toFixed(4)]
    ].forEach(function (l) {
      var d = document.createElement('div');
      d.textContent = l[0] + ': ' + l[1];
      box.appendChild(d);
    });
    return box;
  }

  function exportPointsCSV() {
    if (!state.fires.length) { alert('No points are shown on the map for this selection.'); return; }
    downloadCSV(FIRE_COLUMNS, state.fires, 'P1t0n_hotspots_' + state.regionId + '_' + state.selected + '.csv');
  }

  /* ---------- events ---------- */

  function bindEvents() {
    $('region-select').addEventListener('change', function (e) {
      state.regionId = e.target.value;
      loadCalendar();
    });

    // Loose month parser: "2016-1", "2016-01", "2016/1", "2016.1", "201601", "2016" (whole year).
    // Returns 'YYYY-MM' or null; isEnd picks December for a bare year.
    function parseMonth(s, isEnd) {
      var m = /^\s*(\d{4})\s*(?:[-./\s]\s*(\d{1,2})|(\d{2}))?\s*$/.exec(String(s || ''));
      if (!m) return null;
      var mo = m[2] || m[3];
      var n = mo ? parseInt(mo, 10) : (isEnd ? 12 : 1);
      if (n < 1 || n > 12) return null;
      return m[1] + '-' + (n < 10 ? '0' : '') + n;
    }
    function clampKey(k, lo, hi) { return k < lo ? lo : (k > hi ? hi : k); }

    function onRange() {
      if (!state.rows.length) return;
      var first = ymKey(state.rows[0]), last = ymKey(state.rows[state.rows.length - 1]);
      // Invalid text falls back to the previous value; both ends are clamped to the data range.
      var f = parseMonth($('month-from').value, false) || state.from || first;
      var t = parseMonth($('month-to').value, true) || state.to || last;
      f = clampKey(f, first, last);
      t = clampKey(t, first, last);
      if (f > t) { var tmp = f; f = t; t = tmp; }
      state.from = f; state.to = t;
      $('month-from').value = f; $('month-to').value = t;
      if (!state.selected || state.selected < f || state.selected > t) {
        var inR = rowsInRange();
        state.selected = inR.length ? ymKey(inR[inR.length - 1]) : null;
        loadFires();
      }
      renderCalendar();
    }
    // Applied on Enter or leaving the field (change), never while typing.
    ['month-from', 'month-to'].forEach(function (id) {
      var el = $(id);
      el.addEventListener('change', onRange);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onRange(); } });
      // Keep only digits and separators while typing.
      el.addEventListener('input', function () {
        var v = el.value.replace(/[^\d\-./ ]/g, '');
        if (v !== el.value) el.value = v;
      });
    });

    // One series for the calendar and the world map: the two switches stay in sync.
    var segBtns = document.querySelectorAll('#series-toggle .seg-btn, #cells-series-toggle .seg-btn');
    function setSeries(s) {
      state.series = s;
      Array.prototype.forEach.call(segBtns, function (b) {
        var on = b.getAttribute('data-series') === s;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (state.rows.length) renderCalendar();
      if (state.layer === 'world') { if (map) map.closePopup(); loadFires(); }
    }
    Array.prototype.forEach.call(segBtns, function (btn) {
      btn.addEventListener('click', function () { setSeries(btn.getAttribute('data-series')); });
    });

    var ptBtns = document.querySelectorAll('#points-toggle .seg-btn');
    Array.prototype.forEach.call(ptBtns, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(ptBtns, function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.pointsFilter = btn.getAttribute('data-points');
        loadFires();
      });
    });

    var layerBtns = document.querySelectorAll('#layer-toggle .seg-btn');
    Array.prototype.forEach.call(layerBtns, function (btn) {
      btn.addEventListener('click', function () {
        state.layerPref = btn.getAttribute('data-layer');
        if (map) map.closePopup();
        // Keep the calendar and the map on the same zone: World cells -> World calendar
        // (from a Ukrainian zone), Ukraine points -> Ukraine calendar (from a non-Ukrainian zone).
        var isUA = state.regionId && state.regionId.indexOf('UKR') === 0;
        var next = state.regionId;
        if (state.layerPref === 'world' && isUA && regionById('WORLD')) next = 'WORLD';
        if (state.layerPref === 'ukraine' && !isUA && regionById('UKR')) next = 'UKR';
        // World cells exist only for some months: move to the same month of the last world year,
        // or the last world month.
        var monthMoved = false;
        if (state.layerPref === 'world' && state.worldMonths && state.worldMonths.length && !worldAvailable(state.selected)) {
          var w = state.worldMonths, last = w[w.length - 1];
          var same = state.selected ? last.slice(0, 4) + state.selected.slice(4) : null;
          state.selected = worldAvailable(same) ? same : last;
          if (state.to && state.to < state.selected) state.to = null;
          if (state.from && state.from > state.selected) state.from = null;
          monthMoved = true;
        }
        // Ukraine points exist only for some months (2026): move to the same month of the last
        // point year, or the last point month.
        if (state.layerPref === 'ukraine' && state.fireMonths && state.fireMonths.length &&
            state.fireMonths.indexOf(state.selected) === -1) {
          var fm = state.fireMonths, lastF = fm[fm.length - 1];
          var sameF = state.selected ? lastF.slice(0, 4) + state.selected.slice(4) : null;
          state.selected = fm.indexOf(sameF) !== -1 ? sameF : lastF;
          if (state.to && state.to < state.selected) state.to = null;
          monthMoved = true;
        }
        if (next !== state.regionId || monthMoved) {
          state.regionId = next;
          $('region-select').value = next;
          loadCalendar();   // re-renders the calendar and redraws the map
        } else {
          loadFires();
        }
      });
    });

    $('toggle-anomalies-only').addEventListener('change', function (e) {
      state.anomaliesOnly = e.target.checked;
      if (state.rows.length) renderCalendar();
    });

    $('btn-calendar-csv').addEventListener('click', exportCalendarCSV);
    $('btn-calendar-png').addEventListener('click', exportCalendarPNG);
    $('btn-points-csv').addEventListener('click', exportPointsCSV);

    document.addEventListener('click', hideTooltip);
    window.addEventListener('scroll', hideTooltip, { passive: true });
  }

  /* ---------- small SVG chart kit (all numbers come from the data files) ---------- */

  var SVGNS = 'http://www.w3.org/2000/svg';
  var COLOR_MODIS = '#0072B2';
  var COLOR_SNPP = '#E69F00';

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgText(parent, x, y, text, cls, anchor) {
    var t = svgEl('text', { x: x, y: y, 'class': cls || 'svg-label', 'text-anchor': anchor || 'start' }, parent);
    t.textContent = text;
    return t;
  }
  function svgTitle(parent, text) {
    var t = svgEl('title', null, parent);
    t.textContent = text;
    return t;
  }
  function newSvg(w, h, label) {
    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img', 'aria-label': label, 'class': 'svg-chart' });
    svgTitle(svg, label);
    return svg;
  }
  // 0 … a "nice" maximum, n steps.
  function niceTicks(max, n) {
    if (!isNum(max) || max <= 0) return [0, 1];
    var raw = max / (n || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    var out = [];
    for (var v = 0; v < max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  function yGrid(svg, ticks, x0, x1, yOf, fmt) {
    var g = svgEl('g', { 'class': 'svg-axis' }, svg);
    ticks.forEach(function (t) {
      var y = yOf(t);
      svgEl('line', { x1: x0, x2: x1, y1: y, y2: y, 'class': 'svg-grid' }, g);
      svgText(g, x0 - 6, y + 4, fmt ? fmt(t) : fmtCompact(t), 'svg-label', 'end');
    });
    return g;
  }

  // Draw at the container's real pixel width so text stays at its CSS size; redraw when the width changes.
  function responsiveChart(container, draw) {
    if (!container) return function () {};
    var lastW = 0;
    function render(force) {
      var w = Math.round(container.clientWidth);
      if (!w || (!force && w === lastW)) return;
      lastW = w;
      var svg = draw(w);
      container.textContent = '';
      if (svg) container.appendChild(svg);
    }
    render(true);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { render(false); }).observe(container);
    } else {
      window.addEventListener('resize', function () { render(false); });
    }
    return function () { render(true); };
  }

  function bindSegToggle(groupId, attr, onChange) {
    var btns = document.querySelectorAll('#' + groupId + ' .seg-btn');
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(btns, function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        onChange(btn.getAttribute(attr));
      });
    });
  }

  /* ---------- Method 5: relative error 1/sqrt(N) ---------- */

  function drawNoiseChart(w) {
    var h = 200, ml = 46, mr = 14, mt = 14, mb = 36;
    var svg = newSvg(w, h, 'Relative counting error 1/√N for N = 1 to 10,000 hotspots (log x axis)');
    var maxLog = 4;
    function x(n) { return ml + (Math.log10(n) / maxLog) * (w - ml - mr); }
    function y(pct) { return mt + (1 - pct / 100) * (h - mt - mb); }
    yGrid(svg, [0, 25, 50, 75, 100], ml, w - mr, y, function (t) { return t + ' %'; });
    var ax = svgEl('g', { 'class': 'svg-axis' }, svg);
    [1, 10, 100, 1000, 10000].forEach(function (n) {
      svgEl('line', { x1: x(n), x2: x(n), y1: h - mb, y2: h - mb + 4, 'class': 'svg-tick' }, ax);
      svgText(ax, x(n), h - mb + 17, n.toLocaleString('en-US'), 'svg-label', 'middle');
    });
    svgText(ax, w - mr, h - 4, 'N, hotspots in the month (log scale)', 'svg-label svg-muted', 'end');
    var d = '';
    for (var i = 0; i <= 120; i++) {
      var n = Math.pow(10, (i / 120) * maxLog);
      d += (i ? 'L' : 'M') + x(n).toFixed(1) + ',' + y(100 / Math.sqrt(n)).toFixed(1);
    }
    svgEl('path', { d: d, 'class': 'svg-line-ember' }, svg);
    [10, 100, 1000].forEach(function (n) {
      var pct = 100 / Math.sqrt(n);
      var g = svgEl('g', null, svg);
      svgEl('circle', { cx: x(n), cy: y(pct), r: 4.5, 'class': 'svg-dot-mark' }, g);
      svgText(g, x(n), y(pct) - 10, '±' + Math.round(pct) + ' %', 'svg-label svg-strong', 'middle');
      svgTitle(g, 'N = ' + n + ' hotspots → relative error ≈ ±' + pct.toFixed(1) + ' %');
    });
    return svg;
  }

  /* ---------- Method 6: one month of the Ukraine calendar ---------- */

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function initAugustChart(rows) {
    var box = $('chart-august');
    if (!box) return;
    var MONTH = 8;
    var pts = (Array.isArray(rows) ? rows : []).filter(function (r) {
      return r && r.month === MONTH && isNum(r.year) && isNum(r.harmonized_count);
    }).sort(function (a, b) { return a.year - b.year; });
    if (pts.length < 3) {
      box.textContent = '';
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No data';
      box.appendChild(p);
      return;
    }
    var vals = pts.map(function (r) { return r.harmonized_count; }).sort(function (a, b) { return a - b; });
    var first = pts[0], last = pts[pts.length - 1];
    function fromRows(field) {
      for (var i = 0; i < pts.length; i++) if (isNum(pts[i][field])) return pts[i][field];
      return null;
    }
    var med = fromRows('median_count');
    if (!isNum(med)) med = median(vals);
    var p25 = fromRows('p25_count'), p75 = fromRows('p75_count');
    if (!isNum(p25) || !isNum(p75)) { p25 = quantile(vals, 0.25); p75 = quantile(vals, 0.75); }
    var top = null;
    pts.forEach(function (r) { if (isNum(r.anomaly) && (!top || Math.abs(r.anomaly) > Math.abs(top.anomaly))) top = r; });

    setText('chart-august-title', 'Live example: ' + MONTHS_LONG[MONTH - 1] + ' in Ukraine, ' + first.year + '–' + last.year);
    var note = 'One dot per year (harmonized count); band = 25th–75th percentile (' + fmtInt(p25) + '–' + fmtInt(p75) +
      '); line = median (' + fmtInt(med) + ').';
    if (top) note += ' Largest anomaly: ' + top.year + ', z = ' + fmtZ(top.anomaly) + '.';
    if (isPrelim(ym(last.year, MONTH))) note += ' ' + last.year + ' is preliminary.';
    setText('chart-august-note', note);

    responsiveChart(box, function (w) {
      var ml = 14, mr = 14, r = 5.5, gapY = 2 * r + 2;
      var maxV = vals[vals.length - 1];
      var ticks = niceTicks(maxV, w < 380 ? 3 : 5);
      var xMax = ticks[ticks.length - 1];
      function x(v) { return ml + (v / xMax) * (w - ml - mr); }
      // simple beeswarm: put each dot on the nearest free row
      var placed = [];
      var order = pts.slice().sort(function (a, b) { return a.harmonized_count - b.harmonized_count; });
      var maxLevel = 0;
      order.forEach(function (row) {
        var cx = x(row.harmonized_count);
        for (var k = 0; k < 40; k++) {
          var level = k === 0 ? 0 : (k % 2 ? (k + 1) / 2 : -k / 2);
          var clash = placed.some(function (p) { return p.level === level && Math.abs(p.cx - cx) < 2 * r + 1; });
          if (!clash) { placed.push({ row: row, cx: cx, level: level }); maxLevel = Math.max(maxLevel, Math.abs(level)); break; }
        }
      });
      var labelSpace = 22;
      var mid = labelSpace + 8 + maxLevel * gapY + r;
      var axisY = mid + maxLevel * gapY + r + 10;
      var h = axisY + 34;
      var svg = newSvg(w, h, 'Harmonized August hotspot counts for Ukraine, one dot per year, with median and 25th–75th percentile band');
      svgEl('rect', { x: x(p25), y: mid - maxLevel * gapY - r - 6, width: Math.max(1, x(p75) - x(p25)), height: 2 * (maxLevel * gapY + r + 6), 'class': 'svg-band' }, svg);
      svgEl('line', { x1: x(med), x2: x(med), y1: labelSpace + 2, y2: axisY, 'class': 'svg-median' }, svg);
      var medLabelRight = x(med) < w * 0.6;
      svgText(svg, x(med) + (medLabelRight ? 5 : -5), labelSpace - 6, 'median ' + fmtCompact(med), 'svg-label svg-strong', medLabelRight ? 'start' : 'end');
      var ax = svgEl('g', { 'class': 'svg-axis' }, svg);
      svgEl('line', { x1: ml, x2: w - mr, y1: axisY, y2: axisY, 'class': 'svg-grid' }, ax);
      ticks.forEach(function (t) {
        svgEl('line', { x1: x(t), x2: x(t), y1: axisY, y2: axisY + 4, 'class': 'svg-tick' }, ax);
        svgText(ax, x(t), axisY + 17, fmtCompact(t), 'svg-label', t === 0 ? 'start' : (t === xMax ? 'end' : 'middle'));
      });
      svgText(ax, w - mr, h - 2, 'hotspots in August (harmonized)', 'svg-label svg-muted', 'end');
      placed.forEach(function (p) {
        var isTop = top && p.row.year === top.year;
        var c = svgEl('circle', { cx: p.cx, cy: mid + p.level * gapY, r: isTop ? r + 1.5 : r, 'class': isTop ? 'svg-dot-top' : 'svg-dot' }, svg);
        svgTitle(c, 'August ' + p.row.year + ': ' + fmtInt(p.row.harmonized_count) + ' hotspots, z = ' + fmtZ(p.row.anomaly));
      });
      if (top) {
        var tp = placed.filter(function (p) { return p.row.year === top.year; })[0];
        if (tp) {
          // label above the swarm, at the dot's x, with a short leader line
          var right = tp.cx > w * 0.55;
          var ly = mid + tp.level * gapY;
          svgEl('line', { x1: tp.cx, x2: tp.cx, y1: labelSpace - 2, y2: ly - r - 2, 'class': 'svg-leader' }, svg);
          svgText(svg, tp.cx + (right ? 4 : -4), labelSpace - 6, top.year + ' · z = ' + fmtZ(top.anomaly), 'svg-label svg-hl', right ? 'end' : 'start');
        }
      }
      return svg;
    });
  }

  /* ---------- Coefficients chart (next to the table) ---------- */

  function drawCoefChart(list) {
    return responsiveChart($('chart-coef'), function (w) {
      // as tall as the table beside it (when side by side), so the card has no empty corner
      var tbl = $('coef-table');
      var side = tbl && tbl.offsetHeight && tbl.getBoundingClientRect().right < $('chart-coef').getBoundingClientRect().left;
      var h = side ? Math.max(240, Math.min(520, tbl.offsetHeight - 34)) : Math.max(220, Math.min(320, Math.round(w * 0.6)));
      var ml = 40, mr = 8, mt = 12, mb = 28;
      var maxK = 0;
      list.forEach(function (c) { [c.k_aqua, c.k_terra].forEach(function (v) { if (isNum(v) && v > maxK) maxK = v; }); });
      var ticks = niceTicks(maxK, 4);
      var yMax = ticks[ticks.length - 1];
      var svg = newSvg(w, h, 'Monthly scale factors k Aqua and k Terra');
      function y(v) { return mt + (1 - v / yMax) * (h - mt - mb); }
      yGrid(svg, ticks, ml, w - mr, y, function (t) { return String(t); });
      var gw = (w - ml - mr) / 12, bw = Math.max(3, gw * 0.34);
      list.forEach(function (c) {
        var gx = ml + (c.month - 1) * gw + gw / 2;
        [['k_aqua', -1, 'svg-bar-aqua', 'k Aqua'], ['k_terra', 1, 'svg-bar-terra', 'k Terra']].forEach(function (s) {
          var v = c[s[0]];
          if (!isNum(v)) return;
          var bx = s[1] < 0 ? gx - bw - 1 : gx + 1;
          var b = svgEl('rect', { x: bx, y: y(v), width: bw, height: Math.max(0, y(0) - y(v)), rx: 2, 'class': s[2] }, svg);
          svgTitle(b, MONTHS_LONG[c.month - 1] + ': ' + s[3] + ' = ' + v.toFixed(2));
        });
        svgText(svg, gx, h - mb + 16, w < 360 ? MONTHS[c.month - 1].charAt(0) : MONTHS[c.month - 1], 'svg-label', 'middle');
      });
      return svg;
    });
  }

  /* ---------- Validation chart (2021–2025) ---------- */

  var validation = { data: null, area: 'ukraine', redraw: null };

  function initValidationChart() {
    bindSegToggle('valid-toggle', 'data-area', function (area) {
      validation.area = area;
      updateValidationBadge();
      if (validation.redraw) validation.redraw();
    });
    API.getValidation().then(function (data) {
      validation.data = data;
      validation.redraw = responsiveChart($('chart-valid'), drawValidation);
    });
  }

  function updateValidationBadge() {
    var b = $('valid-r2');
    if (!b) return;
    var m = state.metrics && state.metrics[validation.area];
    b.textContent = m && isNum(m.r2) ? 'R² ' + m.r2.toFixed(2) : 'R² n/a';
  }

  function drawValidation(w) {
    var rows = validation.data && Array.isArray(validation.data[validation.area]) ? validation.data[validation.area].filter(function (r) {
      return r && isNum(r.year) && isNum(r.month);
    }).sort(function (a, b) { return a.year - b.year || a.month - b.month; }) : [];
    if (!rows.length) {
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No data';
      return p;
    }
    var h = w > 500 ? 380 : 260, ml = 46, mr = 10, mt = 12, mb = 30;
    var maxV = 0;
    rows.forEach(function (r) { ['snpp', 'modis_scaled', 'modis_raw'].forEach(function (f) { if (isNum(r[f]) && r[f] > maxV) maxV = r[f]; }); });
    var ticks = niceTicks(maxV, 4);
    var yMax = ticks[ticks.length - 1];
    var area = validation.area === 'world' ? 'World' : 'Ukraine';
    var svg = newSvg(w, h, area + ': monthly hotspot totals 2021–2025, real Suomi NPP vs MODIS translated vs raw MODIS');
    var n = rows.length;
    function x(i) { return ml + (n > 1 ? i / (n - 1) : 0.5) * (w - ml - mr); }
    function y(v) { return mt + (1 - v / yMax) * (h - mt - mb); }
    yGrid(svg, ticks, ml, w - mr, y);
    rows.forEach(function (r, i) {
      if (r.month === 1) {
        svgEl('line', { x1: x(i), x2: x(i), y1: mt, y2: h - mb, 'class': 'svg-grid svg-grid-v' }, svg);
        svgText(svg, x(i) + 3, h - mb + 16, String(r.year), 'svg-label');
      }
    });
    function path(field) {
      var d = '', pen = false;
      rows.forEach(function (r, i) {
        if (!isNum(r[field])) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(r[field]).toFixed(1);
        pen = true;
      });
      return d;
    }
    svgEl('path', { d: path('modis_raw'), 'class': 'svg-line-raw' }, svg);
    svgEl('path', { d: path('snpp'), 'class': 'svg-line-snpp' }, svg);
    svgEl('path', { d: path('modis_scaled'), 'class': 'svg-line-scaled' }, svg);
    // invisible hover strips with the exact numbers
    var sw = (w - ml - mr) / Math.max(1, n - 1);
    rows.forEach(function (r, i) {
      var hit = svgEl('rect', { x: x(i) - sw / 2, y: mt, width: sw, height: h - mt - mb, 'class': 'svg-hit' }, svg);
      svgTitle(hit, MONTHS[r.month - 1] + ' ' + r.year + ' — Suomi NPP: ' + fmtInt(r.snpp) +
        '; MODIS translated: ' + fmtInt(r.modis_scaled) + '; raw MODIS: ' + fmtInt(r.modis_raw));
    });
    return svg;
  }

  /* ---------- Problem: raw yearly counts, 3D bars (SVG fallback) ---------- */

  var raw = { data: null, area: 'ukraine', view: null };

  function rawSeries() {
    var list = raw.data && Array.isArray(raw.data[raw.area]) ? raw.data[raw.area] : [];
    return list.filter(function (r) { return r && isNum(r.year); }).sort(function (a, b) { return a.year - b.year; });
  }
  function hasViirs(r) { return isNum(r.viirs) && (r.viirs > 0 || isNum(r.ratio)); }
  function rawReadout(r) {
    if (!r) return 'Hover or tap a bar to read its numbers.';
    return r.year + ' · MODIS ' + fmtInt(r.modis) + ' · Suomi NPP ' +
      (hasViirs(r) ? fmtInt(r.viirs) : 'no data (starts 2012)') +
      (isNum(r.ratio) ? ' · VIIRS / MODIS ' + fmtNum(r.ratio, 2) + '×' : '');
  }
  // First year with Suomi NPP counts (the "false jump" year), from the data.
  function viirsStartYear(list) {
    for (var i = 0; i < list.length; i++) if (hasViirs(list[i])) return list[i].year;
    return null;
  }

  function initRawChart() {
    var box = $('raw-chart');
    if (!box) return;
    bindSegToggle('raw-toggle', 'data-area', function (area) {
      raw.area = area;
      updateRawText();
      if (raw.view) raw.view.update();
    });
    API.getRawSeries().then(function (data) {
      raw.data = data;
      box.textContent = '';
      if (!rawSeries().length) {
        var p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'No data';
        box.appendChild(p);
        return;
      }
      updateRawText();
      var view = null;
      if (!reduceMotion && typeof THREE !== 'undefined') {
        try { view = createRaw3D(box); } catch (e) { view = null; if (window.console) console.warn('[P1t0n] 3D chart unavailable:', e); }
      }
      if (!view) {
        box.textContent = '';
        box.classList.add('is-flat');
        view = createRawSVG(box);
      }
      raw.view = view;
    });
  }

  function updateRawText() {
    var list = rawSeries();
    var name = raw.area === 'world' ? 'World' : 'Ukraine';
    var span = list.length ? list[0].year + '–' + list[list.length - 1].year : '';
    setText('raw-caption', 'Raw yearly hotspot counts, ' + name + ' ' + span + ': MODIS (Terra + Aqua) vs VIIRS Suomi NPP (NASA FIRMS). Not harmonized.');
    var box = $('raw-chart');
    if (box) box.setAttribute('aria-label', 'Raw yearly fire hotspot counts for ' + name + ', ' + span + ': MODIS (Terra + Aqua) and VIIRS Suomi NPP.');
    var dl = document.querySelector('.raw-download');
    if (dl) dl.textContent = raw.area === 'world' ? 'Download Ukraine figure (PNG)' : 'Download figure (PNG)';
    setText('raw-readout', rawReadout(null));
  }

  function createRawSVG(box) {
    var redraw = responsiveChart(box, function (w) {
      var list = rawSeries();
      var h = w < 500 ? 260 : 330, ml = 48, mr = 10, mt = 30, mb = 28;
      var maxV = 0;
      list.forEach(function (r) { [r.modis, r.viirs].forEach(function (v) { if (isNum(v) && v > maxV) maxV = v; }); });
      var ticks = niceTicks(maxV, 4);
      var yMax = ticks[ticks.length - 1];
      var svg = newSvg(w, h, 'Raw yearly hotspot counts, MODIS and Suomi NPP');
      function y(v) { return mt + (1 - v / yMax) * (h - mt - mb); }
      yGrid(svg, ticks, ml, w - mr, y);
      var gw = (w - ml - mr) / Math.max(1, list.length), bw = Math.max(2, gw * 0.36);
      var start = viirsStartYear(list);
      list.forEach(function (r, i) {
        var gx = ml + i * gw + gw / 2;
        if (r.year === start) {
          svgEl('line', { x1: gx - gw / 2, x2: gx - gw / 2, y1: mt - 18, y2: h - mb, 'class': 'svg-marker' }, svg);
          var right = gx < w * 0.6;
          svgText(svg, gx - gw / 2 + (right ? 5 : -5), mt - 8, 'VIIRS starts → false jump if added up', 'svg-label svg-teal', right ? 'start' : 'end');
        }
        [['modis', -1, COLOR_MODIS, 'MODIS'], ['viirs', 1, COLOR_SNPP, 'Suomi NPP']].forEach(function (s) {
          var v = r[s[0]];
          if (!isNum(v) || v <= 0) return;
          var b = svgEl('rect', { x: s[1] < 0 ? gx - bw - 0.5 : gx + 0.5, y: y(v), width: bw, height: Math.max(0, y(0) - y(v)), fill: s[2], rx: 1.5, 'class': 'svg-rawbar' }, svg);
          svgTitle(b, r.year + ' · ' + s[3] + ': ' + fmtInt(v));
          b.addEventListener('click', function () { setText('raw-readout', rawReadout(r)); });
        });
        if (i % 4 === 0) svgText(svg, gx, h - mb + 16, String(r.year), 'svg-label', 'middle');
      });
      return svg;
    });
    return { update: function () { redraw(); } };
  }

  function createRaw3D(box) {
    var T = THREE;
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    if (!renderer.getContext()) throw new Error('no WebGL context');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    box.appendChild(renderer.domElement);
    renderer.domElement.className = 'raw-canvas';
    var overlay = document.createElement('div');
    overlay.className = 'raw-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    box.appendChild(overlay);
    var axisNote = document.createElement('div');
    axisNote.className = 'raw-axis-note';
    axisNote.textContent = 'Hotspots per year · drag to rotate';
    box.appendChild(axisNote);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(38, 2, 0.1, 400);
    scene.add(new T.AmbientLight(0xffffff, 0.55));
    var dl = new T.DirectionalLight(0xffffff, 0.75);
    dl.position.set(6, 14, 10);
    scene.add(dl);
    var dl2 = new T.DirectionalLight(0x88aaff, 0.25);
    dl2.position.set(-8, 4, -6);
    scene.add(dl2);

    var H = 8, BW = 0.36, BD = 0.55;
    var geo = new T.BoxGeometry(1, 1, 1);
    var matM = new T.MeshStandardMaterial({ color: COLOR_MODIS, emissive: COLOR_MODIS, emissiveIntensity: 0.32, roughness: 0.55, metalness: 0.1 });
    var matS = new T.MeshStandardMaterial({ color: COLOR_SNPP, emissive: COLOR_SNPP, emissiveIntensity: 0.32, roughness: 0.55, metalness: 0.1 });
    var chart = new T.Group(); // stretched in height on narrow screens (chart.scale.y)
    scene.add(chart);
    var bars = new T.Group();
    chart.add(bars);
    var guides = new T.Group(); // grid lines + marker, rebuilt on data change
    chart.add(guides);
    var highlight = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }));
    highlight.visible = false;
    chart.add(highlight);
    var meshes = [];
    var labels = [];
    var target = new T.Vector3(0, H * 0.38, 0);
    var radius = 30, halfW = 12;

    function clearGuides() {
      while (guides.children.length) {
        var c = guides.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
    function addLabel(text, pos, cls) {
      var el = document.createElement('span');
      el.className = 'raw-label ' + (cls || '');
      el.textContent = text;
      overlay.appendChild(el);
      // anchor: tick labels end at the point, the marker sits above it, the rest are centred
      var off = cls === 'raw-tick' ? ' translate(-100%,-50%)' : cls === 'raw-marker' ? ' translate(-50%,-100%)' : ' translate(-50%,-50%)';
      labels.push({ el: el, pos: pos, off: off });
    }

    function update() {
      var list = rawSeries();
      var n = list.length;
      halfW = n / 2;
      var maxV = 0;
      list.forEach(function (r) { [r.modis, r.viirs].forEach(function (v) { if (isNum(v) && v > maxV) maxV = v; }); });
      var ticks = niceTicks(maxV, 4);
      var yMax = ticks[ticks.length - 1] || 1;
      while (meshes.length < n * 2) {
        var m = new T.Mesh(geo, meshes.length % 2 ? matS : matM);
        bars.add(m);
        meshes.push(m);
      }
      meshes.forEach(function (m) { m.visible = false; });
      list.forEach(function (r, i) {
        var xc = (i - (n - 1) / 2);
        [[r.modis, -1], [r.viirs, 1]].forEach(function (s, k) {
          var m = meshes[i * 2 + k];
          var v = s[0];
          if (!isNum(v) || v <= 0) return;
          var hgt = (v / yMax) * H;
          m.scale.set(BW, hgt, BD);
          m.position.set(xc + s[1] * (BW / 2 + 0.02), hgt / 2, 0);
          m.userData = { row: r };
          m.visible = true;
        });
      });
      highlight.visible = false;

      clearGuides();
      overlay.textContent = '';
      labels = [];
      var lineMat = { color: 0xffffff, transparent: true, opacity: 0.12 };
      ticks.forEach(function (t) {
        var yy = (t / yMax) * H;
        var g = new T.BufferGeometry().setFromPoints([new T.Vector3(-halfW - 0.3, yy, -BD), new T.Vector3(halfW + 0.3, yy, -BD)]);
        guides.add(new T.Line(g, new T.LineBasicMaterial(lineMat)));
        addLabel(fmtCompact(t), new T.Vector3(-halfW - 0.6, yy, -BD), 'raw-tick');
      });
      var floor = new T.Mesh(new T.PlaneGeometry(n + 1, 3), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2;
      guides.add(floor);
      var narrow = box.clientWidth < 520;
      list.forEach(function (r, i) {
        if (i % (narrow ? 6 : 4) === 0) addLabel(String(r.year), new T.Vector3(i - (n - 1) / 2, -0.15, BD + 0.6), 'raw-year');
      });
      var start = viirsStartYear(list);
      var si = -1;
      list.forEach(function (r, i) { if (r.year === start) si = i; });
      if (si >= 0) {
        var mx = si - (n - 1) / 2 - 0.5;
        var plane = new T.Mesh(new T.PlaneGeometry(2.2, H * 1.08), new T.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false }));
        plane.rotation.y = Math.PI / 2;
        plane.position.set(mx, H * 0.54, 0);
        guides.add(plane);
        var edge = new T.BufferGeometry().setFromPoints([new T.Vector3(mx, 0, 0), new T.Vector3(mx, H * 1.08, 0)]);
        guides.add(new T.Line(edge, new T.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })));
        addLabel(narrow ? start + ': VIIRS starts → false jump' : start + ': VIIRS starts → false jump if added up', new T.Vector3(mx, H * 1.12, 0), 'raw-marker');
      }
      layout();
      setText('raw-readout', rawReadout(null));
      renderOnce();
    }

    var size = { w: 0, h: 0 };
    function layout() {
      var w = box.clientWidth, h = box.clientHeight;
      if (!w || !h) return;
      size.w = w; size.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var yScale = camera.aspect < 1.6 ? 1.9 : 1;
      chart.scale.y = yScale;
      target.y = H * (yScale > 1 ? 0.5 : 0.38) * yScale;
      var vHalf = T.MathUtils.degToRad(camera.fov / 2);
      var hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      radius = Math.max((halfW + 3) / Math.tan(hHalf), (H * 0.75 * yScale) / Math.tan(vHalf)) * 1.08;
    }

    // orbit: slow automatic swing + user drag
    var theta = 0, phi = 0.32, dragTheta = 0, autoT = 0, lastInteract = -1e9;
    var drag = null;
    function placeCamera() {
      var th = theta + dragTheta;
      camera.position.set(
        target.x + radius * Math.sin(th) * Math.cos(phi),
        target.y + radius * Math.sin(phi),
        target.z + radius * Math.cos(th) * Math.cos(phi));
      camera.lookAt(target);
    }
    var v3 = new T.Vector3();
    function renderOnce() {
      placeCamera();
      renderer.render(scene, camera);
      labels.forEach(function (l) {
        v3.copy(l.pos);
        chart.localToWorld(v3);
        v3.project(camera);
        if (v3.z > 1) { l.el.style.visibility = 'hidden'; return; }
        l.el.style.visibility = '';
        var px = (v3.x + 1) / 2 * size.w;
        if (l.off.indexOf('-100%,-50%') !== -1) px = Math.max(40, px); // keep axis numbers inside the box
        else if (l.off.indexOf('-50%,-100%') !== -1) {
          var half = l.el.offsetWidth / 2 + 4;
          px = Math.max(half, Math.min(size.w - half, px));
        }
        l.el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + ((1 - v3.y) / 2 * size.h).toFixed(1) + 'px)' + l.off;
      });
    }

    var running = false, visible = false, rafId = 0, lastTs = 0;
    function frame(ts) {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      var dt = lastTs ? Math.min(64, ts - lastTs) : 16;
      lastTs = ts;
      if (!drag && ts - lastInteract > 2500) {
        autoT += dt * 0.00022;
        theta = 0.4 * Math.sin(autoT);
      }
      renderOnce();
    }
    function setVisible(v) {
      visible = v;
      bgPaused = v;
      if (v && !running) { running = true; lastTs = 0; rafId = requestAnimationFrame(frame); }
      if (!v && running) { running = false; cancelAnimationFrame(rafId); }
    }
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(function (entries) { setVisible(entries[0].isIntersecting); }, { threshold: 0.05 }).observe(box);
    } else {
      setVisible(true);
    }

    // picking
    var ray = new T.Raycaster(), ndc = new T.Vector2();
    function pick(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(meshes.filter(function (m) { return m.visible; }));
      if (!hits.length) { highlight.visible = false; setText('raw-readout', rawReadout(null)); return; }
      var m = hits[0].object;
      highlight.visible = true;
      highlight.position.copy(m.position);
      highlight.scale.set(m.scale.x * 1.12, m.scale.y + 0.06, m.scale.z * 1.12);
      setText('raw-readout', rawReadout(m.userData.row));
      if (!running) renderOnce();
    }
    var cv = renderer.domElement;
    cv.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
      lastInteract = performance.now();
    });
    cv.addEventListener('pointermove', function (e) {
      if (drag && drag.id === e.pointerId) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) {
          if (!drag.moved) { drag.moved = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
          dragTheta = Math.max(-1.3, Math.min(1.3, dragTheta - dx * 0.008));
          phi = Math.max(0.05, Math.min(0.95, phi + dy * 0.004));
        }
        drag.x = e.clientX; drag.y = e.clientY;
        lastInteract = performance.now();
        if (!running) renderOnce();
      } else if (e.pointerType === 'mouse') {
        pick(e.clientX, e.clientY);
      }
    });
    function endDrag(e) {
      if (!drag) return;
      if (!drag.moved) pick(e.clientX, e.clientY);
      drag = null;
      lastInteract = performance.now();
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', function () { drag = null; });
    cv.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !drag) { highlight.visible = false; setText('raw-readout', rawReadout(null)); }
    });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { layout(); renderOnce(); }).observe(box);
    } else {
      window.addEventListener('resize', function () { layout(); renderOnce(); });
    }
    update();
    return { update: update };
  }

  /* ---------- presentation extras (all optional) ---------- */

  function initScrollSpy() {
    var sections = document.querySelectorAll('.site-section');
    var tabs = document.querySelectorAll('.nav-tab');
    function update() {
      var current = '';
      Array.prototype.forEach.call(sections, function (sec) {
        if (window.scrollY >= sec.offsetTop - 250) current = sec.id;
      });
      Array.prototype.forEach.call(tabs, function (t) {
        t.classList.toggle('active', t.getAttribute('data-target') === current);
      });
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function initSpotlightCards() {
    if (reduceMotion) return;
    Array.prototype.forEach.call(document.querySelectorAll('.spotlight-card'), function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--mouse-y', (e.clientY - rect.top) + 'px');
      });
    });
  }

  // One decorative WebGL context at most. Not needed for anything; static when reduced motion is requested.
  function initBackground() {
    var canvas = $('globe-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (e) {
      return;
    }
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 16;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var earth = new THREE.Group();
    scene.add(earth);
    function place() {
      if (window.innerWidth < 768) earth.position.set(0, 1.8, -5);
      else earth.position.set(4.8, 0.6, -1.5);
    }
    place();

    earth.add(new THREE.Mesh(
      new THREE.SphereGeometry(5.3, 44, 44),
      new THREE.MeshBasicMaterial({ color: 0xff5e2b, wireframe: true, transparent: true, opacity: 0.09 })
    ));

    var count = 2000;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var cA = new THREE.Color(0xffb703), cO = new THREE.Color(0xff5e2b), cS = new THREE.Color(0x475569);
    for (var i = 0; i < count; i++) {
      var phi = Math.acos(-1 + (2 * i) / count);
      var theta = Math.sqrt(count * Math.PI) * phi;
      var r = 5.33;
      pos[i * 3] = r * Math.cos(theta) * Math.sin(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(phi);
      var c = i % 11 === 0 ? cA : i % 5 === 0 ? cO : cS; // decorative pattern, not data
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    earth.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.068, vertexColors: true, transparent: true, opacity: 0.9 })));

    function ring(radius, color, tx, ty) {
      var m = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.02, radius + 0.02, 96),
        new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
      );
      m.rotation.x = tx; m.rotation.y = ty;
      earth.add(m);
    }
    ring(6.4, 0xff5e2b, Math.PI / 2.4, 0.3);
    ring(6.9, 0x38bdf8, Math.PI / 1.8, -0.4);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      place();
      if (reduceMotion) renderer.render(scene, camera);
    });

    if (reduceMotion) {
      earth.rotation.y = 0.6;
      renderer.render(scene, camera);
      return;
    }
    (function animate() {
      requestAnimationFrame(animate);
      if (bgPaused) return; // the 3D chart is on screen: save the GPU for it
      earth.rotation.y += 0.0018;
      renderer.render(scene, camera);
    })();
  }
})();
