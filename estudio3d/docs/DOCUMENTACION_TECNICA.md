# Estudio STL · Documentación técnica

Fecha de consolidación: 26-10-2026.
Archivo principal: `app/estudio3d.html`, una sola página que se abre en Chrome o Edge.

Este documento reúne todo lo decidido, aprendido y verificado para llegar del diseño de una foto a los archivos STL de un molde de yeso para barbotina.

---

## 1. Objetivo y cadena de proceso

**Objetivo:** reproducir en serie la maceta de bonsái de la foto de referencia: una maceta rectangular de esquinas invertidas, esmaltada en celadón.

**Cadena acordada** (el usuario pidió "un paso atrás": primero el molde para el yeso):

```
1 Modelo (positivo)  →  2 Cajas impresas  →  3 Molde de yeso  →  4 Barbotina  →  5 Maceta cerámica
     (opcional)            (se imprimen)        (se vacía en      (colado y        (horneada)
                                                  las cajas)        drenado)
```

- **Material final:** barbotina cerámica. El molde de yeso copia **solo el exterior**. La pared se forma porque el yeso absorbe agua; el sobrante se vacía.
- **Contracción total de la arcilla:** **12 %**, dato del usuario. El modelo y el molde se agrandan con el factor `s = 1 / (1 − 0,12) = 1,136`.
- **Impresora:** Bambu Lab A2L, con un volumen de impresión de **33 × 32 × 32,5 cm**. El laminador es **Bambu Studio**.
- **Unidades:** el usuario ve y edita **todo en cm**. Internamente todo es mm, y los STL salen en mm porque es lo que esperan los laminadores.

También quedó en el generador la variante **"colado directo"**: un molde impreso con núcleo, para cemento o mortero. Ojo: el yeso se disuelve con el riego, así que no sirve para una maceta con planta viva sin sellarla.

---

## 2. Mapeo del diseño de la foto

| Rasgo observado | Cómo se modela | Valor inicial |
|---|---|---|
| Planta rectangular con **esquinas invertidas** (cóncavas) | Contorno con arco cóncavo de radio r en cada esquina | 22 × 16,5 cm, r = 1,6 cm |
| Lados levemente abombados | Parábola sumada a cada lado | 0,2 cm |
| Cuerpo cónico (más angosto abajo) | Desplazamiento del contorno según la altura | 0,8 cm por lado |
| Leve barriga | Seno a lo alto del cuerpo | 0,15 cm |
| **Labio** redondeado hacia afuera | `salida · sin(π·s)^0,6` en el tramo superior | 1 cm de alto, 0,4 cm de salida |
| **Zócalo** retranqueado con **pies en las esquinas y arcos** entre ellos | Anillo de zócalo menos arcos (prismas) | 1,2 cm de alto, muro de 0,8 cm, arco de 0,6 cm |
| Hueco bajo el fondo | Interior del zócalo | Inclinación de 5° (ver §6) |
| Drenaje y agujeros para alambre | Cilindros | 2 de 2,2 cm; alambre de 0,35 cm |
| Proporción largo:alto ≈ 3,3:1 | — | Alto de 6,6 cm |

**La foto no trae escala.** Los 22 cm de largo son un valor inicial; al medir la pieza real se ajustan largo, ancho y alto.

### Contorno de planta (función `quadrant` / `makeRingFn`)

- Se construye el **primer cuadrante** y se refleja en los otros tres.
- El contorno se suaviza con un filtro de caja aplicado dos veces y se **remuestrea con N puntos a igual longitud de arco**. Todos los anillos empiezan en el eje +X, así los puntos de anillos distintos se corresponden.
- **Desplazamiento "verdadero" de la esquina invertida:** el centro del arco queda fijo en (A, B) y el radio pasa a ser `R = r0 − d`. Si en cambio se mueve el centro con el desplazamiento, la pared sale 1,41 veces más gruesa en las esquinas.
- La esquina redondeada usa el centro fijo en (A − r0, B − r0) y radio `r0 + d`.

---

## 3. Motor geométrico

| Pieza | Elección | Motivo |
|---|---|---|
| Visor | three.js 0.160.0 (jsDelivr) | Estándar, con OrbitControls y STLLoader |
| Sólidos | **manifold-3d 2.5.1** (WASM, jsDelivr) | Operaciones booleanas robustas que **siempre** dan una malla cerrada, apta para imprimir |
| Archivo .zip | JSZip 3.10.1 (cdnjs) | Descargar todo junto |

