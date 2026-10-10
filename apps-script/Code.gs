/**
 * ==========================================================================
 *  Legado Bonsai — API de inventario y ventas (Google Apps Script)
 * ==========================================================================
 *
 *  Este script vive DENTRO del Google Sheet "Legado Bonsai — Sistema de
 *  Gestión" (Extensiones → Apps Script) y cumple tres funciones:
 *
 *   1. setup()  → ordena el sheet: crea o normaliza las pestañas, agrega las
 *                 columnas que faltan (sin borrar datos), crea CATALOGO,
 *                 RESUMEN, EMBUDO, CONFIG y siembra los calendarios.
 *
 *   2. Web App  → doGet / doPost.
 *                 GET público : catálogo (Disponible + En formación), pasaporte
 *                               de un árbol, validación de códigos.
 *                 POST público: eventos de analítica, cotizaciones corporativas.
 *                 POST + token: todo lo que escribe la app de registro
 *                               (ejemplares, fotos, ventas, cuidados,
 *                               materiales, clientes, recordatorios, métricas).
 *
 *   3. Disparador diario (instalarDisparadores) → generarRecordatorios():
 *                 arma los recordatorios lunares, de próxima revisión y de
 *                 renovación de plan para cada cliente, los deja en la
 *                 pestaña RECORDATORIOS con su enlace de WhatsApp y te envía
 *                 un correo resumen cada mañana.
 *
 *  Instalación paso a paso: ver apps-script/INSTALACION.md
 * ==========================================================================
 */

const VERSION = '1.1.0';
const CARPETA_FOTOS_RAIZ = 'Legado Bonsai — Fotos 360';
const ZONA = 'America/Guayaquil';

/* Reglas comerciales (deben coincidir con config.js de la tienda). */
const REGLAS = {
  anticipoPct: 30,            // preventa de ejemplares "En formación"
  descuentoReferidoPct: 10,   // para quien usa un código
  creditoReferente: 10,       // $ que gana quien refirió
  codigosFijos: { 'LEGADO10': 10 },   // código del popup de newsletter → % descuento
  planesMeses: { 'Primeros Brotes': 12, 'Cultivo Guiado': 12, 'Legado Completo': 12 },
  planesPrecio: { 'Primeros Brotes': 15, 'Cultivo Guiado': 60, 'Legado Completo': 120 },
  sitio: 'https://legadobonsai.github.io',   // para el enlace del pasaporte en los mensajes
  horaRecordatorios: 8        // hora local del disparador diario
};

/* -------------------------------------------------------------------- */
/*  Esquema de las pestañas                                              */
/*  `firma`   = primer encabezado que identifica una pestaña ya existente */
/*              aunque tenga otro nombre (así no se pierde nada).          */
/*  `alias`   = nombres antiguos de una columna que se renombran al        */
/*              canónico en lugar de duplicarse.                           */
/* -------------------------------------------------------------------- */

const ESQUEMA = {
  INVENTARIO: {
    firma: 'ID',
    columnas: [
      'ID', 'Código SKU', 'Nombre comercial', 'Especie', 'Estilo', 'Estilo JP',
      'Ambiente', 'Ubicación física', 'Altura (cm)', 'Edad (años)', 'Maceta',
      'Estado de salud', 'Estado comercial', 'Costo total', 'Precio venta',
      'Margen $', 'Margen %', 'Fecha de ingreso', 'Última poda',
      'Último trasplante', 'Último alambrado', 'Notas',
      'Riego', 'Historia', 'Carpeta imagen', 'Fotos', 'Destacado', 'Última actualización',
      // v1.1: preventa
      'Entrega estimada'
    ],
    alias: {
      'Nombre comercial': ['Nombre'],
      'Altura (cm)': ['Altura'],
      'Edad (años)': ['Edad'],
      'Precio venta': ['Precio', 'Precio de venta'],
      'Ubicación física': ['Ubicación'],
      'Estado de salud': ['Estado Salud'],
      'Carpeta imagen': ['Imagen']
    }
  },
  CUIDADOS: {
    firma: 'ID Ejemplar',
    columnas: ['ID Ejemplar', 'Fecha', 'Tipo', 'Fase lunar', 'Detalle', 'Responsable', 'Próxima revisión sugerida'],
    alias: {}
  },
  VENTAS: {
    firma: 'Fecha',
    columnas: [
      'Fecha', 'ID Ejemplar', 'Cliente', 'Contacto', 'Cantidad', 'Precio final', 'Plan de acompañamiento', 'Estado', 'Notas',
      // v1.1
      'ID Cliente', 'Correo', 'Ciudad', 'Canal', 'Código usado', 'Descuento ($)', 'Anticipo ($)', 'Extras', 'Nombre en pasaporte'
    ],
    alias: { 'ID Ejemplar': ['SKU / ID vendido', 'SKU Vendido'] }
  },
  MATERIALES: {
    firma: 'Herramienta / Material',
    columnas: ['Herramienta / Material', 'Cantidad', 'Unidad', 'Costo unitario', 'Costo total', 'Ubicación', 'Observaciones', 'Última actualización'],
    alias: {}
  },
  CALENDARIO_LUNAR: {
    firma: 'N° mes',
    columnas: ['N° mes', 'Mes', 'Fase lunar ideal', 'Acción recomendada'],
    alias: {}
  },
  /* ---- v1.1 ---- */
  CLIENTES: {
    firma: 'ID Cliente',
    columnas: [
      'ID Cliente', 'Nombre', 'WhatsApp', 'Correo', 'Ciudad', 'Origen', 'Código referido', 'Referido por',
      'Créditos ($)', 'Plan activo', 'Vence plan', 'Recordatorios', 'Ejemplares', 'Primera compra',
      'Última compra', 'Total comprado', 'Notas', 'Última actualización'
    ],
    alias: {}
  },
  RECORDATORIOS: {
    firma: 'Fecha',
    columnas: ['Fecha', 'ID Cliente', 'Cliente', 'WhatsApp', 'ID Ejemplar', 'Tipo', 'Fase lunar', 'Mensaje', 'Enlace', 'Estado', 'Enviado'],
    alias: {}
  },
  COTIZACIONES: {
    firma: 'Fecha',
    columnas: ['Fecha', 'Empresa', 'Contacto', 'WhatsApp / Correo', 'Ciudad', 'Cantidad', 'Paquete', 'Placa personalizada', 'Fecha deseada', 'Mensaje', 'Estimado ($)', 'Estado', 'Notas'],
    alias: {}
  },
  EVENTOS: {
    firma: 'Fecha hora',
    columnas: ['Fecha hora', 'Fecha', 'Evento', 'Página', 'ID Ejemplar', 'Valor', 'Detalle', 'Sesión', 'Referencia'],
    alias: {}
  },
  CALENDARIO_EDITORIAL: {
    firma: 'Fecha',
    columnas: ['Fecha', 'Día', 'Fase lunar', 'Momento comercial', 'Formato', 'Pilar', 'Título / gancho', 'Texto', 'CTA', 'Hashtags', 'Recurso visual', 'Estado'],
    alias: {}
  }
};

const ESTADOS_COMERCIALES = ['Disponible', 'Reservado', 'Vendido', 'En formación', 'Baja'];
const ESTADOS_SALUD = ['Excelente', 'Bien', 'Normal', 'En observación', 'Enfermo'];
const AMBIENTES = ['Exterior', 'Interior', 'Semi-sombra'];
const TIPOS_CUIDADO = ['Poda', 'Trasplante', 'Alambrado', 'Fertilización', 'Riego', 'Tratamiento', 'Revisión'];
const CANALES_VENTA = ['Web', 'WhatsApp', 'Instagram', 'Taller', 'Referido', 'Corporativo', 'Feria', 'Otro'];
const ESTADOS_RECORDATORIO = ['Pendiente', 'Enviado', 'Omitido'];
const ESTADOS_COTIZACION = ['Nueva', 'Contactada', 'Aceptada', 'Perdida'];
const ACCIONES_PUBLICAS_POST = ['evento', 'cotizacion'];

/* Estilos clásicos: nombre en español → kanji · romaji */
const ESTILOS = {
  'Erguido formal': '直幹 · Chokkan',
  'Erguido informal': '模様木 · Moyogi',
  'Inclinado': '斜幹 · Shakan',
  'Cascada': '懸崖 · Kengai',
  'Semicascada': '半懸崖 · Han-kengai',
  'Literati': '文人木 · Bunjin',
  'Barrido por el viento': '吹流し · Fukinagashi',
  'Doble tronco': '双幹 · Sokan',
  'Bosque': '寄せ植え · Yose-ue',
  'Sobre roca': '石付き · Ishitsuki',
  'Escoba': '箒立ち · Hokidachi',
  'Raíces expuestas': '根上がり · Neagari',
  'Madera muerta': '舎利幹 · Sharimiki'
};

/* ==================================================================== */
/*  SETUP — ejecutar UNA vez desde el editor (Ejecutar → setup)          */
/*  Es seguro repetirlo: nunca borra datos, solo agrega lo que falte.    */
/* ==================================================================== */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const informe = [];

  Object.keys(ESQUEMA).forEach(nombre => {
    const res = asegurarHoja_(ss, nombre, ESQUEMA[nombre]);
    informe.push(nombre + ': ' + res);
  });

  informe.push('CONFIG: ' + crearConfig_(ss));
  informe.push('CATALOGO: ' + crearCatalogo_(ss));
  informe.push('RESUMEN: ' + crearResumen_(ss));
  informe.push('EMBUDO: ' + crearEmbudo_(ss));
  aplicarValidaciones_(ss);
  rellenarEstilosJP_(ss);
  sembrarCalendario_(ss);
  informe.push('CALENDARIO_EDITORIAL: ' + sembrarCalendarioEditorial_(ss));
  informe.push('Códigos de referido: ' + asegurarCodigosReferido_(ss) + ' generados');

  const carpeta = carpetaRaiz_();
  informe.push('Carpeta de fotos en Drive: ' + carpeta.getUrl());

  const token = obtenerToken_();
  informe.push('Token de la app: ' + token);
  informe.push('Disparador diario de recordatorios: ' + (hayDisparador_() ? 'instalado' : 'NO instalado — ejecuta instalarDisparadores()'));

  Logger.log(informe.join('\n'));
  try {
    SpreadsheetApp.getUi().alert('Setup completado', informe.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* sin UI (ejecución desde el editor) */ }
  return informe;
}

/** Busca la hoja por nombre o por firma; la crea si no existe; ordena y completa columnas. */
function asegurarHoja_(ss, nombre, def) {
  let hoja = ss.getSheetByName(nombre);
  let nota = 'ya existía';
  if (!hoja) {
    hoja = ss.getSheets().find(h => String(h.getRange(1, 1).getValue()).trim() === def.firma && !ESQUEMA[h.getName()]);
    if (hoja) { nota = 'renombrada desde "' + hoja.getName() + '"'; hoja.setName(nombre); }
  }
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.getRange(1, 1, 1, def.columnas.length).setValues([def.columnas]);
    nota = 'creada';
  }

  // Normaliza encabezados: alias → canónico, columnas faltantes → al final.
  const ultimaCol = Math.max(hoja.getLastColumn(), 1);
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(h => String(h).trim());
  let agregadas = 0, renombradas = 0;
  def.columnas.forEach(col => {
    if (encabezados.indexOf(col) !== -1) return;
    const aliases = def.alias[col] || [];
    const idx = encabezados.findIndex(h => aliases.indexOf(h) !== -1);
    if (idx !== -1) {
      hoja.getRange(1, idx + 1).setValue(col);
      encabezados[idx] = col;
      renombradas++;
    } else {
      encabezados.push(col);
      hoja.getRange(1, encabezados.length).setValue(col);
      agregadas++;
    }
  });

  hoja.setFrozenRows(1);
  const fila1 = hoja.getRange(1, 1, 1, encabezados.length);
  fila1.setFontWeight('bold').setBackground('#1B241F').setFontColor('#FAFAF6');
  return nota + (agregadas ? ', +' + agregadas + ' columnas' : '') + (renombradas ? ', ' + renombradas + ' renombradas' : '');
}

