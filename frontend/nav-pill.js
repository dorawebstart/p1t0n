// Navigation "tab pill": one ember pill slides under the active section tab.
// Two springs, one per edge. The edge in the direction of travel is stiff, the other is soft,
// so the pill stretches toward the new tab and then pulls its tail in.
// Rebuilt from the "Tab pill" motion study (designbookmark.com/motion#db-tab-pill), plain JS, no dependencies.
// Spring values come from CSS tokens --spring-lead / --spring-trail ("stiffness damping") in style.css.
(function () {
  'use strict';
  var nav = document.querySelector('.nav-links');
  if (!nav) return;
  var tabs = Array.prototype.slice.call(nav.querySelectorAll('.nav-tab'));
  if (!tabs.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var p = (v || fallback).split(/\s+/).map(Number);
    return p.length === 2 && p.every(isFinite) ? p : fallback.split(/\s+/).map(Number);
  }
  var LEAD = token('--spring-lead', '620 36');
  var TRAIL = token('--spring-trail', '190 19');

  // Spring: x position, v velocity, t target, k stiffness, c damping (same integrator as the study).
  function S(x) { return { x: x, v: 0, t: x, k: 400, c: 30 }; }
  function tune(s, kc) { s.k = kc[0]; s.c = reduce ? 2 * Math.sqrt(kc[0]) : kc[1]; }
  function step(s, dt) { var a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; }
  function settled(s) { return Math.abs(s.x - s.t) < 0.05 && Math.abs(s.v) < 0.05; }

  var pill = document.createElement('span');
  pill.className = 'nav-pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.insertBefore(pill, nav.firstChild);
  nav.classList.add('has-pill');

  var A = S(0), B = S(0);   // left and right edge, px from the nav's left padding box
  var cur = -1, raf = 0, last = 0, frameAt = 0, guard = 0;

  function render() {
    pill.style.transform = 'translateX(' + A.x.toFixed(2) + 'px)';
    pill.style.width = Math.max(0, B.x - A.x).toFixed(2) + 'px';
  }
  function snapToTarget() { A.x = A.t; B.x = B.t; A.v = B.v = 0; render(); }
  function loop(now) {
    frameAt = performance.now();
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    for (var k = 0; k < 4; k++) { step(A, dt / 4); step(B, dt / 4); }
    render();
    if (settled(A) && settled(B)) { A.x = A.t; B.x = B.t; A.v = B.v = 0; render(); raf = 0; return; }
    raf = requestAnimationFrame(loop);
  }
  function kick() {
    var now = performance.now();
    // A frame request that never ran (throttled or hidden page): drop it and start again.
    if (raf && now - frameAt > 250) { cancelAnimationFrame(raf); raf = 0; }
    if (!raf) { last = now; frameAt = now; raf = requestAnimationFrame(loop); }
    // If no frames come at all, put the pill in place without animating.
    clearTimeout(guard);
    guard = setTimeout(function () { if (raf && performance.now() - frameAt > 250) { cancelAnimationFrame(raf); raf = 0; snapToTarget(); } }, 300);
  }

  function pick(i, snap) {
    if (i < 0) { pill.style.opacity = '0'; cur = -1; return; }
    pill.style.opacity = '1';
    var el = tabs[i];
    var dir = cur < 0 ? 0 : (i > cur ? 1 : (i < cur ? -1 : 0));
    cur = i;
    A.t = el.offsetLeft; B.t = el.offsetLeft + el.offsetWidth;
    // Phones: the tab bar scrolls sideways; keep the active tab in view.
    if (nav.scrollWidth > nav.clientWidth + 1 && (A.t < nav.scrollLeft || B.t > nav.scrollLeft + nav.clientWidth)) {
      var left = Math.max(0, A.t - (nav.clientWidth - (B.t - A.t)) / 2);
      try { nav.scrollTo({ left: left, behavior: reduce || snap ? 'auto' : 'smooth' }); } catch (e) { nav.scrollLeft = left; }
    }
    if (dir > 0) { tune(B, LEAD); tune(A, TRAIL); } else if (dir < 0) { tune(A, LEAD); tune(B, TRAIL); } else { tune(A, LEAD); tune(B, LEAD); }
    if (snap) { A.x = A.t; B.x = B.t; A.v = B.v = 0; render(); return; }
    kick();
  }
  function activeIndex() {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains('active')) return i;
    return -1;
  }

  // After a click the page scrolls through the sections in between; hold the pill on the clicked tab
  // until scrolling stops, so it does not hop through every tab on the way.
  var hold = -1, holdTimer = 0;
  function release() { hold = -1; var i = activeIndex(); if (i !== cur) pick(i); }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      hold = i; pick(i);
      clearTimeout(holdTimer); holdTimer = setTimeout(release, 1200);
    });
  });
  window.addEventListener('scroll', function () {
    if (hold < 0) return;
    clearTimeout(holdTimer); holdTimer = setTimeout(release, 180);
  }, { passive: true });

  // The scroll spy in app.js toggles .active; follow it.
  new MutationObserver(function () {
    if (hold >= 0) return;
    var i = activeIndex();
    if (i !== cur) pick(i);
  }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // Tab widths change with fonts and breakpoints: jump to the new place without animating.
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var i = cur; cur = -1; pick(i, true); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { var i = cur; cur = -1; pick(i < 0 ? activeIndex() : i, true); });

  pick(activeIndex(), true);
})();