**Método de construcción:**
- **Lofts propios** (`solidFromRings`): anillos con el mismo número de puntos y tapas en abanico desde el centroide. La orientación se corrige con el signo del volumen.
- Las formas se combinan con unión, resta e intersección.
- Los prismas se generan a lo largo de X o Y con `prismAlong`, para no depender del signo de `rotate`.

### Particularidades de manifold-3d 2.5.1 encontradas

- Requiere `wasm.setup()`. `Manifold.union` acepta una lista.
- El volumen se obtiene con `getProperties().volume`; las versiones nuevas usan `.volume()`. El código cubre ambos casos.
- `slice(z).toPolygons()` devuelve puntos que **no siempre son arreglos**; hay que normalizarlos a `[x, y]` (`normPolys`).
- Para cortes verticales se usa `warp`, que aplica una **rotación pura**, sin espejo, y luego `slice(0)`.
- Una resta con caras coplanares puede dejar **astillas de volumen ≈ 0**. Se limpian quedándose con la componente de mayor volumen (`largest`), o agrandando 0,05 mm la herramienta de corte.
- Se debe llamar a `delete()` sobre los objetos intermedios. Se registran con `track()` y se liberan en cada reconstrucción.
- Las piezas se comparten entre varias entradas de la lista, así que al borrar hay que deduplicar con un `Set`.

---

## 4. Molde de yeso para barbotina (paso 3)

**Tres piezas:**

1. **Tapón (fondo):**
   - Sigue el contorno del zócalo más un **margen de 1,5 cm**.
   - Su borde está **inclinado 12°** y se angosta hacia abajo.
   - Por arriba lleva el relieve que forma los **arcos** de los pies y el **hueco bajo el fondo**.
   - Mide 3 cm de yeso por debajo.
