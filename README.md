# 📋 EduConnect - Sistema de Notificaciones Integrado

## Descripción Rápida

**EduConnect API** integra solicitudes de admisión estudiantil con:
- ✅ **Google Sheets**: Registro persistente de solicitudes
- ✅ **Discord Webhook**: Notificaciones automáticas en tiempo real

Recibe solicitudes JSON, valida datos, registra en Sheets y notifica a Discord automáticamente.

---

## 🚀 Quick Start

### 1. Configuración Inicial

Actualiza estas constantes en `main.js`:

```javascript
const SHEET_ID = 'tu-id-aqui';  // ID de tu Google Sheet
const WEBHOOK_URL = 'tu-webhook-aqui';  // URL del Webhook de Discord
```

### 2. Desplegar en Google Apps Script

```bash
clasp create --type sheets
clasp push
clasp deploy
```

### 3. Probar con Postman

1. Importa `POSTMAN_TEST_CASES.json` en Postman
2. Reemplaza `{{DEPLOYMENT_URL}}` con tu URL de despliegue
3. Ejecuta los casos de prueba

---

## 📊 Flujo de Proceso

```
Solicitud JSON
      ↓
  Validaciones
  (campos, email, fecha)
      ↓
 ¿Válida? → ❌ HTTP 400
      ↓ ✅
¿Duplicada? → ❌ HTTP 409
      ↓ ✅
Registrar en Sheets
Notificar a Discord
      ↓
Respuesta al cliente
(200, 207 o 500)
```

---

## ✅ Campos Obligatorios

| Campo | Tipo | Validación |
|-------|------|-----------|
| `solicitudId` | string | No vacío, único en Sheet |
| `fecha` | string | ISO 8601: `YYYY-MM-DDTHH:MM:SS` |
| `estudiante.nombre` | string | No vacío |
| `estudiante.grado` | string | No vacío (ej: "10°") |
| `representante.nombre` | string | No vacío |
| `representante.email` | string | Formato válido `xxx@yyy.zzz` |
| `colegio` | string | No vacío |
| `canalOrigen` | string | No vacío (ej: "Postman", "Form") |
| `estado` | string | No vacío (ej: "Pendiente", "Aceptado") |

---

## 📝 Ejemplo de Solicitud Válida

```json
{
  "solicitudId": "SOL-2026-001",
  "fecha": "2026-05-14T14:30:00",
  "estudiante": {
    "nombre": "Juan Pérez",
    "grado": "10°"
  },
  "representante": {
    "nombre": "Carlos Pérez",
    "email": "carlos@example.com"
  },
  "colegio": "Colegio Central",
  "canalOrigen": "Postman",
  "estado": "Pendiente"
}
```

---

## 📬 Respuestas del Sistema

### ✅ Éxito Total (HTTP 200)

```json
{
  "status": "Éxito",
  "message": "Solicitud registrada y notificada",
  "code": 200,
  "timestamp": "2026-05-14T14:30:45.123Z"
}
```
- ✅ Datos en Google Sheets
- ✅ Notificación en Discord

---

### ⚠️ Éxito Parcial (HTTP 207)

```json
{
  "status": "Parcial",
  "message": "Datos guardados en Sheets, pero la notificación falló: Discord respondió con código 429",
  "code": 207,
  "timestamp": "2026-05-14T14:30:45.123Z"
}
```
- ✅ Datos registrados en Sheets
- ❌ Notificación a Discord falló (ej: Error 429 Rate Limit)

---

### ❌ Error de Validación (HTTP 400)

```json
{
  "status": "Error",
  "message": "Faltan campos obligatorios: estudiante.nombre",
  "code": 400,
  "timestamp": "2026-05-14T14:30:45.123Z"
}
```
- ❌ Solicitud no procesada
- ❌ No se registra en Sheets
- ❌ No se envía a Discord

---

### ❌ Solicitud Duplicada (HTTP 409)

```json
{
  "status": "Error",
  "message": "Solicitud duplicada (ID: SOL-2026-001)",
  "code": 409,
  "timestamp": "2026-05-14T14:30:45.123Z"
}
```
- ❌ El `solicitudId` ya existe en la Sheet
- ✅ Protección contra duplicados (Idempotencia)

---

### ❌ Error Total (HTTP 500)

```json
{
  "status": "Error",
  "message": "Falló el registro en Sheets y la notificación a Discord",
  "code": 500,
  "timestamp": "2026-05-14T14:30:45.123Z"
}
```
- ❌ Ambos servicios fallaron
- ❌ Solicitud rechazada completamente

---

## 🔍 Escenarios de Error Demostrados

### 1️⃣ Falta campo obligatorio

**Entrada sin `solicitudId`:**
```bash
curl -X POST https://tu-url \
  -H "Content-Type: application/json" \
  -d '{
    "fecha": "2026-05-14T14:30:00",
    "estudiante": {"nombre": "Juan", "grado": "10°"},
    "representante": {"nombre": "Carlos", "email": "c@ex.com"},
    "colegio": "Colegio A",
    "canalOrigen": "Postman",
    "estado": "Pendiente"
  }'
```

**Respuesta:** HTTP 400 - "Faltan campos obligatorios: solicitudId"

---

### 2️⃣ Email inválido

**Entrada con email sin dominio:**
```json
{
  "representante": {
    "email": "correo-sin-dominio"
  }
}
```

**Respuesta:** HTTP 400 - "Formato de email inválido"

---

### 3️⃣ Fecha incorrecta

**Entrada con fecha no ISO:**
```json
{
  "fecha": "14-05-2026 14:30"
}
```

**Respuesta:** HTTP 400 - "Formato de fecha debe ser ISO (YYYY-MM-DDTHH:MM:SS)"

