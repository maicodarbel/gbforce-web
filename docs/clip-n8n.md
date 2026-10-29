# Pago en línea con Clip — flujos de n8n

Documento interno (la carpeta `docs/` NO se publica: está en `.dockerignore`).
Estado (2026-10-26): **todo el recorrido funciona en pruebas**: pago con Clip, confirmación, correos, página de envíos con Supabase + MFA. Las secciones 1 a 7 describen el diseño original (v1); la versión vigente es la de las secciones 8 a 10. **La sección 10 resume el estado actual y los pendientes.**

> Nunca pegues la API key ni la clave secreta de Clip en el chat, en el repo ni en el navegador. Solo van en las credenciales de n8n.

## 0. Antes de empezar (lo hace el dueño de la cuenta)

1. Cuenta de Clip activa y **verificación de identidad (KYC)** completa.
2. Panel de desarrollador → *Crear credencial* → uso **Tienda online** → dominio `https://gbforce.mx`. Guardar API key y clave secreta (la secreta solo se ve una vez).
3. Confirmar que el **servidor de n8n** está en México o Estados Unidos. Clip responde `403 Request blocked` si la llamada sale de otro país.
4. Si se quieren **meses sin intereses**, activarlos primero en la cuenta de Clip.

## 1. Credenciales y variables en n8n

| Nombre | Tipo | Valor |
|---|---|---|
| `Clip API` | Credencial *Header Auth* | Nombre: `Authorization` · Valor: `Basic ` + base64(`API_KEY:CLAVE_SECRETA`) |
| `Airtable` | Credencial Airtable | La que ya se usa en el flujo de asociados |
| `PRECIO_CAJA` | Variable / nodo Set | `650` (precio real; **solo el servidor decide el monto**) |
| `ENVIO_FIJO` / `ENVIO_GRATIS_DESDE` | Variable | `ENVIO_FIJO = 129` (MXN; si fuera `null` el flujo rechaza el pedido con `envio_pendiente`); `ENVIO_GRATIS_DESDE = 3` cajas |
| `WEBHOOK_SECRET` | Variable | Cadena larga aleatoria (la URL del webhook de Clip llevará `?t=<WEBHOOK_SECRET>`) |
| `META_PIXEL_ID` | Variable | `1676702536743834` |
| `META_CAPI_TOKEN` | Credencial/variable | Token de acceso de la API de conversiones (Events Manager) |

Para generar el base64: `echo -n API_KEY:CLAVE_SECRETA | base64`.

## 2. Tabla `Pedidos` en Airtable

**YA CREADA** (cuenta de Airtable del dueño, espacio «My First Workspace», junto con las demás bases de GB FORCE):
- Base: **GB FORCE — Pedidos** · id `appkgaQDxgrcqWdvB`
- Tabla: `Pedidos` · id `tblrWKkkEw8uw3MQF`
- Campo «Estado de envío» = entidad federativa del cliente (el campo «Estado» es el estado del pedido).
- Esta base es aparte de la de socios a propósito: tiene datos personales y el sitio web no debe tener acceso.

| Campo | Tipo |
|---|---|
| `Pedido` (clave) | Texto, ej. `GB-7K3F9Q` |
| `Estado` | Selección: PENDIENTE · PAGADO · FALLIDO |
| `Cantidad` | Número |
| `Monto` | Moneda (MXN) |
| `Nombre`, `Teléfono`, `Correo` | Texto |
| `Calle`, `Colonia`, `CP`, `Ciudad`, `Estado de envío`, `Referencias` | Texto |
| `PaymentRequestId` | Texto |
| `ReceiptNo` | Texto |
| `Atribución` (utm_*, fbclid, ad_name…) | Texto largo (JSON) |
| `fbp`, `fbc`, `EventId` | Texto |
| `CreadoEn`, `PagadoEn` | Fecha |

El id del pedido (`GB-` + 6 caracteres alfanuméricos) se usa como `external_reference` en Clip (máx. 36 caracteres).

## 3. Flujo 1 — `gbforce-crear-pago`  (POST desde `pedido.js`)

**Webhook** (POST, ruta `gbforce-crear-pago`, respuesta: *Using 'Respond to Webhook'*). En *Options → Allowed Origins (CORS)*: `https://gbforce.mx` (y `http://localhost:8080` mientras se prueba).

