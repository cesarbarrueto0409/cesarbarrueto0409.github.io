/* demos.js: sección #demos. Pestañas (escritorio), desplegable (móvil) y carga diferida.
   Cada demo vive en scripts/demos/<id>.js y se registra con Demos.register(id, def):
     def.label     nombre propio de la pestaña (o def.labelKey para una clave i18n)
     def.init(el, ctx)  construye la demo dentro de el; devuelve una promesa.
   ctx.loadChart() carga Chart.js por CDN una sola vez. */
(function () {
  'use strict';

  var ORDER = ['chilexpress', 'integra', 'polybeauchef', 'benchmark', 'segmentation'];
  var CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js';

  var registry = {};
  var state = { active: null, started: {}, visible: false };
  var chartPromise = null;

  function t(key, fallback) {
    return window.i18n ? window.i18n.t(key, fallback) : fallback;
  }

  function loadChart() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartPromise) return chartPromise;
    chartPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = CHART_SRC;
      script.async = true;
      script.onload = function () { resolve(window.Chart); };
      script.onerror = function () {
        chartPromise = null;
        script.remove();
        reject(new Error('Chart.js'));
      };
      document.head.appendChild(script);
    });
    return chartPromise;
  }

  function ids() {
    return ORDER.filter(function (id) { return registry[id]; });
  }

  /* ---------- Estados de carga y error ---------- */

  function showLoading(host) {
    host.innerHTML =
      '<div class="demo-state" role="status">' +
        '<div class="demo-skeleton" aria-hidden="true"></div>' +
        '<p data-i18n="demos.loading">' + t('demos.loading', 'Cargando demo…') + '</p>' +
      '</div>';
  }

  function showError(host, id, messageKey) {
    host.innerHTML =
      '<div class="demo-state demo-state--error" role="alert">' +
        '<p data-i18n="' + messageKey + '">' + t(messageKey, 'No se pudo cargar la demo.') + '</p>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-i18n="demo.retry">' + t('demo.retry', 'Reintentar') + '</button>' +
      '</div>';
    host.querySelector('button').addEventListener('click', function () {
      state.started[id] = false;
      start(id);
    });
  }

  function start(id) {
    if (state.started[id]) return;
    state.started[id] = true;
    var host = document.getElementById('demo-host-' + id);
    showLoading(host);
    Promise.resolve()
      .then(function () { return registry[id].init(host, { loadChart: loadChart }); })
      .catch(function (err) {
        showError(host, id, (err && err.messageKey) || 'demos.error');
      });
  }

  /* ---------- Pestañas ---------- */

  function activate(id, options) {
    if (!registry[id]) return;
    var opts = options || {};
    state.active = id;

    document.querySelectorAll('.demos__tab').forEach(function (tab) {
      var selected = tab.getAttribute('data-demo-tab') === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && opts.focusTab) tab.focus();
    });

    var select = document.getElementById('demos-select');
    if (select) select.value = id;

    var panel = document.getElementById('demos-panel');
    panel.setAttribute('aria-labelledby', 'demo-tab-' + id);
    panel.querySelectorAll('.demos__host').forEach(function (host) {
      host.hidden = host.id !== 'demo-host-' + id;
    });

    if (state.visible || opts.force) start(id);
  }

  function labelFor(def) {
    return def.labelKey ? t(def.labelKey, def.label || '') : def.label;
  }

  function build() {
    var list = ids();
    var tablist = document.querySelector('.demos__tabs');
    var select = document.getElementById('demos-select');
    var panel = document.getElementById('demos-panel');

    list.forEach(function (id) {
      var def = registry[id];

      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'demos__tab';
      tab.id = 'demo-tab-' + id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'demos-panel');
      tab.setAttribute('data-demo-tab', id);
      tab.textContent = labelFor(def);
      if (def.labelKey) tab.setAttribute('data-i18n', def.labelKey);
      tab.addEventListener('click', function () { activate(id, { force: true }); });
      tablist.appendChild(tab);

      var option = document.createElement('option');
      option.value = id;
      option.textContent = labelFor(def);
      if (def.labelKey) option.setAttribute('data-i18n', def.labelKey);
      select.appendChild(option);

      var host = document.createElement('div');
      host.className = 'demos__host';
      host.id = 'demo-host-' + id;
      host.hidden = true;
      panel.appendChild(host);
    });

    tablist.addEventListener('keydown', function (event) {
      var current = list.indexOf(state.active);
      var next = null;
      if (event.key === 'ArrowRight') next = (current + 1) % list.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + list.length) % list.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = list.length - 1;
      if (next === null) return;
      event.preventDefault();
      activate(list[next], { focusTab: true, force: true });
    });

    select.addEventListener('change', function () {
      activate(select.value, { force: true });
    });

    activate(list[0]);
  }

  /* Carga diferida: la demo activa arranca cuando la sección se acerca a la vista. */
  function watchVisibility(section) {
    function onVisible() {
      if (state.visible) return;
      state.visible = true;
      if (state.active) start(state.active);
    }
    if (!('IntersectionObserver' in window)) { onVisible(); return; }
    var observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        onVisible();
        observer.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    observer.observe(section);
  }

  /* "Ver demo" desde una tarjeta de proyecto. */
  function onOpen(event) {
    var id = event.detail && event.detail.id;
    if (!registry[id]) return;
    var section = document.getElementById('demos');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activate(id, { force: true });
    /* 'instant' y no 'auto': 'auto' respeta el scroll-behavior: smooth del CSS. */
    section.scrollIntoView({ behavior: event.detail.instant ? 'instant' : reduce ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('demos-panel').focus({ preventScroll: true });
    /* La dirección queda como #demo-<id> para poder compartir el enlace a esa demo. */
    if (history.replaceState) history.replaceState(null, '', '#demo-' + id);
  }

  /* Enlaces directos: index.html#demo-integra abre la demo de Avista, etc. */
  function openFromHash(instant) {
    var match = window.location.hash.match(/^#demo-([\w-]+)$/);
    if (match && registry[match[1]]) onOpen({ detail: { id: match[1], instant: instant } });
  }

  /* En la primera visita, fuentes e imágenes terminan de cargar después del salto y cambian
     la altura de lo que hay arriba: se vuelve a alinear #demos, salvo que la persona ya
     se haya desplazado por su cuenta. */
  function keepAligned() {
    if (!/^#demo-/.test(window.location.hash)) return;
    var moved = false;
    var stop = function () { moved = true; };
    ['wheel', 'touchmove', 'keydown', 'mousedown'].forEach(function (type) {
      window.addEventListener(type, stop, { once: true, passive: true });
    });
    var align = function () {
      if (moved) return;
      document.getElementById('demos').scrollIntoView({ behavior: 'instant', block: 'start' });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
    window.addEventListener('load', align, { once: true });
    [300, 1000, 2500].forEach(function (ms) { setTimeout(align, ms); });
  }

  function init() {
    var section = document.getElementById('demos');
    if (!section || !ids().length) return;
    section.classList.add('is-ready');
    build();
    watchVisibility(section);
    document.addEventListener('demo:open', onOpen);
    window.addEventListener('hashchange', function () { openFromHash(false); });
    openFromHash(true);
    keepAligned();
  }

  window.Demos = {
    register: function (id, def) { registry[id] = def; },
    has: function (id) { return !!registry[id]; },
    loadChart: loadChart
  };

  /* Espera a DOMContentLoaded aunque el DOM ya esté listo: los scripts de cada demo
     (también con defer) se registran después de este archivo y antes de ese evento. */
  if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
