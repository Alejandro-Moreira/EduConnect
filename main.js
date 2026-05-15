function doPost(e) {
  try {
    // Seguridad: Validación inicial de la carga útil (HTTP POST)
    if (!e || !e.postData || !e.postData.contents) {
      return generarRespuesta(
        "Error",
        "No se recibió carga útil en la petición",
        400,
        { procesado: false },
      );
    }

    // Parsing usando JSON.parse(e.postData.contents)
    const payload = JSON.parse(e.postData.contents);

    // 1. Validación de campos obligatorios
    const camposFaltantes = validarCampos(payload);
    if (camposFaltantes.length > 0) {
      return generarRespuesta(
        "Error",
        "Faltan campos obligatorios: " + camposFaltantes.join(", "),
        400,
        {
          procesado: false,
          camposFaltantes,
        },
      );
    }

    // 2. Validación adicional: Formato de Email y Fecha
    if (!validarEmail(payload.representante.email)) {
      return generarRespuesta("Error", "Formato de email invalido", 400, {
        procesado: false,
      });
    }
    if (!validarFecha(payload.fecha)) {
      return generarRespuesta(
        "Error",
        "Formato de fecha debe ser ISO (YYYY-MM-DDTHH:MM:SS)",
        400,
        { procesado: false },
      );
    }

    // 3. Seguridad: Sanitización de entrada y prevención de inyección CSV
    const datosSanitizados = sanitizarDatos(payload);

    // 3. Control de Idempotencia (solicitud duplicada -> code 409)
    // El ID de hoja también se lee del PropertiesService para no tener credenciales hardcodeadas
    const sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
    if (!sheetId) {
      return generarRespuesta(
        "Error",
        "Fallo de configuración interna del servidor (SHEET_ID)",
        500,
        { procesado: false },
      );
    }
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];

    if (existeSolicitud(sheet, datosSanitizados.solicitudId)) {
      return generarRespuesta(
        "Error",
        "Solicitud duplicada (ID: " + datosSanitizados.solicitudId + ")",
        409,
        {
          procesado: false,
        },
      );
    }

    // 4. Registro en Google Sheets con appendRow()
    let sheetsOk = false;
    try {
      sheet.appendRow([
        datosSanitizados.solicitudId,
        datosSanitizados.fecha,
        datosSanitizados.estudiante.nombre,
        datosSanitizados.estudiante.grado,
        datosSanitizados.representante.nombre,
        datosSanitizados.representante.email,
        datosSanitizados.colegio,
        datosSanitizados.canalOrigen,
        datosSanitizados.estado,
        new Date().toISOString(),
      ]);
      sheetsOk = true;
    } catch (err) {
      // falla de Sheets -> code 500
      return generarRespuesta(
        "Error",
        "Fallo el registro en Google Sheets",
        500,
        { procesado: false },
      );
    }

    // 5. Notificación a Discord Webhook usando UrlFetchApp.fetch()
    let discordExito = false;
    if (sheetsOk) {
      const resultadoDiscord = enviarNotificacion(datosSanitizados);
      discordExito = resultadoDiscord.ok;
    }

    // 6. Respuesta lógica al cliente en formato JSON (Google Apps Script siempre retorna HTTP 200 en la capa de red)
    if (discordExito) {
      return generarRespuesta(
        "Exito",
        "Solicitud registrada y notificada correctamente",
        200,
        { procesado: true },
      );
    } else {
      // falla del Webhook -> persistencia exitosa pero notificación fallida
      return generarRespuesta(
        "Exito Parcial",
        "Guardado en Sheets, pero fallo la notificación a Discord",
        200,
        { procesado: true, warning: "Webhook fallido" },
      );
    }
  } catch (error) {
    // JSON inválido -> code 400
    return generarRespuesta("Error", "JSON invalido o malformado", 400, {
      procesado: false,
    });
  }
}

// --- FUNCIONES DEL MIDDLEWARE ---

const CAMPOS_OBLIGATORIOS = [
  { ruta: "solicitudId", label: "solicitudId" },
  { ruta: "fecha", label: "fecha" },
  { ruta: "estudiante.nombre", label: "estudiante.nombre" },
  { ruta: "estudiante.grado", label: "estudiante.grado" },
  { ruta: "representante.nombre", label: "representante.nombre" },
  { ruta: "representante.email", label: "representante.email" },
  { ruta: "colegio", label: "colegio" },
  { ruta: "canalOrigen", label: "canalOrigen" },
  { ruta: "estado", label: "estado" },
];

function validarCampos(payload) {
  const faltantes = [];
  CAMPOS_OBLIGATORIOS.forEach((campo) => {
    const partes = campo.ruta.split(".");
    let valor = payload;
    for (let p of partes) {
      valor = valor && valor[p] !== undefined ? valor[p] : undefined;
    }
    if (
      valor === undefined ||
      valor === null ||
      valor.toString().trim() === ""
    ) {
      faltantes.push(campo.label);
    }
  });
  return faltantes;
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarFecha(fecha) {
  // Valida estrictamente el formato YYYY-MM-DDTHH:MM:SS
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fecha);
}

function sanitizarTexto(texto) {
  if (typeof texto !== "string") return texto;
  // Prevenir Inyección CSV: si empieza con =, +, -, o @, agregar un apóstrofe simple
  let limpio = texto.trim();
  if (/^[=\+\-@]/.test(limpio)) {
    limpio = "'" + limpio;
  }
  return limpio;
}

function sanitizarDatos(payload) {
  return {
    solicitudId: sanitizarTexto(payload.solicitudId),
    fecha: sanitizarTexto(payload.fecha),
    estudiante: {
      nombre: sanitizarTexto(payload.estudiante.nombre),
      grado: sanitizarTexto(payload.estudiante.grado),
    },
    representante: {
      nombre: sanitizarTexto(payload.representante.nombre),
      email: sanitizarTexto(payload.representante.email),
    },
    colegio: sanitizarTexto(payload.colegio),
    canalOrigen: sanitizarTexto(payload.canalOrigen),
    estado: sanitizarTexto(payload.estado),
  };
}

function existeSolicitud(sheet, id) {
  const data = sheet.getRange("A:A").getValues();
  const ids = data.flat().map((cell) => cell.toString().trim());
  return ids.includes(id.toString().trim());
}

function enviarNotificacion(data) {
  try {
    // Seguridad: Uso de PropertiesService (sin credenciales hardcodeadas)
    const webhookUrl = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL");
    if (!webhookUrl)
      throw new Error("Webhook URL no configurado en PropertiesService");

    // Seguridad: Mínima exposición de datos (El email completo NO se envía a Discord)
    const emailParts = data.representante.email.split("@");
    let maskedEmail =
      emailParts.length === 2
        ? emailParts[0].substring(0, 2) + "***@" + emailParts[1]
        : "***";

    const mensaje = {
      content: `**Nueva Solicitud: ${data.solicitudId}**\nEstudiante: ${data.estudiante.nombre}\nGrado: ${data.estudiante.grado}\nColegio: ${data.colegio}\nEmail Rep.: ${maskedEmail}\nEstado: ${data.estado}`,
    };

    const resp = UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(mensaje),
      muteHttpExceptions: true,
    });

    return resp.getResponseCode() < 300
      ? { ok: true }
      : { ok: false, error: resp.getResponseCode() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function generarRespuesta(status, message, code, extra) {
  const res = Object.assign(
    { status, message, code, timestamp: new Date().toISOString() },
    extra || {},
  );

  // Google Apps Script siempre retorna HTTP 200.
  // Los códigos reales viajan dentro del JSON lógico de la respuesta.
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
