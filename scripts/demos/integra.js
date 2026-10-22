/* Demo 2: Avista para Fundación Integra · De la observación a la acción (spec: demos/integra.md).
   Datos ficticios de scripts/demos/integra-data.json (generados por analysis/integra_data.py).
   Protección, clasificación y rúbrica se simulan con reglas en el navegador; no hay IA real. */
(function () {
  'use strict';

  var P = 'demo.integra.';
  var STEPS = ['captura', 'proteccion', 'clasificacion', 'evidencia', 'decision'];
  var STEP_MS = 650;
  var WINDOW = 6;           /* últimas 6 observaciones para la rúbrica */
  var MAX_CHARS = 280;
  var FORMATS = ['texto', 'audio', 'foto', 'video'];
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Palabras clave por dominio (raíces, sin tildes; español e inglés). */
  var LEXICON = {
    motor_grueso: ['camin', 'corr', 'salt', 'gate', 'trep', 'sub', 'escaler', 'escalon', 'equilibri', 'pate', 'sentad',
      'walk', 'run', 'jump', 'crawl', 'climb', 'stair', 'balanc', 'kick'],
    motor_fino: ['apil', 'cubo', 'cuchara', 'pinza', 'agarr', 'lapiz', 'garabat', 'dibuj', 'encaj', 'enhebr',
      'stack', 'block', 'spoon', 'grasp', 'pencil', 'scribbl', 'draw', 'thread', 'bead'],
    lenguaje_comunicacion: ['dice', 'palabra', 'nombr', 'balbuce', 'frase', 'cant', 'respond', 'pide', 'senal', 'cuento', 'silaba', 'vocaliz',
      'say', 'word', 'name', 'babbl', 'sentence', 'sing', 'ask', 'answer', 'point', 'story', 'talk'],
    socioemocional: ['compart', 'compan', 'amig', 'consuel', 'sonri', 'llor', 'calma', 'turno', 'abraz', 'salud',
      'share', 'classmate', 'friend', 'peer', 'comfort', 'smil', 'calm', 'turn', 'hug', 'greet'],
    cognitivo: ['busc', 'encuentr', 'escondid', 'agrup', 'clasific', 'color', 'figura', 'rompecabez', 'imit', 'resuelv', 'tablero',
      'look', 'find', 'hidden', 'sort', 'shape', 'puzzle', 'imitat', 'solv']
  };
  var PLUS = ['sola', 'solo', 'sin ayuda', 'por si mism', 'independiente', 'by herself', 'by himself', 'on their own', 'on her own', 'on his own', 'without help', 'independently'];
  var MINUS = ['con ayuda', 'intenta', 'aun no', 'todavia no', 'le cuesta', 'with help', 'tries', 'not yet', 'struggl'];

  /* Nombres frecuentes para el detector simplificado (sin tildes, en minúscula). */
  var NAMES = ['martina', 'sofia', 'isabella', 'agustina', 'florencia', 'josefa', 'emilia', 'catalina', 'valentina', 'antonella',
    'fernanda', 'maite', 'trinidad', 'amanda', 'julieta', 'camila', 'daniela', 'francisca', 'javiera', 'constanza', 'ignacia',
    'antonia', 'maria', 'ana', 'mateo', 'benjamin', 'agustin', 'vicente', 'tomas', 'lucas', 'maximiliano', 'joaquin', 'martin',
    'gaspar', 'cristobal', 'matias', 'santiago', 'diego', 'sebastian', 'felipe', 'juan', 'jose', 'pedro', 'luis', 'carlos', 'emma', 'olivia', 'noah', 'liam'];

  var PATTERNS = [
    ['correo', /[\w.+-]+@[\w-]+\.[\w.]+/g],
    ['rut', /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g],
    ['telefono', /(?:\+?56\s?)?\b9\s?\d{4}\s?\d{4}\b/g],
    ['direccion', /\b(?:calle|avenida|av\.|pasaje|psje\.)\s+[^\d,.;]{2,40}?\s\d{1,5}\b/gi]
  ];

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
  function fmtInt(n) { return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(n); }
  function fmtDec(n) { return new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

  function fmtDate(iso) {
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'));
  }

  function addDays(iso, days) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function normalize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function domainName(id) { return t('domains.' + (id || 'none')); }
  function levelName(n) { return fill(t('level_n'), { n: n }); }

  /* ---------- Protección de datos ---------- */

  /* Separa el texto en segmentos {text} y {mask: tipo} según los patrones de datos sensibles. */
  function protect(text) {
    var segments = [{ text: text }];
    PATTERNS.forEach(function (p) {
      var out = [];
      segments.forEach(function (seg) {
        if (seg.mask) { out.push(seg); return; }
        var last = 0;
        seg.text.replace(p[1], function (match) {
          var at = arguments[arguments.length - 2];
          if (at > last) out.push({ text: seg.text.slice(last, at) });
          out.push({ mask: p[0] });
          last = at + match.length;
          return match;
        });
        if (last < seg.text.length) out.push({ text: seg.text.slice(last) });
      });
      segments = out;
    });
    return segments;
  }

  /* Marca los nombres de la lista (palabras con mayúscula) y luego aplica los patrones.
     Devuelve los segmentos y cuántos datos se bloquearon. */
  function protectText(text) {
    var marked = text.replace(/[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+/g, function (word) {
      return NAMES.indexOf(normalize(word)) !== -1 ? '\u0000' + word + '\u0000' : word;
    });
    var result = { segments: [], count: 0 };
    protect(marked).forEach(function (seg) {
      if (seg.mask) { result.segments.push(seg); result.count++; return; }
      seg.text.split('\u0000').forEach(function (part, i) {
        if (i % 2 === 1) { result.segments.push({ mask: 'nombre' }); result.count++; }
        else if (part) result.segments.push({ text: part });
      });
    });
    return result;
  }

  function segmentsToText(segments) {
    return segments.map(function (s) { return s.mask ? t('mask.' + s.mask) : s.text; }).join('');
  }

  function segmentsToHtml(segments) {
    return segments.map(function (s) {
      return s.mask ? '<mark class="mask">' + esc(t('mask.' + s.mask)) + '</mark>' : esc(s.text);
    }).join('');
  }

  /* ---------- Clasificación y rúbrica ---------- */

  function classify(text, currentLevel) {
    var norm = normalize(text);
    var tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
    var hits = {};
    var total = 0;
    Object.keys(LEXICON).forEach(function (domain) {
      hits[domain] = tokens.filter(function (tok) {
        return LEXICON[domain].some(function (stem) { return tok.indexOf(stem) === 0; });
      }).length;
      total += hits[domain];
    });
    var best = null;
    Object.keys(hits).forEach(function (d) { if (hits[d] > 0 && (!best || hits[d] > hits[best])) best = d; });

    var plus = PLUS.filter(function (m) { return norm.indexOf(m) !== -1; }).length;
    var minus = MINUS.filter(function (m) { return norm.indexOf(m) !== -1; }).length;
    var level = Math.max(1, Math.min(9, currentLevel + Math.sign(plus - minus)));

    var confidence = best ? Math.min(0.95, 0.6 + 0.35 * hits[best] / total - (total < 2 ? 0.1 : 0)) : 0.35;
    return { domain: best, level: level, confidence: confidence };
  }

  function rubric(history, current) {
    var windowObs = history.slice(-WINDOW);
    var above = windowObs.filter(function (o) { return o.level > current; });
    var below = windowObs.filter(function (o) { return o.level < current; });
    var domainsAbove = above.reduce(function (set, o) { if (set.indexOf(o.domain) === -1) set.push(o.domain); return set; }, []).length;
    var base = { n: windowObs.length, cur: current, a: above.length, b: below.length, d: domainsAbove };

    if (above.length >= 4 && domainsAbove >= 3) {
      return Object.assign(base, { decision: 'avanzar', to: Math.min(9, current + 1), reason: 'avanzar', cited: above });
    }
    if (below.length >= 4) {
      return Object.assign(base, { decision: 'retroceder', to: Math.max(1, current - 1), reason: 'retroceder', cited: below });
    }
    var same = windowObs.filter(function (o) { return o.level === current; });
    return Object.assign(base, {
      decision: 'mantener', to: current,
      reason: above.length >= 4 ? 'insufficient' : 'mantener',
      cited: same.length ? same : windowObs
    });
  }

  function suggestionText(r) { return fill(t('suggestion.' + r.decision), { to: r.to }); }

  /* ---------- Plantilla ---------- */

  function template(data) {
    var children = data.children.map(function (c) { return '<option value="' + c.id + '"></option>'; }).join('');
    var chips = FORMATS.map(function (f) {
      return '<button class="chip" type="button" data-format="' + f + '" aria-pressed="false" data-i18n="' + P + 'formats.' + f + '"></button>';
    }).join('');
    var steps = STEPS.map(function (s, i) {
      return '<li class="pipeline__step" data-step="' + s + '">' +
        '<span class="pipeline__index" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="pipeline__name" data-i18n="' + P + 'step.' + s + '"></span>' +
        '<span class="pipeline__desc" data-desc></span>' +
      '</li>';
    }).join('');
    var views = ['result', 'log', 'report'];
    var tabs = views.map(function (v, i) {
      return '<button class="demos__tab ig-view-tab" type="button" role="tab" id="ig-tab-' + v + '" aria-controls="ig-panel-' + v + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-view="' + v + '" data-i18n="' + P + 'view_' + v + '"></button>';
    }).join('');
    var panels = views.map(function (v, i) {
      return '<div class="coach__panel" id="ig-panel-' + v + '" role="tabpanel" aria-labelledby="ig-tab-' + v + '" tabindex="0"' + (i ? ' hidden' : '') + '></div>';
    }).join('');

    return '' +
      '<div class="demo integra">' +
        '<header class="demo__header">' +
          '<p class="demo-badge" data-i18n="demo.label"></p>' +
          '<h3 class="demo__title" data-i18n="' + P + 'title"></h3>' +
          '<p class="demo__lead" data-i18n="' + P + 'lead"></p>' +
          '<p class="demo__note" data-i18n="' + P + 'note_sim"></p>' +
        '</header>' +

        '<div class="demo-controls integra__controls">' +
          '<div class="field">' +
            '<label class="field__label" for="ig-child" data-i18n="' + P + 'child"></label>' +
            '<select class="select" id="ig-child">' + children + '</select>' +
          '</div>' +
          '<div class="field integra__formats">' +
            '<span class="field__label" id="ig-format-label" data-i18n="' + P + 'format_label"></span>' +
            '<div class="integra__chips" role="group" aria-labelledby="ig-format-label">' + chips + '</div>' +
          '</div>' +
          '<div class="field integra__text">' +
            '<div class="field__row">' +
              '<label class="field__label" for="ig-text" id="ig-text-label"></label>' +
              '<span class="field__value integra__counter" id="ig-counter" aria-live="polite"></span>' +
            '</div>' +
            '<textarea class="textarea" id="ig-text" rows="3" maxlength="' + MAX_CHARS + '" aria-describedby="ig-hint"></textarea>' +
            '<p class="coach__hint" id="ig-hint"></p>' +
          '</div>' +
          '<div class="field field--actions integra__actions">' +
            '<button class="btn btn--ghost" type="button" id="ig-process" data-i18n="' + P + 'process"></button>' +
            '<button class="btn btn--outline btn--sm" type="button" id="ig-reset" data-i18n="demo.reset"></button>' +
          '</div>' +
        '</div>' +

        '<p class="visually-hidden" id="ig-live" aria-live="polite"></p>' +
        '<ol class="pipeline pipeline--5" data-i18n-aria-label="' + P + 'pipeline_label">' + steps + '</ol>' +

        '<div class="coach__result">' +
          '<div class="demos__tabs coach__views ig-views" role="tablist" data-i18n-aria-label="' + P + 'view_label">' + tabs + '</div>' +
          panels +
        '</div>' +

        '<aside class="coach__real integra__dataset" aria-labelledby="ig-dataset-title">' +
          '<h4 class="stat-card__title" id="ig-dataset-title" data-i18n="' + P + 'dataset_title"></h4>' +
          '<dl class="integra__dataset-list" id="ig-dataset"></dl>' +
          '<h4 class="stat-card__title" data-i18n="' + P + 'real_title"></h4>' +
          '<ul class="coach__real-list" role="list"><li data-i18n="projects.card.integra.metric"></li></ul>' +
        '</aside>' +

        '<p class="demo__note" data-i18n="' + P + 'footer_note"></p>' +
      '</div>';
  }

  /* ---------- Demo ---------- */

  function createDemo(host, data) {
    var state;
    var view = 'result';
    var busy = false;
    var counted = false;

    function freshState() {
      var children = {};
      data.children.forEach(function (c) {
        children[c.id] = {
          level: c.level,
          history: c.history.map(function (o) { return Object.assign({}, o); }),
          result: null,
          decisions: [],
          logApproved: false
        };
      });
      return { child: data.children[0].id, format: 'texto', sample: true, text: '', children: children };
    }

    state = freshState();
    host.innerHTML = template(data);
    window.i18n.apply(host);
    var $ = function (id) { return host.querySelector('#' + id); };
    var textarea = $('ig-text');

    function childData(id) { return data.children.filter(function (c) { return c.id === id; })[0]; }
    function cs() { return state.children[state.child]; }
    function sampleText() { return data.samples[state.format][lang()]; }

    function noteText(o) { return o.segments ? segmentsToText(o.segments) : o.note[lang()]; }

    /* --- Render --- */

    function renderControls() {
      host.querySelectorAll('#ig-child option').forEach(function (o) {
        var c = childData(o.value);
        o.textContent = fill(t('child_option'), { id: c.id, age: c.age_months, level: state.children[c.id].level });
      });
      $('ig-child').value = state.child;
      host.querySelectorAll('[data-format]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-format') === state.format));
      });
      $('ig-text-label').textContent = t('text_label.' + state.format);
      if (state.sample) textarea.value = sampleText();
      var len = textarea.value.length;
      $('ig-counter').textContent = fill(t('counter'), { n: len });
      var trimmed = textarea.value.trim();
      var hint = !trimmed ? t('empty_hint') : trimmed.length < 10 ? t('too_short') : '';
      $('ig-hint').textContent = hint;
      $('ig-hint').hidden = !hint;
      $('ig-process').disabled = busy || trimmed.length < 10;
      /* Guía visual: "Procesar" se ilumina hasta la primera observación procesada de este niño/a. */
      $('ig-process').classList.toggle('is-cue', !busy && !cs().result && trimmed.length >= 10);
    }

    function stepText(step, r) {
      if (step === 'captura') return t('captura_desc.' + r.format);
      if (step === 'proteccion') return r.blocked === 0 ? t('blocked_none') : r.blocked === 1 ? t('blocked_one') : fill(t('blocked_other'), { n: r.blocked });
      if (step === 'clasificacion') return fill(t('clasificacion_desc'), { domain: domainName(r.cls.domain), level: r.cls.level });
      if (step === 'evidencia') return fill(t('evidencia_desc'), { suggestion: suggestionText(r.rub) });
      return r.decided ? t('decision_done') : t('decision_wait');
    }

    function renderPipeline(r, upTo, active) {
      host.querySelectorAll('.pipeline__step').forEach(function (li, i) {
        var step = li.getAttribute('data-step');
        var done = !!r && i < upTo && (step !== 'decision' || r.decided);
        var running = !!r && i === active;
        li.classList.toggle('is-done', done);
        li.classList.toggle('is-active', running);
        if (running) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.querySelector('[data-desc]').textContent = done || (running && step === 'decision') ? stepText(step, r) : running ? '…' : '';
      });
    }

    function idle(panel, key) { panel.innerHTML = '<p class="coach__idle">' + esc(t(key || 'idle')) + '</p>'; }

    function evidenceItem(o) {
      return '<li class="evidence__item">' +
        '<span class="evidence__meta">' + esc(fmtDate(o.date)) + ' · ' + esc(domainName(o.domain)) + ' · ' + esc(levelName(o.level)) +
        (o.isNew ? ' <span class="stat-tag">' + esc(t('evidence_new')) + '</span>' : '') + '</span>' +
        '<span class="evidence__note">' + esc(noteText(o)) + '</span></li>';
    }

    function renderResult() {
      var c = cs();
      var r = c.result;
      var panel = $('ig-panel-result');
      if (!r) { idle(panel); return; }
      var rub = r.rub;
      var blocked = r.blocked === 0 ? t('blocked_none') : r.blocked === 1 ? t('blocked_one') : fill(t('blocked_other'), { n: r.blocked });

      var decisionHtml;
      if (r.decided) {
        decisionHtml = '<p class="integra__decided" role="status">' + esc(r.decidedText) + '</p>';
      } else {
        var options = '';
        for (var n = 1; n <= 9; n++) options += '<option value="' + n + '"' + (n === rub.to ? ' selected' : '') + '>' + esc(levelName(n)) + '</option>';
        decisionHtml =
          '<div class="integra__decision-actions">' +
            '<button class="btn btn--ghost btn--sm integra__confirm" type="button" data-decide="confirmed">' + esc(t('confirm')) + '</button>' +
            '<button class="btn btn--outline btn--sm" type="button" data-decide="correct" aria-expanded="false" aria-controls="ig-correct">' + esc(t('correct')) + '</button>' +
            '<button class="btn btn--outline btn--sm" type="button" data-decide="rejected">' + esc(t('reject')) + '</button>' +
          '</div>' +
          '<div class="integra__correct" id="ig-correct" hidden>' +
            '<label class="field__label" for="ig-correct-level">' + esc(t('correct_label')) + '</label>' +
            '<div class="integra__correct-row"><select class="select" id="ig-correct-level">' + options + '</select>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-decide="corrected">' + esc(t('apply')) + '</button></div>' +
          '</div>';
      }

      var decisions = c.decisions.length
        ? '<ol class="integra__history" role="list">' + c.decisions.slice().reverse().map(function (d) {
            return '<li><span class="evidence__meta">' + esc(fmtDate(d.date)) + '</span> ' + esc(d.text) + '</li>';
          }).join('') + '</ol>'
        : '<p class="stat-card__note">' + esc(t('history_empty')) + '</p>';

      panel.innerHTML =
        '<div class="integra__result">' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title">' + esc(t('protected_title')) + '</h4>' +
            '<p class="integra__protected">' + segmentsToHtml(r.segments) + '</p>' +
            '<p class="stat-card__note">' + esc(blocked) + ' · ' + esc(t('protected_note')) + '</p>' +
          '</section>' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title">' + esc(t('class_title')) + '</h4>' +
            '<dl class="coach__metrics integra__class">' +
              '<div class="coach__metric"><dt>' + esc(t('domain')) + '</dt><dd>' + esc(domainName(r.cls.domain)) + '</dd></div>' +
              '<div class="coach__metric"><dt>' + esc(t('level')) + '</dt><dd>' + esc(levelName(r.cls.level)) + '</dd></div>' +
              '<div class="coach__metric"><dt>' + esc(t('confidence')) + '</dt><dd>' + esc(fmtDec(r.cls.confidence)) + '</dd></div>' +
            '</dl>' +
            (r.cls.domain ? '' : '<p class="stat-card__note">' + esc(t('no_domain')) + '</p>') +
          '</section>' +
          '<section class="integra__block integra__suggestion">' +
            '<h4 class="stat-card__title">' + esc(t('suggestion_title')) + '</h4>' +
            '<p class="integra__suggestion-main"><span class="decision-badge decision-badge--' + rub.decision + '">' + esc(t('decision.' + rub.decision)) + '</span> ' +
              esc(rub.to === rub.cur ? levelName(rub.cur) : fill(t('level_change'), { cur: rub.cur, to: rub.to })) + '</p>' +
            '<p class="rec__reason">' + esc(fill(t('reason.' + rub.reason), rub)) + '</p>' +
            '<h5 class="coach__subtitle">' + esc(t('evidence_title')) + '</h5>' +
            '<ul class="evidence" role="list">' + rub.cited.map(evidenceItem).join('') + '</ul>' +
            '<p class="stat-card__note">' + esc(t('rubric_note')) + '</p>' +
          '</section>' +
          /* Mientras espera la decisión, el bloque y "Confirmar" se destacan para guiar al visitante. */
          '<section class="integra__block integra__decision' + (r.decided ? '' : ' is-pending') + '">' +
            (r.decided ? '' : '<p class="integra__next" id="ig-next">' + esc(t('next_step')) + '</p>') +
            '<p class="integra__ai">' + esc(t('ai_proposes')) + '</p>' +
            decisionHtml +
            '<h5 class="coach__subtitle">' + esc(t('history_title')) + '</h5>' +
            decisions +
          '</section>' +
        '</div>';
    }

    function renderLog() {
      var c = cs();
      var panel = $('ig-panel-log');
      var hist = c.history;
      var to = hist[hist.length - 1].date;
      var from = addDays(to, -14);
      var period = hist.filter(function (o) { return o.date >= from; });
      var domains = period.reduce(function (set, o) { if (set.indexOf(o.domain) === -1) set.push(o.domain); return set; }, []);
      var highlights = period.slice(-2).map(noteText).join(' ');
      var rub = rubric(hist, c.level);
      var info = childData(state.child);

      /* Una acción por dominio observado en la quincena (los más recientes primero, máximo 3),
         con un tono según la sugerencia: desafiar, consolidar o apoyar. */
      var actions = [];
      period.slice().reverse().forEach(function (o) {
        if (o.domain === 'none' || actions.length >= 3) return;
        if (actions.some(function (a) { return a.domain === o.domain; })) return;
        actions.push({ domain: o.domain, note: noteText(o) });
      });

      var infoItems = [
        [t('log.info.child'), state.child],
        [t('log.info.age'), fill(t('log.info.age_value'), { n: info.age_months })],
        [t('log.info.level'), levelName(c.level)],
        [t('log.info.room'), info.room],
        [t('log.info.obs'), fmtInt(period.length)]
      ];

      panel.innerHTML =
        '<article class="email integra__log">' +
          '<header class="email__header"><p class="email__subject">' + esc(fill(t('log_title'), { child: state.child, from: fmtDate(from), to: fmtDate(to) })) + '</p></header>' +
          '<div class="email__body">' +
            '<dl class="integra__log-info">' + infoItems.map(function (it) {
              return '<div><dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd></div>';
            }).join('') + '</dl>' +
            '<p><span class="status-pill status-pill--' + (c.logApproved ? 'good' : 'help') + '">' + esc(t(c.logApproved ? 'log_approved' : 'log_pending')) + '</span></p>' +

            '<h4 class="coach__subtitle">' + esc(t('log.summary_title')) + '</h4>' +
            '<p>' + esc(fill(t('log_body'), { n: period.length, d: domains.length, domains: domains.map(domainName).join(', ') })) + '</p>' +
            '<p>' + esc(fill(t('log_highlights'), { highlights: highlights })) + '</p>' +

            '<h4 class="coach__subtitle">' + esc(t('log.rubric_title')) + '</h4>' +
            '<p class="integra__suggestion-main integra__suggestion-main--sm"><span class="decision-badge decision-badge--' + rub.decision + '">' + esc(t('decision.' + rub.decision)) + '</span> ' +
              esc(rub.to === rub.cur ? levelName(rub.cur) : fill(t('level_change'), { cur: rub.cur, to: rub.to })) + '</p>' +
            '<p class="email__muted">' + esc(fill(t('reason.' + rub.reason), rub)) + '</p>' +

            '<h4 class="coach__subtitle">' + esc(t('log.actions_title')) + '</h4>' +
            '<ul class="integra__actions-list" role="list">' + actions.map(function (a) {
              return '<li><strong>' + esc(domainName(a.domain)) + ':</strong> ' + esc(t('action.' + rub.decision + '.' + a.domain)) +
                '<span class="email__muted integra__actions-from">' + esc(fill(t('log.actions_from'), { note: a.note })) + '</span></li>';
            }).join('') + '</ul>' +
            '<p class="email__muted">' + esc(t('log.actions_note')) + '</p>' +
            '<p class="email__muted">' + esc(t('log_note')) + '</p>' +
            (c.logApproved ? '' : '<div><button class="btn btn--ghost btn--sm" type="button" id="ig-approve">' + esc(t('log_approve')) + '</button></div>') +
          '</div>' +
        '</article>';
      var approve = $('ig-approve');
      if (approve) approve.addEventListener('click', function () { cs().logApproved = true; renderLog(); $('ig-panel-log').focus(); });
    }

    function bars(entries) {
      var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }).concat([1]));
      return '<ul class="hbars" role="list">' + entries.map(function (e) {
        return '<li class="hbars__row"><span class="hbars__label">' + esc(e[0]) + '</span>' +
          '<span class="hbars__track" aria-hidden="true"><span class="hbars__bar" style="width:' + (e[1] / max * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hbars__value">' + esc(fmtInt(e[1])) + '</span></li>';
      }).join('') + '</ul>';
    }

    function renderReport() {
      var rep = data.report;
      var suggestions = ['avanzar', 'mantener', 'retroceder'].map(function (k) { return [t('decision.' + k), rep.suggestions[k]]; });
      var levels = rep.levels.map(function (v, i) { return [levelName(i + 1), v]; });
      var formats = FORMATS.map(function (f) { return [t('formats.' + f), rep.formats[f]]; });
      $('ig-panel-report').innerHTML =
        '<div class="integra__report">' +
          '<p class="coach__day">' + esc(fill(t('report_title'), { room: rep.room, n: rep.children })) + '</p>' +
          '<p class="stat-card__note">' + esc(t('report_note')) + '</p>' +
          '<div class="integra__report-grid">' +
            '<section><h4 class="stat-card__title">' + esc(t('report_suggestions')) + '</h4>' + bars(suggestions) + '</section>' +
            '<section><h4 class="stat-card__title">' + esc(t('report_levels')) + '</h4>' + bars(levels) + '</section>' +
            '<section><h4 class="stat-card__title">' + esc(fill(t('report_formats'), { n: rep.observations })) + '</h4>' + bars(formats) + '</section>' +
          '</div>' +
        '</div>';
    }

    function renderDataset() {
      var ds = data.dataset;
      var items = [['children', ds.children], ['observations', ds.observations], ['gardens', ds.gardens], ['levels', ds.levels], ['domains', ds.domains]];
      $('ig-dataset').innerHTML = items.map(function (it) {
        return '<div class="coach__metric"><dt>' + esc(t('dataset.' + it[0])) + '</dt><dd data-count="' + it[1] + '">' + esc(counted ? fmtInt(it[1]) : '0') + '</dd></div>';
      }).join('');
      if (!counted) countUp();
    }

    /* Contador de las cifras del dataset (spec: animación al cargar). */
    function countUp() {
      counted = true;
      var nodes = host.querySelectorAll('[data-count]');
      if (reducedMotion.matches) { nodes.forEach(function (n) { n.textContent = fmtInt(+n.getAttribute('data-count')); }); return; }
      var t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / 1200, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        nodes.forEach(function (n) { n.textContent = fmtInt(Math.round(+n.getAttribute('data-count') * eased)); });
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function renderView() {
      host.querySelectorAll('.ig-view-tab').forEach(function (tab) {
        var on = tab.getAttribute('data-view') === view;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      ['result', 'log', 'report'].forEach(function (v) { $('ig-panel-' + v).hidden = v !== view; });
    }

    function renderAll() {
      renderControls();
      var r = cs().result;
      renderPipeline(r, STEPS.length, r && !r.decided ? STEPS.length - 1 : -1);
      renderResult();
      renderLog();
      renderReport();
      renderDataset();
      renderView();
    }

    /* --- Acciones --- */

    function process() {
      var text = textarea.value.trim();
      if (busy || text.length < 10) return;
      var c = cs();
      var prot = protectText(text);
      var cls = classify(segmentsToText(prot.segments), c.level);
      var last = c.history[c.history.length - 1];
      var obs = {
        date: addDays(last.date, 3),
        domain: cls.domain || 'none',
        level: cls.level,
        format: state.format,
        segments: prot.segments,
        isNew: true
      };
      c.history.forEach(function (o) { o.isNew = false; });
      c.history.push(obs);
      c.logApproved = false;
      var rub = rubric(c.history, c.level);
      c.result = { format: state.format, segments: prot.segments, blocked: prot.count, cls: cls, rub: rub, decided: false, date: obs.date };

      $('ig-live').textContent = fill(t('live'), { domain: domainName(cls.domain), level: cls.level, suggestion: suggestionText(rub) });
      view = 'result';

      if (reducedMotion.matches) { renderAll(); return; }

      busy = true;
      renderControls();
      renderView();
      ['result', 'log'].forEach(function (v) {
        $('ig-panel-' + v).innerHTML = '<p class="coach__idle coach__idle--running">' + esc(t('running')) + '</p>';
      });
      var step = 0;
      (function next() {
        renderPipeline(c.result, step, step);
        if (step < STEPS.length - 1) { step += 1; setTimeout(next, STEP_MS); return; }
        busy = false;
        renderAll();
      })();
    }

    function decide(kind) {
      var c = cs();
      var r = c.result;
      if (!r || r.decided) return;
      if (kind === 'correct') {
        var box = $('ig-correct');
        box.hidden = !box.hidden;
        host.querySelector('[data-decide="correct"]').setAttribute('aria-expanded', String(!box.hidden));
        if (!box.hidden) $('ig-correct-level').focus();
        return;
      }
      var cur = c.level;
      var text;
      if (kind === 'confirmed') { c.level = r.rub.to; text = fill(t('decided.confirmed'), { text: suggestionText(r.rub) }); }
      if (kind === 'corrected') { c.level = Number($('ig-correct-level').value); text = fill(t('decided.corrected'), { to: c.level }); }
      if (kind === 'rejected') { text = fill(t('decided.rejected'), { cur: cur }); }
      r.decided = true;
      r.decidedText = text;
      c.decisions.push({ date: r.date, text: text });
      $('ig-live').textContent = text;
      renderAll();
      $('ig-panel-result').focus();
    }

    $('ig-child').addEventListener('change', function () { state.child = $('ig-child').value; renderAll(); });
    host.querySelector('.integra__chips').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-format]');
      if (!chip) return;
      state.format = chip.getAttribute('data-format');
      state.sample = true;
      renderControls();
    });
    textarea.addEventListener('input', function () { state.sample = false; renderControls(); });
    $('ig-process').addEventListener('click', process);
    $('ig-reset').addEventListener('click', function () {
      state = freshState();
      view = 'result';
      $('ig-live').textContent = '';
      renderAll();
    });
    $('ig-panel-result').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-decide]');
      if (btn) decide(btn.getAttribute('data-decide'));
    });

    var tablist = host.querySelector('.ig-views');
    tablist.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-view]');
      if (!tab) return;
      view = tab.getAttribute('data-view');
      renderView();
    });
    tablist.addEventListener('keydown', function (event) {
      var order = ['result', 'log', 'report'];
      var i = order.indexOf(view);
      var next = event.key === 'ArrowRight' ? (i + 1) % 3
        : event.key === 'ArrowLeft' ? (i + 2) % 3
        : event.key === 'Home' ? 0
        : event.key === 'End' ? 2 : null;
      if (next === null) return;
      event.preventDefault();
      view = order[next];
      renderView();
      $('ig-tab-' + view).focus();
    });

    document.addEventListener('i18n:change', renderAll);
    renderAll();
  }

  window.Demos.register('integra', {
    label: 'Avista',
    init: function (host) {
      var data = fetch('scripts/demos/integra-data.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .catch(function () {
          var err = new Error('data');
          err.messageKey = 'demo.integra.error';
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
