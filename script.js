/* ==========================================================================
   Legado Bonsai — lógica de la tienda
   Fuente de inventario (en este orden, ver config.js):
     1. API_URL       -> Web App de Apps Script (apps-script/Code.gs) que
                         devuelve JSON con los ejemplares "Disponible" y
                         "En formación" (preventa) de la pestaña INVENTARIO.
     2. SHEET_CSV_URL -> respaldo: pestaña CATALOGO publicada como CSV.
   Ambas fuentes entregan filas con los encabezados del Sheet. Cada campo
   acepta varios nombres de columna (ver `campo()` en normalizeProduct), así
   la hoja puede usar "Nombre comercial" o "Nombre", "Altura (cm)" o "Altura".
   Campos OPCIONALES que enriquecen la ficha (si faltan, texto genérico):
     Estilo, EstiloJP / Estilo JP, Especie, Ambiente, Historia, Ventilacion,
     Poda, Trasplante, Alambrado, Stock, Destacado, Estado comercial,
     Entrega estimada.
   Fotos: columna `Fotos` (URLs separadas por coma, subidas por la app de
   registro a Drive) o, como respaldo, carpeta local imagenes/360/<Imagen>/.

   Carrito: tres tipos de línea — árbol (con plan opcional), plan suelto
   (para un árbol que el cliente ya tiene) y extra (kits). Código de
   referido/descuento validado contra la API. Checkout = mensaje de WhatsApp.
   Analítica: eventos anónimos a la pestaña EVENTOS (sin cookies ni datos
   personales) para el embudo de ventas.
   ========================================================================== */

const CFG = window.LEGADO_CONFIG || {};
const WHATSAPP_NUMBER = CFG.WHATSAPP_NUMBER || '593988731431';
const API_URL = CFG.API_URL || '';
const SHEET_CSV_URL = CFG.SHEET_CSV_URL || '';
const LOCAL_IMAGES_PATH = CFG.LOCAL_IMAGES_PATH || 'imagenes/360/';
const NEWSLETTER_FORM_ACTION = CFG.NEWSLETTER_FORM_ACTION || '';
const NEWSLETTER_EMAIL_ENTRY = CFG.NEWSLETTER_EMAIL_ENTRY || '';
const PLANES = CFG.PLANES || [];
const EXTRAS = CFG.EXTRAS || [];
const PREVENTA = Object.assign({ anticipoPct: 30, mostrar: true }, CFG.PREVENTA || {});
const REFERIDOS = Object.assign({ descuentoPct: 10, creditoReferente: 10, codigoNewsletter: 'LEGADO10' }, CFG.REFERIDOS || {});
const SITE_URL = (CFG.SITE_URL || '').replace(/\/$/, '');
const CART_KEY = 'legadoBonsaiCart';
const CODE_KEY = 'legadoBonsaiCodigo';

let PRODUCTS = [];
let cart = loadCart();
let codigoAplicado = loadCodigo();

/* -------------------------------------------------------------------- */
/*  Utilidades                                                           */
/* -------------------------------------------------------------------- */

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => headers.reduce((obj, h, idx) => { obj[h] = (r[idx] || '').trim(); return obj; }, {}));
}