2. **Lateral A** (Y ≥ 0) **y Lateral B** (Y ≤ 0):
   - Se parten en el plano Y = 0.
   - Bajan hasta la mesa y **abrazan el tapón**. Es el acople del video de referencia (https://youtube.com/shorts/PtYV-PKrKMo): la base es un tapón que las dos paredes atrapan al cerrarse.
   - Llevan **llaves de bola** (Ø ≈ 1,2 cm): A tiene la bola saliente y B el hueco con holgura.
   - La pared de yeso mide **3 cm** como mínimo.
3. **Cuello de llenado:**
   - Sobre el labio va un embudo de 2,5 cm que se abre 0,3 cm.
   - Después del colado se corta a ras del labio.

**Cómo se forman los pies:**
- La ranura del zócalo mide 0,9 × 1,4 cm (con la contracción) y la barbotina la llena **maciza**.
- El relieve del tapón forma los arcos y el hueco.
- El drenaje y el alambre se perforan con la pieza en **dureza de cuero**.

**Material:** unos **6,2 kg de yeso en polvo**: 1,7 kg para el tapón y 4,5 kg para las paredes. El cálculo usa una relación agua:yeso de 70:100 y una densidad de yeso de 2,6 g/cm³; hay que confirmarlo con la ficha de la bolsa. La barbotina para llenar el molde son unos 4.034 cm³, y el sobrante se vacía.

---

## 5. Cajas impresas (paso 2): aquí se vacía el yeso

Cada caja se arma con la **cara de vaciado hacia arriba**.

**Caja del tapón (2 piezas):**
- **Tablero del fondo:** lleva el relieve y 4 espigas, más un **ala de 1,5 cm** alrededor.
- **Anillo inclinado:** lleva un **filo de pie de 1,5 cm** con ranuras en V.
- Se vacía con la caja invertida. Al hacerlo, el ala del tablero queda en el aire y la mordaza de la pinza entra por debajo. Hacen falta unas 8 pinzas de resorte.
- Para desmoldar: retirar el tablero y **empujar el tapón por el lado ancho** del anillo.

**Caja de cada pared (5 piezas; las 4 tablas sirven para A y B):**
- **Tablero lateral (A o B):**
  - Es la base de la caja y lleva media maceta en relieve, con las llaves.
  - Sobresale **1,5 cm arriba y abajo**, con un **rebaje de 0,3 cm por debajo** para la mordaza.
  - Su espesor es `max(tablas, radio de llave + holgura + 3 mm)` para que las llaves no lo atraviesen. Este error se detectó y se corrigió.
- **Tabla inferior y tabla superior:**
  - Se paran sobre el tablero.
  - Llevan un **filo de pie** con ranuras en V cada 7 cm y filos verticales en las esquinas.
- **Tablas de extremo ×2:** se alargan para quedar pegadas a los filos de las esquinas.
- Se usan unas **16 pinzas de resorte**. La unión entre tablero y extremo queda apretada de forma indirecta por las pinzas de las esquinas.
- **Restricción de tamaño:** con filos en los extremos, el tablero mediría unos 35,2 × 16 cm, que **no cabe ni en diagonal** en la A2L. Por eso los filos de las esquinas apuntan hacia el alto de la caja y el largo máximo queda en **32,2 cm**.
- Las juntas siempre se sellan con plastilina por dentro. La pinza aprieta, pero no sella.

**Decisiones del usuario:** el usuario tiene **pinzas de resorte propias**, así que no se imprimen pinzas; solo se agregan filos para sujetarlas. Antes de implementar una mejora, el usuario pide **primero una propuesta**.

---

## 6. Verificaciones hechas

Todas se hicieron con booleanas de manifold en el navegador; el botón "Analizar molde" las repite.

| Verificación | Resultado |
|---|---|
| Cruce entre piezas de yeso, y entre yeso y modelo | ≈ 0 (< 0,02 cm³) |
| Hueco del molde de yeso armado = modelo | 4.034 cm³ = 4.034 cm³ |
| Cada caja encierra su yeso (yeso agrandado 1,5 mm, salvo la cara de vaciado) | Sin fugas; solo las holguras de las espigas |
| **Desmoldeo:** cada pieza movida 0,5, 3 y 15 mm en su dirección de salida | 7 de 7 libres |
| Mallas cerradas | Manifold: todas cerradas. En el STL exportado, el tablero del fondo y el yeso del fondo muestran 2 aristas dudosas por redondeo a float32; Bambu Studio las repara solo |
| Todo cabe en la A2L | Pieza mayor de 32,2 cm |

**10 cortes del molde** (`docs/cortes_molde_yeso.html`):
- **Verticales:** el centro a lo largo y a lo ancho, y los pies de esquina en los dos sentidos.
- **Horizontales:** el tapón, los arcos, el zócalo, el cuerpo, el labio y el cuello.

**Riesgos encontrados y corregidos:**
1. **Hueco bajo el fondo con paredes verticales.** Al secarse, la arcilla encoge y el anillo del zócalo se aprieta sobre el relieve del tapón, con riesgo de trabarse o rajarse. Se le dio **5° de inclinación**.
2. **Llaves que atravesaban el tablero de 4 mm.** Se engrosó el tablero.
3. **Corte en Y = 0 sobre el plano de partición** (se dibujaba mal). Se movió a Y = 0,5 mm.

**Riesgo que la geometría no resuelve:** los arcos entre pies también se aprietan al encoger la pieza. Hay que separar la pieza del tapón apenas tenga firmeza.

---

## 7. Uso del generador

- **Vistas:** Maceta final · 1 Modelo · 2 Cajas para el yeso · 3 Molde de yeso · 3 Yeso explosionado · **▶ Animación del armado** (16 pasos con el STL de cada pieza) · Corte · Rayos X.
- **Panel derecho:** piezas STL con sus medidas en cm, el aviso de si caben en la impresora, el cálculo de material, el mapa del diseño (planta y sección), el botón **Analizar molde**, el proceso de vaciado y el software.
- **Pestaña Importar STL:** revisa si una malla es estanca, la re-escala y genera un molde genérico de 2 piezas.
- **Proyectos guardados:** se guardan en localStorage y se exportan o importan como .json.

**Software:**

| Programa | Estado en el PC original | Uso |
|---|---|---|
| Chrome o Edge | ✔ | Abrir el generador |
| **Bambu Studio** | ✘ hay que instalarlo | Laminar e imprimir (obligatorio) |
| Python 3 | ✔ (3.14) | Servidor local `python -m http.server` |
| MeshLab o 3D Builder | opcional | Revisar mallas |
| Blender, FreeCAD | opcional | Escultura o CAD a mano |

---

## 8. Pendientes y datos por confirmar

- Medir la maceta real y ajustar largo, ancho y alto. Los 22 cm son un valor inicial.
- Confirmar la relación agua:yeso y el tiempo de fraguado en la ficha del yeso.
- Hacer una impresión de prueba y un primer colado, luego ajustar la holgura de las llaves (0,3 mm) y el espesor de pared.
- Laminar en Bambu Studio y revisar las 2 aristas dudosas de las piezas del fondo.
