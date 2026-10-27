# Estudio STL: paquete para el otro computador

## Qué trae
| Carpeta | Contenido |
|---|---|
| `app/estudio3d.html` | El generador: se abre en Chrome o Edge y necesita internet para cargar el motor 3D |
| `app/servidor.py` | Servidor local que además guarda en `app/export/` lo que la página envía |
| `stl/` | Los 9 STL para imprimir, ya generados en alta resolución y en mm |
| `stl/referencia/` | Las 3 piezas de yeso que obtendrás. **No se imprimen**; sirven para comparar |
| `parametros/parametros_barbotina.json` | Las medidas usadas, para importarlas en el generador |
| `docs/DOCUMENTACION_TECNICA.md` | Todo el desarrollo: decisiones, verificaciones y pendientes |
| `docs/cortes_molde_yeso.html` | Los 10 cortes del molde y las pruebas de desmoldeo |
| `docs/memoria_claude.md` | Lo que Claude recordaba de este proyecto |
| `CLAUDE.md` | Instrucciones para que Claude siga el proyecto en el otro computador |

## Instalar en el otro computador
1. Copia esta carpeta dentro de tu proyecto grande, por ejemplo en `proyecto/estudio3d/`. Deja `CLAUDE.md` en la raíz de esta carpeta. Si tu proyecto ya tiene un `CLAUDE.md`, agrega al tuyo una línea que apunte a este.
2. Instala **Bambu Studio** (gratis, de bambulab.com) y elige la impresora **A2L**.
3. Instala **Python 3** si no lo tienes. Solo hace falta para abrir el generador con un servidor local.
4. Abre el generador con este comando, ejecutado en la carpeta `app`:

```bash
python -m http.server 8765
```

5. En el navegador, entra a `http://127.0.0.1:8765/estudio3d.html`.
6. En el generador, usa **Importar .json** y elige `parametros/parametros_barbotina.json`.

## Imprimir
- Las piezas a imprimir son las de `stl/`. Las tablas inferior, superior y de extremo se usan para las dos paredes. La de extremo se imprime **2 veces**.
- Material: PLA para las cajas. Lija y sella las caras que tocan el yeso, y aplica desmoldante.
- Mira la vista **"▶ Animación del armado"** antes de armar.
