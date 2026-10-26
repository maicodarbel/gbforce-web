/* ============================================
   GB FORCE — LANDINGS CORTAS (comprar / asociados / gracias)
   Requiere analytics.js (gbTrackEvent, gbFbData)
   ============================================ */
(function () {
  // ── Configuración (confirmar antes de publicar) ──
  var STATUS_URL = 'https://n8n.guiahudumaliving.online/webhook/gbforce-pedido-estatus'; // TODO: confirmar al crear el flujo en n8n
  var N8N_WEBHOOK_URL = 'https://n8n.guiahudumaliving.online/webhook/gbforce-leads';
  var PRICE_MXN = 650;   // TODO: confirmar precio público vigente

  var TRACK_KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'ad_name', 'adset_name', 'campaign_name'];

  // ── Atribución persistente entre páginas (sessionStorage) ──
  function readStore() {
    try { return JSON.parse(sessionStorage.getItem('gb_track') || '{}'); } catch (e) { return {}; }
  }
  function saveStore(o) {
    try { sessionStorage.setItem('gb_track', JSON.stringify(o)); } catch (e) {}
  }
  var track = readStore();
  var qs = new URLSearchParams(location.search);
  TRACK_KEYS.forEach(function (k) { if (qs.get(k)) track[k] = qs.get(k); });
  if (!track.landing_page) track.landing_page = location.pathname;
  saveStore(track);

  // Propaga atribución a enlaces internos que llevan a otras páginas del sitio
  function withTracking(url) {
    var u;
    try { u = new URL(url, location.href); } catch (e) { return url; }
    TRACK_KEYS.forEach(function (k) { if (track[k]) u.searchParams.set(k, track[k]); });
    return u.toString();
  }
  document.querySelectorAll('a[data-keep-utm]').forEach(function (a) {
    a.href = withTracking(a.getAttribute('href'));
  });

  // ── FAQ ──
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  var page = document.body.getAttribute('data-page');

  // ── Página consumidor ──
  if (page === 'comprar') {
    gbTrackEvent('ViewContent', { content_name: 'GB FORCE caja 7 viales', value: PRICE_MXN, currency: 'MXN' });
    document.querySelectorAll('[data-price]').forEach(function (el) {
      el.textContent = '$' + PRICE_MXN.toLocaleString('es-MX');
    });
    // El botón de compra lleva a la página de pedido (datos de envío + pago con Clip)
    document.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.href = withTracking('pedido.html');
    });
  }

  // ── Comprar con un socio: lista de socios por estado (misma API que el mapa de index) ──
  var stateSel = document.getElementById('lpState');
  var partnersBox = document.getElementById('lpPartners');
  if (stateSel && partnersBox) {
    var partnersByState = null; // null = aún no cargado
    var DEMO_PARTNERS = [
      { Nombre: 'Socio de ejemplo 1', Municipio: 'Guadalajara', WhatsApp: '5210000000001', Estado: 'Jalisco', Orden: 1 },
      { Nombre: 'Socio de ejemplo 2', Municipio: 'Zapopan', WhatsApp: '5210000000002', Estado: 'Jalisco', Orden: 2 }
    ];
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var useDemo = isLocal && qs.get('demo') === '1';

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function indexPartners(records) {
      var map = {};
      records.forEach(function (f) {
        if (!f.Estado || !f.WhatsApp) return;
        (map[f.Estado] = map[f.Estado] || []).push({
          nombre: f.Nombre || '',
          municipio: f.Municipio || '',
          wa: String(f.WhatsApp).replace(/\D/g, ''),
          orden: typeof f.Orden === 'number' ? f.Orden : Infinity
        });
      });
      Object.keys(map).forEach(function (k) {
        map[k].sort(function (a, b) { return a.orden === b.orden ? 0 : (a.orden < b.orden ? -1 : 1); });
      });
      return map;
    }
    function loadPartners() {
      if (partnersByState) return Promise.resolve(partnersByState);
      if (useDemo) { partnersByState = indexPartners(DEMO_PARTNERS); return Promise.resolve(partnersByState); }
      return fetch('/api/distribuidores')
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (data) {
          partnersByState = indexPartners((data.records || []).map(function (r) { return r.fields || {}; }));
          return partnersByState;
        });
    }
    function noPartnersMsg(text) {
      partnersBox.innerHTML = '<p class="mx-partners-msg">' + text +
        ' <a href="#lpOnline">Compra en línea con envío a toda la República</a>.</p>';
    }

    stateSel.addEventListener('change', function () {
      var state = stateSel.value;
      if (!state) { partnersBox.innerHTML = ''; return; }
      gbTrackEvent('ViewPartners', { state: state });
      partnersBox.innerHTML = '<p class="mx-partners-msg">Buscando socios…</p>';
      loadPartners().then(function (map) {
        var list = map[state] || [];
        if (!list.length) { noPartnersMsg('Aún no hay un socio en ' + esc(state) + '.'); return; }
        partnersBox.innerHTML = list.map(function (d) {
          return '<div class="mx-partner"><div><b>' + esc(d.nombre) + '</b>' +
            (d.municipio ? '<small>' + esc(d.municipio) + '</small>' : '') + '</div>' +
            '<a class="mx-wa" href="https://wa.me/' + esc(d.wa) + '" target="_blank" rel="noopener" ' +
            'data-partner="' + esc(d.nombre) + '">Contactar por WhatsApp</a></div>';
        }).join('');
      }).catch(function () {
        noPartnersMsg('No pudimos cargar los socios en este momento.');
      });
    });

    partnersBox.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a.mx-wa') : null;
      if (a) gbTrackEvent('Contact', { content_name: 'socio', state: stateSel.value, partner: a.getAttribute('data-partner') });
    });
  }

  // ── Aparición suave al hacer scroll (landing.css .mx-reveal) ──
  var reveals = document.querySelectorAll('.mx-reveal');
  if (reveals.length) {
    if ('IntersectionObserver' in window) {
      var revObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); revObs.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      reveals.forEach(function (el) { revObs.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('in'); });
    }
  }

  // ── Botón fijo inferior (móvil): se oculta cuando el destino ya está a la vista ──
  var sticky = document.getElementById('lpSticky');
  var stickyTarget = document.getElementById(page === 'asociados' ? 'solicitar' : 'comprar');
  if (sticky && stickyTarget && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('lp-sticky-hide', entries[0].isIntersecting);
    }).observe(stickyTarget);
  }

  // ── Video explicativo (si existe): eventos de reproducción ──
  var vid = document.getElementById('lpVideo');
  if (vid) {
    var marks = { 25: false, 50: false, 75: false };
    vid.addEventListener('play', function once() {
      gbTrackEvent('VideoPlay', { content_name: 'Explicacion GB FORCE' });
      vid.removeEventListener('play', once);
    });
    vid.addEventListener('timeupdate', function () {
      if (!vid.duration) return;
      var pct = (vid.currentTime / vid.duration) * 100;
      [25, 50, 75].forEach(function (m) {
        if (!marks[m] && pct >= m) {
          marks[m] = true;
          gbTrackEvent('Video' + m, { content_name: 'Explicacion GB FORCE' });
        }
      });
    });
  }

  // ── Página gracias: confirma el pago real antes de contar la compra ──
  if (page === 'gracias') {
    var orderId = qs.get('o') || '';
    var gTitle = document.getElementById('gTitle');
    var gMsg = document.getElementById('gMsg');
    var setState = function (title, msg, paid) {
      if (gTitle) gTitle.textContent = title;
      if (gMsg) gMsg.textContent = msg;
      var s1 = document.getElementById('gStep1'), s1t = document.getElementById('gStep1Text');
      if (s1) s1.classList.toggle('gx-done', !!paid);
      if (s1t && paid) s1t.textContent = 'Recibimos tu pago correctamente.';
      var icon = document.getElementById('gIcon');
      if (icon) icon.classList.toggle('gx-check-wait', !paid);
    };
    if (/^GB-[A-Z0-9]{6}$/.test(orderId)) {
      var ow = document.getElementById('gOrderWrap'), oe = document.getElementById('gOrder');
      if (oe) oe.textContent = orderId;
      if (ow) ow.hidden = false;
    }
    var CALL = ' ¿Dudas? Llámanos al +52 33 3172 1515.';
    if (!/^GB-[A-Z0-9]{6}$/.test(orderId)) {
      setState('Gracias por visitarnos', 'Si hiciste un pedido, recibirás la confirmación por correo.' + CALL);
    } else {
      var tries = 0;
      var giveUp = function () {
        setState('Estamos confirmando tu pago', 'En cuanto se confirme te avisaremos por correo o teléfono. Tu pedido es ' + orderId + '.' + CALL);
      };
      var check = function () {
        fetch(STATUS_URL + '?o=' + encodeURIComponent(orderId))
          .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
          .then(function (res) {
            if (res && res.status === 'PAGADO') {
              setState('¡Gracias por tu compra!', 'Recibimos tu pago y tu pedido está en revisión. Te enviaremos un correo de confirmación y, cuando salga, el seguimiento de tu envío.', true);
              var key = 'gb_purchase_' + orderId;
              var already = false;
              try { already = sessionStorage.getItem(key) === '1'; } catch (e) {}
              if (!already) {
                // El mismo event_id (id del pedido) permite deduplicar con la API de conversiones
                gbTrackEvent('Purchase', { value: Number(res.amount) || PRICE_MXN, currency: 'MXN', content_name: 'GB FORCE' }, orderId);
                try { sessionStorage.setItem(key, '1'); } catch (e) {}
              }
            } else if (res && res.status === 'FALLIDO') {
              setState('No se completó el pago', 'Puedes intentarlo de nuevo desde la página de pedido.' + CALL);
            } else if (++tries < 6) {
              setTimeout(check, 3000);
            } else { giveUp(); }
          })
          .catch(function () { if (++tries < 6) setTimeout(check, 3000); else giveUp(); });
      };
      check();
    }
  }

  // ── Página asociados: filtro breve ──
  if (page === 'asociados') {
    gbTrackEvent('ViewContent', { content_name: 'Asociado GB FORCE' });
    var form = document.getElementById('asocForm');
    if (!form) return;
    var phone = form.querySelector('[name="telefono"]');
    if (phone) phone.addEventListener('input', function () {
      phone.value = phone.value.replace(/\D/g, '').slice(0, 10);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var err = document.getElementById('asocError');
      err.hidden = true;
      var fd = new FormData(form);
      if (!/^\d{10}$/.test(fd.get('telefono') || '')) {
        err.textContent = 'Escribe tu teléfono a 10 dígitos.';
        err.hidden = false;
        return;
      }
      var eventId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'gb-' + Date.now();
      var payload = {
        nombre: fd.get('nombre'),
        telefono: fd.get('telefono'),
        correo: fd.get('correo') || '',
        estado: fd.get('ciudad'),
        municipio: fd.get('ciudad'),
        canal_venta: fd.get('canal'),
        experiencia: fd.get('experiencia'),
        capacidad_arranque: fd.get('inversion'),
        form_version: 'asociados-v1',
        timestamp: new Date().toISOString(),
        url_origen: location.href,
        fbp: window.gbFbData ? gbFbData.fbp : '',
        fbc: window.gbFbData ? gbFbData.fbc : '',
        event_id: eventId
      };
      TRACK_KEYS.forEach(function (k) { payload[k] = track[k] || ''; });
      payload.landing_page = track.landing_page || location.pathname;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        gbTrackEvent('Lead', { content_name: 'Asociado GB FORCE' }, eventId);
        form.hidden = true;
        document.getElementById('asocOk').hidden = false;
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Solicitar llamada';
        err.textContent = 'No pudimos enviar tu solicitud. Intenta de nuevo o llámanos al +52 33 3172 1515.';
        err.hidden = false;
      });
    });
  }
})();
