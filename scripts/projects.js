/* projects.js: tabla de proyectos desde data/projects.json (filas con detalle desplegable) y filtros.
   Si el JSON o los textos no cargan, queda visible la lista estática del HTML. */
(function () {
  'use strict';

  var HIDE_MS = 150;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, className, i18nKey) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (i18nKey) node.setAttribute('data-i18n', i18nKey);
    return node;
  }

  function newTabHint() {
    return el('span', 'visually-hidden', 'common.new_tab');
  }

  var PIPELINE = ['mongo', 'memory', 'bedrock', 'validation', 'similarity', 'email'];

  /* Fila de la tabla: índice, nombre, resultado corto, stack y acción. El nombre es un botón
     que despliega el detalle (problema, cifra completa, enlaces y, en el Coach, el pipeline diario). */
  function renderRow(project, index) {
    var li = el('li', 'prow');
    li.setAttribute('data-categories', project.categories.join(' '));
    var hasDemo = project.demo && window.Demos && window.Demos.has(project.demo);
    var detailId = 'project-' + project.id + '-detail';

    var main = el('div', 'prow__main');
    var idx = el('span', 'prow__idx');
    idx.textContent = (index + 1 < 10 ? '0' : '') + (index + 1);

    var title = el('h3', 'prow__name');
    var toggle = el('button', 'prow__toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', detailId);
    var name = el('span', null, project.shortKey || project.nameKey);
    if (project.name) name.textContent = project.name;
    toggle.appendChild(name);
    if (project.subtitleKey) toggle.appendChild(el('small', null, project.subtitleKey));
    title.appendChild(toggle);

    var result = el('p', 'prow__result', project.resultKey);
    var stack = el('p', 'prow__stack');
    stack.textContent = project.stack.join(' · ');

    var go;
    if (hasDemo) {
      go = el('a', 'prow__go');
      go.href = '#demo-' + project.demo;
      go.setAttribute('data-demo', project.demo);
      go.appendChild(el('span', 'prow__go-icon'));
      go.appendChild(el('span', null, index === 0 ? 'projects.run_demo' : 'projects.demo_short'));
    } else {
      go = el('span', 'prow__go');
    }

    main.appendChild(idx);
    main.appendChild(title);
    main.appendChild(result);
    main.appendChild(stack);
    main.appendChild(go);

    var detail = el('div', 'prow__detail');
    detail.id = detailId;
    var inner = el('div', 'prow__detail-inner');
    var left = el('div', 'prow__detail-text');
    left.appendChild(el('p', 'prow__problem', project.problemKey));
    left.appendChild(el('p', 'prow__metric', project.metricKey));
    var actions = el('p', 'prow__actions');
    if (hasDemo) {
      var demo = el('a', 'btn btn--primary btn--sm');
      demo.href = '#demo-' + project.demo;
      demo.setAttribute('data-demo', project.demo);
      demo.appendChild(el('span', null, 'projects.view_demo'));
      actions.appendChild(demo);
    }
    if (project.repo) {
      var code = el('a', 'btn btn--outline btn--sm');
      code.href = project.repo;
      code.target = '_blank';
      code.rel = 'noopener';
      code.appendChild(el('span', null, project.repoIsTeam ? 'projects.team_repo' : 'projects.code'));
      code.appendChild(newTabHint());
      actions.appendChild(code);
    }
    left.appendChild(actions);
    inner.appendChild(left);

    if (project.preview === 'coach') {
      var fig = el('div', 'prow__pipe');
      fig.appendChild(el('p', 'label', 'projects.pipeline_label'));
      var steps = el('ol', 'pipe');
      steps.setAttribute('role', 'list');
      PIPELINE.forEach(function (step, i) {
        var item = el('li', 'pipe__step' + (step === 'bedrock' ? ' is-hot' : ''), 'demo.chilexpress.step.' + step);
        item.style.setProperty('--i', i);
        steps.appendChild(item);
      });
      fig.appendChild(steps);
      inner.appendChild(fig);
    }
    detail.appendChild(inner);

    toggle.addEventListener('click', function () {
      setOpen(li, toggle.getAttribute('aria-expanded') !== 'true');
    });

    li.appendChild(main);
    li.appendChild(detail);
    return li;
  }

  function setOpen(li, open) {
    var toggle = li.querySelector('.prow__toggle');
    toggle.setAttribute('aria-expanded', String(open));
    li.classList.toggle('is-open', open);
  }

  function render(list, projects) {
    var fragment = document.createDocumentFragment();
    projects.forEach(function (project, i) { fragment.appendChild(renderRow(project, i)); });
    list.replaceChildren(fragment);
    window.i18n.apply(list);
    /* La primera fila (el proyecto con más impacto) parte abierta, como en el diseño. */
    if (list.firstElementChild) setOpen(list.firstElementChild, true);
  }

  /* ---------- Filtros ---------- */

  function applyFilter(list, filter) {
    var items = list.querySelectorAll('.prow');
    items.forEach(function (item) {
      var cats = (item.getAttribute('data-categories') || '').split(' ');
      var show = filter === 'all' || cats.indexOf(filter) !== -1;
      clearTimeout(item._hideTimer);
      if (show) {
        item.hidden = false;
        /* Fuerza un reflow para que la transición de entrada se vea. */
        void item.offsetWidth;
        item.classList.remove('is-hidden');
      } else if (reducedMotion.matches) {
        item.classList.add('is-hidden');
        item.hidden = true;
      } else {
        item.classList.add('is-hidden');
        item._hideTimer = setTimeout(function () { item.hidden = true; }, HIDE_MS);
      }
    });
  }

  function initFilters(list) {
    var buttons = document.querySelectorAll('[data-filter]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        applyFilter(list, btn.getAttribute('data-filter'));
      });
    });
  }

  /* ---------- "Ver demo" ----------
     demos.js escucha "demo:open", activa la pestaña, desplaza la sección y enfoca la demo. */
  function initDemoLinks(list) {
    list.addEventListener('click', function (event) {
      var link = event.target.closest('[data-demo]');
      if (!link) return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent('demo:open', { detail: { id: link.getAttribute('data-demo') } }));
    });
  }

  /* La grilla cambia de alto al renderizar. Si la URL trae un ancla que está más abajo
     (por ejemplo #demos), se vuelve a llevar a la vista para no quedar desplazado. */
  function restoreHashTarget(list) {
    var id = window.location.hash.slice(1);
    if (/^demo-/.test(id)) id = 'demos';  /* enlace directo a una demo (#demo-<id>) */
    var target = id && document.getElementById(id);
    if (!target || !(list.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function init() {
    var list = document.getElementById('projects-list');
    if (!list || !window.i18n) return;

    var data = fetch('data/projects.json', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('projects: ' + res.status);
      return res.json();
    });

    Promise.all([data, window.i18n.ready])
      .then(function (results) {
        if (!window.i18n.isLoaded()) return;
        render(list, results[0].projects || []);
        restoreHashTarget(list);
        document.querySelector('.projects__filters').hidden = false;
        initFilters(list);
        initDemoLinks(list);
      })
      .catch(function () {
        /* Se mantiene la lista estática del HTML. */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
