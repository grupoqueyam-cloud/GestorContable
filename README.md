# Gestor Contable y Control Editorial Sustainability

Sistema web para controlar clientes, contratos, procesos editoriales, recuperación de cartera, pagos, investigadores, revistas y credenciales de acceso. La interfaz se publica en GitHub Pages y Google Sheets funciona como la única base de datos persistente.

## 1. Estado del software

El software está compilado y listo para publicarse. No necesita instalar Node.js, ejecutar comandos ni mantener un servidor propio para usarlo.

Para funcionar completamente requiere:

1. Publicar los archivos compilados en GitHub Pages.
2. Usar la hoja de cálculo de Google ya configurada o crear una nueva.
3. Instalar el archivo `google-apps-script/Code.gs` dentro de esa hoja.
4. Configurar una clave privada `SYNC_SECRET`.
5. Publicar Apps Script como aplicación web y conectar su URL `/exec` con la interfaz.
6. Importar los dos archivos Excel iniciales únicamente si todavía no existen esos registros en Google Sheets.

## 2. Arquitectura

```mermaid
flowchart LR
    U[Usuario] --> P[GitHub Pages]
    P --> A[Google Apps Script]
    A --> S[Google Sheets]
    S --> A
    A --> P
```

- **GitHub Pages:** aloja solamente HTML, CSS y JavaScript.
- **Google Apps Script:** valida la clave, recibe consultas y controla escrituras simultáneas.
- **Google Sheets:** almacena permanentemente todos los procesos y pagos.
- **Navegador:** mantiene temporalmente la sesión y los datos visibles. No utiliza `localStorage`, IndexedDB ni una base local.

La URL de Apps Script puede estar publicada en `cloud-config.json`. La clave `SYNC_SECRET` nunca debe subirse a GitHub; se ingresa en cada sesión y desaparece al cerrar o recargar la página.

## 3. Funciones incluidas

- Dashboard general con procesos, cartera, recaudación y estados.
- Módulo independiente de clientes que agrupa todos sus contratos.
- Creación de un nuevo contrato para el mismo cliente con sus datos precargados.
- Formato único con todas las secciones del proceso.
- Control de contratos con fecha de inicio obligatoria, fecha de fin opcional y enlace al documento.
- Catálogo central de investigadores y selector de responsables.
- Catálogo central de vendedores y selector de vendedor activo.
- Historial completo de todos los investigadores que han participado en cada proceso.
- Procesos agrupados por investigador, incluidas asignaciones actuales e históricas.
- Modalidad de pago del investigador: pago único o dos abonos, con valores, fechas y estados independientes.
- Estado editorial con avance automático: por asignar/pendiente 0 %, elaboración 25 %, enviado a la revista 50 %, revisión pares 75 % y publicado/finalizado 100 %.
- Producto desplegable: Latindex, Scielo, Scopus, WoS, Tesis pregrado, Monografía, Tesis Doctoral, Tesis Postgrado, Fast Track, Scielo FastTrack o Latindex FastTrack.
- Indexación desplegable: Latindex, Scielo, Q4, Q3, Q2, Q1, Tesis pregrado, Monografía, Tesis Doctoral, Tesis Postgrado, Fast Track, Scielo FastTrack o Latindex FastTrack.
- Tipo de cliente: nuevo, existente o recomendado. Los clientes nuevos permiten registrar el medio de contacto y las recomendaciones permiten identificar a quien lo recomendó.
- País de procedencia del cliente.
- Registro de vendedor, fecha, canal e información de ventas.
- Canales de venta: Facebook, Instagram, TikTok, Recomendación, Fidelización o WhatsApp.
- Varias revistas por proceso, cada una con enlace, usuario y contraseña.
- Control de APC mediante opción sin APC/con APC y valor condicional.
- Datos de contacto e identificación del cliente.
- Factura del investigador con número, fecha, valor, estado y enlace.
- Archivos enlazados desde Google Drive con vista previa cuando Drive lo permite.
- Prioridad operativa: normal, urgente, estancado o espera del cliente.
- Avance gráfico entre 0 y 100 %.
- Pagos del cliente, cuotas, saldos y próximo vencimiento. Los abonos reales alimentan recaudación y se descuentan automáticamente de cartera, incluso si un registro antiguo conservaba un estado incorrecto.
- Recuperación y antigüedad de cartera.
- Asignación y pago de investigadores.
- Alertas por pagos o fechas vencidas.
- Búsqueda global y filtros combinados.
- Importación de archivos Excel.
- Exportación de informes a Excel.
- Registro de actividad e historial.
- Sincronización automática cada 20 minutos.
- Dashboard ampliado con gráficas de estado, productos, indexaciones, canales, tipos de cliente, vendedores, pagos y cartera.
- Conciliación por ID y control de revisiones simultáneas.
- Eliminaciones persistentes para impedir que registros borrados reaparezcan.

