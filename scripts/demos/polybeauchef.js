/* Demo 3: PolyBeauchef · Mercados de predicción con fichas ficticias (spec: demos/polybeauchef.md).
   Las fórmulas de compra, venta, canje, racha y ranking siguen core/services del repositorio polybuxef.
   Datos ficticios de scripts/demos/polybeauchef-data.json. Las fichas no tienen valor. */
(function () {
  'use strict';

  var P = 'demo.polybeauchef.';
  var MAX_AMOUNT = 100;
  var SIDES = ['si', 'no'];

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
    var d = digits === undefined ? 1 : digits;
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n);
  }

  function fmtPct(ratio) {
    var text = new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 1 }).format(ratio);
    return lang() === 'en' ? text : text.replace(/\s?%/, ' %');
  }

  function sideName(side) { return t(side === 'si' ? 'yes' : 'no'); }
  function other(side) { return side === 'si' ? 'no' : 'si'; }

  /* Generador pseudoaleatorio con semilla (actividad de la comunidad reproducible). */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------- Lógica del repositorio (core/services/__init__.py) ---------- */

  /* Precio de A = pool de B / (pool A + pool B). */
  function price(pools, side) {
    return pools[other(side)] / (pools.si + pools.no);
  }

  /* comprar(): k = a·b; b' = b + m; a' = k / b'; participaciones = a − a'. */
  function quoteBuy(pools, side, m) {
    var a = pools[side];
    var b = pools[other(side)];
    var k = a * b;
    var b2 = b + m;
    var a2 = k / b2;
    return { a: a, b: b, k: k, a2: a2, b2: b2, shares: a - a2, newPrice: b2 / (a2 + b2) };
  }

  /* vender(): a' = a + s; b' = k / a'; fichas = b − b'. */
  function quoteSell(pools, side, s) {
    var a = pools[side];
    var b = pools[other(side)];
    var k = a * b;
    var a2 = a + s;
    var b2 = k / a2;
    return { a: a, b: b, k: k, a2: a2, b2: b2, amount: b - b2 };
  }

  function apply(pools, side, q) {
    pools[side] = q.a2;
    pools[other(side)] = q.b2;
  }

  /* ---------- Plantilla ---------- */

  function template(data) {
    var chips = data.markets.map(function (m) {
      return '<button class="chip" type="button" data-market="' + m.id + '" aria-pressed="false"></button>';
    }).join('');

    return '' +
      '<div class="demo poly">' +
        '<header class="demo__header">' +
          '<p class="demo-badge" data-i18n="demo.label"></p>' +
          '<h3 class="demo__title" data-i18n="' + P + 'title"></h3>' +
          '<p class="demo__lead" data-i18n="' + P + 'lead"></p>' +
          '<p class="demo__note poly__note" data-i18n="' + P + 'note"></p>' +
        '</header>' +

        '<div class="poly__wallet" id="pb-wallet"></div>' +

        '<div class="field">' +
          '<span class="field__label" id="pb-markets-label" data-i18n="' + P + 'markets_label"></span>' +
          '<div class="integra__chips" role="group" aria-labelledby="pb-markets-label">' + chips + '</div>' +
        '</div>' +

        '<p class="visually-hidden" id="pb-live" aria-live="polite"></p>' +

        '<div class="poly__grid">' +
          '<section class="integra__block poly__market" id="pb-market" aria-live="off"></section>' +
          '<section class="integra__block poly__trade" id="pb-trade"></section>' +
          '<section class="integra__block poly__history" id="pb-history"></section>' +
          '<section class="integra__block poly__formula" id="pb-formula"></section>' +
          '<section class="integra__block poly__ranking" id="pb-ranking"></section>' +
        '</div>' +

        '<div class="field field--actions poly__actions">' +
          '<button class="btn btn--outline btn--sm" type="button" id="pb-reset" data-i18n="demo.reset"></button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Demo ---------- */

  function createDemo(host, data) {
    var state;

    function freshState() {
      var markets = {};
      data.markets.forEach(function (m) {
        var pools = { si: m.pools.si, no: m.pools.no };
        markets[m.id] = {
          pools: pools,
          status: 'abierto',
          winner: null,
          mine: { si: 0, no: 0 },
          others: {},
          redeemed: false,
          history: [{ who: 'initial', price: price(pools, 'si') }],
          lastOp: null,
          closing: false,
          seed: m.id.length * 7919
        };
      });
      var users = data.users.map(function (u) { return { id: u.id, balance: u.balance }; });
      return {
        market: data.markets[0].id,
        side: 'si',
        amount: 50,
        balance: data.player.balance,
        streak: data.player.streak,
        claimed: false,
        users: users,
        markets: markets
      };
    }

    state = freshState();
    host.innerHTML = template(data);
    window.i18n.apply(host);
    var $ = function (id) { return host.querySelector('#' + id); };

    function ms() { return state.markets[state.market]; }
    function marketInfo(id) { return data.markets.filter(function (m) { return m.id === id; })[0]; }
    function announce(text) { $('pb-live').textContent = text; }

    function amountValid() {
      var m = state.amount;
      return Number.isFinite(m) && m >= 1 && m <= MAX_AMOUNT && m <= state.balance;
    }

    /* --- Render --- */

    function renderWallet() {
      var reward = Math.min(state.streak + 1, 5) * 100;
      var streakText = fill(t(state.streak === 1 ? 'streak_one' : 'streak_other'), { n: state.streak });
      $('pb-wallet').innerHTML =
        '<dl class="poly__wallet-list"><div class="coach__metric"><dt>' + esc(t('balance')) + '</dt><dd>' + esc(fmt(state.balance)) + ' <span class="poly__unit">' + esc(t('tokens_unit')) + '</span></dd></div>' +
        '<div class="coach__metric"><dt>' + esc(t('streak')) + '</dt><dd>' + esc(streakText) + '</dd></div></dl>' +
        '<div class="poly__claim">' +
          (state.claimed
            ? '<span class="stat-tag">' + esc(t('claimed')) + '</span>'
            : '<button class="btn btn--outline btn--sm" type="button" id="pb-claim">' + esc(fill(t('claim'), { n: reward })) + '</button>') +
          '<span class="coach__hint">' + esc(t('streak_rule')) + '</span>' +
        '</div>';
    }

    function renderChips() {
      host.querySelectorAll('[data-market]').forEach(function (chip) {
        var id = chip.getAttribute('data-market');
        chip.textContent = t('category.' + marketInfo(id).category);
        chip.setAttribute('aria-pressed', String(id === state.market));
      });
    }

    function renderMarket() {
      var m = ms();
      var info = marketInfo(state.market);
      var pSi = price(m.pools, 'si');
      $('pb-market').innerHTML =
        '<div class="rec__head">' +
          '<span class="stat-tag">' + esc(t('category.' + info.category)) + '</span>' +
          '<span class="status-pill status-pill--' + (m.status === 'abierto' ? 'good' : 'help') + '">' + esc(t('status.' + m.status)) + '</span>' +
        '</div>' +
        '<h4 class="poly__question">' + esc(info.title[lang()]) + '</h4>' +
        '<p class="field__label">' + esc(t('prob_label')) + '</p>' +
        '<div class="poly__bar" role="img" aria-label="' + esc(sideName('si') + ' ' + fmtPct(pSi) + ', ' + sideName('no') + ' ' + fmtPct(1 - pSi)) + '">' +
          '<span class="poly__bar-yes" style="width:' + (pSi * 100).toFixed(2) + '%"></span>' +
        '</div>' +
        '<div class="poly__bar-labels" aria-hidden="true">' +
          '<span><strong>' + esc(sideName('si')) + '</strong> ' + esc(fmtPct(pSi)) + '</span>' +
          '<span>' + esc(fmtPct(1 - pSi)) + ' <strong>' + esc(sideName('no')) + '</strong></span>' +
        '</div>' +
        '<p class="stat-card__note">' + esc(fill(t('pools'), { si: fmt(m.pools.si), no: fmt(m.pools.no) })) + '</p>' +
        (m.status === 'resuelto' ? '<p class="integra__decided">' + esc(fill(t('resolved'), { side: sideName(m.winner) })) + '</p>' : '');
    }

    function renderTrade() {
      var m = ms();
      var box = $('pb-trade');
      var html = '';

      if (m.status === 'abierto') {
        var valid = amountValid();
        var q = valid ? quoteBuy(m.pools, state.side, state.amount) : null;
        var sides = SIDES.map(function (s) {
          return '<button class="chip poly__side poly__side--' + s + '" type="button" data-side="' + s + '" aria-pressed="' + (s === state.side) + '">' + esc(sideName(s)) + '</button>';
        }).join('');
        var hint = state.balance < 1 ? t('no_balance') : valid ? '' : t('amount_hint');
        html +=
          '<span class="field__label" id="pb-side-label">' + esc(t('side_label')) + '</span>' +
          '<div class="integra__chips" role="group" aria-labelledby="pb-side-label">' + sides + '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="pb-amount">' + esc(t('amount_label')) + '</label>' +
            '<input class="select poly__amount" id="pb-amount" type="number" inputmode="numeric" min="1" max="' + MAX_AMOUNT + '" step="1" value="' + esc(state.amount) + '" aria-describedby="pb-amount-hint">' +
            '<p class="coach__hint" id="pb-amount-hint">' + esc(hint || t('amount_hint')) + '</p>' +
          '</div>' +
          (q ? '<p class="poly__preview">' + esc(fill(t('preview'), { s: fmt(q.shares), side: sideName(state.side), p0: fmtPct(price(m.pools, state.side)), p1: fmtPct(q.newPrice) })) + '</p>' : '') +
          '<div class="integra__decision-actions">' +
            '<button class="btn btn--ghost' + (valid ? ' is-cue' : '') + '" type="button" id="pb-buy"' + (valid ? '' : ' disabled') + '>' + esc(t('participate')) + '</button>' +
            '<button class="btn btn--outline btn--sm" type="button" id="pb-community">' + esc(t('community')) + '</button>' +
          '</div>';
      } else {
        html += '<p class="stat-card__note">' + esc(t('closed')) + '</p>';
      }

      /* Mis participaciones */
      var has = m.mine.si > 1e-6 || m.mine.no > 1e-6;
      html += '<h5 class="coach__subtitle">' + esc(t('positions_title')) + '</h5>';
      if (!has) {
        html += '<p class="stat-card__note">' + esc(t('positions_empty')) + '</p>';
      } else {
        html += '<ul class="integra__history" role="list">' + SIDES.filter(function (s) { return m.mine[s] > 1e-6; }).map(function (s) {
          return '<li class="poly__position"><span>' + esc(fill(t('position_item'), { side: sideName(s), s: fmt(m.mine[s]) })) + '</span>' +
            (m.status === 'abierto' ? '<button class="btn btn--outline btn--sm" type="button" data-sell="' + s + '">' + esc(fill(t('sell'), { side: sideName(s) })) + '</button>' : '') +
          '</li>';
        }).join('') + '</ul>';
      }

      /* Cierre, resolución y canje */
      if (m.status === 'abierto') {
        if (m.closing) {
          html += '<div class="poly__resolve"><p class="integra__ai">' + esc(t('resolve_title')) + '</p>' +
            '<div class="integra__decision-actions">' +
              '<button class="btn btn--ghost btn--sm" type="button" data-resolve="si">' + esc(t('resolve_yes')) + '</button>' +
              '<button class="btn btn--ghost btn--sm" type="button" data-resolve="no">' + esc(t('resolve_no')) + '</button>' +
            '</div></div>';
        } else {
          html += '<div><button class="btn btn--outline btn--sm" type="button" id="pb-close">' + esc(t('close')) + '</button></div>';
        }
      } else if (!m.redeemed) {
        var winShares = m.mine[m.winner];
        html += winShares > 1e-6
          ? '<div><button class="btn btn--ghost is-cue" type="button" id="pb-redeem">' + esc(t('redeem')) + '</button><p class="coach__hint">' + esc(t('redeem_rule')) + '</p></div>'
          : '<p class="stat-card__note">' + esc(t('nothing_to_redeem')) + '</p>';
      }

      box.innerHTML = html;
    }

    function renderHistory() {
      var m = ms();
      var pts = m.history;
      var w = 300, h = 120, pad = 8;
      var step = pts.length > 1 ? (w - pad * 2) / (pts.length - 1) : 0;
      var coords = pts.map(function (p, i) {
        return [(pad + i * step).toFixed(1), (pad + (1 - p.price) * (h - pad * 2)).toFixed(1)];
      });
      var line = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0] + ' ' + c[1]; }).join(' ');
      var last = coords[coords.length - 1];
      var mid = (pad + 0.5 * (h - pad * 2)).toFixed(1);
      var whoText = function (p) { return p.who === 'initial' ? t('initial') : p.who === 'you' ? t('you') : p.who; };

      $('pb-history').innerHTML =
        '<h4 class="stat-card__title">' + esc(t('history_title')) + '</h4>' +
        '<figure class="poly__chart">' +
          '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' + esc(t('history_chart_label')) + '" aria-describedby="pb-history-summary">' +
            '<line x1="0" x2="' + w + '" y1="' + mid + '" y2="' + mid + '" class="poly__chart-mid"></line>' +
            '<path d="' + line + '" class="poly__chart-line"></path>' +
            '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4" class="poly__chart-dot"></circle>' +
          '</svg>' +
          '<div class="poly__chart-axis" aria-hidden="true"><span>100 %</span><span>50 %</span><span>0 %</span></div>' +
        '</figure>' +
        '<p class="stat-card__note" id="pb-history-summary">' + esc(fill(t('history_summary'), { p0: fmtPct(pts[0].price), p1: fmtPct(pts[pts.length - 1].price), n: pts.length - 1 })) + '</p>' +
        '<details class="poly__table"><summary>' + esc(t('history_table')) + '</summary>' +
          '<table><thead><tr><th scope="col">' + esc(t('history_step')) + '</th><th scope="col">' + esc(t('history_who')) + '</th><th scope="col">' + esc(t('history_prob')) + '</th></tr></thead><tbody>' +
          pts.map(function (p, i) { return '<tr><th scope="row">' + i + '</th><td>' + esc(whoText(p)) + '</td><td>' + esc(fmtPct(p.price)) + '</td></tr>'; }).join('') +
          '</tbody></table></details>';
    }

    function renderFormula() {
      var op = ms().lastOp;
      var text;
      if (!op) text = t('formula_empty');
      else {
        var vars = {
          side: sideName(op.side), other: sideName(other(op.side)),
          a: fmt(op.q.a), b: fmt(op.q.b), k: fmt(op.q.k, 0), a2: fmt(op.q.a2), b2: fmt(op.q.b2),
          m: fmt(op.m), s: fmt(op.type === 'buy' ? op.q.shares : op.s), f: fmt(op.q.amount)
        };
        text = fill(t(op.type === 'buy' ? 'formula_buy' : 'formula_sell'), vars);
      }
      $('pb-formula').innerHTML =
        '<h4 class="stat-card__title">' + esc(t('formula_title')) + '</h4>' +
        '<p class="poly__formula-rule"><code>k = a × b</code> · ' + esc(t('formula_price')) + '</p>' +
        '<p class="poly__formula-text">' + esc(text) + '</p>' +
        '<p class="stat-card__note">' + esc(t('formula_source')) + '</p>';
    }

    function renderRanking() {
      var rows = state.users.map(function (u) { return { id: u.id, balance: u.balance, me: false }; })
        .concat([{ id: t('you'), balance: state.balance, me: true }])
        .sort(function (a, b) { return b.balance - a.balance; });
      $('pb-ranking').innerHTML =
        '<h4 class="stat-card__title">' + esc(t('ranking_title')) + '</h4>' +
        '<ol class="poly__ranking-list">' + rows.map(function (r, i) {
          return '<li class="' + (r.me ? 'is-me' : '') + '"><span class="poly__rank">' + (i + 1) + '</span><span class="poly__rank-name">' + esc(r.id) + '</span><span class="poly__rank-balance">' + esc(fmt(r.balance)) + '</span></li>';
        }).join('') + '</ol>';
    }

    function renderAll() {
      renderWallet();
      renderChips();
      renderMarket();
      renderTrade();
      renderHistory();
      renderFormula();
      renderRanking();
    }

    /* --- Acciones --- */

    function buy() {
      var m = ms();
      if (m.status !== 'abierto' || !amountValid()) return;
      var q = quoteBuy(m.pools, state.side, state.amount);
      apply(m.pools, state.side, q);
      state.balance -= state.amount;
      m.mine[state.side] += q.shares;
      m.history.push({ who: 'you', price: price(m.pools, 'si') });
      m.lastOp = { type: 'buy', side: state.side, m: state.amount, q: q };
      if (state.amount > state.balance) state.amount = Math.max(1, Math.floor(Math.min(MAX_AMOUNT, state.balance)));
      announce(fill(t('bought'), { s: fmt(q.shares), side: sideName(m.lastOp.side), m: fmt(m.lastOp.m) }));
      renderAll();
    }

    function sell(side) {
      var m = ms();
      var s = m.mine[side];
      if (m.status !== 'abierto' || s <= 1e-6) return;
      var q = quoteSell(m.pools, side, s);
      apply(m.pools, side, q);
      state.balance += q.amount;
      m.mine[side] = 0;
      m.history.push({ who: 'you', price: price(m.pools, 'si') });
      m.lastOp = { type: 'sell', side: side, s: s, q: q };
      announce(fill(t('sold'), { s: fmt(s), side: sideName(side), f: fmt(q.amount) }));
      renderAll();
    }

    /* Tres compras de usuarios ficticios: mueven el precio y su saldo (ranking). */
    function community() {
      var m = ms();
      if (m.status !== 'abierto') return;
      var rand = rng(m.seed);
      for (var i = 0; i < 3; i++) {
        var user = state.users[Math.floor(rand() * state.users.length)];
        var side = rand() < 0.5 ? 'si' : 'no';
        var amount = Math.min(user.balance, 20 + Math.round(rand() * 70));
        if (amount < 1) continue;
        var q = quoteBuy(m.pools, side, amount);
        apply(m.pools, side, q);
        user.balance -= amount;
        m.others[user.id] = m.others[user.id] || { si: 0, no: 0 };
        m.others[user.id][side] += q.shares;
        m.history.push({ who: user.id, price: price(m.pools, 'si') });
      }
      m.seed = Math.floor(rand() * 1e9);
      announce(t('community_done'));
      renderAll();
    }

    function resolve(side) {
      var m = ms();
      m.status = 'resuelto';
      m.winner = side;
      m.closing = false;
      /* Los usuarios ficticios canjean sus participaciones ganadoras (1 ficha cada una). */
      Object.keys(m.others).forEach(function (id) {
        var u = state.users.filter(function (x) { return x.id === id; })[0];
        u.balance += m.others[id][side];
      });
      announce(fill(t('resolved'), { side: sideName(side) }));
      renderAll();
    }

    function redeem() {
      var m = ms();
      if (m.status !== 'resuelto' || m.redeemed) return;
      var s = m.mine[m.winner];
      state.balance += s;
      m.redeemed = true;
      /* Tras el canje no quedan participaciones: las ganadoras se pagaron y las perdedoras no valen. */
      m.mine = { si: 0, no: 0 };
      announce(fill(t('redeemed'), { s: fmt(s), f: fmt(s) }));
      renderAll();
    }

    host.addEventListener('click', function (event) {
      var el = event.target.closest('button');
      if (!el || !host.contains(el)) return;
      if (el.hasAttribute('data-market')) { state.market = el.getAttribute('data-market'); renderAll(); return; }
      if (el.hasAttribute('data-side')) { state.side = el.getAttribute('data-side'); renderTrade(); return; }
      if (el.hasAttribute('data-sell')) { sell(el.getAttribute('data-sell')); return; }
      if (el.hasAttribute('data-resolve')) { resolve(el.getAttribute('data-resolve')); return; }
      switch (el.id) {
        case 'pb-buy': buy(); break;
        case 'pb-community': community(); break;
        case 'pb-close': ms().closing = true; renderTrade(); break;
        case 'pb-redeem': redeem(); break;
        case 'pb-claim':
          state.streak += 1;
          state.balance += Math.min(state.streak, 5) * 100;
          state.claimed = true;
          renderAll();
          break;
        case 'pb-reset': state = freshState(); announce(''); renderAll(); break;
      }
    });

    host.addEventListener('input', function (event) {
      if (event.target.id !== 'pb-amount') return;
      state.amount = Math.floor(Number(event.target.value));
      /* Solo se actualizan la vista previa y el botón, para no perder el foco del campo. */
      var m = ms();
      var valid = amountValid();
      var preview = host.querySelector('.poly__preview');
      var text = valid ? fill(t('preview'), {
        s: fmt(quoteBuy(m.pools, state.side, state.amount).shares), side: sideName(state.side),
        p0: fmtPct(price(m.pools, state.side)), p1: fmtPct(quoteBuy(m.pools, state.side, state.amount).newPrice)
      }) : '';
      if (preview) preview.textContent = text;
      else if (text) {
        var p = document.createElement('p');
        p.className = 'poly__preview';
        p.textContent = text;
        $('pb-amount').closest('.field').after(p);
      }
      var btn = $('pb-buy');
      btn.disabled = !valid;
      btn.classList.toggle('is-cue', valid);
      $('pb-amount-hint').textContent = state.balance < 1 ? t('no_balance') : t('amount_hint');
    });

    document.addEventListener('i18n:change', renderAll);
    renderAll();
  }

  window.Demos.register('polybeauchef', {
    label: 'PolyBeauchef',
    init: function (host) {
      var data = fetch('scripts/demos/polybeauchef-data.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .catch(function () {
          var err = new Error('data');
          err.messageKey = 'demo.polybeauchef.error';
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
