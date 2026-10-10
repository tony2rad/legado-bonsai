/* ==========================================================================
   Legado Bonsai — regalos corporativos (regalos.html)
   Paquetes y descuentos por volumen desde config.js (CORPORATIVO).
   El cotizador calcula al instante y, al enviar, guarda la solicitud en la
   pestaña COTIZACIONES (POST público 'cotizacion') y abre WhatsApp con el
   resumen. Sin API, solo abre WhatsApp.
   ========================================================================== */

(function () {
  const CFG = window.LEGADO_CONFIG || {};
  const API_URL = CFG.API_URL || '';
  const WA = CFG.WHATSAPP_NUMBER || '593988731431';
  const CORP = Object.assign({ paquetes: [], descuentosVolumen: [], placaExtra: 18 }, CFG.CORPORATIVO || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + n.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function track(evento, datos) {
    if (!CFG.ANALITICA || !API_URL) return;
    const cuerpo = JSON.stringify({ action: 'evento', payload: Object.assign({ evento, pagina: 'regalos.html', sesion: sesion(), ref: document.referrer ? (new URL(document.referrer).hostname) : '' }, datos || {}) });
    try { navigator.sendBeacon(API_URL, new Blob([cuerpo], { type: 'text/plain;charset=utf-8' })); } catch { /* nada */ }
  }
  function sesion() {
    try { let s = sessionStorage.getItem('legadoBonsaiSesion'); if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('legadoBonsaiSesion', s); } return s; } catch { return 'na'; }
  }

  function renderPaquetes() {
    $('pack-grid').innerHTML = CORP.paquetes.map((p, i) => `
      <div class="pack${i === 1 ? ' highlight' : ''}">
        <div class="for">${i === 0 ? 'Para muchos' : i === 1 ? 'El más pedido' : 'Para pocos y especiales'}</div>
        <h3>${esc(p.nombre)}</h3>
        <div class="pack-price">${money(p.precio)} <span>por unidad</span></div>
        <ul>${p.incluye.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <button type="button" class="btn ${i === 1 ? 'btn-primary' : 'btn-outline'} btn-block" data-pack="${esc(p.id)}">Cotizar ${esc(p.nombre)}</button>
      </div>`).join('');
    $('q-paquete').innerHTML = CORP.paquetes.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)} — ${money(p.precio)} c/u</option>`).join('');
    if (CORP.paquetes[1]) $('q-paquete').value = CORP.paquetes[1].id;
    $('q-placa-precio').textContent = money(CORP.placaExtra);
  }

  function calcular() {
    const p = CORP.paquetes.find(x => x.id === $('q-paquete').value) || CORP.paquetes[0];
    const n = Math.max(1, parseInt($('q-cantidad').value, 10) || 1);
    const placa = $('q-placa').checked;
    const unit = p.precio + (placa ? CORP.placaExtra : 0);
    const bruto = unit * n;
    const tramo = [...CORP.descuentosVolumen].sort((a, b) => b.desde - a.desde).find(d => n >= d.desde);
    const pct = tramo ? tramo.pct : 0;
    const descuento = Math.round(bruto * pct) / 100;
    const total = bruto - descuento;
    const siguiente = [...CORP.descuentosVolumen].sort((a, b) => a.desde - b.desde).find(d => n < d.desde);
    return { p, n, placa, unit, bruto, pct, descuento, total, siguiente };
  }

  function renderResumen() {
    const c = calcular();
    $('q-rows').innerHTML = [
      `<div><span>${c.n} × ${esc(c.p.nombre)}${c.placa ? ' + placa' : ''}</span><span>${money(c.bruto)}</span></div>`,
      c.pct ? `<div class="desc"><span>Descuento por volumen (${c.pct} %)</span><span>−${money(c.descuento)}</span></div>` : '',
      `<div class="total"><span>Estimado</span><span>${money(c.total)}</span></div>`,
      `<div><span>Por unidad</span><span>${money(c.total / c.n)}</span></div>`,
      c.siguiente ? `<div><span style="color:var(--ink-faint)">Desde ${c.siguiente.desde} unidades: ${c.siguiente.pct} % de descuento</span><span></span></div>` : ''
    ].join('');
    $('q-wa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(mensajeWA(c));
    return c;
  }

  function mensajeWA(c) {
    const f = $('quote-form');
    return ['Hola, quiero cotizar regalos corporativos de Legado Bonsai:', '',
      '• Empresa: ' + (f.empresa.value || '—'), '• Contacto: ' + (f.contacto.value || '—') + (f.medio.value ? ' (' + f.medio.value + ')' : ''),
      '• ' + c.n + ' × ' + c.p.nombre + (c.placa ? ' + placa grabada' : ''), '• Ciudad: ' + (f.ciudad.value || '—'), '• Fecha deseada: ' + (f.fechaDeseada.value || 'por definir'),
      '', 'Estimado web: ' + money(c.total) + (c.pct ? ' (incluye ' + c.pct + ' % por volumen)' : ''),
      f.mensaje.value ? '' : '', f.mensaje.value ? 'Mensaje: ' + f.mensaje.value : ''].filter(l => l !== undefined).join('\n');
  }

  async function enviar(ev) {
    ev.preventDefault();
    const f = $('quote-form');
    const msg = $('q-msg');
    const btn = $('q-enviar');
    const c = renderResumen();
    const payload = {
      empresa: f.empresa.value.trim(), contacto: f.contacto.value.trim(), medio: f.medio.value.trim(), ciudad: f.ciudad.value.trim(),
      cantidad: c.n, paquete: c.p.nombre, placa: c.placa, fechaDeseada: f.fechaDeseada.value, mensaje: f.mensaje.value.trim(), estimado: c.total
    };
    btn.disabled = true; msg.className = 'quote-msg'; msg.textContent = 'Enviando…';
    let guardado = false;
    if (API_URL) {
      try {
        const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'cotizacion', payload }), redirect: 'follow' });
        const data = await res.json();
        guardado = !!data.ok;
      } catch (e) { guardado = false; }
    }
    track('cotizacion', { valor: c.total, detalle: c.n + 'x ' + c.p.nombre + (c.placa ? ' +placa' : '') });
    msg.className = 'quote-msg ok';
    msg.textContent = guardado
      ? 'Recibimos tu cotización. Te respondemos hoy mismo; si prefieres, sigue por WhatsApp.'
      : 'Abrimos WhatsApp con tu cotización para que nos la envíes directamente.';
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(mensajeWA(c)), '_blank');
    btn.disabled = false;
  }

  // Tema + menú
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

    renderPaquetes();
    renderResumen();
    ['q-paquete', 'q-cantidad', 'q-placa'].forEach(id => $(id).addEventListener('input', renderResumen));
    $('quote-form').addEventListener('input', renderResumen);
    $('quote-form').addEventListener('submit', enviar);
    $('pack-grid').addEventListener('click', (e) => {
      const id = e.target.closest('[data-pack]')?.getAttribute('data-pack');
      if (!id) return;
      $('q-paquete').value = id; renderResumen();
      document.getElementById('cotizar').scrollIntoView({ behavior: 'smooth' });
    });
    track('vista');
  });
})();
