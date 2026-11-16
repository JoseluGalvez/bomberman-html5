/* ============================================================
   BM.ui — HUD, overlay y wiring de botones.
   Cargado tras config.js/audio.js y antes de sprites.js/main.js.
   No depende de sprites.js ni main.js en tiempo de carga: toda
   llamada a BM.main se hace con guards en tiempo de click.
   ============================================================ */
(function () {
  'use strict';

  window.BM = window.BM || {};

  // Atajo seguro a getElementById
  function el(id) {
    return document.getElementById(id);
  }

  BM.ui = {
    // Actualiza los 6 contadores del HUD.
    // stats = { lives, score, bombs, range, level, time }
    updateHUD: function (stats) {
      stats = stats || {};
      var campos = [
        ['hud-lives', stats.lives],
        ['hud-score', stats.score],
        ['hud-bombs', stats.bombs],
        ['hud-range', stats.range],
        ['hud-level', stats.level]
      ];
      for (var i = 0; i < campos.length; i++) {
        var nodo = el(campos[i][0]);
        var valor = campos[i][1];
        if (nodo && valor !== undefined && valor !== null) {
          nodo.textContent = String(valor);
        }
      }
      var timer = el('hud-timer');
      if (timer && typeof stats.time === 'number' && isFinite(stats.time)) {
        // Tiempo mostrado como segundos enteros
        timer.textContent = String(Math.ceil(stats.time));
        // Clase 'low' cuando quedan 30s o menos
        if (stats.time <= 30) {
          timer.classList.add('low');
        } else {
          timer.classList.remove('low');
        }
      }
    },

    // Muestra el overlay: kind ∈ menu|pause|gameover|levelclear|victory
    // opts = { title, text, button } (textos los aporta main.js)
    showOverlay: function (kind, opts) {
      var overlay = el('overlay');
      if (!overlay) return;
      opts = opts || {};
      var title = el('overlay-title');
      var text = el('overlay-text');
      var btn = el('overlay-btn');
      if (title && opts.title !== undefined && opts.title !== null) {
        title.textContent = String(opts.title);
      }
      if (text && opts.text !== undefined && opts.text !== null) {
        text.textContent = String(opts.text);
      }
      if (btn && opts.button !== undefined && opts.button !== null) {
        btn.textContent = String(opts.button);
      }
      // data-kind controla el color/glow del título via CSS
      overlay.setAttribute('data-kind', String(kind || 'menu'));
      overlay.classList.remove('hidden');
    },

    // Oculta el overlay
    hideOverlay: function () {
      var overlay = el('overlay');
      if (overlay) overlay.classList.add('hidden');
    },

    // Icono del botón de mute (único texto fijo permitido aquí)
    setMuteLabel: function (muted) {
      var btn = el('btn-mute');
      if (btn) btn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    }
  };

  // Wiring seguro de botones: no rompe si falta otro módulo
  function wire() {
    // Botón del overlay -> acción definida por main.js
    var btnOverlay = el('overlay-btn');
    if (btnOverlay) {
      btnOverlay.addEventListener('click', function () {
        try {
          if (window.BM.main && typeof BM.main.overlayAction === 'function') {
            BM.main.overlayAction();
          }
        } catch (e) {
          /* silencioso */
        }
      });
    }

    // Botón de mute -> alterna audio y refresca el icono
    var btnMute = el('btn-mute');
    if (btnMute) {
      btnMute.addEventListener('click', function () {
        try {
          if (window.BM.audio && typeof BM.audio.toggleMuted === 'function') {
            BM.audio.toggleMuted();
            var estaMute = typeof BM.audio.isMuted === 'function' ? BM.audio.isMuted() : false;
            BM.ui.setMuteLabel(estaMute);
          }
        } catch (e) {
          /* silencioso */
        }
      });
    }

    // Desbloquea el AudioContext lo antes posible
    try {
      if (window.BM.audio && typeof BM.audio.init === 'function') {
        BM.audio.init();
      }
    } catch (e) {
      /* silencioso */
    }
  }

  // Ejecutar el wiring cuando el DOM esté disponible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
