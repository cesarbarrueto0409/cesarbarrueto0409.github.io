/* motion.js: animaciones del rediseño Premium (propuesta 10/11/2026).
   - Solo se activa sin prefers-reduced-motion. Sin JS, la página queda completa y estática.
   - Scroll suave con Lenis si está cargado (opcional); si no, usa el scroll nativo.
   - Todo lo que depende del mouse (botones magnéticos, foco del contacto) se omite en pantallas táctiles. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduce.matches) return;
  root.classList.add('motion');

  var lenis = null;
  var NAV_OFFSET = 72;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- Revelado al entrar en pantalla ---------- */

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); if (e.target._onIn) e.target._onIn(); }
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }) : null;

  function watch(el, onIn) {
    if (!el) return;
    if (onIn) el._onIn = onIn;
    if (io) io.observe(el); else { el.classList.add('is-in'); if (onIn) onIn(); }
  }

  /* Divide un texto en palabras con máscara. Se repite al cambiar de idioma (i18n reescribe el texto). */
  function splitWords(el, start) {
    var words = [];
    var nodes = Array.prototype.slice.call(el.childNodes);
    var i = start || 0;
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        var parts = node.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          var w = document.createElement('span');
          w.className = 'w';
          w.setAttribute('aria-hidden', 'true');
          var inner = document.createElement('i');
          inner.textContent = p;
          inner.style.setProperty('--wi', i++);
          w.appendChild(inner);
          frag.appendChild(w);
          words.push(w);
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && !node.classList.contains('w') && !node.classList.contains('sec-num') && !node.classList.contains('visually-hidden')) {
        i = splitWords(node, i);
      }
    });
    return i;
  }

  function splitHeading(el) {
    if (!el) return;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    var done = el.classList.contains('is-in');
    el.querySelectorAll('[data-i18n]').forEach(function (part) { splitWords(part); });
    if (!el.querySelector('[data-i18n]')) splitWords(el);
    if (!done) watch(el);
  }

  var SPLIT = '.sec-head h2, .about__quote, .contact__title';
  function splitAll() {
    $$(SPLIT).forEach(function (h) {
      h.removeAttribute('aria-label');
      splitHeading(h);
    });
  }

  /* ---------- 1. Entrada del hero ---------- */

  function intro() {
    $$('.hero__line').forEach(function (line) {
      if (line.querySelector('.ln')) return;
      var span = document.createElement('span');
      span.className = 'ln';
      while (line.firstChild) span.appendChild(line.firstChild);
      line.appendChild(span);
    });
    var seq = ['.hero__eyebrow', '.hero__tagline', '.hero__lead', '.hero__actions', '.spec', '.hero__fig figcaption'];
    seq.forEach(function (sel, i) {
      var el = $(sel);
      if (el) { el.setAttribute('data-intro', ''); el.style.setProperty('--i', i); }
    });
    var start = function () {
      requestAnimationFrame(function () { root.classList.add('is-loaded'); });
      setTimeout(function () { root.classList.add('is-settled'); }, 2400);
    };
    if (document.fonts && document.fonts.ready) {
      var t = setTimeout(start, 900);
      document.fonts.ready.then(function () { clearTimeout(t); start(); });
    } else start();
  }

  window.replayIntro = function () {
    root.classList.remove('is-loaded', 'is-settled');
    void root.offsetWidth;
    setTimeout(function () {
      root.classList.add('is-loaded');
      setTimeout(function () { root.classList.add('is-settled'); }, 2400);
    }, 60);
  };

  /* ---------- 2. Scroll suave ---------- */

  function initLenis() {
    if (!window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    /* Las demos y los enlaces internos usan scrollIntoView: se redirige a Lenis. */
    var native = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (opts) {
      if (lenis && opts && typeof opts === 'object' && opts.behavior === 'smooth') {
        lenis.scrollTo(this, { offset: -NAV_OFFSET, duration: 1.4 });
      } else if (lenis && opts && typeof opts === 'object' && opts.behavior === 'instant') {
        lenis.scrollTo(this, { offset: -NAV_OFFSET, immediate: true });
      } else {
        native.apply(this, arguments);
      }
    };

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      var a = event.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(id === 'inicio' ? 0 : target, { offset: -NAV_OFFSET, duration: 1.4 });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  /* ---------- 3. Progreso, navegación que se oculta e indicador ---------- */

  var bar, header, lastY = 0;
  function initNav() {
    bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    header = $('.site-header');

    var links = $('.nav__links');
    if (!links) return;
    var ind = document.createElement('span');
    ind.className = 'nav__indicator';
    ind.setAttribute('aria-hidden', 'true');
    links.appendChild(ind);
    function place() {
      var cur = $('.nav__link[aria-current]', links);
      if (!cur) { ind.style.opacity = '0'; return; }
      var lr = links.getBoundingClientRect();
      var r = cur.getBoundingClientRect();
      ind.style.opacity = '1';
      ind.style.width = r.width + 'px';
      ind.style.transform = 'translateX(' + (r.left - lr.left) + 'px)';
    }
    new MutationObserver(place).observe(links, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
    window.addEventListener('resize', place);
    document.addEventListener('i18n:change', function () { setTimeout(place, 50); });
  }

  /* ---------- 6. Cifras que cuentan ---------- */

  function initCounters() {
    $$('.metric').forEach(function (m) {
      var n = $('.metric__n', m);
      if (!n || !n.firstChild || n.firstChild.nodeType !== 3) return;
      var text = n.firstChild.textContent;
      var match = text.match(/^(\D*)(\d+)(.*)$/);
      if (!match) return;
      var prefix = match[1], target = +match[2], suffix = match[3];
      var span = document.createElement('span');
      span.className = 'num';
      n.replaceChild(span, n.firstChild);
      /* "Top 6" cuenta hacia abajo (sube en el ranking); el resto, desde 0. */
      var from = /top/i.test(prefix) ? 40 : 0;
      span.textContent = prefix + from + suffix;
      n.setAttribute('aria-label', text + (n.textContent.slice(span.textContent.length) || ''));
      watch(m, function () {
        var t0 = performance.now(), dur = 1600;
        function step(t) {
          var p = clamp((t - t0) / dur, 0, 1);
          var e = 1 - Math.pow(1 - p, 4);
          span.textContent = prefix + Math.round(from + (target - from) * e) + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    });
  }

  /* ---------- 5 y 7. Proyectos, tablas y líneas ---------- */

  function initReveals() {
    /* clip-path oculta el área del elemento para IntersectionObserver: se observa a su contenedor. */
    ['.ptable__head', '.mx thead tr', '.about__dl', '.contact__links'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      var host = el.closest('.ptable, .mx-wrap, .about__main, .contact__box') || el.parentNode;
      el.setAttribute('data-wipe', '');
      var prev = host._onIn;
      watch(host, function () { el.classList.add('is-in'); if (prev) prev(); });
    });
    $$('.sec-lead, .about__body, .about__fig, .stack__also, .impact, .tl__item, .lab, .contact__body, .contact__kicker').forEach(function (el, i) {
      el.setAttribute('data-reveal', '');
      if (el.classList.contains('about__fig')) el.style.setProperty('--d', Array.prototype.indexOf.call(el.parentNode.children, el) * 2);
      watch(el);
    });
    var impact = $('.impact');
    if (impact) watch(impact);
    $$('.metric').forEach(function (m, i) { m.setAttribute('data-reveal', ''); m.style.setProperty('--d', i * 2); });
  }

  function revealRows() {
    var list = $('#projects-list');
    if (!list) return;
    $$('.prow', list).forEach(function (row, i) {
      if (row.hasAttribute('data-reveal')) return;
      row.setAttribute('data-reveal', '');
      row.style.setProperty('--d', i);
      watch(row);
    });
    initPipeline();
  }

  /* Pipeline del Coach: los pasos se encienden en orden mientras la fila está abierta y visible. */
  var pipeTimer = null;
  function initPipeline() {
    var pipe = $('.prow .pipe');
    if (!pipe || pipe._motion) return;
    pipe._motion = true;
    var steps = $$('.pipe__step', pipe);
    var i = -1;
    function tick() {
      i = (i + 1) % (steps.length + 3);
      steps.forEach(function (s, j) {
        s.classList.toggle('is-lit', j === i);
        s.classList.toggle('is-done', j < i);
      });
    }
    function start() { if (!pipeTimer) { pipe.classList.add('is-running'); i = -1; tick(); pipeTimer = setInterval(tick, 650); } }
    function stop() { clearInterval(pipeTimer); pipeTimer = null; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.5 }).observe(pipe);
    } else start();
  }

  /* ---------- 9. Botones magnéticos ---------- */

  function initMagnetic() {
    if (!finePointer.matches) return;
    document.addEventListener('pointermove', function (e) {
      var btn = e.target.closest && e.target.closest('.btn, .lang-switch__btn, .nav__link--contact');
      $$('.is-magnet').forEach(function (b) { if (b !== btn) { b.classList.remove('is-magnet'); b.style.transform = ''; } });
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      btn.classList.add('is-magnet');
      btn.style.transform = 'translate(' + (dx * 10).toFixed(1) + 'px,' + (dy * 8).toFixed(1) + 'px)';
    }, { passive: true });
  }

  /* ---------- 10 y 13. Efectos ligados al scroll ---------- */

  var tl, tlItems = [], aboutImgs = [];
  function initScrollFx() {
    tl = $('.tl');
    tlItems = tl ? $$('.tl__item', tl) : [];
    aboutImgs = $$('.about__photo img');
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);

    if (header) {
      var down = y > lastY + 4, up = y < lastY - 4;
      var menuOpen = $('.nav__menu.is-open');
      if (down && y > 240 && !menuOpen) header.classList.add('is-hidden');
      else if (up || y < 240) header.classList.remove('is-hidden');
    }
    lastY = y;

    aboutImgs.forEach(function (img) {
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) img.style.setProperty('--py', ((r.top + r.height / 2 - vh / 2) * -0.07).toFixed(1) + 'px');
    });

    if (tl) {
      var tr = tl.getBoundingClientRect();
      var p = clamp((vh * 0.65 - tr.top) / tr.height, 0, 1);
      tl.style.setProperty('--tl', p.toFixed(4));
      var lineY = vh * 0.65;
      tlItems.forEach(function (item) {
        item.classList.toggle('is-passed', item.getBoundingClientRect().top + 34 < lineY);
      });
    }
  }

  /* ---------- 11. Laboratorio ---------- */

  function initLab() {
    var tabs = $('.lab > .demos__selector .demos__tabs');
    if (!tabs) return;
    var ind = document.createElement('span');
    ind.className = 'lab-indicator';
    ind.setAttribute('aria-hidden', 'true');
    tabs.appendChild(ind);
    function place() {
      var cur = $('.demos__tab[aria-selected="true"]', tabs);
      if (!cur) return;
      ind.style.height = cur.offsetHeight + 'px';
      ind.style.transform = 'translateY(' + cur.offsetTop + 'px)';
    }
    new MutationObserver(place).observe(tabs, { attributes: true, subtree: true, childList: true, attributeFilter: ['aria-selected'] });
    window.addEventListener('resize', place);
    setTimeout(place, 300);
  }

  /* ---------- 12. Stack: aparición por columna y cruz al pasar el mouse ---------- */

  function initStack() {
    var mx = $('.mx');
    if (!mx) return;
    var r = 0;
    $$('tbody tr', mx).forEach(function (tr) {
      if (tr.classList.contains('mx__group')) return;
      r++;
      $$('td', tr).forEach(function (td, c) {
        var sq = $('.sq', td);
        if (sq) { sq.style.setProperty('--c', c); sq.style.setProperty('--r', r); }
      });
    });
    watch(mx);
    if (!finePointer.matches) return;
    function clear() { $$('.is-col', mx).forEach(function (c) { c.classList.remove('is-col'); }); }
    mx.addEventListener('pointerover', function (e) {
      var cell = e.target.closest('td, thead th');
      clear();
      if (!cell || cell.cellIndex < 1) return;
      var col = cell.cellIndex;
      $$('tr', mx).forEach(function (tr) {
        if (tr.classList.contains('mx__group')) return;
        var c = tr.cells[col];
        if (c) c.classList.add('is-col');
      });
    });
    mx.addEventListener('pointerleave', clear);
  }

  /* ---------- 14. Contacto: foco que sigue al cursor ---------- */

  function initContact() {
    var box = $('.contact__box');
    if (!box || !finePointer.matches) return;
    box.addEventListener('pointermove', function (e) {
      var r = box.getBoundingClientRect();
      box.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      box.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------- Arranque ---------- */

  function init() {
    intro();
    initLenis();
    initNav();
    initReveals();
    initCounters();
    initMagnetic();
    initScrollFx();
    initLab();
    initStack();
    initContact();

    var prows = $('#projects-list');
    if (prows) {
      revealRows();
      new MutationObserver(revealRows).observe(prows, { childList: true });
    }

    document.addEventListener('i18n:change', function () { splitAll(); });
    if (window.i18n && window.i18n.ready) window.i18n.ready.then(function () { setTimeout(splitAll, 0); });
    else splitAll();

    if (lenis) lenis.on('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    /* Respaldo: si algo no se reveló (por ejemplo, sin IntersectionObserver), se muestra todo. */
    setTimeout(function () {
      if (!io) $$('[data-reveal], [data-wipe]').forEach(function (el) { el.classList.add('is-in'); });
    }, 3000);
  }

  window.motionOff = function (off) {
    root.classList.toggle('motion', !off);
    if (lenis) { if (off) lenis.destroy(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
