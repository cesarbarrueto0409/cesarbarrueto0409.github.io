/* coach-preview.js: animación de ~8 s en la tarjeta del API Coach Ejecutivo (no es un video).
   Escena: el reloj avanza 08:58 → 08:59 → 09:00, se activa el disparador programado (el Coach
   corre solo, sin clics), el pipeline se ilumina paso a paso y aparece el correo con 3 prioridades
   y la barra de avance. Datos ficticios.
   - Botón de pausa (WCAG 2.2.2). Con prefers-reduced-motion se muestra la escena final fija.
   - Se detiene fuera de pantalla y con la pestaña oculta. */
(function () {
  'use strict';

  var P = 'projects.preview.coach.';
  var STEPS = ['mongo', 'memory', 'bedrock', 'validation', 'similarity', 'email'];
  var ROWS = ['row1', 'row2', 'row3'];
  var GOAL_PCT = 68;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Línea de tiempo en ms desde el inicio del ciclo. */
  var T = { tick: 700, fire: 1400, firstStep: 1950, stepEvery: 430, result: 4750, end: 8800, gap: 400 };
  var TIMES = ['08:58', '08:59', '09:00'];

  function t(key) { return window.i18n.t(key, ''); }

  function template() {
    var steps = STEPS.map(function (s, i) {
      return '<li class="cp__step" data-i="' + i + '">' +
        '<span class="cp__step-head"><span class="cp__dot"></span><span class="cp__num">0' + (i + 1) + '</span></span>' +
        '<span class="cp__step-name" data-i18n="demo.chilexpress.step.' + s + '"></span>' +
        '<span class="cp__step-desc" data-i18n="' + P + 'desc.' + s + '"></span>' +
      '</li>';
    }).join('');
    var rows = ROWS.map(function (r, i) {
      return '<li class="cp__row" style="--d:' + (i * 140) + 'ms"><span class="cp__rank">' + (i + 1) + '</span><span class="cp__row-text" data-i18n="' + P + r + '"></span></li>';
    }).join('');

    return '' +
      '<a class="cp__link" href="#demo-chilexpress" data-demo="chilexpress">' +
        '<span class="visually-hidden" data-i18n="experience.chilexpress.demo"></span>' +
        '<span class="cp__scene" aria-hidden="true">' +
          '<span class="cp__bar"><span class="cp__dots"><i></i><i></i><i></i></span><span class="cp__app">API Coach Ejecutivo</span><span class="cp__tag" data-i18n="' + P + 'label"></span></span>' +
          '<span class="cp__ui">' +
            '<span class="cp__clock"><svg class="cp__clock-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>' +
              '<span class="cp__time">' + TIMES[0] + '</span></span>' +
            '<span class="cp__trigger"><span class="cp__trigger-dot"></span>' +
              '<span class="cp__trigger-idle" data-i18n="' + P + 'schedule"></span>' +
              '<span class="cp__trigger-fired" data-i18n="' + P + 'fired"></span>' +
              '<span class="cp__trigger-done" data-i18n="' + P + 'done"></span></span>' +
          '</span>' +
          '<span class="cp__screen">' +
            '<ol class="cp__pipeline">' + steps + '</ol>' +
            '<span class="cp__mail">' +
              '<span class="cp__mail-head"><span class="cp__mail-icon"></span><span><span class="cp__mail-subject" data-i18n="' + P + 'subject"></span><span class="cp__mail-to" data-i18n="' + P + 'to"></span></span></span>' +
              '<ol class="cp__rows">' + rows + '</ol>' +
              '<span class="cp__goal"><span class="cp__goal-label"><span data-i18n="' + P + 'goal"></span><b>' + GOAL_PCT + ' %</b></span>' +
                '<span class="cp__goal-track"><span class="cp__goal-fill" style="--goal:' + GOAL_PCT + '%"></span></span></span>' +
            '</span>' +
          '</span>' +
        '</span>' +
      '</a>' +
      '<button class="cp__pause" type="button" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="cp__icon-pause" d="M4 3h3v10H4zM9 3h3v10H9z"></path><path class="cp__icon-play" d="M4 2.5v11l9-5.5z"></path></svg></button>';
  }

  function mount(host) {
    host.classList.add('cp');
    host.innerHTML = template();
    window.i18n.apply(host);

    var scene = host.querySelector('.cp__scene');
    var pauseBtn = host.querySelector('.cp__pause');
    var steps = host.querySelectorAll('.cp__step');
    var timers = [];
    var userPaused = false;
    var visible = false;
    var running = false;

    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function clear() { timers.forEach(clearTimeout); timers = []; }

    var timeEl = host.querySelector('.cp__time');

    function setPhase(phase) { scene.setAttribute('data-phase', phase); }
    function setTime(i) { timeEl.textContent = TIMES[i]; }

    function reset() {
      setPhase('idle');
      setTime(0);
      steps.forEach(function (s) { s.classList.remove('is-on', 'is-done'); });
    }

    function showFinal() {
      clear();
      running = false;
      setPhase('result');
      setTime(2);
      scene.classList.add('is-static');
      steps.forEach(function (s) { s.classList.add('is-done'); });
    }

    function cycle() {
      reset();
      at(T.tick, function () { setTime(1); setPhase('tick'); });
      at(T.fire, function () { setTime(2); setPhase('fire'); });
      STEPS.forEach(function (_, i) {
        at(T.firstStep + i * T.stepEvery, function () {
          setPhase('run');
          if (i > 0) { steps[i - 1].classList.remove('is-on'); steps[i - 1].classList.add('is-done'); }
          steps[i].classList.add('is-on');
        });
      });
      at(T.result - 150, function () { steps[STEPS.length - 1].classList.remove('is-on'); steps[STEPS.length - 1].classList.add('is-done'); });
      at(T.result, function () { setPhase('result'); });
      at(T.end, function () { setPhase('out'); });
      at(T.end + T.gap, cycle);
    }

    function update() {
      var shouldRun = visible && !userPaused && !document.hidden && !reducedMotion.matches;
      if (reducedMotion.matches) { showFinal(); return; }
      scene.classList.remove('is-static');
      if (shouldRun && !running) { running = true; cycle(); }
      else if (!shouldRun && running) {
        clear();
        running = false;
        /* En pausa queda la escena final fija, legible. */
        if (userPaused) { setPhase('result'); setTime(2); steps.forEach(function (s) { s.classList.remove('is-on'); s.classList.add('is-done'); }); }
      }
    }

    function renderPauseLabel() {
      pauseBtn.setAttribute('aria-label', t(P + (userPaused ? 'play' : 'pause')));
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseBtn.hidden = reducedMotion.matches;
    }

    pauseBtn.addEventListener('click', function () {
      userPaused = !userPaused;
      renderPauseLabel();
      update();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        update();
      }, { threshold: 0.3 }).observe(host);
    } else {
      visible = true;
    }

    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener('change', function () { renderPauseLabel(); update(); });
    document.addEventListener('i18n:change', renderPauseLabel);

    renderPauseLabel();
    if (reducedMotion.matches) showFinal(); else { reset(); update(); }
  }

  window.CoachPreview = { mount: mount };
})();
