# Estrategia comercial Legado Bonsai — v1.1 (septiembre 2026)

Nueve palancas construidas sobre lo que ya existía (catálogo 360°, checkout por WhatsApp, Sheet de gestión, app de registro). Todas están implementadas en este repositorio; este documento explica **qué vende cada una, cómo funciona, qué precios asume y cómo se mide**. Los precios son supuestos iniciales y viven en un solo lugar: [`config.js`](../config.js) (tienda) y `REGLAS` en [`apps-script/Code.gs`](../apps-script/Code.gs) (backend). Cámbialos ahí, no en el HTML.

## Resumen ejecutivo

| # | Palanca | Qué cambia para el cliente | Ingreso que habilita | Dónde vive |
|---|---|---|---|---|
| 1 | Pasaporte digital del árbol | Cada árbol tiene página pública con historial y certificado QR | Justifica el precio y los planes; prueba social | `arbol.html`, `pasaporte.js`, `pasaporte_()` |
| 2 | Clientes + recordatorios lunares | Recibe un WhatsApp el día exacto de la fase ideal | Cumple la promesa de los planes; reactiva talleres y renovaciones | pestañas CLIENTES / RECORDATORIOS, `generarRecordatorios()` |
| 3 | Planes vendibles | Puede comprar el plan con el árbol o para uno que ya tiene | Recurrente: $15 / $60 / $120 al año | sección Acompañamiento, ficha, carrito |
| 4 | Regalos corporativos | Cotiza 10–500 unidades con placa grabada en un minuto | Tickets de $350 a $6 000 por pedido | `regalos.html`, pestaña COTIZACIONES |
| 5 | Preventa de árboles en formación | Reserva con 30 % un árbol que aún no está listo | Caja anticipada sobre stock futuro | estado "En formación", filtro Mostrar |
| 6 | Kits en el carrito | Ve "Completa tu kit" al agregar un árbol | +$7 a $28 por pedido | `EXTRAS` en config.js |
| 7 | Referidos | Código personal: 10 % al amigo, $10 al que refiere | Adquisición a costo fijo | columna Código referido, validación en carrito |
| 8 | Calendario editorial 90 días + reels 360° | Contenido semanal alineado a fases lunares y fechas comerciales | Tráfico orgánico | pestaña CALENDARIO_EDITORIAL, `admin/reel.html` |
| 9 | Tablero de ventas | Embudo sesión → ficha → carrito → WhatsApp → venta | Decisiones con datos | pestaña EVENTOS / EMBUDO, app → Tablero, `docs/powerbi/` |

## 1. Pasaporte digital del árbol

**Promesa:** "No vendemos plantas, cultivamos legados." El pasaporte hace tangible el legado: quien herede el árbol hereda su historia.

**Cómo funciona**
- URL pública por ejemplar: `arbol.html?id=LB-0001`. La ficha del catálogo y la app admin enlazan a ella; el certificado lleva un QR con esa URL.
- Muestra: visor 360°, ficha, **historial de CUIDADOS** (poda, trasplante, alambrado con fase lunar), certificado de custodia y la acción lunar del mes.
- Privacidad: nunca expone costo, notas internas ni contacto. El nombre del custodio solo aparece si se escribió en VENTAS → *Nombre en pasaporte*.
- El botón *Imprimir certificado* usa CSS de impresión: sale solo el certificado con QR, listo para enmarcar o entregar con la placa.

**Uso comercial**
- En cada entrega: enviar el enlace (la app lo genera al registrar la venta, con botón de WhatsApp).
- En la placa grabada: el QR del pasaporte.
- En redes: reels que muestran el historial de un árbol real (calendario editorial, 14/09 y 20/11).

**Métrica:** evento `pasaporte` en EVENTOS (aperturas por árbol).

## 2. Base de clientes y recordatorios lunares automáticos

**Problema que resuelve:** los planes prometían "recordatorios por WhatsApp según fase lunar" y no existía ni la lista de clientes ni el mecanismo.

