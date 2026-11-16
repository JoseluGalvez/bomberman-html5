/* ============================================================
   BM.main — Lógica, estado y bucle del clon de Bomberman.
   Requiere config.js, audio.js, ui.js y sprites.js cargados antes.
   Sin módulos ES: todo cuelga del namespace window.BM.
   ============================================================ */
(function () {
  'use strict';

  window.BM = window.BM || {};

  var CFG = window.BM.config;

  // Atajos de configuración
  var COLS = CFG.COLS;
  var ROWS = CFG.ROWS;
  var TILE = CFG.TILE;
  var CANVAS_W = CFG.CANVAS_W;
  var CANVAS_H = CFG.CANVAS_H;
  var PLAYER_SPEED = CFG.PLAYER_SPEED;
  var ENEMY_SPEED = CFG.ENEMY_SPEED;
  var BOMB_FUSE = CFG.BOMB_FUSE;
  var FLAME_TIME = CFG.FLAME_TIME;
  var LEVEL_TIME = CFG.LEVEL_TIME;
  var INVULN_MS = CFG.INVULN_MS;
  var RESPAWN_MS = CFG.RESPAWN_MS;
  var MAX_RANGE = CFG.MAX_RANGE;

  // Utilidades de dirección compartidas por la IA
  var DIRS = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
    { name: 'right', dx: 1, dy: 0 }
  ];

  // ---------- Estado global de la partida ----------
  var canvas = null;
  var ctx = null;

  var state = 'menu'; // menu | playing | paused | dying | levelclear | gameover | victory
  var grid = [];      // grid[y][x] -> 0 vacío, 1 muro, 2 ladrillo
  var hiddenItems = new Map(); // "x,y" -> 'exit'|'bomb'|'flame'|'speed'
  var items = new Map();       // "x,y" -> objeto ya revelado
  var exitPos = null;
  var exitRevealed = false;

  var player = null;
  var enemies = [];
  var bombs = [];
  var flames = new Map(); // "x,y" -> { until, start, kind }
  var crumbles = [];      // { x, y, start }

  var level = 1;
  var score = 0;
  var lives = 3;
  var timer = LEVEL_TIME;
  var lastTickSec = null;

  var now = 0;        // reloj de juego (ms); se congela en pausa
  var lastTs = 0;     // último timestamp real del rAF
  var pausedAt = 0;   // instante de juego en el que se pausó
  var rafId = 0;

  var dirKeys = { up: false, down: false, left: false, right: false };
  var touchDirs = { up: false, down: false, left: false, right: false };

  // ---------- Helpers básicos ----------

  function tileKey(x, y) {
    return x + ',' + y;
  }

  function clamp(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function centerOf(tx, ty) {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  function realNow() {
    if (window.performance && typeof window.performance.now === 'function') {
      return window.performance.now();
    }
    return Date.now();
  }

  // ---------- Construcción de entidades y niveles ----------

  function createPlayer() {
    return {
      x: 1.5 * TILE,
      y: 1.5 * TILE,
      dir: 'down',
      speedMult: 1,
      bombsMax: 1,
      range: 1,
      invulnUntil: 0,
      walkFrame: 0,
      walkTimer: 0,
      dyingStart: 0,
      timerResetOnRespawn: false
    };
  }

  function createEnemy(kind, tx, ty) {
    var d = DIRS[randInt(DIRS.length)];
    var c = centerOf(tx, ty);
    return {
      kind: kind,
      x: c.x,
      y: c.y,
      tx: tx,
      ty: ty,
      dir: { dx: d.dx, dy: d.dy },
      targetTx: tx,
      targetTy: ty,
      targetX: c.x,
      targetY: c.y,
      speed: ENEMY_SPEED[kind],
      waiting: true,
      walkFrame: 0,
      walkTimer: 0
    };
  }

  function buildLevel(n) {
    level = n;
    grid = [];
    hiddenItems = new Map();
    items = new Map();
    exitPos = null;
    exitRevealed = false;
    enemies = [];
    bombs = [];
    flames = new Map();
    crumbles = [];
    timer = LEVEL_TIME;
    lastTickSec = null;

    if (!player) player = createPlayer();
    player.x = 1.5 * TILE;
    player.y = 1.5 * TILE;
    player.dir = 'down';
    player.invulnUntil = 0;
    player.walkFrame = 0;
    player.walkTimer = 0;
    player.dyingStart = 0;
    player.timerResetOnRespawn = false;

    var x, y, i;

    // Borde exterior + pilares interiores en coordenadas pares
    for (y = 0; y < ROWS; y++) {
      var row = [];
      for (x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) {
          row.push(1);
        } else if (x % 2 === 0 && y % 2 === 0) {
          row.push(1);
        } else {
          row.push(0);
        }
      }
      grid.push(row);
    }

    // Zona de spawn siempre libre
    var libreSpawn = {};
    libreSpawn[tileKey(1, 1)] = true;
    libreSpawn[tileKey(2, 1)] = true;
    libreSpawn[tileKey(1, 2)] = true;

    var densidad = n === 1 ? 0.32 : (n === 2 ? 0.40 : 0.45);
    var ladrillos = [];

    for (y = 1; y < ROWS - 1; y++) {
      for (x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== 0) continue;
        if (libreSpawn[tileKey(x, y)]) continue;
        if (Math.random() < densidad) {
          grid[y][x] = 2;
          ladrillos.push({ x: x, y: y });
        }
      }
    }

    // Objetos ocultos bajo ladrillos distintos: salida + 3 powerups
    var tipos = ['exit', 'bomb', 'flame', 'speed'];
    shuffle(ladrillos);
    for (i = 0; i < tipos.length && i < ladrillos.length; i++) {
      hiddenItems.set(tileKey(ladrillos[i].x, ladrillos[i].y), tipos[i]);
    }

    // Enemigos en casillas vacías suficientemente lejos del spawn
    var lista;
    if (n === 1) {
      lista = ['slime', 'slime', 'slime'];
    } else if (n === 2) {
      lista = ['slime', 'slime', 'ghost', 'ghost'];
    } else {
      lista = ['slime', 'slime', 'ghost', 'ghost', 'fast', 'fast'];
    }

    var candidatos = [];
    for (y = 1; y < ROWS - 1; y++) {
      for (x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== 0) continue;
        if (Math.abs(x - 1) + Math.abs(y - 1) < 5) continue;
        candidatos.push({ x: x, y: y });
      }
    }
    shuffle(candidatos);

    for (i = 0; i < lista.length; i++) {
      if (!candidatos.length) break;
      var c = candidatos.pop();
      enemies.push(createEnemy(lista[i], c.x, c.y));
    }

    updateHUD();
  }

  // ---------- Consultas del tablero ----------

  function bombAt(tx, ty) {
    for (var i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (!b.exploded && b.x === tx && b.y === ty) return b;
    }
    return null;
  }

  function playerBombBlocks(tx, ty) {
    for (var i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (!b.exploded && b.x === tx && b.y === ty && !b.passable) return true;
    }
    return false;
  }

  function playerOverlapsTile(tx, ty) {
    var half = 18;
    var l = player.x - half;
    var r = player.x + half;
    var t = player.y - half;
    var b = player.y + half;
    var tl = tx * TILE;
    var tt = ty * TILE;
    return r > tl && l < tl + TILE && b > tt && t < tt + TILE;
  }

  function boxBlocked(cx, cy) {
    var half = 18;
    var l = Math.floor((cx - half) / TILE);
    var r = Math.floor((cx + half - 0.001) / TILE);
    var t = Math.floor((cy - half) / TILE);
    var b = Math.floor((cy + half - 0.001) / TILE);

    for (var ty = t; ty <= b; ty++) {
      for (var tx = l; tx <= r; tx++) {
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
        var v = grid[ty][tx];
        if (v === 1 || v === 2) return true;
        if (playerBombBlocks(tx, ty)) return true;
      }
    }
    return false;
  }

  // ---------- Movimiento del jugador ----------

  function movePlayerAxis(axis, amount, asistirEsquina) {
    if (!amount) return;

    // Asistencia de esquina: si el jugador va casi centrado en el
    // pasillo perpendicular, lo empuja suavemente hacia el centro.
    if (asistirEsquina) {
      if (axis === 'x') {
        var filaCentro = (Math.floor(player.y / TILE) + 0.5) * TILE;
        var offY = filaCentro - player.y;
        if (offY !== 0 && Math.abs(offY) <= 14) {
          var pasoY = Math.min(Math.abs(amount), Math.abs(offY));
          var nudgeY = offY > 0 ? pasoY : -pasoY;
          if (!boxBlocked(player.x, player.y + nudgeY)) {
            player.y += nudgeY;
          }
        }
      } else {
        var colCentro = (Math.floor(player.x / TILE) + 0.5) * TILE;
        var offX = colCentro - player.x;
        if (offX !== 0 && Math.abs(offX) <= 14) {
          var pasoX = Math.min(Math.abs(amount), Math.abs(offX));
          var nudgeX = offX > 0 ? pasoX : -pasoX;
          if (!boxBlocked(player.x + nudgeX, player.y)) {
            player.x += nudgeX;
          }
        }
      }
    }

    var pasos = Math.ceil(Math.abs(amount) / 4);
    if (pasos < 1) pasos = 1;
    var inc = amount / pasos;

    for (var i = 0; i < pasos; i++) {
      var nx = player.x + (axis === 'x' ? inc : 0);
      var ny = player.y + (axis === 'y' ? inc : 0);
      if (boxBlocked(nx, ny)) break;
      player.x = nx;
      player.y = ny;
    }
  }

  function updatePlayer(dt) {
    var dx = 0;
    var dy = 0;

    if (dirKeys.right || touchDirs.right) dx += 1;
    if (dirKeys.left || touchDirs.left) dx -= 1;
    if (dirKeys.down || touchDirs.down) dy += 1;
    if (dirKeys.up || touchDirs.up) dy -= 1;

    var moviendo = dx !== 0 || dy !== 0;

    if (!moviendo) {
      player.walkFrame = 0;
      player.walkTimer = 0;
      return;
    }

    // Dirección visual: prioriza el eje horizontal en diagonales
    if (dx > 0) player.dir = 'right';
    else if (dx < 0) player.dir = 'left';
    else if (dy > 0) player.dir = 'down';
    else if (dy < 0) player.dir = 'up';

    // Velocidad constante también en diagonal
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    var velocidad = PLAYER_SPEED * player.speedMult * dt;
    movePlayerAxis('x', dx * velocidad, dy === 0);
    movePlayerAxis('y', dy * velocidad, dx === 0);

    player.walkTimer += dt;
    if (player.walkTimer >= 0.12) {
      player.walkTimer -= 0.12;
      player.walkFrame = player.walkFrame ? 0 : 1;
    }
  }

  // ---------- Bombas y explosiones ----------

  function placeBomb() {
    if (state !== 'playing' || !player) return;

    var tx = Math.floor(player.x / TILE);
    var ty = Math.floor(player.y / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    if (grid[ty][tx] !== 0) return;
    if (bombAt(tx, ty)) return;

    var activas = 0;
    for (var i = 0; i < bombs.length; i++) {
      if (!bombs[i].exploded) activas++;
    }
    if (activas >= player.bombsMax) return;

    bombs.push({
      x: tx,
      y: ty,
      placedAt: now,
      exploded: false,
      chain: false,
      passable: true,
      range: player.range
    });

    BM.audio.sfx('drop');
  }

  function addFlame(x, y, kind, until, start) {
    var k = tileKey(x, y);
    var prev = flames.get(k);
    if (!prev || prev.until < until) {
      flames.set(k, { until: until, start: start, kind: kind });
    } else if (prev.until === until && kind === 'center') {
      // Un centro siempre manda sobre un brazo que se solape
      prev.kind = 'center';
    }
  }

  function revealUnder(tx, ty) {
    var k = tileKey(tx, ty);
    var kind = hiddenItems.get(k);
    if (!kind) return;

    hiddenItems.delete(k);
    items.set(k, kind);

    if (kind === 'exit') {
      exitRevealed = true;
      exitPos = { x: tx, y: ty };
    }
  }

  function explodeBomb(b, at) {
    if (b.exploded) return;
    b.exploded = true;

    var until = at + FLAME_TIME;
    var rango = b.range;
    var i, j;

    // Centro de la explosión
    addFlame(b.x, b.y, 'center', until, at);

    for (i = 0; i < DIRS.length; i++) {
      var d = DIRS[i];
      var brazo = (d.dx !== 0) ? 'armH' : 'armV';
      var extremo = 'endUp';
      if (d.dy === 1) extremo = 'endDown';
      else if (d.dx === -1) extremo = 'endLeft';
      else if (d.dx === 1) extremo = 'endRight';

      // Primero se calcula hasta dónde llega la llama en esta dirección
      var celdas = [];
      for (j = 1; j <= rango; j++) {
        var tx = b.x + d.dx * j;
        var ty = b.y + d.dy * j;
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) break;
        var bloque = grid[ty][tx];
        if (bloque === 1) break; // el muro corta la llama
        celdas.push({ x: tx, y: ty, ladrillo: bloque === 2 });
        if (bloque === 2) break; // el ladrillo también la corta
      }

      for (j = 0; j < celdas.length; j++) {
        var c = celdas[j];
        var kind = (j === celdas.length - 1) ? extremo : brazo;
        addFlame(c.x, c.y, kind, until, at);

        if (c.ladrillo) {
          grid[c.y][c.x] = 0;
          crumbles.push({ x: c.x, y: c.y, start: at });
          score += 50;
          revealUnder(c.x, c.y);
        }
      }
    }

    BM.audio.sfx('explosion');
  }

  function updateBombs() {
    var i;

    // 1) Cadenas marcadas en el frame anterior
    for (i = 0; i < bombs.length; i++) {
      var bc = bombs[i];
      if (!bc.exploded && bc.chain) explodeBomb(bc, now);
    }

    // 2) Fusibles vencidos
    for (i = 0; i < bombs.length; i++) {
      var bf = bombs[i];
      if (!bf.exploded && now - bf.placedAt >= BOMB_FUSE) {
        explodeBomb(bf, now);
      }
    }

    // 3) Marcar cadenas para el siguiente frame
    for (i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (!b.exploded && !b.chain) {
        var f = flames.get(tileKey(b.x, b.y));
        if (f && f.until > now) b.chain = true;
      }
    }

    // 4) Una bomba es atravesable solo mientras el jugador la pisa
    for (i = 0; i < bombs.length; i++) {
      var bp = bombs[i];
      bp.passable = playerOverlapsTile(bp.x, bp.y);
    }

    // 5) Retirar las bombas ya detonadas
    var vivas = [];
    for (i = 0; i < bombs.length; i++) {
      if (!bombs[i].exploded) vivas.push(bombs[i]);
    }
    bombs = vivas;
  }

  function updateFlames() {
    // Map.forEach permite borrar la entrada actual sin problemas
    flames.forEach(function (f, k) {
      if (f.until <= now) flames.delete(k);
    });
  }

  function flameAt(tx, ty) {
    var f = flames.get(tileKey(tx, ty));
    return !!f && f.until > now;
  }

  // ---------- IA de enemigos ----------

  function enemyCanEnter(e, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    var v = grid[ty][tx];
    if (v === 1) return false;
    if (v === 2 && e.kind !== 'ghost') return false; // ghost atraviesa ladrillos
    if (bombAt(tx, ty)) return false;                // las bombas bloquean a todos
    return true;
  }

  function chooseEnemyDir(e) {
    var i, d;
    var opciones = [];

    for (i = 0; i < DIRS.length; i++) {
      d = DIRS[i];
      if (enemyCanEnter(e, e.tx + d.dx, e.ty + d.dy)) {
        opciones.push(d);
      }
    }

    if (!opciones.length) return null;

    // Mantener la dirección actual si sigue siendo válida
    var actual = null;
    for (i = 0; i < opciones.length; i++) {
      if (opciones[i].dx === e.dir.dx && opciones[i].dy === e.dir.dy) {
        actual = opciones[i];
        break;
      }
    }

    // "fast" es inteligente en intersecciones (3 o más salidas)
    if (e.kind === 'fast' && opciones.length >= 3 && Math.random() < 0.7) {
      var ptx = Math.floor(player.x / TILE);
      var pty = Math.floor(player.y / TILE);
      var mejor = opciones[0];
      var mejorDist = Infinity;

      for (i = 0; i < opciones.length; i++) {
        d = opciones[i];
        var dist = Math.abs((e.tx + d.dx) - ptx) + Math.abs((e.ty + d.dy) - pty);
        if (dist < mejorDist) {
          mejorDist = dist;
          mejor = d;
        }
      }
      return mejor;
    }

    if (actual) return actual;
    return opciones[randInt(opciones.length)];
  }

  function updateEnemies(dt) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];

      // Si acaban de soltar una bomba en su casilla destino, se frena
      if (!e.waiting && bombAt(e.targetTx, e.targetTy)) {
        var centro = centerOf(e.tx, e.ty);
        e.x = centro.x;
        e.y = centro.y;
        e.waiting = true;
        continue;
      }

      // Decide al llegar al centro del tile
      if (e.waiting) {
        var nd = chooseEnemyDir(e);
        if (!nd) continue;

        e.dir.dx = nd.dx;
        e.dir.dy = nd.dy;
        e.targetTx = e.tx + nd.dx;
        e.targetTy = e.ty + nd.dy;
        var destino = centerOf(e.targetTx, e.targetTy);
        e.targetX = destino.x;
        e.targetY = destino.y;
        e.waiting = false;
        e.walkTimer = 0;
      }

      var dx = e.targetX - e.x;
      var dy = e.targetY - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var paso = e.speed * dt;

      if (dist <= paso || dist < 0.0001) {
        // Llega al centro del siguiente tile
        e.x = e.targetX;
        e.y = e.targetY;
        e.tx = e.targetTx;
        e.ty = e.targetTy;
        e.waiting = true;
        e.walkFrame = e.walkFrame ? 0 : 1;
      } else {
        e.x += (dx / dist) * paso;
        e.y += (dy / dist) * paso;
        e.walkTimer += dt;
        if (e.walkTimer >= 0.14) {
          e.walkTimer -= 0.14;
          e.walkFrame = e.walkFrame ? 0 : 1;
        }
      }
    }
  }

  // ---------- Daño, objetos y fin de nivel ----------

  function killPlayer(force) {
    if (state !== 'playing' || !player) return;
    if (!force && now < player.invulnUntil) return;

    state = 'dying';
    player.dyingStart = now;
    lives -= 1;
    BM.audio.sfx('death');
  }

  function finishDying() {
    if (lives > 0) {
      player.x = 1.5 * TILE;
      player.y = 1.5 * TILE;
      player.dir = 'down';
      player.walkFrame = 0;
      player.walkTimer = 0;
      player.dyingStart = 0;
      player.invulnUntil = now + INVULN_MS;

      if (player.timerResetOnRespawn) {
        timer = LEVEL_TIME;
        lastTickSec = null;
        player.timerResetOnRespawn = false;
      }

      state = 'playing';
      updateHUD();
    } else {
      state = 'gameover';
      BM.ui.showOverlay('gameover', {
        title: 'GAME OVER',
        text: 'Puntuación final: ' + score + ' · Nivel alcanzado: ' + level,
        button: 'Reintentar'
      });
      updateHUD();
    }
  }

  function checkFlameDamage() {
    var i;

    // Enemigos alcanzados por cualquier llama activa
    for (i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var etx = Math.floor(e.x / TILE);
      var ety = Math.floor(e.y / TILE);
      if (flameAt(etx, ety)) {
        if (e.kind === 'slime') score += 200;
        else if (e.kind === 'ghost') score += 300;
        else score += 400;
        enemies.splice(i, 1);
      }
    }

    // El jugador muere durante todo el tiempo que dura la llama
    if (state === 'playing') {
      var ptx = Math.floor(player.x / TILE);
      var pty = Math.floor(player.y / TILE);
      if (flameAt(ptx, pty)) killPlayer(false);
    }
  }

  function checkEnemyCollision() {
    if (state !== 'playing') return;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = e.x - player.x;
      var dy = e.y - player.y;
      if (dx * dx + dy * dy < 30 * 30) {
        killPlayer(false);
        return;
      }
    }
  }

  function collectItems() {
    var tx = Math.floor(player.x / TILE);
    var ty = Math.floor(player.y / TILE);
    var k = tileKey(tx, ty);
    if (!items.has(k)) return;

    var kind = items.get(k);
    if (kind === 'exit') return; // la salida se gestiona aparte

    items.delete(k);
    score += 100;
    BM.audio.sfx('powerup');

    if (kind === 'bomb') {
      player.bombsMax = Math.min(8, player.bombsMax + 1);
    } else if (kind === 'flame') {
      player.range = Math.min(MAX_RANGE, player.range + 1);
    } else if (kind === 'speed') {
      player.speedMult = Math.min(2, player.speedMult * 1.15);
    }
    updateHUD();
  }

  function checkExit() {
    if (state !== 'playing') return;
    if (!exitRevealed || !exitPos) return;
    if (enemies.length > 0) return;

    var tx = Math.floor(player.x / TILE);
    var ty = Math.floor(player.y / TILE);
    if (tx !== exitPos.x || ty !== exitPos.y) return;

    score += 500;
    BM.audio.sfx('exit');

    if (level < 3) {
      state = 'levelclear';
      BM.ui.showOverlay('levelclear', {
        title: '¡Nivel superado!',
        text: 'Puntuación: ' + score,
        button: 'Siguiente nivel'
      });
    } else {
      state = 'victory';
      BM.ui.showOverlay('victory', {
        title: '¡VICTORIA!',
        text: 'Has desactivado todas las bombas. Puntuación final: ' + score,
        button: 'Jugar de nuevo'
      });
      BM.audio.sfx('victory');
    }
    updateHUD();
  }

  function updateTimer(dt) {
    if (state !== 'playing') return;

    timer -= dt;
    var sec = Math.ceil(timer);

    if (sec <= 10 && sec > 0 && sec !== lastTickSec) {
      lastTickSec = sec;
      BM.audio.sfx('tick');
    }

    if (timer <= 0) {
      timer = 0;
      updateHUD();
      player.timerResetOnRespawn = true;
      killPlayer(true); // el tiempo agotado ignora la invulnerabilidad
    }
  }

  // ---------- HUD, pausa y overlays ----------

  function updateHUD() {
    BM.ui.updateHUD({
      lives: lives,
      score: score,
      bombs: player ? player.bombsMax : 1,
      range: player ? player.range : 1,
      level: level,
      time: timer
    });
  }

  function shiftWorldTime(ms) {
    if (!ms) return;
    var i;

    for (i = 0; i < bombs.length; i++) bombs[i].placedAt += ms;
    flames.forEach(function (f) {
      f.start += ms;
      f.until += ms;
    });
    for (i = 0; i < crumbles.length; i++) crumbles[i].start += ms;

    if (player) {
      if (player.invulnUntil > 0) player.invulnUntil += ms;
      if (player.dyingStart > 0) player.dyingStart += ms;
    }
  }

  function startGame() {
    lives = 3;
    score = 0;
    level = 1;
    timer = LEVEL_TIME;
    lastTickSec = null;
    player = createPlayer();

    buildLevel(1);

    BM.ui.hideOverlay();
    state = 'playing';

    try {
      BM.audio.init();
    } catch (e) {
      /* silencioso */
    }
    updateHUD();
  }

  function togglePause() {
    if (state === 'playing') {
      pausedAt = now;
      state = 'paused';
      BM.ui.showOverlay('pause', {
        title: 'PAUSA',
        text: 'Pulsa continuar o P',
        button: 'Continuar'
      });
    } else if (state === 'paused') {
      var delta = realNow() - pausedAt;
      if (delta > 0) shiftWorldTime(delta);
      state = 'playing';
      BM.ui.hideOverlay();
    }
  }

  function overlayAction() {
    if (state === 'menu') {
      startGame();
    } else if (state === 'levelclear') {
      var siguiente = level + 1;
      buildLevel(siguiente);
      BM.ui.hideOverlay();
      state = 'playing';
      try {
        BM.audio.init();
      } catch (e) {
        /* silencioso */
      }
    } else if (state === 'victory' || state === 'gameover') {
      startGame();
    } else if (state === 'paused') {
      togglePause();
    }
  }

  // ---------- Entrada ----------

  function placeBombSafe() {
    if (state === 'playing') placeBomb();
  }

  function onKeyDown(ev) {
    var k = ev.key;
    var code = ev.code || '';

    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' ||
        k === 'ArrowRight' || k === ' ' || code === 'Space') {
      ev.preventDefault();
    }

    if (k === 'ArrowUp' || k === 'w' || k === 'W' || code === 'ArrowUp') {
      dirKeys.up = true;
    } else if (k === 'ArrowDown' || k === 's' || k === 'S' || code === 'ArrowDown') {
      dirKeys.down = true;
    } else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || code === 'ArrowLeft') {
      dirKeys.left = true;
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || code === 'ArrowRight') {
      dirKeys.right = true;
    }

    if ((k === ' ' || code === 'Space' || k === 'Enter' || code === 'Enter') && !ev.repeat) {
      placeBombSafe();
    }

    if ((k === 'p' || k === 'P') && !ev.repeat) {
      togglePause();
    }

    if ((k === 'm' || k === 'M') && !ev.repeat) {
      BM.audio.toggleMuted();
      BM.ui.setMuteLabel(BM.audio.isMuted());
    }
  }

  function onKeyUp(ev) {
    var k = ev.key;
    var code = ev.code || '';

    if (k === 'ArrowUp' || k === 'w' || k === 'W' || code === 'ArrowUp') {
      dirKeys.up = false;
    } else if (k === 'ArrowDown' || k === 's' || k === 'S' || code === 'ArrowDown') {
      dirKeys.down = false;
    } else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || code === 'ArrowLeft') {
      dirKeys.left = false;
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || code === 'ArrowRight') {
      dirKeys.right = false;
    }
  }

  function clearTouchDirs() {
    touchDirs.up = false;
    touchDirs.down = false;
    touchDirs.left = false;
    touchDirs.right = false;
  }

  function attachInput() {
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state === 'playing') togglePause();
    });

    var tc = document.getElementById('touch-controls');
    if (!tc) return;

    tc.addEventListener('pointerdown', function (ev) {
      var target = ev.target;
      var dirBtn = target && target.closest ? target.closest('[data-dir]') : null;

      if (dirBtn) {
        ev.preventDefault();
        var d = dirBtn.getAttribute('data-dir');
        if (d && touchDirs.hasOwnProperty(d)) touchDirs[d] = true;
      } else if (target && target.id === 'touch-bomb') {
        ev.preventDefault();
        placeBombSafe();
      }
    }, false);

    tc.addEventListener('pointerup', clearTouchDirs, false);
    tc.addEventListener('pointerleave', clearTouchDirs, false);
    tc.addEventListener('pointercancel', clearTouchDirs, false);
    window.addEventListener('pointerup', clearTouchDirs, false);
    window.addEventListener('pointercancel', clearTouchDirs, false);
  }

  // ---------- Bucle lógico ----------

  function update(dt) {
    if (state === 'playing') {
      updateTimer(dt);
      if (state !== 'playing') return; // murió por tiempo agotado

      updatePlayer(dt);
      collectItems();
      checkExit();
      if (state !== 'playing') return;

      updateBombs();
      updateFlames();
      checkFlameDamage();
      if (state !== 'playing') return;

      updateEnemies(dt);
      checkEnemyCollision();
    } else if (state === 'dying') {
      // El mundo sigue vivo, pero el jugador no se controla
      updateBombs();
      updateFlames();
      checkFlameDamage();
      updateEnemies(dt);

      if (now - player.dyingStart >= RESPAWN_MS) {
        finishDying();
      }
    }

    // Limpieza de la animación de ladrillos rotos
    var vigentes = [];
    for (var i = 0; i < crumbles.length; i++) {
      if (now - crumbles[i].start < FLAME_TIME) {
        vigentes.push(crumbles[i]);
      }
    }
    crumbles = vigentes;
  }

  // ---------- Render ----------

  function render() {
    if (!ctx) return;

    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var x, y, i, px, py;
    var mostrarActores = state !== 'menu';

    // 1) Suelo (paridad x+y para alternar dos tonos)
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        BM.sprites.drawFloor(ctx, x * TILE, y * TILE, x, y);
      }
    }

    // 2) Muros y ladrillos
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        if (grid[y][x] === 1) {
          BM.sprites.drawWall(ctx, x * TILE, y * TILE);
        } else if (grid[y][x] === 2) {
          BM.sprites.drawBrick(ctx, x * TILE, y * TILE);
        }
      }
    }

    // 3) Animación de ladrillos destruidos
    for (i = 0; i < crumbles.length; i++) {
      var c = crumbles[i];
      var tc = clamp((now - c.start) / FLAME_TIME, 0, 1);
      BM.sprites.drawCrumbling(ctx, c.x * TILE, c.y * TILE, tc);
    }

    if (!mostrarActores) return;

    // 4) Objetos revelados (salida y powerups)
    items.forEach(function (kind, k) {
      var partes = k.split(',');
      var ix = parseInt(partes[0], 10);
      var iy = parseInt(partes[1], 10);
      px = ix * TILE;
      py = iy * TILE;

      if (kind === 'exit') {
        BM.sprites.drawExit(ctx, px, py);
      } else {
        BM.sprites.drawPowerup(ctx, px, py, kind);
      }
    });

    // 5) Llamas activas
    flames.forEach(function (f, k) {
      if (f.until <= now) return;
      var partes = k.split(',');
      var fx = parseInt(partes[0], 10);
      var fy = parseInt(partes[1], 10);
      var tf = clamp((now - f.start) / FLAME_TIME, 0, 1);
      BM.sprites.drawFlame(ctx, fx * TILE, fy * TILE, f.kind, tf);
    });

    // 6) Bombas
    for (i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (b.exploded) continue;
      var restante = BOMB_FUSE - (now - b.placedAt);
      var progreso = clamp((now - b.placedAt) / BOMB_FUSE, 0, 1);
      var pulsando = restante < 800;
      BM.sprites.drawBomb(ctx, b.x * TILE, b.y * TILE, progreso, pulsando);
    }

    // 7) Enemigos
    var ptx = Math.floor(player.x / TILE);
    var pty = Math.floor(player.y / TILE);

    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var etx = Math.floor(e.x / TILE);
      var ety = Math.floor(e.y / TILE);
      var enfadado = (etx === ptx && Math.abs(ety - pty) <= 3) ||
                     (ety === pty && Math.abs(etx - ptx) <= 3);

      BM.sprites.drawEnemy(
        ctx,
        e.x - TILE / 2,
        e.y - TILE / 2,
        e.kind,
        e.walkFrame,
        enfadado
      );
    }

    // 8) Jugador
    if (state === 'dying') {
      var td = clamp((now - player.dyingStart) / RESPAWN_MS, 0, 1);
      BM.sprites.drawPlayerDying(ctx, player.x - TILE / 2, player.y - TILE / 2, td);
    } else {
      var parpadea = now < player.invulnUntil && Math.floor(now / 100) % 2 === 0;
      if (!parpadea) {
        BM.sprites.drawPlayer(
          ctx,
          player.x - TILE / 2,
          player.y - TILE / 2,
          player.dir,
          player.walkFrame
        );
      }
    }
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);

    var real = (typeof ts === 'number') ? ts : realNow();

    // El reloj de juego se congela mientras el overlay de pausa está visible
    if (state !== 'paused') now = real;

    var dt = lastTs ? (real - lastTs) / 1000 : 0;
    lastTs = real;
    if (dt > 0.05) dt = 0.05; // clamp anti-saltos
    if (dt < 0) dt = 0;

    update(dt);
    render();
    updateHUD();
  }

  // ---------- Arranque ----------

  function init() {
    canvas = document.getElementById('game');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;

    buildLevel(1);
    state = 'menu';

    BM.ui.showOverlay('menu', {
      title: 'BOMBERMAN',
      text: 'Flechas/WASD mover · ESPACIO bomba · P pausa · M sonido. Elimina a todos los enemigos y alcanza la salida.',
      button: 'Jugar'
    });

    try {
      BM.audio.init();
      BM.audio.sfx('menu');
    } catch (e) {
      /* silencioso */
    }

    if (window.BM.audio && typeof BM.audio.isMuted === 'function') {
      BM.ui.setMuteLabel(BM.audio.isMuted());
    } else {
      BM.ui.setMuteLabel(false);
    }

    attachInput();
    updateHUD();

    lastTs = 0;
    rafId = requestAnimationFrame(loop);
  }

  // API pública exigida por ui.js
  window.BM.main = {
    startGame: startGame,
    overlayAction: overlayAction,
    togglePause: togglePause
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
