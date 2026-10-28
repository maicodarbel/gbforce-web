/* ============================================
   GB FORCE — Página de pedido y pago (Clip, Checkout Embebido)
   Requiere analytics.js (gbTrackEvent, gbFbData, gbGenEventId)

   Flujo:
   1) La persona llena sus datos y toca "Continuar al pago".
   2) Se envían a n8n (CREATE_URL). n8n fija el precio, guarda el pedido y crea
      el link de pago en Clip. NUNCA se envía ni se confía en un monto del navegador.
   3) n8n responde { order_id, payment_request_id, payment_request_url }.
   4) Se carga el SDK de Clip y se abre el pago dentro de la página.
      Respaldo: continuar en la página de Clip (payment_request_url).
   ============================================ */
(function () {
  // ── Configuración ──
  var CREATE_URL = 'https://n8n.guiahudumaliving.online/webhook/gbforce-crear-pago'; // TODO: confirmar al crear el flujo en n8n
  var CLIP_SDK_URL = 'https://sdk.clip.mx/js/v1/checkout.js';
  var PRICE_MXN = 650;   // SOLO para mostrar en pantalla; el cobro real lo fija el servidor
  var SHIPPING_FEE = 129;  // costo de envío fijo (MXN) para menos de FREE_SHIPPING_QTY cajas; SOLO para mostrar, el cobro real lo fija el servidor
  var FREE_SHIPPING_QTY = 3;   // envío gratis desde 3 cajas
  var MAX_QTY = 12;          // 12 cajas ($7,800) es menos que el paquete de socio comercial (20 x $399 = $7,980): arriba de esto se atiende como posible socio
  var SDK_WAIT_MS = 6000;

  var TRACK_KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'ad_name', 'adset_name', 'campaign_name', 'landing_page'];

  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + n.toLocaleString('es-MX'); }

  // ── Atribución guardada por las landings (sessionStorage) ──
  var track = {};
  try { track = JSON.parse(sessionStorage.getItem('gb_track') || '{}'); } catch (e) {}
  var qs = new URLSearchParams(location.search);
  TRACK_KEYS.forEach(function (k) { if (qs.get(k)) track[k] = qs.get(k); });

  // ── Cantidad y total ──
  var qty = 1;
  function renderTotals() {
    $('qtyValue').textContent = qty;
    var ship = qty >= FREE_SHIPPING_QTY ? 0 : SHIPPING_FEE;
    $('shipValue').textContent = ship === 0 ? 'Gratis' : (ship === null ? 'Por definir' : money(ship));
    $('totalValue').textContent = money(qty * PRICE_MXN + (ship || 0)) + ' MXN';
    $('qtyMinus').disabled = qty <= 1;
    $('qtyPlus').disabled = qty >= MAX_QTY;
    $('bulkNote').hidden = qty < MAX_QTY;
    var btn = $('payBtn');
    if (btn && !btn.disabled) btn.firstChild.nodeValue = 'Continuar al pago ';
  }
  document.querySelectorAll('[data-unit-price]').forEach(function (el) { el.textContent = money(PRICE_MXN); });
  $('qtyMinus').addEventListener('click', function () { if (qty > 1) { qty--; renderTotals(); } });
  $('qtyPlus').addEventListener('click', function () { if (qty < MAX_QTY) { qty++; renderTotals(); } });
  renderTotals();

  gbTrackEvent('InitiateCheckout', { value: PRICE_MXN, currency: 'MXN', num_items: 1 });

  // ── Formulario ──
  var form = $('pedidoForm');
  var fields = $('formFields');
  var errBox = $('pedidoError');
  var payBtn = $('payBtn');

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function clearError() { errBox.hidden = true; }

  form.elements.telefono.addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  form.elements.cp.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
    if (e.target.value.length === 5) lookupCp(e.target.value);
  });

  // ── Autocompletar estado, municipio y colonias con el código postal ──
  // API pública de SEPOMEX (Postali). Si falla o no encuentra el CP, el formulario sigue manual.
  var CP_API = 'https://postali.app/api/v1/mx/cp/';
  var cpSeq = 0;   // descarta respuestas de CPs que ya cambiaron
  function plain(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function matchState(name) {
    var n = plain(name);
    if (n === 'mexico') n = 'estado de mexico';   // SEPOMEX llama "México" al Estado de México
    var opts = form.elements.estado.options;
    for (var i = 1; i < opts.length; i++) {
      var o = plain(opts[i].value);
      if (o === n || n.indexOf(o + ' de ') === 0) return opts[i].value;   // "Coahuila de Zaragoza" → "Coahuila"
    }
    return '';
  }
  function lookupCp(cp) {
    var seq = ++cpSeq;
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch(CP_API + cp, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (res) {
      clearTimeout(t);
      if (seq !== cpSeq || !res) return;
      var f = form.elements;
      var estado = matchState(res.estado);
      if (estado) f.estado.value = estado;
      if (res.municipio) f.ciudad.value = res.municipio;
      var names = (res.asentamientos || []).map(function (a) { return a.nombre; }).filter(Boolean);
      var list = $('coloniasList');
      list.innerHTML = '';
      names.forEach(function (n) { var o = document.createElement('option'); o.value = n; list.appendChild(o); });
      if (names.length === 1) f.colonia.value = names[0];
      else if (names.indexOf(f.colonia.value) === -1) f.colonia.value = '';   // la persona elige de la lista
    }).catch(function () { clearTimeout(t); });
  }

  function validate(d) {
    if (d.nombre.length < 3) return 'Escribe tu nombre completo.';
    if (!/^\d{10}$/.test(d.telefono)) return 'Escribe tu teléfono a 10 dígitos.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo)) return 'Revisa tu correo electrónico.';
    if (d.calle.length < 4) return 'Escribe tu calle y número.';
    if (d.colonia.length < 2) return 'Escribe tu colonia.';
    if (!/^\d{5}$/.test(d.cp)) return 'El código postal debe tener 5 dígitos.';
    if (d.ciudad.length < 2) return 'Escribe tu ciudad o municipio.';
    if (!d.estado) return 'Elige tu estado.';
    if (!form.elements.aviso.checked) return 'Debes aceptar el aviso de privacidad para continuar.';
    return '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var f = form.elements;
    var data = {
      nombre: f.nombre.value.trim(),
      telefono: f.telefono.value.trim(),
      correo: f.correo.value.trim(),
      calle: f.calle.value.trim(),
      colonia: f.colonia.value.trim(),
      cp: f.cp.value.trim(),
      ciudad: f.ciudad.value.trim(),
      estado: f.estado.value,
      referencias: f.referencias.value.trim()
    };
    var problem = validate(data);
    if (problem) { showError(problem); return; }

    // Campo trampa: si lo llenó un bot, no se envía nada al servidor
    if (f.website.value) { showError('No pudimos procesar tu pedido. Intenta de nuevo.'); return; }

    var eventId = gbGenEventId();
    var payload = {
      qty: qty,                       // el servidor valida 1-12 y calcula el monto
      cliente: data,
      aviso_privacidad: true,
      promociones: !!f.promociones.checked,
      tracking: track,
      fbp: window.gbFbData ? gbFbData.fbp : '',
      fbc: window.gbFbData ? gbFbData.fbc : '',
      event_id: eventId,
      page_url: location.href,
      timestamp: new Date().toISOString()
    };

    payBtn.disabled = true;
    var label = payBtn.firstChild.nodeValue;
    payBtn.firstChild.nodeValue = 'Preparando tu pago… ';

    fetch(CREATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (res) {
      if (!res || !res.payment_request_id || !res.order_id) throw new Error('respuesta incompleta');
      try { sessionStorage.setItem('gb_order', res.order_id); } catch (e2) {}
      gbTrackEvent('AddPaymentInfo', { value: qty * PRICE_MXN, currency: 'MXN' }, eventId);
      openPayment(res);
    }).catch(function () {
      payBtn.disabled = false;
      payBtn.firstChild.nodeValue = label;
      showError('No pudimos preparar tu pago. Intenta de nuevo en unos minutos o llámanos al +52 33 3172 1515.');
    });
  });

  // ── Oculta el menú mientras la ventana de pago de Clip está abierta ──
  // Clip agrega su ventana (iframe o capa fija) al documento; la seguimos y quitamos el menú
  // mientras sea visible. Al cerrarla, el menú vuelve a aparecer.
  var clipNodes = [];
  var clipWatching = false;
  function isVisible(el) {
    if (!el.isConnected || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }
  function syncNav() {
    clipNodes = clipNodes.filter(function (n) { return n.isConnected; });
    document.body.classList.toggle('px-paying', clipNodes.some(isVisible));
  }
  function watchClipModal() {
    if (clipWatching) return;
    clipWatching = true;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1 || /^(SCRIPT|STYLE|LINK|BUTTON)$/.test(n.tagName)) return;
          if (n.closest && n.closest('header, main, footer') && n.tagName !== 'IFRAME' && !n.querySelector('iframe')) return;
          if (n.tagName === 'IFRAME' || n.querySelector('iframe') || getComputedStyle(n).position === 'fixed') clipNodes.push(n);
        });
      });
      syncNav();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(syncNav, 400);   // detecta también cuando Clip solo oculta su ventana al cerrarla
  }

  // ── Pago con Clip (embebido, con respaldo) ──
  var mounted = false;
  function openPayment(res) {
    $('orderId').textContent = res.order_id;
    $('payPanel').hidden = false;
    fields.disabled = true;
    $('payPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    watchClipModal();

    var fb = $('clipFallback');
    var link = $('clipFallbackLink');
    if (res.payment_request_url) link.href = res.payment_request_url;
    var showFallback = function () { if (res.payment_request_url) fb.hidden = false; };

    if (mounted) { showFallback(); return; }
    mounted = true;

    var mount = $('clipMount');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clipCheckoutButton';
    mount.appendChild(btn);

    var timer = setTimeout(showFallback, SDK_WAIT_MS);
    var s = document.createElement('script');
    s.id = 'checkoutClipPlugin';
    s.setAttribute('payment_request_id', res.payment_request_id);
    s.type = 'module';
    // El "?r=" evita que el navegador reutilice el módulo ya ejecutado si se crea un segundo pedido
    s.src = CLIP_SDK_URL + '?r=' + Date.now();
    s.onload = function () {
      // El SDK de Clip se inicia en el evento DOMContentLoaded, que ya ocurrió cuando lo cargamos
      // dinámicamente. Lo volvemos a disparar para que enganche el botón con el payment_request_id.
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
      var tries = 0;
      var wait = setInterval(function () {
        tries++;
        if (btn.textContent.trim() === 'Pagar') {   // el SDK ya activó su botón
          clearInterval(wait);
          clearTimeout(timer);                       // pago embebido listo: no mostrar el respaldo
          btn.click();
        } else if (tries > 30) {
          clearInterval(wait);
          showFallback();
        }
      }, 150);
    };
    s.onerror = function () { clearTimeout(timer); showFallback(); };
    document.body.appendChild(s);
  }

  // ── Cambiar datos: libera el formulario (el siguiente envío crea un pedido nuevo) ──
  $('editData').addEventListener('click', function () {
    $('payPanel').hidden = true;
    $('clipFallback').hidden = true;
    fields.disabled = false;
    payBtn.disabled = false;
    payBtn.firstChild.nodeValue = 'Continuar al pago ';
    var old = document.getElementById('checkoutClipPlugin');
    if (old) old.remove();
    $('clipMount').innerHTML = '';
    mounted = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Volver desde la página de Clip con error
  if (qs.get('error')) showError('El pago no se completó. Puedes intentarlo de nuevo o elegir otro método.');
})();
