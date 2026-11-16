/* ============================================================
   BM.audio — SFX 100% procedurales con WebAudio (sin ficheros).
   Cargado tras config.js y antes de ui.js/sprites.js/main.js.
   Idempotente: init() repetido no duplica el contexto.
   ============================================================ */
(function () {
  'use strict';

  window.BM = window.BM || {};

  var ctx = null;    // AudioContext (se crea lazy en init)
  var master = null; // Ganancia maestra a la que van todos los SFX
  var muted = false; // Flag de silencio

  // Crea el AudioContext la primera vez; si ya existe, lo resume
  // si estaba suspendido. Devuelve null si no hay soporte.
  function ensureCtx() {
    if (ctx) {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        try {
          ctx.resume();
        } catch (e) {
          /* silencioso */
        }
      }
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null; // Sin WebAudio: silencio total
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5; // Volumen maestro
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  // Nota simple con glide opcional y envolvente exponencial.
  // type: forma de onda | f0/f1: Hz inicial/final | dur: segundos
  // vol: ganancia pico | delay: segundos desde ahora
  function note(type, f0, f1, dur, vol, delay) {
    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Explosión: ruido blanco por lowpass que se cierra + sub-grave
  function sfxExplosion() {
    var t = ctx.currentTime;
    var dur = 0.5;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1; // Ruido blanco
    }

    var src = ctx.createBufferSource();
    src.buffer = buf;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(100, t + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // Decay exponencial

    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);

    // Sub-oscilador para el "golpe" grave
    note('sine', 80, 40, dur, 0.4, 0);
  }

  // Tabla de SFX procedurales
  var SFX = {
    drop: function () {
      // Blip corto descendente (soltar bomba)
      note('square', 300, 120, 0.08, 0.22, 0);
    },

    explosion: sfxExplosion,

    powerup: function () {
      // Arpegio ascendente rápido de 3 notas
      note('triangle', 440, 440, 0.09, 0.25, 0);
      note('triangle', 660, 660, 0.09, 0.25, 0.08);
      note('triangle', 880, 880, 0.12, 0.25, 0.16);
    },

    death: function () {
      // Barrido descendente largo
      note('sawtooth', 400, 60, 0.6, 0.3, 0);
    },

    exit: function () {
      // Dos notas ascendentes luminosas + acorde corto
      note('square', 660, 660, 0.12, 0.18, 0);
      note('square', 880, 880, 0.12, 0.18, 0.12);
      note('triangle', 660, 660, 0.22, 0.15, 0.26);
      note('triangle', 880, 880, 0.22, 0.15, 0.26);
      note('triangle', 1320, 1320, 0.22, 0.12, 0.26);
    },

    victory: function () {
      // Fanfarria ascendente staccato de 6 notas
      var seq = [523, 659, 784, 1046, 1318, 1568];
      for (var i = 0; i < seq.length; i++) {
        var ultima = i === seq.length - 1;
        note('square', seq[i], seq[i], ultima ? 0.4 : 0.12, 0.18, i * 0.15);
        if (ultima) {
          note('triangle', seq[i] / 2, seq[i] / 2, 0.4, 0.12, i * 0.15);
        }
      }
    },

    menu: function () {
      // Blip suave corto (navegación de menú)
      note('sine', 520, 520, 0.07, 0.15, 0);
    },

    tick: function () {
      // Tick agudo de ganancia baja (cuenta atrás)
      note('square', 1000, 1000, 0.05, 0.08, 0);
    }
  };

  BM.audio = {
    // Crea el AudioContext la primera vez (lazy); si ya existe,
    // lo resume si estaba suspendido. Silencioso si no hay soporte.
    init: function () {
      try {
        ensureCtx();
      } catch (e) {
        /* silencioso */
      }
    },

    // Reproduce un efecto por nombre; no-op si está muteado o sin ctx
    sfx: function (name) {
      if (muted) return;
      if (!ensureCtx()) return;
      var fn = SFX[name];
      if (!fn) return;
      try {
        fn();
      } catch (e) {
        /* silencioso */
      }
    },

    setMuted: function (bool) {
      muted = !!bool;
    },

    isMuted: function () {
      return muted;
    },

    toggleMuted: function () {
      muted = !muted;
      return muted;
    }
  };
})();
