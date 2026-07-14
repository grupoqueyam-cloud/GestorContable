# Control Editorial Sustainability

Aplicación de control editorial, contractual y contable para publicar en **GitHub Pages**, con **Google Sheets como única base de datos**.

## Arquitectura

- GitHub Pages sirve únicamente la interfaz React.
- Google Sheets almacena clientes, contratos, cartera, pagos, investigadores, revistas, accesos e historial.
- Google Apps Script funciona como servicio protegido entre la web y la hoja.
- No se utiliza `localStorage`, IndexedDB, cookies de datos ni una base incluida en el repositorio.
- La URL puede preconfigurarse públicamente; `SYNC_SECRET` nunca debe escribirse en GitHub.
- La clave se solicita al abrir la aplicación, permanece únicamente en memoria y desaparece al cerrar o recargar la página.
- Cada creación, edición, eliminación e importación se confirma en Google Sheets antes de actualizar la pantalla.

## Funciones

- Dashboard con valor contratado, cartera, recaudación y procesos activos.
- Clientes, temas, contratos, revistas, indexación e investigadores.
- Avance de 0 a 100 %.
- Pagos de clientes, próximos vencimientos y recuperación de cartera.
- Honorarios y pagos de investigadores.
- Búsqueda global y filtros por estado, responsable, indexación, riesgo y fechas.
- Gráficas de estado y antigüedad de cartera.
- Importación de las matrices Excel suministradas.
- Exportación de reportes a Excel.
- Sincronización automática y control de revisiones simultáneas.
- Marcas de eliminación para evitar que registros borrados reaparezcan.

## Configuración de Google Sheets

### 1. Crear la hoja

1. Cree una hoja vacía en Google Drive con el nombre **Control Editorial Sustainability**.
2. En esa hoja abra **Extensiones → Apps Script**.
3. Elimine el contenido de `Code.gs`.
4. Copie y pegue todo el archivo `google-apps-script/Code.gs` incluido en este proyecto.
5. Guarde el proyecto.

### 2. Crear la clave privada

1. En Apps Script abra **Configuración del proyecto**.
2. Busque **Propiedades de la secuencia de comandos**.
3. Cree una propiedad con:

```text
Nombre: SYNC_SECRET
Valor: una clave privada larga de 32 caracteres o más
```

Ejemplo de formato — no use literalmente este valor:

```text
Sust-2026-cambiar-esta-clave-privada-9x7k
```

No coloque esta clave en `cloud-config.json`, GitHub, capturas o mensajes públicos.

### 3. Crear las pestañas

1. En el selector de funciones de Apps Script elija `configurarHojas`.
2. Pulse **Ejecutar**.
3. Autorice el acceso solicitado por Google.

Se crearán:

| Hoja | Contenido |
|---|---|
| `Procesos` | Datos editoriales, contractuales, financieros y responsables. |
| `PagosCliente` | Cuotas, pagos, fechas, valores y estados. |
| `Historial` | Registro de importaciones, ediciones y sincronizaciones. |
| `Eliminados` | Identificadores borrados para conciliación entre sesiones. |
| `Configuracion` | Revisión y versión del esquema. |

### 4. Publicar Apps Script

1. Seleccione **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**.
4. Quién tiene acceso: **Cualquiera**.
5. Pulse **Implementar**.
6. Copie la URL terminada en `/exec`.

La URL `/dev` es solo de prueba y no funciona para los usuarios de GitHub Pages. Consulte la guía oficial de [aplicaciones web de Apps Script](https://developers.google.com/apps-script/guides/web).

### 5. Preconfigurar la URL en GitHub

Edite `public/cloud-config.json`:

```json
{
  "webAppUrl": "https://script.google.com/macros/s/IDENTIFICADOR/exec"
}
```

Esta URL puede ser pública. La clave `SYNC_SECRET` debe quedar vacía y se ingresa en la pantalla de conexión cada vez que se abre el sistema.

También puede dejar la URL vacía y pegarla manualmente en cada sesión:

```json
{
  "webAppUrl": ""
}
```

## Carga inicial de los Excel

Después de publicar y conectarse:

1. Abra **Importar y exportar**.
2. Pulse **Seleccionar archivos**.
3. Seleccione `MATRIZ PRODUCCION SUST 2025.xlsx` y `CONTROL CLIENTES(3).xlsx`.
4. Espere el mensaje de confirmación.
5. Revise las pestañas `Procesos` y `PagosCliente` en Google Sheets.

Los Excel se procesan temporalmente en memoria y no quedan almacenados por la aplicación ni se publican en GitHub.

## Publicar en GitHub Pages

La carpeta `docs` incluida en el ZIP ya contiene JavaScript compilado. **No publique la raíz del repositorio**, porque `src/main.tsx` es código fuente y GitHub Pages lo entregaría con un MIME incorrecto.

### Opción directa, sin instalar ni compilar

1. Cree un repositorio y copie todo el contenido del proyecto, incluida la carpeta `docs`.
2. Ejecute:

```bash
git init
git add .
git commit -m "Sistema de control editorial con Google Sheets"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

3. Abra **Settings → Pages** en GitHub.
4. En **Build and deployment**, elija **Deploy from a branch**.
5. Seleccione la rama `main`, carpeta `/docs` y pulse **Save**.

También puede elegir **GitHub Actions**; el flujo `.github/workflows/deploy-pages.yml` recompilará y publicará la misma carpeta.

Si aparece `Expected a JavaScript-or-Wasm module ... application/octet-stream`, GitHub Pages está apuntando a `/ (root)`. Cámbielo a `/docs` o seleccione **GitHub Actions**.

## Ejecutar localmente para desarrollo

Requiere Node.js 22 o superior:

```bash
npm install
npm run dev:github
```

Compilación estática:

```bash
npm run build:github
```

## Seguridad

- Mantenga Google Sheets restringido a las cuentas autorizadas.
- Use una clave `SYNC_SECRET` larga y rótela si sospecha que fue expuesta.
- El servicio guarda la clave con `PropertiesService` y protege escrituras simultáneas mediante `LockService`.
- Los usuarios y contraseñas de revistas no se descargan por defecto. Active esa opción únicamente si la hoja es privada.
- Toda persona con acceso a la hoja podrá leer las celdas de credenciales si decide sincronizarlas.
- La aplicación no puede funcionar sin conexión: si Google Sheets no responde, no se confirma ningún cambio.

Documentación oficial: [PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service) y [LockService](https://developers.google.com/apps-script/reference/lock).

## Archivos principales

```text
components/editorial-app.tsx       interfaz y operaciones remotas
lib/google-sheets.ts               cliente de sincronización
google-apps-script/Code.gs         servicio para la hoja
public/cloud-config.json           URL pública opcional de Apps Script
docs/                              sitio JavaScript listo para GitHub Pages
.github/workflows/deploy-pages.yml publicación automática
```
