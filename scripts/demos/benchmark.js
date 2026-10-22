/* Demo 4: CloudArena · Chat comparativo multicloud (spec: demos/benchmark.md).
   Sigue el flujo de POST /chatbot del README de CloudArena: Redis (memoria de sesión),
   MongoDB (registro) y dos agentes en paralelo. Respuestas, latencias y tokens simulados
   de scripts/demos/benchmark-data.json. */
(function () {
  'use strict';

  var P = 'demo.benchmark.';
  var STEPS = ['load', 'save_user', 'call', 'save_answers', 'return'];
  var STEP_MS = 650;
  var LATENCY_SCALE = 0.6;  /* la espera visible es más corta que la latencia simulada que se muestra */
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

  function lang() { return window.i18n.getLang() === 'en' ? 'en' : 'es'; }
  function locale() { return lang() === 'en' ? 'en-US' : 'es-CL'; }
  function fmt(n, digits) { return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits || 0, minimumFractionDigits: digits || 0 }).format(n); }

  function sessionId() {
    var hex = '';
    for (var i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return 'sess-' + hex;
  }

  /* ---------- Plantilla ---------- */

  function template(data) {
    var options = data.prompts.map(function (p) { return '<option value="' + p.id + '"></option>'; }).join('');
    var steps = STEPS.map(function (s, i) {
      return '<li class="pipeline__step" data-step="' + s + '">' +
        '<span class="pipeline__index" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="pipeline__name" data-i18n="' + P + 'step.' + s + '"></span>' +
        '<span class="pipeline__desc" data-desc></span>' +
      '</li>';
    }).join('');
    var cols = data.agents.map(function (a) {
      return '<article class="arena__col" data-agent="' + a.id + '" aria-labelledby="ar-name-' + a.id + '">' +
        /* El modelo es la identidad principal; el servicio de nube que lo sirve va debajo. */
        '<header class="arena__col-head"><div class="arena__who">' +
          '<h4 class="arena__name" id="ar-name-' + a.id + '">' + esc(a.model || a.name || a.id) + '</h4>' +
          '<p class="arena__provider" data-provider="' + esc(a.provider || '') + '"></p>' +
        '</div>' +
        '<span class="stat-tag" data-i18n="' + P + 'simulated"></span></header>' +
        '<div class="arena__answer" data-answer></div>' +
        '<p class="arena__metrics" data-metrics></p>' +
      '</article>';
    }).join('');

    return '' +
      '<div class="demo arena">' +
        '<header class="demo__header">' +
          '<p class="demo-badge" data-i18n="demo.label"></p>' +
          '<h3 class="demo__title" data-i18n="' + P + 'title"></h3>' +
          '<p class="demo__lead" data-i18n="' + P + 'lead"></p>' +
          '<p class="demo__note" data-i18n="' + P + 'pairing_note"></p>' +
          '<p class="demo__note" data-i18n="' + P + 'note_sim"></p>' +
        '</header>' +

        '<div class="demo-controls arena__controls">' +
          '<div class="field">' +
            '<label class="field__label" for="ar-prompt" data-i18n="' + P + 'prompt_label"></label>' +
            '<select class="select" id="ar-prompt">' + options + '</select>' +
          '</div>' +
          '<div class="field field--actions">' +
            '<button class="btn btn--ghost" type="button" id="ar-send" data-i18n="' + P + 'send"></button>' +
            '<button class="btn btn--outline btn--sm" type="button" id="ar-reset" data-i18n="demo.reset"></button>' +
          '</div>' +
          '<pre class="code-block arena__prompt" id="ar-prompt-text" tabindex="0"></pre>' +
        '</div>' +

        '<p class="visually-hidden" id="ar-live" aria-live="polite"></p>' +
        '<ol class="pipeline pipeline--5" data-i18n-aria-label="' + P + 'pipeline_label">' + steps + '</ol>' +

        '<div class="arena__cols">' + cols + '</div>' +
        '<section class="integra__block arena__vote" id="ar-vote"></section>' +

        '<div class="arena__side">' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title" data-i18n="' + P + 'memory_title"></h4>' +
            '<dl class="integra__log-info arena__memory" id="ar-memory"></dl>' +
          '</section>' +
          '<section class="integra__block">' +
            '<h4 class="stat-card__title" data-i18n="' + P + 'votes_title"></h4>' +
            '<div id="ar-votes"></div>' +
            '<p class="stat-card__note" data-i18n="' + P + 'votes_note"></p>' +
          '</section>' +
        '</div>' +

        '<section class="integra__block">' +
          '<h4 class="stat-card__title" data-i18n="' + P + 'history_title"></h4>' +
          '<ol class="integra__history" id="ar-history"></ol>' +
        '</section>' +

        '<p class="demo__note" data-i18n="' + P + 'repo_note"></p>' +
      '</div>';
  }

  /* ---------- Demo ---------- */

  function createDemo(host, data) {
    var state;
    var timers = [];

    function freshState() {
      return {
        prompt: data.prompts[0].id,
        session: sessionId(),
        redis: 0,
        mongo: 0,
        current: null,        /* { prompt, arrived: {}, order: [], step, done, vote } */
        history: [],
        votes: { azure: 0, aws: 0, tie: 0 },
        busy: false
      };
    }

    state = freshState();
    host.innerHTML = template(data);
    window.i18n.apply(host);
    var $ = function (id) { return host.querySelector('#' + id); };

    function promptById(id) { return data.prompts.filter(function (p) { return p.id === id; })[0]; }
    /* model es el campo actual; name queda como respaldo para datos antiguos. */
    function modelOf(a) { return a.model || a.name || a.id; }
    function agentName(id) { return id === 'tie' ? t('vote_tie') : modelOf(data.agents.filter(function (a) { return a.id === id; })[0]); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    /* --- Render --- */

    function renderProviders() {
      host.querySelectorAll('[data-provider]').forEach(function (el) {
        el.textContent = fill(t('provided_by'), { provider: el.getAttribute('data-provider') });
      });
    }

    function renderControls() {
      host.querySelectorAll('#ar-prompt option').forEach(function (o) {
        var p = promptById(o.value);
        o.textContent = fill(t('prompt_option'), { level: p.level, kind: t('kind.' + p.kind) });
      });
      $('ar-prompt').value = state.prompt;
      $('ar-prompt').disabled = state.busy;
      $('ar-prompt-text').textContent = promptById(state.prompt).text[lang()];
      var c = state.current;
      var waitingVote = c && c.done && !c.vote;
      $('ar-send').disabled = state.busy;
      /* Guía visual: "Enviar" parpadea cuando es el siguiente paso (no mientras se espera el voto). */
      $('ar-send').classList.toggle('is-cue', !state.busy && !waitingVote);
    }

    function stepText(step) {
      if (step === 'load') return fill(t('step_desc.load'), { n: state.current ? state.current.redisBefore : state.redis });
      return t('step_desc.' + step);
    }

    function renderPipeline() {
      var c = state.current;
      host.querySelectorAll('.pipeline__step').forEach(function (li, i) {
        var done = !!c && (c.done || i < c.step);
        var active = !!c && !c.done && i === c.step;
        li.classList.toggle('is-done', done);
        li.classList.toggle('is-active', active);
        if (active) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.querySelector('[data-desc]').textContent = done ? stepText(li.getAttribute('data-step')) : active ? '…' : '';
      });
    }

    function renderColumns() {
      var c = state.current;
      host.querySelectorAll('.arena__col').forEach(function (col) {
        var id = col.getAttribute('data-agent');
        var answer = col.querySelector('[data-answer]');
        var metrics = col.querySelector('[data-metrics]');
        col.classList.remove('is-first');
        if (!c) {
          answer.innerHTML = '<p class="coach__idle">' + esc(t('idle')) + '</p>';
          metrics.textContent = '';
          return;
        }
        var a = promptById(c.prompt).answers[id];
        if (!c.arrived[id]) {
          answer.innerHTML = c.step >= 2 ? '<p class="arena__typing">' + esc(t('typing')) + '</p>' : '';
          metrics.textContent = '';
          return;
        }
        answer.innerHTML = '<pre class="arena__text">' + esc(a[lang()]) + '</pre>';
        metrics.innerHTML = esc(fill(t('metrics'), { lat: fmt(a.latency_ms / 1000, 1), tin: fmt(a.tokens_in), tout: fmt(a.tokens_out) })) +
          (c.order[0] === id && c.order.length === 2 ? ' <span class="stat-tag">' + esc(t('faster')) + '</span>' : '');
        if (c.order[0] === id && c.order.length === 2) col.classList.add('is-first');
      });
    }

    function renderVote() {
      var c = state.current;
      var box = $('ar-vote');
      if (!c || !c.done) { box.hidden = true; return; }
      box.hidden = false;
      var pending = !c.vote;
      box.classList.toggle('integra__decision', true);
      box.classList.toggle('is-pending', pending);
      if (pending) {
        box.innerHTML =
          '<p class="integra__next">' + esc(t('vote_next')) + '</p>' +
          '<p class="integra__ai">' + esc(t('vote_title')) + '</p>' +
          '<div class="integra__decision-actions">' +
            data.agents.map(function (a) {
              return '<button class="btn btn--ghost btn--sm integra__confirm" type="button" data-vote="' + a.id + '">' + esc(modelOf(a)) + '</button>';
            }).join('') +
            '<button class="btn btn--outline btn--sm" type="button" data-vote="tie">' + esc(t('vote_tie')) + '</button>' +
          '</div>';
      } else {
        box.innerHTML = '<p class="integra__decided" role="status">' + esc(fill(t('vote_done'), { choice: agentName(c.vote) })) + '</p>';
      }
    }

    function renderMemory() {
      var items = [
        [t('session'), state.session],
        [t('redis'), fill(t('redis_value'), { n: fmt(state.redis) })],
        [t('mongo'), fill(t('mongo_value'), { n: fmt(state.mongo) })]
      ];
      $('ar-memory').innerHTML = items.map(function (it) {
        return '<div><dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd></div>';
      }).join('');
    }

    function renderVotes() {
      var entries = [['azure', state.votes.azure], ['aws', state.votes.aws], ['tie', state.votes.tie]];
      var max = Math.max(1, state.votes.azure, state.votes.aws, state.votes.tie);
      $('ar-votes').innerHTML = '<ul class="hbars" role="list">' + entries.map(function (e) {
        return '<li class="hbars__row"><span class="hbars__label">' + esc(agentName(e[0])) + '</span>' +
          '<span class="hbars__track" aria-hidden="true"><span class="hbars__bar" style="width:' + (e[1] / max * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hbars__value">' + esc(fmt(e[1])) + '</span></li>';
      }).join('') + '</ul>';
    }

    function renderHistory() {
      var list = $('ar-history');
      if (!state.history.length) {
        list.innerHTML = '<li class="stat-card__note">' + esc(t('history_empty')) + '</li>';
        return;
      }
      list.innerHTML = state.history.slice().reverse().map(function (h) {
        var p = promptById(h.prompt);
        return '<li><span class="evidence__meta">L' + p.level + ' · ' + esc(t('kind.' + p.kind)) + '</span> ' +
          (h.vote ? '· ' + esc(fill(t('vote_done'), { choice: agentName(h.vote) })) : '') + '</li>';
      }).join('');
    }

    function renderAll() {
      renderProviders();
      renderControls();
      renderPipeline();
      renderColumns();
      renderVote();
      renderMemory();
      renderVotes();
      renderHistory();
    }

    /* --- Flujo de POST /chatbot --- */

    function finishCall(c) {
      /* Paso 4: guardar respuestas; paso 5: devolver { azure, aws }. */
      c.step = 3;
      state.mongo += 2;
      state.redis += 2;
      renderAll();
      var finish = function () {
        c.step = 4;
        renderPipeline();
        var end = function () {
          c.done = true;
          state.busy = false;
          state.history.push(c);
          $('ar-live').textContent = fill(t('live'), { a: agentName(c.order[0]), b: agentName(c.order[1]) });
          renderAll();
        };
        if (reducedMotion.matches) end(); else timers.push(setTimeout(end, STEP_MS));
      };
      if (reducedMotion.matches) finish(); else timers.push(setTimeout(finish, STEP_MS));
    }

    function send() {
      if (state.busy) return;
      clearTimers();
      var prompt = promptById(state.prompt);
      var c = { prompt: prompt.id, arrived: {}, order: [], step: 0, done: false, vote: null, redisBefore: state.redis };
      state.current = c;
      state.busy = true;
      renderAll();

      var arrive = function (id) {
        c.arrived[id] = true;
        c.order.push(id);
        renderColumns();
        if (c.order.length === data.agents.length) finishCall(c);
      };

      var callAgents = function () {
        c.step = 2;
        renderAll();
        data.agents.forEach(function (a) {
          /* Base fija + latencia escalada: la espera es visible y respeta el orden de llegada simulado. */
          var wait = 300 + prompt.answers[a.id].latency_ms * LATENCY_SCALE;
          if (reducedMotion.matches) arrive(a.id);
          else timers.push(setTimeout(function () { arrive(a.id); }, wait));
        });
      };

      /* Paso 1: cargar historial (Redis). Paso 2: guardar el mensaje (Redis + MongoDB). */
      var saveUser = function () {
        c.step = 1;
        state.redis += 1;
        state.mongo += 1;
        renderAll();
        if (reducedMotion.matches) callAgents(); else timers.push(setTimeout(callAgents, STEP_MS));
      };
      if (reducedMotion.matches) saveUser(); else timers.push(setTimeout(saveUser, STEP_MS));
    }

    function vote(choice) {
      var c = state.current;
      if (!c || !c.done || c.vote) return;
      c.vote = choice;
      state.votes[choice] += 1;
      $('ar-live').textContent = fill(t('vote_done'), { choice: agentName(choice) });
      renderAll();
    }

    $('ar-prompt').addEventListener('change', function () { state.prompt = $('ar-prompt').value; renderControls(); });
    $('ar-send').addEventListener('click', send);
    $('ar-reset').addEventListener('click', function () {
      clearTimers();
      state = freshState();
      $('ar-live').textContent = '';
      renderAll();
    });
    $('ar-vote').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-vote]');
      if (btn) vote(btn.getAttribute('data-vote'));
    });

    document.addEventListener('i18n:change', renderAll);
    renderAll();
  }

  window.Demos.register('benchmark', {
    label: 'CloudArena',
    init: function (host) {
      var data = fetch('scripts/demos/benchmark-data.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .catch(function () {
          var err = new Error('data');
          err.messageKey = 'demo.benchmark.error';
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
