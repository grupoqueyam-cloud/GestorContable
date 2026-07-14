# Control Editorial Sustainability

Aplicación web para consolidar y controlar clientes, contratos, procesos editoriales, cartera e investigadores. Está preparada para publicarse en **GitHub Pages** y funciona sin servidor propio.

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
- Diseño adaptable para computador, tableta y teléfono.

## Seguridad y almacenamiento

GitHub Pages publica archivos estáticos y no ofrece una base de datos. Por eso esta versión usa una **bóveda local cifrada**:

- Los datos se cifran con AES-GCM de 256 bits antes de guardarse en el navegador.
- La contraseña se deriva mediante PBKDF2-SHA256 con 250.000 iteraciones.
- La base inicial incluida en `public/base-inicial.enc.json` también está cifrada.
- La clave de la base inicial no se almacena en este repositorio.
- Los Excel originales no forman parte del proyecto.
- Cada navegador mantiene su propia copia; para moverla a otro equipo se utiliza **Respaldo cifrado**.

No publique Excel, respaldos descifrados o contraseñas en el repositorio. Si se requiere trabajo simultáneo desde varios equipos con una única base central, será necesario añadir un servicio autenticado como Supabase, Firebase o una API propia.

## Ejecutar localmente

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev
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
npm run build
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
components/                  aplicación y componentes de gestión
lib/                         modelo, cifrado, almacenamiento e importación
public/base-inicial.enc.json base inicial cifrada
src/main.tsx                 entrada estática para GitHub Pages
src/styles.css               diseño adaptable
vite.config.ts               compilación estática
.github/workflows/           publicación automática
```

## Limitaciones conocidas

- El almacenamiento es local por navegador, no colaborativo en tiempo real.
- Si se elimina el almacenamiento del navegador sin tener respaldo, se pierde esa copia local.
- La aplicación no puede recuperar una contraseña olvidada porque no la guarda en ningún servidor.
- Los saldos y alertas dependen de que el total contratado, los pagos y las fechas estén completos.
