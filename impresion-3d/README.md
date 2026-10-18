# Impresión 3D · Bambu Lab A2L · Legado Bonsai

Repositorio de referencia de **todo lo que podemos hacer con la impresora**, consolidado por área. Cada área dice qué ya existe en el proyecto (con su archivo), qué falta y qué restricciones aplican.

Este repositorio es documentación. El código de las herramientas vive en `admin/` (ver tabla de áreas).

## 1. La máquina

Datos de fichas de venta y reseñas encontradas en la búsqueda web, cruzadas con las medidas que ya usa el proyecto. La ficha oficial de Bambu Lab no se pudo abrir (HTTP 403).

| Dato | Valor | Fuente / nota |
|---|---|---|
| Volumen de impresión | 330 × 320 × 325 mm (el proyecto usa 33 × 32 × 32,5 cm) | [Tom's Hardware](https://www.tomshardware.com/3d-printing/bambu-lab-launches-big-bed-slinger-a2l-companys-h2s-lite-is-half-the-cost-of-h2s-at-just-usd469), [3DPrintingIndustry](https://3dprintingindustry.com/news/new-bambu-lab-a2l-3d-printer-technical-specifications-and-pricing-252057/) |
| Boquilla máxima | 300 °C; boquilla de acero inoxidable de serie, de acero endurecido para materiales abrasivos | [CNC Kitchen](https://cnckitchen.com/blog/bambu-a2l-my-honest-review-after-400-hours) |
| Cama caliente máxima | 80 °C (límite por diseño de bastidor abierto) | mismas fuentes |
| Filamento | 1,75 mm | [Core Electronics](https://core-electronics.com.au/bambu-lab-a2l-3d-printer-machine-only.html) |
| Materiales recomendados | PLA, PETG, TPU | CNC Kitchen |
| ABS / ASA | Solo piezas pequeñas (según fichas de vendedores). El revisor prefiere una máquina cerrada para ASA | CNC Kitchen; fichas de vendedores |
| Bastidor | Abierto, sin filtración de aire: ventilar. El revisor recomienda no usarla en dormitorios | CNC Kitchen |
| Ruido | ~50 dB en impresión; el ventilador de la pieza es lo más ruidoso | CNC Kitchen |
| Velocidad | ~10–20 % más lenta que las H-series (aceleraciones limitadas y menor tasa de fusión) | CNC Kitchen |
| Calidad en piezas altas y esbeltas | Empeora con la altura (la cama se mueve). Activar «Slow Down at Height» y orientar el lado estable hacia el movimiento | CNC Kitchen |
| Multicolor | AMS Lite (4 bobinas, sin caja), AMS 2 Pro y AMS HT compatibles; hasta 19 colores con 4 AMS | [Core Electronics](https://core-electronics.com.au/catalog/product/view/sku/BL-A2L-COMBO), CNC Kitchen |
| Cortador (opcional, ~60 USD) | Área de corte 300 × 300 mm; vinilo de transferencia probado; sin cámara de alineación | CNC Kitchen |
| Cancelar objetos | Solo desde la app Bambu Handy, no en pantalla ni en Bambu Studio; falla con más de 64 objetos en la mesa | CNC Kitchen |
| Detección de «spaghetti» | No tiene. La cámara es débil: se sugiere cámara externa | CNC Kitchen |
| Nivelación | Calibración de ~45 min en el primer arranque; el firmware no muestra la malla de la cama | CNC Kitchen |

**Puntos sin confirmar:** los diámetros de boquilla disponibles difieren entre fuentes (0,4 mm de serie; algunas listas mencionan 0,2 / 0,6 / 0,8 mm). Confirmar en la ficha oficial de Bambu antes de comprar boquillas. Tampoco está confirmada la cifra de 500 mm/s: viene de un anuncio de segunda mano.

**Qué confirmar en tu equipo:** si tienes el combo (con AMS Lite) y si tienes el cortador. Esto cambia las áreas 5 y 6.

## 2. Áreas

| # | Área | Qué hacemos | Estado en el proyecto | Documento |
|---|---|---|---|---|
| 1 | Producción de macetas | Macetas de arcilla y cemento: plantillas, impresión 3D de la maceta, patas a presión, sello de Legado | **Hecho** (`admin/macetas.html`) | [01-macetas-y-moldes.md](01-macetas-y-moldes.md) |
| 2 | Moldes de cemento | Molde exterior en 2 o 4 gajos, núcleo, pasadores y cuñas, kit de molde de silicona para mesas | **Hecho** (`admin/macetas.html`, sección Molde 3D) | [01-macetas-y-moldes.md](01-macetas-y-moldes.md) |
| 3 | Adornos de bonsái | Figuras y accesorios de jardín japonés (torii, pagoda, linterna, puentes, figuras) | **Hecho** (`admin/adornos.html`, 28 diseños) | [02-adornos-bonsai.md](02-adornos-bonsai.md) |
| 4 | Herramientas y accesorios de cultivo | Guías de alambre, soportes, plantillas de poda, marcadores, bases de exhibición pequeñas | **Idea** | [03-taller-y-cultivo.md](03-taller-y-cultivo.md) |
| 5 | Marca, empaque y regalos | Sello para lacre, soportes de etiqueta, insertos de caja, llaveros | **Idea** (parte en `admin/imprimibles.html` en papel) | [04-marca-y-empaque.md](04-marca-y-empaque.md) |
| 6 | Vinilo y plantillas de corte | Stickers de marca, máscaras de pintura, plantillas (con cortador opcional) | **Idea** (depende del cortador) | [05-vinilo-y-corte.md](05-vinilo-y-corte.md) |
| 7 | Calibración y pruebas | Prueba de tolerancias, calibración de flujo, pruebas de cada material antes de vender | **Parcial** (`admin/imprimibles.html` tiene pruebas en papel) | [06-calibracion-y-pruebas.md](06-calibracion-y-pruebas.md) |
| 8 | Materiales y seguridad | PLA/PETG/TPU, límites de temperatura, ventilación, contacto con agua y alimentos | **Referencia** | [07-materiales-y-seguridad.md](07-materiales-y-seguridad.md) |
| 9 | Pendientes y decisiones | Ideas que necesitan decisión tuya (venta de piezas, impresión bajo pedido) | **Por decidir** | [08-pendientes.md](08-pendientes.md) |

## 3. Flujo general

1. **Diseño:** en el proyecto, los parámetros se ajustan en el panel de cada herramienta de `admin/`.
2. **Exportar:** «Descargar STL» (cualquier pieza) o «Abrir en Bambu Studio (3MF)» (piezas con sus ajustes recomendados ya puestos, colocadas en camas).
3. **Laminar:** Bambu Studio (Mac y Windows). El tiempo y el filamento que muestran las herramientas son **estimados (±25 %)**; el exacto lo da Bambu Studio.
4. **Imprimir:** la impresora en su cama; revisar el primer capa antes de dejarla sola.
5. **Postproceso:** retirar soportes, lijar, sellar; en piezas de PETG o PLA, ver [07-materiales-y-seguridad.md](07-materiales-y-seguridad.md).

## 4. Reglas que aplican a todas las áreas

- **Calor:** PLA se deforma con calor (alrededor de 55–60 °C). No dejar piezas de PLA en auto ni al sol directo. Para exterior, PETG o cemento.
- **Agua:** el PLA no es para uso prolongado con agua (en macetas con riego, preferir PETG o el cemento); probar antes de vender.
- **Alimentos:** nada de la impresora va en contacto con comida o bebida.
- **Ventilación:** el bastidor es abierto; imprimir en un lugar ventilado.
- **Cama de 80 °C:** las piezas grandes de PETG se alabean. Usar brim y adhesivo de cama (recomendado por el revisor).
- **Tamaño:** ninguna pieza puede pasar de 330 × 320 × 325 mm; las herramientas avisan y ofrecen partirla (`splitToFit` en macetas).

## 5. Fuentes

- [Tom's Hardware: lanzamiento de la A2L](https://www.tomshardware.com/3d-printing/bambu-lab-launches-big-bed-slinger-a2l-companys-h2s-lite-is-half-the-cost-of-h2s-at-just-usd469)
- [3DPrintingIndustry: especificaciones técnicas](https://3dprintingindustry.com/news/new-bambu-lab-a2l-3d-printer-technical-specifications-and-pricing-252057/)
- [CNC Kitchen: revisión tras 400 horas](https://cnckitchen.com/blog/bambu-a2l-my-honest-review-after-400-hours)
- [Core Electronics: ficha (combo)](https://core-electronics.com.au/catalog/product/view/sku/BL-A2L-COMBO)

La ficha oficial de Bambu Lab no se pudo consultar (HTTP 403). Confirmar cifras en su sitio antes de comprar accesorios.
