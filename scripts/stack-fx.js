/* stack-fx.js: mini animaciones (≈ 2,5 s) de fondo en los cuadros de Stack.
   Datos: flujos de puntos que convergen y barras que suben. IA: red neuronal que se activa por capas.
   Backend: petición cliente → servidor → base de datos y respuesta 200 OK. Cloud: build → test → deploy.
   - Con mouse: se reproduce una vez al entrar al cuadro. Sin hover (táctil): una vez al aparecer en pantalla.
   - Con prefers-reduced-motion no se agrega nada (el borde iluminado lo hace el CSS).
   - Dibujos decorativos (aria-hidden). Animación SMIL: todas las piezas parten juntas desde un
     disparador (begin="indefinite" + beginElement) y los retrasos van en keyTimes, así cada
     repetición vuelve al estado inicial. */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var noHover = window.matchMedia('(hover: none)');
  var T = 2.6;          /* duración total de cada animación (s) */
  var PLAY_MS = 3000;   /* tiempo con el cuadro en estado "is-playing" */

  function k(t) { return Math.min(1, Math.max(0, t / T)).toFixed(4); }

  /* Interpola entre valores en momentos dados: pts = [[t, valor], ...] (t en segundos). */
  function tl(attr, pts, id) {
    var full = pts.slice();
    if (full[0][0] > 0) full.unshift([0, full[0][1]]);
    if (full[full.length - 1][0] < T) full.push([T, full[full.length - 1][1]]);
    return '<animate attributeName="' + attr + '" values="' + full.map(function (p) { return p[1]; }).join(';') +
      '" keyTimes="' + full.map(function (p) { return k(p[0]); }).join(';') +
      '" dur="' + T + 's" begin="' + id + '.begin" fill="freeze"/>';
  }

  /* Movimiento por un trayecto entre t0 y t1. */
  function move(pathId, t0, t1, id) {
    return '<animateMotion dur="' + T + 's" begin="' + id + '.begin" fill="freeze" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;' + k(t0) + ';' + k(t1) + ';1"><mpath href="#' + pathId + '"/></animateMotion>';
  }

  function trigger(id) {
    return '<rect width="0" height="0"><animate id="' + id + '" attributeName="x" values="0;0" dur="0.01s" begin="indefinite"/></rect>';
  }

  /* ---------- Datos: tres flujos que convergen y barras que suben ---------- */
  function svgData() {
    var id = 'fxd';
    var paths = ['M-10 70 C110 70 170 150 280 150', 'M-10 150 L280 150', 'M-10 230 C110 230 170 150 280 150'];
    var out = trigger(id) + '<g fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45">' +
      paths.map(function (d, i) { return '<path id="fxd-p' + i + '" d="' + d + '"/>'; }).join('') + '</g>' +
      '<line x1="292" y1="216" x2="392" y2="216" stroke="currentColor" stroke-width="1.5" opacity="0.45"/><g fill="currentColor">';
    [0, 1, 2].forEach(function (i) {
      [0, 0.35].forEach(function (lag) {
        var t0 = i * 0.12 + lag, t1 = t0 + 1;
        out += '<circle r="4.5" opacity="0">' + move('fxd-p' + i, t0, t1, id) +
          tl('opacity', [[t0, 0], [t0 + 0.1, 1], [t1 - 0.15, 1], [t1, 0]], id) + '</circle>';
      });
    });
    [46, 78, 62, 104].forEach(function (h, i) {
      var t0 = 1.15 + i * 0.12, t1 = t0 + 0.45;
      out += '<rect x="' + (300 + i * 22) + '" y="215" width="14" height="0" rx="2">' +
        tl('height', [[t0, 0], [t1, h]], id) + tl('y', [[t0, 215], [t1, 215 - h]], id) + '</rect>';
    });
    return out + '</g>';
  }

  /* ---------- IA: capas de nodos que se encienden de izquierda a derecha ---------- */
  function svgAi() {
    var id = 'fxa';
    var L1 = [90, 150, 210], L2 = [60, 120, 180, 240];
    var x1 = 70, x2 = 200, x3 = 330;
    function links(xa, ya, xb, yb) {
      var s = '';
      ya.forEach(function (a) { yb.forEach(function (b) { s += '<line x1="' + xa + '" y1="' + a + '" x2="' + xb + '" y2="' + b + '"/>'; }); });
      return s;
    }
    function nodes(x, ys, r) {
      return ys.map(function (y) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>'; }).join('');
    }
    function pulse(t0, base) { return tl('opacity', [[t0, base], [t0 + 0.3, 1], [t0 + 0.7, 0.6]], id); }
    return trigger(id) +
      '<g stroke="currentColor" stroke-width="1.2" opacity="0.25">' + links(x1, L1, x2, L2) + pulse(0.35, 0.25) + '</g>' +
      '<g stroke="currentColor" stroke-width="1.2" opacity="0.25">' + links(x2, L2, x3, [150]) + pulse(0.95, 0.25) + '</g>' +
      '<g fill="currentColor" opacity="0.35">' + nodes(x1, L1, 7) + pulse(0.05, 0.35) + '</g>' +
      '<g fill="currentColor" opacity="0.35">' + nodes(x2, L2, 7) + pulse(0.65, 0.35) + '</g>' +
      '<g fill="currentColor" opacity="0.35">' + nodes(x3, [150], 10) + pulse(1.25, 0.35) + '</g>' +
      '<circle cx="' + x3 + '" cy="150" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0">' +
        tl('r', [[1.4, 10], [2.2, 36]], id) + tl('opacity', [[1.4, 0], [1.55, 0.9], [2.2, 0]], id) +
      '</circle>';
  }

  /* ---------- Backend: cliente → servidor → base de datos → 200 OK ---------- */
  function svgBackend() {
    var id = 'fxb';
    var client = '<rect x="38" y="128" width="56" height="38" rx="4"/><line x1="56" y1="176" x2="76" y2="176"/>';
    var server = '<rect x="174" y="116" width="52" height="20" rx="3"/><rect x="174" y="140" width="52" height="20" rx="3"/><rect x="174" y="164" width="52" height="20" rx="3"/>';
    var db = '<ellipse cx="340" cy="124" rx="26" ry="9"/><path d="M314 124v48c0 5 12 9 26 9s26-4 26-9v-48"/><path d="M314 148c0 5 12 9 26 9s26-4 26-9"/>';
    return trigger(id) +
      '<g fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.5">' + client + server + db + '</g>' +
      '<path id="fxb-track" d="M94 150 H314 H94" fill="none"/>' +
      '<line x1="94" y1="150" x2="314" y2="150" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 6" opacity="0.4"/>' +
      '<circle r="6" fill="currentColor" opacity="0">' + move('fxb-track', 0.1, 1.7, id) +
        tl('opacity', [[0.1, 0], [0.2, 1], [1.6, 1], [1.7, 0]], id) + '</circle>' +
      '<text x="200" y="90" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, monospace" font-size="22" opacity="0">200 OK' +
        tl('opacity', [[1.7, 0], [1.95, 1]], id) + '</text>';
  }

  /* ---------- Cloud y DevOps: build → test → deploy y la nube se enciende ---------- */
  function svgCloud() {
    var id = 'fxc';
    var out = trigger(id) +
      '<path d="M150 112a26 26 0 0 1 24-34a38 38 0 0 1 70 6a26 26 0 0 1 6 52h-92a24 24 0 0 1-8-24z" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1.8" opacity="0.45">' +
        tl('opacity', [[1.8, 0.45], [2.1, 1]], id) + tl('fill-opacity', [[1.8, 0.08], [2.1, 0.35]], id) + '</path>';
    ['build', 'test', 'deploy'].forEach(function (name, i) {
      var x = 46 + i * 112, t0 = 0.1 + i * 0.55;
      out += '<g opacity="0.4">' + tl('opacity', [[t0, 0.4], [t0 + 0.3, 1]], id) +
        '<rect x="' + x + '" y="196" width="84" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<text x="' + (x + 34) + '" y="221" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, monospace" font-size="15">' + name + '</text>' +
        '<path d="M' + (x + 66) + ' 216l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0">' +
          tl('opacity', [[t0 + 0.35, 0], [t0 + 0.5, 1]], id) + '</path>' +
      '</g>';
      if (i < 2) out += '<path d="M' + (x + 88) + ' 216h18" stroke="currentColor" stroke-width="1.8" opacity="0.45"/>';
    });
    return out;
  }

  var BUILDERS = { data: svgData, ai: svgAi, backend: svgBackend, cloud: svgCloud };

  function init() {
    if (reducedMotion.matches) return;
    document.querySelectorAll('.stack__group').forEach(function (group) {
      var type = (group.className.match(/stack__group--(\w+)/) || [])[1];
      if (!BUILDERS[type]) return;
      var wrap = document.createElement('div');
      wrap.className = 'stack__fx';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" focusable="false">' + BUILDERS[type]() + '</svg>';
      group.insertBefore(wrap, group.firstChild);

      /* Retraso de la "ola" de logos */
      group.querySelectorAll('.stack__item').forEach(function (item, i) { item.style.setProperty('--i', i); });

      var start = wrap.querySelector('[begin="indefinite"]');
      var timer = null;

      function play() {
        if (timer || reducedMotion.matches || !start || typeof start.beginElement !== 'function') return;
        group.classList.add('is-playing');
        start.beginElement();
        timer = setTimeout(function () {
          group.classList.remove('is-playing');
          timer = null;
        }, PLAY_MS);
      }

      group.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') play();
      });

      if (noHover.matches && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) play();
        }, { threshold: 0.6 }).observe(group);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
