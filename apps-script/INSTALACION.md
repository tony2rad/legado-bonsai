# Instalación del backend (Google Apps Script)

Tiempo estimado: 15 minutos. Todo se hace dentro de tu cuenta de Google, sin servidores ni costos.

## 1. Preparar el sheet

1. Abre el sheet **Legado Bonsai — Sistema de Gestión** (el que tiene las pestañas INVENTARIO, materiales, ventas, etc.).
2. Menú **Extensiones → Apps Script**. Se abre el editor con un archivo `Código.gs` vacío.
3. Borra lo que haya y pega el contenido completo de [`Code.gs`](Code.gs). Guarda (Ctrl+S).
4. Arriba, en el desplegable de funciones, elige **`setup`** y pulsa **Ejecutar**.
5. Google pedirá permisos la primera vez ("Esta app no está verificada" → *Configuración avanzada → Ir a … (no seguro)* → *Permitir*). Es tu propio script, dentro de tu cuenta.
6. Al terminar aparece un aviso con el resumen. `setup()` es seguro de repetir: nunca borra datos.

### Qué hace `setup()` en tu sheet

| Pestaña | Acción |
|---|---|
| INVENTARIO | Conserva todo. Agrega las columnas `Riego`, `Historia`, `Carpeta imagen`, `Fotos`, `Destacado`, `Última actualización`. Pone listas desplegables (estado, salud, ambiente, estilo) y completa `Estilo JP` desde `Estilo`. |
| CUIDADOS | Renombra tu pestaña de historial (la que empieza con `ID Ejemplar`) y le pone lista de tipos. |
| VENTAS | Renombra `SKU / ID vendido` → `ID Ejemplar`. Lista de estados: Pagado / Pendiente / Anulado. |
| MATERIALES | Conserva todo y agrega `Última actualización`. |
| CALENDARIO_LUNAR | Renombra tu calendario mensual; si estuviera vacío, lo rellena. |
| CATALOGO | **Nueva.** Fórmula que muestra los ejemplares `Disponible` y `En formación` (preventa). Es lo que ve la tienda. No se edita a mano. |
| RESUMEN | Se regenera con fórmulas en vivo (conteos, valor disponible, ingresos, planes, clientes, créditos, cuidados, mes lunar). |
| CONFIG | **Nueva.** Contiene el token de la app, el correo que recibe el resumen diario y el estado del disparador. |
| CLIENTES | **v1.1.** Un cliente por fila (`CL-0001`): WhatsApp, plan activo y vencimiento, código de referido, créditos, ejemplares. La app la llena al registrar ventas. |
| RECORDATORIOS | **v1.1.** Mensajes generados cada mañana (fase lunar, revisión, renovación, bienvenida) con enlace de WhatsApp y estado. |
| COTIZACIONES | **v1.1.** Solicitudes del cotizador corporativo (`regalos.html`). |
| EVENTOS | **v1.1.** Eventos anónimos de la tienda (vista, ficha, carrito, WhatsApp…). Base del embudo. |
| EMBUDO | **v1.1.** Fórmulas: conversión mensual sesiones → fichas → carrito → WhatsApp → ventas. |
| CALENDARIO_EDITORIAL | **v1.1.** 41 publicaciones del 14/09 al 12/12/2026 (solo se siembra si está vacía). |

También crea en tu Drive la carpeta **Legado Bonsai — Fotos 360**, donde la app guardará una subcarpeta por ejemplar (`LB-0006/lb-0006_01.jpg`, …).

### 1b. Instalar el disparador diario (v1.1)

En el desplegable de funciones elige **`instalarDisparadores`** y pulsa Ejecutar (una sola vez). Desde entonces, cada día a las 8:00 (hora de Ecuador) `generarRecordatorios()` revisa clientes, cuidados y planes, escribe lo que toque en RECORDATORIOS y te envía un correo con los enlaces de WhatsApp listos. Para probar sin esperar: app → Inicio → Recordatorios → *Generar ahora (prueba)*.

> Si ya tenías el script v1.0 instalado: pega el nuevo `Code.gs` completo, ejecuta `setup()` otra vez (agrega las pestañas y columnas nuevas sin tocar datos) y luego `instalarDisparadores()`. Después publica una **nueva versión** de la implementación (paso 2, nota final).

## 2. Publicar el Web App

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web** (icono de engranaje → Aplicación web).
3. Descripción: `Legado Bonsai API v1`.
4. **Ejecutar como: Yo** (tu cuenta).
5. **Quién tiene acceso: Cualquier persona**. Esto es necesario para que la tienda pública lea el catálogo; las escrituras siguen protegidas por el token.
6. Implementar → copia la **URL de la aplicación web** (termina en `/exec`).

