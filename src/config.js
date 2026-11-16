/* ============================================================
   BM.config — Constantes globales del juego.
   Unidades: píxeles, píxeles/segundo, milisegundos y segundos.
   Debe cargarse antes que audio.js, ui.js, sprites.js y main.js.
   ============================================================ */
window.BM = window.BM || {};

window.BM.config = {
  // Tablero
  COLS: 15,
  ROWS: 13,
  TILE: 48,
  CANVAS_W: 720,
  CANVAS_H: 624,

  // Jugador / enemigos (px por segundo)
  PLAYER_SPEED: 240,
  ENEMY_SPEED: {
    slime: 96,
    ghost: 72,
    fast: 156
  },

  // Tiempos (milisegundos)
  BOMB_FUSE: 2200,
  FLAME_TIME: 450,
  INVULN_MS: 2000,
  RESPAWN_MS: 1200,

  // Tiempo de nivel (segundos)
  LEVEL_TIME: 200,

  // Alcance máximo de las llamas
  MAX_RANGE: 8
};