/** Pestaña CATALOGO: vista en vivo de lo que publica la tienda (Disponible + En formación). */
function crearCatalogo_(ss) {
  const inv = ss.getSheetByName('INVENTARIO');
  const col = columnasDe_(inv);
  const letraEstado = letraColumna_(col['Estado comercial'] + 1);
  const ultima = letraColumna_(inv.getMaxColumns());
  let hoja = ss.getSheetByName('CATALOGO');
  if (!hoja) hoja = ss.insertSheet('CATALOGO');
  hoja.clear();
  hoja.getRange('A1').setFormula(formula_(
    '=IFERROR(QUERY(INVENTARIO!A:' + ultima + '; "select * where ' + letraEstado + ' = \'Disponible\' or ' + letraEstado + ' = \'En formación\'"; 1); "Sin ejemplares publicables")'
  ));
  hoja.setFrozenRows(1);
  hoja.getRange('A1:ZZ1').setFontWeight('bold');
  return 'regenerada (Disponible + En formación; solo lectura)';
}

/** Pestaña RESUMEN con indicadores calculados por fórmula. */
function crearResumen_(ss) {
  const inv = ss.getSheetByName('INVENTARIO');
  const c = columnasDe_(inv);
  const L = (nombre) => letraColumna_(c[nombre] + 1);
  const est = L('Estado comercial'), precio = L('Precio venta'), costo = L('Costo total');
  const cuid = ss.getSheetByName('CUIDADOS');
  const cc = columnasDe_(cuid);
  const tipo = letraColumna_(cc['Tipo'] + 1);
  const ven = ss.getSheetByName('VENTAS');
  const vc = columnasDe_(ven);
  const vPrecio = letraColumna_(vc['Precio final'] + 1), vEstado = letraColumna_(vc['Estado'] + 1), vPlan = letraColumna_(vc['Plan de acompañamiento'] + 1);
  const mat = ss.getSheetByName('MATERIALES');
  const mc = columnasDe_(mat);
  const mTotal = letraColumna_(mc['Costo total'] + 1);
  const cli = ss.getSheetByName('CLIENTES');
  const clc = columnasDe_(cli);
  const cPlan = letraColumna_(clc['Plan activo'] + 1), cCred = letraColumna_(clc['Créditos ($)'] + 1);

  let hoja = ss.getSheetByName('RESUMEN');
  if (!hoja) hoja = ss.insertSheet('RESUMEN');
  hoja.clear();
  // Las fórmulas se escriben con ';' y formula_() las adapta al idioma de la hoja.
  const filas = [
    ['Indicador', 'Valor'],
    ['Ejemplares en inventario', '=COUNTA(INVENTARIO!A2:A)'],
    ['Disponibles', '=COUNTIF(INVENTARIO!' + est + '2:' + est + '; "Disponible")'],
    ['Reservados', '=COUNTIF(INVENTARIO!' + est + '2:' + est + '; "Reservado")'],
    ['Vendidos', '=COUNTIF(INVENTARIO!' + est + '2:' + est + '; "Vendido")'],
    ['En formación (preventa)', '=COUNTIF(INVENTARIO!' + est + '2:' + est + '; "En formación")'],
    ['Valor de inventario disponible', '=SUMIF(INVENTARIO!' + est + '2:' + est + '; "Disponible"; INVENTARIO!' + precio + '2:' + precio + ')'],
    ['Costo total invertido (registrado)', '=SUM(INVENTARIO!' + costo + '2:' + costo + ')'],
    ['', ''],
    ['Ventas registradas', '=COUNTA(VENTAS!A2:A)'],
    ['Ingresos por ventas (pagadas)', '=SUMIF(VENTAS!' + vEstado + '2:' + vEstado + '; "Pagado"; VENTAS!' + vPrecio + '2:' + vPrecio + ')'],
    ['Ventas con plan de acompañamiento', '=COUNTIFS(VENTAS!A2:A; "<>"; VENTAS!' + vPlan + '2:' + vPlan + '; "<>")'],
    ['Clientes registrados', '=COUNTA(CLIENTES!A2:A)'],
    ['Clientes con plan activo', '=COUNTIF(CLIENTES!' + cPlan + '2:' + cPlan + '; "<>")'],
    ['Créditos de referidos por canjear', '=SUM(CLIENTES!' + cCred + '2:' + cCred + ')'],
    ['', ''],
    ['Cuidados registrados', '=COUNTA(CUIDADOS!A2:A)'],
    ['Podas registradas', '=COUNTIF(CUIDADOS!' + tipo + '2:' + tipo + '; "Poda")'],
    ['Trasplantes registrados', '=COUNTIF(CUIDADOS!' + tipo + '2:' + tipo + '; "Trasplante")'],
    ['Alambrados registrados', '=COUNTIF(CUIDADOS!' + tipo + '2:' + tipo + '; "Alambrado")'],
    ['', ''],
    ['Mes actual', '=TEXT(TODAY(); "mmmm")'],
    ['Fase lunar ideal este mes', '=IFERROR(VLOOKUP(MONTH(TODAY()); CALENDARIO_LUNAR!A:D; 3; FALSE); "")'],
    ['Acción recomendada este mes', '=IFERROR(VLOOKUP(MONTH(TODAY()); CALENDARIO_LUNAR!A:D; 4; FALSE); "")'],
    ['', ''],
    ['Valor de herramientas y materiales', '=SUM(MATERIALES!' + mTotal + '2:' + mTotal + ')']
  ];
  filas.forEach((f, i) => {
    hoja.getRange(i + 1, 1).setValue(f[0]);
    if (String(f[1]).charAt(0) === '=') hoja.getRange(i + 1, 2).setFormula(formula_(f[1]));
    else hoja.getRange(i + 1, 2).setValue(f[1]);
  });
  hoja.getRange('A1:B1').setFontWeight('bold').setBackground('#1B241F').setFontColor('#FAFAF6');
  ['B7:B8', 'B11', 'B15', 'B26'].forEach(r => hoja.getRange(r).setNumberFormat('$#,##0.00'));
  hoja.setColumnWidth(1, 300);
  hoja.setColumnWidth(2, 220);
  return 'regenerada';
}

/**
 * Pestaña EMBUDO: conversión mensual desde los eventos anónimos de la tienda
 * (EVENTOS) hasta las ventas (VENTAS). Solo fórmulas; se puede publicar como
 * CSV o leer desde Power BI (ver docs/powerbi/).
 */
function crearEmbudo_(ss) {
  const ev = ss.getSheetByName('EVENTOS');
  const ec = columnasDe_(ev);
  const eFecha = letraColumna_(ec['Fecha'] + 1), eEvento = letraColumna_(ec['Evento'] + 1), eSesion = letraColumna_(ec['Sesión'] + 1);
  const ven = ss.getSheetByName('VENTAS');
  const vc = columnasDe_(ven);
  const vFecha = 'A', vPrecio = letraColumna_(vc['Precio final'] + 1), vEstado = letraColumna_(vc['Estado'] + 1);

  let hoja = ss.getSheetByName('EMBUDO');
  if (!hoja) hoja = ss.insertSheet('EMBUDO');
  hoja.clear();
  const enc = ['Mes', 'Sesiones', 'Fichas abiertas', 'Agregados al carrito', 'Clics a WhatsApp', 'Cotizaciones', 'Ventas pagadas', 'Ingresos ($)', 'Ficha → carrito', 'Carrito → WhatsApp', 'Sesión → venta', 'Ticket promedio ($)'];
  hoja.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#1B241F').setFontColor('#FAFAF6');
  hoja.setFrozenRows(1);
  // 12 meses hacia atrás desde el actual (fila 2 = mes actual).
  for (let i = 0; i < 12; i++) {
    const r = i + 2;
    const mes = '=DATE(YEAR(EDATE(TODAY();-' + i + '));MONTH(EDATE(TODAY();-' + i + '));1)';
    const ini = 'A' + r, fin = 'EDATE(A' + r + ';1)';
    const cuentaEv = (tipo) => '=COUNTIFS(EVENTOS!' + eEvento + ':' + eEvento + ';"' + tipo + '";EVENTOS!' + eFecha + ':' + eFecha + ';">="&' + ini + ';EVENTOS!' + eFecha + ':' + eFecha + ';"<"&' + fin + ')';
    const sesiones = '=IFERROR(ROWS(UNIQUE(FILTER(EVENTOS!' + eSesion + ':' + eSesion + ';EVENTOS!' + eFecha + ':' + eFecha + '>=' + ini + ';EVENTOS!' + eFecha + ':' + eFecha + '<' + fin + ')));0)';
    const ventas = '=COUNTIFS(VENTAS!' + vEstado + ':' + vEstado + ';"Pagado";VENTAS!' + vFecha + ':' + vFecha + ';">="&' + ini + ';VENTAS!' + vFecha + ':' + vFecha + ';"<"&' + fin + ')';
    const ingresos = '=SUMIFS(VENTAS!' + vPrecio + ':' + vPrecio + ';VENTAS!' + vEstado + ':' + vEstado + ';"Pagado";VENTAS!' + vFecha + ':' + vFecha + ';">="&' + ini + ';VENTAS!' + vFecha + ':' + vFecha + ';"<"&' + fin + ')';
    const f = [mes, sesiones, cuentaEv('ficha'), cuentaEv('carrito'), cuentaEv('whatsapp'), cuentaEv('cotizacion'), ventas, ingresos,
      '=IF(C' + r + '=0;"";D' + r + '/C' + r + ')', '=IF(D' + r + '=0;"";E' + r + '/D' + r + ')', '=IF(B' + r + '=0;"";G' + r + '/B' + r + ')', '=IF(G' + r + '=0;"";H' + r + '/G' + r + ')'];
    f.forEach((x, j) => hoja.getRange(r, j + 1).setFormula(formula_(x)));
  }
  hoja.getRange('A2:A13').setNumberFormat('mmm yyyy');
  hoja.getRange('H2:H13').setNumberFormat('$#,##0');
  hoja.getRange('L2:L13').setNumberFormat('$#,##0');
  hoja.getRange('I2:K13').setNumberFormat('0.0%');
  hoja.getRange(15, 1).setValue('Nota: VENTAS!Fecha debe ser una fecha real (no texto) para que cuente aquí. La app la escribe como fecha.');
  return 'regenerada (12 meses)';
}

