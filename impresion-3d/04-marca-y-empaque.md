# Área 5 · Marca, empaque y regalos

Estado: **idea**. Hoy el empaque y la etiquetería son de papel (`admin/imprimibles.html`: etiqueta colgante, tarjeta de cuidados, caja y bolsa de regalo, troqueles en A4/A3).

Decisión: **sí se venden piezas impresas**, ligadas a las tres líneas del negocio: bonsái, ecología y gadgets. Ver [08-pendientes.md](08-pendientes.md).

## Líneas de producto

| Línea | Piezas | Material | Estado |
|---|---|---|---|
| Bonsái | Adornos de la [área 3](02-adornos-bonsai.md), soportes de etiqueta, guías de alambre | PLA (interior) | Idea de venta |
| Ecología | Soportes reutilizables (para cajas o para plantas), pinzas para etiquetas, insertos de envío que se reutilicen | PLA | Idea de venta |
| Gadgets | Llaveros y colgantes de marca, soporte de celular con el logotipo | PLA | Idea de venta |

Antes de vender cualquier pieza de estas líneas: prueba de encaje y una semana de prueba (ver [06-calibracion-y-pruebas.md](06-calibracion-y-pruebas.md)).

## Ideas

| Pieza | Para qué | Material | Notas |
|---|---|---|---|
| Sello de lacre con el logotipo | Cerrar cajas y cartas | PLA para diseño, o usar como matriz para cera | Usar `assets/img/logo/` con grabado en relieve (ver `SEALS` de macetas) |
| Soporte de tarjeta para la caja de regalo | Mostrar el mensaje del regalo | PLA | Pieza pequeña, rápida |
| Inserto de caja (sujeción de la maceta) | Evitar que la maceta se mueva en el envío | PLA o cartón | Medir la maceta con `halfInt`/`halfExt` |
| Llavero o colgante de marca | Merchandising y regalo corporativo (`regalos.html`) | PLA | Ver precios en `config.js` antes de ofrecer |
| Pinza para la etiqueta colgante | Sujetar la etiqueta de pasaporte al tronco | PLA | Alternativa a alambre |

## Restricciones

- El logotipo grabado exige que el archivo SVG de `assets/img/logo/` se use tal cual; no redibujar (ver memoria del proyecto «arte fiel al original»).
- Los regalos corporativos son lotes: calcular tiempo y costo con la calculadora de macetas antes de cotizar.

## Próximo paso

Decidir si el sello de lacre va en la caja de regalo (costo bajo, impacto alto).
