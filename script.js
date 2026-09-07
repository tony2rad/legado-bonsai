/* ==========================================================================
   Legado Bonsai — lógica de la tienda
   Fuente de inventario: Google Sheet publicado como CSV (misma hoja que ya
   usaba el sitio). Columnas ya existentes: Nombre, Imagen, Altura, Maceta,
   Edad, Ubicación, Riego, Precio.
   Columnas OPCIONALES nuevas que enriquecen la ficha si las agregas a la
   hoja (si faltan, se usa un texto genérico y no se rompe nada):
     Estilo        -> ej. "Erguido"        (nombre del estilo en español)
     EstiloJP       -> ej. "直幹 · Chokkan" (nombre del estilo en japonés)
     Especie        -> ej. "Juniperus chinensis"
     Ambiente       -> "Interior" o "Exterior" (para el filtro)
     Historia       -> 1-2 frases de historia/significado del estilo
     Ventilacion    -> texto de cuidado
     Poda           -> texto de cuidado
     Trasplante     -> texto de cuidado
     Alambrado      -> texto de cuidado
     Stock          -> número; 0 = agotado
   ========================================================================== */

const WHATSAPP_NUMBER = '593988731431';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7aPPBgI7Z-jHXECrFKBI9gbYMJiSHOYOyZiMqlzNEckqxuatlIeDuOhgyx2MEamadhFFqD4pk64hQ/pub?gid=1316703737&single=true&output=csv';
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

/* -------------------------------------------------------------------- */
/*  Carga e interpretación del catálogo                                  */
/* -------------------------------------------------------------------- */

async function fetchCatalog() {
  const statusEl = document.getElementById('catalog-status');
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    const rows = parseCsv(csv);
    if (!rows.length) throw new Error('Hoja vacía');
    const products = await Promise.all(rows.map(normalizeProduct));
    PRODUCTS = products;
    statusEl.hidden = true;
    populateStyleFilter(products);
    renderCatalog();
  } catch (err) {
    console.error('No se pudo cargar el catálogo:', err);
    statusEl.hidden = false;
    statusEl.innerHTML = 'No pudimos cargar el catálogo en este momento. ' +
      '<a href="https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent('Hola, quiero ver los junípero disponibles') + '" target="_blank" rel="noopener" style="color:var(--kohaku); font-weight:700;">Escríbenos por WhatsApp</a> y te mostramos el stock al momento.';
  }
}

async function normalizeProduct(row) {
  const carpeta = row.Imagen || '';
  const images = carpeta ? await detectImages(carpeta) : [];
  return {
    id: slugify(row.Nombre || carpeta || Math.random().toString(36).slice(2)),
    nombre: row.Nombre || 'Junípero Legado',
    estilo: row.Estilo || '',
    estiloJp: row.EstiloJP || '',
    especie: row.Especie || '',
    ambiente: (row.Ambiente || '').toLowerCase(),
    altura: row.Altura || '',
    edad: row.Edad || '',
    maceta: row.Maceta || '',
    historia: row.Historia || 'Cada junípero se forma durante años de poda y alambrado cuidadoso — el tuyo continúa esa historia desde hoy.',
    cuidado: {
      Ubicación: row['Ubicación'] || 'Luz solar directa varias horas al día; consúltanos según tu ciudad.',
      Riego: row.Riego || 'Riega cuando la capa superior del sustrato esté seca al tacto.',
      Ventilación: row.Ventilacion || row['Ventilación'] || 'Prefiere espacios con buena circulación de aire, idealmente al aire libre.',
      Poda: row.Poda || 'Poda de mantenimiento según la fase lunar — te enviamos el calendario.',
      Trasplante: row.Trasplante || 'Cada 2 a 3 años, preferiblemente en luna menguante.',
      Alambrado: row.Alambrado || 'Disponible como parte del plan Cultivo Guiado.'
    },
    precio: parsePrice(row.Precio),
    precioTexto: row.Precio || '',
    stock: row.Stock === undefined || row.Stock === '' ? null : parseInt(row.Stock, 10),
    images
  };
}

