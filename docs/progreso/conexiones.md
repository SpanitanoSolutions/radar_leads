# Progreso — Conexiones reales

Las conexiones se habilitan **de a una**: se configura, se prueba de punta a punta y recién después sigue la próxima (decisión del 29/10/2026). Orden elegido por Julian el 30/10/2026:

1. **Gmail**: en curso.
2. **Google Calendar**: mismo proyecto de Google.
3. **WhatsApp**.
4. **Compañías aseguradoras**: más adelante, en otra sesión.

**Decisiones de Julian (30/10/2026):**
- Arranca Gmail: gratis, se configura en un rato y destraba Cotización, Siniestros, Conciliador, Cobranza (empresas) y los avisos del Validador.
- Los correos salen de una cuenta **@gmail.com** (no Workspace ni otro proveedor): alcanza con el OAuth que ya había.
- Calendar pone **los vencimientos, un evento por día**: cada mañana carga los próximos 30 días, un evento de día completo por fecha con las pólizas que vencen ese día; si una se renueva, se saca.

## 1. Gmail

Rama `feat/conexion-gmail`, sale de `main` en `7f13fa3` (con el PR #36). Sin migraciones.

### Código (hecho)
- **Solo `gmail.send`.** Se sacó `gmail.readonly`: es un permiso restringido (auditoría CASA anual) y nadie lo usaba (`liquidacionesRecibidas()` no tenía quien la llame; se borró). Cumple el punto de la Fase 0 de la Arquitectura.
- **Se verifica el permiso que dio Google:** con el consentimiento granular se puede destildar "enviar correos". Si falta, vuelve con `oauth_sin_permiso` y no queda conectada.
- **Remitente con nombre:** `From: "Nombre de Mi cuenta" <casilla>` (RFC 2047, acentos incluidos).
- **"Mandar un correo de prueba"** en el panel de Gmail (Configuración → Correo electrónico): le escribe a la misma casilla conectada.
- **Autorización caída:** si al renovar Google responde `invalid_grant` (revocada, o la app quedó en modo Prueba), la conexión pasa a `en_proceso` con el motivo en `datos.error`, se borra el token y Configuración muestra "Hay que volver a autorizar". Si Gmail responde 401 antes de que venza el token, se fuerza la renovación y se reintenta una vez.
- **Los mensajes de ejemplo no salen** por ninguna conexión real (`enviarMensaje` corta si `es_ejemplo`): sus correos son de `ejemplo.com.ar`, que no es un dominio reservado, y sus teléfonos tienen formato real de Mar del Plata.
- Tests: `src/conexiones/email.test.ts`, `secretos.test.ts` y `src/agentes/envio.test.ts` (nuevos), y `catalogo.test.ts`.

**Prueba del código (30/10/2026):**
- `npm test`: pasan 644 de 647, y los 3 que fallan son los de antes (`catalogo.test.ts` la cuenta bancaria, `menu.test.ts` y `siniestros.test.ts`). Suma 14 tests.
- `tsc`: OK. Lint: sin errores, con las advertencias de siempre de los argumentos sin usar en las acciones. `next build`: OK.
- **Recorrido con la app compilada** (Postgres 18.6 descartable con `db:preparar` y Playwright fuera del repo), con una fila de Gmail con token falso cifrado con el mismo `SESSION_SECRET`. Pasaron los 8 pasos:
  - la lista lo muestra conectado, con la casilla y quién lo usa;
  - el panel ofrece "Mandar un correo de prueba" y "Volver a autorizar";
  - la prueba fallida muestra el motivo: el token falso dio 401 y se intentó renovar;
  - caída, la lista y el panel muestran el motivo, "Volver a autorizar" y "Autorizar con Google", sin la prueba;
  - se ve el aviso `oauth_sin_permiso`;
  - a 390 px no hay desborde.

  En el log de `next start`, ningún error.

### Configuración en Google Cloud (hecha, 30/10/2026)
- Proyecto **UNIQO**, cliente OAuth web **"UNIQO Web"**.
- **En producción, sin verificar:** autoriza cualquier Gmail, sin lista de usuarios de prueba. Sale "Google no verificó esta app" y se sigue por "Configuración avanzada → Ir a …", con un tope de 100 usuarios. La verificación se pide cuando entren otros productores (Arquitectura, Fase 1).
- **APIs:** Gmail API y Google Calendar API.
- **Acceso a los datos:** solo `gmail.send` y `calendar.events`. Calendar tiene que pedir **solo** `https://www.googleapis.com/auth/calendar.events`, nunca `calendar` completo: si no, no coincide con lo que se declara en la verificación.
- **URI de redireccionamiento:**
  - `http://localhost:3000/api/conexiones/oauth/gmail` y `…/google-calendar`;
  - `https://www.un1qo.com/api/conexiones/oauth/gmail` y `…/google-calendar`;
  - `https://radar-leads-pink.vercel.app/api/conexiones/oauth/gmail` y `…/google-calendar`, **temporales**: se borran antes de pedir la verificación.
- Los cambios en el cliente tardan de 5 minutos a unas horas en aplicarse. Si sale `redirect_uri_mismatch`, esperar y reintentar antes de tocar el código.

**Dominio:** `un1qo.com` se compró en Vercel el 30/10/2026 y está en el proyecto `radar-leads`. `www.un1qo.com` sirve la app y `un1qo.com` redirige ahí (308).

**Variables:**
- **Vercel, solo Production:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL=https://www.un1qo.com`, con www y sin barra final. Cargadas el 31/10/2026, antes del merge, por pedido de Julian (el secreto, como sensible). Hace falta `APP_URL`: sin ella, Vercel toma el dominio más corto (`un1qo.com`, sin www), que no está entre las URI de Google. Llegan recién al próximo deploy.
- **`.env` local:** cargado el 31/10/2026, con las dos claves y `APP_URL=http://localhost:3000`. Apunta al contenedor de Docker `uniqo-local` (Postgres 18.6, puerto 55433), preparado con `db:preparar`.

### Prueba de punta a punta
**En local**, con el Postgres de Docker (nunca la `DATABASE_URL` de Neon) y `npm run dev`:
1. Configuración → Correo electrónico → **Autorizar con Google**, con un Gmail de prueba. Tiene que volver con el aviso de conexión autorizada y mostrar la casilla.
2. **Mandar un correo de prueba:** tiene que llegar a esa misma casilla, con el nombre de Mi cuenta como remitente.
3. **Flujo real:** una solicitud de Cotización **nueva** (no de ejemplo) con una aseguradora de prueba cuyo correo de contacto sea el tuyo → aprobar el correo → tiene que llegar, firmado y con asunto con acentos.
4. **Un ejemplo no sale:** aprobar un mensaje de Cobranza de un asegurado de ejemplo → "Es un mensaje de ejemplo: no sale por las conexiones reales".
5. **Autorización caída:** en myaccount.google.com → Seguridad → Apps de terceros, quitarle el acceso a UNIQO → Mandar un correo de prueba → tiene que decir "Google ya no acepta la autorización…" y la conexión, "Hay que volver a autorizar".
6. Si la pantalla de Google deja destildar "enviar correos", destildarlo al autorizar → tiene que volver con `oauth_sin_permiso` y no quedar conectada.

**En producción** (después del merge y del deploy con las variables):
- Antes de conectar, revisar que en Cobranza ningún paso esté marcado como automático, salvo que se quiera que salga solo. Los avisos del Validador por correo salen solos a los destinatarios cargados en su Configuración.
- Autorizar con **la casilla @gmail.com del productor**, desde `https://www.un1qo.com` y no desde `un1qo.com` ni `radar-leads-pink.vercel.app`, para que la sesión y el retorno sean del mismo dominio.
- Mandar un correo de prueba y aprobar un correo real (por ejemplo, el borrador al ejecutivo de una solicitud, que va al correo de Mi cuenta).

| Paso | Estado |
|---|---|
| Código, tests, lint y build | Hecho |
| Proyecto y cliente en Google Cloud | Hecho (30/10/2026) |
| `.env` local con las claves | Hecho (31/10/2026) |
| Prueba local de punta a punta | Falta |
| Variables en Vercel Production | Hecho (31/10/2026) |
| PR y merge | Falta |
| Conectar la casilla del productor y prueba en producción | Falta |

## 2. Google Calendar (decidido, sin empezar)
- Hoy `calendario.crearEvento()` no lo llama nadie: conectar Calendar no hace nada.
- **Qué hay que hacer:** un paso del cron diario que, con Calendar conectado, sincronice los próximos 30 días. Va un evento de día completo por fecha con las pólizas que vencen (asegurado, compañía, ramo y enlace a la ficha). Se guarda el id de cada evento para actualizarlo o borrarlo si cambian los vencimientos (una renovación saca la póliza; un día sin vencimientos borra el evento). Hace falta guardar ese id: una tabla o `datos` de la conexión, a definir.
- El permiso es solo `calendar.events` (ya es lo que pide el OAuth), en el mismo proyecto de Google.

## 3. WhatsApp (sin empezar): lo que falta
- **Plantillas:** hoy, con `WHATSAPP_TEMPLATE_NAME`, todo sale con una plantilla y el texto entero en una variable. Meta rechaza plantillas que son solo una variable y no acepta saltos de línea en los parámetros (el aviso del Validador lleva `\n\n`). Hace falta una plantilla de categoría "utilidad" por tipo de mensaje, con sus variables.
- **Webhook:** no hay. Sin él no se reciben las respuestas de los asegurados (que abren la ventana de 24 horas para escribir sin plantilla), ni las denuncias, ni los estados de entrega.
- **Número:** decidir cuál. Un número que hoy está en la app de WhatsApp no se puede usar en la Cloud API sin sacarlo de la app (la "coexistencia" la ofrecen solo proveedores autorizados por Meta). Para probar de punta a punta alcanza con el número de prueba de Meta, que es gratis y le escribe a hasta 5 números verificados.
- **Token permanente** de un usuario del sistema del portfolio comercial, no el temporal de 24 horas.

## 4. Compañías (más adelante)
La base de conectores ya está (`src/lib/conectores/`, pantalla `/configuracion/companias`). Cada compañía real necesita su API o su portal, de a una.

## Próximo paso exacto
La prueba local de punta a punta, pasos 1 a 6, en `http://localhost:3000` (contraseña local `uniqo-local`). Después, PR y merge: las variables de Vercel ya están y llegan con ese deploy. Hasta el merge, no conectar Gmail en producción (`main` todavía pide `gmail.readonly`).