**Cómo funciona**
- Al registrar una venta, la app crea o actualiza al cliente en **CLIENTES** (ID `CL-0001`, WhatsApp normalizado, ejemplares, plan activo, vencimiento, código de referido).
- Un **disparador diario a las 8:00** (`instalarDisparadores()`) ejecuta `generarRecordatorios()`, que crea filas en **RECORDATORIOS** con el mensaje y el enlace `wa.me` listo:
  - *Fase lunar*: el día exacto de la fase ideal del mes (según CALENDARIO_LUNAR), a todos los clientes con Recordatorios = Sí.
  - *Revisión*: cuando CUIDADOS → "Próxima revisión sugerida" es hoy.
  - *Renovación*: 15 días antes de "Vence plan", con el precio y los créditos acumulados.
  - *Bienvenida*: 3 días después de la primera compra, con el pasaporte y el código de referido.
- Te llega un **correo resumen** con los enlaces; en la app (Inicio → Recordatorios) los envías con un toque y los marcas como enviados.
- WhatsApp Business API no es necesario: el envío es manual pero toma segundos, y el registro queda en el sheet. Si más adelante se contrata la API oficial, el mismo `generarRecordatorios()` puede llamarla.

**Métrica:** RESUMEN → clientes con plan activo; RECORDATORIOS → enviados vs. omitidos.

## 3. Planes de acompañamiento como producto

**Precios iniciales** (config.js → `PLANES`):

| Plan | Precio | Periodo | Incluye |
|---|---|---|---|
| Primeros Brotes | $15 | pago único | guía, 1 videollamada, recordatorios, pasaporte |
| Cultivo Guiado | $60 | primer año | + 1 trasplante, 2 podas, 1 alambrado guiados |
| Legado Completo | $120 | por año | + certificado impreso, placa grabada, prioridad de agenda |

**Cómo se vende**
- En la ficha del árbol: el selector de plan muestra el precio y lo suma al total.
- En la sección Acompañamiento: botón *Agregar para mi árbol* → línea "plan · árbol propio" en el carrito. Es la puerta de entrada para quien compró un bonsái en otro lugar.
- En la venta registrada desde la app, el plan fija *Vence plan* (+12 meses) y activa los recordatorios de renovación.

**Objetivo sugerido:** 40 % de los árboles vendidos con plan; 25 % de renovación al año.

## 4. Canal corporativo y de regalo

**Paquetes** (config.js → `CORPORATIVO`): Brote $35 · Legado $65 · Ceremonia $120. Placa grabada +$18. Descuentos por volumen: 10 % desde 10 u., 15 % desde 25, 20 % desde 50.

**Cómo funciona**
- `regalos.html`: casos de uso (bienvenida, clientes VIP, aniversarios, entregas especiales), paquetes y **cotizador** con estimado instantáneo.
- Al enviar: se guarda en **COTIZACIONES** (sin token, acción pública), te llega un correo y se abre WhatsApp con el resumen para el cliente.
- En la app: Inicio → Cotizaciones, con estado Nueva / Contactada / Aceptada / Perdida y enlace directo al contacto.

**Primer piloto recomendado:** concesionario (entrega de vehículos premium) y una inmobiliaria: son entregas de bienes duraderos donde un regalo vivo tiene sentido. Lleva 3 árboles de muestra con placa.

## 5. Preventa de árboles en formación

**Cómo funciona**
- Un ejemplar con *Estado comercial = En formación* aparece en el catálogo con la etiqueta *En formación · Preventa*, la nota "Reserva con $X (30 %)" y la *Entrega estimada* (columna nueva en INVENTARIO).
- En el carrito se distingue el anticipo del saldo; el mensaje de WhatsApp lo detalla.
- Filtro *Mostrar → En formación (preventa)* y enlace directo `catalogo.html?ver=preventa`.
- Al registrar la venta en la app: estado Pendiente + campo *Anticipo recibido* → el ejemplar pasa a Reservado. Al cobrar el saldo, se edita la venta a Pagado.

**Regla:** solo publicar en preventa árboles con fecha de entrega realista (≤ 6 meses) y enviar foto de avance en cada fase lunar (el recordatorio sirve de excusa).

## 6. Kits y extras en el carrito

`EXTRAS` en config.js: Kit de inicio $28 · Alambre 100 g $8 · Sustrato 2 L $9 · Fertilizante 500 g $7 · Placa grabada $18. Cuando hay un árbol o plan en el carrito aparece *Completa tu kit* con hasta 3 sugerencias. Los códigos de descuento no aplican a extras (protege el margen). El costo de cada insumo sigue en MATERIALES; los extras vendidos se anotan en VENTAS → *Extras*.

## 7. Programa de referidos