function detectImages(carpeta) {
  const prefix = carpeta.toLowerCase();
  const tryLoad = (n) => new Promise((resolve) => {
    const img = new Image();
    const src = `imagenes/360/${carpeta}/${prefix}_${pad2(n)}.jpg`;
    img.onload = () => resolve(src);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return Promise.all(Array.from({ length: 12 }, (_, i) => tryLoad(i + 1)))
    .then(results => results.filter(Boolean));
}

/* -------------------------------------------------------------------- */
/*  Render catálogo                                                      */
/* -------------------------------------------------------------------- */

function populateStyleFilter(products) {
  const sel = document.getElementById('filter-estilo');
  const estilos = [...new Set(products.map(p => p.estilo).filter(Boolean))];
  estilos.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e; opt.textContent = e;
    sel.appendChild(opt);
  });
}

function getFilteredSorted() {
  const estilo = document.getElementById('filter-estilo').value;
  const ambiente = document.getElementById('filter-ambiente').value;
  const sort = document.getElementById('sort-by').value;

  let list = PRODUCTS.filter(p => {
    if (estilo !== 'all' && p.estilo !== estilo) return false;
    if (ambiente !== 'all' && p.ambiente && p.ambiente !== ambiente) return false;
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

function renderCatalog() {
  const grid = document.getElementById('product-grid');
  const statusEl = document.getElementById('catalog-status');
  const list = getFilteredSorted();
  grid.innerHTML = '';

  if (!list.length) {
    statusEl.hidden = false;
    statusEl.textContent = 'No hay junípero que coincidan con ese filtro por ahora.';
    return;
  }
  statusEl.hidden = true;

  list.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const agotado = p.stock === 0;
    const tag = [p.estiloJp || p.estilo, p.especie].filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="card-media" data-open-modal="${p.id}">
        ${p.images[0] ? `<img src="${p.images[0]}" alt="${p.nombre}" loading="lazy">` : `<div class="viewer-placeholder" style="position:absolute; inset:0;"><div class="kanji">近日</div><span>Foto próximamente</span></div>`}
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
    grid.appendChild(card);
  });
  observeReveal(grid);
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
  const images = modalProduct.images;
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
  if (!modalProduct || !modalProduct.images.length) return;
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
  const viewer = document.getElementById('modal-viewer');
  let dragging = false, startX = 0, acc = 0;
  const THRESHOLD = 24;

  const start = (x) => { dragging = true; startX = x; acc = 0; };
  const move = (x) => {
    if (!dragging || !modalProduct || !modalProduct.images.length) return;
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
    precioTexto: product.precioTexto, imagen: product.images[0] || '',
    cantidad: qty, tier: tier || ''
  });
  saveCart();
  renderCart();
}

function updateCartCount() {
  const count = cart.reduce((sum, i) => sum + i.cantidad, 0);
  const badge = document.getElementById('cart-count');
  badge.textContent = count;
  badge.classList.toggle('visually-hidden', count === 0);
}

function renderCart() {
  const wrap = document.getElementById('cart-items');
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

function renderLunarCalendar() {
  const tbody = document.querySelector('#cal-table tbody');
  const currentMonth = new Date().getMonth();
  tbody.innerHTML = LUNAR_CALENDAR.map((row, i) => `
    <tr class="${i === currentMonth ? 'current' : ''}">
      <td class="month">${row.mes}</td>
      <td class="fase">${row.fase}</td>
      <td>${row.accion}</td>
    </tr>`).join('');

  const current = LUNAR_CALENDAR[currentMonth];
  const highlight = document.getElementById('moon-highlight');
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
  { q: '¿Cómo sé si un junípero es de interior o exterior?', a: '🏡 Lo indicamos en cada ficha de producto. Dinos cuál te interesa y te asesoramos.' },
  { q: '¿Tienen redes sociales?', a: '📲 Sí, estamos en Instagram y Facebook. Te pasamos los links por WhatsApp.' },
  { q: '¿Cómo hago mi pedido?', a: '🛍️ Agrega tus junípero al carrito y presiona "Finalizar por WhatsApp".' },
  { q: '¿Dónde están ubicados?', a: '📍 Estamos en Ecuador y hacemos envíos a todo el país.' },
  { q: '¿Puedo ver fotos reales de los bonsáis?', a: '📸 Sí, cada ficha de producto tiene fotos 360° reales de nuestro stock.' }
];

function renderFaq() {
  const wrap = document.getElementById('faq-options');
  wrap.innerHTML = FAQ.map(f => `<button class="faq-question" data-q="${f.q}">${f.q}</button>`).join('');
}

/* -------------------------------------------------------------------- */
/*  Revelado al hacer scroll                                             */
/* -------------------------------------------------------------------- */

let revealObserver = null;
function observeReveal(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.14 });
  }
  root.querySelectorAll('.section-head, .pillar, .tier-card, .step, .testimonial, .blog-post, .quote-break-overlay, .card, .enso')
    .forEach((el) => { if (!el.classList.contains('in-view')) revealObserver.observe(el); });
}

