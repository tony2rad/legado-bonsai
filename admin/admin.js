/* ==========================================================================
   Legado Bonsai — app de registro (admin/)
   Móvil primero. Sin build: módulo ES nativo.
   - Lee/escribe en el Google Sheet a través del Web App (apps-script/Code.gs).
   - Fotos: cámara del teléfono (modo 360° automático con base giratoria o
     selección manual) → redimensión en el navegador → opcional quitar fondo
     con IA (@imgly/background-removal, se carga bajo demanda) → subida a
     Drive vía la API → URLs guardadas en la columna "Fotos" del ejemplar.
   - La tienda (script.js) lee esas URLs y arma el visor 360°.
   ========================================================================== */

const CFG_KEY = 'legadoAdminCfg';
const CACHE_KEY = 'legadoAdminCache';
const MAX_LADO = 1200;          // px del lado mayor al subir
const CALIDAD_JPG = 0.86;
const BG_REMOVAL_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1/+esm';

const ESTILOS = {
  'Erguido formal': '直幹 · Chokkan', 'Erguido informal': '模様木 · Moyogi', 'Inclinado': '斜幹 · Shakan',
  'Cascada': '懸崖 · Kengai', 'Semicascada': '半懸崖 · Han-kengai', 'Literati': '文人木 · Bunjin',
  'Barrido por el viento': '吹流し · Fukinagashi', 'Doble tronco': '双幹 · Sokan', 'Bosque': '寄せ植え · Yose-ue',
  'Sobre roca': '石付き · Ishitsuki', 'Escoba': '箒立ち · Hokidachi', 'Raíces expuestas': '根上がり · Neagari',
  'Madera muerta': '舎利幹 · Sharimiki'
};

const state = {
  cfg: leerCfg(),
  data: leerCache(),
  capturas: [],        // [{blob, url}] fotos nuevas pendientes de subir
  editId: null,        // ID cuando se edita un ejemplar existente
  subida: null         // estado de una subida interrumpida (para reintentar)
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyISO = () => new Date().toISOString().slice(0, 10);
const isoAFecha = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const fotosDe = (e) => String(e['Fotos'] || '').split(/[\n,]/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));

/* -------------------------------------------------------------------- */
/*  Configuración y API                                                   */
/* -------------------------------------------------------------------- */

function leerCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    if (!c.apiUrl && window.LEGADO_CONFIG?.API_URL) c.apiUrl = window.LEGADO_CONFIG.API_URL;
    return c;
  } catch { return {}; }
}
function guardarCfg(c) { state.cfg = c; localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
function leerCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } }
function conectado() { return !!(state.cfg.apiUrl && state.cfg.token); }

async function api(action, payload = {}, { silencioso = false } = {}) {
  if (!conectado()) throw new Error('Configura la conexión primero');
  const dot = $('estado-conexion');
  if (!silencioso) dot.className = 'dot busy';
  try {
    const res = await fetch(state.cfg.apiUrl, {
      method: 'POST',
      // text/plain evita el preflight CORS que Apps Script no responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: state.cfg.token, payload }),
      redirect: 'follow'
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    dot.className = 'dot ok';
    return data;
  } catch (err) {
    dot.className = 'dot bad';
    throw err;
  }
}

async function cargarDatos({ forzar = false } = {}) {
  if (!conectado()) return;
  if (!forzar && state.data && Date.now() - (state.data._ts || 0) < 60000) return state.data;
  const data = await api('listar');
  data._ts = Date.now();
  state.data = data;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* cache llena, no pasa nada */ }
  return data;
}

/* -------------------------------------------------------------------- */
/*  Router                                                                */
/* -------------------------------------------------------------------- */

const vistas = {
  config: renderConfig, inicio: renderInicio, ejemplares: renderEjemplares, ejemplar: renderDetalle,
  nuevo: () => renderFormulario(null), editar: renderFormulario, venta: renderVenta, cuidado: renderCuidado,
  materiales: renderMateriales
};

async function router() {
  const hash = location.hash.replace(/^#\/?/, '') || 'inicio';
  const [ruta, param] = hash.split('/');
  const query = new URLSearchParams(hash.split('?')[1] || '');
  const nombre = ruta.split('?')[0];
  const vista = conectado() ? (vistas[nombre] ? nombre : 'inicio') : 'config';
  const seccion = { nuevo: 'formulario', editar: 'formulario' }[vista] || vista;

  $$('.view').forEach(v => { v.hidden = v.dataset.view !== seccion; });
  $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === seccion));
  window.scrollTo(0, 0);

  try {
    if (vista !== 'config') await cargarDatos();
    await vistas[vista](param ? decodeURIComponent(param.split('?')[0]) : null, query);
  } catch (err) {
    toast(err.message, true);
    if (/Token inválido|Configura/.test(err.message)) { location.hash = '#/config'; }
  }
}