## 4. Información administrada

Cada proceso puede contener:

- ID.
- Cliente.
- Tema y producto.
- Pagos y saldo pendiente.
- Fecha y valor del próximo pago.
- Indexación.
- Estado editorial.
- Una o varias revistas, enlaces públicos, enlaces de acceso, usuarios y contraseñas.
- Condición de APC y valor, cuando aplique.
- Investigador actual e historial ilimitado de responsables anteriores, cada uno con inicio y fin de su asignación.
- Fecha de inicio y fin del contrato, además de las fechas del proceso y aceptación.
- Honorarios con modalidad de pago único o dos abonos por cada investigador, además de su factura.
- Vendedor seleccionado desde el catálogo, canal, fecha de venta, tipo de cliente e información comercial.
- País, medio de contacto y persona que recomendó al cliente, cuando corresponda.
- Número de contrato, enlace del contrato y orden de producción.
- Total contratado con el cliente.
- Correo, documento, teléfono, dirección e institución del cliente.
- Enlaces y vista previa de archivos almacenados en Google Drive.
- Prioridad operativa.
- Avance porcentual.
- Observaciones y fuentes de importación.

## 5. Publicación en GitHub Pages

### 5.1. Reemplazar los archivos anteriores

1. Descomprima `GestorContable.zip`.
2. Abra la carpeta `GestorContable`.
3. Suba **el contenido interno de esa carpeta** al repositorio `GestorContable`.
4. Reemplace el `index.html` anterior.
5. Confirme que en la raíz del repositorio existan:

```text
index.html
assets/
cloud-config.json
favicon.svg
.nojekyll
README.md
google-apps-script/
source-project/
```

El `index.html` correcto debe cargar un archivo similar a:

```html
<script type="module" src="./assets/index-XXXXXXXX.js"></script>
```

No debe contener:

```html
<script type="module" src="./src/main.tsx"></script>
```

### 5.2. Activar Pages

1. Abra el repositorio en GitHub.
2. Entre en **Settings → Pages**.
3. En **Build and deployment**, seleccione **Deploy from a branch**.
4. Seleccione la rama `main`.
5. Seleccione la carpeta `/ (root)`.
6. Pulse **Save**.
7. Espere entre uno y tres minutos.
8. Abra la URL publicada y recargue con `Ctrl + F5`.

Para este repositorio, la dirección esperada tiene el formato:

```text
https://grupoqueyam-cloud.github.io/GestorContable/
```

## 6. Actualizar o crear la base en Google Sheets

### Si ya utiliza la versión anterior

