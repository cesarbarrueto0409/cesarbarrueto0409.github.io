/* projects.js: grilla de proyectos desde data/projects.json y filtros por categoría.
   Si el JSON o los textos no cargan, queda visible la lista estática del HTML. */
(function () {
  'use strict';

  var CATEGORY_KEYS = {
    data: 'projects.filter_data',
    web: 'projects.filter_web'
  };
  var HIDE_MS = 150;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, className, i18nKey) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (i18nKey) node.setAttribute('data-i18n', i18nKey);
    return node;
  }

  function newTabHint() {
    var hint = el('span', 'visually-hidden', 'common.new_tab');
    return hint;
  }

  function renderCard(project) {
    var li = el('li', 'projects__item');
    li.setAttribute('data-categories', project.categories.join(' '));

    var card = el('article', 'project-card');
    var titleId = 'project-' + project.id + '-title';
    card.setAttribute('aria-labelledby', titleId);

    var category = el('p', 'project-card__category');
    project.categories.forEach(function (cat, i) {
      if (i > 0) category.appendChild(document.createTextNode(' · '));
      category.appendChild(el('span', null, CATEGORY_KEYS[cat]));
    });

    var title = el('h3', 'project-card__title');
    title.id = titleId;
    var name = el('span', 'project-card__name', project.nameKey);
    if (project.name) name.textContent = project.name;
    title.appendChild(name);
    if (project.subtitleKey) {
      title.appendChild(el('span', 'project-card__subtitle', project.subtitleKey));
    }

    var problem = el('p', 'project-card__problem', project.problemKey);

    var stack = el('ul', 'tags');
    stack.setAttribute('role', 'list');
    stack.setAttribute('data-i18n-aria-label', 'projects.stack_label');
    project.stack.forEach(function (tech) {
      var tag = el('li', 'tag');
      tag.textContent = tech;
      stack.appendChild(tag);
    });

    var metric = el('p', 'project-card__metric', project.metricKey);

    var actions = el('div', 'project-card__actions');
    /* "Ver demo" solo aparece si la demo ya está registrada en scripts/demos/. */
    if (project.demo && window.Demos && window.Demos.has(project.demo)) {
      var demo = el('a', 'btn btn--ghost btn--sm');
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

    card.appendChild(category);
    card.appendChild(title);
    card.appendChild(problem);
    card.appendChild(stack);
    card.appendChild(metric);

    /* Animación de vista previa (solo si su script cargó y la demo existe). */
    if (project.preview === 'coach' && window.CoachPreview && window.Demos && window.Demos.has(project.demo)) {
      var preview = el('div', 'project-card__preview');
      card.classList.add('project-card--preview');
      li.setAttribute('data-preview', '');
      card.appendChild(preview);
      window.CoachPreview.mount(preview);
    }

    card.appendChild(actions);
    li.appendChild(card);
    return li;
  }

  function render(list, projects) {
    var fragment = document.createDocumentFragment();
    projects.forEach(function (project) { fragment.appendChild(renderCard(project)); });
    list.replaceChildren(fragment);
    window.i18n.apply(list);
    updateWide(Array.prototype.slice.call(list.children));
  }

  /* Grilla de 2 columnas con tarjetas impares: si la primera visible tiene animación, ocupa todo
     el ancho (texto a la izquierda, animación a la derecha). Si no, la última queda centrada sola. */
  function updateWide(visible) {
    var items = visible.length ? visible[0].parentNode.querySelectorAll('.projects__item') : [];
    items.forEach(function (item) { item.classList.remove('is-wide', 'is-center'); });
    if (visible.length % 2 === 0) return;
    if (visible[0].hasAttribute('data-preview')) visible[0].classList.add('is-wide');
    else visible[visible.length - 1].classList.add('is-center');
  }

  /* ---------- Filtros ---------- */

  function applyFilter(list, filter) {
    var items = list.querySelectorAll('.projects__item');
    var visible = [];
    items.forEach(function (item) {
      var cats = (item.getAttribute('data-categories') || '').split(' ');
      var show = filter === 'all' || cats.indexOf(filter) !== -1;
      if (show) visible.push(item);

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
    updateWide(visible);
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
