/* analytics.js: eventos anónimos para Umami (sin cookies).
   - El script de Umami se carga en index.html solo para el dominio publicado (data-domains),
     así que en local no se envía nada.
   - Un solo escuchador de clics en el documento: cubre también los enlaces que crea projects.js
     y los botones de las demos, que se dibujan después.
   - Si Umami no cargó (bloqueador de anuncios), track() no hace nada. */
(function () {
  'use strict';

  function track(name, data) {
    try {
      if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
    } catch (e) { /* las analíticas nunca deben romper la página */ }
  }

  /* Botón principal de cada demo → id de la demo y acción */
  var DEMO_ACTIONS = {
    'cx-run': ['chilexpress', 'run_analysis'],
    'ig-process': ['integra', 'process'],
    'pb-buy': ['polybeauchef', 'participate'],
    'pb-community': ['polybeauchef', 'simulate_community'],
    'pb-close': ['polybeauchef', 'close_event'],
    'ar-send': ['benchmark', 'send'],
    'seg-run': ['segmentation', 'run_pipeline'],
    'seg-next': ['segmentation', 'next_step']
  };

  function repoName(href) {
    var m = /github\.com\/[^/]+\/([^/?#]+)/.exec(href);
    return m ? m[1] : null;
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var el = target.closest('a, button');
    if (!el) return;

    /* Descargar CV */
    var href = el.getAttribute('href') || '';
    if (/cv-cesar-barrueto\.pdf$/.test(href)) {
      track('cv_download', { place: el.closest('#inicio') ? 'hero' : 'experience' });
      return;
    }

    /* Acciones dentro de las demos */
    if (el.id && DEMO_ACTIONS[el.id]) {
      track('demo_action', { demo: DEMO_ACTIONS[el.id][0], action: DEMO_ACTIONS[el.id][1] });
      return;
    }

    /* Pestañas de demos */
    if (el.hasAttribute('data-demo-tab')) {
      track('demo_tab', { demo: el.getAttribute('data-demo-tab') });
      return;
    }

    /* Idioma y filtros de proyectos */
    if (el.hasAttribute('data-lang')) {
      track('language', { lang: el.getAttribute('data-lang') });
      return;
    }
    if (el.hasAttribute('data-filter')) {
      track('project_filter', { filter: el.getAttribute('data-filter') });
      return;
    }

    /* Navegación interna */
    if (el.classList.contains('nav__link') && href.charAt(0) === '#') {
      track('nav', { section: href.slice(1) });
      return;
    }

    /* Enlaces de salida */
    if (/^mailto:/.test(href)) { track('outbound', { to: 'email' }); return; }
    if (/linkedin\.com/.test(href)) { track('outbound', { to: 'linkedin' }); return; }
    if (/github\.com/.test(href)) {
      var repo = repoName(href);
      track('outbound', { to: repo ? 'repo:' + repo : 'github_profile' });
    }
  });

  /* "Ver demo" (tarjetas, Experiencia, Sobre mí y enlaces directos #demo-<id>) */
  document.addEventListener('demo:open', function (event) {
    if (event.detail && event.detail.id) track('demo_open', { demo: event.detail.id });
  });
})();
