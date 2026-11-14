// Hero motion: three small effects on the first screen, rebuilt in plain JS (no dependencies)
// from the designbookmark.com/motion studies, in the site's colours and fonts.
//  1. Magnetic button  — "Open the burning calendar" leans toward a nearby cursor, its label leans
//     further, both spring home. Springs: button 170 13, label 220 15, press/scale 400 18.
//  2. Weight wave      — letters of "Harmonized Fire Calendar" gain weight near the pointer
//     (variable Playfair Display). Springs: letter weight 260 22, swell position 150 22.
//  3. Scramble text    — the top badge decodes letter by letter (monospace, so the width never jumps)
//     and cycles through a few facts about the project; hover decodes it again.
// Everything runs only while the hero is on screen; reduced motion turns 1 and 2 off and shows 3 plainly.
(function () {
  'use strict';
  var hero = document.getElementById('home');
  if (!hero) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function S(x, k, c) { return { x: x, v: 0, t: x, k: k, c: c }; }
  function step(s, dt) { var a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rest(s) { return Math.abs(s.x - s.t) < 0.01 && Math.abs(s.v) < 0.01; }

  var parts = [];   // each: { frame(dt, clock), render(), busy() }

  /* ---------- 1. Magnetic button ---------- */
  (function () {
    var btn = hero.querySelector('.btn-hero.btn-primary');
    if (!btn || reduce || !finePointer) return;
    btn.classList.add('magnetic');
    // Wrap the label and arrow so they can lean a little further than the button.
    var lbl = document.createElement('span');
    lbl.className = 'mag-lbl';
    while (btn.firstChild) lbl.appendChild(btn.firstChild);
    btn.appendChild(lbl);
    var R = 130;
    var bx = S(0, 170, 13), by = S(0, 170, 13), lx = S(0, 220, 15), ly = S(0, 220, 15), sc = S(1, 400, 18);
    var px = null, py = null, pressed = false;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      px = e.clientX; py = e.clientY; kick();
    }, { passive: true });
    document.addEventListener('pointerleave', function () { px = null; kick(); });
    btn.addEventListener('pointerdown', function () { pressed = true; sc.t = 0.94; kick(); });
    function up() { if (!pressed) return; pressed = false; sc.t = 1; sc.v = 3; kick(); }
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    parts.push({
      frame: function (dt) {
        var pull = 0, dx = 0, dy = 0;
        if (px !== null) {
          // Rest centre of the button = its box minus the current translate.
          var r = btn.getBoundingClientRect();
          var cx = r.left + r.width / 2 - bx.x, cy = r.top + r.height / 2 - by.x;
          dx = px - cx; dy = py - cy;
          var d = Math.hypot(dx, dy);
          pull = d < R ? 1 - d / R * 0.35 : 0;
        }
        bx.t = dx * 0.32 * pull; by.t = dy * 0.38 * pull;
        lx.t = dx * 0.14 * pull; ly.t = dy * 0.18 * pull;
        if (!pressed) sc.t = 1 + 0.06 * pull;
        step(bx, dt); step(by, dt); step(lx, dt); step(ly, dt); step(sc, dt);
      },
      render: function () {
        btn.style.transform = 'translate(' + bx.x.toFixed(2) + 'px,' + by.x.toFixed(2) + 'px) scale(' + sc.x.toFixed(4) + ')';
        lbl.style.transform = 'translate(' + lx.x.toFixed(2) + 'px,' + ly.x.toFixed(2) + 'px)';
      },
      busy: function () { return px !== null || !(rest(bx) && rest(by) && rest(lx) && rest(ly) && rest(sc)); }
    });
  })();

  /* ---------- 2. Weight wave on the title ---------- */
  (function () {
    var title = hero.querySelector('.landing-title');
    if (!title || reduce || !finePointer) return;   // no pointer to follow on phones; saves a relayout every frame
    var LIGHT = 600, BOLD = 900, SPREAD = 0.13;   // SPREAD: width of the swell, share of the title width
    title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
    var letters = [];
    // Split every text node into one span per letter; keeps <br> and the ember gradient span.
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var text = n.textContent.replace(/\s+/g, ' ');
          if (!text.trim()) return;
          var frag = document.createDocumentFragment();
          Array.prototype.forEach.call(text, function (ch) {
            var el = document.createElement('span');
            el.className = 'wch';
            el.textContent = ch;
            el.setAttribute('aria-hidden', 'true');
            frag.appendChild(el);
            letters.push({ el: el, w: S(700, 260, 22), c: 0 });
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') split(n);
      });
    })(title);
    title.classList.add('weight-wave');
    var focus = S(-0.2, 150, 22);   // where the swell is: 0 = left edge of the title, 1 = right edge
    var hover = false, t = 0, idle = true;
    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      var r = title.getBoundingClientRect();
      // Only near the title (within 160 px above or below it).
      if (e.clientY < r.top - 160 || e.clientY > r.bottom + 160) { if (hover) { hover = false; t = 0; } return; }
      hover = true;
      focus.t = (e.clientX - r.left) / r.width;
      kick();
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { hover = false; t = 0; kick(); });
    parts.push({
      frame: function (dt) {
        if (!hover) {
          // With nobody pointing, the swell sweeps across and back by itself.
          t += dt;
          focus.t = -0.06 + 1.12 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 4.6));
        }
        step(focus, dt);
        letters.forEach(function (l) { step(l.w, dt); });
      },
      render: function () {
        // Read every centre first, then write, so the title lays out once a frame.
        var r = title.getBoundingClientRect(), W = r.width || 1;
        letters.forEach(function (l) { var b = l.el.getBoundingClientRect(); l.c = (b.left + b.width / 2 - r.left) / W; });
        letters.forEach(function (l) {
          var d = (l.c - focus.x) / SPREAD;
          var g = Math.exp(-d * d);
          l.w.t = LIGHT + (BOLD - LIGHT) * g;
          l.el.style.fontWeight = clamp(l.w.x, 400, 900).toFixed(0);
        });
      },
      busy: function () { return idle; }   // the idle sweep keeps going while the hero is visible
    });
  })();

  /* ---------- 3. Scramble text on the badge ---------- */
  (function () {
    var badge = hero.querySelector('.orbital-badge');
    var line = badge && badge.querySelector('span:not(.radar-ping)');
    if (!line) return;
    var PHRASES = [
      line.textContent.trim(),
      'TEAM P1T0N • 25 YEARS OF NASA FIRMS HOTSPOTS ON ONE SCALE',
      'SUOMI NPP → NOAA-20 • THE FIRE RECORD CONTINUES AFTER 2 NOV 2026'
    ];
    badge.setAttribute('aria-live', 'off');
    line.setAttribute('aria-label', PHRASES[0]);
    if (reduce) return;   // keep the real text, no flicker
    var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
    function glyph() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
    var HOLD = 4.2, FLICKER = 0.055;   // long phrases: hold a bit longer than the study's 2.6 s
    line.classList.add('scramble');
    var cells = [], idx = 0, running = false, hold = HOLD, started = false, now = 0;
    var caret = document.createElement('span');
    caret.className = 'scr-caret';
    caret.setAttribute('aria-hidden', 'true');

    function decode(text) {
      var n = Math.max(text.length, cells.length);
      while (cells.length < n) {
        var el = document.createElement('span');
        el.className = 'scr-c';
        el.setAttribute('aria-hidden', 'true');
        line.insertBefore(el, caret);
        cells.push({ el: el });
      }
      cells.forEach(function (c, i) {
        c.to = text[i] === undefined ? '' : text[i];
        c.at = now + 0.18 + i * 0.022 + Math.random() * 0.28;   // when it settles
        c.tick = 0; c.done = false;
        c.el.classList.remove('ok');
      });
      running = true;
      line.setAttribute('aria-label', text);
    }
    function start() {
      // The real text stays in place until the first animation frame, so nothing is lost without frames.
      started = true;
      line.textContent = '';
      line.appendChild(caret);
      decode(PHRASES[0]);
    }
    badge.addEventListener('pointerenter', function () { if (started && !running) { decode(PHRASES[idx]); kick(); } });
    parts.push({
      frame: function (dt, clock) {
        now = clock;
        if (!started) { start(); return; }
        if (!running && (hold -= dt) <= 0) { idx = (idx + 1) % PHRASES.length; decode(PHRASES[idx]); }
      },
      render: function () {
        if (!started) return;
        if (running) {
          var left = 0;
          cells.forEach(function (c) {
            if (c.done) return;
            if (now >= c.at) {
              c.done = true;
              if (c.to === '') c.el.remove();
              else { c.el.textContent = c.to; c.el.classList.add('ok'); }
            } else {
              left++;
              if (c.to === ' ') { c.el.textContent = ' '; c.el.classList.add('ok'); }
              else if (now >= c.tick) { c.el.textContent = glyph(); c.tick = now + FLICKER; }
            }
          });
          if (!left) { cells = cells.filter(function (c) { return c.to !== ''; }); running = false; hold = HOLD; }
        }
        caret.style.opacity = running || (now * 1.8) % 2 < 1 ? 1 : 0;
      },
      busy: function () { return true; }   // cycles while the hero is visible
    });
  })();

  if (!parts.length) return;

  /* ---------- one loop, only while the hero is on screen ---------- */
  var visible = true, raf = 0, last = 0, clock = 0, frameAt = 0;
  function loop(ts) {
    frameAt = performance.now();
    var dt = Math.min((ts - last) / 1000, 1 / 30); last = ts; clock += dt;
    for (var k = 0; k < 4; k++) parts.forEach(function (p) { p.frame(dt / 4, clock); });
    parts.forEach(function (p) { p.render(); });
    var busy = parts.some(function (p) { return p.busy(); });
    if (visible && busy && !document.hidden) raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  function kick() {
    var now = performance.now();
    // A frame request that never ran (throttled tab): drop it and ask again.
    if (raf && now - frameAt > 250) { cancelAnimationFrame(raf); raf = 0; }
    if (!raf && visible && !document.hidden) { last = now; frameAt = now; raf = requestAnimationFrame(loop); }
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  kick();
})();
