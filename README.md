# 💣 Bomberman · Demo HTML5

Clon de Bomberman completo escrito en HTML5 + JavaScript puro, **sin frameworks ni dependencias**. Todo el juego vive bajo un único namespace `window.BM` (`BM.config`, `BM.audio`, `BM.ui`, `BM.sprites`, `BM.main`) y funciona abriendo `index.html` con doble clic (`file://`): no hay assets externos — los sprites son pixel-art procedural dibujado en `<canvas>` y los efectos de sonido se sintetizan con WebAudio.

---

## Cómo jugar

Abre `index.html` directamente en el navegador. **No requiere servidor, build ni instalación.**

| Acción | Tecla / control |
| --- | --- |
| Moverse | Flechas o `W` `A` `S` `D` |
| Soltar bomba | `ESPACIO` o `ENTER` |
| Pausa | `P` |
| Silenciar / activar sonido | `M` |
| Móvil / tablet | Cruceta táctil + botón 💣 |

**Objetivo:** elimina a todos los enemigos de cada nivel y alcanza la puerta de salida que se revela al romper ladrillos.

- 3 niveles con dificultad creciente (más ladrillos y enemigos: slime, ghost y fast).
- Las bombas **encadenan explosiones**: una llama que toca otra bomba la detona al instante.
- Los ladrillos esconden **power-ups** (💣 bomba extra, 🔥 alcance de llama, ⚡ velocidad) y la **salida**.
- Empiezas con **3 vidas** y tienes **200 s por nivel**; al agotarse el tiempo o perder las 3 vidas, fin de partida.

---

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura DOM: HUD, `<canvas>`, controles táctiles y overlay de menús. |
| `css/style.css` | Estilos del HUD, el overlay y la cruceta táctil (responsive). |
| `src/config.js` | Constantes del juego (`BM.config`): tablero, velocidades, tiempos, nivel. |
| `src/main.js` | Núcleo (`BM.main`): bucle de juego, física de grid, IA de enemigos, bombas/llamas, construcción de niveles, puntuación y estados. |
| `src/ui.js` | HUD y overlays (`BM.ui`), wiring de botones de menú, pausa y mute. |
| `src/audio.js` | SFX 100 % procedurales con WebAudio (`BM.audio`), sin ficheros de audio. |
| `src/sprites.js` | Pixel-art procedural dibujado en canvas (`BM.sprites`), sin imágenes. |

**Orden de carga** (definido al final de `index.html`; importa, porque cada módulo registra su parte en `window.BM`):

1. `src/config.js` — crea `window.BM` y sus constantes.
2. `src/audio.js`
3. `src/ui.js`
4. `src/sprites.js`
5. `src/main.js` — arranca el juego al cargar.

`src/main.js` consume las constantes de `BM.config` y delega dibujo, sonido y HUD en `BM.sprites`, `BM.audio` y `BM.ui`; los módulos se referencian con guards en tiempo de ejecución para no romperse por el orden.

---

## Despliegue

Es un sitio 100 % estático: basta con publicar la carpeta `Bomberman` tal cual (sin comando de build), igual que la carpeta `Landpage`.

- **Netlify Drop:** arrastra la carpeta `Bomberman` a <https://app.netlify.com/drop>.
- **GitHub Pages:** sube el contenido a una rama y activa Pages desde la raíz (`/`).
- **Vercel:** importa el repositorio como proyecto estático y publica la raíz, sin framework.

---

## Ajustes rápidos

Constantes editables en `src/config.js`:

| Constante | Efecto | Valor por defecto |
| --- | --- | --- |
| `PLAYER_SPEED` | Velocidad del jugador (px/s) | `240` |
| `BOMB_FUSE` | Mecha de la bomba (ms) | `2200` |
| `FLAME_TIME` | Duración de las llamas (ms) | `450` |
| `LEVEL_TIME` | Tiempo por nivel (s) | `200` |

Otros ajustes útiles en el mismo archivo: `COLS`/`ROWS`/`TILE` (tamaño del tablero), `ENEMY_SPEED` (velocidad por tipo de enemigo), `INVULN_MS`, `RESPAWN_MS` y `MAX_RANGE`.

La **densidad de ladrillos** (`0.32`, `0.40`, `0.45`) y la **lista/número de enemigos por nivel** están en `buildLevel(n)` de `src/main.js`.
