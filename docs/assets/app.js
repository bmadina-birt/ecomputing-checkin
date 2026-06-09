(() => {
  const cfg = window.ECOMPUTING_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const els = {
    setupPanel: $('setupPanel'),
    appPanel: $('appPanel'),
    pin: $('pin'),
    operator: $('operator'),
    day: $('day'),
    cameraSelect: $('cameraSelect'),
    startBtn: $('startBtn'),
    testApiBtn: $('testApiBtn'),
    apiHealthDot: $('apiHealthDot'),
    currentDayLabel: $('currentDayLabel'),
    switchDayBtn: $('switchDayBtn'),
    settingsBtn: $('settingsBtn'),
    reader: $('reader'),
    scannerState: $('scannerState'),
    scanToggleBtn: $('scanToggleBtn'),
    clearBtn: $('clearBtn'),
    manualInput: $('manualInput'),
    manualBtn: $('manualBtn'),
    searchResults: $('searchResults'),
    resultBadge: $('resultBadge'),
    emptyState: $('emptyState'),
    attendeeView: $('attendeeView'),
    attendeeName: $('attendeeName'),
    attendeeInstitution: $('attendeeInstitution'),
    attendeeCode: $('attendeeCode'),
    juevesStatus: $('juevesStatus'),
    viernesStatus: $('viernesStatus'),
    checkinBtn: $('checkinBtn'),
    continueBtn: $('continueBtn'),
    message: $('message'),
    sumTotal: $('sumTotal'),
    sumJueves: $('sumJueves'),
    sumViernes: $('sumViernes'),
    refreshSummaryBtn: $('refreshSummaryBtn')
  };

  const state = {
    apiUrl: '',
    pin: '',
    operator: '',
    day: 'jueves',
    selectedCamera: '',
    scanner: null,
    scannerRunning: false,
    scannerPaused: false,
    lastScanAt: 0,
    currentAttendee: null,
    lastMessageTimer: null
  };

  function init() {
    loadPrefs();
    bindEvents();
    detectCameras(false);
    setDayLabel();
    setScannerBadge('parado', 'muted');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function loadPrefs() {
    const saved = JSON.parse(localStorage.getItem('ec_checkin_prefs') || '{}');
    state.apiUrl = normalizeApiUrl(cfg.API_URL || '');
    state.operator = saved.operator || cfg.DEFAULT_OPERATOR || 'Recepción 1';
    state.day = saved.day || cfg.DEFAULT_DAY || 'jueves';
    state.selectedCamera = saved.cameraId || '';
    state.pin = sessionStorage.getItem('ec_checkin_pin') || '';

    els.operator.value = state.operator;
    els.day.value = state.day;
    els.pin.value = state.pin;
  }

  function savePrefs() {
    const prefs = {
      operator: state.operator,
      day: state.day,
      cameraId: state.selectedCamera
    };
    localStorage.setItem('ec_checkin_prefs', JSON.stringify(prefs));
    sessionStorage.setItem('ec_checkin_pin', state.pin);
  }


  function normalizeApiUrl(url) {
    return String(url || '').trim().replace(/\?$/, '');
  }

  function bindEvents() {
    els.startBtn.addEventListener('click', enterReceptionMode);
    els.testApiBtn.addEventListener('click', testConnection);
    els.settingsBtn.addEventListener('click', showSetup);
    els.switchDayBtn.addEventListener('click', switchDay);
    els.scanToggleBtn.addEventListener('click', toggleScanner);
    els.clearBtn.addEventListener('click', clearCurrent);
    els.manualBtn.addEventListener('click', handleManual);
    els.manualInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') handleManual();
    });
    els.checkinBtn.addEventListener('click', registerCurrent);
    els.continueBtn.addEventListener('click', nextAttendee);
    els.refreshSummaryBtn.addEventListener('click', refreshSummary);
    els.cameraSelect.addEventListener('change', () => {
      state.selectedCamera = els.cameraSelect.value;
      savePrefs();
      if (state.scannerRunning) restartScanner();
    });
    els.day.addEventListener('change', () => {
      state.day = els.day.value;
      setDayLabel();
      savePrefs();
    });
  }

  function readSetupForm() {
    state.apiUrl = normalizeApiUrl(cfg.API_URL || '');
    state.pin = els.pin.value.trim();
    state.operator = els.operator.value.trim() || 'Recepción';
    state.day = els.day.value;
    state.selectedCamera = els.cameraSelect.value;
  }

  function validateSetup() {
    const problems = [];
    if (!state.apiUrl || !/^https:\/\//i.test(state.apiUrl) || /PEGA_AQUI/i.test(state.apiUrl)) problems.push('API configurada en config.js');
    if (!state.pin) problems.push('PIN');
    if (problems.length) {
      showMessage('Falta configurar: ' + problems.join(', '), 'err');
      return false;
    }
    return true;
  }

  async function enterReceptionMode() {
    readSetupForm();
    if (!validateSetup()) return;
    savePrefs();
    els.setupPanel.classList.add('hidden');
    els.appPanel.classList.remove('hidden');
    setDayLabel();
    await refreshSummary();
    showMessage('Recepción preparada. Puedes activar la cámara o buscar manualmente.', 'info');
    setTimeout(() => els.manualInput.focus(), 250);
  }

  function showSetup() {
    els.appPanel.classList.add('hidden');
    els.setupPanel.classList.remove('hidden');
    stopScanner();
  }

  function switchDay() {
    state.day = state.day === 'jueves' ? 'viernes' : 'jueves';
    els.day.value = state.day;
    setDayLabel();
    savePrefs();
    showMessage('Día activo: ' + dayLabel(), 'info');
    renderAttendee(state.currentAttendee);
  }

  function dayLabel() {
    return state.day === 'jueves' ? 'Jueves 2 de julio' : 'Viernes 3 de julio';
  }

  function setDayLabel() {
    els.currentDayLabel.textContent = dayLabel();
    els.checkinBtn.textContent = 'Registrar ' + (state.day === 'jueves' ? 'jueves 2' : 'viernes 3');
  }

  async function testConnection() {
    readSetupForm();
    if (!state.apiUrl || /PEGA_AQUI/i.test(state.apiUrl)) {
      setHealth('err');
      showMessage('La API no está configurada. Edita docs/config.js y pega la URL /exec de Apps Script.', 'err');
      return;
    }

    try {
      const res = await api('health', {}, false);
      if (res.ok) {
        setHealth('ok');
        showMessage('API accesible. Versión: ' + (res.version || 'sin versión'), 'ok');
      } else {
        setHealth('err');
        showMessage(res.error || 'La API respondió con error.', 'err');
      }
    } catch (err) {
      setHealth('err');
      showMessage('No se ha podido contactar con la API: ' + err.message, 'err');
    }
  }

  function setHealth(kind) {
    els.apiHealthDot.className = 'statusDot ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '');
  }

  async function detectCameras(showErrors) {
    if (!window.Html5Qrcode) {
      setTimeout(() => detectCameras(showErrors), 350);
      return;
    }
    try {
      const devices = await Html5Qrcode.getCameras();
      els.cameraSelect.innerHTML = '';
      if (!devices.length) {
        els.cameraSelect.innerHTML = '<option value="">No se han detectado cámaras</option>';
        if (showErrors) showMessage('No se han detectado cámaras en este dispositivo.', 'err');
        return;
      }
      const preferred = state.selectedCamera || devices.find(d => /back|rear|environment|trasera/i.test(d.label))?.id || devices[0].id;
      for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label || 'Cámara ' + (els.cameraSelect.length + 1);
        if (d.id === preferred) opt.selected = true;
        els.cameraSelect.appendChild(opt);
      }
      state.selectedCamera = preferred;
      savePrefs();
    } catch (err) {
      if (showErrors) showMessage(cameraErrorMessage(err), 'err');
    }
  }

  async function toggleScanner() {
    if (state.scannerRunning) {
      await stopScanner();
      return;
    }
    await startScanner();
  }

  async function startScanner() {
    if (!window.Html5Qrcode) {
      showMessage('La librería de escaneo QR no ha cargado. Revisa la conexión o recarga la página.', 'err');
      return;
    }
    await detectCameras(false);
    const cameraId = els.cameraSelect.value || state.selectedCamera;
    if (!cameraId) {
      showMessage('Selecciona una cámara para escanear.', 'err');
      return;
    }
    try {
      if (!state.scanner) state.scanner = new Html5Qrcode('reader', { verbose: false });
      setScannerBadge('iniciando', 'warn');
      await state.scanner.start(
        cameraId,
        { fps: 10, qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(210, Math.floor(minEdge * 0.68));
          return { width: size, height: size };
        }},
        onScanSuccess,
        () => {}
      );
      state.scannerRunning = true;
      state.scannerPaused = false;
      els.scanToggleBtn.textContent = 'Desactivar cámara';
      setScannerBadge('escaneando', 'ok');
    } catch (err) {
      state.scannerRunning = false;
      setScannerBadge('error', 'err');
      showMessage(cameraErrorMessage(err), 'err');
    }
  }

  async function stopScanner() {
    if (!state.scanner || !state.scannerRunning) return;
    try { await state.scanner.stop(); } catch (err) {}
    state.scannerRunning = false;
    state.scannerPaused = false;
    els.scanToggleBtn.textContent = 'Activar cámara';
    setScannerBadge('parado', 'muted');
  }

  async function restartScanner() {
    await stopScanner();
    await startScanner();
  }

  function pauseScanner() {
    if (!state.scanner || !state.scannerRunning) return;
    try {
      state.scanner.pause(true);
      state.scannerPaused = true;
      setScannerBadge('pausado', 'warn');
    } catch (err) {}
  }

  function resumeScanner() {
    if (!state.scanner || !state.scannerRunning || !state.scannerPaused) return;
    try {
      state.scanner.resume();
      state.scannerPaused = false;
      setScannerBadge('escaneando', 'ok');
    } catch (err) {}
  }

  function setScannerBadge(text, kind) {
    els.scannerState.textContent = text;
    els.scannerState.className = 'badge badge--' + (kind || 'muted');
  }

  async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (now - state.lastScanAt < 1200) return;
    state.lastScanAt = now;
    pauseScanner();
    await lookupCode(decodedText);
  }

  async function handleManual() {
    const q = els.manualInput.value.trim();
    if (!q) return;

    const looksLikeCode = /^https?:\/\//i.test(q) || /^XJ-/i.test(q) || q.includes('-DEMO') || q.includes('BIRTLH');
    if (looksLikeCode) {
      await lookupCode(q);
      return;
    }
    await search(q);
  }

  async function lookupCode(code) {
    try {
      setBusy(true);
      const res = await api('lookup', { code });
      if (!res.ok) {
        renderAttendee(null);
        showMessage(res.error || 'No se ha encontrado el asistente.', 'err');
        resumeScannerLater(1200);
        return;
      }
      renderAttendee(res.attendee);
      showMessage('Asistente localizado. Confirma el registro.', 'info');
    } catch (err) {
      showMessage('Error al buscar el código: ' + err.message, 'err');
      resumeScannerLater(1200);
    } finally {
      setBusy(false);
    }
  }

  async function search(query) {
    try {
      setBusy(true);
      const res = await api('search', { q: query });
      if (!res.ok) {
        els.searchResults.innerHTML = '';
        showMessage(res.error || 'No hay resultados.', 'warn');
        return;
      }
      renderSearchResults(res.results || []);
    } catch (err) {
      showMessage('Error en la búsqueda: ' + err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  function renderSearchResults(results) {
    els.searchResults.innerHTML = '';
    if (!results.length) {
      els.searchResults.innerHTML = '<p class="helpText">No se han encontrado resultados.</p>';
      return;
    }
    for (const item of results) {
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'resultItem';
      div.innerHTML = `<strong>${escapeHtml(item.apellidos)}, ${escapeHtml(item.nombre)}</strong><span>${escapeHtml(item.institucion || '')} · ${escapeHtml(item.codigo_qr || '')}</span>`;
      div.addEventListener('click', () => {
        renderAttendee(item);
        els.searchResults.innerHTML = '';
        showMessage('Asistente seleccionado desde búsqueda manual.', 'info');
      });
      els.searchResults.appendChild(div);
    }
  }

  function renderAttendee(attendee) {
    state.currentAttendee = attendee || null;
    if (!attendee) {
      els.emptyState.classList.remove('hidden');
      els.attendeeView.classList.add('hidden');
      els.resultBadge.textContent = 'sin selección';
      els.resultBadge.className = 'badge badge--muted';
      return;
    }

    els.emptyState.classList.add('hidden');
    els.attendeeView.classList.remove('hidden');
    els.attendeeName.textContent = [attendee.nombre, attendee.apellidos].filter(Boolean).join(' ');
    els.attendeeInstitution.textContent = attendee.institucion || attendee.email || 'Sin institución';
    els.attendeeCode.textContent = attendee.codigo_qr || 'sin código';

    renderStatusCard(els.juevesStatus, attendee.checkin_jueves, attendee.hora_jueves, attendee.operador_jueves);
    renderStatusCard(els.viernesStatus, attendee.checkin_viernes, attendee.hora_viernes, attendee.operador_viernes);

    const currentDone = state.day === 'jueves' ? attendee.checkin_jueves : attendee.checkin_viernes;
    els.resultBadge.textContent = currentDone ? 'ya registrado' : 'pendiente';
    els.resultBadge.className = 'badge badge--' + (currentDone ? 'ok' : 'warn');
  }

  function renderStatusCard(el, checked, time, operator) {
    el.classList.toggle('done', Boolean(checked));
    el.querySelector('strong').textContent = checked ? 'Registrado' : 'Pendiente';
    el.querySelector('small').textContent = checked ? [time, operator].filter(Boolean).join(' · ') : '';
  }

  async function registerCurrent() {
    const attendee = state.currentAttendee;
    if (!attendee) {
      showMessage('No hay ningún asistente seleccionado.', 'warn');
      return;
    }
    try {
      setBusy(true);
      const res = await api('checkinRow', {
        row: attendee.row,
        day: state.day,
        operator: state.operator
      });
      if (!res.ok) {
        showMessage(res.error || 'No se ha podido registrar.', 'err');
        return;
      }
      renderAttendee(res.attendee);
      await refreshSummary(false);
      if (res.duplicate) {
        showMessage(res.message + (res.previous_time ? ' · ' + res.previous_time : ''), 'warn');
      } else {
        showMessage(res.message + (res.time ? ' · ' + res.time : ''), 'ok');
      }
      resumeScannerLater(1800);
    } catch (err) {
      showMessage('Error al registrar: ' + err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  function nextAttendee() {
    clearCurrent();
    resumeScanner();
    setTimeout(() => els.manualInput.focus(), 100);
  }

  function clearCurrent() {
    state.currentAttendee = null;
    renderAttendee(null);
    els.manualInput.value = '';
    els.searchResults.innerHTML = '';
    hideMessage();
  }

  function resumeScannerLater(ms) {
    if (!state.scannerRunning || !state.scannerPaused) return;
    window.setTimeout(() => {
      if (!state.currentAttendee) resumeScanner();
    }, ms);
  }

  async function refreshSummary(showErrors = true) {
    try {
      const res = await api('summary', {});
      if (res.ok) {
        els.sumTotal.textContent = res.total;
        els.sumJueves.textContent = res.jueves;
        els.sumViernes.textContent = res.viernes;
      } else if (showErrors) {
        showMessage(res.error || 'No se ha podido obtener el resumen.', 'warn');
      }
    } catch (err) {
      if (showErrors) showMessage('Error al actualizar resumen: ' + err.message, 'err');
    }
  }

  function setBusy(busy) {
    [els.manualBtn, els.checkinBtn, els.refreshSummaryBtn].forEach(btn => btn.disabled = busy);
  }

  function showMessage(text, kind = 'info') {
    if (state.lastMessageTimer) clearTimeout(state.lastMessageTimer);
    els.message.textContent = text;
    els.message.className = 'message ' + kind;
    els.message.classList.remove('hidden');
    state.lastMessageTimer = setTimeout(() => {
      if (kind === 'info') hideMessage();
    }, 5000);
  }

  function hideMessage() {
    els.message.classList.add('hidden');
    els.message.textContent = '';
  }

  async function api(action, params = {}, includePin = true) {
    const query = new URLSearchParams();
    query.set('action', action);
    if (includePin) query.set('pin', state.pin);
    for (const [key, value] of Object.entries(params)) query.set(key, value == null ? '' : String(value));
    return jsonp(state.apiUrl + '?' + query.toString());
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = '__ec_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const sep = url.includes('?') ? '&' : '?';
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Tiempo de espera agotado'));
      }, 16000);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('No se ha podido cargar la respuesta JSONP'));
      };
      script.src = url + sep + 'callback=' + encodeURIComponent(cb) + '&_=' + Date.now();
      document.head.appendChild(script);
    });
  }

  function cameraErrorMessage(err) {
    const msg = String(err && (err.message || err.name) || err || '');
    if (/notallowed|permission|denied/i.test(msg)) return 'Permiso de cámara denegado. Abre la app en Chrome/Safari, permite la cámara y recarga.';
    if (/notfound|no camera|Overconstrained/i.test(msg)) return 'No se ha encontrado una cámara compatible.';
    if (/notreadable|track start/i.test(msg)) return 'La cámara está ocupada por otra aplicación o no se puede iniciar.';
    return 'No se ha podido activar la cámara: ' + msg;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.addEventListener('load', init);
})();
