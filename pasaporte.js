/* ==========================================================================
   Legado Bonsai — pasaporte digital del árbol (arbol.html?id=LB-0001)
   Lee GET API_URL?action=arbol&id=… (apps-script/Code.gs → pasaporte_):
   ficha pública, fotos, historial de CUIDADOS y datos del certificado.
   Sin API o sin id muestra un aviso; nunca expone costos ni contactos.
   ========================================================================== */

(function () {
  const CFG = window.LEGADO_CONFIG || {};
  const API_URL = CFG.API_URL || '';
  const WA = CFG.WHATSAPP_NUMBER || '593988731431';
  const SITE = (CFG.SITE_URL || '').replace(/\/$/, '');
  const LOCAL = CFG.LOCAL_IMAGES_PATH || 'imagenes/360/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const id = (new URLSearchParams(location.search).get('id') || '').trim();
  const urlPublica = (SITE || location.origin + location.pathname.replace(/[^/]*$/, '')) + (SITE ? '/' : '') + 'arbol.html?id=' + encodeURIComponent(id);

  const ICONO = { 'Poda': '✂', 'Trasplante': '🪴', 'Alambrado': '〰', 'Fertilización': '◌', 'Riego': '💧', 'Tratamiento': '✚', 'Revisión': '◎' };

  function status(html) { const s = $('pass-status'); s.hidden = false; s.innerHTML = html; }

  function track(evento, datos) {
    if (!CFG.ANALITICA || !API_URL) return;
    const cuerpo = JSON.stringify({ action: 'evento', payload: Object.assign({ evento, pagina: 'arbol.html', sesion: 'pasaporte', ref: document.referrer ? (new URL(document.referrer).hostname) : '' }, datos || {}) });
    try { navigator.sendBeacon(API_URL, new Blob([cuerpo], { type: 'text/plain;charset=utf-8' })); } catch { /* nada */ }
  }

  async function cargar() {
    if (!id) { status('Falta el código del árbol en el enlace (por ejemplo <code>arbol.html?id=LB-0001</code>).'); return; }
    if (!API_URL) { status('El pasaporte necesita la conexión con el inventario (API_URL en config.js).'); return; }
    try {
      const res = await fetch(API_URL + '?action=arbol&id=' + encodeURIComponent(id), { redirect: 'follow' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No encontrado');
      render(data);
      track('pasaporte', { id });
    } catch (err) {
      status('No encontramos un árbol con el código <b>' + esc(id) + '</b>. ' +
        '<a href="https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola, busco el pasaporte del árbol ' + id) + '" target="_blank" rel="noopener" style="color:var(--kohaku); font-weight:700;">Escríbenos</a> y lo revisamos.');
      console.error(err);
    }
  }

  function fotosDe(a) {
    const urls = String(a.Fotos || '').split(/[\n,]/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
    if (urls.length) return Promise.resolve(urls);
    if (!a.Imagen) return Promise.resolve([]);
    const carpeta = a.Imagen, prefix = carpeta.toLowerCase();
    const tryLoad = (n) => new Promise(r => { const i = new Image(); const src = `${LOCAL}${carpeta}/${prefix}_${String(n).padStart(2, '0')}.jpg`; i.onload = () => r(src); i.onerror = () => r(null); i.src = src; });
    return Promise.all(Array.from({ length: 12 }, (_, i) => tryLoad(i + 1))).then(r => r.filter(Boolean));
  }

  function render(data) {
    const a = data.arbol;
    $('pass-status').hidden = true;
    $('pass-body').hidden = false;
    document.title = a.Nombre + ' · Pasaporte — Legado Bonsai';
    $('pass-id').textContent = a.ID + ' · ' + (a.EstiloJP || a.Estilo || '家族の木');
    $('pass-title').textContent = a.Nombre;
    $('pass-species').textContent = a.Especie || '';
    $('pass-story').textContent = a.Historia || 'Cada junípero se forma durante años de poda y alambrado cuidadoso. Este pasaporte guarda esa historia.';
    const specs = [
      ['Estilo', a.Estilo], ['Altura', a.Altura], ['Edad', a.Edad], ['Maceta', a.Maceta], ['Ambiente', a.Ambiente],
      ['En Legado desde', a['Fecha de ingreso']], ['Última poda', a['Última poda']], ['Último trasplante', a['Último trasplante']],
      ['Último alambrado', a['Último alambrado']], ['Salud', a['Estado de salud']]
    ].filter(([, v]) => v);
    $('pass-specs').innerHTML = specs.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('');

    // Historial
    const tl = $('pass-timeline');
    const cuidados = data.cuidados || [];
    const items = cuidados.map(c => `<li><div class="when">${esc(c.Fecha)}${c['Fase lunar'] ? `<span class="moon">☾ ${esc(c['Fase lunar'])}</span>` : ''}</div><div class="what">${ICONO[c.Tipo] || '◎'} ${esc(c.Tipo)}</div>${c.Detalle ? `<div class="detail">${esc(c.Detalle)}</div>` : ''}</li>`);
    if (a['Fecha de ingreso']) items.push(`<li><div class="when">${esc(a['Fecha de ingreso'])}</div><div class="what">🌱 Ingreso a Legado Bonsai</div><div class="detail">Comienza el registro de este árbol.</div></li>`);
    tl.innerHTML = items.length ? items.join('') : '<li><div class="what">Aún sin cuidados registrados</div><div class="detail">La primera poda o trasplante con nosotros aparecerá aquí.</div></li>';

    // Certificado
    const c = data.certificado;
    $('cert-title').textContent = a.Nombre + ' · ' + a.ID;
    if (c && c.custodio) { $('cert-custodio').hidden = false; $('cert-custodio').textContent = 'Bajo la custodia de ' + c.custodio; }
    $('cert-line1').textContent = c
      ? 'Entregado el ' + c.fecha + (c.plan ? ' con el plan ' + c.plan : '') + '.'
      : (a['Estado comercial'] === 'En formación' ? 'Ejemplar en formación, disponible en preventa.' : 'Ejemplar disponible en el catálogo de Legado Bonsai.');
    $('cert-line2').textContent = (a.Especie ? a.Especie + '. ' : '') + [a.Estilo ? 'Estilo ' + a.Estilo : '', a.Altura ? a.Altura + ' de altura' : '', a.Edad ? a.Edad : ''].filter(Boolean).join(' · ') + '.';
    $('cert-url').textContent = urlPublica;
    try {
      if (window.QRCode) new QRCode($('cert-qr'), { text: urlPublica, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M, colorDark: '#1B241F', colorLight: '#FFFFFF' });
    } catch (e) { /* sin QR, queda la URL */ }

    // Fase lunar del mes
    if (data.mesLunar && data.mesLunar.accion) {
      $('pass-lunar').hidden = false;
      $('pass-lunar-phase').textContent = data.mesLunar.mes + ' — ' + data.mesLunar.fase + (data.mesLunar.hoy ? ' · hoy: ' + data.mesLunar.hoy.nombre.toLowerCase() : '');
      $('pass-lunar-text').textContent = data.mesLunar.accion;
    }

    // Acciones
    const texto = 'Mira el pasaporte de mi junípero ' + a.Nombre + ' (' + a.ID + '): ' + urlPublica;
    $('pass-share').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
    $('pass-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(urlPublica); $('pass-copy').textContent = 'Enlace copiado'; setTimeout(() => { $('pass-copy').textContent = 'Copiar enlace'; }, 2000); }
      catch { prompt('Copia el enlace:', urlPublica); }
    });
    $('pass-print').addEventListener('click', () => window.print());

    // Visor 360°
    fotosDe(a).then(fotos => {
      if (!fotos.length) return;
      const img = $('pass-img'); img.hidden = false; $('pass-ph').hidden = true; $('pass-hint').hidden = fotos.length < 2;
      let idx = 0; img.src = fotos[0]; img.alt = a.Nombre;
      fotos.slice(1).forEach(src => { const p = new Image(); p.src = src; });
      let timer = fotos.length > 1 ? setInterval(() => { idx = (idx + 1) % fotos.length; img.src = fotos[idx]; }, 900) : null;
      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
      let x0 = null, acc = 0;
      const el = $('pass-viewer');
      const start = (x) => { x0 = x; acc = 0; stop(); };
      const move = (x) => { if (x0 === null) return; acc += x - x0; x0 = x; while (Math.abs(acc) >= 24) { idx = (idx + (acc > 0 ? -1 : 1) + fotos.length) % fotos.length; img.src = fotos[idx]; acc -= Math.sign(acc) * 24; } };
      el.addEventListener('mousedown', e => start(e.clientX)); window.addEventListener('mousemove', e => move(e.clientX)); window.addEventListener('mouseup', () => { x0 = null; });
      el.addEventListener('touchstart', e => start(e.touches[0].clientX), { passive: true }); el.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true }); el.addEventListener('touchend', () => { x0 = null; });
    });
  }

  // Tema + menú (mismo comportamiento que la tienda, sin cargar script.js)
  const THEME_KEY = 'legadoBonsaiTheme';
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('theme-icon-dark').style.display = dark ? 'none' : 'block'; $('theme-icon-light').style.display = dark ? 'block' : 'none';
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('year').textContent = new Date().getFullYear();
    applyTheme(localStorage.getItem(THEME_KEY));
    $('theme-toggle-btn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark'; localStorage.setItem(THEME_KEY, next); applyTheme(next);
    });
    const links = document.querySelector('.nav-links'), tog = $('nav-toggle-btn');
    tog.addEventListener('click', () => { const o = links.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); });
    cargar();
  });
})();
