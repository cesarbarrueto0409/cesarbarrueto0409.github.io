/* i18n.js: cambio de idioma ES / EN.
   - Lee los textos de i18n/es.json e i18n/en.json.
   - Atributos soportados: data-i18n (texto), data-i18n-alt, data-i18n-aria-label, data-i18n-content.
   - Guarda la preferencia en localStorage; si no existe, usa el idioma del navegador.
   - Emite el evento "i18n:change" en document al aplicar un idioma.
   - window.i18n.ready: promesa que se resuelve tras la primera carga. */
(function () {
  'use strict';

  var SUPPORTED = ['es', 'en'];
  var DEFAULT_LANG = 'es';
  var STORAGE_KEY = 'lang';
  var ATTRS = {
    'data-i18n-alt': 'alt',
    'data-i18n-aria-label': 'aria-label',
    'data-i18n-content': 'content'
  };

  var cache = {};
  var current = document.documentElement.lang || DEFAULT_LANG;
  var dict = null;
  var resolveReady;
  /* Se resuelve tras el primer intento de carga, haya funcionado o no. */
  var ready = new Promise(function (resolve) { resolveReady = resolve; });

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.indexOf(value) !== -1 ? value : null;
    } catch (e) {
      return null;
    }
  }

  function store(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* Almacenamiento bloqueado: el idioma vale solo para esta visita. */
    }
  }

  function detect() {
    var stored = readStored();
    if (stored) return stored;
    var langs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var code = String(langs[i]).slice(0, 2).toLowerCase();
      if (SUPPORTED.indexOf(code) !== -1) return code;
    }
    return DEFAULT_LANG;
  }

  function load(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch('i18n/' + lang + '.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('i18n: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        cache[lang] = data;
        return data;
      });
  }

  function lookup(data, key) {
    if (!data || !key || key.charAt(0) === '_') return undefined;
    var parts = key.split('.');
    var node = data;
    for (var i = 0; i < parts.length; i++) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return typeof node === 'string' ? node : undefined;
  }

  /* Devuelve el texto de la clave en el idioma actual, o el fallback si no existe. */
  function t(key, fallback) {
    var value = lookup(dict, key);
    return value !== undefined ? value : fallback;
  }

  function apply(root) {
    var scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n'));
      if (value !== undefined) el.textContent = value;
    });

    Object.keys(ATTRS).forEach(function (dataAttr) {
      scope.querySelectorAll('[' + dataAttr + ']').forEach(function (el) {
        var value = t(el.getAttribute(dataAttr));
        if (value !== undefined) el.setAttribute(ATTRS[dataAttr], value);
      });
    });

    var title = t('meta.title');
    if (title) document.title = title;
  }

  function updateSwitches() {
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === current));
    });
  }

  function setLang(lang, options) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
    var persist = !options || options.persist !== false;

    return load(lang)
      .then(function (data) {
        dict = data;
        current = lang;
        document.documentElement.lang = lang;
        if (persist) store(lang);
        apply();
        updateSwitches();
        document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } }));
      })
      .catch(function () {
        /* Si el JSON no carga, el texto en español del HTML sigue visible. */
        updateSwitches();
      });
  }

  function init() {
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-lang');
        if (lang !== current || !dict) setLang(lang);
      });
    });
    setLang(detect(), { persist: false }).then(resolveReady);
  }

  window.i18n = {
    t: t,
    apply: apply,
    setLang: setLang,
    ready: ready,
    isLoaded: function () { return dict !== null; },
    getLang: function () { return current; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
