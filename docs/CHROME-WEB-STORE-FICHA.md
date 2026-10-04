# Chrome Web Store: ficha de la extensión FITCV

Todo lo que se pega en el panel de desarrollador de Chrome Web Store
(https://chrome.google.com/webstore/devconsole). Versión de la extensión: **0.5.3**.

## Antes de subir

1. Crear la cuenta de desarrollador (pago único de US$5, a nombre de Empresas Fit SpA o del dueño). La crea y paga el dueño.
2. Comprimir **el contenido** de `fitcv-extension/` en un `.zip` con `manifest.json` en la raíz, **sin** la carpeta `graphify-out/` ni este README si se quiere liviano.
3. Probar la versión 0.5.3 en Chrome real (recargar en `chrome://extensions`): una postulación completa y una oferta que redirige al sitio de una empresa (debe quedar "Requiere tu atención", no "Error").
4. Cuenta de prueba para los revisores (ver sección 7): crearla en `/admin` e invitarla antes de enviar.

## 1. Datos de la ficha

| Campo | Valor |
|---|---|
| Nombre (máx. 45) | FITCV — Postulación con tu CV adaptado |
| Resumen (máx. 132) | Envía tus postulaciones con tu CV adaptado y respuestas verificadas contra tu CV. Nunca inventa datos. |
| Categoría | Productividad (si pide subcategoría: Flujo de trabajo y planificación) |
| Idioma principal | Español (Latinoamérica) |
| Sitio web oficial | https://fitcv.cl |
| Política de privacidad | https://fitcv.cl/privacy |
| Correo de soporte | contacto@fitcv.cl |
| Visibilidad | Pública (o "No listada" mientras dure la beta cerrada: así solo entra quien tenga el enlace) |

## 2. Descripción larga (pegar en "Descripción")

```
FITCV adapta tu CV a cada oferta de empleo y postula por ti, sin inventar nada.

Esta extensión es la parte que envía. En FITCV (fitcv.cl) revisas tus ofertas y dejas en cola las que quieres. La extensión toma las postulaciones de a una, abre la oferta, lee el formulario y le pregunta a FITCV qué responder usando solo datos que tu CV respalda. Luego adjunta tu CV adaptado en PDF y envía.

QUÉ HACE
• Postula en portales de empleo chilenos con la sesión que ya tienes abierta en tu navegador: Computrabajo, Chiletrabajos, Trabajando.com, Bolsa Nacional de Empleo, Get on Board, Trabajos Diarios, Portal Minero, FirstJob y Laborum.
• Guarda en tu cola la oferta que estás mirando con un clic.
• Te avisa en tu tablero de FITCV cuando una postulación quedó enviada o necesita tu atención.

CÓMO TE CUIDA
• Nunca inventa datos: si el formulario pide algo que tu CV no respalda, se detiene y te lo pregunta.
• No resuelve CAPTCHAs ni esquiva bloqueos. Ante un CAPTCHA, un inicio de sesión o el sitio de una empresa, deja la pestaña abierta con un aviso para que continúes tú.
• Una postulación a la vez, con pausas entre una y otra.
• No ve ni guarda tus contraseñas de los portales. Usa las sesiones que ya tienes abiertas.
• Puedes pausar o desvincular la extensión cuando quieras.

IMPORTANTE
• Necesitas una cuenta de FITCV (por invitación durante la beta) y vincular la extensión con un código que generas en tu tablero.
• En LinkedIn el envío automático viene apagado: LinkedIn prohíbe las extensiones que automatizan actividad y usarla podría restringir tu cuenta. Solo se activa si tú lo decides en FITCV, bajo tu propio riesgo.

Más información y política de privacidad: https://fitcv.cl
```

## 3. Propósito único (campo "Single purpose")

> Postular a ofertas de empleo en nombre del candidato: abre la oferta en un portal de empleo, completa el formulario con respuestas respaldadas por el CV del propio usuario y envía la postulación, informando el resultado a su cuenta de FITCV.

## 4. Justificación de cada permiso

Pegar cada texto en el campo del permiso correspondiente (pestaña "Prácticas de privacidad").

| Permiso | Justificación (español) | Justification (English, for reviewers) |
|---|---|---|
| `storage` | Guarda en el navegador el token de vinculación con la cuenta de FITCV, la dirección del servidor, el estado (en marcha/pausada) y un registro corto de actividad. | Stores the pairing token for the user's FITCV account, the server address, the run state and a short activity log in the browser. |
| `alarms` | Programa la siguiente postulación (pausa entre una y otra) y la revisión periódica de si el usuario tiene sesión abierta en cada portal. | Schedules the next application (a deliberate pause between them) and the periodic check of whether the user is logged in to each job portal. |
| `scripting` | Inyecta, solo en la pestaña de la oferta que se está postulando, el código empaquetado en la extensión que lee el formulario y lo completa. No se descarga ni ejecuta código remoto. | Injects the extension's own bundled code into the tab of the job being applied to, to read and fill its form. No remote code is downloaded or executed. |
| `tabs` | Abre la oferta en una pestaña en segundo plano, la cierra al terminar y detecta cuándo cargó o cambió de dirección (por ejemplo, si el portal redirige al sitio de una empresa o al inicio de sesión). | Opens the job in a background tab, closes it when done and detects when it finished loading or changed address (e.g. the portal redirects to a company site or a login page). |
| `activeTab` | Permite el botón "Agregar esta oferta a la cola": lee el título y el texto de la oferta de la pestaña que el usuario está mirando, solo cuando pulsa el botón. | Powers the "Add this job to the queue" button: reads the title and text of the job in the tab the user is viewing, only when they press the button. |
| Acceso a `api.fitcv.cl` | Es el servidor de FITCV: la extensión le pide las postulaciones en cola, las respuestas del formulario y el CV adaptado, y le informa el resultado. | FITCV's own server: the extension fetches the queued applications, form answers and tailored CV from it and reports the result. |
| Acceso a los portales (LinkedIn, Computrabajo, Chiletrabajos, Trabajando.com, BNE, Get on Board, Trabajos Diarios, Portal Minero, FirstJob, Laborum) | Son los sitios donde se postula. La extensión solo opera en esos dominios; en cualquier otro se detiene y avisa al usuario. | The job portals where applications are submitted. The extension only acts on these domains; on any other site it stops and notifies the user. |
| Acceso opcional a `http://localhost` (`optional_host_permissions`) | Solo se pide, con un clic del usuario, para vincular la extensión con un servidor de pruebas local. No se usa en producción. | Requested only, on a user click, to pair the extension with a local test server. Not used in production. |

## 5. Prácticas de privacidad (formulario "Privacy practices")

**¿Qué datos de usuario maneja la extensión?** Marcar:
- **Información de identificación personal**: nombre, correo y teléfono que el formulario de la oferta pide y que provienen del CV del usuario.
- **Información de autenticación**: el token de vinculación con FITCV (guardado localmente).
- **Contenido del sitio web**: texto de la oferta y campos del formulario de postulación.

**No marcar:** salud, finanzas, comunicaciones personales, ubicación, historial web, actividad del usuario (la extensión no registra navegación general).

**Declaraciones obligatorias (las tres deben quedar marcadas):**
- No vendo ni transfiero datos de usuarios a terceros fuera de los casos de uso aprobados.
- No uso ni transfiero datos para fines ajenos al propósito único de la extensión.
- No uso ni transfiero datos para determinar solvencia o con fines de crédito.

**Código remoto:** "No, no uso código remoto." (comprobado: sin `eval`, `new Function` ni carga de scripts externos).

## 6. Material gráfico

| Pieza | Medida | Estado |
|---|---|---|
| Ícono de la tienda | 128 × 128 | Ya existe (`icons/icon128.png`) |
| Capturas (mínimo 1, ideal 3 a 5) | 1280 × 800 o 640 × 400 | **Por tomar** (ver lista) |
| Mosaico promocional pequeño | 440 × 280 | Opcional |

Capturas sugeridas (tomarlas con datos de la cuenta de prueba, nunca con datos reales de candidatos):
1. El popup de la extensión vinculada ("Vinculada a …", botón Iniciar envío).
2. El tablero de FITCV con "Por enviar" y las postulaciones en cola.
3. Una postulación en curso con el aviso de FITCV sobre el formulario del portal.
4. Una oferta que "Requiere tu atención" con el aviso al candidato.
5. Estado "Enviada" en el tablero.

## 7. Notas para el revisor (campo "Test instructions", en inglés)

```
FITCV is a closed-beta service (Chile) that applies to job offers on behalf of the candidate using the candidate's own CV. The extension is the part that submits applications.

How to test:
1. Sign in at https://fitcv.cl with the test account provided in the "Test account" fields (email + password).
2. In the dashboard open "Extensión de Chrome" and press "Generar código" to get a one-time pairing code.
3. Open the extension popup, keep the server address https://api.fitcv.cl and paste the code, then press "Vincular".
4. Press "Iniciar envío": the extension takes queued applications one at a time, opens the offer in a background tab, fills the form and submits only when every required field is backed by the candidate's CV. Otherwise it stops and leaves the tab open with a notice.

Notes:
- The extension only acts on the job portals listed in host_permissions. On any other site it stops.
- It does not solve CAPTCHAs, does not store portal passwords and does not execute remote code.
- LinkedIn automatic sending is OFF by default and only enabled by the user.
- Privacy policy: https://fitcv.cl/privacy · Terms: https://fitcv.cl/terms · Support: contacto@fitcv.cl
```

Cuenta de prueba para los revisores: crearla en `/admin` (plan Max, para que vean todos los portales), con un CV de ejemplo cargado y 2 o 3 ofertas en cola. **Las credenciales se escriben en los campos "Test account" del panel, nunca en este archivo.**

## 8. Riesgos de rechazo y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| Permisos demasiado amplios | Resuelto en 0.5.3: ya no hay `<all_urls>`; solo `api.fitcv.cl` y 10 portales. |
| `tabs` se muestra al usuario como "leer tu historial de navegación" | Se justifica arriba. Si Google lo objeta, se puede quitar: el código funciona con permisos de sitio en los portales, pero hay que reprobar el flujo de "sitio de empresa". |
| Automatización de LinkedIn | Apagada por defecto, aclarada en la descripción y en el aviso al usuario. Si la tienda lo objeta, se quita LinkedIn de `host_permissions` y la extensión sigue funcionando en los demás portales. |
| Descripción que promete más de lo que hace | La descripción solo afirma lo que el código hace; revisar antes de enviar. |
| Revisores sin acceso (beta cerrada) | Cuenta de prueba lista y con cola armada. |

Plazo: la primera revisión suele tomar de unos días a un par de semanas. No hay garantía.
