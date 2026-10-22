/* Demo 1: Chilexpress · Coach ejecutivo de ventas (spec: demos/chilexpress.md).
   Simula, día a día, el flujo de la API APICoachEjecutivo con datos ficticios de
   scripts/demos/chilexpress-data.json (generados por analysis/coach_data.py).
   No llama a ningún modelo: las recomendaciones salen de reglas fijas. */
(function () {
  'use strict';

  var P = 'demo.chilexpress.';
  var PREFILTER_DAYS = 7;   /* PREFILTER_DAYS_THRESHOLD del README */
  var HISTORY_LIMIT = 5;    /* últimas 5 recomendaciones por cliente */
  var MAX_DAY = 25;
  var DEFAULTS = { exec: '01', cooldown: 7, threshold: 0.85 };
  var STEPS = ['mongo', 'memory', 'bedrock', 'validation', 'similarity', 'email'];
  var STEP_MS = 650;        /* tiempo que cada paso del flujo queda "en proceso" */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  function isEn() { return window.i18n.getLang() === 'en'; }
  function locale() { return isEn() ? 'en-US' : 'es-CL'; }

  function fmtInt(n) { return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(n); }

  function fmtClp(n) {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  }

  /* En español se escribe "35 %" (espacio no separable), como en CONTENT.md. */
  function pctText(text) { return isEn() ? text : text.replace(/\s?%/, ' %'); }

  function fmtPct(ratio) {
    return pctText(new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio));
  }

  function fmtSigned(ratio) {
    return pctText(new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(ratio));
  }

  function fmtDec(n) { return new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

  /* Los identificadores ficticios ("Cliente 005", "Ejecutivo 01") también se traducen. */
  function label(name) {
    return isEn() ? name.replace(/^Cliente /, 'Client ').replace(/^Ejecutivo /, 'Executive ') : name;
  }

  function plural(n, oneKey, otherKey) { return fill(t(n === 1 ? oneKey : otherKey), { n: n }); }

  /* Hash determinista en [0, 1) para la similitud simulada. */
  function unit(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }

  /* ---------- Reglas del coach ---------- */

  function profile(client, highValueCut) {
    var change = client.avg_last3 / client.avg_prev3 - 1;
    var compliance = client.pickups_scheduled ? client.pickups_done / client.pickups_scheduled : 1;
    var risky = client.risk_level === 'red' || client.drop_flag;
    var highValue = client.avg_last3 >= highValueCut;

    var score = (risky ? 50 : 0) + (highValue ? 30 : 0) + (client.claims_pending > 0 ? 20 : 0) +
      (compliance < 0.7 ? 15 : 0) + (change < -0.15 ? 10 : 0);

    var action = risky ? 'riesgo'
      : client.claims_pending > 0 ? 'reclamos'
      : compliance < 0.7 ? 'retiros'
      : change < -0.15 ? 'recuperar'
      : 'crecer';

    var factors = [];
    if (client.risk_level === 'red') factors.push({ key: 'risk' });
    if (client.drop_flag) factors.push({ key: 'drop' });
    if (highValue) factors.push({ key: 'value' });
    if (client.claims_pending > 0) factors.push({ key: 'claims', n: client.claims_pending });
    if (compliance < 0.7) factors.push({ key: 'pickups', p: compliance });
    if (change < -0.15) factors.push({ key: 'down', p: change });
    if (action === 'crecer' && change > 0) factors.push({ key: 'up', p: change });
    if (!factors.length) factors.push({ key: 'stable' });

    return {
      id: client.id,
      score: score,
      priority: score >= 70 ? 'critica' : score >= 40 ? 'alta' : 'media',
      action: action,
      factors: factors,
      compliance: compliance,
      risky: client.risk_level === 'red'
    };
  }

  /* Similitud simulada entre una candidata y una recomendación anterior. */
  function similarity(a, b) {
    var u = unit(a.id + a.action + '|' + b.id + b.action);
    if (a.id === b.id && a.action === b.action) return 0.86 + 0.08 * u;
    if (a.id === b.id) return 0.6 + 0.15 * u;
    return 0.2 + 0.3 * u;
  }

  function quantile(values, q) {
    var sorted = values.slice().sort(function (x, y) { return x - y; });
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  }

  /* Simula un día de POST /api/analyze para un ejecutivo. Modifica su memoria. */
  function runDay(exec, st, settings) {
    var d = st.day;
    var all = exec.profiles;
    var lastDayOf = {};
    st.memory.forEach(function (m) { lastDayOf[m.id] = Math.max(lastDayOf[m.id] || 0, m.day); });

    var prefiltered = all.filter(function (p) { return lastDayOf[p.id] && d - lastDayOf[p.id] < PREFILTER_DAYS; });
    var available = all.filter(function (p) { return prefiltered.indexOf(p) === -1; });
    var reset = null;
    var freed = [];

    if (available.length === 0) {
      reset = 'full';
      st.memory = [];
      available = all.slice();
    } else if (available.length < 3) {
      reset = 'partial';
      var need = 3 - available.length;
      freed = prefiltered.slice().sort(function (a, b) { return lastDayOf[a.id] - lastDayOf[b.id]; }).slice(0, need);
      var freedIds = freed.map(function (p) { return p.id; });
      st.memory = st.memory.filter(function (m) { return freedIds.indexOf(m.id) === -1; });
      available = available.concat(freed);
    }

    var candidates = available.slice().sort(function (a, b) { return b.score - a.score || (a.id < b.id ? -1 : 1); });
    var accepted = [];
    var filtered = [];
    var evaluated = 0;

    for (var i = 0; i < candidates.length && accepted.length < 3; i++) {
      var cand = candidates[i];
      evaluated++;
      var history = st.memory.filter(function (m) { return m.id === cand.id; })
        .sort(function (a, b) { return b.day - a.day; }).slice(0, HISTORY_LIMIT);
      var best = null;
      history.forEach(function (h) {
        var s = similarity(cand, h);
        if (!best || s > best.sim) best = { sim: s, day: h.day };
      });

      if (best && best.sim > settings.threshold && d - best.day < settings.cooldown) {
        filtered.push({ id: cand.id, sim: best.sim, day: best.day });
      } else {
        var repeated = !!(best && best.sim > settings.threshold);
        accepted.push({ profile: cand, status: repeated ? 'repeated' : 'new' });
      }
    }

    accepted.forEach(function (r) { st.memory.push({ id: r.profile.id, action: r.profile.action, day: d }); });

    return {
      day: d,
      prefiltered: reset === 'full' ? 0 : prefiltered.length - freed.length,
      available: available.length,
      reset: reset,
      freed: freed.length,
      evaluated: evaluated,
      accepted: accepted,
      filtered: filtered
    };
  }

  function metricsFor(exec, data, day) {
    var date = new Date(data.startDate.getTime());
    date.setDate(date.getDate() + day - 1);
    var dom = date.getDate();
    var sales = exec.sales_cumulative[dom - 1];
    var elapsed = dom / data.monthDays;
    var progress = sales / exec.goal;
    return {
      date: date,
      sales: sales,
      goal: exec.goal,
      progress: progress,
      elapsed: elapsed,
      daysLeft: data.monthDays - dom,
      atRisk: exec.profiles.filter(function (p) { return p.risky; }).length,
      claims: exec.clients.reduce(function (sum, c) { return sum + c.claims_pending; }, 0),
      lowPickups: exec.profiles.filter(function (p) { return p.compliance < 0.7; }).length,
      good: progress >= elapsed * 0.95
    };
  }

  /* ---------- Textos derivados ---------- */

  function factorText(f) {
    if (f.key === 'claims') return f.n === 1 ? t('factor.claims_one') : fill(t('factor.claims'), { n: f.n });
    if (f.key === 'pickups') return fill(t('factor.pickups'), { p: fmtPct(f.p) });
    if (f.key === 'down' || f.key === 'up') return fill(t('factor.' + f.key), { p: fmtSigned(f.p) });
    return t('factor.' + f.key);
  }

  function reasonText(p) {
    var text = p.factors.map(factorText).join(', ');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) + '.' : '';
  }

  function fmtDate(date, long) {
    return new Intl.DateTimeFormat(locale(), long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' }).format(date);
  }

  /* ---------- Plantilla ---------- */

  function template(data) {
    var options = data.executives.map(function (e) {
      return '<option value="' + e.id + '"></option>';
    }).join('');

    var steps = STEPS.map(function (s, i) {
      return '<li class="pipeline__step" data-step="' + s + '">' +
        '<span class="pipeline__index" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="pipeline__name" data-i18n="' + P + 'step.' + s + '"></span>' +
        '<span class="pipeline__desc" data-desc></span>' +
      '</li>';
    }).join('');

    var views = ['recs', 'email', 'json'].map(function (v, i) {
      return '<button class="demos__tab coach__view-tab" type="button" role="tab" id="cx-tab-' + v + '" aria-controls="cx-panel-' + v + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-view="' + v + '" data-i18n="' + P + 'view_' + v + '"></button>';
    }).join('');

    var panels = ['recs', 'email', 'json'].map(function (v, i) {
      return '<div class="coach__panel" id="cx-panel-' + v + '" role="tabpanel" aria-labelledby="cx-tab-' + v + '" tabindex="0"' + (i ? ' hidden' : '') + '></div>';
    }).join('');

    return '' +
      '<div class="demo coach">' +
        '<header class="demo__header">' +
          '<p class="demo-badge" data-i18n="demo.label"></p>' +
          '<h3 class="demo__title" data-i18n="' + P + 'title"></h3>' +
          '<p class="demo__lead" data-i18n="' + P + 'lead"></p>' +
          '<p class="demo__note" data-i18n="' + P + 'note_sim"></p>' +
        '</header>' +

        '<div class="demo-controls coach__controls">' +
          '<div class="field">' +
            '<label class="field__label" for="cx-exec" data-i18n="' + P + 'executive"></label>' +
            '<select class="select" id="cx-exec">' + options + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<div class="field__row">' +
              '<label class="field__label" for="cx-cooldown" data-i18n="' + P + 'cooldown"></label>' +
              '<output class="field__value" id="cx-cooldown-out" for="cx-cooldown"></output>' +
            '</div>' +
            '<input class="range" type="range" id="cx-cooldown" min="7" max="14" step="1" aria-describedby="cx-cooldown-hint">' +
          '</div>' +
          '<div class="field">' +
            '<div class="field__row">' +
              '<label class="field__label" for="cx-threshold" data-i18n="' + P + 'threshold"></label>' +
              '<output class="field__value" id="cx-threshold-out" for="cx-threshold"></output>' +
            '</div>' +
            '<input class="range" type="range" id="cx-threshold" min="0.70" max="0.95" step="0.01">' +
          '</div>' +
          '<div class="field field--actions">' +
            '<button class="btn btn--ghost" type="button" id="cx-run"></button>' +
            '<button class="btn btn--outline btn--sm" type="button" id="cx-reset" data-i18n="demo.reset"></button>' +
          '</div>' +
          '<p class="coach__hint" id="cx-cooldown-hint" data-i18n="' + P + 'cooldown_hint"></p>' +
        '</div>' +

        '<p class="coach__day" id="cx-day"></p>' +
        '<p class="visually-hidden" id="cx-live" aria-live="polite"></p>' +

        '<ol class="pipeline" data-i18n-aria-label="' + P + 'pipeline_label">' + steps + '</ol>' +

        '<dl class="coach__metrics" id="cx-metrics"></dl>' +

        '<div class="coach__result">' +
          '<div class="demos__tabs coach__views" role="tablist" data-i18n-aria-label="' + P + 'view_label">' + views + '</div>' +
          panels +
        '</div>' +

        '<section class="coach__memory" aria-labelledby="cx-memory-title">' +
          '<h4 class="stat-card__title" id="cx-memory-title" data-i18n="' + P + 'memory_title"></h4>' +
          '<ol class="memory-log" id="cx-memory"></ol>' +
        '</section>' +

        '<aside class="coach__real" aria-labelledby="cx-real-title">' +
          '<h4 class="stat-card__title" id="cx-real-title" data-i18n="' + P + 'real_title"></h4>' +
          '<ul class="coach__real-list" role="list">' +
            '<li data-i18n="projects.card.chilexpress.metric"></li>' +
            '<li data-i18n="' + P + 'real_time"></li>' +
            '<li data-i18n="' + P + 'real_parallel"></li>' +
            '<li data-i18n="' + P + 'real_cost"></li>' +
            '<li data-i18n="' + P + 'real_data"></li>' +
          '</ul>' +
        '</aside>' +
      '</div>';
  }

  /* ---------- Demo ---------- */

  function createDemo(host, raw) {
    var data = {
      startDate: new Date(raw.start + 'T12:00:00'),
      monthDays: raw.monthDays,
      executives: raw.executives
    };
    data.executives.forEach(function (e) {
      var cut = quantile(e.clients.map(function (c) { return c.avg_last3; }), 0.75);
      e.profiles = e.clients.map(function (c) { return profile(c, cut); });
    });

    var settings = { cooldown: DEFAULTS.cooldown, threshold: DEFAULTS.threshold };
    var states = {};
    var current = DEFAULTS.exec;
    var view = 'recs';
    var busy = false;

    function freshState() { return { day: 1, memory: [], log: [], last: null }; }
    function execById(id) { return data.executives.filter(function (e) { return e.id === id; })[0]; }
    function st() { return states[current] || (states[current] = freshState()); }

    host.innerHTML = template(data);
    window.i18n.apply(host);
    var $ = function (id) { return host.querySelector('#' + id); };

    function idle(panel) { panel.innerHTML = '<p class="coach__idle">' + esc(t('idle')) + '</p>'; }

    /* --- Render --- */

    function renderControls() {
      host.querySelectorAll('#cx-exec option').forEach(function (o) {
        var e = execById(o.value);
        o.textContent = fill(t('exec_option'), { name: label(e.name), n: e.clients.length });
      });
      $('cx-exec').value = current;
      $('cx-cooldown').value = settings.cooldown;
      $('cx-threshold').value = settings.threshold;
      var cd = plural(settings.cooldown, 'day_one', 'day_other');
      $('cx-cooldown-out').textContent = cd;
      $('cx-cooldown').setAttribute('aria-valuetext', cd);
      $('cx-threshold-out').textContent = fmtDec(settings.threshold);
      $('cx-threshold').setAttribute('aria-valuetext', fmtDec(settings.threshold));

      var s = st();
      var done = s.day > MAX_DAY;
      $('cx-run').textContent = done ? t('month_end') : fill(t('run'), { d: s.day });
      $('cx-run').disabled = done || busy;
      /* Guía visual: el botón parpadea siempre que se pueda ejecutar el día siguiente. */
      $('cx-run').classList.toggle('is-cue', !done && !busy);
    }

    function shownDay() { var s = st(); return s.last ? s.last.day : s.day; }

    function renderDay() {
      var m = metricsFor(execById(current), data, shownDay());
      $('cx-day').textContent = fill(t('day_label'), { d: shownDay(), date: fmtDate(m.date, true) });
    }

    function stepText(step, result, exec) {
      if (step === 'mongo') return fill(t('step.mongo_desc'), { n: exec.clients.length });
      if (step === 'memory') {
        if (result.reset === 'full') return fill(t('step.memory_full'), { a: result.available });
        if (result.reset === 'partial') return fill(t('step.memory_partial'), { f: result.freed });
        return fill(t('step.memory_desc'), { c: result.prefiltered, a: result.available });
      }
      if (step === 'bedrock') return fill(t('step.bedrock_desc'), { k: result.evaluated });
      if (step === 'validation') return fill(t('step.validation_desc'), { v: result.accepted.length, t: result.accepted.length });
      if (step === 'similarity') {
        var rep = result.accepted.filter(function (r) { return r.status === 'repeated'; }).length;
        return fill(t('step.similarity_desc'), { f: result.filtered.length, r: rep });
      }
      return t('step.email_desc');
    }

    /* upTo: pasos terminados. active: índice del paso en proceso (o -1). */
    function renderPipeline(result, upTo, active) {
      var exec = execById(current);
      host.querySelectorAll('.pipeline__step').forEach(function (li, i) {
        var on = !!result && i < upTo;
        var running = !!result && i === active;
        li.classList.toggle('is-done', on);
        li.classList.toggle('is-active', running);
        if (running) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
        li.querySelector('[data-desc]').textContent = on ? stepText(li.getAttribute('data-step'), result, exec) : running ? '…' : '';
      });
    }

    function statusPill(m) {
      return '<span class="status-pill status-pill--' + (m.good ? 'good' : 'help') + '">' + esc(t(m.good ? 'status_good' : 'status_help')) + '</span>';
    }

    function diagnosis(m) {
      return fill(t('diagnosis'), { p: fmtPct(m.progress), t: fmtPct(m.elapsed) });
    }

    function renderMetrics() {
      var m = metricsFor(execById(current), data, shownDay());
      var items = [
        ['sales', fmtClp(m.sales)],
        ['goal', fmtClp(m.goal)],
        ['progress', fmtPct(m.progress)],
        ['days_left', fmtInt(m.daysLeft)],
        ['at_risk', fmtInt(m.atRisk)]
      ];
      $('cx-metrics').innerHTML = items.map(function (it) {
        return '<div class="coach__metric"><dt>' + esc(t('metric.' + it[0])) + '</dt><dd>' + esc(it[1]) + '</dd></div>';
      }).join('') +
        '<p class="coach__diagnosis">' + statusPill(m) + ' ' + esc(diagnosis(m)) + '</p>';
    }

    function recItem(r, i) {
      var p = r.profile;
      return '<li class="rec">' +
        '<div class="rec__head">' +
          '<span class="rec__rank" aria-hidden="true">' + (i + 1) + '</span>' +
          '<span class="priority priority--' + p.priority + '">' + esc(t('priority.' + p.priority)) + '</span>' +
          '<span class="rec__client">' + esc(label(p.id)) + '</span>' +
          '<span class="stat-tag">' + esc(t('status.' + r.status)) + '</span>' +
        '</div>' +
        '<p class="rec__action">' + esc(t('action.' + p.action)) + '</p>' +
        '<p class="rec__reason">' + esc(reasonText(p)) + ' <span class="rec__score">· ' + esc(fill(t('score'), { s: p.score })) + '</span></p>' +
      '</li>';
    }

    function renderRecs() {
      var res = st().last;
      var panel = $('cx-panel-recs');
      if (!res) { idle(panel); return; }
      var html = '<ol class="rec-list" role="list">' + res.accepted.map(recItem).join('') + '</ol>';
      if (res.accepted.length < 3) html += '<p class="stat-card__note">' + esc(fill(t('fewer'), { n: res.accepted.length })) + '</p>';
      if (res.filtered.length) {
        html += '<div class="coach__filtered"><h4 class="coach__subtitle">' + esc(t('filtered_title')) + '</h4><ul role="list">' +
          res.filtered.map(function (f) {
            return '<li>' + esc(fill(t('filtered_item'), { client: label(f.id), s: fmtDec(f.sim), d: f.day })) + '</li>';
          }).join('') + '</ul></div>';
      }
      html += '<p class="stat-card__note">' + esc(t('similarity_note')) + '</p>';
      panel.innerHTML = html;
    }

    function renderEmail() {
      var res = st().last;
      var panel = $('cx-panel-email');
      if (!res) { idle(panel); return; }
      var exec = execById(current);
      var m = metricsFor(exec, data, res.day);
      var alerts = [];
      if (m.atRisk) alerts.push(plural(m.atRisk, 'alert.risk_one', 'alert.risk'));
      if (m.claims) alerts.push(plural(m.claims, 'alert.claims_one', 'alert.claims'));
      if (m.lowPickups) alerts.push(plural(m.lowPickups, 'alert.pickups_one', 'alert.pickups'));

      panel.innerHTML =
        '<article class="email">' +
          '<header class="email__header"><p class="email__subject">' + esc(fill(t('email_subject'), { name: label(exec.name), date: fmtDate(m.date) })) + '</p></header>' +
          '<div class="email__body">' +
            '<p>' + esc(fill(t('email_greeting'), { name: label(exec.name) })) + '</p>' +
            '<p>' + esc(t('email_intro')) + '</p>' +
            '<div class="email__progress">' +
              '<div class="email__progress-row"><span>' + esc(t('metric.progress')) + '</span><strong>' + esc(fmtPct(m.progress)) + '</strong></div>' +
              '<span class="email__bar" aria-hidden="true"><span style="width:' + Math.min(100, m.progress * 100).toFixed(1) + '%"></span></span>' +
              '<p class="email__muted">' + esc(fmtClp(m.sales)) + ' / ' + esc(fmtClp(m.goal)) + ' · ' + esc(t('metric.days_left')) + ': ' + esc(fmtInt(m.daysLeft)) + '</p>' +
            '</div>' +
            '<p>' + statusPill(m) + ' ' + esc(diagnosis(m)) + '</p>' +
            '<ol class="email__recs">' + res.accepted.map(function (r) {
              return '<li><span class="priority priority--' + r.profile.priority + '">' + esc(t('priority.' + r.profile.priority)) + '</span> ' +
                '<strong>' + esc(label(r.profile.id)) + '</strong> · ' + esc(t('action.' + r.profile.action)) +
                '<br><span class="email__muted">' + esc(reasonText(r.profile)) + '</span></li>';
            }).join('') + '</ol>' +
            (alerts.length ? '<h4 class="coach__subtitle">' + esc(t('email_alerts')) + '</h4><ul class="email__alerts">' +
              alerts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>' +
          '<footer class="email__footer">' + esc(t('email_footer')) + '</footer>' +
        '</article>';
    }

    function renderJson() {
      var res = st().last;
      var panel = $('cx-panel-json');
      if (!res) { idle(panel); return; }
      var exec = execById(current);
      var m = metricsFor(exec, data, res.day);
      var body = {
        data: {
          fecha_analisis: m.date.toISOString().slice(0, 10),
          ejecutivos: [{
            id_ejecutivo: exec.id,
            nombre: exec.name,
            estado: m.good ? 'Buen ritmo' : 'Necesita apoyo',
            metricas: {
              ventas_acumuladas: m.sales,
              meta_mes: m.goal,
              avance_porcentual: Number(m.progress.toFixed(2)),
              faltante: Math.max(0, m.goal - m.sales),
              dias_restantes: m.daysLeft
            },
            cartera: { total_clientes: exec.clients.length, clientes_riesgo_alto: m.atRisk },
            sugerencias_clientes: res.accepted.map(function (r) {
              return {
                prioridad: t('priority.' + r.profile.priority),
                cliente: r.profile.id,
                accion: t('action.' + r.profile.action),
                razon: reasonText(r.profile),
                estado_memoria: r.status === 'repeated' ? 'repeated_no_change' : 'new'
              };
            })
          }]
        },
        metadata: { model: 'amazon-nova-lite-v1 (simulado)' },
        recommendations_stored: res.accepted.length,
        recommendations_filtered: res.filtered.length,
        recommendations_invalid: 0
      };
      panel.innerHTML = '<p class="stat-card__note">' + esc(t('json_note')) + '</p>' +
        '<pre class="code-block"><code>' + esc(JSON.stringify(body, null, 2)) + '</code></pre>';
    }

    function renderMemory() {
      var log = st().log;
      var list = $('cx-memory');
      if (!log.length) {
        list.innerHTML = '<li class="memory-log__empty">' + esc(t('memory_empty')) + '</li>';
        return;
      }
      list.innerHTML = log.slice().reverse().map(function (r) {
        var tags = '';
        if (r.reset === 'full') tags += '<span class="memory-log__reset">' + esc(t('memory_reset_full')) + '</span>';
        if (r.reset === 'partial') tags += '<span class="memory-log__reset">' + esc(t('memory_reset_partial')) + '</span>';
        var chips = r.accepted.map(function (a) {
          var note = a.status === 'repeated' ? ' (' + t('status.repeated') + ')' : '';
          return '<span class="memory-log__chip' + (a.status === 'repeated' ? ' is-repeated' : '') + '">' + esc(label(a.profile.id)) +
            (note ? '<span class="visually-hidden">' + esc(note) + '</span>' : '') + '</span>';
        }).join('');
        var filtered = r.filtered.map(function (f) {
          return '<span class="memory-log__chip is-filtered"><span class="visually-hidden">' + esc(t('filtered_title')) + ': </span>' + esc(label(f.id)) + '</span>';
        }).join('');
        return '<li class="memory-log__row"><span class="memory-log__day">' + esc(fill(t('memory_day'), { d: r.day })) + '</span>' +
          '<span class="memory-log__items">' + tags + chips + filtered + '</span></li>';
      }).join('');
    }

    function renderView() {
      host.querySelectorAll('.coach__view-tab').forEach(function (tab) {
        var on = tab.getAttribute('data-view') === view;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      ['recs', 'email', 'json'].forEach(function (v) { $('cx-panel-' + v).hidden = v !== view; });
    }

    function renderAll() {
      renderControls();
      renderDay();
      renderPipeline(st().last, STEPS.length, -1);
      renderMetrics();
      renderRecs();
      renderEmail();
      renderJson();
      renderMemory();
      renderView();
    }

    /* --- Acciones --- */

    function run() {
      var s = st();
      if (busy || s.day > MAX_DAY) return;
      var result = runDay(execById(current), s, settings);
      s.log.push(result);
      s.last = result;
      s.day += 1;
      $('cx-live').textContent = fill(t('live_result'), { d: result.day, n: result.accepted.length, name: label(execById(current).name) });

      if (reducedMotion.matches) { renderAll(); return; }

      /* Cada paso queda "en proceso" un momento y luego se marca como listo;
         el resultado aparece al terminar el último paso. */
      busy = true;
      renderControls();
      renderDay();
      ['recs', 'email', 'json'].forEach(function (v) {
        $('cx-panel-' + v).innerHTML = '<p class="coach__idle coach__idle--running">' + esc(t('running')) + '</p>';
      });
      var step = 0;
      (function next() {
        renderPipeline(result, step, step);
        if (step < STEPS.length) { step += 1; setTimeout(next, STEP_MS); return; }
        busy = false;
        renderAll();
      })();
    }

    $('cx-run').addEventListener('click', run);
    $('cx-reset').addEventListener('click', function () {
      states = {};
      settings = { cooldown: DEFAULTS.cooldown, threshold: DEFAULTS.threshold };
      current = DEFAULTS.exec;
      view = 'recs';
      $('cx-live').textContent = '';
      renderAll();
    });
    $('cx-exec').addEventListener('change', function () { current = $('cx-exec').value; renderAll(); });
    $('cx-cooldown').addEventListener('input', function () { settings.cooldown = Number($('cx-cooldown').value); renderControls(); });
    $('cx-threshold').addEventListener('input', function () { settings.threshold = Number($('cx-threshold').value); renderControls(); });

    var tablist = host.querySelector('.coach__views');
    tablist.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-view]');
      if (!tab) return;
      view = tab.getAttribute('data-view');
      renderView();
    });
    tablist.addEventListener('keydown', function (event) {
      var order = ['recs', 'email', 'json'];
      var i = order.indexOf(view);
      var next = event.key === 'ArrowRight' ? (i + 1) % 3
        : event.key === 'ArrowLeft' ? (i + 2) % 3
        : event.key === 'Home' ? 0
        : event.key === 'End' ? 2 : null;
      if (next === null) return;
      event.preventDefault();
      view = order[next];
      renderView();
      $('cx-tab-' + view).focus();
    });

    document.addEventListener('i18n:change', renderAll);
    renderAll();
  }

  window.Demos.register('chilexpress', {
    label: 'API Coach Ejecutivo',
    init: function (host) {
      var data = fetch('scripts/demos/chilexpress-data.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .catch(function () {
          var err = new Error('data');
          err.messageKey = 'demo.chilexpress.error';
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