function crearConfig_(ss) {
  let hoja = ss.getSheetByName('CONFIG');
  if (!hoja) hoja = ss.insertSheet('CONFIG');
  const token = obtenerToken_();
  hoja.clear();
  hoja.getRange('A1:B8').setValues([
    ['Clave', 'Valor'],
    ['Token de la app (cópialo en admin/ → Configuración)', token],
    ['Versión del script', VERSION],
    ['Carpeta de fotos (Drive)', carpetaRaiz_().getUrl()],
    ['Zona horaria', ZONA],
    ['Correo que recibe el resumen diario de recordatorios', Session.getEffectiveUser().getEmail()],
    ['Disparador diario', hayDisparador_() ? 'instalado (' + REGLAS.horaRecordatorios + ':00)' : 'no instalado — ejecuta instalarDisparadores()'],
    ['Último setup', Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm')]
  ]);
  hoja.getRange('A1:B1').setFontWeight('bold').setBackground('#1B241F').setFontColor('#FAFAF6');
  hoja.setColumnWidth(1, 360);
  hoja.setColumnWidth(2, 420);
  return 'lista';
}

/** Listas desplegables para que el sheet se mantenga ordenado al editar a mano. */
function aplicarValidaciones_(ss) {
  const regla = (lista) => SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build();
  const filasDe = (h) => Math.max(h.getMaxRows() - 1, 1);

  const inv = ss.getSheetByName('INVENTARIO');
  const c = columnasDe_(inv);
  const filas = filasDe(inv);
  inv.getRange(2, c['Estado comercial'] + 1, filas).setDataValidation(regla(ESTADOS_COMERCIALES));
  inv.getRange(2, c['Estado de salud'] + 1, filas).setDataValidation(regla(ESTADOS_SALUD));
  inv.getRange(2, c['Ambiente'] + 1, filas).setDataValidation(regla(AMBIENTES));
  inv.getRange(2, c['Estilo'] + 1, filas).setDataValidation(regla(Object.keys(ESTILOS)));
  inv.getRange(2, c['Destacado'] + 1, filas).setDataValidation(regla(['Sí', 'No']));
  inv.getRange(2, c['Precio venta'] + 1, filas).setNumberFormat('$#,##0.00');
  inv.getRange(2, c['Costo total'] + 1, filas).setNumberFormat('$#,##0.00');
  inv.getRange(2, c['Margen $'] + 1, filas).setNumberFormat('$#,##0.00');
  inv.getRange(2, c['Margen %'] + 1, filas).setNumberFormat('0.0%');

  const cuid = ss.getSheetByName('CUIDADOS');
  const cc = columnasDe_(cuid);
  cuid.getRange(2, cc['Tipo'] + 1, filasDe(cuid)).setDataValidation(regla(TIPOS_CUIDADO));

  const ven = ss.getSheetByName('VENTAS');
  const vc = columnasDe_(ven);
  ven.getRange(2, vc['Estado'] + 1, filasDe(ven)).setDataValidation(regla(['Pagado', 'Pendiente', 'Anulado']));
  ven.getRange(2, vc['Canal'] + 1, filasDe(ven)).setDataValidation(regla(CANALES_VENTA));
  ven.getRange(2, vc['Plan de acompañamiento'] + 1, filasDe(ven)).setDataValidation(regla(Object.keys(REGLAS.planesMeses)));

  const cli = ss.getSheetByName('CLIENTES');
  const clc = columnasDe_(cli);
  cli.getRange(2, clc['Recordatorios'] + 1, filasDe(cli)).setDataValidation(regla(['Sí', 'No']));
  cli.getRange(2, clc['Plan activo'] + 1, filasDe(cli)).setDataValidation(regla(Object.keys(REGLAS.planesMeses)));
  cli.getRange(2, clc['Origen'] + 1, filasDe(cli)).setDataValidation(regla(CANALES_VENTA));
  cli.getRange(2, clc['Créditos ($)'] + 1, filasDe(cli)).setNumberFormat('$#,##0.00');
  cli.getRange(2, clc['Total comprado'] + 1, filasDe(cli)).setNumberFormat('$#,##0.00');

  const rec = ss.getSheetByName('RECORDATORIOS');
  const rc = columnasDe_(rec);
  rec.getRange(2, rc['Estado'] + 1, filasDe(rec)).setDataValidation(regla(ESTADOS_RECORDATORIO));

  const cot = ss.getSheetByName('COTIZACIONES');
  const coc = columnasDe_(cot);
  cot.getRange(2, coc['Estado'] + 1, filasDe(cot)).setDataValidation(regla(ESTADOS_COTIZACION));

  const cal = ss.getSheetByName('CALENDARIO_EDITORIAL');
  const cac = columnasDe_(cal);
  cal.getRange(2, cac['Estado'] + 1, filasDe(cal)).setDataValidation(regla(['Idea', 'Diseñado', 'Programado', 'Publicado']));
}

/** Completa "Estilo JP" a partir de "Estilo" cuando esté vacío. */
function rellenarEstilosJP_(ss) {
  const inv = ss.getSheetByName('INVENTARIO');
  const c = columnasDe_(inv);
  const n = inv.getLastRow() - 1;
  if (n < 1) return;
  const estilos = inv.getRange(2, c['Estilo'] + 1, n).getValues();
  const jp = inv.getRange(2, c['Estilo JP'] + 1, n).getValues();
  const out = jp.map((v, i) => [v[0] || ESTILOS[String(estilos[i][0]).trim()] || '']);
  inv.getRange(2, c['Estilo JP'] + 1, n).setValues(out);
}

function sembrarCalendario_(ss) {
  const hoja = ss.getSheetByName('CALENDARIO_LUNAR');
  if (hoja.getLastRow() > 1) return;
  hoja.getRange(2, 1, 12, 4).setValues([
    [1, 'Enero', 'Luna nueva / cuarto menguante', 'Poda ligera y ajuste de alambrado de mantenimiento.'],
    [2, 'Febrero', 'Cuarto creciente / luna nueva', 'Trasplante y corte de raíces menores tras la temporada lluviosa.'],
    [3, 'Marzo', 'Cuarto creciente', 'Fertilización ligera para iniciar el crecimiento.'],
    [4, 'Abril', 'Cuarto creciente / luna nueva', 'Fertilización fuerte para un crecimiento vigoroso.'],
    [5, 'Mayo', 'Luna nueva / cuarto menguante', 'Poda de ramas y raíces secas.'],
    [6, 'Junio', 'Cuarto creciente', 'Alambrado nuevo o ajuste, con la savia en crecimiento activo.'],
    [7, 'Julio', 'Luna llena', 'Solo monitoreo y control de riego; sin intervenciones mayores.'],
    [8, 'Agosto', 'Cuarto creciente / menguante', 'Fertilización ligera y preparación para la temporada lluviosa.'],
    [9, 'Septiembre', 'Luna nueva / cuarto creciente', 'Poda de mantenimiento y trasplante antes de las lluvias.'],
    [10, 'Octubre', 'Luna llena', 'Descanso y revisión de posibles daños por humedad.'],
    [11, 'Noviembre', 'Cuarto creciente', 'Fertilización ligera de mantenimiento.'],
    [12, 'Diciembre', 'Cuarto menguante', 'Poda ligera y preparación del árbol para su descanso.']
  ]);
}

/**
 * Calendario editorial de 90 días (14/09/2026 → 13/12/2026): los posts del
 * documento COPY ordenados por fase lunar y fecha comercial. Solo se siembra
 * si la pestaña está vacía; después se edita a mano (columna Estado).
 * La misma tabla está en docs/CALENDARIO_EDITORIAL.md.
 */
function sembrarCalendarioEditorial_(ss) {
  const hoja = ss.getSheetByName('CALENDARIO_EDITORIAL');
  if (hoja.getLastRow() > 1) return 'ya tenía contenido, no se tocó';
  const filas = CALENDARIO_EDITORIAL_SEMILLA.map(r => [
    fechaDesdeISO_(r[0]), diaSemana_(r[0]), r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], 'Idea'
  ]);
  hoja.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
  hoja.getRange(2, 1, filas.length, 1).setNumberFormat('dd/MM/yyyy');
  hoja.setColumnWidth(7, 260); hoja.setColumnWidth(8, 420); hoja.setColumnWidth(10, 260);
  return filas.length + ' publicaciones sembradas';
}

/* ==================================================================== */
/*  WEB APP                                                              */
/* ==================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const accion = p.action || 'catalogo';
  try {
    if (accion === 'ping') return json_({ ok: true, version: VERSION, hora: ahora_() });
    if (accion === 'catalogo') return json_({ ok: true, productos: catalogoPublico_() });
    if (accion === 'arbol') return json_(Object.assign({ ok: true }, pasaporte_(p.id)));
    if (accion === 'codigo') return json_(Object.assign({ ok: true }, validarCodigo_(p.c)));
    if (accion === 'exportar') {
      // Para Power BI / Excel: JSON plano de una pestaña. Requiere token en la URL.
      if (p.token !== obtenerToken_()) return json_({ ok: false, error: 'Token inválido' });
      const permitidas = ['VENTAS', 'CLIENTES', 'EVENTOS', 'CUIDADOS', 'INVENTARIO', 'COTIZACIONES', 'RECORDATORIOS', 'EMBUDO'];
      if (permitidas.indexOf(p.hoja) === -1) return json_({ ok: false, error: 'Hoja no exportable' });
      return json_({ ok: true, hoja: p.hoja, filas: leerHoja_(p.hoja) });
    }
    return json_({ ok: false, error: 'Acción desconocida: ' + accion });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let cuerpo;
  try { cuerpo = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'Cuerpo inválido' }); }
  if (!cuerpo) return json_({ ok: false, error: 'Cuerpo vacío' });

  const publica = ACCIONES_PUBLICAS_POST.indexOf(cuerpo.action) !== -1;
  if (!publica && cuerpo.token !== obtenerToken_()) {
    return json_({ ok: false, error: 'Token inválido', codigo: 'AUTH' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const p = cuerpo.payload || {};
    let r;
    switch (cuerpo.action) {
      /* --- públicas (sin token) --- */
      case 'evento':       r = registrarEvento_(p); break;
      case 'cotizacion':   r = registrarCotizacion_(p); break;
      /* --- app de registro --- */
      case 'listar':       r = listar_(); break;
      case 'crear':        r = crearEjemplar_(p); break;
      case 'actualizar':   r = actualizarEjemplar_(p.id, p.cambios || {}); break;
      case 'subirFoto':    r = subirFoto_(p); break;
      case 'venta':        r = registrarVenta_(p); break;
      case 'cuidado':      r = registrarCuidado_(p); break;
      case 'material':     r = registrarMaterial_(p); break;
      case 'cliente':      r = guardarCliente_(p); break;
      case 'recordatorio': r = marcarRecordatorio_(p); break;
      case 'generarRecordatorios': r = { generados: generarRecordatorios(true) }; break;
      case 'cotizacionEstado': r = actualizarCotizacion_(p); break;
      case 'metricas':     r = metricas_(p); break;
      default: throw new Error('Acción desconocida: ' + cuerpo.action);
    }
    if (!publica) { SpreadsheetApp.flush(); invalidarCache_(); }
    return json_(Object.assign({ ok: true }, r));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* nada */ }
  }
}

/* ------------------------------ Lecturas ---------------------------- */

/** Lo que ve la tienda: Disponibles y En formación (preventa), solo campos públicos. Cache 60 s. */
function catalogoPublico_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('catalogo');
  if (hit) return JSON.parse(hit);

  const filas = leerHoja_('INVENTARIO').filter(f => f['Estado comercial'] === 'Disponible' || f['Estado comercial'] === 'En formación');
  const productos = filas.map(f => productoPublico_(f));
  cache.put('catalogo', JSON.stringify(productos), 60);
  return productos;
}

function productoPublico_(f) {
  return {
    ID: f['ID'],
    Nombre: f['Nombre comercial'],
    Especie: f['Especie'],
    Estilo: f['Estilo'],
    EstiloJP: f['Estilo JP'],
    Ambiente: f['Ambiente'],
    Altura: f['Altura (cm)'] ? f['Altura (cm)'] + ' cm' : '',
    Edad: f['Edad (años)'] ? f['Edad (años)'] + ' años' : '',
    Maceta: f['Maceta'],
    Riego: f['Riego'],
    Historia: f['Historia'],
    Precio: f['Precio venta'],
    Imagen: f['Carpeta imagen'],
    Fotos: f['Fotos'],
    Destacado: f['Destacado'],
    'Estado comercial': f['Estado comercial'],
    'Entrega estimada': f['Entrega estimada'] || '',
    Stock: f['Estado comercial'] === 'Disponible' ? 1 : 0
  };
}

/**
 * Pasaporte público de un árbol (arbol.html?id=LB-0001): ficha, fotos,
 * historial de cuidados y datos del certificado. Nunca expone costo, notas
 * internas ni contacto del cliente; el nombre del custodio solo si se
 * escribió en VENTAS → "Nombre en pasaporte".
 */
function pasaporte_(id) {
  if (!id) throw new Error('Falta el id');
  const cache = CacheService.getScriptCache();
  const k = 'arbol:' + id;
  const hit = cache.get(k);
  if (hit) return JSON.parse(hit);

  const f = leerHoja_('INVENTARIO').find(x => String(x['ID']).trim().toLowerCase() === String(id).trim().toLowerCase());
  if (!f || f['Estado comercial'] === 'Baja') throw new Error('No existe el árbol ' + id);
  const cuidados = leerHoja_('CUIDADOS').filter(c => c['ID Ejemplar'] === f['ID'])
    .map(c => ({ Fecha: c['Fecha'], Tipo: c['Tipo'], 'Fase lunar': c['Fase lunar'], Detalle: c['Detalle'] }))
    .sort((a, b) => fechaOrden_(b.Fecha) - fechaOrden_(a.Fecha));
  const ventas = leerHoja_('VENTAS').filter(v => v['ID Ejemplar'] === f['ID'] && v['Estado'] !== 'Anulado');
  const ultima = ventas[ventas.length - 1] || null;
  const r = {
    arbol: Object.assign(productoPublico_(f), {
      'Fecha de ingreso': f['Fecha de ingreso'], 'Última poda': f['Última poda'],
      'Último trasplante': f['Último trasplante'], 'Último alambrado': f['Último alambrado'],
      'Estado de salud': f['Estado de salud']
    }),
    cuidados,
    certificado: ultima ? {
      fecha: ultima['Fecha'], plan: ultima['Plan de acompañamiento'] || '',
      custodio: ultima['Nombre en pasaporte'] || '', estado: ultima['Estado']
    } : null,
    mesLunar: accionMesActual_()
  };
  cache.put(k, JSON.stringify(r), 120);
  return r;
}

