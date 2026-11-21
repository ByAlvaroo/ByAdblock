# ByAdBlock

YouTube limpio, sin anuncios y sin esperas, en **iPad (Safari)** y en **PC (Chrome, Edge, Brave, Firefox)**.
Funciona sobre el YouTube de verdad: tu cuenta, tus suscripciones y la interfaz de siempre.

**HECHO POR @BYALVARO__**

---

## La app (app/)

**https://byalvaroo.github.io/ByAdblock/app/** — misma interfaz que YTVOD, con todo YouTube:

- **Buscar** vídeos y canales (pestañas Todo / Vídeos / Canales). También puedes pegar un enlace de YouTube.
- **Canales**: cabecera, todos sus vídeos (con «Cargar más») y buscador dentro del canal.
- **Ver vídeo**: reproductor, descripción con enlaces y minutos que se pueden pulsar, «Más del canal», compartir y abrir en YouTube. Recuerda por dónde ibas.
- **Inicio sin «Para ti»**: *Seguir viendo*, *Tus canales* y *Novedades* (lo último de los canales que sigues). Con la cuenta de Google conectada, también *Vídeos que te gustan*.
- **Seguir canales** sin cuenta (botón «Seguir»), o **traer tus suscripciones** de Google. Menú → Exportar/Importar canales para pasarlos entre dispositivos.
- Tema claro/oscuro, instalable en iPad, iPhone, Android y PC.

**Importante:** los vídeos se reproducen con el **reproductor oficial de YouTube incrustado** (la única forma permitida en una app web). Ese reproductor puede poner anuncios en algunos vídeos y ninguna web puede quitarlos. Para cero anuncios, usa YouTube en Safari/Chrome con la extensión ByAdBlock.

**Cuota**: la clave gratis da 10.000 unidades al día. Una búsqueda gasta 100 (≈ 95 búsquedas al día); abrir canales, vídeos y novedades gasta 1 por petición. Las búsquedas se guardan 12 h para no repetir gasto. Si se acaba, se renueva a las 9:00 (hora de España); en Menú → «Clave de YouTube propia» puedes poner otra.

### Cuenta de Google (opcional)