/* -------------------------------------------------------------------- */
/*  Init                                                                 */
/* -------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();

  fetchCatalog();
  renderLunarCalendar();
  renderFaq();
  renderCart();
  initViewerDrag();
  observeReveal();

  // Filtros / orden
  ['filter-estilo', 'filter-ambiente', 'sort-by'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderCatalog);
  });

  // Delegación de clics en el grid (ver detalle / agregar rápido)
  document.getElementById('product-grid').addEventListener('click', (e) => {
    const openId = e.target.closest('[data-open-modal]')?.getAttribute('data-open-modal');
    const quickId = e.target.closest('[data-quick-add]')?.getAttribute('data-quick-add');
    if (openId) openModal(openId);
    else if (quickId) {
      const p = PRODUCTS.find(x => x.id === quickId);
      if (p) { addToCart(p, 1, ''); openCart(); }
    }
  });

  // Modal
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('product-modal').addEventListener('click', (e) => { if (e.target.id === 'product-modal') closeModal(); });
  document.getElementById('viewer-prev').addEventListener('click', () => stepViewer(-1));
  document.getElementById('viewer-next').addEventListener('click', () => stepViewer(1));
  document.getElementById('qty-minus').addEventListener('click', () => { modalQty = Math.max(1, modalQty - 1); document.getElementById('qty-value').textContent = modalQty; updateModalPrice(); });
  document.getElementById('qty-plus').addEventListener('click', () => { modalQty += 1; document.getElementById('qty-value').textContent = modalQty; updateModalPrice(); });
  document.getElementById('modal-add-cart').addEventListener('click', () => {
    if (!modalProduct) return;
    const tier = document.querySelector('#modal-tier-picker input:checked')?.value || '';
    addToCart(modalProduct, modalQty, tier);
    closeModal();
    openCart();
  });

  // Menú móvil
  const navLinks = document.querySelector('.nav-links');
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  navToggleBtn.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggleBtn.setAttribute('aria-expanded', String(open));
  });
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { navLinks.classList.remove('open'); navToggleBtn.setAttribute('aria-expanded', 'false'); }
  });

  // Carrito
  document.getElementById('cart-open-btn').addEventListener('click', openCart);
  document.getElementById('cart-close-btn').addEventListener('click', closeCart);
  document.getElementById('cart-overlay').addEventListener('click', closeCart);
  document.getElementById('cart-checkout-btn').addEventListener('click', checkoutViaWhatsapp);
  document.getElementById('cart-items').addEventListener('click', (e) => {
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

  // Popup newsletter (no interrumpe si hay un modal o el carrito abiertos)
  const popupOverlay = document.getElementById('popup-overlay');
  setTimeout(() => {
    const modalOpen = document.getElementById('product-modal').classList.contains('open');
    const cartOpen = document.getElementById('cart-drawer').classList.contains('open');
    if (!modalOpen && !cartOpen) popupOverlay.classList.add('open');
  }, 6000);
  document.getElementById('popup-close-btn').addEventListener('click', () => popupOverlay.classList.remove('open'));
  popupOverlay.addEventListener('click', (e) => { if (e.target.id === 'popup-overlay') popupOverlay.classList.remove('open'); });
  document.getElementById('subscribe-form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('¡Gracias por suscribirte! Tu código de descuento es: LEGADO10');
    popupOverlay.classList.remove('open');
  });

  // Chat FAQ
  const chatBox = document.getElementById('chat-box');
  document.getElementById('chat-button').addEventListener('click', () => chatBox.classList.toggle('visible'));
  document.getElementById('close-chat').addEventListener('click', () => chatBox.classList.remove('visible'));
  document.getElementById('faq-options').addEventListener('click', (e) => {
    const q = e.target.closest('.faq-question')?.getAttribute('data-q');
    if (!q) return;
    const chatBody = document.getElementById('chat-body');
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
  document.getElementById('contact-form').addEventListener('submit', (e) => {
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