1. Antes de actualizar, abra Google Sheets y use **Archivo → Hacer una copia** como respaldo.
2. Abra **Extensiones → Apps Script** en la misma hoja que ya utiliza.
3. Reemplace completamente el contenido anterior de `Code.gs` con `google-apps-script/Code.gs` de este paquete.
4. Guarde y ejecute la función `configurarHojas`.
5. La migración conserva procesos, pagos, clientes, contratos, credenciales, revistas e historiales existentes. El esquema 6 agrega al final las columnas de recaudación y estado de pago sin borrar ni reordenar las columnas anteriores.
6. Los investigadores actuales y anteriores existentes se incorporan automáticamente al catálogo y al historial de su proceso. Cuando el archivo anterior no contiene honorarios o fechas del responsable anterior, esos datos quedan marcados para revisión sin inventar valores de pago.
7. El valor anterior pagado al investigador se distribuye, sin perderlo, entre los dos abonos del registro migrado. Después puede cambiar la modalidad a pago único.
8. Los pagos antiguos marcados como `pagado` reciben automáticamente el mismo importe en `Valor pagado`. Los abonos que ya tengan un `Valor pagado` se reconocen aunque su estado antiguo diga pendiente; cartera, recaudación y saldo se recalculan.
9. Si un contrato no tiene filas en `PagosCliente`, pero conserva un total y un saldo menor —por ejemplo, total 1.350 y saldo 750— la migración registra automáticamente el pago histórico de 600.
10. Contratos, órdenes, documentos, teléfonos y números de factura se formatean como texto para conservar los ceros iniciales. Los ceros que Google Sheets ya hubiera eliminado deben escribirse nuevamente después de actualizar.
11. Revise manualmente las fechas históricas y la distribución de pagos cuando el contrato anterior no contenga suficiente detalle.
12. Publique una nueva versión de la misma implementación web como se explica en la sección 9.

No cree otra hoja ni cambie `SYNC_SECRET` o `cloud-config.json` si desea conservar la conexión existente.

### Si instala el sistema por primera vez

1. Ingrese a Google Drive.
2. Cree una hoja de cálculo vacía.
3. Coloque como nombre, por ejemplo, `Base central Gestor Contable`.
4. Mantenga la hoja restringida a las cuentas autorizadas.
5. Abra **Extensiones → Apps Script**.
6. En el editor, elimine el código de ejemplo.
7. Copie todo el contenido de `google-apps-script/Code.gs`.
8. Péguelo en el archivo `Code.gs` de Google y guarde.

## 7. Configurar la clave privada

1. En Apps Script abra **Configuración del proyecto**.
2. Busque **Propiedades de la secuencia de comandos**.
3. Pulse **Añadir propiedad**.
4. Configure:

```text
Propiedad: SYNC_SECRET
Valor: una clave privada larga de al menos 32 caracteres
```

Ejemplo de estructura — no utilice literalmente esta clave:

```text
Sust-Control-2026-cambiar-clave-7Kp9-Xm4Q
```

No coloque esta clave en GitHub, `cloud-config.json`, correos públicos o capturas.

## 8. Crear las pestañas de la base

1. En la parte superior de Apps Script seleccione la función `configurarHojas`.
2. Pulse **Ejecutar**.
3. Google solicitará autorización la primera vez.
4. Seleccione la cuenta propietaria de la hoja.
5. Revise los permisos y pulse **Permitir**.

La función creará las siguientes pestañas:

| Pestaña | Función |
|---|---|
| `Procesos` | Clientes, contratos, datos editoriales, total, recaudación calculada, cartera, estado de pago, investigadores y credenciales. |
| `PagosCliente` | Cuotas, valor previsto, valor efectivamente pagado, fechas y estados. |
| `Historial` | Registro de importaciones, ediciones y sincronizaciones. |
| `Eliminados` | Identificadores borrados y fecha de eliminación. |
| `Configuracion` | Versión del esquema y número de revisión. |
| `Investigadores` | Catálogo de responsables, contacto, especialidad, vigencia y carpeta de Drive. |
| `Vendedores` | Catálogo de vendedores, datos de contacto y vigencia. |
| `Clientes` | Vista consolidada de clientes, país, origen, referido, clasificación, vendedor, contratos, valores y cartera. |
| `HistorialInvestigadores` | Una fila por cada investigador que haya participado en un proceso, incluyendo modalidad de pago y abonos. |

No cambie los nombres ni los encabezados de la primera fila. `Clientes` e `HistorialInvestigadores` son vistas consolidadas generadas por el sistema; los cambios deben realizarse desde la aplicación.

## 9. Publicar Google Apps Script