/* -------------------------------------------------------------------- */
/*  Vistas                                                                */
/* -------------------------------------------------------------------- */

function renderConfig() {
  const f = $('form-config');
  f.apiUrl.value = state.cfg.apiUrl || '';
  f.token.value = state.cfg.token || '';
  const c = document.createElement('canvas');
  const info = [
    ES_SAFARI ? 'Safari' : 'Chrome/otro',
    navigator.mediaDevices?.getUserMedia ? 'cámara: sí' : 'cámara: no',
    c.toDataURL('image/webp').startsWith('data:image/webp') ? 'WebP: sí' : 'WebP: no',
    location.protocol === 'https:' || location.hostname === 'localhost' ? 'HTTPS: sí' : 'HTTPS: no (la cámara no funcionará)'
  ];
  $('config-info').textContent = 'Este dispositivo: ' + info.join(' · ');
}

function renderInicio() {
  const d = state.data;
  if (!d) return;
  const r = d.resumen;
  $('kpis').innerHTML = [
    ['Disponibles', r.disponibles, 'accent'], ['Reservados', r.reservados], ['Vendidos', r.vendidos],
    ['Valor disponible', money(r.valorDisponible)], ['Ejemplares', r.total], ['En formación', r.enFormacion],
    ['Materiales', money(r.valorMateriales)], ['Ventas (30 últ.)', d.ventas.length]
  ].map(([k, v, cls]) => `<div class="kpi ${cls || ''}"><b>${v}</b><span>${k}</span></div>`).join('');

  const movs = [
    ...d.ventas.map(v => ({ f: v['Fecha'], tag: 'venta', t: `${v['ID Ejemplar']} · ${v['Cliente']} · ${money(v['Precio final'])}`, s: v['Plan de acompañamiento'] || v['Estado'] })),
    ...d.cuidados.map(c => ({ f: c['Fecha'], tag: c['Tipo'], t: `${c['ID Ejemplar']} · ${c['Detalle'] || ''}`, s: c['Fase lunar'] }))
  ].sort((a, b) => fechaOrden(b.f) - fechaOrden(a.f)).slice(0, 12);
  $('timeline').innerHTML = movs.length
    ? movs.map(m => `<li><span class="tag ${m.tag === 'venta' ? 'venta' : ''}">${esc(m.tag)}</span><div>${esc(m.t)}<small>${esc(m.f)}${m.s ? ' · ' + esc(m.s) : ''}</small></div></li>`).join('')
    : '<li><div class="empty">Sin movimientos todavía.</div></li>';
}

