/**
 * ==========================================================================
 *  Legado Bonsai — API de inventario (Google Apps Script)
 * ==========================================================================
 *
 *  Este script vive DENTRO del Google Sheet "Legado Bonsai — Sistema de
 *  Gestión" (Extensiones → Apps Script) y cumple dos funciones:
 *
 *   1. setup()  → ordena el sheet: crea o normaliza las pestañas, agrega las
 *                 columnas que faltan (sin borrar datos), crea la pestaña
 *                 CATALOGO (vista de lo que publica la tienda), RESUMEN y
 *                 CONFIG con el token de acceso.
 *
 *   2. Web App  → doGet / doPost. La tienda (index.html / catalogo.html) lee
 *                 el catálogo público con GET; la app de registro (admin/)
 *                 escribe con POST + token: ejemplares, fotos (a Drive),
 *                 ventas, cuidados y materiales.
 *
 *  Instalación paso a paso: ver apps-script/INSTALACION.md
 * ==========================================================================
 */

const VERSION = '1.0.1';
const CARPETA_FOTOS_RAIZ = 'Legado Bonsai — Fotos 360';
const ZONA = 'America/Guayaquil';

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
      // Columnas nuevas (la tienda las usa si existen)
      'Riego', 'Historia', 'Carpeta imagen', 'Fotos', 'Destacado', 'Última actualización'
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
    columnas: ['Fecha', 'ID Ejemplar', 'Cliente', 'Contacto', 'Cantidad', 'Precio final', 'Plan de acompañamiento', 'Estado', 'Notas'],
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
  }
};

const ESTADOS_COMERCIALES = ['Disponible', 'Reservado', 'Vendido', 'En formación', 'Baja'];
const ESTADOS_SALUD = ['Excelente', 'Bien', 'Normal', 'En observación', 'Enfermo'];
const AMBIENTES = ['Exterior', 'Interior', 'Semi-sombra'];
const TIPOS_CUIDADO = ['Poda', 'Trasplante', 'Alambrado', 'Fertilización', 'Riego', 'Tratamiento', 'Revisión'];

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
  aplicarValidaciones_(ss);
  rellenarEstilosJP_(ss);
  sembrarCalendario_(ss);

  const carpeta = carpetaRaiz_();
  informe.push('Carpeta de fotos en Drive: ' + carpeta.getUrl());

  const token = obtenerToken_();
  informe.push('Token de la app: ' + token);

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
    hoja = ss.getSheets().find(h => String(h.getRange(1, 1).getValue()).trim() === def.firma);
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

/** Pestaña CATALOGO: vista en vivo de los ejemplares Disponibles (fórmula QUERY con encabezados). */
function crearCatalogo_(ss) {
  const inv = ss.getSheetByName('INVENTARIO');
  const col = columnasDe_(inv);
  const letraEstado = letraColumna_(col['Estado comercial'] + 1);
  const ultima = letraColumna_(inv.getMaxColumns());
  let hoja = ss.getSheetByName('CATALOGO');
  if (!hoja) hoja = ss.insertSheet('CATALOGO');
  hoja.clear();
  hoja.getRange('A1').setFormula(formula_(
    '=IFERROR(QUERY(INVENTARIO!A:' + ultima + '; "select * where ' + letraEstado + ' = \'Disponible\'"; 1); "Sin ejemplares disponibles")'
  ));
  hoja.setFrozenRows(1);
  hoja.getRange('A1:ZZ1').setFontWeight('bold');
  return 'regenerada (solo lectura, publicable como CSV si se desea)';
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
  const vPrecio = letraColumna_(vc['Precio final'] + 1), vEstado = letraColumna_(vc['Estado'] + 1);
  const mat = ss.getSheetByName('MATERIALES');
  const mc = columnasDe_(mat);
  const mTotal = letraColumna_(mc['Costo total'] + 1);

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
    ['En formación', '=COUNTIF(INVENTARIO!' + est + '2:' + est + '; "En formación")'],
    ['Valor de inventario disponible', '=SUMIF(INVENTARIO!' + est + '2:' + est + '; "Disponible"; INVENTARIO!' + precio + '2:' + precio + ')'],
    ['Costo total invertido (registrado)', '=SUM(INVENTARIO!' + costo + '2:' + costo + ')'],
    ['', ''],
    ['Ventas registradas', '=COUNTA(VENTAS!A2:A)'],
    ['Ingresos por ventas (pagadas)', '=SUMIF(VENTAS!' + vEstado + '2:' + vEstado + '; "Pagado"; VENTAS!' + vPrecio + '2:' + vPrecio + ')'],
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
  hoja.getRange('B7:B8').setNumberFormat('$#,##0.00');
  hoja.getRange('B11').setNumberFormat('$#,##0.00');
  hoja.getRange('B22').setNumberFormat('$#,##0.00');
  hoja.setColumnWidth(1, 300);
  hoja.setColumnWidth(2, 220);
  return 'regenerada';
}

