---
name: project-estudio3d-stl
description: Estudio STL personal (HTML generador de STL y moldes de yeso) en Documentos\Estudio3D; maceta bonsái de la foto como primer proyecto (2026-10-26)
metadata:
  node_type: memory
  type: project
  originSessionId: 5812ac13-b6e1-47a3-899c-96abdb7967e2
  modified: 2026-10-26T21:35:45.756Z
---

Proyecto personal, fuera de los tableros CX: `C:\Users\ataco\OneDrive - AEKIA S.A\Documentos\Estudio3D\estudio3d.html`.
- Three.js 0.160 + manifold-3d 2.5.1 (CDN). Sólidos por lofts paramétricos + booleanas; todo sale estanco.
- Proyecto 1: maceta bonsái esquinas invertidas (foto). El usuario hace cerámica por BARBOTINA: cadena modelo → cajas impresas → molde de yeso (fondo TIPO TAPÓN con borde inclinado 12° que los 2 laterales abrazan, como en el video de referencia youtube.com/shorts/PtYV-PKrKMo; llaves esféricas; cuello de llenado) → barbotina. Contracción de su arcilla: 12 % (dato del usuario, ya por defecto). Con 12 % la pieza mayor mide 322 mm (cabe en la A2L). Queda también el modo "colado directo" (molde impreso + núcleo). Verificado: cajas encierran el yeso y la cavidad del yeso = modelo.
- Botón "Analizar molde": 10 cortes (slice + warp de rotación pura) y 7 pruebas de desmoldeo (mover pieza 0,5/3/15 mm e intersecar); todas libres. Hueco bajo el fondo con 5° de inclinación para que la arcilla al encoger no se trabe en el tapón.
- Cajas impresas con FILOS para las pinzas de resorte del usuario (no imprimir pinzas): tablero lateral es la base y sobresale 15 mm con rebaje inferior; tablas inferior/superior con filo de pie y ranuras en V; esquinas con filo que pega al extremo; anillo del tapón con filo de pie. Largo máx. 32,2 cm. El usuario prefiere ver TODAS las medidas en cm (params se editan en cm, internamente mm).
- Pestaña Importar STL: revisa estanqueidad y hace molde genérico de 2 piezas.
- PC sin laminador ni software 3D (solo Python 3.14). Impresora: Bambu Lab A2L (330×320×325 mm), laminador Bambu Studio; ya es el volumen por defecto del HTML y todas las piezas caben.
- Para probar en el panel del navegador hay que servirlo con `python -m http.server` (el panel no ejecuta file://).

**Why:** el usuario quiere generar varios proyectos 3D desde la misma herramienta.
**How to apply:** nuevos proyectos se agregan como otro generador (params + build) en el mismo HTML.
