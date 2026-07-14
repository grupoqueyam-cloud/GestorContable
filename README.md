# Control Editorial Sustainability

Aplicación web para consolidar y controlar clientes, contratos, procesos editoriales, cartera e investigadores. Está preparada para publicarse en **GitHub Pages** y utiliza **Google Sheets como base central opcional** mediante Google Apps Script.

## Funciones principales

- Dashboard con valor contratado, cartera pendiente, recaudación y procesos activos.
- Gestión completa de clientes, temas, contratos, revistas, indexación y responsables.
- Seguimiento de avance de 0 a 100 % por proceso.
- Control separado de pagos del cliente y honorarios del investigador.
- Próximos pagos, vencimientos, antigüedad de cartera y prioridades de recuperación.
- Búsqueda global y filtros por estado, investigador, indexación, riesgo y fechas.
- Credenciales de revista ocultas por defecto.
- Importación directa de los dos formatos Excel originales y de futuras versiones.
- Conciliación automática por número de contrato; si falta, por cliente y tema.
- Exportación de procesos y pagos a Excel.
- Respaldo y restauración mediante archivos JSON cifrados.
- Historial local de importaciones, creaciones, cambios y eliminaciones.
- Sincronización bidireccional con Google Sheets, manual o automática cada minuto.
- Control de revisiones, conciliación por ID y bloqueo de escrituras simultáneas.
- Hojas normalizadas para procesos, pagos de clientes, historial y eliminaciones.
- Diseño adaptable para computador, tableta y teléfono.

## Seguridad y almacenamiento

GitHub Pages publica archivos estáticos y no ofrece una base de datos. Esta versión combina una **bóveda local cifrada** con una **hoja central privada**:

- Los datos se cifran con AES-GCM de 256 bits antes de guardarse en el navegador.
- La contraseña se deriva mediante PBKDF2-SHA256 con 250.000 iteraciones.
- La base inicial incluida en `public/base-inicial.enc.json` también está cifrada.
- La clave de la base inicial no se almacena en este repositorio.
- Los Excel originales no forman parte del proyecto.
- La URL y la clave de Google Sheets también se guardan dentro de la bóveda cifrada.
- La aplicación sigue funcionando localmente cuando Google no está disponible.
- Antes de subir datos, descarga la revisión vigente, combina cambios y evita sobrescribir ediciones simultáneas.
- Los usuarios y contraseñas de revistas **no se sincronizan por defecto**; existe una opción explícita para incluirlos.

No publique Excel, respaldos descifrados, la URL configurada ni la clave de sincronización en el repositorio. Mantenga la hoja de Google restringida a las cuentas autorizadas.

## Conectar Google Sheets

El proyecto incluye el servicio completo en `google-apps-script/Code.gs`. Se utiliza una secuencia vinculada a la hoja; no hace falta habilitar Google Cloud ni crear credenciales OAuth manuales.

### 1. Crear la hoja y el servicio

1. Cree una hoja de cálculo vacía en Google Drive, por ejemplo **Control Editorial Sustainability**.
2. En la hoja, abra **Extensiones → Apps Script**.
3. Elimine el contenido de `Code.gs` y pegue todo el archivo `google-apps-script/Code.gs` de este proyecto.
4. Guarde el proyecto.
5. Abra **Configuración del proyecto → Propiedades de la secuencia de comandos**.
6. Cree la propiedad `SYNC_SECRET` con una clave aleatoria larga, idealmente de 32 caracteres o más. No la escriba en el código.
7. En el editor, seleccione la función `configurarHojas`, pulse **Ejecutar** y autorice el acceso a la hoja.

La función crea estas pestañas:

| Hoja | Contenido |
|---|---|
| `Procesos` | Clientes, contratos, revista, indexación, responsables, fechas, valores y avance. |
| `PagosCliente` | Detalle normalizado de cuotas, vencimientos, pagos y estados. |
| `Historial` | Trazabilidad de cambios y sincronizaciones. |
| `Eliminados` | Marcas de eliminación para conciliar varios equipos. |
| `Configuracion` | Versión del esquema y revisión actual. |

### 2. Publicar Apps Script

