# Área 1 y 2 · Macetas y moldes de cemento

Herramientas: [admin/macetas.html](../admin/macetas.html) (sección Impresión 3D y Molde 3D), con [admin/maquina.html](../admin/maquina.html) y [admin/plano-maquina.html](../admin/plano-maquina.html) como material de apoyo (la máquina de barrido no lleva piezas impresas en lo que documenta el proyecto; verificar).

## Ya hecho

| Función | Dónde | Notas |
|---|---|---|
| Maceta impresa (PLA/PETG) | Sección «Impresión 3D» | Pared recomendada según tamaño: 1,7 a 3,4 mm (`printWall`). Fondo = máx(3 mm, 1,3 × pared) |
| Patas a presión | `pFeet=presion` (por defecto) | Espigas sueltas Ø 4 mm con nervios de aplastamiento; sin pegamento. Ajuste suave/medio/firme |
| Patas pegadas o con cabeza | `pFeet=encaje` / `pegadas` | Alternativas si la espiga no encaja |
| Labio: recto o bisel 55° | `pLip` | Sin soporte |
| Sello de Legado en la base | `pSeal` (grabado 1 mm) | Logotipo vertical, sello circular, emblema, firma lineal o sin sello |
| Logotipo en el piso interior | `pIn` | Hundido 1 mm (por defecto) o en relieve |
| Mesa de exhibición (shoku) | `pObj=mesa` | Cubierta 4/6/8 lados, calado de rombos, patas de voluta; se imprime boca abajo sin soportes |
| Molde de vaciado en 2 o 4 gajos | Molde 3D (`moldParts`) | `auto` elige el que ocupe menos camas (con la A2L: 51 → 47 camas en los 23 modelos) |
| Núcleo hueco o macizo | `moldCore` | Hueco ahorra 60–140 g de base |
| Pasadores y cuñas impresos | Molde 3D | Se imprime el usado más 2 de repuesto |
| Kit de molde de silicona para mesas | `exportTable('mold')` | Mesa impresa como madre + caja de vertido + instructivo |
| Piezas que no caben en la cama | `splitToFit` | Parte en trozos iguales con espigas de unión Ø 4 mm (o 3 y 2,4 mm si es delgada) |
| 3MF para Bambu Studio | Botones «Abrir en Bambu Studio (3MF)» | Un archivo por cama; ajustes recomendados por pieza |
| Estimado de filamento y tiempo | `#calcBox` | ±25 %; tabla CSV de los 23 modelos |
| Perfil de la A2L | `printer=a2l` | 33 × 32 × 32,5 cm |

## Por hacer / ideas

- **Maceta en PLA (decidido):** probar una maceta una semana al sol y con riego antes de venderla (pendiente 7 en [08-pendientes.md](08-pendientes.md)). Si se deforma, limitar a interior o pasar a PETG.
- **Mesa de exhibición en PLA** solo para interior; en exterior, cemento.
- **Registrar en la tabla de producción** los tiempos reales por pieza (la estimación es ±25 %) para afinar los ajustes.
- **Cemento:** si el molde exterior se imprime en PLA, probar cuántos vaciados aguanta antes de deformarse.
- **Probar la carga de las espigas** con árbol y tierra mojada: no hay prueba documentada en el proyecto todavía.

## Restricciones

- **Material:** las macetas se imprimen en PLA (decisión del usuario). PLA se deforma cerca de 55–60 °C: no dejarla al sol directo ni en auto.
- Piezas más grandes que la cama de la A2L se parten (`splitToFit`); las espigas de unión deben quedar en el cuerpo sólido.
- Las patas a presión dependen del ajuste de la impresora: calibrar antes de imprimir lotes (ver [06-calibracion-y-pruebas.md](06-calibracion-y-pruebas.md)).
- El molde de cemento necesita sellado y desmoldante; el PLA no debe quedar expuesto a temperatura alta del fraguado.