---

### 4️⃣ Solicitud duplicada

**Primer POST con SOL-2026-500:** HTTP 200 ✅
**Segundo POST idéntico:** HTTP 409 ❌

```json
{
  "status": "Error",
  "message": "Solicitud duplicada (ID: SOL-2026-500)",
  "code": 409,
  "timestamp": "..."
}
```

---

## ❓ Casos Especiales

### 📊 ¿Qué pasa si Google Sheets no responde?

**Escenario:**
- Red caída, timeout en Sheets
- Permisos insuficientes en la hoja

**Resultado:**
- ✅ Si Discord funciona → HTTP 207 (Parcial)
  - Mensaje: "Notificación enviada, pero no se registró en Sheets"
  - Equipo notificado pero datos NO persistidos
- ❌ Si Discord también falla → HTTP 500 (Error total)

**Auditoría:**
- El error exacto se registra en console.error()
- Timestamp captura cuándo falló

---

### 🔔 ¿Qué pasa si Discord no recibe la notificación?

**Escenarios:**
- Error 429: Discord saturado (Rate Limit)
- Error 5xx: Servidor Discord caído
- Webhook expirado o inválido
- Red no responde

**Resultado:**
- ✅ Si Sheets funciona → HTTP 207 (Parcial)
  - Mensaje: "Datos guardados en Sheets, pero la notificación falló: [error]"
  - Datos persistidos, falta solo notificación
- ❌ Si Sheets también falla → HTTP 500 (Error total)

**Auditoría:**
- El código HTTP específico se reporta al cliente
- Error 429 se diferencia de otros errores

---

### 🔄 ¿Qué pasa si llega dos veces la misma solicitud?

**Escenario:**
- Usuario hace submit del formulario 2 veces
- Sistema reintenta por timeout
- Integración manual envía mismo JSON

**Resultado:**
- ✅ **Primera solicitud:** HTTP 200 (registrada)
- ❌ **Segunda solicitud idéntica:** HTTP 409 (rechazada)
- ✅ **Protección:** Solo 1 registro en Sheets, 1 notificación en Discord
- ✅ **Idempotencia garantizada**

**Lógica:**
```javascript
if (existeSolicitud(sheet, payload.solicitudId)) {
  return HTTP 409 // ← Rechaza duplicada
}
```

---

## 📋 Estructura de Google Sheets

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| **solicitudId** | **fecha** | **est.nombre** | **est.grado** | **rep.nombre** | **rep.email** | **colegio** | **canal** | **estado** | **timestamp** |
| SOL-001 | 2026-05-14T10:00 | Juan P. | 10° | Carlos P. | c@ex.com | Colegio A | Postman | Pendiente | 2026-05-14T10:05Z |
| SOL-002 | 2026-05-14T11:00 | María L. | 11° | Ana L. | a@ex.com | Instituto B | Form | Aceptado | 2026-05-14T11:05Z |

---

## 🛡️ Medidas de Seguridad

✅ **Validación exhaustiva** de campos y formatos  
✅ **Control de duplicados** mediante búsqueda de ID único  
✅ **Manejo independiente** de servicios (fallo en uno no mata el otro)  
✅ **Excepciones capturadas** con try-catch en bloques críticos  
✅ **muteHttpExceptions** en Discord para evitar crashes  
✅ **Auditoría completa** con timestamps y console.error()  
✅ **Respuestas descriptivas** que permiten diagnóstico rápido  

---

## 📚 Documentación Completa

Para detalles técnicos, diagrama de flujo y análisis completo, ver:
- 📄 **[DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md)**

---

## 🧪 Pruebas

### Archivo de Casos de Prueba

Ver `POSTMAN_TEST_CASES.json` con 10 escenarios:

1. ✅ Solicitud válida completa
2. ❌ Falta `solicitudId`
3. ❌ Falta `estudiante.nombre`
4. ❌ Falta `representante.email`
5. ❌ Email formato inválido
6. ❌ Fecha formato incorrecto
7. ❌ Solicitud duplicada
8. ⚠️ Sheets OK, Discord falla (HTTP 207)
9. ⚠️ Sheets falla, Discord OK (HTTP 207)
10. ❌ Ambos servicios fallan (HTTP 500)

**Importar en Postman:**
1. Postman → Import → Selecciona `POSTMAN_TEST_CASES.json`
2. Reemplaza `{{DEPLOYMENT_URL}}` con tu URL
3. Ejecuta cada caso y verifica respuestas

---

## 📋 Checklist de Requisitos

| Requisito | Cumplido |
|-----------|----------|
| Registrar en Google Sheets | ✅ |
| Enviar notificación a Discord | ✅ |
| Validar campos obligatorios | ✅ |
| Notificación con ID, nombre, grado, colegio, estado | ✅ |
| Respuesta indicando éxito o error | ✅ |
| Demostración de escenarios de error | ✅ |
| Diagrama de flujo | ✅ |
| Explicación de casos especiales | ✅ |
| Evidencias de pruebas | ✅ |
| Manejo de error Google Sheets | ✅ |
| Manejo de error Discord | ✅ |
| Control de duplicados (Idempotencia) | ✅ |
| Claridad del documento | ✅ |

---

## 📞 Contacto y Soporte

Para preguntas o problemas:
- Revisar `DOCUMENTACION_TECNICA.md`
- Verificar logs en Google Apps Script console
- Validar configuración de SHEET_ID y WEBHOOK_URL
- Probar con casos de `POSTMAN_TEST_CASES.json`

---

**Sistema de Notificaciones EduConnect**  
*Integración de Sistemas — Semana 6*  
*14 de Mayo de 2026*
