# Estructura de la información de Legado Bonsai

Revisión hecha el 13/09/2026 sobre los archivos de Drive y el proyecto web. Objetivo: una sola fuente de verdad, con nombres y códigos consistentes, que alimente la tienda, la app de registro y los reportes.

## 1. Cómo estaba

| Archivo (Drive) | Contenido | Problema |
|---|---|---|
| **productos** (carpeta de la tienda) | 57 filas casi idénticas: código `AFTAB1`, "Junipero Shimpaku", precios $20–$56, imagen `Bonsai1`/`Bonsai5` | Era lo que leía la tienda. Sin ID único, sin estado ni stock, filas duplicadas de prueba. |
| **Legado Bonsai — Sistema de Gestión** | INVENTARIO (7 ejemplares), historial de cuidados, calendario lunar, ventas, materiales ($573), resumen | Bien estructurado, pero **desconectado** de la tienda. Importó 5 productos el 06/09 y desde entonces cada hoja fue por su lado. |
| **INVENTARIO BONSAI** (2025) | Plantilla vacía: PRODUCTOS, VENTAS, TALLERES | Nunca se usó. |
| **Proyecto Bonsai** (2024) | 1 árbol, tabla dinámica, plantilla de mantenimiento | Versión antigua del inventario. |
| **Control Bonsai** (2024) | 2 árboles con cuidados del 12 y 15/08/2024 | Ya importado al Sistema de Gestión (LB-JUN-001, LB-BUX-001). |
| **ARBOL DE FAMILIA BONSAI 1** | Notas de estrategia de marca | No es inventario; es material de marca. |

En el repositorio: carpeta `bonsai5` en minúscula (la hoja decía `Bonsai5`; en GitHub Pages no habría cargado) y carpetas `Bonsai3`, `Bonsai4`, `Bonsai5` sin subir a git.

## 2. Cómo queda

```
Google Sheet "Legado Bonsai — Sistema de Gestión"   ← ÚNICA fuente de verdad
│
├─ INVENTARIO        un ejemplar por fila, ID único LB-0001…           ─┐
├─ CUIDADOS          poda / trasplante / alambrado / … por ejemplar      │ escribe la app admin/
├─ VENTAS            una fila por venta, cambia el estado del ejemplar   │ (también editable a mano)
├─ MATERIALES        herramientas e insumos con costo                   ─┘
├─ CALENDARIO_LUNAR  guía mensual (la usa RESUMEN)
├─ CATALOGO          fórmula: solo "Disponible"  → lo lee la TIENDA (index / catalogo.html)
├─ RESUMEN           indicadores en vivo
└─ CONFIG            token de la app, carpeta de fotos

Google Drive "Legado Bonsai — Fotos 360"/<ID>/<id>_01.jpg …            ← fotos subidas desde el teléfono
Repositorio imagenes/360/<Carpeta imagen>/                             ← respaldo local (ejemplares antiguos)
```

Flujo: **teléfono (admin/) → Apps Script → Sheet + Drive → tienda**. Un cambio en el sheet se ve en la tienda en menos de 1 minuto (caché de 60 s).

## 3. Diccionario de datos — INVENTARIO

| Columna | Tipo | Regla |
|---|---|---|
| ID | `LB-0001` | Único, correlativo, lo asigna el script. **Nunca se edita.** Es el nombre de la carpeta de fotos y la referencia en CUIDADOS y VENTAS. |
| Código SKU | texto | Opcional. Código antiguo o etiqueta física (`AFTAB1`). |
| Nombre comercial | texto | Lo que ve el cliente. Ej.: "Junípero Shimpaku". |
| Especie | texto | Nombre botánico: `Juniperus chinensis 'Shimpaku'`. |
| Estilo / Estilo JP | lista | Estilo en español; el JP (kanji · romaji) se completa solo. |
| Ambiente | lista | Exterior / Interior / Semi-sombra. Filtro de la tienda. |
| Ubicación física | texto | Dónde está el árbol hoy (vivero, casa, exhibición). |
| Altura (cm) / Edad (años) | número | Solo el número; la tienda agrega la unidad. |
| Maceta | texto | Forma o material. |
| Estado de salud | lista | Excelente / Bien / Normal / En observación / Enfermo. |
| Estado comercial | lista | **Disponible** (visible en tienda) / Reservado / Vendido / En formación / Baja. |
| Costo total / Precio venta | $ | Margen $ y % se calculan por fórmula. |
| Fecha de ingreso, Última poda, Último trasplante, Último alambrado | fecha | Las tres últimas se actualizan al registrar un cuidado. |
| Riego, Historia | texto | Ficha de la tienda. Si están vacías se usa texto genérico. |
| Carpeta imagen | texto | Respaldo: carpeta en `imagenes/360/`. |
| Fotos | URLs | Separadas por coma, en orden de giro. Las escribe la app. |
| Destacado | Sí/No | Sale primero en la portada. |
| Notas | texto | Interno; no se publica. |
| Última actualización | fecha hora | Automática. |

## 4. Tareas de limpieza recomendadas (a mano, 10 minutos)

1. **Verificar LB-0001 a LB-0005** en INVENTARIO: la hoja "productos" tenía 57 filas para 5 códigos. Confirma cuántos ejemplares existen de verdad y da de baja los que no (`Estado comercial = Baja`), o registra los que falten desde la app.
2. **Asignar fotos a los ejemplares antiguos**: escribe en `Carpeta imagen` el nombre de la carpeta (`Bonsai1` … `Bonsai5`) del ejemplar correspondiente, o vuelve a fotografiarlos con la app y olvídate de las carpetas locales.
3. **Rellenar `Estilo`** de los 5 primeros (hoy vacío) para que aparezcan los filtros por estilo en el catálogo.
4. **Borrar la fila EJEMPLO** de VENTAS.
5. **Archivar** en Drive, en una carpeta `_Archivo 2024-2025`: *productos*, *INVENTARIO BONSAI*, *Proyecto Bonsai*, *Control Bonsai*. No los borres hasta que la tienda lleve una semana leyendo del sheet nuevo. *ARBOL DE FAMILIA BONSAI 1* va con el material de marca.
6. Cuando `API_URL` esté configurada, deja `SHEET_CSV_URL` vacía en `config.js` (o apúntala a CATALOGO publicada como CSV) para que la tienda nunca vuelva a mostrar la hoja vieja.

## 5. Convenciones

- Un ejemplar = una fila = un ID. No se reutilizan IDs; un árbol vendido queda como historial.
- Los precios se escriben sin símbolo (`40`, no `$40`); el formato lo pone el sheet.
- Fechas `dd/mm/aaaa`. Las fotos se numeran `01…24` en el orden del giro (sentido horario).
- Fotografía: base giratoria, fondo liso (el negro de materiales o una cartulina clara), luz difusa, encuadre cuadrado, 12 fotos por vuelta como estándar.
- Todo texto público (Nombre comercial, Historia, Riego) en español, tono de marca (ver `Informacion/manual de marca.docx`).