/** ¿Es válido este código? Devuelve el descuento y quién lo refiere (solo nombre de pila). */
function validarCodigo_(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (!c) return { valido: false, motivo: 'Escribe un código' };
  if (REGLAS.codigosFijos[c]) return { valido: true, codigo: c, descuentoPct: REGLAS.codigosFijos[c], tipo: 'promo', mensaje: c + ': ' + REGLAS.codigosFijos[c] + '% en tu primer legado' };
  const cli = leerHoja_('CLIENTES').find(x => String(x['Código referido']).trim().toUpperCase() === c);
  if (!cli) return { valido: false, motivo: 'Código no encontrado' };
  const nombre = String(cli['Nombre'] || '').split(' ')[0];
  return { valido: true, codigo: c, descuentoPct: REGLAS.descuentoReferidoPct, tipo: 'referido', referente: nombre,
    mensaje: 'Código de ' + nombre + ': ' + REGLAS.descuentoReferidoPct + '% en árboles y planes. ' + nombre + ' recibe $' + REGLAS.creditoReferente + ' de crédito.' };
}

/** Todo lo que necesita la app de registro (requiere token). */
function listar_() {
  const inventario = leerHoja_('INVENTARIO');
  const ventas = leerHoja_('VENTAS').slice(-30).reverse();
  const cuidados = leerHoja_('CUIDADOS').slice(-30).reverse();
  const materiales = leerHoja_('MATERIALES');
  const clientes = leerHoja_('CLIENTES');
  const recordatorios = leerHoja_('RECORDATORIOS').filter(r => r['Estado'] === 'Pendiente').slice(-60);
  const cotizaciones = leerHoja_('COTIZACIONES').slice(-30).reverse();
  const resumen = {
    total: inventario.length,
    disponibles: inventario.filter(f => f['Estado comercial'] === 'Disponible').length,
    reservados: inventario.filter(f => f['Estado comercial'] === 'Reservado').length,
    vendidos: inventario.filter(f => f['Estado comercial'] === 'Vendido').length,
    enFormacion: inventario.filter(f => f['Estado comercial'] === 'En formación').length,
    valorDisponible: inventario.filter(f => f['Estado comercial'] === 'Disponible')
      .reduce((s, f) => s + (parseFloat(f['Precio venta']) || 0), 0),
    valorMateriales: materiales.reduce((s, f) => s + (parseFloat(f['Costo total']) || 0), 0),
    clientes: clientes.length,
    planesActivos: clientes.filter(c => c['Plan activo']).length,
    recordatoriosPendientes: recordatorios.length,
    cotizacionesNuevas: cotizaciones.filter(c => c['Estado'] === 'Nueva').length
  };
  return { inventario, ventas, cuidados, materiales, clientes, recordatorios, cotizaciones, resumen, estilos: ESTILOS,
    reglas: REGLAS, faseHoy: faseLunar_(new Date()),
    listas: { estadosComerciales: ESTADOS_COMERCIALES, estadosSalud: ESTADOS_SALUD, ambientes: AMBIENTES, tiposCuidado: TIPOS_CUIDADO, canales: CANALES_VENTA } };
}

/* ------------------------------ Escrituras -------------------------- */

function crearEjemplar_(p) {
  const hoja = hoja_('INVENTARIO');
  const c = columnasDe_(hoja);
  const id = p['ID'] && !buscarFila_(hoja, p['ID']) ? String(p['ID']).trim() : siguienteId_(hoja, 'LB');

  const registro = Object.assign({}, p, {
    'ID': id,
    'Estado comercial': p['Estado comercial'] || 'Disponible',
    'Fecha de ingreso': p['Fecha de ingreso'] || hoy_(),
    'Estilo JP': p['Estilo JP'] || ESTILOS[p['Estilo']] || '',
    'Última actualización': ahora_()
  });
  const fila = hoja.getLastRow() + 1;
  escribirFila_(hoja, fila, registro);
  ponerFormulasMargen_(hoja, fila, c);
  return { id, fila };
}

function actualizarEjemplar_(id, cambios) {
  const hoja = hoja_('INVENTARIO');
  const fila = buscarFila_(hoja, id);
  if (!fila) throw new Error('No existe el ejemplar ' + id);
  delete cambios['ID'];
  if (cambios['Estilo'] && !cambios['Estilo JP']) cambios['Estilo JP'] = ESTILOS[cambios['Estilo']] || '';
  cambios['Última actualización'] = ahora_();
  escribirFila_(hoja, fila, cambios);
  CacheService.getScriptCache().remove('arbol:' + id);
  return { id, fila };
}

/**
 * Sube UNA foto (base64) a Drive: carpeta raíz / <ID> / <id>_<NN>.<ext>.
 * Devuelve la URL pública que la tienda puede usar en <img>.
 * El cliente, al terminar todas, llama a "actualizar" con Fotos = lista de URLs.
 */
function subirFoto_(p) {
  if (!p.id || !p.base64) throw new Error('Faltan id o base64');
  const mime = p.mime || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const n = parseInt(p.indice, 10) || 1;
  const nombre = String(p.id).toLowerCase() + '_' + (n < 10 ? '0' + n : n) + '.' + ext;

  const carpeta = carpetaEjemplar_(p.id);
  // Reemplaza la foto anterior con el mismo número (cualquier extensión) para no acumular versiones.
  const prefijo = nombre.replace(/\.[a-z0-9]+$/i, '.');
  const previas = carpeta.getFiles();
  while (previas.hasNext()) {
    const f = previas.next();
    if (f.getName().toLowerCase().indexOf(prefijo) === 0) f.setTrashed(true);
  }

  const bytes = Utilities.base64Decode(p.base64.replace(/^data:[^;]+;base64,/, ''));
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: urlFoto_(archivo.getId()), fileId: archivo.getId(), nombre };
}

/**
 * Registra una venta, cambia el estado del ejemplar y crea/actualiza al
 * cliente en CLIENTES (con su código de referido). Si se usó un código de
 * otro cliente, le acredita el bono al referente.
 *  p: { id, cliente, contacto, correo, ciudad, canal, precioFinal, fecha, plan,
 *       estado, notas, cantidad, codigoUsado, descuento, anticipo, extras,
 *       nombrePasaporte, recordatorios }
 */
function registrarVenta_(p) {
  const hoja = hoja_('VENTAS');
  const inv = hoja_('INVENTARIO');
  const filaInv = buscarFila_(inv, p.id);
  if (!filaInv) throw new Error('No existe el ejemplar ' + p.id);
  const estadoVenta = p.estado || 'Pagado';
  const fecha = p.fecha || hoy_();

  // 1) Cliente
  const cli = upsertCliente_({
    nombre: p.cliente, whatsapp: p.contacto, correo: p.correo, ciudad: p.ciudad, origen: p.canal || 'WhatsApp',
    plan: p.plan, fecha, monto: parseFloat(p.precioFinal) || 0, ejemplar: p.id,
    recordatorios: p.recordatorios === undefined ? 'Sí' : p.recordatorios, referidoPor: ''
  });

  // 2) Código usado → crédito al referente
  let referente = null;
  const codigo = String(p.codigoUsado || '').trim().toUpperCase();
  if (codigo && !REGLAS.codigosFijos[codigo]) {
    const hc = hoja_('CLIENTES');
    const cc = columnasDe_(hc);
    const n = hc.getLastRow() - 1;
    if (n > 0) {
      const cods = hc.getRange(2, cc['Código referido'] + 1, n).getValues();
      const i = cods.findIndex(r => String(r[0]).trim().toUpperCase() === codigo);
      if (i !== -1 && (i + 2) !== cli.fila) {
        const fila = i + 2;
        const actual = parseFloat(hc.getRange(fila, cc['Créditos ($)'] + 1).getValue()) || 0;
        hc.getRange(fila, cc['Créditos ($)'] + 1).setValue(actual + REGLAS.creditoReferente);
        hc.getRange(fila, cc['Última actualización'] + 1).setValue(ahora_());
        referente = { id: hc.getRange(fila, cc['ID Cliente'] + 1).getValue(), nombre: hc.getRange(fila, cc['Nombre'] + 1).getValue(), creditos: actual + REGLAS.creditoReferente };
        hc.getRange(cli.fila, cc['Referido por'] + 1).setValue(referente.id);
      }
    }
  }

  // 3) Venta
  escribirFila_(hoja, hoja.getLastRow() + 1, {
    'Fecha': fechaDesdeDDMM_(fecha),
    'ID Ejemplar': p.id,
    'Cliente': p.cliente || '',
    'Contacto': p.contacto || '',
    'Cantidad': p.cantidad || 1,
    'Precio final': p.precioFinal || '',
    'Plan de acompañamiento': p.plan || '',
    'Estado': estadoVenta,
    'Notas': p.notas || '',
    'ID Cliente': cli.id,
    'Correo': p.correo || '',
    'Ciudad': p.ciudad || '',
    'Canal': p.canal || '',
    'Código usado': codigo,
    'Descuento ($)': p.descuento || '',
    'Anticipo ($)': p.anticipo || '',
    'Extras': p.extras || '',
    'Nombre en pasaporte': p.nombrePasaporte || ''
  });

  // 4) Estado del ejemplar
  const nuevoEstado = estadoVenta === 'Pagado' ? 'Vendido' : estadoVenta === 'Anulado' ? 'Disponible' : 'Reservado';
  escribirFila_(inv, filaInv, { 'Estado comercial': nuevoEstado, 'Última actualización': ahora_() });
  CacheService.getScriptCache().remove('arbol:' + p.id);

  return { id: p.id, estadoEjemplar: nuevoEstado, cliente: { id: cli.id, codigo: cli.codigo, nuevo: cli.nuevo },
    referente, pasaporte: REGLAS.sitio + '/arbol.html?id=' + encodeURIComponent(p.id) };
}

/** Crea o actualiza un cliente desde la app (sin venta). */
function guardarCliente_(p) {
  const r = upsertCliente_({
    id: p.id, nombre: p.nombre, whatsapp: p.whatsapp, correo: p.correo, ciudad: p.ciudad, origen: p.origen,
    recordatorios: p.recordatorios, notas: p.notas, plan: p.plan, vencePlan: p.vencePlan, creditos: p.creditos
  });
  return { id: r.id, codigo: r.codigo, nuevo: r.nuevo };
}

/**
 * Busca al cliente por ID, WhatsApp (normalizado) o nombre exacto; si no
 * existe lo crea con ID CL-#### y código de referido LEG-XXXX.
 */