- Cada cliente recibe un código `LEG-ANA7K3` (iniciales + 3 caracteres) al registrarse. La app tiene el botón *Enviar código* con el mensaje listo.
- El amigo lo escribe en el carrito → la tienda lo valida contra el sheet (`?action=codigo`) → 10 % en árboles y planes.
- Al registrar esa venta con *Código usado*, el referente recibe **$10 de crédito** en CLIENTES → *Créditos ($)*, canjeable en su próximo plan o taller (se descuenta a mano y se anota).
- `LEGADO10` (popup de newsletter) sigue funcionando como código universal de primera compra.
- Enlace compartible: `catalogo.html?codigo=LEG-XXXX` aplica el código solo.

## 8. Calendario editorial y reels 360°

- **CALENDARIO_EDITORIAL** (pestaña sembrada por `setup()`, también en [`CALENDARIO_EDITORIAL.md`](CALENDARIO_EDITORIAL.md) y en `Informacion/Calendario editorial Q4 2026.xlsx`): 41 publicaciones del 14/09 al 12/12/2026, 3 por semana, con fase lunar, momento comercial (preventa, Día de Difuntos, Black Friday de planes, Navidad, cierre B2B 20/11), formato, pilar, copy, CTA, hashtags y recurso visual. El copy sale de `Informacion/COPY.docx`.
- **Generador de reels** (`admin/reel.html`): elige un ejemplar con fotos en Drive, ajusta título, precio y fondo, y descarga un video 9:16 con giro 360°, logo y cierre de marca, o una portada 4:5 para el feed. Sin apps externas.
- Pilares: Producto 30 % · Educación 30 % · Filosofía/Marca 20 % · Comunidad/Referidos 10 % · B2B 10 %.

## 9. Tablero de ventas

- La tienda envía **eventos anónimos** (sin cookies ni datos personales) a la pestaña EVENTOS: `vista`, `ficha`, `carrito`, `preventa`, `plan`, `extra`, `codigo`, `whatsapp`, `taller`, `cotizacion`, `newsletter`, `pasaporte`. Cada uno lleva sesión, página, ejemplar, valor y referencia (`?utm_source=instagram` o dominio de origen).
- **EMBUDO** (fórmulas, 12 meses): sesiones → fichas → carrito → WhatsApp → ventas pagadas, con tasas y ticket promedio.
- **App → Tablero**: mismo embudo por 7/30/90/365 días, ventas por plan y canal, fichas más vistas, orígenes.
- **Power BI**: consultas M y medidas DAX en [`powerbi/`](powerbi/README.md).

**Indicadores que importan (revisar cada lunes):** sesiones, tasa ficha → WhatsApp, ventas pagadas, % con plan, ingresos, cotizaciones nuevas, recordatorios enviados, créditos de referidos generados.

## Plan de 90 días

| Semana | Acción |
|---|---|
| 1 | Ejecutar `setup()` e `instalarDisparadores()`, nueva implementación del Web App, subir el sitio. Registrar las ventas pasadas en la app para poblar CLIENTES. Enviar el pasaporte a cada cliente existente con su código. |
| 2 | Publicar 3 ejemplares en formación con entrega estimada. Grabar 3 reels con el generador. Activar `?utm_source=instagram` en la bio. |
| 3–4 | Piloto corporativo: 2 reuniones con muestras. Primer envío de recordatorios de fase lunar (cuarto creciente 18/09 y 18/10). |
| 5–8 | Medir embudo; ajustar precios de planes si % con plan < 25 %. Preparar Black Friday de planes (27–30/11) y cierre B2B navideño (20/11). |
| 9–12 | Campaña navideña (paquetes de regalo, talleres como regalo). Renovaciones del primer año. Cierre de trimestre con cifras reales en redes. |

## Supuestos y decisiones pendientes

- Precios de planes, kits y paquetes corporativos: propuestos; ajustar con costos reales de MATERIALES y tiempo por visita.
- Envío de recordatorios: manual (un toque por mensaje). Si el volumen supera ~30 diarios, evaluar WhatsApp Business API.
- El anticipo del 30 % es no reembolsable salvo que el árbol no llegue a estar listo: dejarlo por escrito en Términos y condiciones (enlace del footer aún vacío).
- Pasaporte: los IDs son correlativos y las URLs adivinables; por eso el nombre del custodio es opcional y no se muestra contacto.
