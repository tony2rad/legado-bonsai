# Legado Bonsai — sitio web

Sitio estático de dos páginas (`index.html` + `catalogo.html`, con `styles.css` y `script.js` compartidos, sin build ni framework) para una tienda de bonsáis (junípero) en Ecuador, con identidad de marca japonesa (家族の木 — "árbol de familia").

## Estructura

- [index.html](index.html) — portada narrativa: header, hero, marca, estilos, **catálogo resumido** (carrusel "Destacados" de 8 + CTA con conteo hacia `catalogo.html`), acompañamiento, talleres, calendario lunar, proceso, testimonios, blog, modal de producto, carrito, popup newsletter, chat FAQ.
- [catalogo.html](catalogo.html) — catálogo completo: barra pegajosa con buscador, chips por estilo, ambiente y orden; cuadrícula densa paginada con "Ver más" (16 por lote); mismo modal/carrito/chat. Acepta enlaces profundos `?estilo=…&q=…`.
- [styles.css](styles.css) — todos los estilos (paleta jade/kohaku, tipografías Shippori Mincho + Zen Kaku Gothic New, motivos washi/seigaiha/ensō).
- [script.js](script.js) — toda la lógica de la tienda, compartida por ambas páginas: cada bloque de init se registra con `on(id, evt, fn)` / `$()` y se omite si el elemento no existe en esa página. Las fotos se cargan de forma perezosa (`loadProductImages`) solo para tarjetas visibles o el modal abierto.
- `materiales/` — material de apoyo para clientes (guía de cuidado en HTML + PDF generado con Chrome headless, íconos de Flaticon con atribución).
- `assets/img/` — logos.
- `imagenes/360/<Carpeta>/` — fotos 360° por producto, nombradas `<carpeta_lower>_01.jpg`, `_02.jpg`, etc.
- `Informacion/` — documentos internos de marca/estrategia (manual de marca, medidas de redes, etc.), **excluidos del repo** vía `.gitignore`; no forman parte del sitio publicado.

No hay carpeta `data/` con contenido ni backend propio: el catálogo vive fuera del repo.

- [config.js](config.js) — **único archivo de configuración** (URL del Web App, CSV de respaldo, WhatsApp). Lo cargan index, catalogo y admin antes de su script.
- `admin/` — **app de registro** (PWA móvil, `index.html` + `admin.css` + `admin.js` como módulo ES). Captura fotos (modo 360° automático con cámara + base giratoria, o selección), redimensiona a 1200 px, quita fondo opcionalmente con `@imgly/background-removal` (cargado bajo demanda desde jsdelivr), sube a Drive vía la API y registra ejemplares, ventas, cuidados y materiales. Guarda URL + token en `localStorage` (`legadoAdminCfg`). No comparte CSS con la tienda (solo la paleta).
- `apps-script/` — backend: `Code.gs` (se pega en el Apps Script del Sheet "Legado Bonsai — Sistema de Gestión") + `INSTALACION.md`. `setup()` normaliza el sheet sin borrar datos; `doGet` sirve el catálogo público, `doPost` (con token) escribe.
- `docs/ESTRUCTURA_DATOS.md` — diccionario de datos, diagrama del flujo y tareas de limpieza de los sheets antiguos.

## Catálogo: fuente de datos

El inventario **no está hardcodeado**. `loadCatalogRows()` en [script.js](script.js) intenta primero `API_URL` (JSON del Web App: solo ejemplares con `Estado comercial = Disponible`) y, si falla o está vacía, `SHEET_CSV_URL`. `normalizeProduct` acepta encabezados de la tienda o del Sheet de gestión a través de `campo('Nombre','Nombre comercial')`, etc.; mantener ese patrón al agregar campos. El `id` del producto es el `ID` del Sheet (`LB-0001`) cuando existe.

Fotos: si la fila trae `Fotos` (URLs separadas por coma, escritas por la app), se usan tal cual en orden. Si no, se autodetectan en `imagenes/360/<Carpeta imagen | Imagen>/<carpeta_lower>_01.jpg` .. `_12.jpg` con `<img>.onerror`. Las carpetas locales deben respetar mayúsculas (GitHub Pages distingue `Bonsai5` de `bonsai5`).

Para agregar/editar productos: desde `admin/` en el teléfono, o editando el Sheet a mano (no el código).

## Backend (Apps Script)

- Una sola pestaña maestra `INVENTARIO`; `CATALOGO` es una fórmula FILTER sobre ella; `RESUMEN` son fórmulas. Los nombres de columna del Sheet son la API: si se renombra una columna hay que actualizar `ESQUEMA` en `Code.gs` (con alias para no perder datos) y los `campo()` de `script.js`.
- POST se envía como `text/plain` para evitar el preflight CORS (Apps Script no responde OPTIONS). `redirect: 'follow'` es obligatorio.
- Las fotos van a Drive (`Legado Bonsai — Fotos 360/<ID>/`), públicas por enlace; la URL se construye en `urlFoto_()` (`lh3.googleusercontent.com/d/<id>`). Si ese host cambia, es el único lugar que tocar (y regenerar la columna `Fotos`).
- IDs `LB-####` correlativos asignados en `siguienteId_()`; nunca reutilizar.

## Carrito y checkout

Carrito en `localStorage` (`legadoBonsaiCart`). No hay pasarela de pago ni backend: el checkout arma un mensaje de texto con el pedido y lo abre en WhatsApp (`WHATSAPP_NUMBER` en [script.js:20](script.js:20)). El formulario de contacto del footer abre un `mailto:` en vez de enviar a un servidor.

## Convenciones

- Todo el copy es en español; los acentos de identidad japonesa (kanji + romaji) aparecen como texto decorativo junto a títulos de sección.
- Sin build step: los cambios se ven recargando el navegador directamente (o con el server estático `.claude/static-server.ps1`, puerto 5500, registrado en `.claude/launch.json` como `legado-bonsai`, porque la máquina no tiene Python ni Node; sirve `index.html` en carpetas, necesario para `/admin/`).
- `admin/` necesita HTTPS (o localhost) para la cámara; en GitHub Pages funciona. La página tiene `noindex`.
- El markup de modal, carrito y chat está duplicado en `index.html` y `catalogo.html` (sitio estático sin plantillas): un cambio en esos bloques hay que replicarlo en ambos archivos.
- Los chips de estilo del catálogo se generan desde la columna `Estilo` del Sheet; si la columna está vacía solo aparece "Todos".
- Mantener el patrón "si falta el dato en el Sheet, usar texto genérico razonable" al tocar `normalizeProduct` — no romper la ficha por columnas ausentes.