Cuerpo que envía la página:
```json
{
  "qty": 2,
  "cliente": { "nombre": "", "telefono": "", "correo": "", "calle": "", "colonia": "", "cp": "", "ciudad": "", "estado": "", "referencias": "" },
  "aviso_privacidad": true,
  "promociones": false,
  "tracking": { "utm_source": "", "fbclid": "" },
  "fbp": "", "fbc": "", "event_id": "", "page_url": "", "timestamp": ""
}
```

Nodos:
1. **Code — validar y sanear**: `qty` entero entre 1 y 12 (si no, error 400); `telefono` 10 dígitos; `correo` válido; `cp` 5 dígitos; textos recortados a su largo máximo; `aviso_privacidad === true`. **Ignorar cualquier campo `amount`/`monto`/`precio` que llegue.**
2. **Set — calcular**: `monto = qty * PRECIO_CAJA + envio` (`envio = 0` si `qty >= ENVIO_GRATIS_DESDE`, si no `ENVIO_FIJO`) (número con 2 decimales); `pedido = 'GB-' + 6 caracteres aleatorios`.
3. **Airtable — crear** registro en `Pedidos` con `Estado = PENDIENTE`.
4. **HTTP Request — Clip**: `POST https://api.payclip.com/v2/checkout`, credencial `Clip API`, cuerpo JSON:
```json
{
  "amount": "={{ $json.monto }}",
  "currency": "MXN",
  "purchase_description": "GB FORCE · {{qty}} caja(s) de 7 viales",
  "redirection_url": {
    "success": "https://gbforce.mx/gracias.html?o={{ $json.pedido }}",
    "error": "https://gbforce.mx/pedido.html?error=1",
    "default": "https://gbforce.mx/comprar.html"
  },
  "override_settings": { "locale": "es-MX" },
  "metadata": {
    "external_reference": "{{ $json.pedido }}",
    "customer_info": { "name": "{{ nombre }}", "email": "{{ correo }}", "phone": "{{ telefono (número) }}" }
  },
  "custom_payment_options": { "payment_method_types": ["debit", "credit", "cash"] },
  "webhook_url": "https://n8n.guiahudumaliving.online/webhook/clip-pago?t={{ WEBHOOK_SECRET }}"
}
```
   (`installments_msi: [3, 6]` solo si se activaron MSI en Clip.)
5. **Airtable — actualizar** el pedido con `PaymentRequestId`.
6. **Respond to Webhook** (200, JSON): `{ "order_id": pedido, "payment_request_id": …, "payment_request_url": … }`.
   Si Clip falla (401, 403, 412, 500): responder `502` y avisar al equipo; **no** exponer el detalle del error al navegador.

## 4. Flujo 2 — `clip-pago`  (webhook que llama Clip)

**Webhook** POST ruta `clip-pago`. Clip **no firma** las notificaciones, así que:

1. **IF** `query.t === WEBHOOK_SECRET`; si no, responder 200 y terminar (no dar pistas).
2. **IF** `body.resource === 'CHECKOUT'`. Estados útiles de `body.resource_status`: `COMPLETED`, `CANCELED`, `EXPIRED` (Clip también envía `CREATED` y `PENDING`).
3. Si `COMPLETED`: **HTTP Request — verificar**: `GET https://api.payclip.com/v2/checkout/{{ body.payment_request_id }}` (credencial `Clip API`). Continuar **solo si**:
   - `status === 'CHECKOUT_COMPLETED'`,
   - `metadata.external_reference` coincide con un pedido existente en Airtable,
   - `amount` coincide con el `Monto` guardado del pedido.
4. **Airtable — buscar** pedido por `Pedido`; si ya está `PAGADO`, terminar (idempotente: Clip puede reintentar hasta 4 veces).
5. **Airtable — actualizar**: `Estado = PAGADO`, `ReceiptNo = receipt_no`, `PagadoEn = ahora`.
6. **HTTP Request — Meta CAPI**: `POST https://graph.facebook.com/v23.0/{META_PIXEL_ID}/events?access_token=…` con un evento `Purchase`: `event_id = <pedido>` (el mismo que usa `gracias.html`, así Meta deduplica), `event_time`, `action_source: "website"`, `event_source_url: https://gbforce.mx/gracias.html`, `user_data` con `em` y `ph` en SHA-256 (minúsculas, teléfono con 52), `fbp`, `fbc`, y `custom_data: { value: monto, currency: "MXN" }`.
7. **Avisos**: correo (o WhatsApp) al equipo con los datos de envío y a la persona con la confirmación.
8. Si `CANCELED` o `EXPIRED`: actualizar `Estado = FALLIDO`.
9. Responder siempre `200` rápido (Clip no documenta qué espera).

