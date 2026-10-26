/* ============================================
   GB FORCE — Página de envíos (uso interno)
   Inicio de sesión con Supabase Auth (correo + contraseña + Google Authenticator obligatorio).
   n8n valida la sesión en cada llamada y deja registro en la bitácora de Airtable.
   Muestra solo lo necesario para empacar y enviar: a dónde va y cuántas cajas.
   No muestra montos, datos de pago ni correo de clientes.
   ============================================ */
(function () {
  // ── Configuración (la URL y la clave "anon" de Supabase son PÚBLICAS por diseño) ──
  var SUPABASE_URL = 'https://lcaqniptbppilsiopvgd.supabase.co';             // ej. https://abcdefgh.supabase.co
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjYXFuaXB0YnBwaWxzaW9wdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTk3MTIsImV4cCI6MjEwODUzNTcxMn0.cBgkWvP6_e0bhSkTjFvZp5eqnoQ4PNEUqlxTtnGqGmo';   // clave "anon public" (NUNCA la "service_role")
  var N8N = 'https://n8n.guiahudumaliving.online/webhook/';
  var LOGIN_URL = N8N + 'gbforce-envios-ingreso';
  var LIST_URL = N8N + 'gbforce-envios-lista';
  var MARK_URL = N8N + 'gbforce-envios-marcar';
  // El tiempo de inactividad ya NO está fijo aquí: se cambia en Airtable > Configuración
  // (envios_inactividad_horas). Este valor es solo el de arranque hasta que llega el real.
  var DEFAULT_IDLE_HOURS = 8;
  var ING_KEY = 'gb_env_ing';
  var LAST_KEY = 'gb_env_last';      // última actividad (persiste aunque se cierre la pestaña)
  var IDLE_KEY = 'gb_env_idle_h';    // último valor de horas recibido del servidor
  var PAQUETERIAS = ['Estafeta', 'DHL', 'FedEx', 'Redpack', 'Paquetexpress', '99 Minutos', 'Correos de México', 'Otra'];

  var VIEWS = ['viewLogin', 'viewForgot', 'viewNewPass', 'viewEnroll', 'viewMfa', 'viewApp'];
  var sb = null;
  var vista = 'por-enviar';
  var vistaActual = '';
  var recoveryMode = false;
  var newPassNeedsMfa = false;
  var enrollFactorId = '';
  var idleTimer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;     // textContent: los datos de clientes nunca se interpretan como HTML
    return n;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function setText(id, msg) { var n = $(id); if (!n) return; if (msg) { n.textContent = msg; n.hidden = false; } else { n.textContent = ''; n.hidden = true; } }
  function busy(btnId, on, label) { var b = $(btnId); b.disabled = on; if (label) b.textContent = label; }
  function onlyDigits(e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); }

  function show(name, userEmail) {
    $('bootMsg').hidden = true;
    VIEWS.forEach(function (v) { $(v).hidden = (v !== name); });
    $('topActions').hidden = (name !== 'viewApp');
    if (name === 'viewApp' && userEmail) $('userEmail').textContent = userEmail;
    if (name !== 'viewApp') stopIdle();
    window.scrollTo(0, 0);
  }

  // ── Cierre por inactividad (horas configurables desde Airtable) ──
  var idleHours = DEFAULT_IDLE_HOURS;
  var lastTouch = 0;
  try { var saved = parseFloat(localStorage.getItem(IDLE_KEY)); if (isFinite(saved) && saved > 0) idleHours = saved; } catch (e) {}

  function idleMs() { return idleHours * 3600 * 1000; }
  function setIdleHours(h) {
    var n = parseFloat(h);
    if (!isFinite(n)) return;
    idleHours = Math.min(72, Math.max(0.25, n));
    try { localStorage.setItem(IDLE_KEY, String(idleHours)); } catch (e) {}
    if (idleTimer) resetIdle();
  }
  function expiredByIdle() {
    try { var l = parseInt(localStorage.getItem(LAST_KEY) || '0', 10); return l > 0 && (Date.now() - l) > idleMs(); } catch (e) { return false; }
  }
  function touch() {
    var now = Date.now();
    if (now - lastTouch > 15000) { lastTouch = now; try { localStorage.setItem(LAST_KEY, String(now)); } catch (e) {} }
    resetIdle();
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { logout('Tu sesión se cerró por inactividad.'); }, idleMs());
  }
  function startIdle() {
    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(function (ev) { document.addEventListener(ev, touch, { passive: true }); });
    touch();
  }
  function stopIdle() {
    clearTimeout(idleTimer); idleTimer = null;
    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(function (ev) { document.removeEventListener(ev, touch); });
  }
  // Al volver a la pestaña (o despertar la computadora) se revisa si ya pasó el tiempo
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !$('viewApp').hidden && expiredByIdle()) logout('Tu sesión se cerró por inactividad.');
  });

  // ── Llamadas a n8n: siempre llevan la sesión; n8n la valida con Supabase ──
  async function authedPost(url, extra) {
    var s = await sb.auth.getSession();
    var session = s && s.data && s.data.session;
    if (!session) return { status: 401, ok: false, data: {} };
    var body = { token: session.access_token };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = {};
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok, data: j };
  }

  // ── Enrutador: decide qué pantalla toca ──
  async function route() {
    var r = await sb.auth.getSession();
    var session = r.data && r.data.session;
    if (!session) { show('viewLogin'); return; }
    var a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    var lvl = a.data || {};
    if (lvl.currentLevel === 'aal2') { await enterApp(session); return; }
    if (lvl.nextLevel === 'aal2') { show('viewMfa'); $('mfaCode').focus(); return; }   // ya tiene factor: pedir código
    await startEnroll();                                                                 // aún sin factor: activarlo
  }

  async function enterApp(session) {
    // Si se cerró la pestaña y pasó más tiempo que el permitido, se pide entrar de nuevo
    if (expiredByIdle()) { await logout('Tu sesión se cerró por inactividad.'); return; }
    try {
      var logged = sessionStorage.getItem(ING_KEY) === session.user.id;
      if (!logged) {
        var res = await authedPost(LOGIN_URL, {});
        if (res.status === 401) { await logout('Tu cuenta no tiene autorización para esta página.'); return; }
        if (res.ok) sessionStorage.setItem(ING_KEY, session.user.id);
      }
    } catch (e) { /* si la bitácora no responde, no se bloquea la pantalla; la lista fallará sola si n8n está caído */ }
    show('viewApp', session.user.email);
    startIdle();
    load();
  }

  async function logout(msg) {
    try { await sb.auth.signOut(); } catch (e) {}
    try { sessionStorage.removeItem(ING_KEY); localStorage.removeItem(LAST_KEY); } catch (e) {}
    $('list').textContent = '';
    show('viewLogin');
    setText('loginError', msg || '');
    setText('loginOk', '');
    $('loginPass').value = '';
  }

  // ── 1. Iniciar sesión ──
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    setText('loginError', ''); setText('loginOk', '');
    busy('loginBtn', true, 'Entrando…');
    try {
      var r = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPass').value });
      if (r.error) { setText('loginError', 'Correo o contraseña incorrectos.'); }
      else { $('loginPass').value = ''; await route(); }
    } catch (err) { setText('loginError', 'No se pudo conectar. Intenta de nuevo.'); }
    busy('loginBtn', false, 'Entrar');
  });
  $('linkForgot').addEventListener('click', function () { setText('forgotError', ''); setText('forgotOk', ''); $('forgotEmail').value = $('loginEmail').value; show('viewForgot'); });

  // ── 2. Olvidé mi contraseña ──
  $('forgotForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    setText('forgotError', ''); setText('forgotOk', '');
    busy('forgotBtn', true, 'Enviando…');
    try {
      await sb.auth.resetPasswordForEmail($('forgotEmail').value.trim(), { redirectTo: location.origin + location.pathname });
      // Mensaje igual exista o no la cuenta, para no revelar quién tiene acceso
      setText('forgotOk', 'Si el correo está registrado, te enviamos un enlace. Revisa también tu carpeta de spam.');
    } catch (err) { setText('forgotError', 'No se pudo enviar. Intenta de nuevo en unos minutos.'); }
    busy('forgotBtn', false, 'Enviar enlace');
  });
  $('linkBackLogin1').addEventListener('click', function () { show('viewLogin'); });

  // ── 3. Contraseña nueva (desde el enlace del correo) ──
  async function prepareNewPass() {
    var a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    var l = a.data || {};
    newPassNeedsMfa = (l.currentLevel !== 'aal2' && l.nextLevel === 'aal2');
    $('newPassMfa').hidden = !newPassNeedsMfa;
    setText('newPassError', '');
    show('viewNewPass');
  }
  $('newPassForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    setText('newPassError', '');
    var p1 = $('newPass1').value, p2 = $('newPass2').value;
    if (p1 !== p2) { setText('newPassError', 'Las contraseñas no coinciden.'); return; }
    if (p1.length < 12 || !/[A-Za-z]/.test(p1) || !/\d/.test(p1)) { setText('newPassError', 'Usa al menos 12 caracteres, con letras y números.'); return; }
    busy('newPassBtn', true, 'Guardando…');
    try {
      if (newPassNeedsMfa) {
        var code = $('newPassCode').value.trim();
        if (!/^\d{6}$/.test(code)) { setText('newPassError', 'Escribe el código de 6 números de Google Authenticator.'); busy('newPassBtn', false, 'Guardar contraseña'); return; }
        var f = await sb.auth.mfa.listFactors();
        var t = f.data && f.data.totp && f.data.totp[0];
        if (!t) { setText('newPassError', 'No se encontró tu verificación en dos pasos. Pide ayuda al administrador.'); busy('newPassBtn', false, 'Guardar contraseña'); return; }
        var v = await sb.auth.mfa.challengeAndVerify({ factorId: t.id, code: code });
        if (v.error) { setText('newPassError', 'Código incorrecto. Intenta de nuevo.'); busy('newPassBtn', false, 'Guardar contraseña'); return; }
      }
      var u = await sb.auth.updateUser({ password: p1 });
      if (u.error) { setText('newPassError', 'No se pudo guardar: ' + (u.error.message || 'intenta con otra contraseña.')); busy('newPassBtn', false, 'Guardar contraseña'); return; }
      recoveryMode = false;
      history.replaceState(null, '', location.pathname);
      await logout('');
      setText('loginOk', 'Contraseña actualizada. Inicia sesión con la nueva.');
    } catch (err) { setText('newPassError', 'Error de conexión. Intenta de nuevo.'); }
    busy('newPassBtn', false, 'Guardar contraseña');
  });

  // ── 4. Activar verificación en dos pasos (primera vez) ──
  async function startEnroll() {
    try {
      var f = await sb.auth.mfa.listFactors();
      var all = (f.data && f.data.all) || [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].factor_type === 'totp' && all[i].status === 'unverified') await sb.auth.mfa.unenroll({ factorId: all[i].id });
      }
      var e = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'GB FORCE ' + Date.now() });
      if (e.error) throw e.error;
      enrollFactorId = e.data.id;
      $('qrImg').src = e.data.totp.qr_code;
      $('qrSecret').textContent = e.data.totp.secret;
      setText('enrollError', ''); $('enrollCode').value = '';
      show('viewEnroll');
    } catch (err) {
      await logout('No se pudo preparar la verificación en dos pasos. Intenta de nuevo.');
    }
  }
  $('enrollForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    setText('enrollError', '');
    var code = $('enrollCode').value.trim();
    if (!/^\d{6}$/.test(code)) { setText('enrollError', 'Escribe los 6 números que muestra la app.'); return; }
    busy('enrollBtn', true, 'Verificando…');
    try {
      var v = await sb.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code: code });
      if (v.error) { setText('enrollError', 'Código incorrecto. Revisa que el reloj de tu celular esté en hora automática e intenta de nuevo.'); }
      else { await route(); }
    } catch (err) { setText('enrollError', 'Error de conexión. Intenta de nuevo.'); }
    busy('enrollBtn', false, 'Activar y entrar');
  });
  $('linkLogout1').addEventListener('click', function () { logout(''); });

  // ── 5. Código de verificación (cada inicio de sesión) ──
  $('mfaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    setText('mfaError', '');
    var code = $('mfaCode').value.trim();
    if (!/^\d{6}$/.test(code)) { setText('mfaError', 'Escribe los 6 números que muestra la app.'); return; }
    busy('mfaBtn', true, 'Verificando…');
    try {
      var f = await sb.auth.mfa.listFactors();
      var t = f.data && f.data.totp && f.data.totp[0];
      if (!t) { setText('mfaError', 'No se encontró tu verificación en dos pasos. Pide ayuda al administrador.'); }
      else {
        var v = await sb.auth.mfa.challengeAndVerify({ factorId: t.id, code: code });
        if (v.error) { setText('mfaError', 'Código incorrecto. Espera al siguiente código e intenta de nuevo.'); $('mfaCode').value = ''; }
        else { $('mfaCode').value = ''; await route(); }
      }
    } catch (err) { setText('mfaError', 'Error de conexión. Intenta de nuevo.'); }
    busy('mfaBtn', false, 'Verificar');
  });
  $('linkLogout2').addEventListener('click', function () { logout(''); });

  ['enrollCode', 'mfaCode', 'newPassCode'].forEach(function (id) { $(id).addEventListener('input', onlyDigits); });

  // ── Barra superior ──
  $('btnLogout').addEventListener('click', function () { logout(''); });
  $('btnRefresh').addEventListener('click', function () { load(); });
  $('btnPrint').addEventListener('click', function () {
    $('printHead').textContent = 'Hoja de empaque · ' + new Date().toLocaleString('es-MX') + ' · ' + (vista === 'por-enviar' ? 'Por enviar' : 'Enviados');
    window.print();
  });

  // ── 6. Panel de envíos ──
  function setTab(v) {
    vista = v;
    $('tabPor').classList.toggle('ev-tab-on', v === 'por-enviar');
    $('tabEnv').classList.toggle('ev-tab-on', v === 'enviados');
    $('tabPor').setAttribute('aria-selected', v === 'por-enviar');
    $('tabEnv').setAttribute('aria-selected', v === 'enviados');
    load();
  }
  $('tabPor').addEventListener('click', function () { setTab('por-enviar'); });
  $('tabEnv').addEventListener('click', function () { setTab('enviados'); });

  async function load() {
    $('listMsg').textContent = 'Cargando…';
    var pedida = vista;
    try {
      var res = await authedPost(LIST_URL, { vista: pedida });
      if (res.status === 401) { await logout('Tu sesión expiró. Inicia sesión de nuevo.'); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      vistaActual = pedida;
      render(res.data);
    } catch (e) {
      $('listMsg').textContent = 'No se pudo actualizar. Revisa tu conexión e intenta de nuevo.';
    }
  }

  function render(data) {
    if (data && data.config && data.config.inactividadHoras != null) setIdleHours(data.config.inactividadHoras);
    var pedidos = (data && data.pedidos) || [];
    $('sumPedidos').textContent = data && data.totalPedidos != null ? data.totalPedidos : pedidos.length;
    $('sumCajas').textContent = data && data.totalCajas != null ? data.totalCajas : 0;
    var list = $('list');
    list.textContent = '';
    $('listMsg').textContent = pedidos.length ? '' : (vistaActual === 'por-enviar' ? 'No hay pedidos por enviar. ¡Todo al día!' : 'No hay envíos recientes.');
    pedidos.forEach(function (p) { list.appendChild(card(p)); });
  }

  function addressText(p) {
    return [p.nombre, p.calle, p.colonia, 'C.P. ' + p.cp, p.ciudad + ', ' + p.estado,
      p.referencias ? 'Ref: ' + p.referencias : '', 'Tel: ' + p.telefono].filter(Boolean).join('\n');
  }

  function card(p) {
    var sent = vistaActual === 'enviados';
    var c = el('article', 'ev-card' + (sent ? ' ev-card-sent' : ''));

    var top = el('div', 'ev-row');
    var left = el('div');
    left.appendChild(el('div', 'ev-id', p.pedido));
    left.appendChild(el('div', 'ev-date', (sent ? 'Enviado ' : 'Pagado ') + fmtDate(sent ? p.enviadoEn : p.pagadoEn)));
    top.appendChild(left);
    var boxes = el('div', 'ev-boxes');
    boxes.appendChild(el('b', null, String(p.cantidad)));
    boxes.appendChild(el('span', null, p.cantidad === 1 ? 'caja' : 'cajas'));
    top.appendChild(boxes);
    c.appendChild(top);

    c.appendChild(el('div', 'ev-name', p.nombre));
    var tel = el('a', 'ev-tel', p.telefono);
    tel.href = 'tel:' + String(p.telefono).replace(/[^\d+]/g, '');
    c.appendChild(tel);

    var addr = el('div', 'ev-addr');
    addr.appendChild(el('div', null, p.calle));
    addr.appendChild(el('div', null, 'Col. ' + p.colonia));
    addr.appendChild(el('div', null, 'C.P. ' + p.cp + ' · ' + p.ciudad));
    addr.appendChild(el('div', null, p.estado));
    c.appendChild(addr);
    if (p.referencias) c.appendChild(el('p', 'ev-ref', 'Referencias: ' + p.referencias));

    if (sent) c.appendChild(el('p', 'ev-track', (p.paqueteria || 'Paquetería') + ' · Guía: ' + (p.guia || '—')));

    var btns = el('div', 'ev-btns');
    var copy = el('button', 'ev-btn ev-btn-line', 'Copiar dirección');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var t = addressText(p);
      var done = function () { copy.textContent = '¡Copiado!'; setTimeout(function () { copy.textContent = 'Copiar dirección'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Copia la dirección:', t); });
      else window.prompt('Copia la dirección:', t);
    });
    btns.appendChild(copy);

    if (!sent) {
      var mark = el('button', 'ev-btn ev-btn-ok', 'Marcar como enviado');
      mark.type = 'button';
      mark.addEventListener('click', function () { mark.hidden = true; c.appendChild(markForm(p, mark)); });
      btns.appendChild(mark);
    } else {
      var undo = el('button', 'ev-btn ev-btn-line', 'Deshacer envío');
      undo.type = 'button';
      undo.addEventListener('click', function () {
        if (!window.confirm('¿Regresar el pedido ' + p.pedido + ' a «Por enviar»?')) return;
        undo.disabled = true;
        sendMark({ pedido: p.pedido, accion: 'deshacer' }, function () { load(); }, function (m) { undo.disabled = false; window.alert(m); });
      });
      btns.appendChild(undo);
    }
    c.appendChild(btns);
    return c;
  }

  function markForm(p, markBtn) {
    var f = el('form', 'ev-form');
    var l1 = el('label', 'ev-label', 'Paquetería');
    var sel = el('select', 'ev-select');
    PAQUETERIAS.forEach(function (n) { var o = el('option', null, n); o.value = n; sel.appendChild(o); });
    l1.appendChild(sel);
    var l2 = el('label', 'ev-label', 'Número de guía');
    var inp = el('input', 'ev-input');
    inp.type = 'text'; inp.required = true; inp.maxLength = 60; inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'characters');
    l2.appendChild(inp);
    var err = el('p', 'ev-error'); err.hidden = true;
    var row = el('div', 'ev-btns');
    var ok = el('button', 'ev-btn ev-btn-ok', 'Guardar y avisar al cliente'); ok.type = 'submit';
    var cancel = el('button', 'ev-btn ev-btn-line', 'Cancelar'); cancel.type = 'button';
    cancel.addEventListener('click', function () { f.remove(); markBtn.hidden = false; });
    row.appendChild(ok); row.appendChild(cancel);
    f.appendChild(l1); f.appendChild(l2); f.appendChild(err); f.appendChild(row);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var guia = inp.value.trim();
      if (!guia) { err.textContent = 'Escribe el número de guía.'; err.hidden = false; return; }
      ok.disabled = true; ok.textContent = 'Guardando…';
      sendMark({ pedido: p.pedido, accion: 'enviar', paqueteria: sel.value, guia: guia },
        function () { load(); },
        function (m) { ok.disabled = false; ok.textContent = 'Guardar y avisar al cliente'; err.textContent = m; err.hidden = false; });
    });
    setTimeout(function () { inp.focus(); }, 50);
    return f;
  }

  async function sendMark(extra, onOk, onFail) {
    try {
      var res = await authedPost(MARK_URL, extra);
      if (res.status === 401) { await logout('Tu sesión expiró. Inicia sesión de nuevo.'); return; }
      if (res.ok && res.data && res.data.ok) { onOk(); return; }
      var map = { faltan_datos: 'Faltan la paquetería o la guía.', pedido_no_pagado_o_inexistente: 'Ese pedido ya no está disponible.', pedido_invalido: 'Pedido inválido.' };
      onFail(map[res.data && res.data.error] || 'No se pudo guardar. Intenta de nuevo.');
    } catch (e) { onFail('Sin conexión. Intenta de nuevo.'); }
  }

  // ── Arranque ──
  function init() {
    var configured = SUPABASE_URL.indexOf('PON_AQUI') < 0 && SUPABASE_ANON_KEY.indexOf('PON_AQUI') < 0;
    if (!configured) { $('bootMsg').textContent = 'Configuración pendiente: falta conectar el sistema de acceso.'; return; }
    if (!window.supabase || !window.supabase.createClient) { $('bootMsg').textContent = 'No se pudo cargar el sistema de acceso. Recarga la página.'; return; }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });

    // Importante: dentro de este callback no se hacen llamadas a Supabase directamente (se difieren)
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') { recoveryMode = true; setTimeout(prepareNewPass, 0); }
    });

    if (/type=recovery/.test(location.hash)) {
      recoveryMode = true;
      // El evento PASSWORD_RECOVERY llega en cuanto Supabase procesa el enlace; si no llega, volvemos al inicio
      setTimeout(function () { if (recoveryMode && $('viewNewPass').hidden) { recoveryMode = false; show('viewLogin'); } }, 5000);
    } else {
      route().catch(function () { show('viewLogin'); });
    }
  }
  init();
})();
