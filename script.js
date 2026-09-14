/* ==========================================================================
   Legado Bonsai — lógica de la tienda
   Fuente de inventario (en este orden, ver config.js):
     1. API_URL       -> Web App de Apps Script (apps-script/Code.gs) que
                         devuelve JSON con los ejemplares "Disponible" de la
                         pestaña INVENTARIO del Sheet "Sistema de Gestión".
     2. SHEET_CSV_URL -> respaldo: pestaña CATALOGO publicada como CSV.
   Ambas fuentes entregan filas con los encabezados del Sheet. Cada campo
   acepta varios nombres de columna (ver `campo()` en normalizeProduct), así
   la hoja puede usar "Nombre comercial" o "Nombre", "Altura (cm)" o "Altura".
   Campos OPCIONALES que enriquecen la ficha (si faltan, texto genérico):
     Estilo, EstiloJP / Estilo JP, Especie, Ambiente, Historia, Ventilacion,
     Poda, Trasplante, Alambrado, Stock, Destacado.
   Fotos: columna `Fotos` (URLs separadas por coma, subidas por la app de
   registro a Drive) o, como respaldo, carpeta local imagenes/360/<Imagen>/.
   ========================================================================== */

const CFG = window.LEGADO_CONFIG || {};
const WHATSAPP_NUMBER = CFG.WHATSAPP_NUMBER || '593988731431';
const API_URL = CFG.API_URL || '';
const SHEET_CSV_URL = CFG.SHEET_CSV_URL || '';
const LOCAL_IMAGES_PATH = CFG.LOCAL_IMAGES_PATH || 'imagenes/360/';
const CART_KEY = 'legadoBonsaiCart';

let PRODUCTS = [];
let cart = loadCart();

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

const $ = (id) => document.getElementById(id);
/* Registra un listener solo si el elemento existe: el mismo script sirve a
   index.html (portada) y catalogo.html (catálogo completo). */
function on(id, evt, fn) { const el = $(id); if (el) el.addEventListener(evt, fn); }
function normalizeText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

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
    const products = rows.map((row, i) => normalizeProduct(row, i));
    PRODUCTS = products;
    if (statusEl) statusEl.hidden = true;
    if ($('carousel-track')) renderCarousel();
    if ($('catalog-cta')) renderCatalogCta();
    if ($('product-grid')) {
      renderStyleChips();
      applyCatalogUrlParams();
      renderCatalog();
    }
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
  // El ID del Sheet (LB-0001) es estable; si la fila no lo trae, se usa el
  // número de fila para que el modal y el carrito correspondan a la tarjeta.
  const id = campo('ID') || (slugify(nombre || carpeta || 'junipero') + '-' + (index + 1));

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
    precio: parsePrice(campo('Precio', 'Precio venta')),
    precioTexto: campo('Precio', 'Precio venta'),
    stock: stockTxt !== '' ? parseInt(stockTxt, 10)
      : (estadoComercial && estadoComercial !== 'Disponible' ? 0 : null),
    carpeta,
    fotos,
    images: null,
    imagesPromise: null
  };
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
    return `<button type="button" class="chip${e === activeEstilo ? ' active' : ''}" data-estilo="${e}">${label} <span>${count}</span></button>`;
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

/* Permite enlaces profundos tipo catalogo.html?estilo=Cascada&q=shimpaku */
function applyCatalogUrlParams() {
  const params = new URLSearchParams(location.search);
  const estilo = params.get('estilo');
  if (estilo && catalogStyles().includes(estilo)) activeEstilo = estilo;
  const q = params.get('q');
  if (q) { searchQuery = q; const input = $('catalog-search'); if (input) input.value = q; }
  syncStyleChips();
}

