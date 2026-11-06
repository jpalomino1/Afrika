/* Alfajor Afrika · motor de scroll cinematográfico
   Sin dependencias. Un solo bucle rAF que (1) suaviza la posición de scroll,
   (2) calcula el progreso de cada escena y lo publica como variables CSS
   (--p, --in, --out) y (3) ejecuta ganchos puntuales (palabras, pila de tarjetas,
   pasos). El scroll nativo no se secuestra: táctil, teclado y lectores siguen igual. */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover:hover) and (pointer:fine)');

  /* ───────── Menú ───────── */
  var btn = $('#menuBtn'), nav = $('#nav'), topbar = $('#topbar'), barEl = $('.bar', topbar);
  function closeMenu() { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ───────── Utilidades de texto ───────── */
  function splitLetters(el) {
    var txt = el.textContent.trim();
    el.textContent = '';
    var sr = document.createElement('span');
    sr.className = 'sr'; sr.textContent = txt; el.appendChild(sr);
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    txt.split('').forEach(function (c, i) {
      var s = document.createElement('span');
      s.className = 'ch'; s.style.setProperty('--ci', i + (el.classList.contains('t-afrika') ? 7 : 0));
      s.textContent = c; vis.appendChild(s);
    });
    el.appendChild(vis);
  }
  function splitWords(el) {
    var out = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) if (/\S/.test(n.nodeValue)) nodes.push(n);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (t) {
        if (!t) return;
        if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
        var s = document.createElement('span'); s.className = 'w'; s.textContent = t;
        frag.appendChild(s); out.push(s);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return out;
  }
  $$('[data-split]').forEach(splitLetters);

  /* Marquee de características: duplicados decorativos */
  (function () {
    var ul = $('.chips.row-a'); if (!ul) return;
    var items = $$('li', ul);
    for (var k = 0; k < 2; k++) items.forEach(function (li) {
      var c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.appendChild(c);
    });
    var b = ul.cloneNode(true); b.className = 'chips row-b'; b.setAttribute('aria-hidden', 'true');
    ul.parentNode.appendChild(b);
  })();

  /* ───────── Motor ───────── */
  var fx = false, scenes = [], vh = 0, ys = 0, raf = 0, last = 0;
  var ptr = { x: 0, y: 0, sx: 0, sy: 0, on: false };
  var heroPin = $('.hero .pin'), heroScene = $('.hero');

  var hooks = {};
  function addWords(s) {
    var els = $$('[data-words]', s.el);
    s.words = [];
    els.forEach(function (e) { s.words = s.words.concat(splitWords(e)); });
    s.wf = parseFloat(s.el.getAttribute('data-from')) || 0.1;
    s.wt = parseFloat(s.el.getAttribute('data-to')) || 0.8;
    s.wc = [];
  }
  function lightWords(s, p) {
    var n = s.words.length, prog = clamp((p - s.wf) / (s.wt - s.wf), 0, 1) * (n + 7);
    for (var i = 0; i < n; i++) {
      var v = clamp((prog - i) / 7, 0, 1), q = Math.round(v * 40);
      if (s.wc[i] !== q) { s.wc[i] = q; s.words[i].style.opacity = (0.16 + v * 0.84).toFixed(2); }
    }
  }
  function clearWords(s) { (s.words || []).forEach(function (w) { w.style.opacity = ''; }); s.wc = []; }

  hooks.about = {
    init: addWords,
    update: function (s, p) { lightWords(s, p); },
    reset: clearWords
  };
  hooks.obj = hooks.about;

  hooks.hero = {
    update: function (s) {
      heroPin.style.setProperty('--mx', ptr.sx.toFixed(3));
      heroPin.style.setProperty('--my', ptr.sy.toFixed(3));
      heroPin.style.setProperty('--gx', (50 + ptr.sx * 40).toFixed(1) + '%');
      heroPin.style.setProperty('--gy', (38 + ptr.sy * 40).toFixed(1) + '%');
    },
    reset: function () { ['--mx', '--my', '--gx', '--gy'].forEach(function (k) { heroPin.style.removeProperty(k); }); }
  };

  hooks.flavors = {
    init: function (s) {
      s.count = $('.fl-count', s.el); s.idx = -1;
      s.dark = [false, true, true, false];
    },
    update: function (s, p) {
      var n = 4, i = clamp(Math.round(p * (n - 1)), 0, n - 1);
      if (i !== s.idx) {
        s.idx = i; s.count.textContent = (i + 1) + ' / ' + n;
        s.el.classList.toggle('dk', !!s.dark[i]);
      }
    },
    reset: function (s) { s.el.classList.remove('dk'); s.idx = -1; }
  };

  hooks.goals = {
    init: function (s) { s.lis = $$('.goals li', s.el); },
    measure: function (s) {
      var ul = $('.goals', s.el), ulTop = ul.getBoundingClientRect().top + window.pageYOffset;
      s.nat = s.lis.map(function (li) { return ulTop + li.offsetTop; });
      s.stk = s.lis.map(function (li) { return parseFloat(getComputedStyle(li).top) || 0; });
    },
    update: function (s, p, i, o, y) {
      var n = s.lis.length, cum = 0;
      for (var k = n - 1; k >= 0; k--) {
        var br = 1 - cum * 0.32;
        s.lis[k].style.setProperty('--sc', (1 - cum * 0.05).toFixed(4));
        s.lis[k].style.setProperty('--br', br.toFixed(3));
        if (k > 0) {
          var nextTop = Math.max(s.nat[k] - y, s.stk[k]);
          cum += clamp((vh - nextTop) / (vh - s.stk[k]), 0, 1) >= 1 ? 1 : clamp((vh - nextTop) / (vh - s.stk[k]), 0, 1);
          cum = Math.min(cum, 3);
        }
      }
    },
    reset: function (s) { s.lis.forEach(function (li) { li.style.removeProperty('--sc'); li.style.removeProperty('--br'); }); }
  };

  hooks.res = {
    init: function (s) { s.lis = $$('.results li', s.el); s.fc = []; },
    measure: function (s) {
      s.ctr = s.lis.map(function (li) {
        var r = li.getBoundingClientRect();
        // se mide sin transform vertical: sólo hay translateX/scale, el centro Y no cambia
        return r.top + window.pageYOffset + r.height / 2;
      });
    },
    update: function (s, p, i, o, y) {
      for (var k = 0; k < s.lis.length; k++) {
        var d = Math.abs(s.ctr[k] - (y + vh * 0.5)) / (vh * 0.34);
        var f = clamp(1 - d, 0, 1), q = Math.round(f * 50);
        if (s.fc[k] !== q) { s.fc[k] = q; s.lis[k].style.setProperty('--f', (q / 50).toFixed(2)); }
      }
    },
    reset: function (s) { s.lis.forEach(function (li) { li.style.removeProperty('--f'); }); s.fc = []; }
  };

  hooks.proc = {
    init: function (s) {
      s.steps = $$('.step', s.el); s.idx = -1;
      var dots = document.createElement('div');
      dots.className = 'dots'; dots.setAttribute('role', 'group'); dots.setAttribute('aria-label', 'Ir al paso');
      s.dots = s.steps.map(function (st, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.setAttribute('aria-label', 'Paso ' + (i + 1) + ': ' + $('h3', st).textContent);
        b.addEventListener('click', function () {
          var range = s.h - vh;
          window.scrollTo({ top: s.top + ((i + 0.55) / s.steps.length) * range, behavior: mqReduce.matches ? 'auto' : 'smooth' });
        });
        dots.appendChild(b); return b;
      });
      $('.pin', s.el).appendChild(dots); s.dotsEl = dots;
    },
    update: function (s, p) {
      var i = clamp(Math.floor(p * s.steps.length), 0, s.steps.length - 1);
      if (i === s.idx) return;
      s.idx = i;
      s.dots.forEach(function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      s.steps.forEach(function (st, k) { $('.ph', st).tabIndex = k === i ? 0 : -1; });
    },
    reset: function (s) {
      s.idx = -1;
      s.steps.forEach(function (st) { $('.ph', st).removeAttribute('tabindex'); });
    }
  };

  hooks.share = {
    init: function (s) { s.qr = $('.qr-box', s.el); },
    reset: function (s) { if (s.qr) { s.qr.style.removeProperty('--rx'); s.qr.style.removeProperty('--ry'); } }
  };

  function collect() {
    scenes = $$('[data-scene]').map(function (el) {
      var name = el.getAttribute('data-scene');
      var s = { el: el, name: name, pin: el.hasAttribute('data-pin'), top: 0, h: 0, vis: false, hook: hooks[name] || null, c: {} };
      if (s.hook && s.hook.init) s.hook.init(s);
      return s;
    });
  }

  function measure() {
    vh = window.innerHeight;
    scenes.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      s.top = r.top + window.pageYOffset; s.h = r.height;
    });
    scenes.forEach(function (s) { if (s.hook && s.hook.measure) s.hook.measure(s); });
  }

  function setVar(s, k, v) {
    if (Math.abs((s.c[k] === undefined ? -9 : s.c[k]) - v) > 0.0004) {
      s.c[k] = v; s.el.style.setProperty(k, v.toFixed(4));
    }
  }

  function update(y) {
    for (var k = 0; k < scenes.length; k++) {
      var s = scenes[k];
      var near = y + vh * 1.3 > s.top && y - vh * 0.3 < s.top + s.h;
      if (!near && !s.vis) continue;
      s.vis = near;
      var range = s.pin ? Math.max(1, s.h - vh) : s.h + vh;
      var p = s.pin ? clamp((y - s.top) / range, 0, 1) : clamp((y + vh - s.top) / range, 0, 1);
      var inn = clamp((y + vh - s.top) / vh, 0, 1);
      var out = clamp((y - (s.top + s.h - vh)) / vh, 0, 1);
      setVar(s, '--p', p); setVar(s, '--in', inn); setVar(s, '--out', out);
      if (s.hook && s.hook.update) s.hook.update(s, p, inn, out, y);
    }
    // barra de progreso global
    var max = root.scrollHeight - vh;
    barEl.style.setProperty('--sp', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0);
  }

  function frame(t) {
    raf = 0;
    var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    var y = window.pageYOffset;
    ys += (y - ys) * (1 - Math.exp(-dt * 10));
    if (Math.abs(y - ys) < 0.2) ys = y;
    var kp = 1 - Math.exp(-dt * 6);
    ptr.sx += (ptr.x - ptr.sx) * kp; ptr.sy += (ptr.y - ptr.sy) * kp;
    var moving = Math.abs(ptr.x - ptr.sx) > 0.002 || Math.abs(ptr.y - ptr.sy) > 0.002;
    update(ys);
    if (ys !== y || moving) raf = requestAnimationFrame(frame);
  }
  function kick() { if (fx && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* Puntero: sólo dispositivos con mouse. En táctil todo va por scroll. */
  window.addEventListener('pointermove', function (e) {
    if (!fx || e.pointerType === 'touch' || !mqFine.matches) return;
    ptr.x = (e.clientX / window.innerWidth - 0.5) * 2;
    ptr.y = (e.clientY / window.innerHeight - 0.5) * 2;
    kick();
  }, { passive: true });

  /* Tilt local y botones magnéticos (sólo mouse) */
  $$('[data-tilt]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      if (!fx || e.pointerType === 'touch' || !mqFine.matches) return;
      var r = el.getBoundingClientRect();
      el.classList.add('hot');
      el.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 24).toFixed(2));
      el.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 20).toFixed(2));
    });
    el.addEventListener('pointerleave', function () {
      el.classList.remove('hot'); el.style.setProperty('--ry', 0); el.style.setProperty('--rx', 0);
    });
  });
  $$('.btn').forEach(function (b) {
    b.addEventListener('pointermove', function (e) {
      if (!fx || e.pointerType === 'touch' || !mqFine.matches) return;
      var r = b.getBoundingClientRect();
      b.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
      b.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px');
    });
    b.addEventListener('pointerleave', function () { b.style.removeProperty('--tx'); b.style.removeProperty('--ty'); });
  });

  /* ───────── Partículas (polvo de harina) ───────── */
  var dust = $('#dust'), dctx = dust.getContext('2d'), parts = [], dW = 0, dH = 0, dRaf = 0, dY = 0;
  function dustSize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    dW = window.innerWidth; dH = window.innerHeight;
    dust.width = dW * dpr; dust.height = dH * dpr; dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function dustInit() {
    var n = window.innerWidth < 700 ? 22 : 44;
    parts = [];
    for (var i = 0; i < n; i++) parts.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, r: 1 + Math.random() * 2.6, ph: Math.random() * 6.28, hot: Math.random() < 0.3 });
  }
  function dustDraw(t) {
    dRaf = 0;
    if (!fx || document.hidden) return;
    dctx.clearRect(0, 0, dW, dH);
    dY += (ys - dY) * 0.08;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var y = ((p.y * dH - dY * 0.35 * p.z - t * 0.012 * p.z) % dH + dH) % dH;
      var x = p.x * dW + Math.sin(t * 0.0004 + p.ph) * 18 * p.z;
      dctx.globalAlpha = 0.16 + p.z * 0.4;
      dctx.fillStyle = p.hot ? '#FFD28A' : '#FFF6E6';
      dctx.beginPath(); dctx.arc(x, y, p.r * p.z * 1.1, 0, 6.283); dctx.fill();
    }
    dRaf = requestAnimationFrame(dustDraw);
  }
  function dustStart() { if (!dRaf && fx) dRaf = requestAnimationFrame(dustDraw); }
  document.addEventListener('visibilitychange', dustStart);

  /* ───────── Modo de movimiento ───────── */
  function setFx(on) {
    fx = on;
    root.classList.toggle('fx', on);
    if (on) {
      ys = window.pageYOffset; dY = ys;
      measure(); update(ys); dustSize(); dustInit(); dustStart();
    } else {
      scenes.forEach(function (s) {
        ['--p', '--in', '--out'].forEach(function (k) { s.el.style.removeProperty(k); });
        s.c = {}; s.vis = false;
        if (s.hook && s.hook.reset) s.hook.reset(s);
      });
      barEl.style.removeProperty('--sp');
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
  }
  collect();
  setFx(!mqReduce.matches);
  var onMq = function () { setFx(!mqReduce.matches); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMq); else if (mqReduce.addListener) mqReduce.addListener(onMq);

  /* Scroll / resize */
  window.addEventListener('scroll', function () {
    topbar.classList.toggle('solid', window.pageYOffset > 40);
    kick();
  }, { passive: true });
  topbar.classList.toggle('solid', window.pageYOffset > 40);

  var lastW = window.innerWidth, rzT = 0;
  function remeasure() {
    if (!fx) return;
    measure(); dustSize(); kick();
  }
  window.addEventListener('resize', function () {
    // en móviles la barra del navegador cambia la altura al hacer scroll: ignorar ese ruido
    var w = window.innerWidth;
    if (w === lastW && Math.abs(window.innerHeight - vh) < 140) { return; }
    lastW = w; clearTimeout(rzT); rzT = setTimeout(function () { dustInit(); remeasure(); }, 120);
  });
  window.addEventListener('orientationchange', function () { setTimeout(remeasure, 250); });
  if ('ResizeObserver' in window) {
    var roT = 0;
    new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(remeasure, 80); }).observe($('main'));
  }
  window.addEventListener('load', function () { remeasure(); });

  /* Entrada: esperar fuentes + foto principal (máx. 1.6 s) y recién ahí disparar la secuencia */
  var ready = false;
  function go() {
    if (ready) return; ready = true;
    root.classList.add('ready');
    remeasure();
  }
  var hero = $('.frame img'), waits = [];
  if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
  if (hero && hero.decode) waits.push(hero.decode().catch(function () {}));
  Promise.all(waits).then(function () { requestAnimationFrame(go); }, go);
  setTimeout(go, 1600);

  /* ───────── Secciones activas en el menú ───────── */
  if ('IntersectionObserver' in window) {
    var links = {};
    $$('a', nav).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && links[e.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove('active'); });
          links[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach(function (s) { so.observe(s); });
  }

  /* ───────── Lightbox ───────── */
  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap');
  $$('.ph').forEach(function (b) {
    b.addEventListener('click', function () {
      lbImg.src = b.dataset.full;
      lbImg.alt = $('img', b).alt;
      lbCap.textContent = b.dataset.cap || '';
      if (lb.showModal) lb.showModal(); else lb.setAttribute('open', '');
    });
  });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });

  /* ───────── Código QR de esta misma página ───────── */
  var url = location.href.split('#')[0];
  var canvas = $('#qr');
  function drawQR(cv, size) {
    var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    var n = qr.getModuleCount(), quiet = 2, cell = Math.floor(size / (n + quiet * 2));
    var total = cell * (n + quiet * 2);
    cv.width = cv.height = total;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = '#2B2118';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  try { drawQR(canvas, 600); } catch (e) { $('.qr-box').hidden = true; }

  var msg = $('#copyMsg');
  function say(t) { msg.textContent = t; setTimeout(function () { msg.textContent = ''; }, 3000); }

  $('#btnCopy').addEventListener('click', function () {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { say('¡Enlace copiado!'); }, function () { say(url); });
    } else { say(url); }
  });
  $('#btnQr').addEventListener('click', function () {
    var big = document.createElement('canvas'); drawQR(big, 1200);
    var a = document.createElement('a');
    a.download = 'qr-alfajor-afrika.png'; a.href = big.toDataURL('image/png'); a.click();
  });
  if (navigator.share) {
    var sh = $('#btnShare'); sh.hidden = false;
    sh.addEventListener('click', function () {
      navigator.share({ title: document.title, text: 'Conocé el alfajor Afrika', url: url }).catch(function () {});
    });
  }
})();