function upsertCliente_(d) {
  const hoja = hoja_('CLIENTES');
  const c = columnasDe_(hoja);
  const n = hoja.getLastRow() - 1;
  const tel = normalizarTelefono_(d.whatsapp);
  let fila = 0;
  if (n > 0) {
    const datos = hoja.getRange(2, 1, n, hoja.getLastColumn()).getValues();
    const idx = datos.findIndex(r =>
      (d.id && String(r[c['ID Cliente']]).trim() === String(d.id).trim()) ||
      (tel && normalizarTelefono_(r[c['WhatsApp']]) === tel) ||
      (!tel && d.nombre && String(r[c['Nombre']]).trim().toLowerCase() === String(d.nombre).trim().toLowerCase())
    );
    if (idx !== -1) fila = idx + 2;
  }
  const nuevo = !fila;
  const cambios = { 'Última actualización': ahora_() };
  let id, codigo;
  if (nuevo) {
    fila = hoja.getLastRow() + 1;
    id = siguienteId_(hoja, 'CL');
    codigo = generarCodigoReferido_(d.nombre, hoja, c);
    Object.assign(cambios, {
      'ID Cliente': id, 'Nombre': d.nombre || '', 'WhatsApp': d.whatsapp || '', 'Correo': d.correo || '', 'Ciudad': d.ciudad || '',
      'Origen': d.origen || '', 'Código referido': codigo, 'Referido por': d.referidoPor || '', 'Créditos ($)': d.creditos || 0,
      'Recordatorios': d.recordatorios || 'Sí', 'Notas': d.notas || '', 'Ejemplares': d.ejemplar || '',
      'Primera compra': d.fecha ? fechaDesdeDDMM_(d.fecha) : '', 'Total comprado': d.monto || 0
    });
  } else {
    id = hoja.getRange(fila, c['ID Cliente'] + 1).getValue();
    codigo = hoja.getRange(fila, c['Código referido'] + 1).getValue();
    if (!codigo) { codigo = generarCodigoReferido_(d.nombre, hoja, c); cambios['Código referido'] = codigo; }
    ['nombre:Nombre', 'whatsapp:WhatsApp', 'correo:Correo', 'ciudad:Ciudad', 'origen:Origen', 'notas:Notas', 'recordatorios:Recordatorios'].forEach(par => {
      const [k, col] = par.split(':');
      if (d[k] !== undefined && d[k] !== '' && d[k] !== null) cambios[col] = d[k];
    });
    if (d.creditos !== undefined && d.creditos !== '') cambios['Créditos ($)'] = d.creditos;
    if (d.ejemplar) {
      const prev = String(hoja.getRange(fila, c['Ejemplares'] + 1).getValue()).split(',').map(s => s.trim()).filter(Boolean);
      if (prev.indexOf(d.ejemplar) === -1) prev.push(d.ejemplar);
      cambios['Ejemplares'] = prev.join(', ');
    }
    if (d.monto) {
      const tot = parseFloat(hoja.getRange(fila, c['Total comprado'] + 1).getValue()) || 0;
      cambios['Total comprado'] = tot + d.monto;
      if (!hoja.getRange(fila, c['Primera compra'] + 1).getValue()) cambios['Primera compra'] = fechaDesdeDDMM_(d.fecha);
    }
  }
  if (d.fecha && d.monto !== undefined) cambios['Última compra'] = fechaDesdeDDMM_(d.fecha);
  if (d.plan) {
    cambios['Plan activo'] = d.plan;
    const meses = REGLAS.planesMeses[d.plan] || 12;
    const base = d.fecha ? fechaDesdeDDMM_(d.fecha) : new Date();
    const vence = new Date(base.getTime()); vence.setMonth(vence.getMonth() + meses);
    cambios['Vence plan'] = d.vencePlan ? fechaDesdeDDMM_(d.vencePlan) : vence;
    cambios['Recordatorios'] = 'Sí';
  }
  escribirFila_(hoja, fila, cambios);
  return { id, codigo, fila, nuevo };
}

/** LEG-ANA7K3: iniciales del nombre + 3 caracteres aleatorios, único en la hoja. */
function generarCodigoReferido_(nombre, hoja, c) {
  const base = String(nombre || 'LB').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'LB';
  const alf = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const n = hoja.getLastRow() - 1;
  const usados = n > 0 ? hoja.getRange(2, c['Código referido'] + 1, n).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
  for (let i = 0; i < 50; i++) {
    let suf = '';
    for (let j = 0; j < 3; j++) suf += alf.charAt(Math.floor(Math.random() * alf.length));
    const cod = 'LEG-' + base + suf;
    if (usados.indexOf(cod) === -1 && !REGLAS.codigosFijos[cod]) return cod;
  }
  return 'LEG-' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

/** Da código de referido a los clientes que aún no lo tengan (setup). */
function asegurarCodigosReferido_(ss) {
  const hoja = ss.getSheetByName('CLIENTES');
  const c = columnasDe_(hoja);
  const n = hoja.getLastRow() - 1;
  if (n < 1) return 0;
  let k = 0;
  const datos = hoja.getRange(2, 1, n, hoja.getLastColumn()).getValues();
  datos.forEach((r, i) => {
    if (r[c['Código referido']] || !r[c['Nombre']]) return;
    if (!r[c['ID Cliente']]) hoja.getRange(i + 2, c['ID Cliente'] + 1).setValue(siguienteId_(hoja, 'CL'));
    hoja.getRange(i + 2, c['Código referido'] + 1).setValue(generarCodigoReferido_(r[c['Nombre']], hoja, c));
    k++;
  });
  return k;
}

function registrarCuidado_(p) {
  const hoja = hoja_('CUIDADOS');
  const inv = hoja_('INVENTARIO');
  const filaInv = buscarFila_(inv, p.id);
  if (!filaInv) throw new Error('No existe el ejemplar ' + p.id);
  const fecha = p.fecha || hoy_();
  escribirFila_(hoja, hoja.getLastRow() + 1, {
    'ID Ejemplar': p.id,
    'Fecha': fecha,
    'Tipo': p.tipo || 'Revisión',
    'Fase lunar': p.faseLunar || faseLunar_(fechaDesdeDDMM_(fecha)).nombre,
    'Detalle': p.detalle || '',
    'Responsable': p.responsable || '',
    'Próxima revisión sugerida': p.proxima || ''
  });
  const cambios = { 'Última actualización': ahora_() };
  if (p.tipo === 'Poda') cambios['Última poda'] = fecha;
  if (p.tipo === 'Trasplante') cambios['Último trasplante'] = fecha;
  if (p.tipo === 'Alambrado') cambios['Último alambrado'] = fecha;
  if (p.estadoSalud) cambios['Estado de salud'] = p.estadoSalud;
  escribirFila_(inv, filaInv, cambios);
  CacheService.getScriptCache().remove('arbol:' + p.id);
  return { id: p.id };
}

/** Crea un material nuevo o ajusta la cantidad de uno existente (por nombre). */
function registrarMaterial_(p) {
  const hoja = hoja_('MATERIALES');
  const c = columnasDe_(hoja);
  const nombre = String(p.nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre del material');
  const datos = hoja.getLastRow() > 1 ? hoja.getRange(2, c['Herramienta / Material'] + 1, hoja.getLastRow() - 1).getValues() : [];
  let fila = datos.findIndex(r => String(r[0]).trim().toLowerCase() === nombre.toLowerCase());
  fila = fila === -1 ? 0 : fila + 2;

  if (!fila) {
    fila = hoja.getLastRow() + 1;
    escribirFila_(hoja, fila, {
      'Herramienta / Material': nombre, 'Cantidad': p.cantidad || 0, 'Unidad': p.unidad || 'Unidad',
      'Costo unitario': p.costoUnitario || '', 'Ubicación': p.ubicacion || 'Bodega principal',
      'Observaciones': p.observaciones || '', 'Última actualización': ahora_()
    });
  } else {
    const cambios = { 'Última actualización': ahora_() };
    if (p.ajuste !== undefined && p.ajuste !== '') {
      const actual = parseFloat(hoja.getRange(fila, c['Cantidad'] + 1).getValue()) || 0;
      cambios['Cantidad'] = actual + (parseFloat(p.ajuste) || 0);
    } else if (p.cantidad !== undefined && p.cantidad !== '') cambios['Cantidad'] = p.cantidad;
    if (p.costoUnitario !== undefined && p.costoUnitario !== '') cambios['Costo unitario'] = p.costoUnitario;
    if (p.observaciones) cambios['Observaciones'] = p.observaciones;
    escribirFila_(hoja, fila, cambios);
  }
  const cu = letraColumna_(c['Costo unitario'] + 1), ca = letraColumna_(c['Cantidad'] + 1);
  hoja.getRange(fila, c['Costo total'] + 1).setFormula(formula_('=IF(' + cu + fila + '="";"";' + ca + fila + '*' + cu + fila + ')'));
  return { fila };
}

/* ------------------------- Analítica (pública) ---------------------- */

/**
 * Evento anónimo desde la tienda: { evento, pagina, id, valor, detalle, sesion, ref }.
 * Se acepta sin token; solo se guardan textos cortos y nunca datos personales.
 */
function registrarEvento_(p) {
  const permitidos = ['vista', 'ficha', 'carrito', 'whatsapp', 'plan', 'extra', 'codigo', 'cotizacion', 'newsletter', 'pasaporte', 'taller', 'preventa'];
  const evento = String(p.evento || '').slice(0, 20);
  if (permitidos.indexOf(evento) === -1) throw new Error('Evento no permitido');
  const corto = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, n);
  const hoja = hoja_('EVENTOS');
  const ahora = new Date();
  hoja.appendRow([
    ahora, new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()),
    evento, corto(p.pagina, 40), corto(p.id, 20), parseFloat(p.valor) || '', corto(p.detalle, 120), corto(p.sesion, 24), corto(p.ref, 60)
  ]);
  return { registrado: true };
}

/** Cotización corporativa desde regalos.html (pública). Avisa por correo. */
function registrarCotizacion_(p) {
  const corto = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, n);
  if (!corto(p.empresa, 1) && !corto(p.contacto, 1)) throw new Error('Faltan datos');
  const hoja = hoja_('COTIZACIONES');
  escribirFila_(hoja, hoja.getLastRow() + 1, {
    'Fecha': new Date(), 'Empresa': corto(p.empresa, 80), 'Contacto': corto(p.contacto, 80), 'WhatsApp / Correo': corto(p.medio, 80),
    'Ciudad': corto(p.ciudad, 40), 'Cantidad': parseInt(p.cantidad, 10) || '', 'Paquete': corto(p.paquete, 30),
    'Placa personalizada': p.placa ? 'Sí' : 'No', 'Fecha deseada': corto(p.fechaDeseada, 20), 'Mensaje': corto(p.mensaje, 500),
    'Estimado ($)': parseFloat(p.estimado) || '', 'Estado': 'Nueva'
  });
  try {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: '[Legado Bonsai] Nueva cotización corporativa: ' + corto(p.empresa, 60),
      body: 'Empresa: ' + p.empresa + '\nContacto: ' + p.contacto + ' (' + p.medio + ')\nCiudad: ' + p.ciudad +
        '\nCantidad: ' + p.cantidad + ' × ' + p.paquete + (p.placa ? ' + placa' : '') + '\nFecha deseada: ' + p.fechaDeseada +
        '\nEstimado: $' + p.estimado + '\n\nMensaje:\n' + p.mensaje + '\n\nResponde desde la pestaña COTIZACIONES del sheet.'
    });
  } catch (e) { /* sin correo: queda en la hoja */ }
  return { registrado: true };
}

function actualizarCotizacion_(p) {
  const hoja = hoja_('COTIZACIONES');
  const fila = parseInt(p.fila, 10);
  if (!fila || fila < 2) throw new Error('Fila inválida');
  const cambios = {};
  if (p.estado) cambios['Estado'] = p.estado;
  if (p.notas !== undefined) cambios['Notas'] = p.notas;
  escribirFila_(hoja, fila, cambios);
  return { fila };
}

/* ==================================================================== */
/*  RECORDATORIOS LUNARES (disparador diario)                            */
/* ==================================================================== */

/** Instala el disparador diario (una sola vez). Ejecutar desde el editor. */
function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'generarRecordatorios') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('generarRecordatorios').timeBased().atHour(REGLAS.horaRecordatorios).everyDays(1).inTimezone(ZONA).create();
  crearConfig_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log('Disparador diario instalado a las ' + REGLAS.horaRecordatorios + ':00 (' + ZONA + ')');
}

function hayDisparador_() {
  return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'generarRecordatorios');
}

/**
 * Genera los recordatorios del día en RECORDATORIOS (sin duplicar) y envía
 * un correo resumen con los enlaces de WhatsApp listos para tocar.
 * Tipos:
 *  - Fase lunar: el día exacto de luna nueva / cuarto creciente / llena /
 *    menguante, si esa fase es la "ideal" del mes en CALENDARIO_LUNAR,
 *    a cada cliente con Recordatorios = Sí.
 *  - Revisión: cuando CUIDADOS → "Próxima revisión sugerida" es hoy.
 *  - Renovación: 15 días antes de "Vence plan".
 *  - Bienvenida: 3 días después de la primera compra (cómo usar el pasaporte).
 * `forzado` = true genera aunque hoy no sea día de fase (para probar desde la app).
 */