function crearConfig_(ss) {
  let hoja = ss.getSheetByName('CONFIG');
  if (!hoja) hoja = ss.insertSheet('CONFIG');
  const token = obtenerToken_();
  hoja.clear();
  hoja.getRange('A1:B6').setValues([
    ['Clave', 'Valor'],
    ['Token de la app (cópialo en admin/ → Configuración)', token],
    ['Versión del script', VERSION],
    ['Carpeta de fotos (Drive)', carpetaRaiz_().getUrl()],
    ['Zona horaria', ZONA],
    ['Último setup', Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm')]
  ]);
  hoja.getRange('A1:B1').setFontWeight('bold').setBackground('#1B241F').setFontColor('#FAFAF6');
  hoja.setColumnWidth(1, 360);
  hoja.setColumnWidth(2, 420);
  return 'lista';
}

/** Listas desplegables para que el sheet se mantenga ordenado al editar a mano. */
function aplicarValidaciones_(ss) {
  const inv = ss.getSheetByName('INVENTARIO');
  const c = columnasDe_(inv);
  const regla = (lista) => SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build();
  const filas = Math.max(inv.getMaxRows() - 1, 1);
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
  cuid.getRange(2, cc['Tipo'] + 1, Math.max(cuid.getMaxRows() - 1, 1)).setDataValidation(regla(TIPOS_CUIDADO));

  const ven = ss.getSheetByName('VENTAS');
  const vc = columnasDe_(ven);
  ven.getRange(2, vc['Estado'] + 1, Math.max(ven.getMaxRows() - 1, 1)).setDataValidation(regla(['Pagado', 'Pendiente', 'Anulado']));
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

/* ==================================================================== */
/*  WEB APP                                                              */
/* ==================================================================== */

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.action) || 'catalogo';
  try {
    if (accion === 'ping') return json_({ ok: true, version: VERSION, hora: ahora_() });
    if (accion === 'catalogo') return json_({ ok: true, productos: catalogoPublico_() });
    return json_({ ok: false, error: 'Acción desconocida: ' + accion });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let cuerpo;
  try { cuerpo = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'Cuerpo inválido' }); }

  if (!cuerpo || cuerpo.token !== obtenerToken_()) {
    return json_({ ok: false, error: 'Token inválido', codigo: 'AUTH' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const p = cuerpo.payload || {};
    let r;
    switch (cuerpo.action) {
      case 'listar':     r = listar_(); break;
      case 'crear':      r = crearEjemplar_(p); break;
      case 'actualizar': r = actualizarEjemplar_(p.id, p.cambios || {}); break;
      case 'subirFoto':  r = subirFoto_(p); break;
      case 'venta':      r = registrarVenta_(p); break;
      case 'cuidado':    r = registrarCuidado_(p); break;
      case 'material':   r = registrarMaterial_(p); break;
      default: throw new Error('Acción desconocida: ' + cuerpo.action);
    }
    SpreadsheetApp.flush();
    invalidarCache_();
    return json_(Object.assign({ ok: true }, r));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* nada */ }
  }
}

/* ------------------------------ Lecturas ---------------------------- */

/** Lo que ve la tienda: solo Disponibles y solo campos públicos. Cache 60 s. */
function catalogoPublico_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('catalogo');
  if (hit) return JSON.parse(hit);

  const filas = leerHoja_('INVENTARIO').filter(f => f['Estado comercial'] === 'Disponible');
  const productos = filas.map(f => ({
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
    Stock: 1
  }));
  cache.put('catalogo', JSON.stringify(productos), 60);
  return productos;
}