## 5. Flujo 3 — `gbforce-pedido-estatus`  (GET desde `gracias.html`)

**Webhook** GET ruta `gbforce-pedido-estatus` (CORS `https://gbforce.mx`). Parámetro `o` = pedido.
1. Validar `o` con `^[A-Za-z0-9_-]{4,36}$`.
2. Buscar en Airtable.
3. Responder **solo**: `{ "status": "PAGADO" | "PENDIENTE" | "FALLIDO", "amount": 650 }`. Nunca devolver datos personales. Si no existe: `{ "status": "PENDIENTE" }`.

## 6. Pruebas (el sandbox de Clip NO cubre este checkout)

1. **Manipulación de monto**: enviar manualmente `qty: 1, amount: 1` al flujo 1 → el monto en Clip debe seguir siendo `650`.
2. **Cobro real de prueba**: poner `PRECIO_CAJA = 1` temporalmente, pagar con una tarjeta real y con OXXO; luego **reembolsar** desde el panel de Clip y **volver `PRECIO_CAJA` a su valor real**.
3. **Webhook falso** sin `?t=` → no cambia nada. Webhook `COMPLETED` real → pedido `PAGADO` una sola vez aunque se reintente.
4. **gracias.html**: sin `?o=` → mensaje neutro, sin `Purchase`; con pedido pendiente → "Estamos confirmando"; con pedido pagado → un solo `Purchase` (verificar en *Test Events* de Meta, evento del navegador + servidor deduplicados).
5. **Celular real**: abrir `pedido.html` desde un anuncio/enlace dentro de **Instagram y Facebook** y confirmar que el pago embebido abre; si no, que aparezca el respaldo "Continuar en la página segura de Clip".
6. Revisar que ningún archivo del repo contenga llaves: buscar `Basic `, `api_key`, `secret`.

## 7. Notas de la documentación de Clip

- El link de pago vence en 3 días (por defecto) según la creación; la consulta de estado dice que "vence a la hora". Confirmar con soporte-checkout@clip.mx.
- Máximo 5 intentos de pago por link; luego `CHECKOUT_CANCELLED`.
- No se documenta SPEI. Métodos: débito, crédito y OXXO (`cash`), más MSI si se activan.
- Soporte: soporte-checkout@clip.mx · developers@payclip.mx · 55 6393-2323.

---

## 8. Versión 2: confirmación sólida, Meta, correos y página de envíos

Archivos en `docs/n8n/` (importar en n8n; los marcadores `PON_AQUI_...` se reemplazan DENTRO de los nodos Code):

| Archivo | Para qué sirve | Marcadores |
|---|---|---|
| `1-crear-pago.json` | Igual que antes (ya importado). Crea el pedido y el link de Clip | `PON_AQUI_TU_SECRETO` (ya puesto) |
| `2-clip-pago.json` | Aviso de Clip → pregunta al flujo 4. REEMPLAZA al anterior | `PON_AQUI_TU_SECRETO` |
| `3-pedido-estatus.json` | La página de gracias consulta aquí → llama al flujo 4. REEMPLAZA al anterior | `PON_AQUI_TU_SECRETO` |
| `4-confirmar-pago.json` | **Centro de la confirmación**: pregunta a Clip, marca PAGADO, envía Purchase a Meta, manda correos | `PON_AQUI_TU_SECRETO`, `PON_AQUI_TOKEN_META` (remitente y correo del equipo ya puestos, ver sección 10) |
| `5-reconciliar.json` | Cada 30 min revisa pedidos PENDIENTES de los últimos 3 días y los confirma | `PON_AQUI_TU_SECRETO` |
| `6-envios.json` | Acceso, lista de envíos y "marcar como enviado" (valida la sesión de Supabase y escribe la bitácora). Ver sección 9 | Ninguno pendiente (URL y clave `anon` de Supabase y remitente ya puestos) |

**El secreto debe ser IDÉNTICO en los flujos 1, 2, 3, 4 y 5.** Si no, el flujo 4 responde 401 y nada se confirma.

