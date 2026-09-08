# 🧪 FITCV Testing - Quick Start

## Paso 1: Lanzar Backend

```bash
# Terminal 1
cd C:\Users\Userx\Desktop\fitcv-mvp
npm run dev
```

**Esperado:**
```
🚀 FITCV API running on http://localhost:3000
📊 Health check: http://localhost:3000/health
```

Espera 5 segundos para que inicie completamente.

---

## Paso 2: Testear Health Check

```bash
# Terminal 2 - Verifica que el servidor responde
curl http://localhost:3000/health
```

**Esperado:**
```json
{"status":"ok","timestamp":"2026-09-08T..."}
```

Si ves esto: ✅ **Backend funciona**

---

## Paso 3: Ejecutar Tests Automáticos

```bash
# Terminal 2
cd C:\Users\Userx\Desktop\fitcv-mvp
.\test-api.ps1
```

**Qué pasa:**
1. ✅ Registra usuario (test@example.com)
2. ✅ Login
3. ✅ Upload CV (texto de ejemplo)
4. ✅ Analiza perfil (Claude API - 10s)
5. ✅ Sugiere roles
6. ✅ Lista 5 ofertas mock
7. ✅ Crea postulación
8. ✅ Genera CV adaptado (Claude - 10s)
9. ✅ Descarga CV
10. ✅ Actualiza estado
11. ✅ Prueba errores (401, 400, 404)

**Esperado: Todos los tests pasan ✅**

---

## Paso 4: Testing con Postman (Opcional)

```bash
# Si tienes Postman instalado:
1. Abre Postman
2. File → Import → fitcv.postman_collection.json
3. En variables, verifica base_url = http://localhost:3000
4. Haz click en "Register"
5. Haz click en "Send"
6. Los tokens se guardan automáticamente
7. Continúa con Login → Upload CV → etc.
```

---

## Paso 5: Testing Manual con cURL

```bash
# 1. Registrar
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"manual@test.com","password":"TestPass123!"}'

# Copiar el accessToken de la respuesta, luego:

# 2. Listar ofertas
curl -X GET http://localhost:3000/api/offers \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"

# Deberías ver 5 ofertas mock
```

---

## ✅ Checklist de Testing

- [ ] Backend inicia sin errores
- [ ] Health check responde
- [ ] test-api.ps1 corre al 100%
- [ ] Todos los 15+ endpoints testeados
- [ ] Claude API genera CVs adaptados
- [ ] ATS scores calculados
- [ ] Errores 401/400/404 validados
- [ ] Rate limiting (429) testeado

---

## Si algo falla...

### Backend no inicia
```bash
# Verificar puerto
netstat -ano | findstr :3000

# Matar proceso si necesario
taskkill /PID <PID> /F

# Verificar dependencias
npm install
npx tsc
npm run dev
```

### Test falla
```bash
# Ver errores específicos
npm run dev         # Revisa la consola del backend
.\test-api.ps1      # Verifica el output del test
```

### CLAUDE_API_KEY error
```bash
# Si no tienes CLAUDE_API_KEY, los CVs usarán fallback
# Pero todo debería funcionar (con CV genérico)

# Para activar completamente:
# 1. Obtener key en https://console.anthropic.com
# 2. Agregar a .env:
CLAUDE_API_KEY=sk-ant-xxxxx
# 3. Reiniciar servidor
```

---

## Resultados Esperados

### test-api.ps1 Output:

```
🧪 FITCV API Testing Suite
============================

📋 AUTHENTICATION TESTS
✅ Register User
✅ Login User

📋 CV OPERATIONS TESTS
✅ Upload CV
✅ Get Profile
⏳ Generating role suggestions (calls Claude API, ~10s)...
✅ Suggest Roles
   Found 5 role suggestions
✅ List Roles

📋 JOB OFFERS TESTS
✅ List Offers
   Found 5 job offers
   Top: Senior Data Analyst at Amazon
✅ Get Offer Details
✅ Dashboard Stats

📋 POSTULATIONS TESTS
✅ Create Postulation
   Weight: 2pt (based on level)
✅ List Postulations
✅ Get Postulation Details
⏳ Generating adapted CV (calls Claude API, ~10s)...
✅ Generate Adapted CV
   ATS Score: 87
   Changes: 3
   Keywords: SQL, Python, AWS, ...
✅ Download CV
✅ Update Postulation

📋 ERROR HANDLING TESTS
✅ Missing Token (401)
✅ Invalid Data (400)
✅ Not Found (404)

📊 TEST RESULTS SUMMARY
========================

✅ Passed: 19
❌ Failed: 0
📊 Total:  19

🎉 ALL TESTS PASSED!
```

---

**Tiempo total: 2-3 minutos**

¡Procede cuando estés listo!
