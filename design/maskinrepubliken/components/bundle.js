/* @ds-bundle: {"format":4,"namespace":"Maskinrepubliken","components":[{"name":"Ordbild"},{"name":"Perforering"},{"name":"RingMatare"},{"name":"Knapp"},{"name":"Bricka"},{"name":"SektionsRubrik"},{"name":"Kort"},{"name":"Nav"},{"name":"Hero"},{"name":"Sidfot"}]} */
(function () {
  'use strict';

  var React = window.React;
  var h = React.createElement;

  /* Ytfärger som CSS-variabler, så komponenterna följer temat. */
  var BOTTEN = {
    ink: 'var(--surface-ink)',
    skog: 'var(--surface-forest)',
    rost: 'var(--surface-rust)'
  };
  var BLACK = {
    ockra: 'var(--ochre)',
    papper: 'var(--on-dark)',
    black: 'var(--ink)',
    skog: 'var(--surface-forest)',
    rost: 'var(--surface-rust)'
  };

  function klasser() {
    var ut = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) ut.push(arguments[i]);
    }
    return ut.join(' ');
  }

  /* Deterministisk slump: samma frö ger samma yta varje gång. */
  function slump(fro) {
    var a = (fro >>> 0) + 0x6d2b79f5;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --- Ordbild --------------------------------------------------------- */

  function Ordbild(p) {
    var bredd = p.bredd == null ? 260 : p.bredd;
    return h(
      'span',
      { className: klasser('mr-ordbild', p.klass), style: { width: bredd, maxWidth: '100%' } },
      h('img', { src: p.src, alt: p.alt == null ? 'Maskinrepubliken' : p.alt })
    );
  }

  /* --- Perforering ----------------------------------------------------- */

  var PITCH_X = 75;
  var PITCH_Y = 150;
  var HAL_R = 18.5;
  var KUGG_R = 37.2;
  var MARGINAL = 165;

  /* Löpor om 1–4 hål med glapp emellan, ungefär till den täthet som begärts.
     Utspridda hål blir en prickig yta; löpor blir ett kort. */
  function halplatser(kolumner, rader, tathet, fro) {
    var slumpa = slump(fro);
    var mal = tathet === 'gles' ? 0.33 : tathet === 'tat' ? 0.66 : tathet;
    var glappMax = mal >= 0.5 ? 2 : 3;
    var ut = [];
    for (var rad = 0; rad < rader; rad++) {
      var kvar = Math.max(1, Math.round(kolumner * mal));
      var kol = 0;
      while (kol < kolumner && kvar > 0) {
        var lopa = Math.min(1 + Math.floor(slumpa() * 4), kvar, kolumner - kol);
        for (var k = 0; k < lopa; k++) {
          ut.push([kol + k, rad]);
        }
        kvar -= lopa;
        kol += lopa + 1 + Math.floor(slumpa() * glappMax);
      }
    }
    return ut;
  }

  function Perforering(p) {
    var kolumner = p.kolumner == null ? 13 : p.kolumner;
    var rader = p.rader == null ? 3 : p.rader;
    /* Kuggcirklarna behöver sin marginal; en yta utan dem går närmare kanten. */
    var marginal = p.marginal == null ? (p.kugg ? MARGINAL : 98) : p.marginal;
    var bredd = marginal * 2 + (kolumner - 1) * PITCH_X;
    var hojd = rader * PITCH_Y;
    var botten = BOTTEN[p.botten] || BOTTEN.ink;
    var hal = BLACK[p.hal] || BLACK.ockra;
    var platser = halplatser(kolumner, rader, p.tathet == null ? 'tat' : p.tathet, p.fro == null ? 7 : p.fro);
    var barn = [h('rect', { key: 'b', x: 0, y: 0, width: bredd, height: hojd, fill: botten })];
    platser.forEach(function (pl, i) {
      barn.push(
        h('circle', {
          key: 'h' + i,
          cx: marginal + pl[0] * PITCH_X,
          cy: PITCH_Y / 2 + pl[1] * PITCH_Y,
          r: HAL_R,
          fill: hal
        })
      );
    });
    if (p.kugg) {
      barn.push(h('circle', { key: 'k1', cx: 52, cy: hojd / 2, r: KUGG_R, fill: hal }));
      barn.push(h('circle', { key: 'k2', cx: bredd - 52, cy: hojd / 2, r: KUGG_R, fill: hal }));
    }
    return h(
      'span',
      { className: klasser('mr-perforering', p.klass) },
      h(
        'svg',
        {
          viewBox: '0 0 ' + bredd + ' ' + hojd,
          xmlns: 'http://www.w3.org/2000/svg',
          role: p.etikett ? 'img' : 'presentation',
          'aria-label': p.etikett || undefined
        },
        barn
      )
    );
  }

  /* --- RingMatare ------------------------------------------------------ */

  function RingMatare(p) {
    var totalt = p.totalt == null ? 7 : p.totalt;
    var klara = p.klara == null ? 0 : p.klara;
    var storlek = p.storlek == null ? 260 : p.storlek;
    var k = storlek / 260;
    var fargKlar = BLACK[p.klarFarg] || BLACK.rost;
    var fargAter = BLACK[p.aterFarg] || BLACK.skog;
    var mitt = storlek / 2;
    var radier = [];
    var r = 125.4 * k;
    var sw = 9.0 * k;
    for (var i = 0; i < totalt && r > 16 * k; i++) {
      radier.push([r, sw]);
      r -= (11.7 + 1.4 * i) * k;
      sw -= 0.517 * k;
    }
    var ringar = radier.map(function (rad, i) {
      var inifran = radier.length - 1 - i;
      return h('circle', {
        key: 'r' + i,
        cx: mitt,
        cy: mitt,
        r: rad[0],
        fill: 'none',
        stroke: inifran < klara ? fargKlar : fargAter,
        strokeWidth: rad[1]
      });
    });
    ringar.push(
      h('circle', { key: 'mitt', cx: mitt, cy: mitt, r: 10 * k, fill: klara > 0 ? fargKlar : fargAter })
    );
    return h(
      'span',
      { className: klasser('mr-ringmatare', p.klass), style: { width: storlek, maxWidth: '100%' } },
      h(
        'svg',
        {
          viewBox: '0 0 ' + storlek + ' ' + storlek,
          xmlns: 'http://www.w3.org/2000/svg',
          role: 'img',
          'aria-label': p.etikett == null ? klara + ' av ' + totalt + ' klara' : p.etikett
        },
        ringar
      )
    );
  }

  /* --- Knapp ----------------------------------------------------------- */

  function Knapp(p) {
    var klass = klasser(
      'mr-knapp',
      p.storlek === 'stor' ? 'mr-knapp--stor' : null,
      p.variant === 'sekundar' ? 'mr-knapp--sekundar' : null,
      p.variant === 'pa-mork' ? 'mr-knapp--pa-mork' : null,
      p.klass
    );
    if (p.href) {
      return h('a', { className: klass, href: p.href, onClick: p.onClick }, p.children);
    }
    return h(
      'button',
      { className: klass, type: p.type || 'button', onClick: p.onClick, disabled: p.inaktiv },
      p.children
    );
  }

  /* --- Bricka ---------------------------------------------------------- */

  function Bricka(p) {
    return h(
      'span',
      {
        className: klasser(
          'mr-bricka',
          p.variant === 'pa-mork' ? 'mr-bricka--pa-mork' : null,
          p.variant === 'fylld' ? 'mr-bricka--fylld' : null,
          p.klass
        )
      },
      p.children
    );
  }

  /* --- SektionsRubrik -------------------------------------------------- */

  function SektionsRubrik(p) {
    var rad = [h('h2', { key: 't', className: 'mr-rubrik__titel' }, p.titel)];
    if (p.svans) rad.push(h('span', { key: 's', className: 'mr-rubrik__svans' }, p.svans));
    var barn = [];
    if (p.avdelning) barn.push(h('span', { key: 'a', className: 'mr-rubrik__avdelning' }, p.avdelning));
    barn.push(h('div', { key: 'r', className: 'mr-rubrik__rad' }, rad));
    return h(
      'div',
      { className: klasser('mr-rubrik', p.paMork ? 'mr-rubrik--pa-mork' : null, p.klass) },
      barn
    );
  }

  /* --- Kort ------------------------------------------------------------ */

  function Kort(p) {
    var barn = [];
    if (p.rubrik) barn.push(h('div', { key: 'r', className: 'mr-kort__rubrik' }, p.rubrik));
    if (p.children) barn.push(h('div', { key: 'k', className: 'mr-kort__text' }, p.children));
    if (p.yta) barn.push(h('div', { key: 'y', className: 'mr-kort__yta' }, p.yta));
    var klass = klasser('mr-kort', p.yta ? 'mr-kort--med-yta' : null, p.klass);
    if (p.href) return h('a', { className: klass, href: p.href }, barn);
    return h('div', { className: klass }, barn);
  }

  /* --- Nav ------------------------------------------------------------- */

  function Nav(p) {
    var lankar = (p.lankar || []).map(function (l, i) {
      return h(
        'a',
        {
          key: 'l' + i,
          className: 'mr-nav__lank',
          href: l.href,
          'aria-current': l.aktiv ? 'page' : undefined
        },
        l.text
      );
    });
    if (p.knapp) lankar.push(h('span', { key: 'knapp' }, p.knapp));
    return h(
      'nav',
      { className: klasser('mr-nav', p.paMork ? 'mr-nav--pa-mork' : null, p.klass), 'aria-label': p.etikett || 'Huvudmeny' },
      [
        h('span', { key: 'm' }, p.ordbild),
        h('div', { key: 'l', className: 'mr-nav__lankar' }, lankar)
      ]
    );
  }

  /* --- Hero ------------------------------------------------------------ */

  function Hero(p) {
    var kropp = [h('h1', { key: 'r', className: 'mr-hero__rubrik' }, p.rubrik)];
    if (p.ingress) kropp.push(h('p', { key: 'i', className: 'mr-hero__ingress', style: { margin: 0 } }, p.ingress));
    var rad = [];
    if (p.knapp) rad.push(h('span', { key: 'k' }, p.knapp));
    if (p.loft) rad.push(h('span', { key: 'l', className: 'mr-hero__loft' }, p.loft));
    if (rad.length) kropp.push(h('div', { key: 'rad', className: 'mr-hero__rad' }, rad));
    var barn = [h('div', { key: 'kropp', className: 'mr-hero__kropp' }, kropp)];
    if (p.brickor && p.brickor.length) {
      barn.push(
        h(
          'div',
          { key: 'br', className: 'mr-hero__brickor' },
          p.brickor.map(function (b, i) {
            return h(Bricka, { key: 'b' + i, variant: 'pa-mork' }, b);
          })
        )
      );
    }
    return h('section', { className: klasser('mr-hero', p.klass) }, barn);
  }

  /* --- Sidfot ---------------------------------------------------------- */

  function Sidfot(p) {
    var spalter = (p.spalter || []).map(function (s, i) {
      var rader = (s.rader || []).map(function (r, j) {
        if (r && r.href) {
          return h('a', { key: 'r' + j, className: 'mr-sidfot__lank', href: r.href }, r.text);
        }
        return h('span', { key: 'r' + j }, r);
      });
      return h('div', { key: 's' + i, className: 'mr-sidfot__spalt' }, [
        h('span', { key: 'e', className: 'mr-sidfot__etikett' }, s.etikett)
      ].concat(rader));
    });
    var barn = [
      h('div', { key: 'kropp', className: 'mr-sidfot__kropp' }, [
        h('div', { key: 'm', className: 'mr-sidfot__marke' }, [
          h('span', { key: 'o' }, p.ordbild),
          p.tagline ? h('span', { key: 't', className: 'mr-sidfot__tagline' }, p.tagline) : null
        ]),
        h('div', { key: 'sp', className: 'mr-sidfot__spalter' }, spalter)
      ])
    ];
    if (p.yta) barn.push(h('div', { key: 'yta' }, p.yta));
    return h('footer', { className: klasser('mr-sidfot', p.klass) }, barn);
  }

  window.Maskinrepubliken = {
    Ordbild: Ordbild,
    Perforering: Perforering,
    RingMatare: RingMatare,
    Knapp: Knapp,
    Bricka: Bricka,
    SektionsRubrik: SektionsRubrik,
    Kort: Kort,
    Nav: Nav,
    Hero: Hero,
    Sidfot: Sidfot
  };
})();