1. En Apps Script pulse **Implementar → Nueva implementación**.
2. En tipo de implementación, seleccione **Aplicación web**.
3. En **Ejecutar como**, seleccione **Yo**.
4. En **Quién tiene acceso**, seleccione **Cualquiera**.
5. Pulse **Implementar**.
6. Copie la URL generada que termina en `/exec`.

Ejemplo:

```text
https://script.google.com/macros/s/IDENTIFICADOR/exec
```

No use la URL `/dev`. Si la cuenta empresarial no permite seleccionar **Cualquiera**, el administrador de Google Workspace debe habilitarlo; de lo contrario, GitHub Pages no podrá consultar el servicio sin iniciar sesión en Google.

Cuando modifique `Code.gs`, abra **Implementar → Gestionar implementaciones**, edite la implementación existente, seleccione **Nueva versión** y vuelva a implementar. Al editar la misma implementación, la URL `/exec` normalmente se conserva y no necesita cambiar `cloud-config.json`.

## 10. Preconfigurar la URL

Edite el archivo `cloud-config.json` ubicado en la raíz del repositorio:

```json
{
  "webAppUrl": "https://script.google.com/macros/s/IDENTIFICADOR/exec"
}
```

Guarde el cambio en la rama `main`. Esta URL no es una contraseña y puede publicarse.

También puede dejarla vacía y pegar la URL manualmente al abrir el sistema:

```json
{
  "webAppUrl": ""
}
```

## 11. Primera conexión

1. Abra la página de GitHub Pages.
2. Verifique o pegue la URL `/exec` de Apps Script.
3. Ingrese la misma clave definida como `SYNC_SECRET`.
4. Active **Cargar usuarios y contraseñas de revistas** únicamente si necesita ver o modificar esas columnas.
5. Pulse **Conectar y abrir sistema**.

La aplicación consultará Google Sheets. Si la clave es correcta, abrirá el dashboard. Si la hoja está vacía, el sistema mostrará cero procesos hasta realizar la importación.

## 12. Importar los Excel iniciales

1. Conecte primero la aplicación con Google Sheets.
2. Abra **Importar y exportar**.
3. Pulse **Seleccionar archivos**.
4. Seleccione simultáneamente:

```text
MATRIZ PRODUCCION SUST 2025.xlsx
CONTROL CLIENTES(3).xlsx
```

5. Espere la confirmación de guardado.
6. Revise las pestañas `Procesos` y `PagosCliente` en Google Sheets.

Los Excel se leen temporalmente en la memoria del navegador y sus datos se consolidan por ID y campos equivalentes. Los archivos originales no se suben a GitHub ni quedan guardados en el navegador.

## 13. Uso diario

### Crear un proceso

1. Pulse **Nuevo proceso**.
2. Si el responsable o vendedor todavía no existe, cierre el formato y agréguelo desde **Investigadores** o **Vendedores**.
3. Complete el formato organizado en datos del cliente, vendedor, contrato/editorial, investigador, revistas, información económica, archivos y notas.
4. Seleccione la prioridad operativa.
5. Registre tipo de cliente, vendedor, canal de venta, revistas, APC, pagos, factura del investigador y archivos de Drive según corresponda.
6. Pulse **Guardar en Google Sheets**.

La pantalla se actualiza solo después de que Google Sheets confirma la escritura.

### Agregar otro contrato al mismo cliente

1. Abra el módulo **Clientes**.
2. Localice al cliente y pulse **Nuevo contrato**.
3. El sistema copiará únicamente su identificación y datos de contacto; el contrato, proceso, pagos e investigadores comenzarán vacíos.
4. También puede usar **Guardar y añadir otro contrato** al finalizar cualquier registro.

### Editar o eliminar

- Abra el registro desde la tabla.
- Modifique la información y guarde.
- Para eliminar, utilice el botón correspondiente y confirme.
- Las eliminaciones quedan registradas en `Eliminados`.

### Cartera

