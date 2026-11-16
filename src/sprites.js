/* ============================================================
   BM.sprites — Pixel-art procedural (sin imágenes, sin frameworks).
   Todo se dibuja con fillRect sobre una rejilla de diseño 16x16
   por tile (1 unidad = 3px, TILE = 48px).

   Contrato:
   - px, py = esquina superior izquierda del tile.
   - ctx    = CanvasRenderingContext2D (canvas 720x624).
   - Determinista: sin aleatoriedad (misma entrada, mismo dibujo).
   - Cualquier cambio de globalAlpha/shadowBlur se hace dentro de
     ctx.save() ... ctx.restore().

   Cargado tras config.js/audio.js/ui.js y antes de main.js.
   No depende de otros módulos BM.*.
   ============================================================ */
(function () {
  'use strict';

  window.BM = window.BM || {};

  var TILE = 48; // tamaño del tile en píxeles
  var U = 3;     // 1 unidad de rejilla = 3px (16x16 unidades por tile)

  // Rectángulo en coordenadas de rejilla (gx, gy, gw, gh en unidades).
  function r(ctx, px, py, gx, gy, gw, gh, color) {
    ctx.fillStyle = color;
    ctx.fillRect(px + gx * U, py + gy * U, gw * U, gh * U);
  }

  // Rectángulo en píxeles absolutos (para partículas sueltas).
  function dot(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // Normaliza a 0..1 de forma segura.
  function clamp01(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  // Campo de distancia normalizado para las llamas.
  // Devuelve 0 en el núcleo y ~1 en el borde de la silueta.
  function flameField(kind, gx, gy) {
    var k = String(kind || 'center');

    if (k === 'armH') {
      // Brazo horizontal: elipse ancha que llena el tile de lado a lado.
      return Math.sqrt((gx / 8.8) * (gx / 8.8) + (gy / 4.4) * (gy / 4.4));
    }
    if (k === 'armV') {
      // Brazo vertical: elipse alta.
      return Math.sqrt((gx / 4.4) * (gx / 4.4) + (gy / 8.8) * (gy / 8.8));
    }
    if (k === 'endUp' || k === 'endDown') {
      // Punta direccional: se estrecha hacia arriba (endUp) o abajo.
      var ty = (k === 'endUp') ? (gy + 8) / 16 : (8 - gy) / 16; // 0 punta, 1 base
      var hwY = 2.0 + 5.5 * ty;
      var cy = (k === 'endUp') ? 6 : -6;
      return Math.sqrt((gx / hwY) * (gx / hwY) + ((gy - cy) / 14) * ((gy - cy) / 14));
    }
    if (k === 'endLeft' || k === 'endRight') {
      // Punta direccional horizontal.
      var tx = (k === 'endLeft') ? (gx + 8) / 16 : (8 - gx) / 16;
      var hwX = 2.0 + 5.5 * tx;
      var cx = (k === 'endLeft') ? 6 : -6;
      return Math.sqrt(((gx - cx) / 14) * ((gx - cx) / 14) + (gy / hwX) * (gy / hwX));
    }
    // 'center' (y cualquier valor desconocido): bola grande.
    return Math.sqrt((gx / 7.3) * (gx / 7.3) + (gy / 6.9) * (gy / 6.9));
  }

  BM.sprites = {

    /* --------------------------------------------------------
       1. Suelo: damero azul muy oscuro + píxeles decorativos.
       -------------------------------------------------------- */
    drawFloor: function (ctx, px, py, x, y) {
      var par = (((x | 0) + (y | 0)) % 2) === 0;
      var base = par ? '#1a2130' : '#161c2a';
      var deco = par ? '#242e45' : '#1e2739';

      // Relleno del tile
      r(ctx, px, py, 0, 0, 16, 16, base);

      // Píxeles decorativos claros en las cuatro esquinas
      r(ctx, px, py, 1, 1, 2, 1, deco);
      r(ctx, px, py, 1, 1, 1, 2, deco);
      r(ctx, px, py, 13, 1, 2, 1, deco);
      r(ctx, px, py, 14, 1, 1, 2, deco);
      r(ctx, px, py, 1, 14, 2, 1, deco);
      r(ctx, px, py, 1, 13, 1, 2, deco);
      r(ctx, px, py, 13, 14, 2, 1, deco);
      r(ctx, px, py, 14, 13, 1, 2, deco);

      // Motas interiores deterministas (según la posición del tile)
      var m = ((x | 0) * 7 + (y | 0) * 13) % 5;
      if (m < 0) m += 5;
      r(ctx, px, py, 5 + m, 7, 1, 1, deco);
      r(ctx, px, py, 9, 4 + m, 1, 1, deco);
    },

    /* --------------------------------------------------------
       2. Muro indestructible: gris-azulado con bisel y remaches.
       -------------------------------------------------------- */
    drawWall: function (ctx, px, py) {
      // Base
      r(ctx, px, py, 0, 0, 16, 16, '#2c3550');

      // Bisel: luz arriba-izquierda
      r(ctx, px, py, 0, 0, 16, 1, '#4a5678');
      r(ctx, px, py, 0, 0, 1, 16, '#465272');
      r(ctx, px, py, 1, 1, 1, 14, '#3a4562');

      // Bisel: sombra abajo-derecha
      r(ctx, px, py, 0, 15, 16, 1, '#1a2036');
      r(ctx, px, py, 15, 0, 1, 16, '#1d2439');
      r(ctx, px, py, 14, 1, 1, 14, '#242c45');

      // Panel interior ligeramente más claro
      r(ctx, px, py, 3, 3, 10, 10, '#333d5c');
      r(ctx, px, py, 3, 3, 10, 1, '#3d4868');
      r(ctx, px, py, 3, 12, 10, 1, '#28314c');

      // Remaches en las esquinas del panel
      var remaches = [
        [3, 3], [11, 3], [3, 11], [11, 11]
      ];
      for (var i = 0; i < remaches.length; i++) {
        var rx = remaches[i][0];
        var ry = remaches[i][1];
        r(ctx, px, py, rx, ry, 2, 2, '#98a2bf');
        r(ctx, px, py, rx, ry, 1, 1, '#c6cde2');
        r(ctx, px, py, rx + 1, ry + 1, 1, 1, '#141a2a');
      }

      // Junta vertical sutil en el centro
      r(ctx, px, py, 8, 4, 1, 8, '#2a334e');
    },

    /* --------------------------------------------------------
       3. Ladrillo destructible: terracota con hiladas de mortero.
       -------------------------------------------------------- */
    drawBrick: function (ctx, px, py) {
      // Mortero de fondo (se ve en las juntas)
      r(ctx, px, py, 0, 0, 16, 16, '#7a3a22');

      // Cuatro hiladas de 3 unidades de alto, separadas 1 de mortero
      var filas = [0, 4, 8, 12];
      var i;

      for (i = 0; i < filas.length; i++) {
        var fy = filas[i];
        // Bloque de ladrillo
        r(ctx, px, py, 0, fy, 16, 3, '#c0603a');
        // Highlight superior del ladrillo
        r(ctx, px, py, 0, fy, 16, 1, '#e08a5a');
        // Sombra inferior del ladrillo
        r(ctx, px, py, 0, fy + 2, 16, 1, '#a94f2e');

        // Juntas verticales alternadas por hilada
        if (i % 2 === 0) {
          r(ctx, px, py, 7, fy, 1, 3, '#7a3a22');
          r(ctx, px, py, 7, fy, 1, 1, '#8c4729');
        } else {
          r(ctx, px, py, 3, fy, 1, 3, '#7a3a22');
          r(ctx, px, py, 11, fy, 1, 3, '#7a3a22');
          r(ctx, px, py, 3, fy, 1, 1, '#8c4729');
          r(ctx, px, py, 11, fy, 1, 1, '#8c4729');
        }
      }

      // Reflejo general arriba-izquierda
      r(ctx, px, py, 0, 0, 1, 2, '#e8a074');
      r(ctx, px, py, 1, 0, 5, 1, '#e8a074');
    },

    /* --------------------------------------------------------
       4. Puerta de salida: marco gris y arco púrpura iluminado.
       -------------------------------------------------------- */
    drawExit: function (ctx, px, py) {
      // Marco metálico
      r(ctx, px, py, 0, 0, 16, 16, '#6d778d');
      r(ctx, px, py, 0, 0, 16, 1, '#9aa6bd');
      r(ctx, px, py, 0, 0, 1, 16, '#9aa6bd');
      r(ctx, px, py, 0, 15, 16, 1, '#3c4459');
      r(ctx, px, py, 15, 0, 1, 16, '#3c4459');

      // Hueco del arco (escalonado, 8-bit)
      r(ctx, px, py, 5, 3, 6, 1, '#8a6cea');
      r(ctx, px, py, 4, 4, 8, 1, '#7b5cd6');
      r(ctx, px, py, 3, 5, 10, 9, '#7b5cd6'); // y 5..13
      r(ctx, px, py, 4, 14, 8, 1, '#5a41a8'); // umbral oscuro

      // Brillos del arco
      r(ctx, px, py, 5, 3, 2, 1, '#b9a3ff');
      r(ctx, px, py, 4, 4, 1, 2, '#a68bf0');
      r(ctx, px, py, 3, 6, 1, 5, '#8a6cea');
      r(ctx, px, py, 11, 6, 1, 6, '#5f45b0');
      r(ctx, px, py, 4, 12, 8, 1, '#6a4fc4');

      // Luz central cálida
      r(ctx, px, py, 7, 4, 2, 1, '#ffe9a8');
      r(ctx, px, py, 7, 5, 2, 1, '#d9b968');

      // Flecha de salida (legible, oscura sobre el púrpura)
      r(ctx, px, py, 7, 7, 2, 1, '#2a1d55');
      r(ctx, px, py, 6, 8, 4, 1, '#2a1d55');
      r(ctx, px, py, 5, 9, 6, 1, '#2a1d55');
      r(ctx, px, py, 7, 10, 2, 3, '#2a1d55');
    },

    /* --------------------------------------------------------
       5. Power-up: pastilla oscura con borde blanco y glow verde.
       kind: 'bomb' | 'flame' | 'speed'
       -------------------------------------------------------- */
    drawPowerup: function (ctx, px, py, kind) {
      // Borde blanco con glow verde (la sombra se aísla con save/restore)
      ctx.save();
      ctx.shadowColor = 'rgba(64, 224, 138, 0.9)';
      ctx.shadowBlur = 14;
      r(ctx, px, py, 5, 2, 6, 1, '#f4fff8');
      r(ctx, px, py, 4, 3, 8, 1, '#f4fff8');
      r(ctx, px, py, 3, 4, 10, 7, '#f4fff8');
      r(ctx, px, py, 4, 11, 8, 1, '#f4fff8');
      r(ctx, px, py, 5, 12, 6, 1, '#f4fff8');
      ctx.restore();

      // Interior de la pastilla
      r(ctx, px, py, 5, 3, 6, 1, '#12151f');
      r(ctx, px, py, 4, 4, 8, 7, '#12151f');
      r(ctx, px, py, 5, 11, 6, 1, '#12151f');

      // Brillo interior superior
      r(ctx, px, py, 5, 4, 3, 1, '#2b3145');
      r(ctx, px, py, 4, 5, 1, 4, '#2b3145');

      if (kind === 'flame') {
        // Llama naranja
        r(ctx, px, py, 7, 4, 2, 1, '#ff8c2b');
        r(ctx, px, py, 6, 5, 3, 2, '#ff8c2b');
        r(ctx, px, py, 5, 6, 5, 4, '#ff8c2b');
        r(ctx, px, py, 6, 9, 4, 2, '#ff8c2b');
        // Núcleo amarillo
        r(ctx, px, py, 7, 6, 2, 3, '#ffe066');
        r(ctx, px, py, 6, 8, 3, 2, '#ffe066');
        r(ctx, px, py, 8, 8, 1, 2, '#fff6d6');
        // Borde rojo
        r(ctx, px, py, 5, 9, 1, 1, '#d92b1f');
        r(ctx, px, py, 10, 8, 1, 1, '#d92b1f');
        r(ctx, px, py, 8, 4, 1, 1, '#d92b1f');
      } else if (kind === 'speed') {
        // Rayo amarillo-cian
        r(ctx, px, py, 8, 4, 2, 1, '#ffe066');
        r(ctx, px, py, 7, 5, 2, 1, '#ffe066');
        r(ctx, px, py, 6, 6, 4, 1, '#ffe066');
        r(ctx, px, py, 7, 7, 2, 1, '#ffe066');
        r(ctx, px, py, 7, 8, 2, 1, '#ffe066');
        r(ctx, px, py, 6, 9, 2, 1, '#ffe066');
        r(ctx, px, py, 5, 10, 2, 1, '#ffe066');
        // Acentos cian
        r(ctx, px, py, 9, 5, 1, 1, '#6ff0ff');
        r(ctx, px, py, 8, 6, 1, 1, '#6ff0ff');
        r(ctx, px, py, 5, 9, 1, 1, '#6ff0ff');
        r(ctx, px, py, 7, 4, 1, 1, '#fff6d6');
      } else {
        // Bomba negra (por defecto)
        r(ctx, px, py, 7, 5, 2, 1, '#05060a');
        r(ctx, px, py, 6, 6, 4, 1, '#05060a');
        r(ctx, px, py, 5, 7, 6, 1, '#05060a');
        r(ctx, px, py, 5, 8, 6, 1, '#05060a');
        r(ctx, px, py, 6, 9, 4, 1, '#05060a');
        r(ctx, px, py, 7, 10, 2, 1, '#05060a');
        // Reflejo y mecha
        r(ctx, px, py, 6, 6, 1, 1, '#ffffff');
        r(ctx, px, py, 9, 4, 1, 1, '#c98b4a');
        r(ctx, px, py, 9, 5, 1, 1, '#8a5a2c');
        r(ctx, px, py, 10, 4, 1, 1, '#ffe066');
      }
    },

    /* --------------------------------------------------------
       6. Jugador: bombero clásico (casco blanco, visor azul).
       dir: 'up' | 'down' | 'left' | 'right' — walkFrame: 0 | 1
       -------------------------------------------------------- */
    drawPlayer: function (ctx, px, py, dir, walkFrame) {
      var frame = Math.abs(walkFrame | 0) % 2;
      var d = dir || 'down';

      // Antena
      r(ctx, px, py, 7, 1, 2, 1, '#eef2fb');
      r(ctx, px, py, 7, 0, 2, 1, '#ff5f9e');

      // Casco blanco redondeado
      r(ctx, px, py, 5, 2, 6, 1, '#ffffff');
      r(ctx, px, py, 4, 3, 8, 1, '#ffffff');
      r(ctx, px, py, 4, 4, 8, 4, '#eef2fb'); // y 4..7
      r(ctx, px, py, 4, 7, 8, 1, '#c3cce6'); // borde inferior
      // Brillo arriba-izquierda
      r(ctx, px, py, 5, 2, 3, 1, '#ffffff');
      r(ctx, px, py, 4, 4, 2, 2, '#ffffff');

      // Visor o espalda según dirección
      if (d === 'up') {
        // Espalda: sin visor, costura trasera del casco
        r(ctx, px, py, 5, 4, 6, 3, '#dde4f5');
        r(ctx, px, py, 7, 3, 1, 4, '#b8c2de');
        r(ctx, px, py, 7, 5, 1, 1, '#9aa8cf');
        r(ctx, px, py, 8, 5, 1, 1, '#9aa8cf');
      } else if (d === 'left') {
        r(ctx, px, py, 4, 4, 6, 3, '#16244f');
        r(ctx, px, py, 4, 4, 6, 1, '#2c4380');
        r(ctx, px, py, 5, 5, 1, 1, '#9fd8ff');
        r(ctx, px, py, 4, 4, 1, 2, '#0c1633');
      } else if (d === 'right') {
        r(ctx, px, py, 6, 4, 6, 3, '#16244f');
        r(ctx, px, py, 6, 4, 6, 1, '#2c4380');
        r(ctx, px, py, 10, 5, 1, 1, '#9fd8ff');
        r(ctx, px, py, 11, 4, 1, 2, '#0c1633');
      } else {
        // 'down' (frontal)
        r(ctx, px, py, 5, 4, 6, 3, '#16244f');
        r(ctx, px, py, 5, 4, 6, 1, '#2c4380');
        r(ctx, px, py, 6, 5, 1, 1, '#9fd8ff');
        r(ctx, px, py, 9, 5, 1, 1, '#9fd8ff');
        r(ctx, px, py, 5, 6, 6, 1, '#0c1633');
      }

      // Torso blanco
      r(ctx, px, py, 5, 8, 6, 4, '#eef2fb'); // y 8..11
      r(ctx, px, py, 5, 8, 6, 1, '#ffffff');
      r(ctx, px, py, 10, 8, 1, 4, '#c3cce6');
      // Cinturón
      r(ctx, px, py, 5, 11, 6, 1, '#16244f');

      // Guantes azules
      r(ctx, px, py, 3, 8, 2, 3, '#2a4fd0');
      r(ctx, px, py, 11, 8, 2, 3, '#2a4fd0');
      r(ctx, px, py, 3, 8, 2, 1, '#4d78ff');
      r(ctx, px, py, 11, 8, 2, 1, '#4d78ff');
      r(ctx, px, py, 3, 10, 2, 1, '#1d3aa3');
      r(ctx, px, py, 11, 10, 2, 1, '#1d3aa3');

      // Piernas azul oscuro (alternan con walkFrame)
      if (frame === 0) {
        r(ctx, px, py, 5, 12, 2, 3, '#1f2a6b');
        r(ctx, px, py, 9, 12, 2, 3, '#1f2a6b');
        r(ctx, px, py, 5, 15, 2, 1, '#0f1740');
        r(ctx, px, py, 9, 15, 2, 1, '#0f1740');
      } else {
        // Paso: pierna izquierda adelantada, derecha levantada
        r(ctx, px, py, 4, 12, 2, 3, '#1f2a6b');
        r(ctx, px, py, 4, 15, 3, 1, '#0f1740');
        r(ctx, px, py, 9, 12, 2, 2, '#1f2a6b');
        r(ctx, px, py, 9, 14, 3, 1, '#0f1740');
      }
    },

    /* --------------------------------------------------------
       7. Jugador muriendo: gira, se desvanece y suelta partículas.
       t: 0..1
       -------------------------------------------------------- */
    drawPlayerDying: function (ctx, px, py, t) {
      var f = clamp01(t);

      ctx.save();
      ctx.globalAlpha = 1 - f; // alpha 1 -> 0
      ctx.translate(px + TILE / 2, py + TILE / 2);
      ctx.rotate(f * Math.PI * 0.75); // gira sobre sí mismo
      var esc = 1 - 0.25 * f;
      ctx.scale(esc, esc);

      var lx = -TILE / 2;
      var ly = -TILE / 2;

      // Silueta simplificada del bombero
      r(ctx, lx, ly, 7, 1, 2, 1, '#ff5f9e');
      r(ctx, lx, ly, 5, 2, 6, 1, '#ffffff');
      r(ctx, lx, ly, 4, 3, 8, 4, '#eef2fb');
      r(ctx, lx, ly, 4, 7, 8, 1, '#c3cce6');
      r(ctx, lx, ly, 5, 4, 6, 3, '#16244f');
      r(ctx, lx, ly, 5, 8, 6, 4, '#eef2fb');
      r(ctx, lx, ly, 3, 8, 2, 3, '#2a4fd0');
      r(ctx, lx, ly, 11, 8, 2, 3, '#2a4fd0');
      r(ctx, lx, ly, 5, 12, 2, 3, '#1f2a6b');
      r(ctx, lx, ly, 9, 12, 2, 3, '#1f2a6b');

      // Partículas deterministas en corona que se alejan con t
      var colores = ['#ff8c2b', '#ffe066', '#ffffff', '#eef2fb'];
      for (var i = 0; i < 8; i++) {
        var ang = i * (Math.PI / 4);
        var rad = (4 + 17 * f) * U * 0.55;
        var sx = Math.cos(ang) * rad;
        var sy = Math.sin(ang) * rad - 6 * f;
        var sz = (i % 2 === 0) ? 3 : 2;
        dot(ctx, lx + TILE / 2 + sx, ly + TILE / 2 + sy, sz, sz, colores[i % colores.length]);
      }

      ctx.restore();
    },

    /* --------------------------------------------------------
       8. Enemigo.
       kind: 'slime' | 'ghost' | 'fast'
       walkFrame: 0 | 1 — angry: true/false
       -------------------------------------------------------- */
    drawEnemy: function (ctx, px, py, kind, walkFrame, angry) {
      var frame = Math.abs(walkFrame | 0) % 2;
      var k = kind || 'slime';
      var i;

      if (k === 'ghost') {
        /* ---------------- Fantasma blanco-cian translúcido ---------------- */
        ctx.save();
        ctx.globalAlpha = 0.85; // siempre restaurado al final

        // Cuerpo principal
        r(ctx, px, py, 6, 2, 4, 1, '#e8fdff');
        r(ctx, px, py, 5, 3, 6, 1, '#e8fdff');
        r(ctx, px, py, 4, 4, 8, 3, '#dff9ff'); // y 4..6
        r(ctx, px, py, 4, 7, 8, 5, '#dff9ff'); // y 7..11
        // Sombra cian inferior
        r(ctx, px, py, 4, 11, 8, 1, '#a5e6f2');
        r(ctx, px, py, 12, 6, 1, 5, '#b8e9f5');

        // Cola ondulada (dos formas alternas)
        if (frame === 0) {
          r(ctx, px, py, 4, 12, 2, 2, '#c9f2fb');
          r(ctx, px, py, 6, 13, 2, 2, '#b8e9f5');
          r(ctx, px, py, 8, 12, 2, 2, '#c9f2fb');
          r(ctx, px, py, 10, 13, 2, 2, '#b8e9f5');
          r(ctx, px, py, 7, 14, 2, 1, '#a5e6f2');
        } else {
          r(ctx, px, py, 4, 13, 2, 2, '#b8e9f5');
          r(ctx, px, py, 6, 12, 2, 2, '#c9f2fb');
          r(ctx, px, py, 8, 13, 2, 2, '#b8e9f5');
          r(ctx, px, py, 10, 12, 2, 2, '#c9f2fb');
          r(ctx, px, py, 7, 14, 2, 1, '#a5e6f2');
        }

        // Brillo espectral
        r(ctx, px, py, 5, 4, 2, 2, '#ffffff');
        r(ctx, px, py, 4, 5, 1, 3, '#e8fdff');

        // Ojos
        r(ctx, px, py, 5, 5, 2, 2, '#ffffff');
        r(ctx, px, py, 9, 5, 2, 2, '#ffffff');

        if (angry) {
          // Ojos rojos + ceño
          r(ctx, px, py, 5, 6, 2, 1, '#ff3b30');
          r(ctx, px, py, 9, 6, 2, 1, '#ff3b30');
          r(ctx, px, py, 5, 4, 2, 1, '#7a1420');
          r(ctx, px, py, 9, 4, 2, 1, '#7a1420');
          // Boca airada
          r(ctx, px, py, 6, 9, 4, 1, '#5a1020');
          r(ctx, px, py, 7, 8, 2, 1, '#5a1020');
        } else {
          // Pupilas y boca
          r(ctx, px, py, 5, 6, 1, 1, '#14434d');
          r(ctx, px, py, 10, 6, 1, 1, '#14434d');
          r(ctx, px, py, 7, 9, 2, 1, '#4f9aa8');
          r(ctx, px, py, 6, 8, 4, 1, '#6fb6c2');
        }

        ctx.restore();
        return;
      }

      if (k === 'fast') {
        /* ---------------- Bola rojo-amarilla veloz y agresiva ---------------- */
        // Pinchos
        r(ctx, px, py, 7, 2, 2, 2, '#ffb52e');
        r(ctx, px, py, 7, 3, 1, 1, '#ffd166');
        r(ctx, px, py, 3, 7, 2, 2, '#ffb52e');
        r(ctx, px, py, 11, 7, 2, 2, '#ffb52e');
        r(ctx, px, py, 4, 4, 1, 1, '#ffb52e');
        r(ctx, px, py, 11, 4, 1, 1, '#ffb52e');

        // Cuerpo (bola)
        r(ctx, px, py, 6, 5, 4, 1, '#e2352f');
        r(ctx, px, py, 5, 6, 6, 2, '#e2352f');
        r(ctx, px, py, 4, 8, 8, 3, '#e2352f');
        r(ctx, px, py, 5, 11, 6, 2, '#ffb52e'); // base amarilla
        r(ctx, px, py, 5, 12, 6, 1, '#e09a1f');

        // Brillo
        r(ctx, px, py, 5, 6, 2, 1, '#ff8a7a');
        r(ctx, px, py, 6, 6, 1, 1, '#ffd9d4');

        // Ojos
        r(ctx, px, py, 5, 7, 2, 2, '#fff6e0');
        r(ctx, px, py, 9, 7, 2, 2, '#fff6e0');

        if (angry) {
          r(ctx, px, py, 6, 8, 1, 1, '#ff1f1f');
          r(ctx, px, py, 9, 8, 1, 1, '#ff1f1f');
          // Ceño
          r(ctx, px, py, 5, 6, 2, 1, '#7a0f0f');
          r(ctx, px, py, 9, 6, 2, 1, '#7a0f0f');
          r(ctx, px, py, 6, 10, 4, 1, '#5a0a0a');
        } else {
          r(ctx, px, py, 6, 8, 1, 1, '#2a0f0f');
          r(ctx, px, py, 9, 8, 1, 1, '#2a0f0f');
          r(ctx, px, py, 7, 10, 2, 1, '#a62a22');
        }

        // Patas rápidas (dos formas alternas)
        if (frame === 0) {
          r(ctx, px, py, 3, 13, 2, 1, '#8a1f1a');
          r(ctx, px, py, 6, 13, 2, 1, '#b3221c');
          r(ctx, px, py, 9, 13, 2, 1, '#8a1f1a');
          r(ctx, px, py, 12, 12, 1, 1, '#ffb52e');
        } else {
          r(ctx, px, py, 2, 12, 2, 1, '#8a1f1a');
          r(ctx, px, py, 5, 13, 3, 1, '#b3221c');
          r(ctx, px, py, 10, 13, 2, 1, '#8a1f1a');
          r(ctx, px, py, 12, 13, 1, 1, '#ffb52e');
        }

        // Estelas de velocidad deterministas
        r(ctx, px, py, 1, 6, 2, 1, '#ffd166');
        r(ctx, px, py, 1, 9, 1, 1, '#e09a1f');
        return;
      }

      /* ---------------- Slime verde (por defecto) ---------------- */
      // Cuerpo
      r(ctx, px, py, 6, 4, 4, 1, '#57e874');
      r(ctx, px, py, 5, 5, 6, 2, '#3ecf5a'); // y 5..6
      r(ctx, px, py, 4, 7, 8, 4, '#3ecf5a'); // y 7..10
      r(ctx, px, py, 4, 11, 8, 1, '#249a3d'); // sombra inferior

      // Brillo
      r(ctx, px, py, 5, 5, 2, 2, '#7df0a0');
      r(ctx, px, py, 4, 7, 1, 3, '#7df0a0');
      r(ctx, px, py, 6, 4, 2, 1, '#a8ffc2');

      // Ojos grandes
      r(ctx, px, py, 5, 7, 3, 3, '#f4fff8');
      r(ctx, px, py, 9, 7, 3, 3, '#f4fff8');

      if (angry) {
        // Ojos rojos y ceño
        r(ctx, px, py, 6, 8, 1, 1, '#c0141c');
        r(ctx, px, py, 10, 8, 1, 1, '#c0141c');
        r(ctx, px, py, 5, 6, 2, 1, '#7a1420');
        r(ctx, px, py, 9, 6, 2, 1, '#7a1420');
        r(ctx, px, py, 7, 11, 3, 1, '#1c7a31');
      } else {
        // Pupilas y sonrisa
        r(ctx, px, py, 6, 8, 1, 1, '#142a1a');
        r(ctx, px, py, 10, 8, 1, 1, '#142a1a');
        r(ctx, px, py, 7, 11, 3, 1, '#1c7a31');
        r(ctx, px, py, 7, 10, 1, 1, '#1c7a31');
        r(ctx, px, py, 9, 10, 1, 1, '#1c7a31');
      }

      // Base ondulante: dos formas alternas
      if (frame === 0) {
        r(ctx, px, py, 3, 12, 3, 2, '#2fb84c');
        r(ctx, px, py, 6, 12, 2, 3, '#2fb84c');
        r(ctx, px, py, 8, 12, 2, 2, '#249a3d');
        r(ctx, px, py, 10, 12, 3, 2, '#2fb84c');
        r(ctx, px, py, 3, 13, 3, 1, '#249a3d');
        r(ctx, px, py, 10, 13, 3, 1, '#249a3d');
      } else {
        r(ctx, px, py, 3, 12, 2, 3, '#2fb84c');
        r(ctx, px, py, 5, 13, 2, 1, '#249a3d');
        r(ctx, px, py, 7, 12, 3, 2, '#2fb84c');
        r(ctx, px, py, 10, 12, 2, 3, '#2fb84c');
        r(ctx, px, py, 12, 13, 1, 1, '#249a3d');
      }

      // Goteo decorativo
      for (i = 0; i < 2; i++) {
        var gx = 4 + i * 6;
        r(ctx, px, py, gx, 13, 1, 2, '#57e874');
        r(ctx, px, py, gx, 14, 1, 1, '#a8ffc2');
      }
    },

    /* --------------------------------------------------------
       9. Bomba: esfera negra con brillo, mecha y pulso opcional.
       progress: 0..1 — pulsing: true/false
       -------------------------------------------------------- */
    drawBomb: function (ctx, px, py, progress, pulsing) {
      var p = clamp01(progress);

      // Sombra en el suelo (alpha aislado)
      ctx.save();
      ctx.globalAlpha = 0.28;
      r(ctx, px, py, 4, 14, 8, 2, '#070a10');
      r(ctx, px, py, 5, 15, 6, 1, '#070a10');
      ctx.restore();

      // Escala pulsante ±6% según progress
      var esc = 1;
      if (pulsing) esc = 1 + 0.06 * Math.sin(p * Math.PI * 8);

      ctx.save();
      ctx.translate(px + TILE / 2, py + TILE / 2);
      ctx.scale(esc, esc);

      var lx = -TILE / 2;
      var ly = -TILE / 2;

      // Esfera aproximada con 15 filas de anchos (en unidades)
      var anchos = [6, 8, 10, 12, 14, 14, 14, 14, 14, 14, 14, 12, 10, 8, 6];
      for (var i = 0; i < anchos.length; i++) {
        var w = anchos[i];
        var gy = -7 + i;
        r(ctx, lx, ly, -w / 2, gy, w, 1, '#1b1b22');
      }

      // Luz superior-izquierda
      r(ctx, lx, ly, -4, -5, 3, 2, '#34343f');
      r(ctx, lx, ly, -5, -3, 1, 2, '#2c2c36');
      r(ctx, lx, ly, -4, -5, 1, 1, '#f4f4ff');
      r(ctx, lx, ly, -3, -6, 1, 1, '#d9d9ea');
      r(ctx, lx, ly, -5, -1, 1, 2, '#5a5a70');

      // Sombra inferior-derecha
      r(ctx, lx, ly, 2, 5, 3, 1, '#0d0d12');
      r(ctx, lx, ly, 4, 2, 2, 2, '#0d0d12');
      r(ctx, lx, ly, 3, 4, 2, 1, '#0d0d12');

      // Mecha marrón (horizontal, queda dentro del tile)
      r(ctx, lx, ly, 2, -8, 2, 1, '#7a4a22');
      r(ctx, lx, ly, 3, -8, 1, 1, '#c98b4a');
      r(ctx, lx, ly, 4, -8, 1, 1, '#8a5a2c');

      // Chispa de la mecha (con glow aislado)
      if (pulsing) {
        ctx.save();
        ctx.shadowColor = '#fff2a8';
        ctx.shadowBlur = 10;
        var chispa = (Math.floor(p * 12) % 2 === 0) ? '#ffffff' : '#ffe066';
        r(ctx, lx, ly, 5, -8, 1, 1, chispa);
        r(ctx, lx, ly, 5, -7, 1, 1, '#ff8c2b');
        ctx.restore();
      } else {
        r(ctx, lx, ly, 5, -8, 1, 1, '#8a5a2c');
      }

      ctx.restore();
    },

    /* --------------------------------------------------------
       10. Llama de explosión.
       kind: 'center' | 'armH' | 'armV' | 'endUp' | 'endDown'
             | 'endLeft' | 'endRight'
       t: 0..1 (escala y opacidad decrecen con t)
       -------------------------------------------------------- */
    drawFlame: function (ctx, px, py, kind, t) {
      var f = clamp01(t);
      var k = String(kind || 'center');

      // Semilla determinista derivada del nombre del tipo
      var semilla = 0;
      for (var s = 0; s < k.length; s++) semilla += k.charCodeAt(s);

      var esc = 1 - 0.35 * f; // 1 -> 0.65
      if (esc < 0.05) esc = 0.05;

      ctx.save();
      ctx.translate(px + TILE / 2, py + TILE / 2);
      ctx.scale(esc, esc);
      ctx.globalAlpha = 1 - 0.65 * f; // opacidad decreciente

      // Rejilla 16x16: cada celda se colorea según su distancia al núcleo
      for (var j = 0; j < 16; j++) {
        for (var i = 0; i < 16; i++) {
          var gx = i - 7.5;
          var gy = j - 7.5;
          var d = flameField(k, gx, gy);

          // Ruido determinista para la silueta dentada 8-bit
          var ruido = (((i * 13 + j * 7 + semilla) % 5) - 2) * 0.03;
          d += ruido;
          if (d > 1) continue;

          var color;
          if (d < 0.30) {
            color = '#fff8e0';      // núcleo blanco
          } else if (d < 0.58) {
            color = '#ffe066';      // amarillo
          } else if (d < 0.82) {
            color = '#ff8c2b';      // naranja
          } else {
            color = '#d92b1f';      // borde rojo
          }

          r(ctx, -TILE / 2, -TILE / 2, i, j, 1, 1, color);
        }
      }

      ctx.restore();
    },

    /* --------------------------------------------------------
       11. Ladrillo desintegrándose: trozos, polvo y alpha.
       t: 0..1
       -------------------------------------------------------- */
    drawCrumbling: function (ctx, px, py, t) {
      var f = clamp01(t);

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - f); // alpha decreciente

      // Trozos de ladrillo separándose (4x4 = 16 piezas deterministas)
      for (var iy = 0; iy < 4; iy++) {
        for (var ix = 0; ix < 4; ix++) {
          var jitter = ((ix * 7 + iy * 11) % 5) * 0.12 * f;
          var gx = ix * 4 + 0.3 + (ix - 1.5) * f * 1.2 + jitter;
          var gy = iy * 4 + 0.3 + (iy - 1.5) * f * 1.1 + f * f * 1.6;
          var gw = 3.4 - f * 0.8;
          var gh = 3.4 - f * 0.8;
          if (gw < 0.4) gw = 0.4;
          if (gh < 0.4) gh = 0.4;

          // Alternancia de tonos para dar volumen a los cascotes
          var tono = ((ix + iy) % 2 === 0) ? '#c0603a' : '#a94f2e';
          r(ctx, px, py, gx, gy, gw, gh, tono);
          // Cara superior iluminada del cascote
          r(ctx, px, py, gx, gy, gw, 0.5, '#e08a5a');
          // Mortero visible entre los trozos al principio
          if (f < 0.55) {
            r(ctx, px, py, gx + gw, gy, 0.6, gh, '#7a3a22');
          }
        }
      }

      // Polvo gris-marrón: partículas que caen y se abren con t
      var polvo = ['#8a7a68', '#6b5c4b', '#9c8a76'];
      for (var i = 0; i < 12; i++) {
        var ang = i * 0.52;
        var dist = f * (2 + (i % 3) * 1.6) * U;
        var dx = Math.cos(ang) * dist;
        var dy = Math.sin(ang) * dist * 0.8 + f * f * 12;
        var sz = (i % 3 === 0) ? 4 : ((i % 3 === 1) ? 3 : 2);
        dot(ctx, px + TILE / 2 + dx, py + TILE / 2 + dy, sz, sz, polvo[i % polvo.length]);
      }

      ctx.restore();
    }
  };

})();