function syncCatalogUrl() {
  const params = new URLSearchParams();
  if (activeEstilo !== 'all') params.set('estilo', activeEstilo);
  if (searchQuery) params.set('q', searchQuery);
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function clearCatalogFilters() {
  activeEstilo = 'all';
  searchQuery = '';
  const input = $('catalog-search'); if (input) input.value = '';
  const amb = $('filter-ambiente'); if (amb) amb.value = 'all';
  const sort = $('sort-by'); if (sort) sort.value = 'default';
  syncStyleChips();
  catalogVisibleCount = CATALOG_PAGE_SIZE;
  syncCatalogUrl();
  renderCatalog();
}

function getFilteredSorted() {
  const ambiente = $('filter-ambiente')?.value || 'all';
  const sort = $('sort-by')?.value || 'default';
  const q = normalizeText(searchQuery).trim();

  let list = PRODUCTS.filter(p => {
    if (activeEstilo !== 'all' && p.estilo !== activeEstilo) return false;
    if (ambiente !== 'all' && p.ambiente && p.ambiente !== ambiente) return false;
    if (q && !normalizeText([p.nombre, p.estilo, p.estiloJp, p.especie].join(' ')).includes(q)) return false;
    return true;
  });

  switch (sort) {
    case 'price-asc': list.sort((a, b) => a.precio - b.precio); break;
    case 'price-desc': list.sort((a, b) => b.precio - a.precio); break;
    case 'name-asc': list.sort((a, b) => a.nombre.localeCompare(b.nombre)); break;
    case 'name-desc': list.sort((a, b) => b.nombre.localeCompare(a.nombre)); break;
  }
  return list;
}

/* Crea la tarjeta de producto y resuelve su foto de portada de forma
   perezosa (placeholder washi mientras carga). */
function buildProductCard(p) {
  const card = document.createElement('article');
  card.className = 'card';
  const agotado = p.stock === 0;
  const tag = [p.estiloJp || p.estilo, p.especie].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="card-media" data-open-modal="${p.id}">
      ${agotado ? `<span class="stock-badge">Agotado</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-top">
        <h3>${p.nombre}</h3>
        <span class="price">${p.precio ? money(p.precio) : p.precioTexto || 'Consultar'}</span>
      </div>
      ${tag ? `<div class="card-tag">${tag}</div>` : ''}
      <div class="card-actions">
        <button class="mini-btn" data-open-modal="${p.id}">Ver detalle</button>
        <button class="mini-btn solid" data-quick-add="${p.id}" ${agotado ? 'disabled' : ''}>Agregar</button>
      </div>
    </div>`;

  const media = card.querySelector('.card-media');
  loadProductImages(p).then(imgs => {
    const badge = agotado ? `<span class="stock-badge">Agotado</span>` : '';
    media.innerHTML = imgs[0]
      ? `<img src="${imgs[0]}" alt="${p.nombre}" loading="lazy">${badge}`
      : `<div class="viewer-placeholder" style="position:absolute; inset:0;"><div class="kanji">近日</div><span>Foto próximamente</span></div>${badge}`;
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
  // Los marcados como "Destacado" en el Sheet van primero en la portada.
  const orden = [...PRODUCTS.filter(p => p.destacado), ...PRODUCTS.filter(p => !p.destacado)];
  orden.slice(0, 8).forEach(p => track.appendChild(buildProductCard(p)));
  wrap.hidden = false;
}

function renderCatalogCta() {
  const cta = $('catalog-cta');
  if (!cta) return;
  const n = PRODUCTS.length;
  const estilos = catalogStyles().length;
  $('catalog-cta-count').textContent =
    `${n} ${n === 1 ? 'árbol disponible' : 'árboles disponibles'}` +
    (estilos ? ` · ${estilos} ${estilos === 1 ? 'estilo' : 'estilos'}` : '');
  cta.hidden = false;
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

function openModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  modalProduct = p;
  modalImgIndex = 0;
  modalQty = 1;
  document.getElementById('qty-value').textContent = '1';
  document.querySelectorAll('#modal-tier-picker input').forEach((el, i) => { el.checked = i === 0; });

  document.getElementById('modal-style').textContent = [p.estiloJp, p.estilo].filter(Boolean).join(' · ');
  document.getElementById('modal-title').textContent = p.nombre;
  document.getElementById('modal-species').textContent = p.especie || '';
  document.getElementById('modal-species').style.display = p.especie ? '' : 'none';
  document.getElementById('modal-story').textContent = p.historia;

  const specs = [
    ['Altura', p.altura], ['Edad', p.edad], ['Maceta', p.maceta],
    ['Ambiente', p.ambiente ? (p.ambiente === 'interior' ? 'Interior' : 'Exterior') : '']
  ].filter(([, v]) => v);
  document.getElementById('modal-specs').innerHTML = specs.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');

  document.getElementById('modal-care').innerHTML = Object.entries(p.cuidado)
    .map(([k, v]) => `<div class="care-item"><b>${k}</b>${v}</div>`).join('');

  updateModalPrice();
  updateViewer();
  loadProductImages(p).then(() => { if (modalProduct === p) updateViewer(); });

  const overlay = document.getElementById('product-modal');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('product-modal').classList.remove('open');
  document.body.style.overflow = '';
  modalProduct = null;
}

function updateViewer() {
  const img = document.getElementById('modal-viewer-img');
  const placeholder = document.getElementById('modal-viewer-placeholder');
  const bar = document.getElementById('viewer-progress-bar');
  const images = modalProduct.images || [];
  if (!images.length) {
    img.hidden = true;
    placeholder.hidden = false;
    bar.style.width = '0%';
    return;
  }
  img.hidden = false;
  placeholder.hidden = true;
  img.src = images[modalImgIndex];
  img.alt = modalProduct.nombre + ' — foto ' + (modalImgIndex + 1);
  bar.style.width = ((modalImgIndex + 1) / images.length * 100) + '%';
}

function stepViewer(delta) {
  if (!modalProduct || !modalProduct.images || !modalProduct.images.length) return;
  const n = modalProduct.images.length;
  modalImgIndex = (modalImgIndex + delta + n) % n;
  updateViewer();
}

function updateModalPrice() {
  if (!modalProduct) return;
  const total = modalProduct.precio * modalQty;
  document.getElementById('modal-price').textContent = modalProduct.precio ? money(total) : (modalProduct.precioTexto || 'Consultar');
}

function initViewerDrag() {
  const viewer = $('modal-viewer');
  if (!viewer) return;
  let dragging = false, startX = 0, acc = 0;
  const THRESHOLD = 24;

  const start = (x) => { dragging = true; startX = x; acc = 0; };
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
/* -------------------------------------------------------------------- */

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(product, qty, tier) {
  const key = product.id + '|' + (tier || '');
  const existing = cart.find(i => i.key === key);
  if (existing) existing.cantidad += qty;
  else cart.push({
    key, id: product.id, nombre: product.nombre, precio: product.precio,
    precioTexto: product.precioTexto, imagen: (product.images && product.images[0]) || '',
    cantidad: qty, tier: tier || ''
  });
  saveCart();
  renderCart();
  loadProductImages(product).then(imgs => {
    const item = cart.find(i => i.key === key);
    if (item && !item.imagen && imgs[0]) { item.imagen = imgs[0]; saveCart(); renderCart(); }
  });
}

function updateCartCount() {
  const count = cart.reduce((sum, i) => sum + i.cantidad, 0);
  const badge = $('cart-count');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('visually-hidden', count === 0);
}

function renderCart() {
  const wrap = $('cart-items');
  if (!wrap) return;
  if (!cart.length) {
    wrap.innerHTML = '<p class="cart-empty">Tu carrito está vacío. Explora el catálogo y elige tu primer legado.</p>';
  } else {
    wrap.innerHTML = cart.map(item => `
      <div class="cart-item" data-key="${item.key}">
        ${item.imagen ? `<img src="${item.imagen}" alt="${item.nombre}">` : `<div style="width:56px;height:56px;border-radius:3px;background:var(--washi);"></div>`}
        <div class="cart-item-body">
          <h4>${item.nombre}</h4>
          ${item.tier ? `<div class="tier-note">+ ${item.tier}</div>` : ''}
          <div class="cart-item-row">
            <div class="qty-stepper">
              <button type="button" data-cart-minus="${item.key}">&minus;</button>
              <span>${item.cantidad}</span>
              <button type="button" data-cart-plus="${item.key}">&plus;</button>
            </div>
            <span>${item.precio ? money(item.precio * item.cantidad) : (item.precioTexto || '')}</span>
          </div>
          <button class="cart-item-remove" data-cart-remove="${item.key}">Quitar</button>
        </div>
      </div>`).join('');
  }
  const total = cart.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
  document.getElementById('cart-total').textContent = money(total);
  updateCartCount();
}

function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
}
function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
}

function checkoutViaWhatsapp() {
  if (!cart.length) return;
  const lines = cart.map(i => `• ${i.cantidad} x ${i.nombre}${i.tier ? ' + ' + i.tier : ''} — ${i.precio ? money(i.precio * i.cantidad) : (i.precioTexto || 'consultar')}`);
  const total = cart.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
  const message = [
    'Hola, quiero confirmar este pedido de Legado Bonsai:',
    '',
    ...lines,
    '',
    'Total estimado: ' + money(total)
  ].join('\n');
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
  const highlight = document.getElementById('moon-highlight');
  highlight.className = 'moon-highlight season-' + season;
  highlight.querySelector('.phase').textContent = current.mes + ' — ' + current.fase;
  highlight.querySelector('p').textContent = current.accion;
}

/* -------------------------------------------------------------------- */
/*  Chat FAQ                                                             */
/* -------------------------------------------------------------------- */

const FAQ = [
  { q: '¿Hacen envíos a nivel nacional?', a: '📦 Sí, realizamos envíos a todo el país con un costo adicional según la ciudad.' },
  { q: '¿Cuáles son las formas de pago?', a: '💳 Aceptamos PayPhone y transferencias a Banco Pichincha, Produbanco y Pacífico.' },
  { q: '¿Cuánto cuesta el envío?', a: '🚚 Depende de la ciudad. Escríbenos tu ubicación y te confirmamos el costo.' },
  { q: '¿En cuánto tiempo llega mi bonsái?', a: '⏳ De 1 a 3 días hábiles, dependiendo de la ciudad.' },
  { q: '¿Cómo cuido mi bonsái?', a: '🌱 Cada árbol llega con su ficha de cuidado, y activamos recordatorios por fase lunar.' },
  { q: '¿Tienen garantía los bonsáis?', a: '🛡️ Sí, si tu árbol llega en mal estado, lo reemplazamos.' },
  { q: '¿Puedo elegir la maceta?', a: '🪴 ¡Sí! Tenemos opciones de maceta. Cuéntanos tu preferencia por WhatsApp.' },
  { q: '¿Qué estilos de junípero tienen?', a: '🌳 Manejamos junípero en 4 estilos: erguido, inclinado, cascada y raíz sobre roca.' },
  { q: '¿Puedo pedir un acompañamiento personalizado?', a: '🎨 Sí, cuéntanos qué necesitas (poda, trasplante, alambrado) y armamos un plan.' },
  { q: '¿Dan talleres presenciales?', a: '🌳 Sí, tenemos talleres de Introducción al Bonsái, Alambrado y Poda, Trasplante Guiado, y una Experiencia en Pareja — no necesitas tener un árbol para tomarlos.' },
  { q: '¿Cómo sé si un junípero es de interior o exterior?', a: '🏡 Lo indicamos en cada ficha de producto. Dinos cuál te interesa y te asesoramos.' },
  { q: '¿Tienen redes sociales?', a: '📲 Sí, estamos en Instagram y Facebook. Te pasamos los links por WhatsApp.' },
  { q: '¿Cómo hago mi pedido?', a: '🛍️ Agrega tus junípero al carrito y presiona "Finalizar por WhatsApp".' },
  { q: '¿Dónde están ubicados?', a: '📍 Estamos en Ecuador y hacemos envíos a todo el país.' },
  { q: '¿Puedo ver fotos reales de los bonsáis?', a: '📸 Sí, cada ficha de producto tiene fotos 360° reales de nuestro stock.' }
];

function renderFaq() {
  const wrap = $('faq-options');
  if (!wrap) return;
  wrap.innerHTML = FAQ.map(f => `<button class="faq-question" data-q="${f.q}">${f.q}</button>`).join('');
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

  fetchCatalog();
  renderLunarCalendar();
  renderFaq();
  renderCart();
  initViewerDrag();
  observeReveal();
  initTheme();
  initMagneticButtons();
  initParallax();
  initCarouselNav();

  // Filtros / orden / búsqueda (página de catálogo)
  ['filter-ambiente', 'sort-by'].forEach(id => on(id, 'change', () => {
    catalogVisibleCount = CATALOG_PAGE_SIZE;
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

  // Modal
  on('modal-close-btn', 'click', closeModal);
  on('product-modal', 'click', (e) => { if (e.target.id === 'product-modal') closeModal(); });
  on('viewer-prev', 'click', () => stepViewer(-1));
  on('viewer-next', 'click', () => stepViewer(1));
  on('qty-minus', 'click', () => { modalQty = Math.max(1, modalQty - 1); $('qty-value').textContent = modalQty; updateModalPrice(); });
  on('qty-plus', 'click', () => { modalQty += 1; $('qty-value').textContent = modalQty; updateModalPrice(); });
  on('modal-add-cart', 'click', () => {
    if (!modalProduct) return;
    const tier = document.querySelector('#modal-tier-picker input:checked')?.value || '';
    addToCart(modalProduct, modalQty, tier);
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
    on('subscribe-form', 'submit', (e) => {
      e.preventDefault();
      alert('¡Gracias por suscribirte! Tu código de descuento es: LEGADO10');
      popupOverlay.classList.remove('open');
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