- Registre el total contratado.
- Use **Registrar abono recibido** para cada cobro o **Añadir cuota pendiente** para programar un pago futuro.
- Escriba el valor efectivamente recibido en `Valor recibido`; el sistema asigna pendiente, parcial o pagado según el valor.
- El saldo pendiente se calcula como total contratado menos recaudación registrada. Si el pago cubre el total, el saldo y el próximo valor quedan en cero.
- El dashboard y las gráficas recalculan los indicadores automáticamente.

### Investigadores

- Abra **Investigadores → Nuevo investigador** para administrar el catálogo central.
- Solo los investigadores activos aparecen en el selector de nuevos procesos.
- Cada ficha agrupa las asignaciones actuales e históricas y muestra fechas, avance, cartera, honorarios y pagos pendientes.
- Al cambiar de responsable, utilice **Añadir investigador** dentro del proceso; no reemplace la entrada anterior.
- Cada asignación permite elegir `Pago único` o `Dos abonos`. En ambos casos se registran valor previsto, valor pagado, fechas y estado.
- Los investigadores desactivados no se eliminan y permanecen asociados a sus registros históricos.

### Vendedores

- Abra **Vendedores → Nuevo vendedor** para administrar el catálogo.
- Solo los vendedores activos aparecen al crear o editar procesos; los desactivados permanecen en el historial.
- Cada ficha agrupa clientes, contratos, valor contratado, recaudación y cartera del vendedor.

### Búsqueda y filtros

La búsqueda revisa cliente, tema, producto, contrato, revista, investigador, estado, prioridad, institución e indexación. Los filtros permiten combinar estado, prioridad, responsable, indexación, riesgo de cartera y rango de fechas contractuales.

### Exportación

Desde **Importar y exportar**, pulse **Descargar Excel**. El informe contiene `Procesos`, `Pagos cliente`, `Clientes`, `Investigadores`, `Vendedores` e `Historial investigadores`.

## 14. Sincronización y trabajo simultáneo

- El sistema sincroniza automáticamente al abrir la sesión y después cada 20 minutos.
- Cada creación, edición, eliminación o importación se guarda inmediatamente.
- Apps Script utiliza un bloqueo para evitar escrituras simultáneas incompatibles.
- La pestaña `Configuracion` mantiene un número de revisión.
- Si otra persona modificó la hoja, el sistema vuelve a descargar y conciliar los registros.
- La conciliación utiliza el ID y la fecha `Actualizado`.
- Si Google Sheets no responde, el cambio no se confirma en la interfaz.

## 15. Seguridad

- Mantenga Google Sheets privado.
- Comparta la hoja solo con personal autorizado.
- Use una clave `SYNC_SECRET` única y extensa.
- Cambie la clave si sospecha que fue expuesta.
- No guarde la clave en archivos del repositorio.
- La clave permanece únicamente en la memoria de la pestaña abierta.
- Los usuarios y contraseñas de revistas se almacenan como celdas legibles para las personas con acceso a la hoja.
- Desactive la opción de credenciales cuando no sea necesario consultarlas.
- Los archivos de Drive no se copian al sistema: se guarda únicamente su enlace. La vista previa respeta los permisos definidos en Google Drive.
- GitHub Pages es público; la protección de los datos depende de Apps Script y `SYNC_SECRET`.

La versión actual utiliza una clave compartida para abrir la base. No incorpora cuentas individuales ni roles de acceso por empleado.

## 16. Solución de problemas

### Pantalla en blanco y error `application/octet-stream`

Causa: GitHub está publicando un `index.html` que intenta cargar `src/main.tsx`.

Solución:

1. Use este paquete `GestorContable.zip`.
2. Reemplace el `index.html` de la raíz.
3. Suba la carpeta `assets` completa.
4. Configure Pages en `main` y `/ (root)`.
5. Recargue con `Ctrl + F5`.

### Error 404 en `favicon.svg`

Confirme que `favicon.svg` esté junto a `index.html` en la raíz.

### La página continúa mostrando la versión anterior

- Espere entre uno y tres minutos después del cambio.
- Recargue con `Ctrl + F5`.
- Pruebe una ventana de incógnito.
- Revise **Settings → Pages** para confirmar la rama y carpeta.