Prueba en el navegador: `TU_URL/exec?action=ping` debe responder `{"ok":true,"version":"1.1.0",…}`, `TU_URL/exec?action=catalogo` la lista de disponibles y en formación, `TU_URL/exec?action=arbol&id=LB-0001` el pasaporte de un árbol y `TU_URL/exec?action=codigo&c=LEGADO10` la validación de un código.

> Cada vez que cambies `Code.gs` en el futuro: **Implementar → Administrar implementaciones → lápiz → Versión: Nueva → Implementar**. La URL no cambia.

## 3. Conectar la tienda

En [`config.js`](../config.js) (raíz del sitio):

```js
API_URL: 'https://script.google.com/macros/s/…/exec',
SHEET_CSV_URL: '',   // o la pestaña CATALOGO publicada como CSV, como respaldo
```

Sube el cambio al repositorio (GitHub Pages) y la tienda empezará a leer del sheet nuevo. Mientras `API_URL` esté vacía, la tienda sigue usando el CSV antiguo de la hoja "productos".

## 4. Conectar la app de registro

1. En el teléfono abre `https://TU-SITIO/admin/` (o `http://localhost:5500/admin/` en la PC).
2. Pestaña **Ajustes**: pega la URL del Web App y el token de la pestaña **CONFIG** del sheet. **Probar conexión** → **Guardar**.
3. En Chrome (Android) o Safari (iPhone): menú → **Añadir a pantalla de inicio**. Queda como app.

El token se guarda solo en ese teléfono. Si lo pierdes o se filtra, ejecuta `regenerarToken` en el editor de Apps Script y vuelve a pegarlo.

## 5. Flujo de trabajo diario

- **Nuevo ejemplar**: Nuevo → fotos (modo 360° automático con la base giratoria, o tomar/elegir) → datos → Guardar. El código `LB-00NN` se asigna solo. Las fotos van a Drive y el ejemplar aparece en la tienda en menos de 1 minuto.
- **Venta**: desde el ejemplar o desde Inicio. El ejemplar pasa a Vendido (o Reservado si el pago está pendiente) y desaparece de la tienda. El cliente queda en CLIENTES con su código de referido; la app te da el botón *Enviar bienvenida por WhatsApp* con el enlace del pasaporte y el código.
- **Preventa**: un ejemplar *En formación* con *Entrega estimada* aparece en la tienda con anticipo del 30 %. Al reservarlo, registra la venta como Pendiente con el *Anticipo recibido*; al cobrar el saldo, cámbiala a Pagado en el sheet.
- **Cuidado**: poda, trasplante, alambrado… Actualiza las fechas de "último…" del ejemplar y aparece en el pasaporte público del árbol.
- **Recordatorios** (Inicio → Recordatorios): cada mañana llegan al correo y a la app; toca *WhatsApp*, envía, marca *Enviado*.
- **Cotizaciones** (Inicio → Cotizaciones): solicitudes corporativas con estado y enlace al contacto.
- **Tablero** (Inicio → Tablero de ventas): embudo web, ventas por plan y canal, fichas más vistas.
- **Reels 360°** (Inicio → Generador de reels): video vertical con las fotos del ejemplar, sin apps externas.
- **Materiales**: entradas y salidas con `+`/`−`.

Todo sigue siendo editable a mano en el sheet: la app y el sheet son la misma base de datos.

## Preguntas frecuentes

**¿Quitar fondo funciona?** Es opcional (casilla en el formulario). Usa una IA que corre en el propio teléfono, gratis, sin enviar la foto a terceros. La primera vez descarga el modelo (≈40 MB) y tarda 10–40 s por foto según el teléfono. Funciona mejor con fondo liso y luz pareja. Si falla o va muy lento, desmarca la casilla y usa el fondo negro que ya tienes en materiales.

**¿Las fotos pesan mucho?** La app las reduce a 1200 px antes de subir (≈200–400 KB cada una).

**¿Puedo seguir usando la carpeta `imagenes/360/` del repositorio?** Sí: si un ejemplar no tiene URLs en `Fotos`, la tienda busca en `imagenes/360/<Carpeta imagen>/` como hasta ahora.

**¿La hoja "productos" antigua?** Ya no se usa. Ver [`docs/ESTRUCTURA_DATOS.md`](../docs/ESTRUCTURA_DATOS.md) para el orden recomendado de tus archivos.