function generarRecordatorios(forzado) {
  const hoy = new Date();
  const hoyTxt = hoy_();
  const fase = faseLunar_(hoy);
  const mes = leerHoja_('CALENDARIO_LUNAR').find(r => parseInt(r['N° mes'], 10) === hoy.getMonth() + 1) || {};
  const faseIdeal = String(mes['Fase lunar ideal'] || '').toLowerCase();
  const clientes = leerHoja_('CLIENTES');
  const existentes = leerHoja_('RECORDATORIOS').filter(r => r['Fecha'] === hoyTxt).map(r => r['ID Cliente'] + '|' + r['Tipo'] + '|' + r['ID Ejemplar']);
  const nuevos = [];
  const agregar = (cli, tipo, idEj, mensaje) => {
    const k = cli['ID Cliente'] + '|' + tipo + '|' + (idEj || '');
    if (existentes.indexOf(k) !== -1) return;
    existentes.push(k);
    const tel = normalizarTelefono_(cli['WhatsApp']);
    nuevos.push([hoyTxt, cli['ID Cliente'], cli['Nombre'], cli['WhatsApp'], idEj || '', tipo, fase.nombre, mensaje,
      tel ? 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje) : '', 'Pendiente', '']);
  };
  const nombreDe = (cli) => String(cli['Nombre'] || '').split(' ')[0] || 'Hola';
  const activos = clientes.filter(c => /^s[ií]$/i.test(String(c['Recordatorios'] || '')) && normalizarTelefono_(c['WhatsApp']));

  // 1) Fase lunar (día exacto del evento y coincide con la fase ideal del mes)
  const esDiaDeFase = fase.evento && faseIdeal.indexOf(fase.evento.toLowerCase()) !== -1;
  if (esDiaDeFase || forzado) {
    activos.forEach(cli => {
      const arboles = String(cli['Ejemplares'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const msg = nombreDe(cli) + ', hoy es ' + (fase.evento || fase.nombre).toLowerCase() + ' 🌙 — el momento del mes para tu junípero: ' +
        (mes['Acción recomendada'] || 'revisar el árbol con calma') +
        (arboles.length ? '\n\nPasaporte de tu árbol: ' + REGLAS.sitio + '/arbol.html?id=' + arboles[0] : '') +
        '\n\n¿Quieres que lo hagamos juntos? Responde este mensaje y agendamos. — Legado Bonsai 家族の木';
      agregar(cli, 'Fase lunar', arboles[0] || '', msg);
    });
  }

  // 2) Próxima revisión sugerida = hoy
  const cuidadosHoy = leerHoja_('CUIDADOS').filter(c => c['Próxima revisión sugerida'] === hoyTxt);
  cuidadosHoy.forEach(cu => {
    const cli = clientes.find(c => String(c['Ejemplares'] || '').split(',').map(s => s.trim()).indexOf(cu['ID Ejemplar']) !== -1);
    if (!cli || !normalizarTelefono_(cli['WhatsApp'])) return;
    const msg = nombreDe(cli) + ', según el historial de ' + cu['ID Ejemplar'] + ' hoy toca revisarlo (' + (cu['Tipo'] || 'revisión') + ' del ' + cu['Fecha'] + '). ' +
      'Míralo con calma: color de las agujas, humedad del sustrato y el alambre. Si algo te inquieta, mándanos una foto. — Legado Bonsai';
    agregar(cli, 'Revisión', cu['ID Ejemplar'], msg);
  });

  // 3) Renovación de plan (15 días antes)
  clientes.forEach(cli => {
    const vence = cli['Vence plan'];
    if (!vence || !cli['Plan activo'] || !normalizarTelefono_(cli['WhatsApp'])) return;
    const dias = Math.round((fechaDesdeDDMM_(vence) - hoy) / 86400000);
    if (dias === 15 || (forzado && dias >= 0 && dias <= 15)) {
      const msg = nombreDe(cli) + ', tu plan ' + cli['Plan activo'] + ' termina el ' + vence + '. Si quieres seguir con las podas, trasplantes y recordatorios un año más, ' +
        'renovarlo cuesta $' + (REGLAS.planesPrecio[cli['Plan activo']] || '') + (parseFloat(cli['Créditos ($)']) > 0 ? ' y tienes $' + cli['Créditos ($)'] + ' de crédito por tus referidos' : '') + '. ¿Lo dejamos listo? — Legado Bonsai';
      agregar(cli, 'Renovación', '', msg);
    }
  });

  // 4) Bienvenida (3 días después de la primera compra)
  clientes.forEach(cli => {
    if (!cli['Primera compra'] || !normalizarTelefono_(cli['WhatsApp'])) return;
    const dias = Math.round((hoy - fechaDesdeDDMM_(cli['Primera compra'])) / 86400000);
    if (dias === 3 || (forzado && dias >= 0 && dias <= 3)) {
      const arboles = String(cli['Ejemplares'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const msg = nombreDe(cli) + ', ¿cómo va tu junípero en su nuevo hogar? 🌿 Guarda este enlace: es el pasaporte de tu árbol, con su historial de cuidados y certificado' +
        (arboles.length ? ': ' + REGLAS.sitio + '/arbol.html?id=' + arboles[0] : '.') +
        '\n\nY tu código para regalar 10% a un amigo (tú ganas $' + REGLAS.creditoReferente + '): ' + cli['Código referido'] + ' — Legado Bonsai';
      agregar(cli, 'Bienvenida', arboles[0] || '', msg);
    }
  });

  if (nuevos.length) {
    const hoja = hoja_('RECORDATORIOS');
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevos.length, nuevos[0].length).setValues(nuevos);
  }
  enviarResumenRecordatorios_(nuevos, fase, mes);
  return nuevos.length;
}

function enviarResumenRecordatorios_(nuevos, fase, mes) {
  const pendientes = leerHoja_('RECORDATORIOS').filter(r => r['Estado'] === 'Pendiente');
  if (!pendientes.length) return;
  const lineas = pendientes.map(r => '• [' + r['Tipo'] + '] ' + r['Cliente'] + (r['ID Ejemplar'] ? ' · ' + r['ID Ejemplar'] : '') + '\n  ' + r['Enlace']);
  try {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: '[Legado Bonsai] ' + pendientes.length + ' recordatorio(s) para enviar hoy · ' + fase.nombre,
      body: 'Hoy: ' + fase.nombre + (fase.evento ? ' (' + fase.evento + ')' : '') + ' · ' + (mes['Acción recomendada'] || '') +
        '\nNuevos hoy: ' + nuevos.length + ' · Pendientes en total: ' + pendientes.length +
        '\n\nToca cada enlace desde el teléfono: abre WhatsApp con el mensaje listo. Luego márcalo como Enviado en la app (Inicio → Recordatorios) o en la pestaña RECORDATORIOS.\n\n' +
        lineas.join('\n\n')
    });
  } catch (e) { Logger.log('No se pudo enviar el resumen: ' + e); }
}

/** Marca un recordatorio como Enviado / Omitido (desde la app). */
function marcarRecordatorio_(p) {
  const hoja = hoja_('RECORDATORIOS');
  const c = columnasDe_(hoja);
  const fila = parseInt(p.fila, 10);
  if (!fila || fila < 2) throw new Error('Fila inválida');
  hoja.getRange(fila, c['Estado'] + 1).setValue(p.estado || 'Enviado');
  hoja.getRange(fila, c['Enviado'] + 1).setValue(ahora_());
  return { fila };
}

/* ------------------------------ Métricas ---------------------------- */

/** Embudo y ventas de los últimos `dias` (default 30) para el tablero de la app. */
function metricas_(p) {
  const dias = parseInt(p && p.dias, 10) || 30;
  const desde = new Date(); desde.setDate(desde.getDate() - dias); desde.setHours(0, 0, 0, 0);
  const eventos = leerHojaCruda_('EVENTOS').filter(r => r['Fecha hora'] instanceof Date && r['Fecha hora'] >= desde);
  const cuenta = (t) => eventos.filter(e => e['Evento'] === t).length;
  const sesiones = new Set(eventos.map(e => e['Sesión']).filter(Boolean)).size;
  const ventas = leerHoja_('VENTAS').filter(v => v['Estado'] !== 'Anulado' && fechaDesdeDDMM_(v['Fecha']) >= desde);
  const pagadas = ventas.filter(v => v['Estado'] === 'Pagado');
  const ingresos = pagadas.reduce((s, v) => s + (parseFloat(v['Precio final']) || 0), 0);
  const porPlan = {}; ventas.forEach(v => { const k = v['Plan de acompañamiento'] || 'Sin plan'; porPlan[k] = (porPlan[k] || 0) + 1; });
  const porCanal = {}; ventas.forEach(v => { const k = v['Canal'] || 'Sin canal'; porCanal[k] = (porCanal[k] || 0) + 1; });
  const fichas = {}; eventos.filter(e => e['Evento'] === 'ficha' && e['ID Ejemplar']).forEach(e => { fichas[e['ID Ejemplar']] = (fichas[e['ID Ejemplar']] || 0) + 1; });
  const topFichas = Object.keys(fichas).map(k => ({ id: k, n: fichas[k] })).sort((a, b) => b.n - a.n).slice(0, 5);
  const refs = {}; eventos.filter(e => e['Evento'] === 'vista').forEach(e => { const k = e['Referencia'] || 'directo'; refs[k] = (refs[k] || 0) + 1; });
  const porDia = {};
  eventos.forEach(e => { const k = Utilities.formatDate(e['Fecha hora'], ZONA, 'dd/MM'); porDia[k] = porDia[k] || { vistas: 0, whatsapp: 0 }; if (e['Evento'] === 'vista') porDia[k].vistas++; if (e['Evento'] === 'whatsapp') porDia[k].whatsapp++; });
  return {
    dias, sesiones, vistas: cuenta('vista'), fichas: cuenta('ficha'), carritos: cuenta('carrito'), whatsapp: cuenta('whatsapp'),
    cotizaciones: cuenta('cotizacion'), newsletter: cuenta('newsletter'), pasaportes: cuenta('pasaporte'),
    ventas: ventas.length, pagadas: pagadas.length, ingresos, ticket: pagadas.length ? ingresos / pagadas.length : 0,
    porPlan, porCanal, topFichas, referencias: refs, porDia
  };
}

/* ==================================================================== */
/*  Fase lunar                                                           */
/* ==================================================================== */

/**
 * Fase lunar aproximada (±1 día) por edad sinódica desde la luna nueva de
 * referencia del 6/1/2000 18:14 UTC. Devuelve { edad, nombre, evento }:
 * `evento` solo tiene valor el día exacto de luna nueva / cuarto creciente /
 * luna llena / cuarto menguante.
 */
function faseLunar_(fecha) {
  const SIN = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const t = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12).getTime();
  let edad = ((t - ref) / 86400000) % SIN; if (edad < 0) edad += SIN;
  let ayer = edad - 1; if (ayer < 0) ayer += SIN;
  let evento = '';
  if (ayer > edad) evento = 'Luna nueva';
  else if (ayer < SIN / 4 && edad >= SIN / 4) evento = 'Cuarto creciente';
  else if (ayer < SIN / 2 && edad >= SIN / 2) evento = 'Luna llena';
  else if (ayer < 3 * SIN / 4 && edad >= 3 * SIN / 4) evento = 'Cuarto menguante';
  let nombre;
  if (edad < 1.85) nombre = 'Luna nueva';
  else if (edad < SIN / 4 - 1) nombre = 'Luna creciente';
  else if (edad < SIN / 4 + 1) nombre = 'Cuarto creciente';
  else if (edad < SIN / 2 - 1) nombre = 'Creciente gibosa';
  else if (edad < SIN / 2 + 1) nombre = 'Luna llena';
  else if (edad < 3 * SIN / 4 - 1) nombre = 'Menguante gibosa';
  else if (edad < 3 * SIN / 4 + 1) nombre = 'Cuarto menguante';
  else if (edad < SIN - 1.85) nombre = 'Luna menguante';
  else nombre = 'Luna nueva';
  return { edad: Math.round(edad * 10) / 10, nombre, evento };
}

