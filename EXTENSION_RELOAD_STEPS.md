# Recargar extensión FITCV — Ciclo completo

## Paso 1: Recargar la extensión en Chrome

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa **"Modo de desarrollador"** (arriba a la derecha)
3. Busca **"FITCV — Postulación"** en la lista
4. Haz clic en el botón **"Recargar"** (círculo con flecha)

✅ La extensión ya está lista con:
- **Captura bulk** de ofertas (LinkedIn, Laborum, etc.)
- **Cola automática** de postulaciones
- **Envío automático** con rellenado de formularios

---

## Paso 2: Vincular la extensión a tu cuenta FITCV

1. Abre cualquier página web
2. Haz clic en el ícono de FITCV (arriba a la derecha en la barra de herramientas)
3. Copia la **API URL**: `https://api.fitcv.cl/api`
4. Genera un código de emparejamiento en tu dashboard de FITCV:
   - Ve a Mis respuestas → Configuración → Generar código para extensión
5. Pega el código en el popup y haz clic en **"Vincular"**

✅ Ya está vinculada a tu cuenta.

---

## Paso 3: Probar captura de ofertas (LinkedIn o Laborum)

### Capturar ofertas desde LinkedIn:

1. Ve a https://linkedin.com/jobs/search?keywords=python
2. Haz clic en el popup de FITCV
3. Haz clic en **"Capturar ofertas de esta página"**
4. Espera ~2-3 segundos
5. Verás en la actividad: `Capturadas X/X ofertas de linkedin.com`
6. Las ofertas se agregaron automáticamente a la cola

### Capturar ofertas desde Laborum:

1. Ve a https://www.laborum.cl/buscar-trabajo
2. Haz clic en el popup de FITCV
3. Haz clic en **"Capturar ofertas de esta página"**
4. Verás en la actividad: `Capturadas X/X ofertas de laborum.cl`

✅ Las ofertas capturadas están en la cola lista para postular.

---

## Paso 4: Iniciar envío automático

1. Haz clic en el popup de FITCV
2. Haz clic en **"Iniciar envío"**
3. El popup mostrará: `Envío activo: esperando postulaciones en cola.`
4. FITCV abrirá pestañas automáticamente por cada oferta y:
   - Rellenará el formulario con tus datos verificados
   - Adaptará tu CV según la oferta
   - Enviará la postulación automáticamente
   - Reportará el resultado (enviada / requiere atención / error)

✅ El ciclo está completo:
```
Página web (LinkedIn/Laborum)
    ↓
Capturar ofertas (bulk)
    ↓
Cola de FITCV
    ↓
Postulación automática
    ↓
CV adaptado + formulario rellenado
    ↓
Resultado reportado
```

---

## Paso 5: Monitorear en dashboard

1. Ve a tu dashboard de FITCV (fitcv.cl)
2. Ve a **Mis postulaciones**
3. Verás cada oferta con su estado:
   - ✅ **Enviada**: formulario completo, enviado exitosamente
   - ⚠️ **Requiere tu atención**: FITCV paró en un paso (login, CAPTCHA, etc.)
   - ❌ **Error**: algo no funcionó (página bloqueada, oferta sin enlace, etc.)

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| La extensión no aparece en chrome://extensions | Asegúrate de estar en Modo de desarrollador |
| "No se encontraron ofertas" | Asegúrate de estar en LinkedIn/Laborum con ofertas visibles en la página |
| "La extensión no está vinculada" | Genera un código en dashboard y vincúlalo (Paso 2) |
| Las postulaciones se paran en un formulario | FITCV requiere tu atención: abre la pestaña que quedó abierta y completa lo que falta |

---

## ¿Qué pasó detrás?

**Cambios implementados:**

1. **`fitcv-extension/content/offerExtractor.js`** (nuevo)
   - Extrae ofertas de LinkedIn (data-job-id)
   - Extrae ofertas de Laborum (href patterns)
   - Fallback genérico para otros portales

2. **`fitcv-extension/background.js`** (actualizado)
   - Nuevo comando `fitcv:extract-offers`
   - Inyecta offerExtractor en la página
   - Normaliza y guarda cada oferta en `/extension/offers` con `queue: true`
   - Las ofertas entran automáticamente en la cola de postulación

3. **`fitcv-extension/popup.html`** (actualizado)
   - Botón renombrado: "Capturar ofertas de esta página"

4. **`fitcv-extension/popup.js`** (actualizado)
   - Dispara `fitcv:extract-offers` en lugar de `fitcv:capture`
   - Muestra conteo de ofertas capturadas

5. **`src/services/sources/jobPosting.ts`** (actualizado)
   - Agregado Jobrapido como portal con sitemap (lectura automática cada hora)

**El ciclo completo:**
- Servidor lee 8+ portales cada hora (Get on Board, Trabajando, Computrabajo, Jobrapido, etc.)
- Extensión captura ofertas de portales bloqueados (LinkedIn, Laborum) manualmente o en batch
- Todas las ofertas entran a la misma cola
- `processNext()` procesa una por vez
- Abre la oferta en una pestaña, inyecta `apply.js`
- Rellenamiento automático + envío + reporte

✅ **Ya está listo.**