1. [console.cloud.google.com](https://console.cloud.google.com) → el mismo proyecto de tu clave → **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, déjala en modo *Prueba* y añade tu Gmail en *Usuarios de prueba*.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. En **URI de redirección autorizados** añade exactamente `https://byalvaroo.github.io/ByAdblock/app/` (y `http://localhost:47821/app/` si quieres probar en local).
4. Copia el **ID de cliente** en `app/config.js` → `oauthClientId: '…apps.googleusercontent.com'` y haz push.

El inicio de sesión es por redirección (no ventana emergente), así que funciona también en la app añadida a la pantalla de inicio. Es de solo lectura. El permiso dura 1 hora: las suscripciones se quedan guardadas, y para refrescarlas o ver tus «me gusta» se vuelve a pulsar en tu cuenta.

### Probar la app sin gastar cuota

```bash
python -m http.server 47821      # en la carpeta ByAdBlock
# abre http://localhost:47821/app/?mock
```

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página de instalación (GitHub Pages) |
| `app/` | La app ByAdBlock (interfaz tipo YTVOD, todo YouTube) |
| `byadblock.user.js` | ByAdBlock como userscript: iPad (app Userscripts), Tampermonkey, Violentmonkey |
| `extension/` | ByAdBlock como extensión MV3 para Chrome, Edge, Brave y Firefox |
| `ByAdBlock-extension.zip` | La carpeta `extension/` comprimida, para descargar desde la página |
| `rules.json` | **Reglas remotas**: lo que cambies aquí les llega a todos en menos de 3 horas |
| `src/core.js` | El código de verdad. Todo lo demás se genera a partir de aquí |
| `build.js` | Genera `byadblock.user.js` y `extension/` desde `src/` |
| `test/test.js` | Pruebas automáticas del núcleo |

## Subirlo a GitHub y abrirlo en el iPad

1. Crea en GitHub un repositorio público llamado **`ByAdblock`** en tu cuenta **ByAlvaroo** (el nombre importa: las URLs de actualización apuntan a `ByAlvaroo/ByAdblock`).
2. Sube todo el contenido de esta carpeta a la rama `main`.
3. En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En un par de minutos la página estará en **https://byalvaroo.github.io/ByAdblock/**.
5. Ábrela en el Safari del iPad y sigue los pasos de la pestaña «iPad / iPhone».

> Si usas otro nombre de usuario o de repositorio, cambia `ByAlvaroo/ByAdblock` en `src/core.js`, `src/rules-loader.js`, `src/userscript-header.txt` y `build.js`, y ejecuta `node build.js`.

## Por qué así y no como «app» de la pantalla de inicio

- Una web no puede meter youtube.com dentro y modificarla: YouTube lo impide y el navegador lo bloquea.
- En iPad, Apple **no ejecuta extensiones de Safari** en las webs añadidas a la pantalla de inicio.
- Por eso ByAdBlock va como extensión de Safari (vía la app gratuita *Userscripts*) sobre el YouTube real. Para tener un icono en el inicio, la página explica cómo crear un atajo que abre YouTube en Safari.

## Cómo funciona (resumen técnico)

Todo corre dentro de la página de YouTube, en el mundo `MAIN`, **antes** que el código de YouTube (`document-start`):

1. **Poda del JSON**. Envuelve `JSON.parse`, `Response.prototype.json` y las variables `ytInitialPlayerResponse` / `ytInitialData` / `ytInitialReelWatchSequenceResponse`. Borra `adPlacements`, `playerAds`, `adSlots` y quita de las listas los elementos de anuncio (`adSlotRenderer`, `promotedSparklesWebRenderer`, `statementBannerRenderer`, anuncios de Shorts con `adClientParams`…). El reproductor nunca ve el anuncio.
2. **Petición sin anuncios**. Añade `"isInlinePlaybackNoAd":true` al `contentPlaybackContext` de las peticiones a `/youtubei/v1/player` (vía `JSON.stringify`, `fetch` y `Object.assign` por si YouTube bloquea `JSON.stringify` con su «locker script»). Así el servidor no manda anuncios ni el castigo de buffering falso.
3. **Red de seguridad**. Si aun así aparece un anuncio (por ejemplo, cosido al vídeo con SSAP), lo silencia, lo pone a 16× y pulsa «Saltar». No salta con `currentTime` para no arriesgarse a saltar el vídeo real.
4. **CSS cosmético**: cada selector en su propia regla, para que uno no soportado no anule los demás.
5. **Aviso de bloqueador**: borra `enforcementMessageViewModel` del JSON y, si llega a pintarse, quita el diálogo y reanuda el vídeo.
6. **Reglas remotas**: cada 3 horas como mucho descarga `rules.json` de este repositorio y lo guarda; se aplica en la siguiente carga de página. En la extensión lo hace también un script aparte fuera de la CSP de YouTube.

Lo que **no** hace, a propósito:

- No bloquea peticiones de red. Desde mayo de 2026 YouTube da error si no llega ninguna petición a `/api/stats/qoe`, así que bloquear de más delata.
- No usa `innerHTML` (YouTube exige Trusted Types).
- Las funciones envueltas son `Proxy` de las nativas, así que `toString()` sigue diciendo `[native code]`.

## Cuando YouTube cambie algo

1. Mira qué ha cambiado (consola del navegador en PC: escribe `__bab()` para ver versión y estado).
2. Si basta con una clave, un renderer o un selector nuevo: **edita `rules.json`** y súbelo. Ejemplo:
   ```json
   {
     "version": 2,
     "adRenderers": ["nuevoAnuncioRenderer"],
     "cosmetic": ["ytd-nuevo-anuncio"],
     "disable": ["adSlots"]
   }
   ```
   Sube siempre `version`. Llega a todos sin reinstalar.
3. Si hace falta cambiar código: edita `src/core.js`, sube `VERSION`, ejecuta `node build.js` y `node test/test.js`, y sube los cambios. El userscript se actualiza solo (`@updateURL`); la extensión descomprimida hay que recargarla en `chrome://extensions`.

## Desarrollo

```bash
node build.js        # genera byadblock.user.js y extension/
node test/test.js    # pruebas del núcleo
```

Para regenerar el zip de la extensión: comprime la carpeta `extension/` como `ByAdBlock-extension.zip`.

## Avisos

- Chrome puede mostrar al arrancar un aviso sobre extensiones en modo desarrollador. Es normal con extensiones que no vienen de la tienda; pulsa en cerrar, no en desactivar.
- Usa un solo bloqueador en YouTube. Varios a la vez se pisan y hacen saltar la detección.
- Ningún bloqueador garantiza el 100 % para siempre. ByAdBlock está hecho para que los arreglos lleguen en horas, sin reinstalar.

---

ByAdBlock · **HECHO POR @BYALVARO__**
