// ============================================================================
//  Legado Bonsai — consultas Power Query (M) para Power BI Desktop
// ============================================================================
//  Cómo usar:
//   1. Power BI Desktop → Obtener datos → Consulta en blanco → Editor avanzado.
//   2. Pega UNA consulta por vez (cada bloque "let … in" de abajo) y ponle el
//      nombre indicado en el comentario.
//   3. Crea primero los parámetros ApiUrl y Token (Administrar parámetros):
//        ApiUrl : URL del Web App, termina en /exec
//        Token  : pestaña CONFIG del sheet
//      Nunca publiques el .pbix con el token a un espacio compartido.
//   4. Privacidad: al primer refresco elige "Público" u "Organizacional" para
//      script.google.com. Programar refresco en el servicio requiere puerta
//      de enlace o "Omitir prueba de conexión" (Web.Contents con RelativePath).
//
//  Alternativa sin token: publicar EMBUDO como CSV (Archivo → Compartir →
//  Publicar en la web) y usar Csv.Document(Web.Contents(url)).
// ============================================================================

// ---- Función: fnHoja (tabla desde una pestaña) -----------------------------
// let
//   Fuente = (hoja as text) as table =>
//     let
//       json = Json.Document(Web.Contents(ApiUrl, [Query = [action = "exportar", hoja = hoja, token = Token]])),
//       filas = if json[ok] then json[filas] else error json[error],
//       tabla = Table.FromRecords(filas, null, MissingField.UseNull)
//     in tabla
// in
//   Fuente

// ---- Consulta: Ventas ------------------------------------------------------
let
  Origen = fnHoja("VENTAS"),
  Tipos = Table.TransformColumnTypes(Origen, {
    {"Fecha", type date}, {"Cantidad", Int64.Type}, {"Precio final", type number},
    {"Descuento ($)", type number}, {"Anticipo ($)", type number}
  }, "es-EC"),
  Mes = Table.AddColumn(Tipos, "Mes", each Date.StartOfMonth([Fecha]), type date),
  ConPlan = Table.AddColumn(Mes, "Con plan", each [#"Plan de acompañamiento"] <> null and [#"Plan de acompañamiento"] <> "", type logical)
in
  ConPlan

// ---- Consulta: Eventos (embudo web) ----------------------------------------
// let
//   Origen = fnHoja("EVENTOS"),
//   Tipos = Table.TransformColumnTypes(Origen, {{"Fecha", type date}, {"Valor", type number}}, "es-EC"),
//   Quitar = Table.RemoveColumns(Tipos, {"_fila"}, MissingField.Ignore)
// in
//   Quitar

// ---- Consulta: Clientes ----------------------------------------------------
// let
//   Origen = fnHoja("CLIENTES"),
//   Tipos = Table.TransformColumnTypes(Origen, {
//     {"Créditos ($)", type number}, {"Total comprado", type number},
//     {"Primera compra", type date}, {"Última compra", type date}, {"Vence plan", type date}
//   }, "es-EC")
// in
//   Tipos

// ---- Consulta: Inventario --------------------------------------------------
// let
//   Origen = fnHoja("INVENTARIO"),
//   Tipos = Table.TransformColumnTypes(Origen, {
//     {"Costo total", type number}, {"Precio venta", type number}, {"Margen $", type number},
//     {"Altura (cm)", type number}, {"Edad (años)", type number}, {"Fecha de ingreso", type date}
//   }, "es-EC")
// in
//   Tipos

// ---- Consulta: Embudo mensual (ya calculado en el sheet) -------------------
// let
//   Origen = fnHoja("EMBUDO"),
//   Tipos = Table.TransformColumnTypes(Origen, {{"Mes", type date}}, "es-EC")
// in
//   Tipos

// ---- Medidas DAX sugeridas (tabla Ventas / Eventos) ------------------------
// Ingresos          = CALCULATE(SUM(Ventas[Precio final]), Ventas[Estado] = "Pagado")
// Ventas pagadas    = CALCULATE(COUNTROWS(Ventas), Ventas[Estado] = "Pagado")
// Ticket promedio   = DIVIDE([Ingresos], [Ventas pagadas])
// % con plan        = DIVIDE(CALCULATE(COUNTROWS(Ventas), Ventas[Con plan] = TRUE()), COUNTROWS(Ventas))
// Sesiones          = DISTINCTCOUNT(Eventos[Sesión])
// Fichas            = CALCULATE(COUNTROWS(Eventos), Eventos[Evento] = "ficha")
// Clics WhatsApp    = CALCULATE(COUNTROWS(Eventos), Eventos[Evento] = "whatsapp")
// Conv. sesión→WA   = DIVIDE([Clics WhatsApp], [Sesiones])
// Conv. sesión→venta= DIVIDE([Ventas pagadas], [Sesiones])
// Créditos referidos= SUM(Clientes[Créditos ($)])