function fechaOrden(f) {
  const m = String(f || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(m[3], m[2] - 1, m[1]).getTime() : 0;
}

function renderEjemplares() {
  const lista = $('lista-ejemplares');
  const q = ($('buscar').value || '').toLowerCase();
  const est = $('filtro-estado').value;
  const items = (state.data?.inventario || []).filter(e =>
    (!est || e['Estado comercial'] === est) &&
    (!q || [e['ID'], e['Nombre comercial'], e['Especie'], e['Código SKU'], e['Estilo']].join(' ').toLowerCase().includes(q))
  ).reverse();
  $('ejemplares-count').textContent = items.length + ' ejemplar' + (items.length === 1 ? '' : 'es');
  lista.innerHTML = items.length ? items.map(e => {
    const fotos = fotosDe(e);
    return `<a class="item" href="#/ejemplar/${encodeURIComponent(e['ID'])}">
      <div class="thumb">${fotos[0] ? `<img src="${esc(fotos[0])}" alt="" loading="lazy">` : '盆'}</div>
      <div><div class="id">${esc(e['ID'])}${e['Código SKU'] ? ' · ' + esc(e['Código SKU']) : ''}</div>
        <div class="name">${esc(e['Nombre comercial'])}</div>
        <div class="sub">${esc([e['Estilo'], e['Altura (cm)'] ? e['Altura (cm)'] + ' cm' : '', e['Edad (años)'] ? e['Edad (años)'] + ' años' : ''].filter(Boolean).join(' · '))}</div>
        <span class="badge ${esc(e['Estado comercial'])}">${esc(e['Estado comercial'] || '—')}</span></div>
      <div class="price">${e['Precio venta'] !== '' ? money(e['Precio venta']) : '—'}</div>
    </a>`;
  }).join('') : '<div class="empty">No hay ejemplares con ese filtro.</div>';
}

function renderDetalle(id) {
  const e = (state.data?.inventario || []).find(x => x['ID'] === id);
  const box = $('detalle');
  if (!e) { box.innerHTML = '<div class="empty">No se encontró el ejemplar.</div>'; return; }
  const fotos = fotosDe(e);
  const cuidados = (state.data.cuidados || []).filter(c => c['ID Ejemplar'] === id);
  const ventas = (state.data.ventas || []).filter(v => v['ID Ejemplar'] === id);
  const specs = [
    ['Especie', e['Especie']], ['Estilo', [e['Estilo'], e['Estilo JP']].filter(Boolean).join(' · ')],
    ['Ambiente', e['Ambiente']], ['Ubicación', e['Ubicación física']],
    ['Altura', e['Altura (cm)'] ? e['Altura (cm)'] + ' cm' : ''], ['Edad', e['Edad (años)'] ? e['Edad (años)'] + ' años' : ''],
    ['Maceta', e['Maceta']], ['Salud', e['Estado de salud']],
    ['Costo', e['Costo total'] !== '' ? money(e['Costo total']) : ''], ['Margen', e['Margen $'] !== '' ? money(e['Margen $']) : ''],
    ['Ingreso', e['Fecha de ingreso']], ['Última poda', e['Última poda']],
    ['Último trasplante', e['Último trasplante']], ['Último alambrado', e['Último alambrado']],
    ['Riego', e['Riego']], ['Destacado', e['Destacado']]
  ].filter(([, v]) => v);

  box.innerHTML = `
    <div class="detail-head">
      <div><div class="id">${esc(e['ID'])}${e['Código SKU'] ? ' · ' + esc(e['Código SKU']) : ''}</div><h1>${esc(e['Nombre comercial'])}</h1></div>
      <div style="text-align:right"><div class="price" style="font-family:var(--serif);font-size:1.3rem;font-weight:600">${e['Precio venta'] !== '' ? money(e['Precio venta']) : '—'}</div><span class="badge ${esc(e['Estado comercial'])}">${esc(e['Estado comercial'] || '—')}</span></div>
    </div>
    <div class="detail-viewer" id="detail-viewer">
      ${fotos.length ? `<img id="detail-img" src="${esc(fotos[0])}" alt=""><span class="n" id="detail-n">1 / ${fotos.length}</span>` : '<div class="ph">Sin fotos — edita el ejemplar para agregarlas</div>'}
    </div>
    ${fotos.length > 1 ? '<p class="hint" style="text-align:center">Desliza sobre la foto para girar</p>' : ''}
    <div class="specs">${specs.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>
    ${e['Historia'] ? `<p><i>${esc(e['Historia'])}</i></p>` : ''}
    ${e['Notas'] ? `<p class="hint">Notas: ${esc(e['Notas'])}</p>` : ''}
    <div class="detail-actions">
      <a class="btn solid" href="#/editar/${encodeURIComponent(id)}">Editar / fotos</a>
      <a class="btn" href="#/venta?id=${encodeURIComponent(id)}">Registrar venta</a>
      <a class="btn wide" href="#/cuidado?id=${encodeURIComponent(id)}">Registrar cuidado</a>
    </div>
    <h2>Historial</h2>
    <ul class="history">
      ${ventas.map(v => `<li><b>Venta</b> · ${esc(v['Cliente'])} · ${money(v['Precio final'])} · ${esc(v['Estado'])}<br><small>${esc(v['Fecha'])}${v['Plan de acompañamiento'] ? ' · ' + esc(v['Plan de acompañamiento']) : ''}</small></li>`).join('')}
      ${cuidados.map(c => `<li><b>${esc(c['Tipo'])}</b> · ${esc(c['Detalle'] || '')}<br><small>${esc(c['Fecha'])}${c['Fase lunar'] ? ' · ' + esc(c['Fase lunar']) : ''}${c['Próxima revisión sugerida'] ? ' · próxima: ' + esc(c['Próxima revisión sugerida']) : ''}</small></li>`).join('')}
      ${!ventas.length && !cuidados.length ? '<li><small>Sin registros todavía.</small></li>' : ''}
    </ul>`;

  if (fotos.length > 1) activarGiro($('detail-viewer'), fotos, (i) => { $('detail-img').src = fotos[i]; $('detail-n').textContent = (i + 1) + ' / ' + fotos.length; });
}

/** Arrastre horizontal → cambia de foto (misma sensación que la tienda). */
function activarGiro(el, fotos, onChange) {
  let idx = 0, x0 = null, acc = 0;
  const paso = 28;
  const start = (x) => { x0 = x; acc = 0; };
  const move = (x) => {
    if (x0 === null) return;
    acc += x - x0; x0 = x;
    while (Math.abs(acc) >= paso) {
      idx = (idx + (acc > 0 ? 1 : -1) + fotos.length) % fotos.length;
      acc -= Math.sign(acc) * paso;
      onChange(idx);
    }
  };
  el.addEventListener('mousedown', e => start(e.clientX));
  window.addEventListener('mousemove', e => move(e.clientX));
  window.addEventListener('mouseup', () => { x0 = null; });
  el.addEventListener('touchstart', e => start(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', () => { x0 = null; });
}

/* ---------------------------- Formulario ---------------------------- */

function renderFormulario(id) {
  const f = $('form-ejemplar');
  f.reset();
  limpiarCapturas();
  state.editId = id || null;
  state.subida = null;
  $('progreso').hidden = true;
  $('btn-guardar').disabled = false;

  const sel = $('sel-estilo');
  if (sel.options.length <= 1) Object.entries(ESTILOS).forEach(([es, jp]) => sel.add(new Option(`${es} — ${jp}`, es)));

  const e = id ? (state.data?.inventario || []).find(x => x['ID'] === id) : null;
  $('form-titulo').textContent = e ? `Editar ${e['ID']}` : 'Nuevo ejemplar';
  $('form-id-hint').textContent = e ? `${e['Nombre comercial']} · ingresado ${e['Fecha de ingreso'] || '—'}` : 'El código único (LB-0001, LB-0002, …) se asigna automáticamente al guardar.';
  $('fotos-existentes').hidden = true;

  if (e) {
    $$('[name]', f).forEach(inp => {
      const v = e[inp.name];
      if (inp.type === 'checkbox') inp.checked = /^s[ií]$/i.test(String(v || ''));
      else if (v !== undefined) inp.value = v;
    });
    const n = fotosDe(e).length;
    if (n) { $('fotos-existentes').hidden = false; $('fotos-existentes-n').textContent = n; }
  } else {
    f['Especie'].value = "Juniperus chinensis 'Shimpaku'";
    f['Ambiente'].value = 'Exterior';
    f['Estado comercial'].value = 'Disponible';
  }
  actualizarMargen();
}

function actualizarMargen() {
  const f = $('form-ejemplar');
  const c = parseFloat(f['Costo total'].value), p = parseFloat(f['Precio venta'].value);
  $('margen-hint').textContent = (c >= 0 && p > 0 && !isNaN(c)) ? `Margen: ${money(p - c)} (${Math.round((p - c) / p * 100)} %)` : '';
}

async function guardarEjemplar(ev) {
  ev.preventDefault();
  const f = $('form-ejemplar');
  const btn = $('btn-guardar');
  const datos = {};
  $$('[name]', f).forEach(inp => {
    if (inp.type === 'checkbox') datos[inp.name] = inp.checked ? 'Sí' : 'No';
    else datos[inp.name] = inp.value.trim();
  });
  if (datos['Estilo']) datos['Estilo JP'] = ESTILOS[datos['Estilo']] || '';

  btn.disabled = true;
  const prog = $('progreso'); prog.hidden = false; $('btn-reintentar').hidden = true;
  const setProg = (pct, msg) => { $('progreso-bar').style.width = pct + '%'; $('progreso-msg').textContent = msg; };
  let paso = 'inicio';   // para que un error diga exactamente dónde ocurrió

  try {
    // 1) Datos del ejemplar
    let id = state.editId;
    if (!state.subida) {
      paso = 'guardar datos';
      setProg(4, 'Guardando datos…');
      if (id) await api('actualizar', { id, cambios: datos });
      else { const r = await api('crear', datos); id = r.id; }
      state.subida = { id, urls: [], idx: 0, blobs: null };
    }
    id = state.subida.id;

    // 2) Fotos (procesadas una a una para no agotar memoria en el teléfono)
    if (state.capturas.length) {
      let quitar = $('quitar-fondo').checked;
      const total = state.capturas.length;
      for (let i = state.subida.idx; i < total; i++) {
        const base = 8 + (i / total) * 88;
        const etiqueta = `Foto ${i + 1} de ${total}`;
        paso = etiqueta + ' · preparar';
        setProg(base, etiqueta + ': preparando…');
        let blob = await redimensionar(state.capturas[i].blob, MAX_LADO, quitar ? 'image/png' : 'image/jpeg');
        if (quitar) {
          paso = etiqueta + ' · quitar fondo';
          try {
            blob = await quitarFondo(blob, (p) => setProg(base, etiqueta + ': quitando fondo… ' + p));
          } catch (errFondo) {
            // No detiene el guardado: la foto se sube con fondo.
            console.warn('Quitar fondo falló', errFondo);
            toast('No se pudo quitar el fondo en este teléfono; se suben con fondo', true);
            quitar = false;
            blob = await redimensionar(state.capturas[i].blob, MAX_LADO, 'image/jpeg');
          }
        }
        paso = etiqueta + ' · convertir';
        const base64 = await aBase64(blob);
        paso = etiqueta + ' · subir';
        setProg(base + (44 / total), etiqueta + ': subiendo…');
        const r = await api('subirFoto', { id, indice: i + 1, base64, mime: blob.type || 'image/jpeg' }, { silencioso: true });
        state.subida.urls.push(r.url);
        state.subida.idx = i + 1;
      }
      paso = 'publicar fotos';
      setProg(96, 'Publicando fotos…');
      await api('actualizar', { id, cambios: { 'Fotos': state.subida.urls.join(', ') } });
      // "Calienta" cada foto pidiéndola una vez, en orden: Google la genera y
      // la deja en caché, así el primer cliente que abra la ficha la ve al instante.
      paso = 'preparar fotos para la tienda';
      for (let i = 0; i < state.subida.urls.length; i++) {
        setProg(96 + (i + 1) / state.subida.urls.length * 3, `Preparando foto ${i + 1} de ${state.subida.urls.length} para la tienda…`);
        await calentarFoto(state.subida.urls[i]);
      }
    }

    paso = 'final';
    setProg(100, 'Listo');
    toast(`${id} guardado${state.capturas.length ? ' con ' + state.capturas.length + ' fotos' : ''}`);
    state.subida = null;
    limpiarCapturas();
    await cargarDatos({ forzar: true });
    location.hash = '#/ejemplar/' + encodeURIComponent(id);
  } catch (err) {
    const detalle = `Error en "${paso}": ${err.name || 'Error'} — ${err.message}`;
    console.error(detalle, err);
    setProg(parseFloat($('progreso-bar').style.width) || 0, detalle + (state.subida ? ` (ejemplar ${state.subida.id} ya creado; pulsa Reintentar para continuar con las fotos)` : ''));
    $('btn-reintentar').hidden = false;
    btn.disabled = false;
    toast(err.message, true);
  }
}

/* ------------------------------ Venta ------------------------------- */

function llenarSelectEjemplares(sel, filtro) {
  const items = (state.data?.inventario || []).filter(filtro);
  sel.innerHTML = '<option value="">— Elegir —</option>' + items.map(e =>
    `<option value="${esc(e['ID'])}" data-precio="${esc(e['Precio venta'])}">${esc(e['ID'])} · ${esc(e['Nombre comercial'])} · ${esc(e['Estado comercial'])}</option>`).join('');
}

function renderVenta(_, query) {
  const f = $('form-venta');
  f.reset();
  $('venta-msg').textContent = '';
  llenarSelectEjemplares($('venta-ejemplar'), e => ['Disponible', 'Reservado'].includes(e['Estado comercial']));
  f.fecha.value = hoyISO();
  const id = query.get('id');
  if (id) { f.id.value = id; precioSugerido(); }
}

function precioSugerido() {
  const f = $('form-venta');
  const opt = f.id.selectedOptions[0];
  if (opt && opt.dataset.precio && !f.precioFinal.value) f.precioFinal.value = opt.dataset.precio;
}

async function guardarVenta(ev) {
  ev.preventDefault();
  const f = $('form-venta');
  const msg = $('venta-msg');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Guardando…';
  try {
    const r = await api('venta', {
      id: f.id.value, cliente: f.cliente.value.trim(), contacto: f.contacto.value.trim(),
      precioFinal: f.precioFinal.value, fecha: isoAFecha(f.fecha.value), plan: f.plan.value,
      estado: f.estado.value, notas: f.notas.value.trim(), cantidad: 1
    });
    msg.className = 'msg ok'; msg.textContent = `Venta registrada. ${r.id} ahora está ${r.estadoEjemplar}.`;
    toast('Venta registrada');
    await cargarDatos({ forzar: true });
    f.reset(); f.fecha.value = hoyISO();
    llenarSelectEjemplares($('venta-ejemplar'), e => ['Disponible', 'Reservado'].includes(e['Estado comercial']));
  } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  btn.disabled = false;
}

/* ----------------------------- Cuidado ------------------------------ */

function renderCuidado(_, query) {
  const f = $('form-cuidado');
  f.reset();
  $('cuidado-msg').textContent = '';
  llenarSelectEjemplares($('cuidado-ejemplar'), e => e['Estado comercial'] !== 'Baja');
  f.fecha.value = hoyISO();
  const id = query.get('id');
  if (id) f.id.value = id;
}

async function guardarCuidado(ev) {
  ev.preventDefault();
  const f = $('form-cuidado');
  const msg = $('cuidado-msg');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Guardando…';
  try {
    await api('cuidado', {
      id: f.id.value, tipo: f.tipo.value, fecha: isoAFecha(f.fecha.value), faseLunar: f.faseLunar.value,
      estadoSalud: f.estadoSalud.value, detalle: f.detalle.value.trim(), responsable: f.responsable.value.trim(),
      proxima: isoAFecha(f.proxima.value)
    });
    msg.className = 'msg ok'; msg.textContent = 'Cuidado registrado.';
    toast('Cuidado registrado');
    await cargarDatos({ forzar: true });
    const id = f.id.value; f.reset(); f.fecha.value = hoyISO(); f.id.value = id;
  } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  btn.disabled = false;
}

/* ---------------------------- Materiales ---------------------------- */

function renderMateriales() {
  const m = state.data?.materiales || [];
  const total = m.reduce((s, x) => s + (parseFloat(x['Costo total']) || 0), 0);
  $('materiales-total').textContent = `${m.length} ítems · valor ${money(total)}`;
  $('tabla-materiales').innerHTML = `<tr><th>Material</th><th>Cant.</th><th>Unidad</th><th>Total</th></tr>` +
    m.map(x => `<tr><td>${esc(x['Herramienta / Material'])}${x['Observaciones'] ? `<br><small style="color:var(--ink-faint)">${esc(x['Observaciones'])}</small>` : ''}</td><td class="num">${esc(x['Cantidad'])}</td><td>${esc(x['Unidad'])}</td><td class="num">${x['Costo total'] !== '' ? money(x['Costo total']) : '—'}</td></tr>`).join('');
  $('dl-materiales').innerHTML = m.map(x => `<option value="${esc(x['Herramienta / Material'])}">`).join('');
  $('material-msg').textContent = '';
}

async function guardarMaterial(ev) {
  ev.preventDefault();
  const f = $('form-material');
  const msg = $('material-msg');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Guardando…';
  try {
    await api('material', {
      nombre: f.nombre.value.trim(), ajuste: f.ajuste.value, cantidad: f.cantidad.value,
      unidad: f.unidad.value.trim(), costoUnitario: f.costoUnitario.value, observaciones: f.observaciones.value.trim()
    });
    toast('Material guardado');
    await cargarDatos({ forzar: true });
    f.reset();
    renderMateriales();
  } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  btn.disabled = false;
}

/* -------------------------------------------------------------------- */
/*  Fotos: captura, vista previa, procesamiento                          */
/* -------------------------------------------------------------------- */

function agregarCaptura(blob) {
  state.capturas.push({ blob, url: URL.createObjectURL(blob) });
  renderCapturas();
}

function limpiarCapturas() {
  state.capturas.forEach(c => URL.revokeObjectURL(c.url));
  state.capturas = [];
  renderCapturas();
}

function renderCapturas() {
  const n = state.capturas.length;
  $('fotos-vacias').hidden = n > 0;
  $('preview-360').hidden = n === 0;
  $('thumbs').innerHTML = state.capturas.map((c, i) =>
    `<div class="thumb-item"><img src="${c.url}" alt=""><span class="num">${i + 1}</span><button type="button" class="del" data-del="${i}" aria-label="Quitar">✕</button></div>`).join('');
  if (n) {
    const r = $('preview-range');
    r.max = n - 1; r.value = Math.min(r.value, n - 1);
    mostrarPreview(parseInt(r.value, 10));
  }
}

function mostrarPreview(i) {
  const c = state.capturas[i];
  if (!c) return;
  $('preview-img').src = c.url;
  $('preview-count').textContent = `Foto ${i + 1} de ${state.capturas.length} — desliza para simular el giro`;
}

/** Redimensiona al lado mayor `max` y devuelve un Blob del tipo pedido. */
async function redimensionar(blob, max, tipo) {
  const bmp = await crearBitmap(blob);
  const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const out = await new Promise(res => canvas.toBlob(b => res(b), tipo, CALIDAD_JPG));
  if (!out) throw new Error('El navegador no pudo generar la imagen ' + tipo);
  return out;
}

/** Decodifica la imagen. En Safari se usa <img> (respeta EXIF y evita
    incompatibilidades de createImageBitmap); en el resto, createImageBitmap. */
const ES_SAFARI = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
async function crearBitmap(blob) {
  if (!ES_SAFARI && 'createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* sigue */ }
  }
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen (' + (blob.type || 'tipo desconocido') + ')')); };
    img.src = url;
  });
}

let bgModulo = null;
/** Quita el fondo con IA en el navegador. Devuelve WebP con transparencia (PNG si no hay soporte). */
async function quitarFondo(blob, onProgress) {
  if (!bgModulo) {
    onProgress('cargando modelo (solo la primera vez)…');
    bgModulo = await import(BG_REMOVAL_URL);
  }
  const png = await bgModulo.removeBackground(blob, {
    output: { format: 'image/png', quality: 0.9 },
    progress: (key, cur, total) => { if (total) onProgress(`${key.includes('fetch') ? 'descargando' : 'procesando'} ${Math.round(cur / total * 100)} %`); }
  });
  // WebP con alfa pesa ~5x menos que PNG; si el navegador no lo soporta, queda PNG.
  const bmp = await crearBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  const webp = await new Promise(res => canvas.toBlob(b => res(b), 'image/webp', 0.88));
  if (webp && webp.type === 'image/webp') return webp;
  // Sin WebP (Safari): PNG con transparencia pero a 900 px para que pese menos
  // (~1 MB → ~500 KB). La tienda lo muestra igual de nítido en el móvil.
  const lado = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  if (lado < 1) {
    canvas.width = Math.round(bmp.width * lado); canvas.height = Math.round(bmp.height * lado);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const pngChico = await new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
    if (pngChico) return pngChico;
  }
  return png;
}

/** Pide la foto hasta 4 veces (con espera creciente) hasta que Google la sirva. Nunca falla: solo avisa. */
async function calentarFoto(url) {
  const esperas = [0, 2000, 4000, 8000];
  for (const ms of esperas) {
    if (ms) await espera(ms);
    const ok = await new Promise(res => {
      const i = new Image();
      i.onload = () => res(true);
      i.onerror = () => res(false);
      i.src = url + (ms ? '?w=' + ms : '');
      setTimeout(() => res(false), 10000);
    });
    if (ok) return true;
  }
  console.warn('La foto aún no está lista en Google:', url);
  return false;
}

function aBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* --------------------------- Modo 360° ------------------------------ */

const cam = { stream: null, timer: null, activo: false };

async function abrirCamara() {
  $('overlay-360').hidden = false;
  $('cam-msg').textContent = '';
  cambiarModoCamara();
  await iniciarStream();
}

/** Automático (base giratoria, disparo por intervalo) o Manual (botón por foto). */
function cambiarModoCamara() {
  const manual = $('cam-modo').value === 'manual';
  detener360();
  $('cam-controles-auto').hidden = manual;
  $('cam-controles-manual').hidden = !manual;
  $('cam-hint-auto').hidden = manual;
  $('cam-hint-manual').hidden = !manual;
  $('cam-int').parentElement.style.opacity = manual ? '.4' : '';
  $('cam-msg').textContent = manual ? `Fotos tomadas: ${state.capturas.length}` : '';
}

async function fotoManual() {
  if (!cam.stream) return;
  await capturarFrame();
  if (navigator.vibrate) navigator.vibrate(40);
  const n = parseInt($('cam-n').value, 10);
  $('cam-msg').textContent = `Fotos tomadas: ${state.capturas.length}` + (state.capturas.length >= n ? ' — ya tienes las previstas, pulsa Listo (o sigue tomando)' : ` de ${n}`);
}

async function iniciarStream() {
  detenerStream();
  if (!navigator.mediaDevices?.getUserMedia) {
    $('cam-msg').textContent = 'Este navegador no permite usar la cámara aquí. Usa "Tomar / elegir fotos".';
    return;
  }
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: $('cam-facing').value }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false
    });
    $('cam').srcObject = cam.stream;
  } catch (err) {
    $('cam-msg').textContent = 'No se pudo abrir la cámara: ' + err.message + '. Revisa el permiso o usa "Tomar / elegir fotos".';
  }
}

