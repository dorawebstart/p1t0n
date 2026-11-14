// Segmented controls (mode switches): the ember highlight slides on one spring and its speed
// squashes it (wider, a touch shorter) so it reads as soft, then lands with a small overshoot.
// If the buttons carry data-cap, the helper line under the control swaps with a quick blur out
// and rise in. Rebuilt from the "Segmented control" motion study
// (designbookmark.com/motion#db-segmented-control), plain JS, no dependencies.
// Springs ("stiffness damping") are the study's: position 300 20, caption 300 26.
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var p = (v || fallback).split(/\s+/).map(Number);
    return p.length === 2 && p.every(isFinite) ? p : fallback.split(/\s+/).map(Number);
  }
  var POS = token('--spring-seg', '300 20');
  var CAP = token('--spring-seg-caption', '300 26');

  function S(x, kc) { return { x: x, v: 0, t: x, k: kc[0], c: reduce ? 2 * Math.sqrt(kc[0]) : kc[1] }; }
  function step(s, dt) { var a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; }
  function settled(s) { return Math.abs(s.x - s.t) < 0.02 && Math.abs(s.v) < 0.05; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var items = [];
  var raf = 0, last = 0, frameAt = 0, guard = 0;

  function setup(ctl) {
    var btns = Array.prototype.slice.call(ctl.querySelectorAll('.seg-btn'));
    if (btns.length < 2) return;
    var hl = document.createElement('span');
    hl.className = 'seg-hl';
    hl.setAttribute('aria-hidden', 'true');
    ctl.insertBefore(hl, ctl.firstChild);
    ctl.classList.add('has-hl');
    var help = ctl.nextElementSibling && ctl.nextElementSibling.classList.contains('helper') ? ctl.nextElementSibling : null;
    var hasCaps = !!(help && btns.some(function (b) { return b.hasAttribute('data-cap'); }));
    var it = { ctl: ctl, btns: btns, hl: hl, help: hasCaps ? help : null, X: S(0, POS), C: S(1, CAP), cur: -1, swap: 0, ready: false };
    if (it.help) it.help.classList.add('seg-cap');
    items.push(it);

    new MutationObserver(function () { sync(it, false); })
      .observe(ctl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // Sizes change with fonts, breakpoints and when a hidden control is shown: jump into place.
    if (window.ResizeObserver) new ResizeObserver(function () { sync(it, true); }).observe(ctl);
    sync(it, true);
  }

  function activeIndex(it) {
    for (var i = 0; i < it.btns.length; i++) if (it.btns[i].classList.contains('active')) return i;
    return -1;
  }

  function sync(it, snap) {
    var i = activeIndex(it);
    var b = it.btns[i];
    if (!b || !b.offsetWidth) { it.hl.style.opacity = i < 0 ? '0' : it.hl.style.opacity; return; }
    it.hl.style.opacity = '1';
    var changed = i !== it.cur;
    var first = it.cur < 0 || !it.ready;
    it.cur = i;
    it.X.t = b.offsetLeft;
    if (snap || first) { it.X.x = it.X.t; it.X.v = 0; }
    if (it.help && changed) caption(it, first || snap);
    it.ready = true;
    render(it);
    if (!snap) kick();
  }

  function caption(it, instant) {
    var text = it.btns[it.cur].getAttribute('data-cap');
    if (!text) return;
    clearTimeout(it.swap);
    if (instant || reduce) { it.help.textContent = text; it.C.x = it.C.t = 1; it.C.v = 0; return; }
    it.C.t = 0;
    it.swap = setTimeout(function () {
      it.help.textContent = it.btns[it.cur].getAttribute('data-cap') || '';
      it.C.x = -0.4; it.C.t = 1; kick();
    }, 140);
  }

  function render(it) {
    var b = it.btns[it.cur];
    if (!b) return;
    var sp = clamp(Math.abs(it.X.v) / 1400, 0, 0.22);
    var s = it.hl.style;
    s.width = b.offsetWidth + 'px';
    s.height = b.offsetHeight + 'px';
    s.top = b.offsetTop + 'px';
    s.transform = 'translateX(' + it.X.x.toFixed(2) + 'px) scale(' + (1 + sp).toFixed(4) + ',' + (1 - sp * 0.5).toFixed(4) + ')';
    if (it.help) {
      var c = it.C.x, cc = clamp(c, 0, 1), h = it.help.style;
      h.opacity = cc.toFixed(3);
      h.transform = 'translateY(' + (c < 0 ? -c * 10 : (1 - cc) * -6).toFixed(2) + 'px)';
      h.filter = cc >= 0.999 ? '' : 'blur(' + ((1 - cc) * 4).toFixed(2) + 'px)';
    }
  }

  function snapAll() {
    items.forEach(function (it) {
      var b = it.btns[it.cur];
      if (b && b.offsetWidth) it.X.t = b.offsetLeft;
      it.X.x = it.X.t; it.X.v = 0; it.C.x = it.C.t; it.C.v = 0; render(it);
    });
  }
  function loop(now) {
    frameAt = performance.now();
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    var moving = false;
    items.forEach(function (it) {
      // Re-read the target every frame (as the study does): the layout may shift while moving.
      var b = it.btns[it.cur];
      if (b && b.offsetWidth) it.X.t = b.offsetLeft;
      for (var k = 0; k < 4; k++) { step(it.X, dt / 4); step(it.C, dt / 4); }
      render(it);
      if (!settled(it.X) || !settled(it.C)) moving = true;
    });
    if (!moving) { snapAll(); raf = 0; return; }
    raf = requestAnimationFrame(loop);
  }
  function kick() {
    var now = performance.now();
    // A frame request that never ran (throttled or hidden page): drop it and start again.
    if (raf && now - frameAt > 250) { cancelAnimationFrame(raf); raf = 0; }
    if (!raf) { last = now; frameAt = now; raf = requestAnimationFrame(loop); }
    // If no frames come at all, put everything in place without animating.
    clearTimeout(guard);
    guard = setTimeout(function () { if (raf && performance.now() - frameAt > 250) { cancelAnimationFrame(raf); raf = 0; snapAll(); } }, 400);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.segmented-control'), setup);
  function resyncAll() { items.forEach(function (it) { sync(it, true); }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resyncAll);
  // Window resizes can reflow the buttons after the size observer fired: line up again once it settles.
  var rt = 0, rt2 = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt); clearTimeout(rt2);
    rt = setTimeout(resyncAll, 150);
    rt2 = setTimeout(resyncAll, 600);
  });
})();
