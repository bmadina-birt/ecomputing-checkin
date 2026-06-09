/**
 * eComputing 2026 - API de check-in v3.1
 * Google Apps Script + Google Sheets
 *
 * Despliegue recomendado:
 * - Ejecutar como: la cuenta BIRTLH de check-in
 * - Acceso: cualquiera con el enlace
 * - Seguridad: PIN interno + hoja sin datos sensibles innecesarios
 */

const CONFIG = {
  SPREADSHEET_ID: 'PEGA_AQUI_EL_ID_DE_LA_GOOGLE_SHEET',
  SHEET_ASISTENTES: 'Asistentes',
  SHEET_LOG: 'Log',
  PIN: '2468',
  TIMEZONE: 'Europe/Madrid'
};

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = String(params.action || 'health');

  try {
    if (action === 'health') {
      return output_({ ok: true, app: 'ecomputing-checkin-api', version: '3.1' }, params);
    }

    if (!isValidPin_(params.pin)) {
      return output_({ ok: false, error: 'PIN incorrecto' }, params);
    }

    switch (action) {
      case 'lookup':
        return output_(lookup_(params.code || ''), params);
      case 'search':
        return output_(search_(params.q || ''), params);
      case 'checkin':
        return output_(checkin_(params.code || '', params.day || '', params.operator || ''), params);
      case 'checkinRow':
        return output_(checkinByRow_(params.row || '', params.day || '', params.operator || ''), params);
      case 'summary':
        return output_(summary_(), params);
      default:
        return output_({ ok: false, error: 'Acción no reconocida: ' + action }, params);
    }
  } catch (err) {
    return output_({ ok: false, error: String(err && err.message ? err.message : err) }, params);
  }
}

function output_(payload, params) {
  const json = JSON.stringify(payload);
  const callback = String((params && params.callback) || '');

  // JSONP para permitir llamadas desde GitHub Pages u otra web estática.
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function isValidPin_(pin) {
  return String(pin || '') === String(CONFIG.PIN || '');
}

function ss_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('No existe la hoja: ' + name);
  return sh;
}

function normalizeHeader_(h) {
  return String(h || '').trim().toLowerCase();
}

function requireColumns_(index, names) {
  const missing = names.filter(name => index[name] === undefined);
  if (missing.length) throw new Error('Faltan columnas en Asistentes: ' + missing.join(', '));
}

function readTable_() {
  const sh = sheet_(CONFIG.SHEET_ASISTENTES);
  const values = sh.getDataRange().getValues();
  if (values.length < 1) throw new Error('La hoja Asistentes está vacía');

  const headers = values[0].map(h => normalizeHeader_(h));
  const index = {};
  headers.forEach((h, i) => { if (h) index[h] = i; });

  requireColumns_(index, ['codigo_qr', 'token', 'nombre', 'apellidos', 'institucion', 'email']);

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r].join('').trim() === '') continue;
    rows.push({ rowNumber: r + 1, values: values[r] });
  }

  return { sh, headers, index, rows };
}

function ensureOptionalColumns_(index) {
  requireColumns_(index, [
    'checkin_jueves', 'hora_jueves', 'operador_jueves',
    'checkin_viernes', 'hora_viernes', 'operador_viernes',
    'observaciones'
  ]);
}

function cleanCode_(raw) {
  let code = String(raw || '').trim();

  // Si el QR contiene una URL tipo ...?code=XXX, extrae el parámetro code.
  try {
    if (/^https?:\/\//i.test(code)) {
      const url = new URL(code);
      const paramCode = url.searchParams.get('code') || url.searchParams.get('qr') || url.searchParams.get('c');
      if (paramCode) code = paramCode;
    }
  } catch (err) {}

  return code.trim();
}

function payloadForRow_(row, index) {
  const code = String(row[index.codigo_qr] || '').trim();
  const token = String(row[index.token] || '').trim();
  return token ? code + '-' + token : code;
}

function formatCellDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}

function rowToAttendee_(rowNumber, row, index, includePrivate) {
  const attendee = {
    row: rowNumber,
    codigo_qr: String(row[index.codigo_qr] || '').trim(),
    nombre: String(row[index.nombre] || '').trim(),
    apellidos: String(row[index.apellidos] || '').trim(),
    institucion: String(row[index.institucion] || '').trim(),
    email: String(row[index.email] || '').trim(),
    checkin_jueves: String(row[index.checkin_jueves] || '').trim(),
    hora_jueves: formatCellDate_(row[index.hora_jueves]),
    operador_jueves: String(row[index.operador_jueves] || '').trim(),
    checkin_viernes: String(row[index.checkin_viernes] || '').trim(),
    hora_viernes: formatCellDate_(row[index.hora_viernes]),
    operador_viernes: String(row[index.operador_viernes] || '').trim(),
    observaciones: String(row[index.observaciones] || '').trim()
  };

  if (includePrivate) attendee.qr_payload = payloadForRow_(row, index);
  return attendee;
}

function findByCode_(code) {
  const clean = cleanCode_(code);
  if (!clean) return { found: false, error: 'Código vacío' };

  const table = readTable_();
  const index = table.index;

  for (const item of table.rows) {
    const row = item.values;
    const publicCode = String(row[index.codigo_qr] || '').trim();
    const payload = payloadForRow_(row, index);

    if (clean === publicCode || clean === payload) {
      return { found: true, table, rowNumber: item.rowNumber, row };
    }
  }

  return { found: false, error: 'No se ha encontrado ningún asistente con ese QR/código' };
}

