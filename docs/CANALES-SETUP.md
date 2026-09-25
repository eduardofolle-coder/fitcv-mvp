# Configuración de canales (E1–E6)

El código ya está desplegado. Lo que sigue lo configura el dueño en cada consola:
FITCV nunca escribe secretos por ti. Mientras una variable falte, esa parte queda
apagada sin romper nada.

## Variables en Render (servicio web **y** worker)

| Variable | Para qué | Ejemplo |
|---|---|---|
| `API_URL` | URL de retorno de OAuth del correo | `https://api.fitcv.cl` |
| `ADMIN_EMAILS` | quién ve `/admin` | `eduardofolle@gmail.com` |
| `BETA_CLOSED` | solo entran correos invitados | `true` |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | botón "Conectar Outlook" | (de Microsoft Entra) |
| `MAIL_BACKUP_FROM` | remitente de respaldo | `postula@postula.fitcv.cl` |
| `INBOX_DOMAIN` | dominio de los alias de respuesta | `inbox.fitcv.cl` |
| `INBOUND_SECRET` | protege el webhook de respuestas | cadena aleatoria larga |

`GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY` y `EMAIL_FROM` ya existen y se reutilizan.

## E3 · Gmail (permiso de envío)

1. Google Cloud Console → *APIs y servicios* → habilitar **Gmail API**.
2. *Pantalla de consentimiento OAuth* → agregar el permiso `https://www.googleapis.com/auth/gmail.send`
   (es **sensible**, no restringido: pide verificación de Google, sin auditoría de seguridad externa).
3. *Credenciales* → en el cliente OAuth existente, agregar el URI de redirección
   `https://api.fitcv.cl/api/mail/callback/google`.
4. Enviar a verificación **ahora**: toma semanas. Mientras no esté verificada, Google muestra
   la advertencia "app no verificada" y limita a 100 usuarios: alcanza para la beta.
   Deja la app en estado **En producción**: en estado *Prueba* los permisos vencen a los 7 días.

## E3 · Outlook

1. Microsoft Entra → *Registros de aplicaciones* → nueva, cuentas "cualquier directorio y personales".
2. URI de redirección (Web): `https://api.fitcv.cl/api/mail/callback/microsoft`.
3. *Permisos de API* → Microsoft Graph delegados: `Mail.Send`, `User.Read`, `offline_access`.
4. *Certificados y secretos* → nuevo secreto → `MS_CLIENT_SECRET`.

## E3 · Respaldo `postula.fitcv.cl`

1. Resend → *Domains* → agregar `postula.fitcv.cl` y copiar los registros **SPF, DKIM y MX** al DNS.
2. DMARC en el DNS: `_dmarc.postula.fitcv.cl TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@fitcv.cl"`.
3. Calentamiento: las primeras 2 semanas, pocos candidatos sin correo conectado.
   FITCV ya separa 45 min los envíos a una misma dirección ("Se envía hoy a las HH:MM").

## E4 · Respuestas en `inbox.fitcv.cl`

1. Cloudflare → *Email Routing* en `inbox.fitcv.cl` → regla *catch-all* → **Send to a Worker**.
2. Worker (con `npm i postal-mime`), variable secreta `INBOUND_SECRET` igual a la de Render:

```js
import PostalMime from 'postal-mime';

export default {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    await fetch('https://api.fitcv.cl/api/mail/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': env.INBOUND_SECRET },
      body: JSON.stringify({ to: message.to, from: message.from, subject: mail.subject ?? '', text: mail.text ?? '', html: mail.html ?? '' }),
    });
  },
};
```

FITCV reenvía cada respuesta al correo del candidato, la clasifica con IA y, si es entrevista,
cambia la postulación a "Entrevista" y avisa por WhatsApp.

## E6 · Beta cerrada

Con `BETA_CLOSED=true`, entra a `https://fitcv.cl/admin`, invita cada correo con su plan
(free / pro / max) y cámbialo cuando quieras. No hay pasarela de pago.
