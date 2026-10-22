/* main.js: menú móvil y resaltado de la sección activa. */
(function () {
  'use strict';

  var MOBILE_QUERY = window.matchMedia('(max-width: 859px)');

  function label(key, fallback) {
    return window.i18n ? window.i18n.t(key, fallback) : fallback;
  }

  /* ---------- Menú móvil ---------- */

  function initMenu() {
    var toggle = document.querySelector('.nav__toggle');
    var menu = document.getElementById('nav-menu');
    if (!toggle || !menu) return;

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function updateLabel() {
      var key = isOpen() ? 'nav.menu_close' : 'nav.menu_open';
      var fallback = isOpen() ? 'Cerrar menú' : 'Abrir menú';
      toggle.setAttribute('aria-label', label(key, fallback));
    }

    function setOpen(open, returnFocus) {
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      updateLabel();
      if (!open && returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });

    menu.addEventListener('click', function (event) {
      if (MOBILE_QUERY.matches && event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });

    document.addEventListener('click', function (event) {
      if (isOpen() && !event.target.closest('.site-header')) setOpen(false);
    });

    MOBILE_QUERY.addEventListener('change', function (event) {
      if (!event.matches) setOpen(false);
    });

    document.addEventListener('i18n:change', updateLabel);
    updateLabel();
  }

  /* ---------- Sección activa en el menú ---------- */

  function initActiveSection() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav__link[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    var sections = [];
    links.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var section = id && document.getElementById(id);
      if (section) {
        byId[id] = link;
        sections.push(section);
      }
    });
    if (!sections.length) return;

    /* El hero no tiene enlace en el menú: al llegar a él se limpia el resaltado. */
    var hero = document.getElementById('inicio');
    if (hero) sections.push(hero);

    function setActive(id) {
      links.forEach(function (link) {
        if (byId[id] === link) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { observer.observe(section); });
  }

  /* ---------- Enlaces a demos fuera de la grilla (Sobre mí, Experiencia) ----------
     Sin JS, el enlace solo baja a #demos. Con JS abre la pestaña de esa demo. */

  function initDemoLinks() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-open-demo]');
      if (!link) return;
      var id = link.getAttribute('data-open-demo');
      if (!window.Demos || !window.Demos.has(id)) return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent('demo:open', { detail: { id: id } }));
    });
  }

  function init() {
    initMenu();
    initActiveSection();
    initDemoLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
