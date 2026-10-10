# Tablero de ventas en Power BI

El Sheet ya calcula el embudo mensual en la pestaña **EMBUDO** y la app admin muestra el mismo embudo por período (Inicio → Tablero de ventas). Para un tablero en Power BI Desktop:

1. **Parámetros**: crea `ApiUrl` (URL del Web App, termina en `/exec`) y `Token` (pestaña CONFIG del sheet).
2. **Consultas**: pega las de [`LegadoBonsai.pq`](LegadoBonsai.pq) — primero la función `fnHoja`, luego Ventas, Eventos, Clientes, Inventario y Embudo.
3. **Modelo**: relaciona `Ventas[ID Ejemplar] → Inventario[ID]`, `Ventas[ID Cliente] → Clientes[ID Cliente]` y una tabla calendario sobre `Ventas[Fecha]` y `Eventos[Fecha]`.
4. **Medidas**: al final del `.pq` hay las DAX sugeridas (ingresos, ticket, % con plan, conversión sesión → WhatsApp → venta).

## Páginas recomendadas

| Página | Visuales |
|---|---|
| Resumen | Tarjetas: ingresos, ventas pagadas, ticket, % con plan. Línea: ingresos por mes. Barras: ventas por canal. |
| Embudo web | Embudo: sesiones → fichas → carrito → WhatsApp → ventas. Barras: fichas por ejemplar. Tabla: referencias (Instagram, directo, etc.). |
| Clientes | Tabla: clientes con plan y fecha de vencimiento. Tarjeta: créditos de referidos pendientes. Barras: clientes por origen. |
| Inventario | Matriz: ejemplares por estado y estilo. Tarjeta: valor disponible y margen promedio. |

## Notas

- La acción `exportar` requiere el token en la URL: no publiques el `.pbix` en un espacio compartido sin quitar el parámetro.
- Refresco programado en el servicio de Power BI: usa una puerta de enlace personal o marca *Omitir prueba de conexión* en las credenciales de `script.google.com`.
- Alternativa sin token: publica EMBUDO/VENTAS como CSV (*Archivo → Compartir → Publicar en la web*) y usa `Csv.Document(Web.Contents(url))`.