1. En Apps Script, seleccione **Implementar → Nueva implementación**.
2. Elija **Aplicación web**.
3. En **Ejecutar como**, seleccione su propia cuenta.
4. En **Quién tiene acceso**, seleccione **Cualquiera**. El servicio valida cada solicitud con `SYNC_SECRET`.
5. Pulse **Implementar** y copie la URL que termina en `/exec`; la URL de prueba `/dev` no sirve para GitHub Pages.

Google documenta este flujo en [Web Apps de Apps Script](https://developers.google.com/apps-script/guides/web). La clave se conserva con [PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service) y las escrituras simultáneas se protegen con [LockService](https://developers.google.com/apps-script/reference/lock).

### 3. Conectar la aplicación

1. Abra la aplicación y desbloquee la bóveda local.
2. Entre en **Google Sheets** desde el menú lateral.
3. Pegue la URL `/exec` y la misma clave configurada como `SYNC_SECRET`.
4. Pulse **Probar conexión**.
5. Pulse **Guardar** y después **Sincronizar ahora**. La primera sincronización cargará los registros existentes en la hoja.
6. Active **Sincronización automática** si quiere conciliar al abrir la sesión y cada minuto.

La sincronización es bidireccional. Se recomienda crear, editar y eliminar procesos desde la aplicación. Las ediciones directas en `Procesos` y `PagosCliente` actualizan la revisión automáticamente; para eliminar un proceso use la aplicación, así se registra su marca en `Eliminados`.

### Credenciales de revistas

La casilla **Incluir usuarios y contraseñas** está desactivada inicialmente. Si se activa, estos datos quedan visibles como celdas para cualquier persona con acceso a la hoja. Úsela únicamente con una hoja privada, permisos mínimos y cuentas de Google protegidas con verificación en dos pasos.

## Ejecutar localmente

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev:github
```

Abra la dirección local que aparece en la terminal. En el primer acceso:

1. Defina una contraseña local de al menos ocho caracteres.
2. Mantenga seleccionada la opción para cargar la base inicial conciliada.
3. Ingrese la clave de importación entregada por separado.
4. Cree un respaldo cifrado desde **Datos y respaldos**.

## Publicar en GitHub Pages

1. Cree un repositorio en GitHub y copie en él todo el proyecto.
2. Ejecute:

```bash
git init
git add .
git commit -m "Sistema de control editorial"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

3. En GitHub, abra **Settings → Pages**.
4. En **Build and deployment**, seleccione **GitHub Actions**.
5. El flujo incluido en `.github/workflows/deploy-pages.yml` compilará y publicará la aplicación.

La configuración usa rutas relativas, de modo que funciona con cualquier nombre de repositorio.

## Compilación manual

```bash
npm run build:github
```

El resultado se genera en `github-pages-dist/`. Esta carpeta es un artefacto temporal y no debe subirse al repositorio.

## Importar nuevas matrices

Desde **Datos y respaldos → Importar Excel**, seleccione uno o varios archivos `.xlsx`.

El importador reconoce:

- Matrices con una hoja por investigador y clientes por filas.
- Matrices de producción con conceptos por filas y clientes por columnas.
- Variantes de encabezados como `CONTRASEÑA`, `CONTRASENA`, `1re Pago`, `1 PAGO`, `REVISTA(S)` y otras presentes en las fuentes.

Antes de una importación masiva se recomienda crear un respaldo cifrado. La importación combina los datos y no elimina registros existentes.

## Estructura relevante

```text
app/                         interfaz para la vista de verificación
components/                  aplicación y componentes de gestión
google-apps-script/Code.gs   servicio de sincronización para Google Sheets
lib/                         modelo, cifrado, almacenamiento e importación
public/base-inicial.enc.json base inicial cifrada
src/main.tsx                 entrada estática para GitHub Pages
vite.github.config.ts        compilación estática
.github/workflows/           publicación automática
```

## Operación y recuperación

- La sincronización es periódica y por acción; no es edición en tiempo real celda a celda.
- Si un equipo queda sin conexión, puede seguir trabajando y conciliar cuando recupere acceso.
- Si se elimina el almacenamiento del navegador, la copia se puede recuperar conectando la misma hoja y sincronizando. La contraseña local olvidada no se puede recuperar porque no se guarda en ningún servidor.
- Los saldos y alertas dependen de que el total contratado, los pagos y las fechas estén completos.
- Cuando cambie `Code.gs`, cree una nueva versión de la implementación de Apps Script para que la URL `/exec` use el código actualizado.
