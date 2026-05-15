# EduConnect - Sistema de Notificaciones Integrado

## Descripcion Rapida

EduConnect API integra solicitudes de admision estudiantil con:
- Google Sheets: Registro persistente de solicitudes
- Discord Webhook: Notificaciones automaticas en tiempo real

Recibe solicitudes JSON, valida datos, registra en Sheets y notifica a Discord automaticamente.

---

## Quick Start

### 1. Configuracion Inicial

Nuestra integracion utiliza PropertiesService para no quemar credenciales en el codigo.
Debes configurar las siguientes Propiedades de secuencia de comandos desde la configuracion de Google Apps Script:

- SHEET_ID: ID de tu Google Sheet
- WEBHOOK_URL: URL del Webhook de Discord

### 2. Desplegar en Google Apps Script

Despliega el script configurandolo como Aplicacion Web. 
Asegurate de que en "Quien tiene acceso" este seleccionado "Cualquier persona" (Anyone).
Acepta los permisos de Google.

### 3. Probar con Postman

1. Configura una peticion POST en Postman con la URL obtenida.
2. Agrega el Header "Content-Type: application/json" (opcional pero recomendado).
3. Pega el Payload en la pestana Body -> raw -> JSON.
4. Ejecuta los casos de prueba.

---

## Flujo de Proceso

```
Solicitud JSON
      |
  Validaciones
  (campos, email, fecha)
      |
  Valida? -> HTTP 400
      | Si
Duplicada? -> HTTP 409
      | No
Registrar en Sheets
Notificar a Discord
      |
Respuesta al cliente
(200, 207 o 500)
```

---

## Campos Obligatorios

| Campo | Tipo | Validacion |
|-------|------|-----------|
| solicitudId | string | No vacio, unico en Sheet |
| fecha | string | ISO 8601: YYYY-MM-DDTHH:MM:SS |
| estudiante.nombre | string | No vacio |
| estudiante.grado | string | No vacio (ej: "10 EGB") |
| representante.nombre | string | No vacio |
| representante.email | string | Formato valido xxx@yyy.zzz |
| colegio | string | No vacio |
| canalOrigen | string | No vacio (ej: "formulario_web") |
| estado | string | No vacio (ej: "pendiente") |

---

## Ejemplo de Solicitud Valida

```json
{
  "solicitudId": "SOL-2026-0042",
  "fecha": "2026-05-14T21:00:00",
  "estudiante": {
    "nombre": "Maria Lopez Torres",
    "grado": "Decimo EGB"
  },
  "representante": {
    "nombre": "Ana Torres Mendoza",
    "email": "ana.torres@email.com"
  },
  "colegio": "Unidad Educativa EduConnect",
  "canalOrigen": "formulario_web",
  "estado": "pendiente"
}
```

---

## Respuestas del Sistema

### Exito Total (HTTP 200)

```json
{
  "status": "Exito",
  "message": "Solicitud registrada y notificada correctamente",
  "code": 200,
  "timestamp": "2026-05-14T14:30:45.123Z",
  "procesado": true
}
```
- Datos guardados en Google Sheets
- Notificacion enviada en Discord

---

### Exito Parcial (HTTP 200)

```json
{
  "status": "Exito Parcial",
  "message": "Guardado en Sheets, pero fallo la notificacion a Discord",
  "code": 200,
  "timestamp": "2026-05-14T14:30:45.123Z",
  "procesado": true,
  "warning": "Webhook fallido"
}
```
- Datos registrados en Sheets
- Notificacion a Discord fallo (ej: Error 429 Rate Limit)

---

### Error de Validacion (HTTP 400)

```json
{
  "status": "Error",
  "message": "Faltan campos obligatorios: estado",
  "code": 400,
  "timestamp": "2026-05-14T14:30:45.123Z",
  "procesado": false
}
```
- Solicitud no procesada
- No se registra en Sheets
- No se envia a Discord

---

### Solicitud Duplicada (HTTP 409)

```json
{
  "status": "Error",
  "message": "Solicitud duplicada (ID: SOL-2026-0042)",
  "code": 409,
  "timestamp": "2026-05-14T14:30:45.123Z",
  "procesado": false
}
```
- El solicitudId ya existe en la Sheet
- Proteccion contra duplicados (Idempotencia)

---

### Error Total (HTTP 500)

```json
{
  "status": "Error",
  "message": "Fallo el registro en Google Sheets",
  "code": 500,
  "timestamp": "2026-05-14T14:30:45.123Z",
  "procesado": false
}
```
- Ambos servicios fallaron
- Solicitud rechazada completamente

---

## Escenarios de Error Demostrados

### 1. Falta campo obligatorio

Respuesta: HTTP 400 - "Faltan campos obligatorios: solicitudId"

---

### 2. Email invalido

Respuesta: HTTP 400 - "Formato de email invalido"

---

### 3. Fecha incorrecta

Respuesta: HTTP 400 - "Formato de fecha debe ser ISO (YYYY-MM-DDTHH:MM:SS)"

---

### 4. Solicitud duplicada

Respuesta: HTTP 409 - "Solicitud duplicada (ID: SOL-2026-0042)"

---

## Casos Especiales

### Que pasa si Google Sheets no responde?

Escenario:
- Timeout en Sheets o permisos insuficientes en la hoja

Resultado:
- Si falla, el script no intenta notificar a Discord y rechaza todo devolviendo HTTP 500.

### Que pasa si Discord no recibe la notificacion?

Escenarios:
- Error 429: Discord saturado (Rate Limit de Cloudflare por usar IP de Google)
- Error 5xx: Servidor Discord caido

Resultado:
- Retorna Exito Parcial (HTTP 200 con code 200 logico pero estado Exito Parcial).
- Datos persistidos en Sheets, falta solo notificacion.
- Exception manejada con muteHttpExceptions = true.

### Que pasa si llega dos veces la misma solicitud?

Escenario:
- Usuario hace submit del formulario 2 veces

Resultado:
- Primera solicitud: HTTP 200 (registrada)
- Segunda solicitud identica: HTTP 409 (rechazada)
- Proteccion: Solo 1 registro en Sheets, 1 notificacion en Discord
- Idempotencia garantizada

---

## Estructura de Google Sheets

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| solicitudId | fecha | est.nombre | est.grado | rep.nombre | rep.email | colegio | canal | estado | timestamp |
| SOL-001 | 2026-05-14T10:00 | Juan P. | 10 EGB | Carlos P. | c@ex.com | Colegio A | Postman | Pendiente | 2026-05-14T10:05Z |

---

## Medidas de Seguridad

- Validacion exhaustiva de campos y formatos
- Control de duplicados mediante busqueda de ID unico
- Prevencion de Inyeccion CSV con funcion de sanitizacion
- Webhook y ID de Sheets protegidos en PropertiesService
- Enmascarado de correo electronico antes de enviar a Discord
- Excepciones capturadas con try-catch en bloques criticos
- muteHttpExceptions en Discord para evitar crashes no controlados

---

## Pruebas (Casos de uso Postman)

1. Registro Exitoso: JSON completo y correcto (Retorna 200).
2. Campos Faltantes: Omitir estado o nombre (Retorna 400).
3. Idempotencia: Enviar la misma peticion otra vez (Retorna 409).
4. Formato Invalido: Enviar email sin arroba o fecha incorrecta (Retorna 400).

---

Sistema de Notificaciones EduConnect
Integracion de Sistemas - Semana 6
14 de Mayo de 2026