function detenerStream() {
  if (cam.stream) { cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
}

function cerrarCamara() {
  detener360();
  detenerStream();
  $('overlay-360').hidden = true;
}

async function iniciar360() {
  if (!cam.stream) return;
  const n = parseInt($('cam-n').value, 10), intervalo = parseFloat($('cam-int').value) * 1000;
  cam.activo = true;
  $('btn-iniciar-360').hidden = true; $('btn-detener-360').hidden = false;
  const cd = $('cam-countdown');
  for (let s = 3; s > 0 && cam.activo; s--) { cd.textContent = s; await espera(1000); }
  cd.textContent = '';
  let tomadas = 0;
  while (cam.activo && tomadas < n) {
    await capturarFrame();
    tomadas++;
    $('cam-msg').textContent = `Foto ${tomadas} de ${n}`;
    if (navigator.vibrate) navigator.vibrate(40);
    if (tomadas < n) await espera(intervalo);
  }
  if (cam.activo) { toast(`${tomadas} fotos capturadas`); cerrarCamara(); }
}

function detener360() {
  cam.activo = false;
  $('btn-iniciar-360').hidden = false; $('btn-detener-360').hidden = true;
  $('cam-countdown').textContent = '';
}

async function capturarFrame() {
  const video = $('cam');
  const lado = Math.min(video.videoWidth, video.videoHeight);
  if (!lado) return;
  // Recorte cuadrado centrado: igual que el visor de la tienda (1:1).
  const sx = (video.videoWidth - lado) / 2, sy = (video.videoHeight - lado) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(lado, 1600);
  canvas.getContext('2d').drawImage(video, sx, sy, lado, lado, 0, 0, canvas.width, canvas.height);
  const wrap = document.querySelector('.cam-wrap');
  wrap.classList.remove('cam-flash'); void wrap.offsetWidth; wrap.classList.add('cam-flash');
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
  agregarCaptura(blob);
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

/* -------------------------------------------------------------------- */
/*  UI general                                                            */
/* -------------------------------------------------------------------- */

let toastTimer = null;
function toast(msg, malo = false) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (malo ? ' bad' : ''); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, malo ? 5000 : 2500);
}

