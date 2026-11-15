/**
 * api.js — the ONLY place where the site loads data.
 * Design and first version: Mykhailo Revuzhenko (P1t0n). Rework with AI assistance (Claude).
 *
 * Today it reads pre-computed static JSON files (contract v2, see CLAUDE.md and
 * public/data/README.md). To switch to a live backend later, change only this file.
 * Every function resolves to parsed JSON, or null when the file is missing or broken.
 */
(function () {
  'use strict';

  // Relative path: works on GitHub Pages under a sub-path such as /p1t0n/.
  var BASE = './public/data/';
  var cache = {};

  function getJSON(path) {
    if (Object.prototype.hasOwnProperty.call(cache, path)) return cache[path];
    var p = fetch(BASE + path, { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
    cache[path] = p;
    return p;
  }

  function safeId(id) {
    return String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  }

  window.P1t0nAPI = {
    base: BASE,
    getManifest: function () { return getJSON('manifest.json'); },
    getRegions: function () { return getJSON('regions.json'); },
    getCalendar: function (regionId) {
      var id = safeId(regionId);
      return id ? getJSON('calendar/' + id + '.json') : Promise.resolve(null);
    },
    getFires: function (month) {
      if (!/^\d{4}-\d{2}$/.test(String(month))) return Promise.resolve(null);
      return getJSON('fires/UA/' + month + '.json');
    },
    getMetrics: function () { return getJSON('metrics.json'); },
    getCoefficients: function () { return getJSON('coefficients.json'); },
    // World grid: [[lat, lon, count], ...], lat/lon = south-west corner of a 1° cell, harmonized count.
    getWorldCells: function (month) {
      if (!/^\d{4}-\d{2}$/.test(String(month))) return Promise.resolve(null);
      return getJSON('world_cells/' + month + '.json');
    },
    // Yearly raw counts: {ukraine: [{year, modis, viirs, ratio}], world: [...]}
    getRawSeries: function () { return getJSON('raw_series.json'); },
    // Held-out months 2021–2025: {ukraine: [{year, month, snpp, modis_scaled, modis_raw}], world: [...]}
    getValidation: function () { return getJSON('validation.json'); },
    getOutlookMetrics: function () { return getJSON('outlook/metrics.json'); }
  };
})();