function lookup_(code) {
  const result = findByCode_(code);
  if (!result.found) return { ok: false, error: result.error };

  ensureOptionalColumns_(result.table.index);
  return {
    ok: true,
    attendee: rowToAttendee_(result.rowNumber, result.row, result.table.index, false)
  };
}

function search_(query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return { ok: false, error: 'Escribe al menos 2 caracteres para buscar' };

  const table = readTable_();
  const index = table.index;
  ensureOptionalColumns_(index);
  const results = [];

  for (const item of table.rows) {
    const row = item.values;
    const haystack = [
      row[index.codigo_qr],
      row[index.nombre],
      row[index.apellidos],
      row[index.institucion],
      row[index.email]
    ].join(' ').toLowerCase();

    if (haystack.includes(q)) {
      results.push(rowToAttendee_(item.rowNumber, row, index, false));
      if (results.length >= 12) break;
    }
  }

  return { ok: true, results };
}

function dayColumns_(day, index) {
  const d = String(day || '').toLowerCase().trim();
  if (d === 'jueves' || d === '2' || d === 'dia2') {
    return {
      label: 'jueves 2',
      checkin: index.checkin_jueves,
      hora: index.hora_jueves,
      operador: index.operador_jueves
    };
  }
  if (d === 'viernes' || d === '3' || d === 'dia3') {
    return {
      label: 'viernes 3',
      checkin: index.checkin_viernes,
      hora: index.hora_viernes,
      operador: index.operador_viernes
    };
  }
  throw new Error('Día no válido. Usa jueves o viernes.');
}

function checkin_(code, day, operator) {
  const result = findByCode_(code);
  if (!result.found) return { ok: false, error: result.error };
  return checkinAtRow_(result.table, result.rowNumber, day, operator);
}

function checkinByRow_(rowNumber, day, operator) {
  const table = readTable_();
  const n = Number(rowNumber);
  if (!n || n < 2) return { ok: false, error: 'Fila no válida' };

  const rowValues = table.sh.getRange(n, 1, 1, table.headers.length).getValues()[0];
  if (!rowValues || rowValues.join('').trim() === '') return { ok: false, error: 'No hay asistente en esa fila' };

  return checkinAtRow_(table, n, day, operator);
}

function checkinAtRow_(table, rowNumber, day, operator) {
  ensureOptionalColumns_(table.index);

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    // Releer la fila dentro del lock para evitar duplicados simultáneos.
    const row = table.sh.getRange(rowNumber, 1, 1, table.headers.length).getValues()[0];
    const cols = dayColumns_(day, table.index);
    const already = String(row[cols.checkin] || '').trim();
    const attendeeBefore = rowToAttendee_(rowNumber, row, table.index, false);

    if (already) {
      return {
        ok: true,
        duplicate: true,
        message: 'Ya estaba registrado para ' + cols.label,
        day: cols.label,
        attendee: attendeeBefore,
        previous_time: formatCellDate_(row[cols.hora])
      };
    }

    const now = new Date();
    const op = String(operator || '').trim() || 'Recepción';

    table.sh.getRange(rowNumber, cols.checkin + 1).setValue('Sí');
    table.sh.getRange(rowNumber, cols.hora + 1).setValue(now);
    table.sh.getRange(rowNumber, cols.operador + 1).setValue(op);

    appendLog_(attendeeBefore, cols.label, op, now);

    const updated = table.sh.getRange(rowNumber, 1, 1, table.headers.length).getValues()[0];

    return {
      ok: true,
      duplicate: false,
      message: 'Check-in registrado para ' + cols.label,
      day: cols.label,
      attendee: rowToAttendee_(rowNumber, updated, table.index, false),
      time: Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
    };
  } finally {
    lock.releaseLock();
  }
}

function appendLog_(attendee, day, operator, date) {
  let log = ss_().getSheetByName(CONFIG.SHEET_LOG);
  if (!log) {
    log = ss_().insertSheet(CONFIG.SHEET_LOG);
    log.appendRow(['fecha', 'dia', 'codigo_qr', 'nombre', 'apellidos', 'institucion', 'email', 'operador']);
  }

  log.appendRow([
    date,
    day,
    attendee.codigo_qr,
    attendee.nombre,
    attendee.apellidos,
    attendee.institucion,
    attendee.email,
    operator
  ]);
}

function summary_() {
  const table = readTable_();
  ensureOptionalColumns_(table.index);

  let total = 0;
  let jueves = 0;
  let viernes = 0;

  for (const item of table.rows) {
    total++;
    const row = item.values;
    if (String(row[table.index.checkin_jueves] || '').trim()) jueves++;
    if (String(row[table.index.checkin_viernes] || '').trim()) viernes++;
  }

  return { ok: true, total, jueves, viernes };
}

function inicializarHojas() {
  const ss = ss_();
  let asistentes = ss.getSheetByName(CONFIG.SHEET_ASISTENTES);
  if (!asistentes) asistentes = ss.insertSheet(CONFIG.SHEET_ASISTENTES);

  const headers = [
    'codigo_qr', 'token', 'nombre', 'apellidos', 'institucion', 'email',
    'checkin_jueves', 'hora_jueves', 'operador_jueves',
    'checkin_viernes', 'hora_viernes', 'operador_viernes',
    'observaciones'
  ];

  if (asistentes.getLastRow() === 0) {
    asistentes.appendRow(headers);
  }

  let log = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (!log) log = ss.insertSheet(CONFIG.SHEET_LOG);
  if (log.getLastRow() === 0) {
    log.appendRow(['fecha', 'dia', 'codigo_qr', 'nombre', 'apellidos', 'institucion', 'email', 'operador']);
  }
}