function parsePrice(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function money(n) {
  return '$' + n.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function slugify(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function pad2(n) { return String(n).padStart(2, '0'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const $ = (id) => document.getElementById(id);
/* Registra un listener solo si el elemento existe: el mismo script sirve a
   index.html (portada) y catalogo.html (catálogo completo). */
function on(id, evt, fn) { const el = $(id); if (el) el.addEventListener(evt, fn); }
function normalizeText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function planPorNombre(nombre) { return PLANES.find(p => p.nombre === nombre) || null; }
function precioPlan(nombre) { const p = planPorNombre(nombre); return p ? p.precio : 0; }
function anticipoDe(precio) { return Math.round(precio * PREVENTA.anticipoPct / 100 * 100) / 100; }
function urlPasaporte(id) { return (SITE_URL || '.') + '/arbol.html?id=' + encodeURIComponent(id); }

/* -------------------------------------------------------------------- */
/*  Analítica anónima (pestaña EVENTOS)                                  */
/* -------------------------------------------------------------------- */

const SESSION_KEY = 'legadoBonsaiSesion';
function sesionId() {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) { s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); sessionStorage.setItem(SESSION_KEY, s); }
    return s;
  } catch { return 'na'; }
}
function referencia() {
  const u = new URLSearchParams(location.search);
  const utm = u.get('utm_source') || u.get('ref');
  if (utm) return utm.slice(0, 40);
  try { const h = document.referrer ? new URL(document.referrer).hostname : ''; return h && h !== location.hostname ? h : ''; } catch { return ''; }
}
/* Envía un evento sin esperar respuesta. sendBeacon manda text/plain, que es
   justo lo que Apps Script acepta sin preflight. Nunca datos personales. */
function track(evento, datos = {}) {
  if (!CFG.ANALITICA || !API_URL) return;
  const cuerpo = JSON.stringify({ action: 'evento', payload: Object.assign({
    evento, pagina: location.pathname.split('/').pop() || 'index.html', sesion: sesionId(), ref: referencia()
  }, datos) });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(API_URL, new Blob([cuerpo], { type: 'text/plain;charset=utf-8' }));
    else fetch(API_URL, { method: 'POST', body: cuerpo, keepalive: true, redirect: 'follow' }).catch(() => {});
  } catch { /* la analítica nunca rompe la tienda */ }
}

/* -------------------------------------------------------------------- */
/*  Carga e interpretación del catálogo                                  */
/* -------------------------------------------------------------------- */

/* Intenta la API (JSON) y, si falla o no está configurada, el CSV publicado. */
async function loadCatalogRows() {
  const errores = [];
  if (API_URL) {
    try {
      const res = await fetch(API_URL + (API_URL.includes('?') ? '&' : '?') + 'action=catalogo', { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
      return data.productos || [];
    } catch (err) { errores.push('API: ' + err.message); }
  }
  if (SHEET_CSV_URL) {
    try {
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return parseCsv(await res.text());
    } catch (err) { errores.push('CSV: ' + err.message); }
  }
  throw new Error(errores.length ? errores.join(' | ') : 'Sin fuente de catálogo configurada (config.js)');
}

async function fetchCatalog() {
  const statusEl = document.getElementById('catalog-status');
  try {
    const rows = await loadCatalogRows();
    if (!rows.length) throw new Error('Catálogo vacío');
    let products = rows.map((row, i) => normalizeProduct(row, i));
    if (!PREVENTA.mostrar) products = products.filter(p => !p.preventa);
    PRODUCTS = products;
    if (statusEl) statusEl.hidden = true;
    if ($('carousel-track')) renderCarousel();
    if ($('catalog-cta')) renderCatalogCta();
    if ($('product-grid')) {
      renderStyleChips();
      applyCatalogUrlParams();
      renderCatalog();
    }
    renderCart(); // las sugerencias de kits dependen de si hay árboles en el carrito
  } catch (err) {
    console.error('No se pudo cargar el catálogo:', err);
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.innerHTML = 'No pudimos cargar el catálogo en este momento. ' +
      '<a href="https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent('Hola, quiero ver los junípero disponibles') + '" target="_blank" rel="noopener" style="color:var(--kohaku); font-weight:700;">Escríbenos por WhatsApp</a> y te mostramos el stock al momento.';
  }
}

function normalizeProduct(row, index) {
  // Un campo puede venir con el encabezado de la tienda o el del Sheet de
  // gestión: se toma el primero que tenga valor.
  const campo = (...nombres) => {
    for (const n of nombres) {
      const v = row[n];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  const conUnidad = (valor, unidad) => (valor && /^[\d.,]+$/.test(valor)) ? valor + ' ' + unidad : valor;

  const carpeta = campo('Carpeta imagen', 'Imagen');
  const nombre = campo('Nombre comercial', 'Nombre') || 'Junípero Legado';
  const fotos = campo('Fotos').split(/[\n,]/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  const stockTxt = campo('Stock');
  const estadoComercial = campo('Estado comercial');
  const preventa = estadoComercial === 'En formación';
  // El ID del Sheet (LB-0001) es estable; si la fila no lo trae, se usa el
  // número de fila para que el modal y el carrito correspondan a la tarjeta.
  const id = campo('ID') || (slugify(nombre || carpeta || 'junipero') + '-' + (index + 1));
  const precio = parsePrice(campo('Precio', 'Precio venta'));

  return {
    id,
    nombre,
    estilo: campo('Estilo'),
    estiloJp: campo('EstiloJP', 'Estilo JP'),
    especie: campo('Especie'),
    ambiente: campo('Ambiente').toLowerCase(),
    altura: conUnidad(campo('Altura', 'Altura (cm)'), 'cm'),
    edad: conUnidad(campo('Edad', 'Edad (años)'), 'años'),
    maceta: campo('Maceta'),
    destacado: /^(s[ií]|yes|true|1)$/i.test(campo('Destacado')),
    historia: campo('Historia') || 'Cada junípero se forma durante años de poda y alambrado cuidadoso — el tuyo continúa esa historia desde hoy.',
    cuidado: {
      Ubicación: campo('Ubicación', 'Ambiente') || 'Luz solar directa varias horas al día; consúltanos según tu ciudad.',
      Riego: campo('Riego') || 'Riega cuando la capa superior del sustrato esté seca al tacto.',
      Ventilación: campo('Ventilacion', 'Ventilación') || 'Prefiere espacios con buena circulación de aire, idealmente al aire libre.',
      Poda: campo('Poda') || 'Poda de mantenimiento según la fase lunar — te enviamos el calendario.',
      Trasplante: campo('Trasplante') || 'Cada 2 a 3 años, preferiblemente en luna menguante.',
      Alambrado: campo('Alambrado') || 'Disponible como parte del plan Cultivo Guiado.'
    },
    precio,
    precioTexto: campo('Precio', 'Precio venta'),
    preventa,
    entregaEstimada: campo('Entrega estimada'),
    anticipo: preventa ? anticipoDe(precio) : 0,
    stock: preventa ? 1 : (stockTxt !== '' ? parseInt(stockTxt, 10)
      : (estadoComercial && estadoComercial !== 'Disponible' ? 0 : null)),
    carpeta,
    fotos,
    images: null,
    imagesPromise: null
  };
}

/* Las fotos alojadas en Drive a veces fallan la primera vez que se piden
   (Google las genera bajo demanda) o con conexiones lentas: se reintenta
   hasta 3 veces con espera creciente antes de darlas por perdidas. */
const ESPERAS_REINTENTO = [2000, 5000, 10000, 20000];
function setImgConReintento(img, src, intento = 0) {
  img.onerror = () => {
    if (intento >= ESPERAS_REINTENTO.length || img.dataset.src !== src) return;
    setTimeout(() => { if (img.dataset.src === src) setImgConReintento(img, src, intento + 1); }, ESPERAS_REINTENTO[intento]);
  };
  img.dataset.src = src;
  img.src = intento === 0 ? src : src + (src.includes('?') ? '&' : '?') + 'r=' + intento;
}

/* Precarga una lista de fotos DE UNA EN UNA (Google limita las ráfagas). */
function precargarSecuencial(srcs) {
  return srcs.reduce((cadena, src) => cadena.then(() => new Promise(res => {
    const pre = new Image();
    pre.onload = pre.onerror = () => res();
    pre.src = src;
    setTimeout(res, 8000);
  })), Promise.resolve());
}

function detectImages(carpeta) {
  const prefix = carpeta.toLowerCase();
  const tryLoad = (n) => new Promise((resolve) => {
    const img = new Image();
    const src = `${LOCAL_IMAGES_PATH}${carpeta}/${prefix}_${pad2(n)}.jpg`;
    img.onload = () => resolve(src);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return Promise.all(Array.from({ length: 12 }, (_, i) => tryLoad(i + 1)))
    .then(results => results.filter(Boolean));
}

/* Carga las fotos de un producto solo cuando hace falta (tarjeta visible o
   modal abierto) — evita disparar cientos de peticiones de golpe con un
   catálogo grande. */
function loadProductImages(p) {
  if (p.images) return Promise.resolve(p.images);
  if (!p.imagesPromise) {
    // Prioridad: URLs de la columna Fotos (Drive); respaldo: carpeta local.
    const fuente = (p.fotos && p.fotos.length) ? Promise.resolve(p.fotos)
      : (p.carpeta ? detectImages(p.carpeta) : Promise.resolve([]));
    p.imagesPromise = fuente.then(imgs => { p.images = imgs; return imgs; });
  }
  return p.imagesPromise;
}

/* -------------------------------------------------------------------- */
/*  Render catálogo                                                      */
/* -------------------------------------------------------------------- */

const CATALOG_PAGE_SIZE = 16;
let catalogVisibleCount = CATALOG_PAGE_SIZE;
let activeEstilo = 'all';
let searchQuery = '';

function catalogStyles() {
  return [...new Set(PRODUCTS.map(p => p.estilo).filter(Boolean))];
}

function renderStyleChips() {
  const wrap = $('style-chips');
  if (!wrap) return;
  wrap.innerHTML = ['all', ...catalogStyles()].map(e => {
    const label = e === 'all' ? 'Todos' : e;
    const count = e === 'all' ? PRODUCTS.length : PRODUCTS.filter(p => p.estilo === e).length;
    return `<button type="button" class="chip${e === activeEstilo ? ' active' : ''}" data-estilo="${esc(e)}">${esc(label)} <span>${count}</span></button>`;
  }).join('');
}

function syncStyleChips() {
  document.querySelectorAll('#style-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.estilo === activeEstilo));
}

function setActiveEstilo(estilo) {
  activeEstilo = estilo;
  syncStyleChips();
  catalogVisibleCount = CATALOG_PAGE_SIZE;
  syncCatalogUrl();
  renderCatalog();
}

/* Permite enlaces profundos tipo catalogo.html?estilo=Cascada&q=shimpaku&ver=preventa */
function applyCatalogUrlParams() {
  const params = new URLSearchParams(location.search);
  const estilo = params.get('estilo');
  if (estilo && catalogStyles().includes(estilo)) activeEstilo = estilo;
  const q = params.get('q');
  if (q) { searchQuery = q; const input = $('catalog-search'); if (input) input.value = q; }
  const ver = params.get('ver');
  const disp = $('filter-disponibilidad');
  if (ver && disp && [...disp.options].some(o => o.value === ver)) disp.value = ver;
  syncStyleChips();
}

function syncCatalogUrl() {
  const params = new URLSearchParams();
  if (activeEstilo !== 'all') params.set('estilo', activeEstilo);
  if (searchQuery) params.set('q', searchQuery);
  const disp = $('filter-disponibilidad')?.value;
  if (disp && disp !== 'all') params.set('ver', disp);
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function clearCatalogFilters() {
  activeEstilo = 'all';
  searchQuery = '';
  const input = $('catalog-search'); if (input) input.value = '';
  const amb = $('filter-ambiente'); if (amb) amb.value = 'all';
  const disp = $('filter-disponibilidad'); if (disp) disp.value = 'all';
  const sort = $('sort-by'); if (sort) sort.value = 'default';
  syncStyleChips();
  catalogVisibleCount = CATALOG_PAGE_SIZE;
  syncCatalogUrl();
  renderCatalog();
}

function getFilteredSorted() {
  const ambiente = $('filter-ambiente')?.value || 'all';
  const disp = $('filter-disponibilidad')?.value || 'all';
  const sort = $('sort-by')?.value || 'default';
  const q = normalizeText(searchQuery).trim();

  let list = PRODUCTS.filter(p => {
    if (activeEstilo !== 'all' && p.estilo !== activeEstilo) return false;
    if (ambiente !== 'all' && p.ambiente && p.ambiente !== ambiente) return false;
    if (disp === 'disponible' && p.preventa) return false;
    if (disp === 'preventa' && !p.preventa) return false;
    if (q && !normalizeText([p.nombre, p.estilo, p.estiloJp, p.especie, p.id].join(' ')).includes(q)) return false;
    return true;
  });

  switch (sort) {
    case 'price-asc': list.sort((a, b) => a.precio - b.precio); break;
    case 'price-desc': list.sort((a, b) => b.precio - a.precio); break;
    case 'name-asc': list.sort((a, b) => a.nombre.localeCompare(b.nombre)); break;
    case 'name-desc': list.sort((a, b) => b.nombre.localeCompare(a.nombre)); break;
    default: list = [...list.filter(p => !p.preventa), ...list.filter(p => p.preventa)]; // disponibles primero
  }
  return list;
}

function badgeDe(p) {
  if (p.preventa) return `<span class="stock-badge preventa">En formación · Preventa</span>`;
  if (p.stock === 0) return `<span class="stock-badge">Agotado</span>`;
  return '';
}

/* Crea la tarjeta de producto y resuelve su foto de portada de forma
   perezosa (placeholder washi mientras carga). */
function buildProductCard(p) {
  const card = document.createElement('article');
  card.className = 'card' + (p.preventa ? ' is-preventa' : '');
  const agotado = p.stock === 0;
  const tag = [p.estiloJp || p.estilo, p.especie].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="card-media" data-open-modal="${esc(p.id)}">${badgeDe(p)}</div>
    <div class="card-body">
      <div class="card-top">
        <h3>${esc(p.nombre)}</h3>
        <span class="price">${p.precio ? money(p.precio) : esc(p.precioTexto) || 'Consultar'}</span>
      </div>
      ${tag ? `<div class="card-tag">${esc(tag)}</div>` : ''}
      ${p.preventa ? `<div class="card-tag preventa-note">Reserva con ${money(p.anticipo)} (${PREVENTA.anticipoPct}%)${p.entregaEstimada ? ' · entrega ' + esc(p.entregaEstimada) : ''}</div>` : ''}
      <div class="card-actions">
        <button class="mini-btn" data-open-modal="${esc(p.id)}">Ver detalle</button>
        <button class="mini-btn solid" data-quick-add="${esc(p.id)}" ${agotado ? 'disabled' : ''}>${p.preventa ? 'Reservar' : 'Agregar'}</button>
      </div>
    </div>`;

  const media = card.querySelector('.card-media');
  loadProductImages(p).then(imgs => {
    media.innerHTML = imgs[0]
      ? `<img alt="${esc(p.nombre)}" loading="lazy">${badgeDe(p)}`
      : `<div class="viewer-placeholder" style="position:absolute; inset:0;"><div class="kanji">近日</div><span>Foto próximamente</span></div>${badgeDe(p)}`;
    const img = media.querySelector('img');
    if (img) setImgConReintento(img, imgs[0]);
  });

  return card;
}

function renderCatalog() {
  const grid = $('product-grid');
  const statusEl = $('catalog-status');
  const moreWrap = $('catalog-more-wrap');
  const countEl = $('catalog-count');
  const list = getFilteredSorted();
  grid.innerHTML = '';

  if (countEl) {
    countEl.textContent = list.length === PRODUCTS.length
      ? `${PRODUCTS.length} árboles`
      : `${list.length} de ${PRODUCTS.length} árboles`;
  }

  if (!list.length) {
    statusEl.hidden = false;
    statusEl.innerHTML = 'No hay junípero que coincidan con esa búsqueda. <button type="button" class="link-btn" id="catalog-clear-btn">Limpiar filtros</button>';
    moreWrap.hidden = true;
    return;
  }
  statusEl.hidden = true;

  const visible = list.slice(0, catalogVisibleCount);
  visible.forEach(p => grid.appendChild(buildProductCard(p)));

  const remaining = list.length - visible.length;
  if (remaining > 0) {
    moreWrap.hidden = false;
    $('catalog-more-btn').textContent = `Ver más productos (${remaining} restantes)`;
  } else {
    moreWrap.hidden = true;
  }
  observeReveal(grid);
}

/* Franja horizontal de destacados en la portada: los primeros productos del
   inventario, para explorar rápido sin pasar por filtros. */
function renderCarousel() {
  const wrap = $('carousel-wrap');
  const track = $('carousel-track');
  if (!wrap || !track) return;
  if (!PRODUCTS.length) { wrap.hidden = true; return; }
  track.innerHTML = '';
  // Los marcados como "Destacado" en el Sheet van primero en la portada; la preventa al final.
  const disponibles = PRODUCTS.filter(p => !p.preventa);
  const orden = [...disponibles.filter(p => p.destacado), ...disponibles.filter(p => !p.destacado), ...PRODUCTS.filter(p => p.preventa)];
  orden.slice(0, 8).forEach(p => track.appendChild(buildProductCard(p)));
  wrap.hidden = false;
}

function renderCatalogCta() {
  const cta = $('catalog-cta');
  if (!cta) return;
  const n = PRODUCTS.filter(p => !p.preventa).length;
  const pre = PRODUCTS.length - n;
  const estilos = catalogStyles().length;
  $('catalog-cta-count').textContent =
    `${n} ${n === 1 ? 'árbol disponible' : 'árboles disponibles'}` +
    (pre ? ` · ${pre} en preventa` : '') +
    (estilos ? ` · ${estilos} ${estilos === 1 ? 'estilo' : 'estilos'}` : '');
  cta.hidden = false;
}

/* Marca en el menú la sección que está visible (solo enlaces #ancla). */
function initNavSpy() {
  const links = [...document.querySelectorAll('.nav-links a[href^="index.html#"], .nav-links a[href^="#"]')];
  const byId = new Map(links.map(a => [a.getAttribute('href').split('#')[1], a]));
  const secciones = [...byId.keys()].map(id => $(id)).filter(Boolean);
  if (!secciones.length || !('IntersectionObserver' in window)) return;
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.classList.toggle('is-active', byId.get(entry.target.id) === a));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  secciones.forEach(s => spy.observe(s));
}

function initCarouselNav() {
  const track = $('carousel-track');
  if (!track) return;
  const step = () => Math.min(track.clientWidth * 0.8, 400);
  on('carousel-prev', 'click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  on('carousel-next', 'click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
}

/* -------------------------------------------------------------------- */
/*  Modal de producto + visor 360°                                       */
/* -------------------------------------------------------------------- */

let modalProduct = null;
let modalImgIndex = 0;
let modalQty = 1;
let autoRotateTimer = null;
const AUTO_ROTATE_MS = 900;

/* Gira el visor solo, despacio, como si el árbol se mostrara en una base
   giratoria — se detiene apenas la persona toma el control manualmente. */
function startAutoRotate() {
  stopAutoRotate();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  autoRotateTimer = setInterval(() => stepViewer(1), AUTO_ROTATE_MS);
}
function stopAutoRotate() {
  if (autoRotateTimer) { clearInterval(autoRotateTimer); autoRotateTimer = null; }
}

/* Las opciones de plan del modal se arman desde config.js (precio incluido). */
function renderTierPicker() {
  const wrap = $('modal-tier-picker');
  if (!wrap) return;
  wrap.innerHTML = [
    `<label class="tier-opt"><input type="radio" name="tier" value="" checked><span><strong>Sin acompañamiento</strong><span> Solo el árbol.</span></span><em>—</em></label>`,
    ...PLANES.map(p => `<label class="tier-opt"><input type="radio" name="tier" value="${esc(p.nombre)}"><span><strong>${esc(p.nombre)}</strong><span> ${esc(p.resumen)}</span></span><em>+${money(p.precio)}</em></label>`)
  ].join('');
}

function openModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  modalProduct = p;
  modalImgIndex = 0;
  modalQty = 1;
  $('qty-value').textContent = '1';
  renderTierPicker();

  $('modal-style').textContent = [p.estiloJp, p.estilo].filter(Boolean).join(' · ');
  $('modal-title').textContent = p.nombre;
  $('modal-species').textContent = p.especie || '';
  $('modal-species').style.display = p.especie ? '' : 'none';
  $('modal-story').textContent = p.historia;

  const specs = [
    ['Altura', p.altura], ['Edad', p.edad], ['Maceta', p.maceta],
    ['Ambiente', p.ambiente ? (p.ambiente === 'interior' ? 'Interior' : 'Exterior') : ''],
    ['Código', /^LB-/i.test(p.id) ? p.id : '']
  ].filter(([, v]) => v);
  $('modal-specs').innerHTML = specs.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('');

  $('modal-care').innerHTML = Object.entries(p.cuidado)
    .map(([k, v]) => `<div class="care-item"><b>${esc(k)}</b>${esc(v)}</div>`).join('');

  // Preventa: aviso de anticipo y entrega estimada.
  const pre = $('modal-preventa');
  if (pre) {
    pre.hidden = !p.preventa;
    if (p.preventa) pre.innerHTML = `<b>Ejemplar en formación.</b> Lo reservas hoy con el ${PREVENTA.anticipoPct}% (${money(p.anticipo)}) y pagas el saldo al recibirlo${p.entregaEstimada ? ', estimado para <b>' + esc(p.entregaEstimada) + '</b>' : ''}. Mientras tanto te enviamos fotos de su avance.`;
  }
  // Pasaporte: solo para ejemplares con ID del Sheet.
  const pas = $('modal-pasaporte');
  if (pas) {
    const tiene = /^LB-/i.test(p.id);
    pas.hidden = !tiene;
    if (tiene) pas.href = urlPasaporte(p.id);
  }
  const addBtn = $('modal-add-cart');
  if (addBtn) addBtn.textContent = p.preventa ? 'Reservar con anticipo' : 'Agregar al carrito';

  updateModalPrice();
  updateViewer();
  startAutoRotate();
  loadProductImages(p).then(imgs => {
    if (modalProduct !== p) return;
    updateViewer();
    // Precarga el resto de fotos, en orden, para que el giro sea fluido.
    precargarSecuencial(imgs.slice(1));
  });

  const overlay = $('product-modal');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  track('ficha', { id: p.id, valor: p.precio, detalle: p.nombre + (p.preventa ? ' (preventa)' : '') });
}

function closeModal() {
  $('product-modal').classList.remove('open');
  document.body.style.overflow = '';
  modalProduct = null;
  stopAutoRotate();
}

function updateViewer() {
  const img = $('modal-viewer-img');
  const placeholder = $('modal-viewer-placeholder');
  const bar = $('viewer-progress-bar');
  const images = modalProduct.images || [];
  if (!images.length) {
    img.hidden = true;
    placeholder.hidden = false;
    bar.style.width = '0%';
    return;
  }
  img.hidden = false;
  placeholder.hidden = true;
  const nextSrc = images[modalImgIndex];
  if (img.dataset.src !== nextSrc) {
    // Pequeño cruce de opacidad entre fotos — el giro se siente pausado,
    // no un parpadeo entre cuadros.
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; };
    setImgConReintento(img, nextSrc);
  }
  img.alt = modalProduct.nombre + ' — foto ' + (modalImgIndex + 1);
  bar.style.width = ((modalImgIndex + 1) / images.length * 100) + '%';
}

function stepViewer(delta) {
  if (!modalProduct || !modalProduct.images || !modalProduct.images.length) return;
  const n = modalProduct.images.length;
  modalImgIndex = (modalImgIndex + delta + n) % n;
  updateViewer();
}

function tierSeleccionado() { return document.querySelector('#modal-tier-picker input:checked')?.value || ''; }

function updateModalPrice() {
  if (!modalProduct) return;
  const plan = precioPlan(tierSeleccionado());
  const total = (modalProduct.precio + plan) * modalQty;
  const el = $('modal-price');
  if (!modalProduct.precio) { el.textContent = modalProduct.precioTexto || 'Consultar'; return; }
  el.innerHTML = money(total) + (modalProduct.preventa ? `<small>hoy ${money(anticipoDe(modalProduct.precio) * modalQty + plan * modalQty)}</small>` : (plan ? `<small>incluye plan ${money(plan)}</small>` : ''));
}

function initViewerDrag() {
  const viewer = $('modal-viewer');
  if (!viewer) return;
  let dragging = false, startX = 0, acc = 0;
  const THRESHOLD = 24;

  const start = (x) => { dragging = true; startX = x; acc = 0; stopAutoRotate(); };
  const move = (x) => {
    if (!dragging || !modalProduct || !(modalProduct.images || []).length) return;
    const dx = x - startX;
    acc += dx;
    startX = x;
    if (Math.abs(acc) >= THRESHOLD) {
      stepViewer(acc > 0 ? -1 : 1);
      acc = 0;
    }
  };
  const end = () => { dragging = false; };

  viewer.addEventListener('mousedown', e => start(e.clientX));
  window.addEventListener('mousemove', e => move(e.clientX));
  window.addEventListener('mouseup', end);
  viewer.addEventListener('touchstart', e => start(e.touches[0].clientX), { passive: true });
  viewer.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true });
  viewer.addEventListener('touchend', end);
}

/* -------------------------------------------------------------------- */
/*  Carrito                                                              */
/*  Líneas: { key, tipo: 'arbol'|'plan'|'extra', id, nombre, precio,     */
/*            cantidad, tier, tierPrecio, imagen, preventa, anticipo }    */
/* -------------------------------------------------------------------- */

function loadCart() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    // Compatibilidad con carritos guardados antes de v1.1 (sin tipo).
    return items.map(i => Object.assign({ tipo: 'arbol', tierPrecio: precioPlan(i.tier || ''), anticipo: 0, preventa: false }, i));
  } catch { return []; }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function loadCodigo() {
  try { return JSON.parse(localStorage.getItem(CODE_KEY)) || null; } catch { return null; }
}
function saveCodigo(c) {
  codigoAplicado = c;
  if (c) localStorage.setItem(CODE_KEY, JSON.stringify(c)); else localStorage.removeItem(CODE_KEY);
}

function addToCart(product, qty, tier) {
  const key = product.id + '|' + (tier || '');
  const existing = cart.find(i => i.key === key);
  if (existing) existing.cantidad += qty;
  else cart.push({
    key, tipo: 'arbol', id: product.id, nombre: product.nombre, precio: product.precio,
    precioTexto: product.precioTexto, imagen: (product.images && product.images[0]) || '',
    cantidad: qty, tier: tier || '', tierPrecio: precioPlan(tier || ''),
    preventa: !!product.preventa, anticipo: product.anticipo || 0, entregaEstimada: product.entregaEstimada || ''
  });
  saveCart();
  renderCart();
  track(product.preventa ? 'preventa' : 'carrito', { id: product.id, valor: product.precio, detalle: tier ? 'plan ' + tier : '' });
  if (tier) track('plan', { id: product.id, valor: precioPlan(tier), detalle: tier + ' (con árbol)' });
  loadProductImages(product).then(imgs => {
    const item = cart.find(i => i.key === key);
    if (item && !item.imagen && imgs[0]) { item.imagen = imgs[0]; saveCart(); renderCart(); }
  });
}

/* Plan suelto: para un árbol que el cliente ya tiene en casa. */
function addPlanToCart(nombre) {
  const plan = planPorNombre(nombre);
  if (!plan) return;
  const key = 'plan|' + plan.nombre;
  const existing = cart.find(i => i.key === key);
  if (existing) existing.cantidad += 1;
  else cart.push({ key, tipo: 'plan', id: '', nombre: plan.nombre, precio: plan.precio, cantidad: 1, tier: '', tierPrecio: 0, imagen: '', preventa: false, anticipo: 0, periodo: plan.periodo });
  saveCart();
  renderCart();
  openCart();
  track('plan', { valor: plan.precio, detalle: plan.nombre + ' (árbol propio)' });
}

function addExtraToCart(id) {
  const ex = EXTRAS.find(e => e.id === id);
  if (!ex) return;
  const key = 'extra|' + ex.id;
  const existing = cart.find(i => i.key === key);
  if (existing) existing.cantidad += 1;
  else cart.push({ key, tipo: 'extra', id: ex.id, nombre: ex.nombre, precio: ex.precio, cantidad: 1, tier: '', tierPrecio: 0, imagen: '', preventa: false, anticipo: 0 });
  saveCart();
  renderCart();
  track('extra', { valor: ex.precio, detalle: ex.nombre });
}

function updateCartCount() {
  const count = cart.reduce((sum, i) => sum + i.cantidad, 0);
  const badge = $('cart-count');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('visually-hidden', count === 0);
}

function lineaPrecio(i) { return (i.precio + (i.tierPrecio || 0)) * i.cantidad; }

/* Totales: el descuento del código aplica a árboles y planes (no a kits).
   "Hoy" = lo que se paga al confirmar: anticipos de preventa + todo lo demás. */
function cartTotals() {
  const subtotal = cart.reduce((s, i) => s + lineaPrecio(i), 0);
  const baseDescuento = cart.filter(i => i.tipo !== 'extra').reduce((s, i) => s + lineaPrecio(i), 0);
  const pct = codigoAplicado ? (codigoAplicado.descuentoPct || 0) : 0;
  const descuento = Math.round(baseDescuento * pct) / 100;
  const total = Math.max(0, subtotal - descuento);
  const saldoPreventa = cart.filter(i => i.preventa).reduce((s, i) => s + (i.precio - i.anticipo) * i.cantidad, 0);
  const hoy = Math.max(0, total - saldoPreventa);
  return { subtotal, descuento, total, saldoPreventa, hoy, pct };
}

function renderCart() {
  const wrap = $('cart-items');
  if (!wrap) return;
  if (!cart.length) {
    wrap.innerHTML = '<p class="cart-empty">Tu carrito está vacío. Explora el catálogo y elige tu primer legado.</p>';
  } else {
    wrap.innerHTML = cart.map(item => `
      <div class="cart-item" data-key="${esc(item.key)}">
        ${item.imagen ? `<img src="${esc(item.imagen)}" alt="${esc(item.nombre)}">` : `<div class="cart-thumb-ph">${item.tipo === 'plan' ? '継' : item.tipo === 'extra' ? '道' : '木'}</div>`}
        <div class="cart-item-body">
          <h4>${esc(item.nombre)}${item.tipo === 'plan' ? ' <span class="tier-note">plan · árbol propio</span>' : ''}</h4>
          ${item.tier ? `<div class="tier-note">+ ${esc(item.tier)} (${money(item.tierPrecio)})</div>` : ''}
          ${item.preventa ? `<div class="tier-note preventa">Preventa · anticipo ${money(item.anticipo * item.cantidad)}${item.entregaEstimada ? ' · entrega ' + esc(item.entregaEstimada) : ''}</div>` : ''}
          <div class="cart-item-row">
            <div class="qty-stepper">
              <button type="button" data-cart-minus="${esc(item.key)}">&minus;</button>
              <span>${item.cantidad}</span>
              <button type="button" data-cart-plus="${esc(item.key)}">&plus;</button>
            </div>
            <span>${item.precio ? money(lineaPrecio(item)) : esc(item.precioTexto || '')}</span>
          </div>
          <button class="cart-item-remove" data-cart-remove="${esc(item.key)}">Quitar</button>
        </div>
      </div>`).join('');
  }
  renderCartExtras();
  renderCartCode();
  const t = cartTotals();
  const totalEl = $('cart-total');
  if (totalEl) totalEl.textContent = money(t.total);
  const det = $('cart-totals-detail');
  if (det) {
    const filas = [];
    if (t.descuento) filas.push(`<div><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div class="desc"><span>Descuento ${esc(codigoAplicado.codigo)} (${t.pct}%)</span><span>−${money(t.descuento)}</span></div>`);
    if (t.saldoPreventa) filas.push(`<div class="hoy"><span>Pagas hoy (anticipos)</span><span>${money(t.hoy)}</span></div><div><span>Saldo al entregar</span><span>${money(t.saldoPreventa)}</span></div>`);
    det.innerHTML = filas.join('');
    det.hidden = !filas.length;
  }
  updateCartCount();
}

/* "Completa tu kit": sugerencias de extras cuando hay al menos un árbol o
   plan en el carrito y el extra aún no está agregado. */
function renderCartExtras() {
  const wrap = $('cart-extras');
  if (!wrap) return;
  const hayArbol = cart.some(i => i.tipo !== 'extra');
  const faltan = EXTRAS.filter(e => !cart.some(i => i.key === 'extra|' + e.id));
  if (!hayArbol || !faltan.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  wrap.hidden = false;
  wrap.innerHTML = `<h4>Completa tu kit</h4>` + faltan.slice(0, 3).map(e => `
    <div class="cart-extra">
      <div><b>${esc(e.nombre)}</b><small>${esc(e.detalle)}</small></div>
      <button type="button" class="mini-btn" data-add-extra="${esc(e.id)}">+ ${money(e.precio)}</button>
    </div>`).join('');
}

function renderCartCode() {
  const wrap = $('cart-code');
  if (!wrap) return;
  const input = wrap.querySelector('input');
  const msg = wrap.querySelector('.code-msg');
  if (codigoAplicado) {
    input.value = codigoAplicado.codigo;
    input.disabled = true;
    wrap.querySelector('[data-code-apply]').hidden = true;
    wrap.querySelector('[data-code-remove]').hidden = false;
    msg.textContent = codigoAplicado.mensaje || ('Código aplicado: ' + codigoAplicado.descuentoPct + '%');
    msg.className = 'code-msg ok';
  } else {
    input.disabled = false;
    wrap.querySelector('[data-code-apply]').hidden = false;
    wrap.querySelector('[data-code-remove]').hidden = true;
  }
}

async function aplicarCodigo() {
  const wrap = $('cart-code');
  const input = wrap.querySelector('input');
  const msg = wrap.querySelector('.code-msg');
  const btn = wrap.querySelector('[data-code-apply]');
  const c = input.value.trim().toUpperCase();
  if (!c) return;
  msg.className = 'code-msg'; msg.textContent = 'Verificando…'; btn.disabled = true;
  try {
    let r;
    if (API_URL) {
      const res = await fetch(API_URL + '?action=codigo&c=' + encodeURIComponent(c), { redirect: 'follow' });
      r = await res.json();
      if (!r.ok) throw new Error(r.error || 'No se pudo verificar');
    } else {
      // Sin API: solo el código del popup.
      r = c === REFERIDOS.codigoNewsletter ? { valido: true, codigo: c, descuentoPct: REFERIDOS.descuentoPct, mensaje: c + ': ' + REFERIDOS.descuentoPct + '% en tu primer legado' } : { valido: false, motivo: 'Código no encontrado' };
    }
    if (!r.valido) { msg.className = 'code-msg bad'; msg.textContent = r.motivo || 'Código no válido'; }
    else { saveCodigo({ codigo: r.codigo, descuentoPct: r.descuentoPct, tipo: r.tipo || 'promo', mensaje: r.mensaje }); track('codigo', { detalle: r.codigo, valor: r.descuentoPct }); renderCart(); }
  } catch (err) {
    msg.className = 'code-msg bad'; msg.textContent = 'No pudimos verificar el código ahora. Lo revisamos al confirmar por WhatsApp.';
  } finally { btn.disabled = false; }
}

function openCart() {
  $('cart-overlay').classList.add('open');
  $('cart-drawer').classList.add('open');
}
function closeCart() {
  $('cart-overlay').classList.remove('open');
  $('cart-drawer').classList.remove('open');
}

function checkoutViaWhatsapp() {
  if (!cart.length) return;
  const lines = cart.map(i => {
    const base = `• ${i.cantidad} x ${i.nombre}` + (i.tipo === 'plan' ? ' (plan para mi árbol)' : '') + (i.tier ? ' + plan ' + i.tier : '') + (/^LB-/i.test(i.id) ? ` [${i.id}]` : '');
    const precio = i.precio ? money(lineaPrecio(i)) : (i.precioTexto || 'consultar');
    return base + ' — ' + precio + (i.preventa ? ` (PREVENTA: anticipo ${money(i.anticipo * i.cantidad)}${i.entregaEstimada ? ', entrega ' + i.entregaEstimada : ''})` : '');
  });
  const t = cartTotals();
  const message = [
    'Hola, quiero confirmar este pedido de Legado Bonsai:',
    '',
    ...lines,
    '',
    ...(t.descuento ? [`Subtotal: ${money(t.subtotal)}`, `Código ${codigoAplicado.codigo}: −${money(t.descuento)}`] : []),
    'Total estimado: ' + money(t.total),
    ...(t.saldoPreventa ? [`Pago hoy (anticipos): ${money(t.hoy)} · saldo al entregar: ${money(t.saldoPreventa)}`] : [])
  ].join('\n');
  track('whatsapp', { valor: t.total, detalle: cart.map(i => i.cantidad + 'x ' + (i.id || i.nombre)).join(', ').slice(0, 120) });
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
}

/* -------------------------------------------------------------------- */
/*  Calendario lunar                                                     */
/* -------------------------------------------------------------------- */

const LUNAR_CALENDAR = [
  { mes: 'Enero', fase: 'Luna nueva / cuarto menguante', accion: 'Poda ligera y ajuste de alambrado de mantenimiento.' },
  { mes: 'Febrero', fase: 'Cuarto creciente / luna nueva', accion: 'Trasplante y corte de raíces menores tras la temporada lluviosa.' },
  { mes: 'Marzo', fase: 'Cuarto creciente', accion: 'Fertilización ligera para iniciar el crecimiento.' },
  { mes: 'Abril', fase: 'Cuarto creciente / luna nueva', accion: 'Fertilización fuerte para un crecimiento vigoroso.' },
  { mes: 'Mayo', fase: 'Luna nueva / cuarto menguante', accion: 'Poda de ramas y raíces secas.' },
  { mes: 'Junio', fase: 'Cuarto creciente', accion: 'Alambrado nuevo o ajuste, con la savia en crecimiento activo.' },
  { mes: 'Julio', fase: 'Luna llena', accion: 'Solo monitoreo y control de riego; sin intervenciones mayores.' },
  { mes: 'Agosto', fase: 'Cuarto creciente / menguante', accion: 'Fertilización ligera y preparación para la temporada lluviosa.' },
  { mes: 'Septiembre', fase: 'Luna nueva / cuarto creciente', accion: 'Poda de mantenimiento y trasplante antes de las lluvias.' },
  { mes: 'Octubre', fase: 'Luna llena', accion: 'Descanso y revisión de posibles daños por humedad.' },
  { mes: 'Noviembre', fase: 'Cuarto creciente', accion: 'Fertilización ligera de mantenimiento.' },
  { mes: 'Diciembre', fase: 'Cuarto menguante', accion: 'Poda ligera y preparación del árbol para su descanso.' }
];

/* Fase lunar real de hoy (±1 día), misma fórmula que el backend: edad
   sinódica desde la luna nueva del 6/1/2000 18:14 UTC. */
function faseLunarHoy(fecha = new Date()) {
  const SIN = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const t = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12).getTime();
  let edad = ((t - ref) / 86400000) % SIN; if (edad < 0) edad += SIN;
  const nombres = [[1.85, 'Luna nueva', '🌑'], [SIN / 4 - 1, 'Luna creciente', '🌒'], [SIN / 4 + 1, 'Cuarto creciente', '🌓'], [SIN / 2 - 1, 'Creciente gibosa', '🌔'],
    [SIN / 2 + 1, 'Luna llena', '🌕'], [3 * SIN / 4 - 1, 'Menguante gibosa', '🌖'], [3 * SIN / 4 + 1, 'Cuarto menguante', '🌗'], [SIN - 1.85, 'Luna menguante', '🌘'], [SIN + 1, 'Luna nueva', '🌑']];
  const f = nombres.find(n => edad < n[0]);
  return { edad: Math.round(edad), nombre: f[1], icono: f[2] };
}

function seasonForMonth(m) {
  if ([2, 3, 4].includes(m)) return 'spring';
  if ([5, 6, 7].includes(m)) return 'summer';
  if ([8, 9, 10].includes(m)) return 'autumn';
  return 'winter';
}

function renderLunarCalendar() {
  const tbody = document.querySelector('#cal-table tbody');
  if (!tbody) return;
  const currentMonth = new Date().getMonth();
  const season = seasonForMonth(currentMonth);
  tbody.innerHTML = LUNAR_CALENDAR.map((row, i) => `
    <tr class="${i === currentMonth ? 'current season-' + season : ''}">
      <td class="month">${row.mes}</td>
      <td class="fase">${row.fase}</td>
      <td>${row.accion}</td>
    </tr>`).join('');

  const current = LUNAR_CALENDAR[currentMonth];
  const hoy = faseLunarHoy();
  const highlight = $('moon-highlight');
  highlight.className = 'moon-highlight season-' + season;
  highlight.querySelector('.phase').textContent = current.mes + ' — ' + current.fase;
  highlight.querySelector('p').textContent = current.accion;
  const hoyEl = $('moon-today');
  if (hoyEl) hoyEl.textContent = `${hoy.icono} Hoy: ${hoy.nombre.toLowerCase()} (día ${hoy.edad} del ciclo)`;
}

/* -------------------------------------------------------------------- */
/*  Chat FAQ                                                             */
/* -------------------------------------------------------------------- */

const FAQ = [
  { q: '¿Hacen envíos a nivel nacional?', a: '📦 Sí, realizamos envíos a todo el país con un costo adicional según la ciudad.' },
  { q: '¿Cuáles son las formas de pago?', a: '💳 Aceptamos PayPhone y transferencias a Banco Pichincha, Produbanco y Pacífico.' },
  { q: '¿Cuánto cuesta el envío?', a: '🚚 Depende de la ciudad. Escríbenos tu ubicación y te confirmamos el costo.' },
  { q: '¿En cuánto tiempo llega mi bonsái?', a: '⏳ De 1 a 3 días hábiles, dependiendo de la ciudad.' },
  { q: '¿Cómo cuido mi bonsái?', a: '🌱 Cada árbol llega con su ficha de cuidado, su pasaporte digital y activamos recordatorios por fase lunar.' },
  { q: '¿Qué es el pasaporte del árbol?', a: '📜 Una página con la historia de tu árbol: fotos 360°, cada poda y trasplante registrados, y un certificado con QR. Lo hereda quien herede el árbol.' },
  { q: '¿Puedo contratar un plan para un árbol que ya tengo?', a: '🌿 Sí. En la sección Acompañamiento agregas el plan solo, sin comprar árbol, y agendamos la primera visita.' },
  { q: '¿Qué es la preventa?', a: '⏳ Son árboles en formación. Los reservas con el 30% y pagas el saldo cuando estén listos; te enviamos fotos del avance.' },
  { q: '¿Tienen garantía los bonsáis?', a: '🛡️ Sí, si tu árbol llega en mal estado, lo reemplazamos.' },
  { q: '¿Puedo elegir la maceta?', a: '🪴 ¡Sí! Tenemos opciones de maceta. Cuéntanos tu preferencia por WhatsApp.' },
  { q: '¿Qué estilos de junípero tienen?', a: '🌳 Manejamos junípero en 4 estilos: erguido, inclinado, cascada y raíz sobre roca.' },
  { q: '¿Hacen regalos corporativos?', a: '🎁 Sí, desde 10 unidades con placa grabada y descuentos por volumen. Cotiza en la página Regalos corporativos.' },
  { q: '¿Dan talleres presenciales?', a: '🌳 Sí, tenemos talleres de Introducción al Bonsái, Alambrado y Poda, Trasplante Guiado, y una Experiencia en Pareja — no necesitas tener un árbol para tomarlos.' },
  { q: '¿Tengo descuento si me refirió un amigo?', a: '🤝 Sí: con su código tienes 10% en tu primer árbol o plan, y tu amigo recibe $10 de crédito.' },
  { q: '¿Cómo hago mi pedido?', a: '🛍️ Agrega tus junípero al carrito y presiona "Finalizar por WhatsApp".' },
  { q: '¿Dónde están ubicados?', a: '📍 Estamos en Ecuador y hacemos envíos a todo el país.' },
  { q: '¿Puedo ver fotos reales de los bonsáis?', a: '📸 Sí, cada ficha de producto tiene fotos 360° reales de nuestro stock.' }
];

function renderFaq() {
  const wrap = $('faq-options');
  if (!wrap) return;
  wrap.innerHTML = FAQ.map(f => `<button class="faq-question" data-q="${esc(f.q)}">${esc(f.q)}</button>`).join('');
}

/* -------------------------------------------------------------------- */
/*  Planes (sección Acompañamiento): precios y botones desde config.js   */
/* -------------------------------------------------------------------- */

function renderTierPrices() {
  document.querySelectorAll('.tier-card[data-plan]').forEach(card => {
    const plan = planPorNombre(card.dataset.plan);
    if (!plan) return;
    const price = card.querySelector('.tier-price');
    if (price) price.innerHTML = `${money(plan.precio)} <span>${esc(plan.periodo)}</span>`;
  });
}

/* -------------------------------------------------------------------- */
/*  Revelado al hacer scroll                                             */
/* -------------------------------------------------------------------- */

let revealObserver = null;
const REVEAL_SELECTOR = '.section-head, .pillar, .tier-card, .workshop-card, .step, .testimonial, ' +
  '.blog-post, .quote-break-overlay, .card, .enso, .style-col, .prose, .moon-highlight, .cal-wrap, .catalog-cta';

function observeReveal(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.14 });
  }
  root.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
    if (el.classList.contains('in-view')) return;
    // Efecto cascada: los elementos de un mismo grupo (p. ej. una fila de
    // tarjetas) aparecen con un pequeño desfase entre sí, no todos a la vez.
    if (!el.dataset.revealStaggered) {
      const siblings = Array.from(el.parentElement?.children || [])
        .filter(c => c.matches(REVEAL_SELECTOR));
      const idx = Math.min(siblings.indexOf(el), 5);
      if (idx > 0) el.style.transitionDelay = (idx * 70) + 'ms';
      el.dataset.revealStaggered = '1';
    }
    revealObserver.observe(el);
  });
}

/* -------------------------------------------------------------------- */
/*  Modo oscuro                                                          */
/* -------------------------------------------------------------------- */

const THEME_KEY = 'legadoBonsaiTheme';

function applyTheme(theme) {
  if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');

  const isDark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const btn = $('theme-toggle-btn');
  if (!btn) return;
  $('theme-icon-dark').style.display = isDark ? 'none' : 'block';
  $('theme-icon-light').style.display = isDark ? 'block' : 'none';
  btn.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY));
  on('theme-toggle-btn', 'click', () => {
    const current = document.documentElement.getAttribute('data-theme')
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

/* -------------------------------------------------------------------- */
/*  Botones magnéticos (CTA primario)                                    */
/* -------------------------------------------------------------------- */

function initMagneticButtons() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;
  const strength = 14;
  document.querySelectorAll('.btn-primary').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = ((e.clientX - rect.left - rect.width / 2) / rect.width) * strength;
      const y = ((e.clientY - rect.top - rect.height / 2) / rect.height) * strength;
      btn.style.transform = `translate(${x}px, ${y}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

/* -------------------------------------------------------------------- */
/*  Parallax sutil (hero + cita a pantalla completa)                     */
/* -------------------------------------------------------------------- */

function initParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heroImg = document.querySelector('.hero-figure .frame img');
  const quoteImg = document.querySelector('.quote-break img');
  if (!heroImg && !quoteImg) return;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  let ticking = false;

  function update() {
    ticking = false;
    if (heroImg) {
      const top = heroImg.closest('.hero-figure').getBoundingClientRect().top;
      heroImg.style.transform = `translate3d(0, ${clamp(top * 0.08, -40, 40)}px, 0)`;
    }
    if (quoteImg) {
      const top = quoteImg.closest('.quote-break').getBoundingClientRect().top;
      quoteImg.style.transform = `translate3d(0, ${clamp(top * -0.15, -60, 60)}px, 0)`;
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  update();
}

/* -------------------------------------------------------------------- */
/*  Init                                                                 */
/* -------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Enlace de referido compartido: catalogo.html?codigo=LEG-XXXX
  const codigoUrl = new URLSearchParams(location.search).get('codigo');
  if (codigoUrl && !codigoAplicado) {
    const input = document.querySelector('#cart-code input');
    if (input) { input.value = codigoUrl.toUpperCase(); setTimeout(aplicarCodigo, 800); }
  }

  fetchCatalog();
  renderLunarCalendar();
  renderFaq();
  renderTierPrices();
  renderCart();
  initViewerDrag();
  observeReveal();
  initTheme();
  initMagneticButtons();
  initParallax();
  initCarouselNav();
  initNavSpy();
  track('vista');

  // Filtros / orden / búsqueda (página de catálogo)
  ['filter-ambiente', 'filter-disponibilidad', 'sort-by'].forEach(id => on(id, 'change', () => {
    catalogVisibleCount = CATALOG_PAGE_SIZE;
    syncCatalogUrl();
    renderCatalog();
  }));
  let searchTimer = null;
  on('catalog-search', 'input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      catalogVisibleCount = CATALOG_PAGE_SIZE;
      syncCatalogUrl();
      renderCatalog();
    }, 150);
  });
  on('style-chips', 'click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) setActiveEstilo(chip.dataset.estilo);
  });
  on('catalog-status', 'click', (e) => {
    if (e.target.id === 'catalog-clear-btn') clearCatalogFilters();
  });
  on('catalog-more-btn', 'click', () => {
    catalogVisibleCount += CATALOG_PAGE_SIZE;
    renderCatalog();
  });

  // Delegación de clics en tarjetas (ver detalle / agregar rápido)
  const handleProductGridClick = (e) => {
    const openId = e.target.closest('[data-open-modal]')?.getAttribute('data-open-modal');
    const quickId = e.target.closest('[data-quick-add]')?.getAttribute('data-quick-add');
    if (openId) openModal(openId);
    else if (quickId) {
      const p = PRODUCTS.find(x => x.id === quickId);
      if (p) { addToCart(p, 1, ''); openCart(); }
    }
  };
  on('product-grid', 'click', handleProductGridClick);
  on('carousel-track', 'click', handleProductGridClick);

  // Planes sueltos (sección Acompañamiento)
  document.addEventListener('click', (e) => {
    const plan = e.target.closest('[data-add-plan]')?.getAttribute('data-add-plan');
    if (plan) { e.preventDefault(); addPlanToCart(plan); }
    const taller = e.target.closest('.workshop-card a[href*="wa.me"]');
    if (taller) track('taller', { detalle: taller.closest('.workshop-card')?.querySelector('h3')?.textContent || '' });
  });

  // Modal
  on('modal-close-btn', 'click', closeModal);
  on('product-modal', 'click', (e) => { if (e.target.id === 'product-modal') closeModal(); });
  on('modal-tier-picker', 'change', updateModalPrice);
  on('modal-pasaporte', 'click', () => track('pasaporte', { id: modalProduct?.id || '' }));
  on('viewer-prev', 'click', () => { stopAutoRotate(); stepViewer(-1); });
  on('viewer-next', 'click', () => { stopAutoRotate(); stepViewer(1); });
  on('qty-minus', 'click', () => { modalQty = Math.max(1, modalQty - 1); $('qty-value').textContent = modalQty; updateModalPrice(); });
  on('qty-plus', 'click', () => { modalQty += 1; $('qty-value').textContent = modalQty; updateModalPrice(); });
  on('modal-add-cart', 'click', () => {
    if (!modalProduct) return;
    addToCart(modalProduct, modalQty, tierSeleccionado());
    closeModal();
    openCart();
  });

  // Menú móvil
  const navLinks = document.querySelector('.nav-links');
  const navToggleBtn = $('nav-toggle-btn');
  if (navLinks && navToggleBtn) {
    navToggleBtn.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggleBtn.setAttribute('aria-expanded', String(open));
    });
    navLinks.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') { navLinks.classList.remove('open'); navToggleBtn.setAttribute('aria-expanded', 'false'); }
    });
  }

  // Carrito
  on('cart-open-btn', 'click', openCart);
  on('cart-close-btn', 'click', closeCart);
  on('cart-overlay', 'click', closeCart);
  on('cart-checkout-btn', 'click', checkoutViaWhatsapp);
  on('cart-items', 'click', (e) => {
    const minusKey = e.target.closest('[data-cart-minus]')?.getAttribute('data-cart-minus');
    const plusKey = e.target.closest('[data-cart-plus]')?.getAttribute('data-cart-plus');
    const removeKey = e.target.closest('[data-cart-remove]')?.getAttribute('data-cart-remove');
    if (minusKey) {
      const item = cart.find(i => i.key === minusKey);
      if (item) { item.cantidad -= 1; if (item.cantidad <= 0) cart = cart.filter(i => i.key !== minusKey); saveCart(); renderCart(); }
    } else if (plusKey) {
      const item = cart.find(i => i.key === plusKey);
      if (item) { item.cantidad += 1; saveCart(); renderCart(); }
    } else if (removeKey) {
      cart = cart.filter(i => i.key !== removeKey);
      saveCart(); renderCart();
    }
  });
  on('cart-extras', 'click', (e) => {
    const id = e.target.closest('[data-add-extra]')?.getAttribute('data-add-extra');
    if (id) addExtraToCart(id);
  });
  const codeWrap = $('cart-code');
  if (codeWrap) {
    codeWrap.querySelector('[data-code-apply]').addEventListener('click', aplicarCodigo);
    codeWrap.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarCodigo(); } });
    codeWrap.querySelector('[data-code-remove]').addEventListener('click', () => {
      saveCodigo(null);
      codeWrap.querySelector('input').value = '';
      codeWrap.querySelector('.code-msg').textContent = '';
      renderCart();
    });
  }

  // Popup newsletter (solo portada; no interrumpe si hay un modal o el carrito abiertos)
  const popupOverlay = $('popup-overlay');
  if (popupOverlay) {
    setTimeout(() => {
      const modalOpen = $('product-modal')?.classList.contains('open');
      const cartOpen = $('cart-drawer')?.classList.contains('open');
      if (!modalOpen && !cartOpen) popupOverlay.classList.add('open');
    }, 6000);
    on('popup-close-btn', 'click', () => popupOverlay.classList.remove('open'));
    popupOverlay.addEventListener('click', (e) => { if (e.target.id === 'popup-overlay') popupOverlay.classList.remove('open'); });
    on('subscribe-form', 'submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const email = form.querySelector('input[type="email"]').value.trim();
      const btn = form.querySelector('button[type="submit"]');
      if (!email) return;
      const codigo = REFERIDOS.codigoNewsletter;
      const msg = $('subscribe-msg');
      const mostrar = (texto, error = false) => {
        if (!msg) return;
        msg.textContent = texto;
        msg.classList.toggle('is-error', error);
      };

      if (!NEWSLETTER_FORM_ACTION || !NEWSLETTER_EMAIL_ENTRY) {
        console.warn('Newsletter: falta NEWSLETTER_FORM_ACTION/NEWSLETTER_EMAIL_ENTRY en config.js — el correo no se guardó.');
        mostrar('Tu código de descuento es ' + codigo + '.');
        return;
      }

      const textoOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      mostrar('');
      try {
        // Los Google Forms públicos no responden CORS: 'no-cors' hace el
        // POST igual, solo no deja leer la respuesta (por eso no hay .ok que
        // chequear — si el fetch no lanza error, se considera enviado).
        await fetch(NEWSLETTER_FORM_ACTION, {
          method: 'POST',
          mode: 'no-cors',
          body: new URLSearchParams({ [NEWSLETTER_EMAIL_ENTRY]: email })
        });
        track('newsletter');
        mostrar('Listo. Tu código es ' + codigo + ': escríbelo en el carrito al hacer tu pedido.');
        form.reset();
      } catch (err) {
        console.error('No se pudo registrar el correo:', err);
        mostrar('No pudimos registrar tu correo. Revisa tu conexión e intenta de nuevo.', true);
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
  }

  // Chat FAQ
  const chatBox = $('chat-box');
  on('chat-button', 'click', () => chatBox.classList.toggle('visible'));
  on('close-chat', 'click', () => chatBox.classList.remove('visible'));
  on('faq-options', 'click', (e) => {
    const q = e.target.closest('.faq-question')?.getAttribute('data-q');
    if (!q) return;
    const chatBody = $('chat-body');
    const answer = FAQ.find(f => f.q === q)?.a || 'No tenemos información sobre eso todavía.';
    const userMsg = document.createElement('div');
    userMsg.className = 'message'; userMsg.style.fontWeight = '600'; userMsg.style.color = 'var(--ink)';
    userMsg.textContent = q;
    const botMsg = document.createElement('div');
    botMsg.className = 'message bot'; botMsg.textContent = answer;
    chatBody.appendChild(userMsg); chatBody.appendChild(botMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
  });

  // Formulario de contacto -> abre el correo del usuario con el mensaje precargado
  on('contact-form', 'submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const body = `Nombre: ${f.nombre.value}\nCorreo: ${f.correo.value}\n\n${f.mensaje.value}`;
    window.location.href = `mailto:contacto@legadobonsai.com?subject=${encodeURIComponent('Mensaje desde la web')}&body=${encodeURIComponent(body)}`;
  });

  // Cerrar overlays con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeCart(); }
  });
});
