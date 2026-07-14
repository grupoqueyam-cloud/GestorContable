# Gestor Contable — paquete directo para GitHub Pages

Este paquete ya está compilado. El archivo `index.html` de la raíz carga JavaScript desde `assets/` y no intenta abrir archivos `.tsx`.

## Publicación

1. Reemplace el contenido actual del repositorio con **el contenido de esta carpeta**.
2. Confirme que `index.html`, `assets/`, `.nojekyll`, `cloud-config.json` y `favicon.svg` estén en la raíz del repositorio.
3. En **Settings → Pages → Build and deployment**, elija **Deploy from a branch**.
4. Seleccione `main` y `/ (root)`; después pulse **Save**.
5. Espere la publicación y recargue con `Ctrl + F5`.

La URL pública de Apps Script puede colocarse en `cloud-config.json`. No escriba allí `SYNC_SECRET`.

El código fuente completo está en `source-project/` y el servicio para Google Sheets está en `google-apps-script/Code.gs`.
