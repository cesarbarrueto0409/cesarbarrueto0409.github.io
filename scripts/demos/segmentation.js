/* Demo 5: Segmentación de clientes · caso de estudio (spec: demos/supermarket-segmentation.md).
   Solo usa estadísticas agregadas de scripts/demos/segmentation-summary.json (sin filas de clientes),
   reproducidas con analysis/segmentation_honest.py sobre el dataset público del repo proyecto-MachineLearning.
   El gráfico muestra los centroides reales; no se generan puntos sintéticos. */
(function () {
  'use strict';

  var P = 'demo.segmentation.';
  var STEP_MS = 650;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TABS = ['problem', 'pipeline', 'profiles', 'knn'];
  var PIPE = ['load', 'clean', 'features', 'kmeans', 'knn', 'eval'];
  var SPEND = ['MntWines', 'MntMeatProducts', 'MntFruits', 'MntFishProducts', 'MntSweetProducts', 'MntGoldProds'];

  /* Variables del cliente nuevo (las 5 con promedio por perfil en el JSON). */
  var SLIDERS = [
    { key: 'Income', min: 10000, max: 100000, step: 1000, value: 60000 },
    { key: 'MntWines', min: 0, max: 1500, step: 10, value: 450 },
    { key: 'MntMeatProducts', min: 0, max: 1000, step: 10, value: 150 },
    { key: 'Edades', min: 25, max: 85, step: 1, value: 58 },
    { key: 'N_hijos', min: 0, max: 3, step: 1, value: 1 }
  ];

  /* Gráfico: ingreso (x) contra gasto en vino (y). */
  var CH = { w: 420, h: 280, left: 52, right: 14, top: 14, bottom: 26, x0: 20000, x1: 90000, y0: 0, y1: 1000 };

  /* ---------- Utilidades ---------- */

  function t(key) { return window.i18n.t(P + key, ''); }

  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] !== undefined ? vars[name] : '';
    });
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function lang() { return window.i18n.getLang() === 'en' ? 'en' : 'es'; }
  function locale() { return lang() === 'en' ? 'en-US' : 'es-CL'; }

  function fmt(n, digits) {
    var d = digits === undefined ? 0 : digits;
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }

  /* digits: decimales máximos; fixed: además, decimales mínimos (92,0 % en vez de 92 %). */
  function fmtPct(ratio, digits, fixed) {
    var d = digits === undefined ? 1 : digits;
    var text = new Intl.NumberFormat(locale(), { style: 'percent', minimumFractionDigits: fixed ? d : 0, maximumFractionDigits: d }).format(ratio);
    return lang() === 'en' ? text : text.replace(/\s?%/, ' %');
  }

  function profileName(id) { return t('profile.' + id); }

  /* ---------- Plantilla ---------- */

  function template(data) {
    var tabs = TABS.map(function (id, i) {
      return '<button class="demos__tab seg__tab" type="button" role="tab" id="seg-tab-' + id + '" aria-controls="seg-panel-' + id + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-tab="' + id + '" data-i18n="' + P + 'tab.' + id + '"></button>';
    }).join('');

    var steps = PIPE.map(function (s, i) {
      return '<li class="pipeline__step" data-step="' + s + '">' +
        '<span class="pipeline__index" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="pipeline__name" data-i18n="' + P + 'step.' + s + '"></span>' +
        '<span class="pipeline__desc" data-desc></span>' +
      '</li>';
    }).join('');

    var chips = data.clusters.map(function (c) {
      return '<button class="chip seg__chip" type="button" data-cluster="' + c.id + '" aria-pressed="false"></button>';
    }).join('');

    var sliders = SLIDERS.map(function (s) {
      return '<div class="field">' +
        '<div class="field__row">' +
          '<label class="field__label" for="seg-in-' + s.key + '" data-i18n="' + P + 'var.' + s.key + '"></label>' +
          '<output class="field__value" id="seg-out-' + s.key + '" for="seg-in-' + s.key + '"></output>' +
        '</div>' +
        '<input class="range" type="range" id="seg-in-' + s.key + '" data-var="' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + s.value + '">' +
      '</div>';
    }).join('');

    var kChips = Object.keys(data.knn_task_B_high_wine_buyer.cv_accuracy_by_k).map(function (k) {
      return '<button class="chip" type="button" data-k="' + k + '" aria-pressed="false">k = ' + k + '</button>';
    }).join('');

    return '' +
      '<div class="demo seg">' +
        '<header class="demo__header">' +
          '<p class="demo-badge" data-i18n="demo.label"></p>' +
          '<h3 class="demo__title" data-i18n="' + P + 'title"></h3>' +
          '<p class="demo__lead" data-i18n="' + P + 'lead"></p>' +
          '<p class="demo__note"><span data-i18n="' + P + 'note"></span> ' +
            '<a href="' + esc(data.source.url) + '" target="_blank" rel="noopener"><span data-i18n="' + P + 'source_link"></span><span class="visually-hidden" data-i18n="common.new_tab"></span></a></p>' +
        '</header>' +

        '<div class="demos__tabs seg__tabs" role="tablist" data-i18n-aria-label="' + P + 'steps_label">' + tabs + '</div>' +
        '<p class="integra__next seg__cue" id="seg-cue"></p>' +
        '<p class="visually-hidden" id="seg-live" aria-live="polite"></p>' +

        /* 1 · El problema */
        '<div class="seg__panel" id="seg-panel-problem" role="tabpanel" aria-labelledby="seg-tab-problem" tabindex="0">' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title" data-i18n="' + P + 'problem_title"></h4>' +
            '<p class="seg__text" data-i18n="' + P + 'problem_text"></p>' +
          '</section>' +
          '<dl class="coach__metrics seg__kpis" id="seg-kpis"></dl>' +
        '</div>' +

        /* 2 · El pipeline */
        '<div class="seg__panel" id="seg-panel-pipeline" role="tabpanel" aria-labelledby="seg-tab-pipeline" tabindex="0" hidden>' +
          '<div><button class="btn btn--ghost" type="button" id="seg-run"></button></div>' +
          '<ol class="pipeline" data-i18n-aria-label="' + P + 'pipeline_label">' + steps + '</ol>' +
          '<p class="coach__idle" id="seg-pipe-status"></p>' +
          '<aside class="integra__block seg__fix">' +
            '<h4 class="stat-card__title" data-i18n="' + P + 'fix_title"></h4>' +
            '<p class="stat-card__note" data-i18n="' + P + 'fix_text"></p>' +
          '</aside>' +
        '</div>' +

        /* 3 · Los perfiles */
        '<div class="seg__panel" id="seg-panel-profiles" role="tabpanel" aria-labelledby="seg-tab-profiles" tabindex="0" hidden>' +
          '<div class="seg__grid">' +
            '<section class="integra__block seg__chart-block">' +
              '<h4 class="stat-card__title" data-i18n="' + P + 'profiles_title"></h4>' +
              '<figure class="seg__chart" id="seg-chart"></figure>' +
              '<span class="field__label" id="seg-chips-label" data-i18n="' + P + 'profiles_label"></span>' +
              '<div class="integra__chips" role="group" aria-labelledby="seg-chips-label">' + chips + '</div>' +
              '<p class="stat-card__note" id="seg-silhouette"></p>' +
              '<p class="stat-card__note" data-i18n="' + P + 'names_note"></p>' +
              '<details class="poly__table" id="seg-table"></details>' +
            '</section>' +
            '<div class="seg__side">' +
              '<section class="integra__block" id="seg-detail" aria-live="off"></section>' +
              '<section class="integra__block seg__new">' +
                '<h4 class="stat-card__title" data-i18n="' + P + 'new_title"></h4>' +
                '<p class="coach__hint" data-i18n="' + P + 'new_hint"></p>' +
                '<div class="seg__sliders">' + sliders + '</div>' +
                '<p class="integra__decided seg__nearest" id="seg-nearest"></p>' +
              '</section>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* 4 · La predicción */
        '<div class="seg__panel" id="seg-panel-knn" role="tabpanel" aria-labelledby="seg-tab-knn" tabindex="0" hidden>' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title" data-i18n="' + P + 'knn_title"></h4>' +
            '<p class="seg__text" data-i18n="' + P + 'knn_text"></p>' +
          '</section>' +
          '<div class="seg__grid">' +
            '<section class="integra__block">' +
              '<h4 class="stat-card__title" data-i18n="' + P + 'acc_title"></h4>' +
              '<span class="field__label" id="seg-k-label" data-i18n="' + P + 'k_label"></span>' +
              '<div class="integra__chips" role="group" aria-labelledby="seg-k-label">' + kChips + '</div>' +
              '<div class="hbars seg__acc" id="seg-acc"></div>' +
              '<p class="seg__acc-text" id="seg-acc-text"></p>' +
            '</section>' +
            '<section class="integra__block" id="seg-cm"></section>' +
          '</div>' +
        '</div>' +

        '<div class="field field--actions seg__nav">' +
          '<div class="integra__decision-actions">' +
            '<button class="btn btn--outline btn--sm" type="button" id="seg-prev" data-i18n="' + P + 'prev"></button>' +
            '<button class="btn btn--ghost" type="button" id="seg-next" data-i18n="' + P + 'next"></button>' +
          '</div>' +
          '<button class="btn btn--outline btn--sm" type="button" id="seg-reset" data-i18n="demo.reset"></button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Demo ---------- */

  function createDemo(host, data) {
    var knn = data.knn_task_B_high_wine_buyer;
    var kValues = Object.keys(knn.cv_accuracy_by_k);
    var bestAcc = knn.cv_accuracy_by_k[String(knn.best_k)];
    var nVars = data.features_kmeans.length;
    var state;

    /* Escala de cada variable del cliente nuevo: rango entre los promedios de los perfiles. */
    var scales = {};
    SLIDERS.forEach(function (s) {
      var vals = data.clusters.map(function (c) { return c.means[s.key]; });
      scales[s.key] = (Math.max.apply(null, vals) - Math.min.apply(null, vals)) || 1;
    });
    var spendMax = Math.max.apply(null, data.clusters.map(function (c) {
      return Math.max.apply(null, SPEND.map(function (k) { return c.means[k]; }));
    }));

    function freshState() {
      var client = {};
      SLIDERS.forEach(function (s) { client[s.key] = s.value; });
      var near = nearestOf(client);
      return { tab: 'problem', ran: false, busy: false, pipeStep: -1, client: client, nearest: near, selected: near, k: String(knn.best_k) };
    }

    function nearestOf(client) {
      var best = null;
      data.clusters.forEach(function (c) {
        var d = 0;
        SLIDERS.forEach(function (s) {
          var diff = (client[s.key] - c.means[s.key]) / scales[s.key];
          d += diff * diff;
        });
        if (!best || d < best.d) best = { id: c.id, d: d };
      });
      return best.id;
    }

    state = freshState();
    host.innerHTML = template(data);
    window.i18n.apply(host);
    var $ = function (id) { return host.querySelector('#' + id); };
    function cluster(id) { return data.clusters.filter(function (c) { return c.id === id; })[0]; }
    function announce(text) { $('seg-live').textContent = text; }

    /* --- Render --- */

    function renderTabs() {
      host.querySelectorAll('.seg__tab').forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === state.tab;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      TABS.forEach(function (id) { $('seg-panel-' + id).hidden = id !== state.tab; });
    }

    /* Guía de siguiente paso: etiqueta y botón que parpadea. */
    function renderNav() {
      var i = TABS.indexOf(state.tab);
      var nextTab = TABS[i + 1];
      var waitingRun = state.tab === 'pipeline' && !state.ran;
      var cue;
      if (state.busy) cue = '';
      else if (waitingRun) cue = t('cue_run');
      else if (state.tab === 'profiles') cue = t('cue_play');
      else if (state.tab === 'knn') cue = t('cue_k');
      else cue = fill(t('cue_next'), { step: t('next_short.' + nextTab) });

      var cueEl = $('seg-cue');
      /* Mientras corre el pipeline la etiqueta se oculta sin mover el resto del contenido. */
      if (cue) cueEl.textContent = fill(t('next_cue'), { action: cue });
      cueEl.style.visibility = cue ? '' : 'hidden';

      $('seg-prev').disabled = i === 0;
      var next = $('seg-next');
      next.hidden = !nextTab;
      next.disabled = state.busy;
      next.classList.toggle('is-cue', !!nextTab && !state.busy && !waitingRun);

      var run = $('seg-run');
      run.textContent = t(state.busy ? 'running' : state.ran ? 'rerun' : 'run');
      run.disabled = state.busy;
      run.classList.toggle('is-cue', waitingRun && !state.busy);
    }

    function renderKpis() {
      var items = [
        [t('kpi_rows'), fmt(data.n_rows), ''],
        [t('kpi_vars'), fmt(nVars), ''],
        [t('kpi_clusters'), fmt(data.clusters.length), ''],
        [t('kpi_acc'), '≈ ' + fmtPct(bestAcc, 0), fill(t('kpi_acc_note'), { base: fmtPct(knn.baseline_majority, 0) })]
      ];
      $('seg-kpis').innerHTML = items.map(function (it) {
        return '<div class="coach__metric"><dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd>' +
          (it[2] ? '<dd class="stat-card__note seg__kpi-note">' + esc(it[2]) + '</dd>' : '') + '</div>';
      }).join('');
    }

    function stepText(s) {
      var v = {
        raw: fmt(data.n_rows_raw), rows: fmt(data.n_rows), n: fmt(nVars),
        s: fmt(data.silhouette_scaled_k6, 2), acc: fmtPct(bestAcc), base: fmtPct(knn.baseline_majority, 0)
      };
      return fill(t('step.' + s + '_desc'), v);
    }

    /* pipeStep: pasos terminados; con busy, el paso pipeStep está en proceso. */
    function renderPipeline() {
      var done = state.ran && !state.busy ? PIPE.length : state.pipeStep;
      host.querySelectorAll('.pipeline__step').forEach(function (li, i) {
        var on = i < done;
        var running = state.busy && i === state.pipeStep;
        li.classList.toggle('is-done', on);
        li.classList.toggle('is-active', running);
        if (running) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
        li.querySelector('[data-desc]').textContent = on ? stepText(li.getAttribute('data-step')) : running ? '…' : '';
      });
      var status = $('seg-pipe-status');
      status.classList.toggle('coach__idle--running', state.busy);
      status.textContent = state.busy ? t('running')
        : state.ran ? fill(t('pipeline_done'), { rows: fmt(data.n_rows), n: fmt(nVars), acc: fmtPct(bestAcc) })
        : t('pipeline_idle');
    }

    function sx(v) {
      var c = Math.min(Math.max(v, CH.x0), CH.x1);
      return CH.left + (c - CH.x0) / (CH.x1 - CH.x0) * (CH.w - CH.left - CH.right);
    }
    function sy(v) {
      var c = Math.min(Math.max(v, CH.y0), CH.y1);
      return CH.h - CH.bottom - (c - CH.y0) / (CH.y1 - CH.y0) * (CH.h - CH.top - CH.bottom);
    }
    function radius(c) { return Math.max(6, 4.2 * Math.sqrt(c.share_pct)); }

    function renderChart() {
      var grid = '';
      [20000, 40000, 60000, 80000].forEach(function (x) {
        grid += '<line class="seg__grid-line" x1="' + sx(x) + '" x2="' + sx(x) + '" y1="' + CH.top + '" y2="' + (CH.h - CH.bottom) + '"></line>' +
          /* Sin etiqueta en 20k: chocaría con el 0 del eje vertical. */
          (x > CH.x0 ? '<text class="seg__tick" x="' + sx(x) + '" y="' + (CH.h - CH.bottom + 18) + '" text-anchor="middle">' + fmt(x / 1000) + 'k</text>' : '');
      });
      [0, 250, 500, 750, 1000].forEach(function (y) {
        grid += '<line class="seg__grid-line" x1="' + CH.left + '" x2="' + (CH.w - CH.right) + '" y1="' + sy(y) + '" y2="' + sy(y) + '"></line>' +
          '<text class="seg__tick" x="' + (CH.left - 6) + '" y="' + (sy(y) + 4) + '" text-anchor="end">' + fmt(y) + '</text>';
      });

      /* Burbujas grandes primero, para que las pequeñas queden encima. */
      var order = data.clusters.slice().sort(function (a, b) { return b.share_pct - a.share_pct; });
      var bubbles = order.map(function (c) {
        var x = sx(c.means.Income), y = sy(c.means.MntWines), r = radius(c);
        var inside = r >= 14;
        var sel = c.id === state.selected;
        return '<g class="seg__bubble' + (sel ? ' is-selected' : '') + '" data-cluster="' + c.id + '">' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"></circle>' +
          '<text class="seg__bubble-label" x="' + (inside ? x : x + r + 4).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (inside ? 'middle' : 'start') + '">' + (c.id + 1) + '</text>' +
        '</g>';
      }).join('');

      var cx = sx(state.client.Income), cy = sy(state.client.MntWines);
      var near = cluster(state.nearest);
      var link = '<line class="seg__link" x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + sx(near.means.Income).toFixed(1) + '" y2="' + sy(near.means.MntWines).toFixed(1) + '"></line>';
      var d = 7;
      var diamond = '<path class="seg__client" d="M' + cx.toFixed(1) + ' ' + (cy - d).toFixed(1) + ' L' + (cx + d).toFixed(1) + ' ' + cy.toFixed(1) + ' L' + cx.toFixed(1) + ' ' + (cy + d).toFixed(1) + ' L' + (cx - d).toFixed(1) + ' ' + cy.toFixed(1) + ' Z"></path>';

      $('seg-chart').innerHTML =
        '<p class="seg__axis seg__axis--y" aria-hidden="true">↑ ' + esc(t('axis_y')) + '</p>' +
        '<svg viewBox="0 0 ' + CH.w + ' ' + CH.h + '" role="img" aria-label="' + esc(t('chart_label')) + '" aria-describedby="seg-silhouette">' +
          grid + bubbles + link + diamond +
        '</svg>' +
        '<p class="seg__axis seg__axis--x" aria-hidden="true">' + esc(t('axis_x')) + ' →</p>' +
        '<figcaption class="seg__legend"><span class="seg__legend-item"><span class="seg__swatch seg__swatch--bubble" aria-hidden="true"></span>' + esc(t('profiles_title')) + '</span>' +
          '<span class="seg__legend-item"><span class="seg__swatch seg__swatch--client" aria-hidden="true"></span>' + esc(t('new_point')) + '</span></figcaption>';
    }

    function renderChips() {
      host.querySelectorAll('.seg__chip').forEach(function (chip) {
        var c = cluster(Number(chip.getAttribute('data-cluster')));
        chip.textContent = (c.id + 1) + ' · ' + profileName(c.id) + ' · ' + fmtPct(c.share_pct / 100);
        chip.setAttribute('aria-pressed', String(c.id === state.selected));
      });
      $('seg-silhouette').textContent = fill(t('silhouette_note'), { s: fmt(data.silhouette_scaled_k6, 2) });
    }

    function renderTable() {
      var cols = ['Income', 'MntWines', 'MntMeatProducts', 'Edades', 'N_hijos'];
      var open = $('seg-table').open;
      $('seg-table').innerHTML = '<summary>' + esc(t('table_toggle')) + '</summary>' +
        '<div class="seg__table-wrap"><table><thead><tr><th scope="col">' + esc(t('table_profile')) + '</th><th scope="col">' + esc(t('table_share')) + '</th>' +
        cols.map(function (k) { return '<th scope="col">' + esc(t('var.' + k)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        data.clusters.map(function (c) {
          return '<tr><th scope="row">' + (c.id + 1) + ' · ' + esc(profileName(c.id)) + '</th><td>' + esc(fmtPct(c.share_pct / 100)) + '</td>' +
            cols.map(function (k) { return '<td>' + esc(fmt(c.means[k], k === 'N_hijos' || k === 'Edades' ? 1 : 0)) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      $('seg-table').open = open;
    }

    function renderDetail() {
      var c = cluster(state.selected);
      var bars = SPEND.map(function (k) {
        var v = c.means[k];
        return '<div class="hbars__row"><span>' + esc(t('var.' + k)) + '</span>' +
          '<span class="hbars__track"><span class="hbars__bar" style="width:' + (v / spendMax * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hbars__value">' + esc(fmt(v)) + '</span></div>';
      }).join('');
      $('seg-detail').innerHTML =
        '<div class="rec__head"><h4 class="stat-card__title">' + esc(t('detail_title')) + '</h4><span class="stat-tag">' + esc(fill(t('share'), { p: fmtPct(c.share_pct / 100) })) + '</span></div>' +
        '<p class="seg__profile-name">' + (c.id + 1) + ' · ' + esc(profileName(c.id)) + '</p>' +
        '<p class="field__label">' + esc(t('spend_title')) + '</p>' +
        '<div class="hbars seg__spend">' + bars + '</div>' +
        '<dl class="integra__log-info seg__facts">' +
          ['Income', 'Edades', 'N_hijos'].map(function (k) {
            return '<div><dt>' + esc(t('var.' + k)) + '</dt><dd>' + esc(fmt(c.means[k], k === 'Income' ? 0 : 1)) + '</dd></div>';
          }).join('') +
        '</dl>';
    }

    function renderClient() {
      SLIDERS.forEach(function (s) {
        $('seg-out-' + s.key).textContent = fmt(state.client[s.key]);
      });
      $('seg-nearest').textContent = fill(t('nearest'), { name: (state.nearest + 1) + ' · ' + profileName(state.nearest) });
    }

    function renderKnn() {
      var base = knn.baseline_majority;
      $('seg-acc').innerHTML = kValues.map(function (k) {
        var acc = knn.cv_accuracy_by_k[k];
        var best = Number(k) === knn.best_k;
        return '<div class="hbars__row' + (k === state.k ? ' is-selected' : '') + '">' +
          '<span>k = ' + k + (best ? ' · ' + esc(t('best')) : '') + '</span>' +
          '<span class="hbars__track seg__acc-track"><span class="hbars__bar" style="width:' + (acc * 100).toFixed(1) + '%"></span>' +
            '<span class="seg__baseline" style="left:' + (base * 100) + '%" aria-hidden="true"></span></span>' +
          '<span class="hbars__value">' + esc(fmtPct(acc, 1, true)) + '</span></div>';
      }).join('') +
      '<p class="seg__baseline-key"><span class="seg__baseline-swatch" aria-hidden="true"></span>' + esc(t('baseline')) + ' ' + esc(fmtPct(base, 0)) + '</p>';

      host.querySelectorAll('[data-k]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-k') === state.k));
      });
      $('seg-acc-text').textContent = fill(t('acc_for_k'), { k: state.k, acc: fmtPct(knn.cv_accuracy_by_k[state.k], 1, true), base: fmtPct(base, 0) });

      var m = knn.holdout_confusion_matrix;
      var ok = m[0][0] + m[1][1];
      var n = ok + m[0][1] + m[1][0];
      var lbl = [t('cm_low'), t('cm_high')];
      $('seg-cm').innerHTML =
        '<h4 class="stat-card__title">' + esc(fill(t('cm_title'), { k: knn.best_k })) + '</h4>' +
        '<div class="seg__table-wrap"><table class="seg__cm">' +
          '<thead><tr><td></td>' + lbl.map(function (l) { return '<th scope="col">' + esc(t('cm_pred')) + ': ' + esc(l) + '</th>'; }).join('') + '</tr></thead>' +
          '<tbody>' + m.map(function (row, i) {
            return '<tr><th scope="row">' + esc(t('cm_actual')) + ': ' + esc(lbl[i]) + '</th>' +
              row.map(function (v, j) { return '<td class="' + (i === j ? 'is-hit' : 'is-miss') + '">' + esc(fmt(v)) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody>' +
        '</table></div>' +
        '<p class="stat-card__note">' + esc(fill(t('cm_summary'), { ok: fmt(ok), n: fmt(n), acc: fmtPct(knn.holdout_accuracy) })) + '</p>';
    }

    function renderProfiles() {
      renderChart();
      renderChips();
      renderDetail();
      renderClient();
    }

    function renderAll() {
      renderTabs();
      renderNav();
      renderKpis();
      renderPipeline();
      renderProfiles();
      renderTable();
      renderKnn();
    }

    /* --- Acciones --- */

    function goTo(tab, focusTab) {
      if (TABS.indexOf(tab) < 0 || state.busy) return;
      state.tab = tab;
      renderTabs();
      renderNav();
      announce(fill(t('live_step'), { n: TABS.indexOf(tab) + 1, name: t('tab.' + tab).replace(/^\d\s·\s/, '') }));
      if (focusTab) $('seg-tab-' + tab).focus();
    }

    function runPipeline() {
      if (state.busy) return;
      if (reducedMotion.matches) {
        state.ran = true;
        renderPipeline();
        renderNav();
        announce($('seg-pipe-status').textContent);
        return;
      }
      state.busy = true;
      state.ran = false;
      state.pipeStep = 0;
      renderNav();
      (function next() {
        renderPipeline();
        if (state.pipeStep < PIPE.length) { state.pipeStep += 1; setTimeout(next, STEP_MS); return; }
        state.busy = false;
        state.ran = true;
        renderPipeline();
        renderNav();
        announce($('seg-pipe-status').textContent);
      })();
    }

    function select(id) {
      state.selected = id;
      renderChart();
      renderChips();
      renderDetail();
    }

    host.addEventListener('click', function (event) {
      var bubble = event.target.closest('.seg__bubble');
      if (bubble) { select(Number(bubble.getAttribute('data-cluster'))); return; }
      var el = event.target.closest('button');
      if (!el || !host.contains(el)) return;
      if (el.hasAttribute('data-tab')) { goTo(el.getAttribute('data-tab')); return; }
      if (el.hasAttribute('data-cluster')) { select(Number(el.getAttribute('data-cluster'))); return; }
      if (el.hasAttribute('data-k')) { state.k = el.getAttribute('data-k'); renderKnn(); return; }
      switch (el.id) {
        case 'seg-run': runPipeline(); break;
        case 'seg-prev': goTo(TABS[TABS.indexOf(state.tab) - 1]); break;
        case 'seg-next': goTo(TABS[TABS.indexOf(state.tab) + 1]); break;
        case 'seg-reset':
          if (state.busy) return;
          state = freshState();
          host.querySelectorAll('[data-var]').forEach(function (input) {
            input.value = state.client[input.getAttribute('data-var')];
          });
          announce('');
          renderAll();
          break;
      }
    });

    /* Mover un deslizador solo redibuja el gráfico y el detalle (el foco queda en el deslizador). */
    host.addEventListener('input', function (event) {
      var key = event.target.getAttribute('data-var');
      if (!key) return;
      state.client[key] = Number(event.target.value);
      var near = nearestOf(state.client);
      if (near !== state.nearest) announce(fill(t('nearest'), { name: (near + 1) + ' · ' + profileName(near) }));
      state.nearest = near;
      state.selected = near;
      renderProfiles();
    });

    host.querySelector('.seg__tabs').addEventListener('keydown', function (event) {
      var i = TABS.indexOf(state.tab);
      var n = TABS.length;
      var next = event.key === 'ArrowRight' ? (i + 1) % n
        : event.key === 'ArrowLeft' ? (i + n - 1) % n
        : event.key === 'Home' ? 0
        : event.key === 'End' ? n - 1 : null;
      if (next === null) return;
      event.preventDefault();
      goTo(TABS[next], true);
    });

    document.addEventListener('i18n:change', renderAll);
    renderAll();
  }

  window.Demos.register('segmentation', {
    label: 'Segmentación',
    labelKey: 'demo.segmentation.tab_label',
    init: function (host) {
      var data = fetch('scripts/demos/segmentation-summary.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .catch(function () {
          var err = new Error('data');
          err.messageKey = 'demo.segmentation.error';
          throw err;
        });

      return Promise.all([data, window.i18n.ready]).then(function () {
        if (!window.i18n.isLoaded()) throw new Error('i18n');
        return data;
      }).then(function (raw) {
        createDemo(host, raw);
      });
    }
  });
})();