/** Todo lo que necesita la app de registro (requiere token). */
function listar_() {
  const inventario = leerHoja_('INVENTARIO');
  const ventas = leerHoja_('VENTAS').slice(-30).reverse();
  const cuidados = leerHoja_('CUIDADOS').slice(-30).reverse();
  const materiales = leerHoja_('MATERIALES');
  const resumen = {
    total: inventario.length,
    disponibles: inventario.filter(f => f['Estado comercial'] === 'Disponible').length,
    reservados: inventario.filter(f => f['Estado comercial'] === 'Reservado').length,
    vendidos: inventario.filter(f => f['Estado comercial'] === 'Vendido').length,
    enFormacion: inventario.filter(f => f['Estado comercial'] === 'En formación').length,
    valorDisponible: inventario.filter(f => f['Estado comercial'] === 'Disponible')
      .reduce((s, f) => s + (parseFloat(f['Precio venta']) || 0), 0),
    valorMateriales: materiales.reduce((s, f) => s + (parseFloat(f['Costo total']) || 0), 0)
  };
  return { inventario, ventas, cuidados, materiales, resumen, estilos: ESTILOS,
    listas: { estadosComerciales: ESTADOS_COMERCIALES, estadosSalud: ESTADOS_SALUD, ambientes: AMBIENTES, tiposCuidado: TIPOS_CUIDADO } };
}

/* ------------------------------ Escrituras -------------------------- */

function crearEjemplar_(p) {
  const hoja = hoja_('INVENTARIO');
  const c = columnasDe_(hoja);
  const id = p['ID'] && !buscarFila_(hoja, p['ID']) ? String(p['ID']).trim() : siguienteId_(hoja);

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
  // Reemplaza una foto anterior con el mismo nombre para no acumular versiones.
  const previas = carpeta.getFilesByName(nombre);
  while (previas.hasNext()) previas.next().setTrashed(true);

  const bytes = Utilities.base64Decode(p.base64.replace(/^data:[^;]+;base64,/, ''));
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: urlFoto_(archivo.getId()), fileId: archivo.getId(), nombre };
}

function registrarVenta_(p) {
  const hoja = hoja_('VENTAS');
  const inv = hoja_('INVENTARIO');
  const filaInv = buscarFila_(inv, p.id);
  if (!filaInv) throw new Error('No existe el ejemplar ' + p.id);
  const estadoVenta = p.estado || 'Pagado';
  escribirFila_(hoja, hoja.getLastRow() + 1, {
    'Fecha': p.fecha || hoy_(),
    'ID Ejemplar': p.id,
    'Cliente': p.cliente || '',
    'Contacto': p.contacto || '',
    'Cantidad': p.cantidad || 1,
    'Precio final': p.precioFinal || '',
    'Plan de acompañamiento': p.plan || '',
    'Estado': estadoVenta,
    'Notas': p.notas || ''
  });
  const nuevoEstado = estadoVenta === 'Pagado' ? 'Vendido' : estadoVenta === 'Anulado' ? 'Disponible' : 'Reservado';
  escribirFila_(inv, filaInv, { 'Estado comercial': nuevoEstado, 'Última actualización': ahora_() });
  return { id: p.id, estadoEjemplar: nuevoEstado };
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
    'Fase lunar': p.faseLunar || '',
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
  const hoja = hoja_(nombre);
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const datos = hoja.getRange(2, 1, ultimaFila - 1, enc.length).getValues();
  return datos
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => enc.reduce((o, h, i) => { if (h) o[h] = formatear_(r[i]); return o; }, {}));
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

/** Siguiente ID correlativo LB-0001, LB-0002, … (ignora IDs con otro formato). */
function siguienteId_(hoja) {
  const n = hoja.getLastRow() - 1;
  let max = 0;
  if (n > 0) {
    hoja.getRange(2, 1, n).getValues().forEach(r => {
      const m = String(r[0]).trim().match(/^LB-(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  const s = String(max + 1);
  return 'LB-' + (s.length >= 4 ? s : ('0000' + s).slice(-4));
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

function invalidarCache_() { CacheService.getScriptCache().remove('catalogo'); }
function hoy_() { return Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy'); }
function ahora_() { return Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm'); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
