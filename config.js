/* ==========================================================================
   Legado Bonsai — configuración compartida (tienda + app de registro)
   Este es el ÚNICO archivo que hay que editar al conectar el sitio con el
   Google Sheet o al cambiar precios de planes, kits y reglas comerciales.
   Se carga antes de script.js, admin/admin.js, pasaporte.js y regalos.js.
   ========================================================================== */

window.LEGADO_CONFIG = {
  /* URL del Web App de Apps Script (termina en /exec). Se obtiene al
     implementar apps-script/Code.gs — ver apps-script/INSTALACION.md.
     Mientras esté vacía, la tienda usa SHEET_CSV_URL como respaldo. */
  API_URL: 'https://script.google.com/macros/s/AKfycbyOZMc13j6L_HPrwCeL2o0mS3Kub64UKCZeMpXnSCfNOFSOUc9gnMorqsFeAgHkq2RE/exec',

  /* Respaldo cuando API_URL está vacía o falla.
     HOY apunta a la hoja antigua "productos" para que la tienda siga
     funcionando hasta que conectes el Sistema de Gestión. Cuando API_URL
     esté configurada, reemplaza esto por la pestaña CATALOGO publicada como
     CSV (Archivo → Compartir → Publicar en la web → CATALOGO → CSV) o
     déjalo vacío ''. */
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7aPPBgI7Z-jHXECrFKBI9gbYMJiSHOYOyZiMqlzNEckqxuatlIeDuOhgyx2MEamadhFFqD4pk64hQ/pub?gid=1316703737&single=true&output=csv',

  /* Número de WhatsApp de la tienda (código de país sin +). */
  WHATSAPP_NUMBER: '593988731431',

  /* Fotos de respaldo dentro del repo: imagenes/360/<Carpeta imagen>/ */
  LOCAL_IMAGES_PATH: 'imagenes/360/',

  /* URL pública del sitio (sin barra final). Se usa para armar el enlace y el
     código QR del pasaporte de cada árbol (arbol.html?id=LB-0001). */
  SITE_URL: 'https://legadobonsai.github.io',

  /* Popup "10% en tu primer legado": el correo se envía a este Google Form
     (Formulario → Respuestas → vinculado a un Sheet). Para cambiar de
     formulario: abre el nuevo en forms.google.com, copia la URL de
     /viewform y cámbiala aquí por /formResponse; el ENTRY_ID se saca del
     HTML público del form (busca "entry.<numero>" en FB_PUBLIC_LOAD_DATA_). */
  NEWSLETTER_FORM_ACTION: 'https://docs.google.com/forms/d/e/1FAIpQLSdnpE4UbsuSAc1soP72zLMFEEv1Zh33N4KfLpE3U6eO-MH9Uw/formResponse',
  NEWSLETTER_EMAIL_ENTRY: 'entry.1798076899',

  /* ------------------------------------------------------------------
     PLANES DE ACOMPAÑAMIENTO — se venden junto al árbol (ficha) o solos
     (sección Acompañamiento, para un árbol que el cliente ya tiene).
     `nombre` es la clave que se guarda en VENTAS → "Plan de acompañamiento".
     `periodo` solo es texto informativo. `meses` = vigencia para calcular
     "Vence plan" en CLIENTES y el recordatorio de renovación.
     ------------------------------------------------------------------ */
  PLANES: [
    { nombre: 'Primeros Brotes',  precio: 15,  periodo: 'pago único',   meses: 12,
      resumen: 'Guía digital + 1 videollamada + recordatorios lunares por WhatsApp.' },
    { nombre: 'Cultivo Guiado',   precio: 60,  periodo: 'primer año',   meses: 12,
      resumen: 'Todo lo anterior + 1 trasplante, 2 podas y 1 alambrado guiados.' },
    { nombre: 'Legado Completo',  precio: 120, periodo: 'por año',      meses: 12,
      resumen: 'Todo lo anterior cada año + certificado y placa + prioridad de agenda.' }
  ],

  /* ------------------------------------------------------------------
     EXTRAS / KITS — se sugieren en el carrito cuando ya hay un árbol
     ("Completa tu kit"). Precio de venta; el costo vive en MATERIALES.
     ------------------------------------------------------------------ */
  EXTRAS: [
    { id: 'kit-inicio',   nombre: 'Kit de inicio',              precio: 28, detalle: 'Tijera de poda, alambre de aluminio 1 y 2 mm y guía impresa de cuidado.' },
    { id: 'alambre',      nombre: 'Alambre de aluminio 100 g',  precio: 8,  detalle: 'Calibre 1.5 mm, ideal para ramas jóvenes de junípero.' },
    { id: 'sustrato',     nombre: 'Sustrato para junípero 2 L', precio: 9,  detalle: 'Mezcla drenante lista para el próximo trasplante.' },
    { id: 'fertilizante', nombre: 'Fertilizante orgánico 500 g', precio: 7, detalle: 'De liberación lenta, para las fases de cuarto creciente.' },
    { id: 'placa',        nombre: 'Placa conmemorativa grabada', precio: 18, detalle: 'Nombre, fecha y kanji a elección. Incluida en Legado Completo.' }
  ],

  /* ------------------------------------------------------------------
     PREVENTA — ejemplares con Estado comercial "En formación" se muestran en
     el catálogo y se reservan con un anticipo. El saldo se paga a la entrega.
     ------------------------------------------------------------------ */
  PREVENTA: { anticipoPct: 30, mostrar: true },

  /* ------------------------------------------------------------------
     CÓDIGOS DE DESCUENTO Y REFERIDOS
     - `descuentoPct`: descuento para quien usa un código de referido (o el del
       popup) en su primera compra. Aplica a árboles y planes, no a kits.
     - `creditoReferente`: crédito en $ que gana quien refirió, se acumula en
       CLIENTES → "Créditos ($)" y se descuenta de su próxima compra o taller.
     - `codigoNewsletter`: código universal del popup (10% primera compra).
     Los códigos personales (LEG-XXXX) los genera el Sheet al registrar la venta.
     ------------------------------------------------------------------ */
  REFERIDOS: { descuentoPct: 10, creditoReferente: 10, codigoNewsletter: 'LEGADO10' },

  /* ------------------------------------------------------------------
     REGALOS CORPORATIVOS (regalos.html) — paquetes y descuentos por volumen.
     ------------------------------------------------------------------ */
  CORPORATIVO: {
    paquetes: [
      { id: 'brote',     nombre: 'Brote',     precio: 35,  incluye: ['Junípero joven en maceta de formación', 'Tarjeta con el significado 家族の木', 'Ficha de cuidado impresa'] },
      { id: 'legado',    nombre: 'Legado',    precio: 65,  incluye: ['Junípero formado (2–3 años)', 'Placa grabada con nombre y fecha', 'Guía de cuidado + acceso al pasaporte digital'] },
      { id: 'ceremonia', nombre: 'Ceremonia', precio: 120, incluye: ['Junípero de exhibición con maceta cerámica', 'Plan Primeros Brotes para quien lo recibe', 'Entrega personal con breve explicación del arte'] }
    ],
    descuentosVolumen: [ { desde: 10, pct: 10 }, { desde: 25, pct: 15 }, { desde: 50, pct: 20 } ],
    placaExtra: 18
  },

  /* Analítica propia (pestaña EVENTOS del Sheet). Sin cookies ni datos
     personales: solo eventos anónimos (vista, ficha, carrito, whatsapp). */
  ANALITICA: true
};
