# Estudio STL: instrucciones para Claude

Este proyecto genera archivos STL de diseños 3D. El primer proyecto es una maceta de bonsái hecha en barbotina con molde de yeso. Antes de cambiar nada, lee `docs/DOCUMENTACION_TECNICA.md`: ahí están todas las decisiones y verificaciones.

## Cómo trabajar con este usuario
- **Todas las medidas visibles van en cm.** Internamente se trabaja en mm, y los STL se exportan en mm.
- **Para cualquier mejora, primero una propuesta y después la implementación**, con un diagrama simple si ayuda.
- Usa solo datos reales y declara los que falten. No inventes valores de material (contracción, relación agua:yeso): pídelos o márcalos como pendientes.
- Usa textos cortos y simples; el usuario no es especialista en CAD.
- El usuario tiene **pinzas de resorte**: no diseñes pinzas, solo filos para sujetarlas.
- Impresora: **Bambu Lab A2L, 33 × 32 × 32,5 cm**. Ninguna pieza debe superar esas medidas. Laminador: Bambu Studio.
- Material final: **barbotina**, con 12 % de contracción total.

## Arquitectura (`app/estudio3d.html`, un solo archivo)
- three.js 0.160.0, manifold-3d 2.5.1 (WASM) y JSZip 3.10.1, todos desde CDN.
- Proyectos paramétricos: `BASE_GROUPS` más `SLIP_GROUPS` (barbotina) o `DIRECT_GROUPS` (colado directo), y `COMMON_GROUPS`. `buildBonsai(p)` devuelve `{views, groupNames, pieces, info, analysis, calc, guide, ficha}`.
- Cada pieza lleva `{id, name, m (Manifold), color, group, explode, qty?, note?, ref? (yeso: no se imprime), hide? (solo visual)}`.
- Animación: `ANIM_ACTORS` y `ANIM_STEPS`. Las cajas aparecen en la posición en que se vacía el yeso.
- Análisis: `analysis.planes` (cortes) y `analysis.checks` (funciones de desmoldeo, que solo se calculan al pulsar el botón).
- `NOT_LENGTH` lista los parámetros que no son longitudes (%, °, relaciones). El resto se muestra en cm.

## Cómo verificar cualquier cambio
1. Sirve la carpeta (`python -m http.server 8765` en `app/`) y abre `http://127.0.0.1:8765/estudio3d.html`. `file://` no funciona en el panel del navegador de Claude.
2. Comprueba que `window.__estudio.current.pieces` no tenga cruces (intersección ≈ 0) entre cajas y yeso, ni entre piezas de yeso.
3. Comprueba que el hueco del yeso armado sea igual al modelo maestro, que no haya fugas al agrandar 1,5 mm el yeso (salvo en la cara de vaciado) y que el desmoldeo dé 7 de 7 libres.
4. Revisa las medidas contra la cama de la A2L.

## Lecciones (evitan errores ya cometidos)
- En una esquina invertida, al desplazar el contorno el centro del arco queda fijo y el radio cambia (`r0 − d`).
- Si una resta coplanar deja astillas, quédate con la componente mayor o agranda 0,05 mm la herramienta.
- `toPolygons()` puede devolver objetos: normaliza los puntos.
- Para cortar en vertical, usa `warp` con una rotación pura y luego `slice(0)`.
- Las paredes verticales que la arcilla abraza al encoger se traban: dales inclinación.
- La clase `.hidden` necesita `!important` si el elemento tiene `display` en línea.
