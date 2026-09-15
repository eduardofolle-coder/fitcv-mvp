# Despliegue de FITCV en Render

Todo está descrito en [render.yaml](render.yaml). Se crean tres piezas en la región Virginia:

| Pieza | Qué es | Dominio |
|---|---|---|
| `fitcv-db` | PostgreSQL administrado | — |
| `fitcv-api` | Backend Express | `api.fitcv.cl` |
| `fitcv-web` | Web Next.js | `fitcv.cl`, `www.fitcv.cl` |

## 1. Crear los servicios

1. Render → **New → Blueprint** → conectar el repositorio `eduardofolle-coder/fitcv-mvp`.
2. Render lee `render.yaml` y pide los valores marcados como secretos:
   - `CLAUDE_API_KEY`: obligatoria. Sin ella el backend no arranca.
   - `RESEND_API_KEY` y `SENTRY_DSN`: pueden quedar vacías por ahora.
3. **Apply**. Los secretos JWT y la clave de cifrado se generan solos.
   **No regenerar `DATA_ENCRYPTION_KEY`**: los CVs guardados quedarían ilegibles.

La base de producción parte vacía: las cuentas de desarrollo no se copian.

## 2. DNS de fitcv.cl

NIC Chile solo delega el dominio a servidores DNS; los registros se crean en un
proveedor de DNS (por ejemplo Cloudflare, gratis). En NIC Chile se ponen los
servidores de nombres que entregue ese proveedor.

Registros (confirmar los valores exactos en Render → servicio → Settings → Custom Domains):

| Tipo | Nombre | Valor |
|---|---|---|
| A | `fitcv.cl` | `216.24.57.1` |
| CNAME | `www` | `fitcv-web.onrender.com` |
| CNAME | `api` | `fitcv-api.onrender.com` |

Con Cloudflare, dejar estos registros en **DNS only** (nube gris) para que Render emita el certificado.

Web y API deben quedar bajo `fitcv.cl`: la cookie de sesión no viaja entre dos
dominios `onrender.com`, así que antes del DNS la sesión dura solo 15 minutos.

## 3. Correo (recuperar contraseña)

1. Resend → **Domains → Add** `fitcv.cl` → crear en el DNS los registros que indica.
2. Copiar la API key en `fitcv-api` → Environment → `RESEND_API_KEY` → guardar (redespliega solo).

## 4. Verificar

- `https://api.fitcv.cl/health` responde `{"status":"ok"}`.
- Crear una cuenta en `https://fitcv.cl`, subir el CV y abrir Ofertas.
- Extensión: en el popup, dirección de la API `https://api.fitcv.cl/api` y vincular con el código del tablero.

## Notas

- Cada push a `main` redespliega los dos servicios.
- `NEXT_PUBLIC_API_URL` se fija al compilar la web: si cambia, redesplegar `fitcv-web`.
- Con más de una instancia de `fitcv-api`, poner `RUN_SCHEDULERS=false` en todas menos una.
