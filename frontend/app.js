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
    scale: null
  };

  var map = null;
  var firesLayer = null;
  var canvasRenderer = null;

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
    safe(initProblemFigure);
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
    Promise.all([API.getManifest(), API.getRegions(), API.getMetrics(), API.getCoefficients()])
      .then(function (res) {
        var manifest = res[0], regions = res[1];
        state.manifest = manifest;
        applyManifest(manifest);
        renderMetrics(res[2]);
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
    state.regions.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name || r.id;
      select.appendChild(opt);
    });
    var hasUKR = state.regions.some(function (r) { return r.id === 'UKR'; });
    state.regionId = hasUKR ? 'UKR' : state.regions[0].id;
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
      [fromIn, toIn].forEach(function (inp) { inp.min = first; inp.max = last; });
      // Keep the user's range if it still fits; otherwise use the full range.
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
    setText('ro-z', isNum(z) ? fmtZ(z) + ' (harmonized series)' : 'n/a');
    if (isNum(row.p25_count) && isNum(row.p75_count)) {
      setText('ro-range', fmtInt(row.p25_count) + ' – ' + fmtInt(row.p75_count));
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
  }

  /* ---------- map ---------- */

  function initMap() {
    if (typeof L === 'undefined') {
      $('map-block').hidden = true;
      $('map-unavailable').hidden = false;
      return;
    }
    map = L.map('map', { center: [48.4, 31.2], zoom: 5, minZoom: 2, maxZoom: 14, scrollWheelZoom: false });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    canvasRenderer = L.canvas({ padding: 0.5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      className: 'dark-map-tiles'
    }).addTo(map);
    firesLayer = L.layerGroup().addTo(map);
    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { map.invalidateSize(); fitRegion(); }, 200);
    });
  }

  function fitRegion() {
    if (!map) return;
    map.invalidateSize();
    var size = map.getSize();
    if (!size.x || !size.y) return;
    var r = regionById(state.regionId);
    var isUA = state.regionId && state.regionId.indexOf('UKR') === 0;
    var bbox = isUA && r && Array.isArray(r.bbox) && r.bbox.length === 4 ? r.bbox : (regionById('UKR') || {}).bbox;
    if (Array.isArray(bbox) && bbox.length === 4) {
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [10, 10], animate: !reduceMotion });
    }
  }

  function loadFires() {
    state.fires = [];
    if (firesLayer) firesLayer.clearLayers();
    var key = state.selected;
    var isUA = state.regionId && state.regionId.indexOf('UKR') === 0;
    var available = state.fireMonths && state.fireMonths.length ? state.fireMonths.join(', ') : 'none yet';

    setText('map-title', isUA ? regionName(state.regionId) + ' hotspots' : 'Ukraine hotspots');
    if (!key) { setText('map-status', 'Select a month in the calendar.'); return; }
    if (!isUA) {
      setText('map-status', 'Point data exist for Ukraine only. Choose Ukraine or an oblast. Point data available for: ' + available + '.');
      return;
    }
    if (state.fireMonths && state.fireMonths.indexOf(key) === -1) {
      setText('map-status', 'No point data for ' + key + '. Point data available for: ' + available + '.');
      fitRegion();
      return;
    }
    setText('map-status', 'Loading points for ' + key + '…');
    var regionAtStart = state.regionId;
    API.getFires(key).then(function (pts) {
      if (key !== state.selected || regionAtStart !== state.regionId) return;
      if (!Array.isArray(pts)) {
        setText('map-status', 'No point data for ' + key + '. Point data available for: ' + available + '.');
        fitRegion();
        return;
      }
      var filtered = pts.filter(function (p) {
        if (!p || !isNum(p.lat) || !isNum(p.lon)) return false;
        if (state.regionId !== 'UKR' && p.region_id !== state.regionId) return false;
        if (state.pointsFilter !== 'all' && p.sensor !== state.pointsFilter) return false;
        return true;
      });
      state.fires = filtered;
      drawFires();
      var filterTxt = state.pointsFilter === 'all' ? 'MODIS + VIIRS' : state.pointsFilter;
      setText('map-status', fmtInt(filtered.length) + ' hotspots (' + filterTxt + ') in ' + monthLabel(key) +
        (isPrelim(key) ? ' — preliminary data' : '') + '.');
      fitRegion();
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

    function onRange() {
      var f = $('month-from').value, t = $('month-to').value;
      if (!state.rows.length) return;
      var first = ymKey(state.rows[0]), last = ymKey(state.rows[state.rows.length - 1]);
      if (!/^\d{4}-\d{2}$/.test(f)) f = first;
      if (!/^\d{4}-\d{2}$/.test(t)) t = last;
      if (f < first) f = first;
      if (t > last) t = last;
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
    $('month-from').addEventListener('change', onRange);
    $('month-to').addEventListener('change', onRange);

    var segBtns = document.querySelectorAll('#series-toggle .seg-btn');
    Array.prototype.forEach.call(segBtns, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(segBtns, function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.series = btn.getAttribute('data-series');
        if (state.rows.length) renderCalendar();
      });
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

  /* ---------- presentation extras (all optional) ---------- */

  function initProblemFigure() {
    var img = $('problem-img');
    var fig = $('problem-figure');
    if (!img || !fig) return;
    function hide() { fig.hidden = true; fig.parentNode.classList.add('no-figure'); }
    if (img.complete && img.naturalWidth === 0) hide();
    else img.addEventListener('error', hide);
  }

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
      earth.rotation.y += 0.0018;
      renderer.render(scene, camera);
    })();
  }
})();