function accionMesActual_() {
  const hoy = new Date();
  const mes = leerHoja_('CALENDARIO_LUNAR').find(r => parseInt(r['N° mes'], 10) === hoy.getMonth() + 1) || {};
  return { mes: mes['Mes'] || '', fase: mes['Fase lunar ideal'] || '', accion: mes['Acción recomendada'] || '', hoy: faseLunar_(hoy) };
}

/* ==================================================================== */
/*  Utilidades                                                           */
/* ==================================================================== */

function hoja_(nombre) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña ' + nombre + '. Ejecuta setup() primero.');
  return h;
}

/** { 'Encabezado': índiceBase0 } */
function columnasDe_(hoja) {
  const enc = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
  const map = {};
  enc.forEach((h, i) => { const k = String(h).trim(); if (k && map[k] === undefined) map[k] = i; });
  return map;
}

/** Lee una pestaña como lista de objetos {encabezado: valor}. Fechas → dd/MM/yyyy. */
function leerHoja_(nombre) {
  return leerHojaCruda_(nombre).map(o => { const r = {}; Object.keys(o).forEach(k => { r[k] = formatear_(o[k]); }); return r; });
}

/** Igual que leerHoja_ pero conserva los objetos Date (para comparar). */
function leerHojaCruda_(nombre) {
  const hoja = hoja_(nombre);
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const datos = hoja.getRange(2, 1, ultimaFila - 1, enc.length).getValues();
  return datos
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => enc.reduce((o, h, i) => { if (h) o[h] = r[i]; o._fila = 0; return o; }, {}))
    .map((o, i) => { o._fila = i + 2; return o; });
}

function formatear_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'dd/MM/yyyy');
  if (typeof v === 'number') return v;
  return String(v === null || v === undefined ? '' : v).trim();
}

function escribirFila_(hoja, fila, obj) {
  const c = columnasDe_(hoja);
  Object.keys(obj).forEach(k => {
    if (c[k] === undefined) return;
    const v = obj[k];
    hoja.getRange(fila, c[k] + 1).setValue(v === null || v === undefined ? '' : v);
  });
}

function buscarFila_(hoja, id) {
  if (!id) return 0;
  const n = hoja.getLastRow() - 1;
  if (n < 1) return 0;
  const ids = hoja.getRange(2, 1, n).getValues();
  const i = ids.findIndex(r => String(r[0]).trim() === String(id).trim());
  return i === -1 ? 0 : i + 2;
}

/** Siguiente ID correlativo PREFIJO-0001, … (ignora IDs con otro formato). */
function siguienteId_(hoja, prefijo) {
  prefijo = prefijo || 'LB';
  const n = hoja.getLastRow() - 1;
  let max = 0;
  if (n > 0) {
    const re = new RegExp('^' + prefijo + '-(\\d+)$', 'i');
    hoja.getRange(2, 1, n).getValues().forEach(r => {
      const m = String(r[0]).trim().match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  const s = String(max + 1);
  return prefijo + '-' + (s.length >= 4 ? s : ('0000' + s).slice(-4));
}

function ponerFormulasMargen_(hoja, fila, c) {
  const costo = letraColumna_(c['Costo total'] + 1), precio = letraColumna_(c['Precio venta'] + 1);
  hoja.getRange(fila, c['Margen $'] + 1).setFormula(formula_('=IF(OR(' + costo + fila + '="";' + precio + fila + '="");"";' + precio + fila + '-' + costo + fila + ')'));
  hoja.getRange(fila, c['Margen %'] + 1).setFormula(formula_('=IF(OR(' + costo + fila + '="";' + precio + fila + '="";' + precio + fila + '=0);"";(' + precio + fila + '-' + costo + fila + ')/' + precio + fila + ')'));
}

/**
 * Separador de argumentos de fórmula: ',' en hojas en inglés, ';' en español
 * y otros idiomas con coma decimal. Se detecta probando una fórmula real, una
 * vez por ejecución. Las fórmulas del script se escriben siempre con ';'.
 */
let SEPARADOR_ = null;
function formula_(f) {
  if (SEPARADOR_ === null) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName('CONFIG') || ss.getSheets()[0];
    // Celda de prueba: última fila y columna de la hoja (siempre existe y está vacía).
    const celda = hoja.getRange(hoja.getMaxRows(), hoja.getMaxColumns());
    try {
      celda.setFormula('=IF(1;2;3)');
      SpreadsheetApp.flush();
      if (celda.getValue() === 2) SEPARADOR_ = ';';
      else {
        celda.setFormula('=IF(1,2,3)');
        SpreadsheetApp.flush();
        SEPARADOR_ = (celda.getValue() === 2) ? ',' : ';';
      }
    } catch (e) {
      SEPARADOR_ = ';';
    } finally {
      celda.clearContent();
    }
    Logger.log('Separador de fórmulas detectado: "' + SEPARADOR_ + '"');
  }
  return SEPARADOR_ === ';' ? f : f.replace(/;/g, ',');
}

function letraColumna_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function carpetaRaiz_() {
  const it = DriveApp.getFoldersByName(CARPETA_FOTOS_RAIZ);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_FOTOS_RAIZ);
}

function carpetaEjemplar_(id) {
  const raiz = carpetaRaiz_();
  const it = raiz.getFoldersByName(id);
  return it.hasNext() ? it.next() : raiz.createFolder(id);
}

/**
 * URL pública de una imagen de Drive usable directamente en <img src>.
 * Alternativa si algún día deja de funcionar:
 *   'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200'
 */
function urlFoto_(fileId) {
  return 'https://lh3.googleusercontent.com/d/' + fileId;
}

function obtenerToken_() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('TOKEN');
  if (!t) { t = Utilities.getUuid().replace(/-/g, ''); props.setProperty('TOKEN', t); }
  return t;
}

/** Genera un token nuevo (invalida el anterior). Ejecutar desde el editor si se filtró. */
function regenerarToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  const t = obtenerToken_();
  crearConfig_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log('Nuevo token: ' + t);
  return t;
}

/** Solo dígitos, con 593 al inicio si es un celular ecuatoriano escrito como 09…. */
function normalizarTelefono_(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && d.charAt(0) === '0') d = '593' + d.slice(1);
  if (d.length === 9 && d.charAt(0) === '9') d = '593' + d;
  return d;
}