async function probarConexion() {
  const f = $('form-config');
  const msg = $('config-msg');
  msg.className = 'msg'; msg.textContent = 'Probando…';
  const url = f.apiUrl.value.trim(), token = f.token.value.trim();
  try {
    const ping = await fetch(url + '?action=ping', { redirect: 'follow' }).then(r => r.json());
    if (!ping.ok) throw new Error(ping.error || 'Sin respuesta');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'listar', token }), redirect: 'follow' }).then(r => r.json());
    if (!res.ok) throw new Error(res.error === 'Token inválido' ? 'La URL responde pero el token no coincide' : res.error);
    msg.className = 'msg ok'; msg.textContent = `Conectado: script v${ping.version}, ${res.inventario.length} ejemplares en el sheet.`;
    return true;
  } catch (err) {
    msg.className = 'msg bad'; msg.textContent = 'No conecta: ' + err.message;
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', router);
  router();

  $('form-config').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    guardarCfg({ apiUrl: f.apiUrl.value.trim(), token: f.token.value.trim() });
    if (await probarConexion()) { state.data = null; location.hash = '#/inicio'; router(); }
  });
  $('btn-probar').addEventListener('click', probarConexion);
  $('btn-refrescar').addEventListener('click', async () => {
    try { await cargarDatos({ forzar: true }); toast('Datos actualizados'); router(); }
    catch (err) { toast(err.message, true); }
  });

  $('buscar').addEventListener('input', renderEjemplares);
  $('filtro-estado').addEventListener('change', renderEjemplares);

  const f = $('form-ejemplar');
  f.addEventListener('submit', guardarEjemplar);
  f['Costo total'].addEventListener('input', actualizarMargen);
  f['Precio venta'].addEventListener('input', actualizarMargen);
  $('btn-reintentar').addEventListener('click', () => f.requestSubmit());
  $('input-fotos').addEventListener('change', (ev) => {
    Array.from(ev.target.files).forEach(agregarCaptura);
    ev.target.value = '';
  });
  $('thumbs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-del]');
    if (!b) return;
    const [c] = state.capturas.splice(parseInt(b.dataset.del, 10), 1);
    URL.revokeObjectURL(c.url);
    renderCapturas();
  });
  $('preview-range').addEventListener('input', (ev) => mostrarPreview(parseInt(ev.target.value, 10)));

  $('btn-modo-360').addEventListener('click', abrirCamara);
  $('btn-cerrar-360').addEventListener('click', cerrarCamara);
  $('btn-iniciar-360').addEventListener('click', iniciar360);
  $('btn-detener-360').addEventListener('click', detener360);
  $('cam-modo').addEventListener('change', cambiarModoCamara);
  $('btn-foto-manual').addEventListener('click', fotoManual);
  $('btn-listo-360').addEventListener('click', () => { toast(`${state.capturas.length} fotos en el formulario`); cerrarCamara(); });
  $('cam-facing').addEventListener('change', iniciarStream);

  $('form-venta').addEventListener('submit', guardarVenta);
  $('venta-ejemplar').addEventListener('change', precioSugerido);
  $('form-cuidado').addEventListener('submit', guardarCuidado);
  $('form-material').addEventListener('submit', guardarMaterial);
});