### Cómo se sabe que un pedido está pagado (tres caminos, un solo juez)
1. **Aviso de Clip** (flujo 2) → llama al flujo 4.
2. **La persona llega a `gracias.html`** (flujo 3) → llama al flujo 4.
3. **Cada 30 minutos** (flujo 5) → llama al flujo 4 por cada pedido PENDIENTE reciente.
El flujo 4 **no confía en ningún aviso**: consulta `GET /v2/checkout/{id}` a Clip y solo marca PAGADO si `status = CHECKOUT_COMPLETED`, el monto coincide y la referencia es del pedido. Es idempotente (si ya está PAGADO no repite nada).

### Meta (Purchase)
- Solo se envía cuando el pedido pasa a PAGADO. Un carrito abandonado queda como `InitiateCheckout`/`AddPaymentInfo`, nunca como `Purchase`.
- Dos eventos con el mismo `event_id` (= número de pedido): el del navegador (`gracias.html`, solo si está PAGADO) y el del servidor (flujo 4, API de conversiones). Meta los deduplica.
- Token: Events Manager → fuente de datos (píxel) → Configuración → API de conversiones → *Generar token de acceso*. Para probar, poner un `TEST_EVENT_CODE` en el nodo y ver *Probar eventos*.

### Correos
Requieren una credencial **SMTP** en n8n llamada `SMTP GB FORCE`. El correo del dominio está en **Titan (GoDaddy)**, no en Hostinger: servidor `smtp.titan.email`, puerto 465, SSL, usuario = `admin@gbforce.mx`. El remitente debe ser ese mismo correo. Si falta, los nodos de correo fallan **sin detener** la confirmación ni el aviso a Meta.

### Airtable (campos nuevos en `Pedidos`)
`Logística` (POR ENVIAR / ENVIADO), `Paquetería`, `Guía`, `EnviadoEn`. El flujo 4 pone `Logística = POR ENVIAR` al pasar a PAGADO.

### Página de envíos (`envios.html`)
- (Reemplazado por la sección 9: ya NO usa un código compartido.)
- Muestra solo lo necesario para empacar: nombre, teléfono, dirección, referencias y **número de cajas**. Sin montos ni datos de pago ni correo.
- "Marcar como enviado" pide paquetería y guía, guarda en Airtable y le manda un correo de seguimiento al cliente.
- No usa Meta Pixel ni analítica, está en `robots.txt` y lleva `noindex`.
---

## 9. Acceso a la página de envíos (Supabase Auth + bitácora)

**Qué hace.** `envios.html` exige correo + contraseña + código de Google Authenticator (TOTP). La sesión la emite Supabase. En cada llamada, el flujo 6 de n8n valida el token con Supabase (`GET /auth/v1/user`) y comprueba que la sesión sea `aal2` (segundo paso verificado) y que no haya expirado. Sin eso responde 401 y no entrega ningún dato.

**Quién puede entrar.** Solo usuarios que TÚ creas en Supabase (el registro público está apagado). Opcionalmente, en el nodo `Validar sesión` del flujo 6 se puede poner una lista `CORREOS_AUTORIZADOS` como segunda barrera.

**Bitácora.** Tabla `Bitácora` (id `tblTp8SDAOH5XIklI`) en la base de Pedidos. Se registra: INGRESO (después de contraseña + segundo paso), MARCAR ENVIADO y DESHACER ENVÍO, con usuario, fecha/hora, IP, pedido y detalle. Los intentos fallidos de contraseña no pasan por n8n: se ven en Supabase → Authentication → Logs (retención corta en el plan gratis).

**Qué es público y qué no.** La URL del proyecto y la clave `anon` de Supabase son públicas por diseño (van en `envios.js` y en el flujo 6). La clave `service_role` NUNCA se usa ni se comparte.

**Configuración en Supabase (una vez):**
1. Proyecto nuevo (plan gratis). Región cercana a México.
2. Authentication → Sign In / Providers → Email: **desactivar "Allow new users to sign up"**. Longitud mínima de contraseña **12**.
3. Authentication → Multi-Factor: **TOTP habilitado**.
4. Authentication → URL Configuration: Site URL `https://gbforce.mx/envios.html`; Redirect URLs: `https://gbforce.mx/envios.html` y `http://localhost:8080/envios.html`.
5. Authentication → SMTP Settings: **SMTP propio** (sin él, Supabase solo envía correos a miembros del equipo del proyecto y con un límite muy bajo, y el restablecimiento de contraseña no llegaría a la gente de bodega).
6. Authentication → Users → Add user → *Create new user* (con "Auto Confirm User").
7. Copiar **Project URL** y **anon public key** (Project Settings → API) a `envios.js` y al nodo `Preparar token` del flujo 6.

