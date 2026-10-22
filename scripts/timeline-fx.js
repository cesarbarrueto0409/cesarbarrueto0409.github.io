/* timeline-fx.js: pelotita azul que recorre la línea de tiempo de Experiencia.
   - Al aparecer la sección: parte desde el extremo inferior de la línea y sube hasta la experiencia
     más reciente, encendiendo cada hito y pintando la línea detrás (siempre desde abajo).
   - Al pasar el mouse o enfocar una experiencia: se desliza hasta su hito y destaca la tarjeta.
   - Con prefers-reduced-motion: sin desplazamiento animado (la posición cambia al instante).
   Decorativo (aria-hidden); sin JS la línea de tiempo se ve como antes. */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var STEP_MS = 550;
  var DOT_OFFSET = 28;  /* centro del hito: top 22px + mitad de 12px (ver .timeline__item::before) */
  var LINE_INSET = 8;   /* la línea termina 8px antes del final de la lista (ver .timeline::before) */

  function init() {
    var list = document.querySelector('#experiencia .timeline');
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('.timeline__item'));
    if (!items.length) return;

    var track = document.createElement('span');
    track.className = 'timeline__track';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span class="timeline__fill"></span><span class="timeline__ball"></span>';
    list.appendChild(track);
    list.classList.add('has-fx');

    var ball = track.querySelector('.timeline__ball');
    var fill = track.querySelector('.timeline__fill');
    var START = items.length;          /* índice especial: extremo inferior de la línea */
    var current = START;
    var introDone = false;
    var timers = [];

    function bottomY() { return list.clientHeight - LINE_INSET; }
    function dotY(i) { return i >= items.length ? bottomY() : items[i].offsetTop + DOT_OFFSET; }

    function moveTo(i) {
      current = i;
      var y = dotY(i);
      var bottom = bottomY();
      ball.style.transform = 'translateY(' + y + 'px)';
      fill.style.top = y + 'px';
      fill.style.height = Math.max(0, bottom - y) + 'px';
      items.forEach(function (item, j) {
        item.classList.toggle('is-lit', j >= i);
        item.classList.toggle('is-active', j === i);
      });
    }

    function intro() {
      if (introDone) return;
      introDone = true;
      list.classList.add('is-ready');
      if (reducedMotion.matches) { moveTo(0); return; }
      for (var k = items.length - 1; k >= 0; k--) {
        (function (idx, n) {
          timers.push(setTimeout(function () { moveTo(idx); }, 150 + n * STEP_MS));
        })(k, items.length - 1 - k);
      }
    }

    function goTo(i) {
      if (!introDone) return;
      timers.forEach(clearTimeout);
      timers = [];
      moveTo(i);
    }

    items.forEach(function (item, i) {
      item.addEventListener('pointerenter', function () { goTo(i); });
      item.addEventListener('focusin', function () { goTo(i); });
    });

    /* Posición inicial sin animación: extremo inferior de la línea */
    list.classList.add('no-anim');
    moveTo(START);
    void list.offsetWidth;
    list.classList.remove('no-anim');

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { io.disconnect(); intro(); }
      }, { threshold: 0.35 });
      io.observe(list);
    } else {
      intro();
    }

    /* Recalcular si cambia el alto (idioma, ancho de pantalla) */
    function reflow() {
      list.classList.add('no-anim');
      moveTo(current);
      void list.offsetWidth;
      list.classList.remove('no-anim');
    }
    if ('ResizeObserver' in window) new ResizeObserver(reflow).observe(list);
    window.addEventListener('resize', reflow);
    document.addEventListener('i18n:change', reflow);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
