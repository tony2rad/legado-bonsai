# Área 3 · Adornos de bonsái

Herramienta: [admin/adornos.html](../admin/adornos.html) (sin enlazar aún al menú del admin; es un archivo nuevo sin confirmar en git).

## Ya hecho

28 diseños en `DESIGNS`, cada uno con su altura de referencia y una nota de impresión:

| Grupo | Diseños |
|---|---|
| Puertas y arcos | torii, arco, puentepiedra, santuario, pabellón |
| Puentes y caminos | puente, senda |
| Agua y piedra | tsukubai, suiseki, oke, koi, bandeja |
| Templos y casas | pagoda, toro (linterna), minka |
| Figuras | mudman, erudito, buda, daruma, maneki, grulla, garza, buey |
| Barcos y animales | balsa, tortuga, koi |
| Mobiliario y piezas sueltas | banco, rastrillo, pergamino |

- Descarga STL por diseño (`adorno-<diseño>-<mm>mm.stl`) y vista 3D con `three.js`.
- Cada nota avisa la fragilidad (patas de 1,3–1,5 mm en garza, grulla, buey; tamaños de referencia 50–80 mm).

## Por hacer / ideas

- **Escala de venta:** imprimir a 3 tamaños por diseño (`mm` cambia en la herramienta) y medir peso y tiempo para fijar precio.
- **Versión imprimible en 3MF** con ajustes por diseño (perímetros y relleno) en lugar de solo STL.
- **Acabado:** pintura de ojos del daruma y figuras; pruebas con imprimación y barniz para exterior.
- **Galería de 3 piezas pequeñas** en la tienda (catálogo `catalogo.html`) como producto de regalo, si se decide vender (ver [08-pendientes.md](08-pendientes.md)).

## Restricciones

- Las patas delgadas (1 a 1,5 mm) son frágiles: subir la escala si la pieza se usa en exterior.
- Ninguna pieza necesita soporte según las notas; si la impresora requiere soporte en una pieza nueva, revisarla antes de añadirla.
- Son adornos decorativos: no van en contacto con agua de riego de forma continua.