**Nota del plan gratis:** Supabase pausa los proyectos sin actividad durante ~7 días; si pasa, hay que reactivarlo desde su panel.
### Ajustes que se cambian sin tocar código (Airtable > Configuración)
Tabla `Configuración` (id `tblTpzLxKT9AoQkBv`) en la base de Pedidos. Se edita la celda **Valor**; surte efecto en la siguiente carga de la página de envíos (sin volver a publicar).

| Clave | Valor inicial | Qué hace |
|---|---|---|
| `envios_inactividad_horas` | 8 | Horas sin usar la página antes de cerrar la sesión (0.25 a 72). Lo aplica la página. |
| `envios_sesion_maxima_horas` | 24 | Horas máximas de una sesión desde el último código de Google Authenticator (1 a 168). **Lo exige n8n** con la fecha firmada dentro del token. |

Si la tabla no se puede leer, el flujo usa 8 y 24. No cambiar la columna `Clave`.

---

## 10. Estado actual y pendientes (2026-10-26)

### Qué quedó funcionando (probado por el dueño)
Compra real con Clip → pedido PAGADO en Airtable → correo de confirmación al cliente → pedido visible en `envios.html` con inicio de sesión de Supabase + Google Authenticator.

### Decisiones y datos de configuración
- **Pixel de Meta vigente:** `1676702536743834` ("Datos Gb Force", portafolio **GB Force**, que también tiene la página «GB Force Mexico» y la cuenta publicitaria `2087460178785081`). Está en todas las páginas (incluidas `index.html` y `oportunidad.html`, cambio autorizado) y en el nodo «Armar evento Meta» del flujo 4. El Pixel anterior era de una agencia y se eliminó; el portafolio **GB Force Mexico** quedó sin uso (Meta no dejó borrarlo).
- **Correos:** remitente `admin@gbforce.mx`; avisos del equipo a `contacto@gbforce.mx`; SMTP de Titan (ver sección 8). El mismo SMTP debe ponerse en Supabase (Authentication → Emails → SMTP Settings) para el restablecimiento de contraseña.
- **Supabase:** proyecto `lcaqniptbppilsiopvgd` (URL pública y clave `anon` ya en `envios.js` y en el flujo 6).
- **Secreto de los flujos:** los archivos listos para importar con el secreto puesto están **fuera del repo**, en el Escritorio del dueño (`gbforce-n8n-listos`). Los de `docs/n8n/` conservan el marcador `PON_AQUI_TU_SECRETO` para no subirlo a Git. El secreto se escribió una vez en un chat: **conviene rotarlo** (cambiarlo en los flujos 1 a 5).
- **Corrección del flujo 6:** el nodo «Airtable: listar envíos» ya no manda 14 parámetros `fields[]`, porque n8n los colapsaba y la página recibía los pedidos vacíos; ahora trae todos los campos y «Armar lista» filtra lo que se muestra.
- **Variables de producción:** `PRECIO_CAJA = 650` en el flujo 1 (verificar), `ENVIO_FIJO = 129`, `ENVIO_GRATIS_DESDE = 3`.

### Pendientes
1. **Token de la API de conversiones de Meta:** al generarlo en Datos Gb Force sale «No se pudo generar el token… infringe Condiciones/Políticas», sin restricción visible en Calidad de la cuenta. Reintentar, probar «sin Dataset Quality API», completar el registro del portafolio (aviso «Termina de registrarte») o abrir un caso en el Centro de ayuda de Meta. Mientras no haya token, el flujo 4 se salta Meta y el Pixel del navegador sigue enviando `Purchase` desde `gracias.html`.
2. Correos con la identidad de GB FORCE (colores, imagen).
3. Aviso de privacidad (hoy `pedido.html` tiene un TODO) y enlaces entre páginas.
4. Rotar el secreto; borrar los pedidos de prueba de Airtable; guardar claves en un gestor de contraseñas.
5. Probar en celular real (incluido el navegador de Instagram/Facebook) y verificar con *Probar eventos* de Meta.
6. **Deploy a EasyPanel:** no realizado. Solo con autorización expresa del dueño. Antes de publicar `envios.html` confirmar Supabase (registro público apagado, SMTP, URLs).