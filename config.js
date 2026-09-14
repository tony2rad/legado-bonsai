/* ==========================================================================
   Legado Bonsai — configuración compartida (tienda + app de registro)
   Este es el ÚNICO archivo que hay que editar al conectar el sitio con el
   Google Sheet. Se carga antes de script.js y de admin/admin.js.
   ========================================================================== */

window.LEGADO_CONFIG = {
  /* URL del Web App de Apps Script (termina en /exec). Se obtiene al
     implementar apps-script/Code.gs — ver apps-script/INSTALACION.md.
     Mientras esté vacía, la tienda usa SHEET_CSV_URL como respaldo. */
  API_URL: 'https://script.google.com/macros/s/AKfycbyOZMc13j6L_HPrwCeL2o0mS3Kub64UKCZeMpXnSCfNOFSOUc9gnMorqsFeAgHkq2RE/exec',

  /* Respaldo cuando API_URL está vacía o falla.
     HOY apunta a la hoja antigua "productos" para que la tienda siga
     funcionando hasta que conectes el Sistema de Gestión. Cuando API_URL
     esté configurada, reemplaza esto por la pestaña CATALOGO publicada como
     CSV (Archivo → Compartir → Publicar en la web → CATALOGO → CSV) o
     déjalo vacío ''. */
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7aPPBgI7Z-jHXECrFKBI9gbYMJiSHOYOyZiMqlzNEckqxuatlIeDuOhgyx2MEamadhFFqD4pk64hQ/pub?gid=1316703737&single=true&output=csv',

  /* Número de WhatsApp de la tienda (código de país sin +). */
  WHATSAPP_NUMBER: '593988731431',

  /* Fotos de respaldo dentro del repo: imagenes/360/<Carpeta imagen>/ */
  LOCAL_IMAGES_PATH: 'imagenes/360/'
};
