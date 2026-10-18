# Área 7 · Calibración y pruebas

Estado: **parcial**. Hay pruebas en papel (`admin/imprimibles.html`: registro de doble cara, carta de color Pantone) y pruebas de medida en las herramientas 3D (testigo de grosor, regla de 50 mm). No hay todavía un protocolo de calibración de impresión.

## Protocolo propuesto (antes de vender una pieza nueva)

1. **Nivelación y primera capa:** calibración automática de la A2L (~45 min la primera vez) y revisar la primera capa.
2. **Flujo y temperatura:** probar PLA y PETG con la temperatura del fabricante; comparar dimensiones.
3. **Tolerancias:** imprimir una prueba de encaje para las espigas de patas a presión (en macetas: espiga Ø 4 mm en agujero Ø 4,2 mm, es decir 0,2 mm de holgura). En la revisión de CNC Kitchen, las piezas de tolerancia de 0,1 y 0,2 mm quedaron atascadas: revisar el ajuste en tu impresora antes de lotes.
4. **Prueba de carga:** para una maceta, probar con peso (arena o tierra húmeda) durante 48 h.
5. **Medidas:** medir la pieza con pie de rey y comparar con el modelo; anotar la diferencia.
6. **Registro:** guardar los resultados (material, temperatura, perfil, medida) junto al archivo de la pieza.

## Ideas

- **Cubo de calibración** y prueba de voladizo para cada material nuevo.
- **Benchy** como prueba de calidad de la impresora (la revisión imprimió un Benchy en 38 minutos con buena calidad).
- **Registro en `localStorage`** (como `legadoImprimibles`) de los perfiles probados.

## Restricciones

- Piezas altas y esbeltas: activar «Slow Down at Height» en Bambu Studio.
- La A2L no muestra la malla de la cama; si hay problemas de nivelación, revisar a mano.