### URL de Apps Script inválida

Use la URL de implementación terminada en `/exec`, no la URL del editor ni `/dev`.

### Clave incorrecta

El valor ingresado debe coincidir exactamente con `SYNC_SECRET`. Revise espacios al inicio o final.

### Google no devuelve JSON

- Verifique que la implementación sea una **Aplicación web**.
- Confirme **Ejecutar como: Yo**.
- Confirme **Acceso: Cualquiera**.
- Asegúrese de usar `/exec`.
- Si modificó el código, cree una nueva versión de la implementación.

### La hoja abre, pero no aparecen registros

- Ejecute `configurarHojas`.
- Verifique las pestañas creadas.
- Importe los Excel desde la aplicación.
- Revise que los encabezados no hayan sido modificados.

### La aplicación pide actualizar el esquema

El sitio nuevo requiere el esquema 6. Reemplace completamente `Code.gs`, ejecute `configurarHojas` y publique una **nueva versión** de la implementación web. Al abrir la URL `/exec` debe aparecer `"schemaVersion":6`. Después recargue GitHub Pages con `Ctrl + F5`.

### Un archivo de Drive no muestra vista previa

- Confirme que el enlace sea de Google Drive, Docs, Sheets o Slides.
- Revise que la cuenta del usuario tenga permiso para abrirlo.
- Algunos formatos o políticas de Google Workspace bloquean la inserción; en ese caso utilice **Abrir** para verlo en una pestaña nueva.

### No aparecen usuarios ni contraseñas

Cierre la sesión, vuelva a conectarse y active **Cargar usuarios y contraseñas de revistas**. Por seguridad, la opción está desactivada inicialmente.

## 17. Estructura del paquete

```text
GestorContable/
├── index.html                 página compilada para GitHub Pages
├── assets/                    JavaScript, ExcelJS y estilos compilados
├── cloud-config.json          URL pública de Apps Script
├── favicon.svg                icono del sitio
├── .nojekyll                  evita procesamiento de Jekyll
├── README.md                  este manual
├── google-apps-script/
│   └── Code.gs                servicio de Google Sheets
└── source-project/            código fuente completo de React y TypeScript
```

## 18. Actualizaciones y respaldos

- Para actualizar únicamente la URL de Google, edite `cloud-config.json`; no necesita recompilar.
- Para cambiar la estructura de Sheets, modifique `Code.gs` y publique una nueva versión de Apps Script.
- Para actualizar la interfaz, trabaje dentro de `source-project`, ejecute `npm install` y `npm run build`, y copie el contenido generado en `source-project/docs/` a la raíz del repositorio.
- Para respaldar la base, utilice **Archivo → Hacer una copia** en Google Sheets o descargue el reporte desde la aplicación.

## 19. Comprobación final

El sistema está correctamente configurado cuando:

- La URL de GitHub Pages muestra la pantalla de conexión.
- La consola no intenta descargar `src/main.tsx`.
- `favicon.svg`, los archivos de `assets/` y `cloud-config.json` responden sin error 404.
- La URL `/exec` acepta la clave.
- Se crean las nueve pestañas de Google Sheets, incluidas `Clientes`, `Investigadores`, `Vendedores` e `HistorialInvestigadores`.
- Los Excel se importan y aparecen en `Procesos`.
- Un investigador nuevo aparece en el selector del formato de procesos.
- Un vendedor nuevo aparece en el selector y sus contratos se agrupan en su ficha.
- Un cliente muestra todos sus contratos y permite crear otro con sus datos precargados.
- Cada proceso conserva el historial de investigadores y cada asignación permite pago único o dos abonos.
- Los pagos totalmente cubiertos muestran saldo cero y no aparecen como cartera pendiente.
- El dashboard presenta gráficas de productos, indexaciones, ventas, clientes, vendedores y pagos.
- Un proceso admite más de una revista y más de un archivo de Drive.
- Un registro nuevo aparece inmediatamente en la hoja.
- Al recargar la página, se solicita nuevamente la clave y los datos vuelven a descargarse desde Google Sheets.