function fechaOrden_(f) {
  const m = String(f || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(m[3], m[2] - 1, m[1]).getTime() : 0;
}

/** 'dd/MM/yyyy' (o Date, o ISO) → Date. */
function fechaDesdeDDMM_(f) {
  if (f instanceof Date) return f;
  const s = String(f || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return new Date();
}
function fechaDesdeISO_(iso) { return fechaDesdeDDMM_(iso); }
function diaSemana_(iso) {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][fechaDesdeDDMM_(iso).getDay()];
}

function invalidarCache_() { CacheService.getScriptCache().remove('catalogo'); }
function hoy_() { return Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy'); }
function ahora_() { return Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm'); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ==================================================================== */
/*  Semilla del calendario editorial (90 días, 14/09/2026 → 13/12/2026)   */
/*  [fecha, fase, momento comercial, formato, pilar, título, texto, CTA,  */
/*   hashtags, recurso visual]                                            */
/*  Fases lunares aproximadas (±1 día). Fuente del copy: Informacion/COPY */
/* ==================================================================== */

const CALENDARIO_EDITORIAL_SEMILLA = [
  ['2026-09-14', 'Creciente', 'Lanzamiento pasaporte', 'Reel 360°', 'Producto', 'Cada árbol tiene pasaporte', 'Desde hoy cada junípero de Legado Bonsai sale con su pasaporte digital: historial de podas, trasplantes y un certificado con QR. Escanea, gira el árbol y conoce su historia.', 'Mira un pasaporte real en el enlace de la bio.', '#Bonsai #LegadoBonsai #BonsaiEcuador #ÁrbolFamiliar', 'Reel del visor 360° + QR en pantalla'],
  ['2026-09-16', 'Creciente', '—', 'Carrusel', 'Educación', '5 consejos para cuidar tu bonsái 🌿', 'Desde la ubicación ideal hasta la poda correcta, aquí te enseñamos a cuidar tu bonsái como un verdadero maestro.', 'Descubre más en nuestro perfil y conviértete en un experto.', '#CuidadoBonsai #ArteVivo #NaturalezaEnCasa', 'Gráfico 5 pasos (podar, regar, ubicar, abonar, observar)'],
  ['2026-09-18', 'Cuarto creciente', 'Día de alambrado', 'Reel', 'Educación', 'Hoy es cuarto creciente: día de alambrar', 'La savia sube hacia las ramas. Es el momento del mes para pinzar, alambrar y fertilizar. Así lo hacemos en el taller.', 'Reserva el taller Alambrado y Poda ($40, incluye alambre).', '#AlambradoBonsai #CuartoCreciente #BonsaiEcuador', 'Video corto alambrando un junípero'],
  ['2026-09-20', 'Creciente', '—', 'Post', 'Marca', 'Bienvenidos a Árbol Familiar (家族の木)', 'Somos más que un vivero, somos una comunidad que conecta a las personas con la naturaleza a través del arte del bonsái. Cultiva paciencia, armonía y tradición con nosotros.', 'Síguenos para más consejos y conectarte con nuestras raíces 🌱', '#Bonsai #ÁrbolFamiliar #TradiciónJaponesa #CuidadoNatural', 'Logotipo centrado sobre fondo washi'],
  ['2026-09-22', 'Creciente gibosa', 'Preventa', 'Carrusel', 'Producto', 'Árboles en formación: resérvalos hoy', 'Estos junípero aún están en formación. Puedes reservar el tuyo con el 30% y recibirlo cuando esté listo, con su pasaporte y primer recordatorio lunar.', 'Filtra "En formación" en el catálogo.', '#Preventa #BonsaiEcuador #LegadoBonsai', 'Fotos 360° de 3 ejemplares En formación'],
  ['2026-09-25', 'Luna llena', 'Día de observación', 'Historia', 'Educación', 'Luna llena: hoy solo observamos', 'No es día de podar ni trasplantar. Es día de mirar el árbol, revisar plagas y dar un riego profundo.', 'Guarda esta historia para la próxima luna llena.', '#LunaLlena #CuidadoBonsai', 'Foto del árbol a contraluz'],
  ['2026-09-27', 'Menguante gibosa', 'Referidos', 'Post', 'Comunidad', 'Regala 10 %, gana $10', 'Cada cliente Legado tiene un código. Tu amigo recibe 10 % en su primer árbol y tú $10 de crédito para tu próximo plan o taller.', 'Pide tu código por WhatsApp si aún no lo tienes.', '#Referidos #LegadoBonsai', 'Tarjeta con código de ejemplo LEG-ANA7K3'],
  ['2026-09-29', 'Menguante', '—', 'Reel', 'Filosofía', 'El bonsái: símbolo de paciencia y armonía', 'El arte del bonsái enseña paciencia, equilibrio y conexión con la naturaleza. En Árbol Familiar cultivamos estas virtudes en cada árbol.', 'Descubre cómo un bonsái puede traer paz a tu vida.', '#FilosofíaZen #ArmoníaNatural #ÁrbolFamiliar', 'Bonsái + cita zen, diseño minimalista'],
  ['2026-10-01', 'Menguante', 'Inicio de mes', 'Post', 'Educación', 'Octubre: descanso y revisión', 'Empiezan las lluvias. Este mes el árbol descansa: revisa hongos, daños por humedad y el drenaje de la maceta.', 'Ver el calendario lunar completo en la web.', '#CalendarioLunar #BonsaiEcuador', 'Tabla del mes (captura del sitio)'],
  ['2026-10-03', 'Cuarto menguante', 'Día de trasplante', 'Reel', 'Educación', 'Cuarto menguante: la savia baja', 'La savia desciende a las raíces: hoy cicatrizan mejor los cortes de raíz y las podas estructurales.', 'Taller Trasplante Guiado ($35 + sustrato).', '#Trasplante #CuartoMenguante #BonsaiEcuador', 'Video de trasplante en el taller'],
  ['2026-10-05', 'Menguante', '—', 'Carrusel', 'Educación', '¿Cómo regar correctamente tu bonsái?', 'El riego es clave para la salud de tu bonsái. Aprende cuándo y cuánto regar para que tu árbol se mantenga siempre vivo y fuerte.', 'Sigue nuestros tips y dale a tu bonsái el cuidado que merece.', '#CuidadoBonsai #RiegoBonsai #BonsaiTips', 'Bonsái regado suavemente, gotas de agua'],
  ['2026-10-08', 'Menguante', 'Corporativo', 'Post', 'B2B', 'Un regalo que crece con tu empresa', 'Bienvenida de colaboradores, clientes VIP, aniversarios: un junípero con placa grabada dice más que una canasta. Cotiza desde 10 unidades.', 'Cotizador en legadobonsai → Regalos corporativos.', '#RegalosCorporativos #Ecuador #LegadoBonsai', 'Foto de 5 árboles con placas en línea'],
  ['2026-10-10', 'Luna nueva', 'Planificación', 'Historia', 'Educación', 'Luna nueva: planifica el ciclo', 'Descanso y poca actividad. Buen momento para planear qué harás en el próximo cuarto creciente.', 'Encuesta: ¿qué le toca a tu árbol este mes?', '#LunaNueva #Bonsai', 'Sticker de encuesta'],
  ['2026-10-12', 'Creciente', '—', 'Post', 'Producto', 'El estilo formal erguido (Chokkan)', 'El estilo Chokkan es uno de los más tradicionales, representando fuerza y estabilidad. Aprende más sobre su significado y cuidado.', 'Descubre los estilos y cuál es el ideal para ti.', '#EstilosBonsai #Chokkan #ArteJapones', 'Foto 360° de un Chokkan del catálogo'],
  ['2026-10-14', 'Creciente', 'Testimonio', 'Reel', 'Comunidad', 'Familias que ya empezaron su legado', 'Una cliente cuenta cómo el recordatorio lunar le evitó podar en mal momento. (Usar testimonio real con autorización.)', 'Cuéntanos la historia de tu árbol.', '#ComunidadBonsai #LegadoBonsai', 'Video testimonio o captura de WhatsApp autorizada'],
  ['2026-10-16', 'Creciente', 'Kit de inicio', 'Carrusel', 'Producto', 'Todo lo que necesita tu primer junípero', 'Tijera, alambre de 1 y 2 mm y la guía impresa: el kit de inicio ($28) se agrega desde el carrito.', 'Agrégalo con tu árbol.', '#KitBonsai #Herramientas', 'Flat lay del kit sobre washi'],
  ['2026-10-18', 'Cuarto creciente', 'Día de alambrado', 'Historia', 'Educación', 'Hoy: cuarto creciente', 'Alambrar, pinzar, fertilizar. ¿Ya lo hiciste? Responde con una foto.', 'Escríbenos por WhatsApp.', '#CuartoCreciente', 'Foto del alambre sobre la rama'],
  ['2026-10-20', 'Creciente gibosa', '—', 'Post', 'Filosofía', 'El bonsái y su impacto en la salud mental', 'Cuidar un bonsái te ayuda a reducir el estrés, mejorar tu concentración y conectar con la naturaleza. ¿Ya tienes uno?', 'Cuida tu salud mental mientras cuidas un árbol.', '#SaludMental #BonsaiBienestar #CulturaJaponesa', 'Persona cuidando un bonsái, sonrisa tranquila'],
  ['2026-10-23', 'Creciente gibosa', 'Taller en pareja', 'Reel', 'Talleres', 'Experiencia en pareja', 'Dos personas, dos junípero, dos horas. Cada quien forma el suyo y se lo lleva a casa. Un regalo distinto para una fecha especial.', 'Reserva la Experiencia en Pareja ($90, incluye 2 junípero).', '#TallerBonsai #PlanEnPareja #Quito', 'Video del taller con dos personas'],
  ['2026-10-25', 'Luna llena', 'Día de observación', 'Historia', 'Educación', 'Luna llena: riego profundo', 'La planta absorbe más agua hoy. Riega a fondo y déjala descansar.', '—', '#LunaLlena', 'Foto del sustrato húmedo'],
  ['2026-10-28', 'Menguante gibosa', 'Difuntos (2/11)', 'Post', 'Marca', 'Un árbol para recordar', 'En Día de Difuntos algunas familias plantan en memoria de alguien. Un junípero con placa conmemorativa acompaña ese recuerdo por décadas.', 'Placa grabada incluida en Legado Completo.', '#Memoria #LegadoBonsai #DíaDeDifuntos', 'Placa grabada en primer plano'],
  ['2026-10-30', 'Menguante gibosa', '—', 'Carrusel', 'Educación', 'La importancia de la poda en el bonsái', 'Podar es una de las prácticas esenciales para mantener el tamaño y la forma de tu bonsái. Te enseñamos cómo hacerlo correctamente.', 'Conviértete en un maestro de la poda con nuestros consejos.', '#PodaBonsai #CuidadoArbol #ArteVivo', 'Manos podando con tijeras especializadas'],
  ['2026-11-01', 'Cuarto menguante', 'Día de poda', 'Reel', 'Educación', 'Cuarto menguante: poda de mantenimiento', 'Ramas secas o dañadas por la lluvia: hoy es el día. Corte limpio, sellado, y a esperar.', 'Plan Cultivo Guiado: 2 podas al año con nosotros.', '#PodaBonsai #CuartoMenguante', 'Video de poda de mantenimiento'],
  ['2026-11-03', 'Menguante', 'Feriado', 'Post', 'Producto', 'Bonsái en cascada (Kengai)', 'El estilo Kengai imita el crecimiento de los árboles en acantilados, creando una hermosa caída. Aprende cómo cuidar este estilo tan especial.', 'Inspírate con la elegancia de los bonsáis en cascada.', '#Kengai #BonsaiCascada #ArteVivo', 'Foto 360° de una cascada del catálogo'],
  ['2026-11-06', 'Menguante', 'Pre-Navidad B2B', 'Post', 'B2B', 'Regalos de fin de año: cierra tu cotización antes del 20/11', 'Para entregar en diciembre con placa grabada necesitamos 3 semanas. Cotiza ahora y asegura los ejemplares.', 'Cotizador corporativo en la web.', '#RegalosEmpresariales #Navidad2026', 'Mockup de caja + placa + tarjeta'],
  ['2026-11-09', 'Luna nueva', 'Planificación', 'Historia', 'Educación', 'Luna nueva de noviembre', 'Planifica: este mes toca fertilización ligera en cuarto creciente (16/11).', '—', '#LunaNueva', 'Calendario del mes'],
  ['2026-11-11', 'Creciente', '—', 'Post', 'Filosofía', 'Cómo el bonsái fomenta la paciencia', 'El bonsái es un recordatorio de que las cosas buenas toman tiempo. Cultiva paciencia con cada rama.', 'Transforma tu vida cultivando paciencia con tu bonsái.', '#PacienciaBonsai #FilosofíaNatural', 'Primer plano con la frase "Paciencia en cada hoja"'],
  ['2026-11-13', 'Creciente', 'Black Friday (27/11)', 'Carrusel', 'Producto', 'Lo que NO vamos a hacer en Black Friday', 'No rematamos árboles que tardaron años en formarse. Lo que sí: 10 % en planes de acompañamiento del 27 al 30/11.', 'Guarda la fecha.', '#LegadoBonsai #Planes', 'Diseño tipográfico jade sobre washi'],
  ['2026-11-16', 'Cuarto creciente', 'Día de fertilización', 'Reel', 'Educación', 'Cuarto creciente: fertilización ligera', 'Con las lluvias, poco y bien: fertilizante orgánico de liberación lenta, nada más.', 'Fertilizante 500 g disponible en el carrito ($7).', '#Fertilización #CuartoCreciente', 'Video aplicando fertilizante'],
  ['2026-11-18', 'Creciente gibosa', '—', 'Post', 'Producto', 'Descubre el bonsái de enebro (Juniperus)', 'El enebro es uno de los bonsáis más populares por su resistencia y estilo. Aprende a cuidarlo y descubre sus secretos.', 'Haz de tu enebro un ejemplar único con nuestros consejos.', '#BonsaiEnebro #CuidadoBonsai #NaturalezaEnCasa', 'Foto de un enebro con tronco retorcido'],
  ['2026-11-20', 'Creciente gibosa', 'Pasaporte', 'Reel 360°', 'Producto', 'Así se ve el historial de un árbol', 'Cada poda y cada trasplante queda en el pasaporte. Cuando lo heredes, la historia va con él.', 'Escanea el QR de cualquier árbol Legado.', '#PasaporteBonsai #Legado', 'Screencast del pasaporte en el teléfono'],
  ['2026-11-23', 'Luna llena', 'Día de observación', 'Historia', 'Educación', 'Luna llena: monitoreo', 'Revisa hongos y drenaje. Con las lluvias, menos es más.', '—', '#LunaLlena', 'Foto del árbol bajo la lluvia'],
  ['2026-11-25', 'Menguante gibosa', 'Black Friday', 'Post', 'Planes', 'Del 27 al 30: 10 % en planes', 'Primeros Brotes, Cultivo Guiado o Legado Completo con 10 % de descuento, para tu árbol o para uno que ya tienes.', 'Agrega el plan desde la sección Acompañamiento.', '#BlackFriday #LegadoBonsai', 'Tarjeta de los 3 planes con precio'],
  ['2026-11-27', 'Menguante gibosa', 'Black Friday', 'Historia', 'Planes', 'Hoy empieza', 'Solo hasta el lunes 30.', 'Link en la bio.', '#BlackFriday', 'Cuenta regresiva'],
  ['2026-11-29', 'Menguante', '—', 'Post', 'Filosofía', 'Bonsái y feng shui: armoniza tu hogar', 'El bonsái no solo es hermoso, también trae equilibrio y armonía a los espacios según el feng shui.', 'Descubre cómo integrar el bonsái en tu hogar.', '#FengShui #ArmoníaHogar #DecoraciónNatural', 'Bonsái en un rincón de sala'],
  ['2026-12-01', 'Cuarto menguante', 'Día de poda · Navidad', 'Reel', 'Educación', 'Cuarto menguante de diciembre: poda ligera', 'Última poda del año: ramas secas y preparación para el descanso.', 'Agenda tu poda con el plan Cultivo Guiado.', '#PodaBonsai #Diciembre', 'Video de poda'],
  ['2026-12-03', 'Menguante', 'Navidad', 'Carrusel', 'Producto', 'Regalos que se heredan', 'Guía de regalo: Brote ($35), Legado ($65 con placa), Ceremonia ($120 con plan). Entregas hasta el 22/12.', 'Pide el tuyo por WhatsApp.', '#RegalosNavidad #LegadoBonsai #Ecuador', 'Los 3 paquetes fotografiados'],
  ['2026-12-05', 'Menguante', 'Navidad', 'Post', 'Marca', 'Bonsái: un reflejo de la armonía con la naturaleza', 'El bonsái refleja la armonía entre el hombre y la naturaleza. En Árbol Familiar cultivamos esta conexión en cada árbol.', 'Vive la armonía con la naturaleza en cada rincón de tu hogar.', '#ArmoníaNatural #BonsaiFilosofía #ArteJapones', 'Paisaje con bonsái en primer plano'],
  ['2026-12-08', 'Luna nueva', 'Planificación · Navidad', 'Historia', 'Producto', 'Últimos árboles del año', 'Estos son los ejemplares disponibles para entregar antes de Navidad.', 'Ver catálogo.', '#Navidad #Bonsai', 'Carrusel rápido del catálogo'],
  ['2026-12-10', 'Creciente', 'Navidad', 'Reel', 'Talleres', 'Regala una experiencia', 'Taller de Introducción ($25) o Experiencia en Pareja ($90) como regalo: enviamos un certificado digital para que lo entregues.', 'Reserva por WhatsApp.', '#RegalaExperiencias #TallerBonsai', 'Certificado de regalo en pantalla'],
  ['2026-12-12', 'Creciente', 'Cierre de trimestre', 'Post', 'Comunidad', 'Lo que crecimos este trimestre', 'X árboles con nuevo hogar, X pasaportes creados, X talleres. Gracias por ser parte de la familia Legado.', 'Cuéntanos qué quieres ver en 2027.', '#LegadoBonsai #Comunidad', 'Gráfico de cierre con cifras reales']
];
