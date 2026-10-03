# WhatsApp de FITCV: plantillas y configuración

WhatsApp solo acepta mensajes que inicia la empresa si usan una **plantilla aprobada**.
FITCV manda por WhatsApp solo 4 tipos de aviso, y solo a candidatos que marcaron
"Quiero recibir estos avisos" en Mis respuestas.

## 1. Crear las 4 plantillas (Twilio → Messaging → Content Template Builder)

Para las 4 plantillas:

- **Categoría:** Utility (no Marketing).
- **Idioma:** Spanish (es).
- **Tipo:** Text.
- **Variables:** `{{1}}` es el título del aviso y `{{2}}` es el enlace a fitcv.cl.
- **Valores de ejemplo para la revisión de Meta:** uno propio por plantilla (Meta compara el ejemplo con el texto; un ejemplo que no calza lleva al rechazo). `{{2}}` es siempre `https://fitcv.cl/por-enviar`:

| Plantilla | Ejemplo de `{{1}}` |
|---|---|
| `fitcv_te_necesitamos` | `Tu sesión en Computrabajo venció` |
| `fitcv_tanda` | `5 postulaciones salen a las 12:00` |
| `fitcv_respuesta` | `Analista de Logística te respondió` |
| `fitcv_autorizacion` | `Jefe de Bodega paga menos que tu rango` |

| Nombre (friendly name) | Clave en `WHATSAPP_TEMPLATES` | Cuándo se envía |
|---|---|---|
| `fitcv_te_necesitamos` | `te_necesitamos` | Una postulación se trabó por CAPTCHA o login, o un portal quedó sin sesión |
| `fitcv_tanda` | `tanda` | La tanda de "Por enviar" está lista para revisar |
| `fitcv_respuesta` | `respuesta` | Un reclutador respondió (entrevista u otra respuesta) |
| `fitcv_autorizacion` | `autorizacion` | Una oferta paga menos que el rango del candidato |

### Textos (copiar tal cual)

**fitcv_te_necesitamos**
```
Hola, FITCV te necesita: {{1}}. Resuélvelo desde tu tablero en {{2}} y seguimos solos. Responde BAJA si no quieres más avisos.
```

**fitcv_tanda**
```
Tu tanda de postulaciones está lista: {{1}}. Revísala en {{2}} y descarta lo que no quieras; lo demás sale solo. Responde BAJA si no quieres más avisos.
```

**fitcv_respuesta**
```
Novedades de FITCV: {{1}}. Te reenviamos el correo; revisa los detalles en {{2}}. Responde BAJA si no quieres más avisos.
```

**fitcv_autorizacion**
```
FITCV encontró una oferta que paga menos que tu rango: {{1}}. Autorízala o descártala en {{2}}. Responde BAJA si no quieres más avisos.
```

Cuando Meta las apruebe, cada una tiene un **Content SID** que empieza con `HX`.

**Estado 2026-09-28: las 4 plantillas ya están creadas en Twilio (Content Template Builder), guardadas con sus Content SID reales. Todavía NO están enviadas a aprobación de WhatsApp/Meta.**

**Estado 2026-10-02: la cuenta de Twilio ya es pagada, el perfil de empresa (Empresas Fit SpA) fue aprobado y el número +12183079676 quedó registrado como sender de WhatsApp con el nombre "FITCV" (estado Offline mientras Meta lo activa). Siguiente paso: cuando el sender esté Online, enviar las 4 plantillas a aprobación usando los ejemplos de la tabla de arriba.**

| Clave | Content SID |
|---|---|
| `te_necesitamos` | `HX9205d3211b09aada7e50fc1620111822` |
| `tanda` | `HX376d582f8fdbbb7fe219b9f55088595f` |
| `respuesta` | `HXe0306010dd1b14496cdac1d7b4f0ccc2` |
| `autorizacion` | `HX803d5c4893532ad9d7a328f4bdf1f136` |

## 2. Variable en Render (servicio de la API)

`WHATSAPP_TEMPLATES`, en una sola línea (valores reales, listos para cuando se apruebe la cuenta):

```
{"te_necesitamos":"HX9205d3211b09aada7e50fc1620111822","tanda":"HX376d582f8fdbbb7fe219b9f55088595f","respuesta":"HXe0306010dd1b14496cdac1d7b4f0ccc2","autorizacion":"HX803d5c4893532ad9d7a328f4bdf1f136"}
```

Si falta una plantilla, ese aviso se manda como texto libre. El texto libre solo llega si el candidato te escribió en las últimas 24 horas.
El panel /admin → "WhatsApp" muestra qué plantillas están configuradas.

## 3. Número de producción

1. ~~Pasar la cuenta de Twilio de trial a pagada.~~ Hecho (2026-10-01).
2. ~~Registrar un número con el nombre visible "FITCV".~~ Hecho (2026-10-02): número de EE.UU. `+12183079676`,
   portfolio de Meta "FITCV". Falta la verificación del negocio en Meta (e-RUT) para subir el límite diario.
3. Poner ese número en `TWILIO_WHATSAPP_FROM` en Render: **`whatsapp:+12183079676`**.

## 4. Webhooks del número (en la configuración del sender)

- **Mensajes entrantes (A message comes in):** `https://api.fitcv.cl/api/whatsapp/incoming` (POST).
  Con esto funcionan "BAJA" para dejar de recibir avisos y "ALTA" para volver a recibirlos.
- **Estado de entrega (Status callback):** FITCV lo pide solo en cada mensaje a
  `https://api.fitcv.cl/api/whatsapp/status`. Requiere que `API_URL` en Render sea `https://api.fitcv.cl`.

Los dos webhooks verifican la firma de Twilio con `TWILIO_AUTH_TOKEN`. Una llamada sin firma válida recibe 403.

## 5. Asistente de respuestas (mensajes que llegan, no BAJA/ALTA)

Cuando un candidato ya identificado (guardó su número en Mis respuestas) escribe algo que no es BAJA/ALTA,
`src/services/whatsappAssistant.ts` responde. Nunca usa IA para esto — solo datos reales de su cuenta,
para no arriesgar la regla de "sin mentiras" de FITCV:

- **"¿Cómo van mis postulaciones?"** → cuenta real de enviadas / en camino / que necesitan su atención.
- **"¿Cuánto cupo me queda?"** → su plan y cupo real (`getPlanState`).
- **"¿Tengo portales conectados?"** → cuáles portales están sin sesión (`getPortalSessions`).
- **Cualquier otra cosa** (quejas, preguntas abiertas) → nunca se contesta a ciegas: se le avisa al
  candidato que se la pasa al equipo, y el mensaje se reenvía al dueño por WhatsApp (`ADMIN_WHATSAPP`)
  y por correo (el primero de `ADMIN_EMAILS`). Si ninguno de los dos está configurado, igual queda en
  los logs del servidor.
- Un número que no está guardado en ninguna cuenta recibe el mensaje genérico de siempre.

Responder no depende del permiso "quiero recibir avisos" (`whatsappOptIn`): ese permiso rige solo lo que
FITCV envía por su cuenta. Contestar a un mensaje del candidato siempre está permitido por WhatsApp, dentro
de las 24 horas desde que escribió.

**Cuando la beta crezca**, para que el dueño reciba estas escaladas, configurar `ADMIN_WHATSAPP`
(su propio número, formato `+56...`) y confirmar que `ADMIN_EMAILS` tenga al menos un correo.
