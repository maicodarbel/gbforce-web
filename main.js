/* ============================================
   GB FORCE — MAIN JAVASCRIPT
   ============================================ */

const N8N_WEBHOOK_URL = 'https://n8n.guiahudumaliving.online/webhook/gbforce-leads';

document.addEventListener('DOMContentLoaded', () => {

  // ── URL PARAMS: ref + UTM/tracking ──
  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref');
  const referidoPorInput = document.getElementById('referido_por');
  if (refParam && referidoPorInput) referidoPorInput.value = refParam;

  const trackingData = {
    utm_source:    urlParams.get('utm_source')    || '',
    utm_medium:    urlParams.get('utm_medium')    || '',
    utm_campaign:  urlParams.get('utm_campaign')  || '',
    utm_content:   urlParams.get('utm_content')   || '',
    utm_term:      urlParams.get('utm_term')      || '',
    fbclid:        urlParams.get('fbclid')        || '',
    landing_page:  window.location.pathname,
    form_version:  'v2',
    ad_name:       urlParams.get('ad_name')       || '',
    adset_name:    urlParams.get('adset_name')    || '',
    campaign_name: urlParams.get('campaign_name') || '',
  };

  // ── MUNICIPIO CASCADE ──
  const estadoSelect = document.getElementById('estado');
  const municipioSelect = document.getElementById('municipio');
  if (estadoSelect && municipioSelect) {
    estadoSelect.addEventListener('change', () => {
      const municipios = (window.MUNICIPIOS_MX || {})[estadoSelect.value] || [];
      municipioSelect.innerHTML = '<option value="">Selecciona tu municipio</option>';
      municipios.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        municipioSelect.appendChild(opt);
      });
      municipioSelect.disabled = municipios.length === 0;
    });
  }

  // ── PHONE MASK xx-xxxx-xxxx ──
  const telInput = document.getElementById('telefono');
  const telError = document.getElementById('telefono_error');
  if (telInput) {
    telInput.addEventListener('input', () => {
      const digits = telInput.value.replace(/\D/g, '').slice(0, 10);
      let formatted = digits;
      if (digits.length > 2) formatted = digits.slice(0, 2) + '-' + digits.slice(2);
      if (digits.length > 6) formatted = formatted.slice(0, 7) + '-' + digits.slice(6);
      telInput.value = formatted;
      if (telError && telInput.value.length > 0) telError.style.display = 'none';
    });
    telInput.addEventListener('blur', () => {
      if (!telError) return;
      const valid = /^[0-9]{2}-[0-9]{4}-[0-9]{4}$/.test(telInput.value);
      telError.style.display = telInput.value && !valid ? 'block' : 'none';
    });
  }

  // ── EMAIL BLUR VALIDATION ──
  const correoInput = document.getElementById('correo');
  const correoError = document.getElementById('correo_error');
  if (correoInput) {
    const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    correoInput.addEventListener('blur', () => {
      if (!correoError) return;
      correoError.style.display = correoInput.value && !emailOk(correoInput.value) ? 'block' : 'none';
    });
    correoInput.addEventListener('input', () => {
      if (correoError && emailOk(correoInput.value)) correoError.style.display = 'none';
    });
  }

  // ── FUE_REFERIDO → mostrar "¿Quién te recomendó?" ──
  const fueReferidoSelect = document.getElementById('fue_referido');
  const referidoNombreGroup = document.getElementById('referido_nombre_group');
  if (fueReferidoSelect && referidoNombreGroup) {
    fueReferidoSelect.addEventListener('change', () => {
      const show = fueReferidoSelect.value === 'Me recomendó un conocido';
      referidoNombreGroup.style.display = show ? '' : 'none';
    });
  }

  // ── HEADER SCROLL ──
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  // ── HAMBURGER MENU ──
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  hamburger.addEventListener('click', () => {
    nav.classList.toggle('open');
    const bars = hamburger.querySelectorAll('span');
    const isOpen = nav.classList.contains('open');
    bars[0].style.transform = isOpen ? 'translateY(7px) rotate(45deg)' : '';
    bars[1].style.opacity = isOpen ? '0' : '';
    bars[2].style.transform = isOpen ? 'translateY(-7px) rotate(-45deg)' : '';
  });
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      const bars = hamburger.querySelectorAll('span');
      bars[0].style.transform = bars[1].style.opacity = bars[2].style.transform = '';
    });
  });

  // ── NAV HORIZONTAL SCROLL (desktop: wheel → horizontal) ──
  nav.addEventListener('wheel', (e) => {
    if (window.innerWidth > 768) {
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // ── VIDEO MODAL (product section) ──
  const videoModal = document.getElementById('videoModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalClose = document.getElementById('modalClose');
  const modalVideo = document.getElementById('modalVideo');

  function openModal() {
    if (!videoModal) return;
    videoModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (modalVideo) { modalVideo.currentTime = 0; modalVideo.play(); }
  }
  function closeModal() {
    if (!videoModal) return;
    videoModal.classList.remove('active');
    document.body.style.overflow = '';
    if (modalVideo) modalVideo.pause();
  }
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
  if (modalClose) modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Product video click-to-expand
  const productVideoEl = document.getElementById('productVideo');
  if (productVideoEl) {
    productVideoEl.addEventListener('click', openModal);
    productVideoEl.style.cursor = 'pointer';
  }

  // ── CALCULATOR ──
  const PRECIO_FIJO = 650;
  const COSTO_FIJO  = 399;

  const sliders = {
    semana: document.getElementById('slider-semana'),
    sub:    document.getElementById('slider-sub'),
    subpkg: document.getElementById('slider-subpkg'),
  };
  const vals = {
    semana: document.getElementById('val-semana'),
    sub:    document.getElementById('val-sub'),
    subpkg: document.getElementById('val-subpkg'),
  };
  const results = {
    ventas:    document.getElementById('res-ventas'),
    ingreso:   document.getElementById('res-ingreso'),
    ganancia:  document.getElementById('res-ganancia'),
    margen:    document.getElementById('res-margen'),
    subIngreso: document.getElementById('res-sub-ingreso'),
    total:     document.getElementById('res-total'),
  };
  const subGroup   = document.getElementById('sub-pkgs-group');
  const subResult  = document.getElementById('sub-result');
  const totalResult = document.getElementById('total-result');

  function fmt(n) { return '$' + Math.round(n).toLocaleString('es-MX'); }
  function updateSliderBg(slider) {
    const min = +slider.min, max = +slider.max, val = +slider.value;
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--gold) ${pct}%, var(--black-border) ${pct}%)`;
  }

  function calcUpdate() {
    const semana = +sliders.semana.value;
    const sub    = +sliders.sub.value;
    const subpkg = +sliders.subpkg.value;

    vals.semana.textContent = semana;
    vals.sub.textContent    = sub;
    vals.subpkg.textContent = subpkg;

    [sliders.semana, sliders.sub, sliders.subpkg].forEach(updateSliderBg);

    const ventasMes      = semana * 4;
    const ingresoPropio  = ventasMes * PRECIO_FIJO;
    const gananciaPropia = ventasMes * (PRECIO_FIJO - COSTO_FIJO);
    const margen         = ((PRECIO_FIJO - COSTO_FIJO) / PRECIO_FIJO * 100).toFixed(1);

    results.ventas.textContent   = ventasMes;
    results.ingreso.textContent  = fmt(ingresoPropio);
    results.ganancia.textContent = fmt(gananciaPropia);
    results.margen.textContent   = margen + '%';

    if (sub > 0) {
      subGroup.style.display  = 'block';
      subResult.style.display = 'block';
      totalResult.style.display = 'block';
      // Por cada pedido mínimo de 20 paq. del subdistribuidor,
      // el distribuidor recibe 2 paquetes gratis → $650 × 2 = $1,300 netos
      const GANANCIA_POR_PEDIDO = 2 * PRECIO_FIJO; // $1,300
      const subIngresoMes = sub * subpkg * GANANCIA_POR_PEDIDO;
      results.subIngreso.textContent = fmt(subIngresoMes);
      results.total.textContent = fmt(gananciaPropia + subIngresoMes);
    } else {
      subGroup.style.display    = 'none';
      subResult.style.display   = 'none';
      totalResult.style.display = 'none';
    }
  }

  if (sliders.semana && sliders.sub && sliders.subpkg) {
    [sliders.semana, sliders.sub, sliders.subpkg].forEach(s => {
      s.addEventListener('input', calcUpdate);
      updateSliderBg(s);
    });
    calcUpdate();
  }

  // ── FAQ ACCORDION ──
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // ── FORM SUBMIT ──
  const distForm = document.getElementById('distForm');
  const formSuccess = document.getElementById('formSuccess');
  if (distForm) {
    distForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validar checkboxes red_actual
      const redActualChecks = distForm.querySelectorAll('input[name="red_actual"]');
      const redActualErrorEl = document.getElementById('red_actual_error');
      const redActualValues = Array.from(redActualChecks).filter(cb => cb.checked).map(cb => cb.value);
      if (redActualErrorEl) redActualErrorEl.style.display = redActualValues.length === 0 ? 'block' : 'none';
      if (redActualValues.length === 0) {
        document.getElementById('red_actual_group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Validar checkboxes canal_venta
      const canalVentaChecks = distForm.querySelectorAll('input[name="canal_venta"]');
      const canalVentaErrorEl = document.getElementById('canal_venta_error');
      const canalVentaValues = Array.from(canalVentaChecks).filter(cb => cb.checked).map(cb => cb.value);
      if (canalVentaErrorEl) canalVentaErrorEl.style.display = canalVentaValues.length === 0 ? 'block' : 'none';
      if (canalVentaValues.length === 0) {
        document.getElementById('canal_venta_group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Validar teléfono inline al submit
      const telVal = telInput ? telInput.value : '';
      if (telError) telError.style.display = telVal && !/^[0-9]{2}-[0-9]{4}-[0-9]{4}$/.test(telVal) ? 'block' : 'none';

      // Validar email inline al submit
      const correoEl = document.getElementById('correo');
      const correoVal = correoEl ? correoEl.value.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoVal)) {
        if (correoError) correoError.style.display = 'block';
        correoEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (correoError) correoError.style.display = 'none';

      if (!distForm.checkValidity()) {
        distForm.reportValidity();
        return;
      }

      const submitBtn = distForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      const referidoNombreInput = document.getElementById('referido_nombre');
      const data = {
        nombre:             distForm.nombre.value.trim(),
        apellidos:          distForm.apellidos.value.trim(),
        telefono:           distForm.telefono.value.replace(/-/g, ''),
        correo:             distForm.correo.value.trim(),
        estado:             distForm.estado.value,
        municipio:          distForm.municipio.value,
        perfil:             distForm.perfil.value,
        experiencia:        distForm.experiencia.value,
        red_actual:         redActualValues.join(', '),
        etapa:              distForm.etapa.value,
        capacidad_arranque: distForm.capacidad_arranque.value,
        canal_venta:        canalVentaValues.join(', '),
        comentarios:        distForm.comentarios.value.trim(),
        fue_referido:       distForm.fue_referido.value,
        referido_nombre:    referidoNombreInput ? referidoNombreInput.value.trim() : '',
        referido_por:       distForm.referido_por.value.trim(),
        ...trackingData,
        timestamp:          new Date().toISOString(),
        url_origen:         window.location.href,
      };

      const errorEl = document.getElementById('formError');

      try {
        const res = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        distForm.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        const nameSpan = document.getElementById('successName');
        if (nameSpan) nameSpan.textContent = data.nombre.split(' ')[0];
        formSuccess.style.display = 'block';
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        if (errorEl) {
          errorEl.textContent = 'Hubo un problema al enviar tu solicitud. Por favor intenta de nuevo o escríbenos por WhatsApp.';
          errorEl.style.display = 'block';
        }
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // ── PORTAL LOGIN (solo activo en login.html) ──
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const portalLayout = document.getElementById('portalLayout');
    const portalDashboard = document.getElementById('portalDashboard');
    const logoutBtn = document.getElementById('logoutBtn');
    const dashUser = document.getElementById('dashUser');

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = document.getElementById('loginUser').value.trim();
      const pass = document.getElementById('loginPass').value.trim();
      if ((user === 'demo' || user.includes('@')) && pass.length >= 6) {
        dashUser.textContent = user === 'demo' ? 'Demo' : user.split('@')[0];
        portalLayout.style.display = 'none';
        portalDashboard.style.display = 'block';
        portalDashboard.classList.add('visible');
        portalDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const errMsg = document.createElement('p');
        errMsg.style.cssText = 'color:#C0392B;font-size:0.8rem;margin-top:0.75rem;text-align:center;';
        errMsg.textContent = 'Credenciales incorrectas. Usa: demo / gbforce2024';
        const existing = loginForm.querySelector('.err-msg');
        if (existing) existing.remove();
        errMsg.classList.add('err-msg');
        loginForm.appendChild(errMsg);
      }
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        portalDashboard.style.display = 'none';
        portalLayout.style.display = 'grid';
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
      });
    }

    const dashSearch = document.getElementById('dashSearch');
    if (dashSearch) {
      dashSearch.addEventListener('input', () => {
        const q = dashSearch.value.toLowerCase();
        document.querySelectorAll('.dash-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = q === '' || text.includes(q) ? '' : 'none';
        });
      });
    }
  }

  // ── MEXICO MAP (D3.js + GeoJSON) ──
  const ESTADOS_MEXICO = [
    'Baja California', 'Baja California Sur', 'Sonora', 'Chihuahua', 'Coahuila',
    'Nuevo León', 'Tamaulipas', 'Sinaloa', 'Durango', 'Zacatecas', 'San Luis Potosí',
    'Nayarit', 'Jalisco', 'Aguascalientes', 'Guanajuato', 'Querétaro', 'Hidalgo',
    'Michoacán', 'Estado de México', 'Ciudad de México', 'Morelos', 'Tlaxcala',
    'Puebla', 'Veracruz', 'Colima', 'Guerrero', 'Oaxaca', 'Chiapas', 'Tabasco',
    'Campeche', 'Yucatán', 'Quintana Roo'
  ];

  let mapData = {};

  async function loadDistribuidores() {
    ESTADOS_MEXICO.forEach(e => { mapData[e] = { distribuidores: [] }; });

    try {
      const res = await fetch('/api/distribuidores');
      const data = await res.json();
      if (data.records) {
        data.records.forEach(r => {
          const f = r.fields;
          if (f.Estado && mapData[f.Estado]) {
            mapData[f.Estado].distribuidores.push({
              nombre: f.Nombre || '',
              municipio: f.Municipio || '',
              wa: f.WhatsApp || ''
            });
          }
        });
      }
    } catch (e) {
      console.error('Error cargando distribuidores:', e);
    }
  }

  // Normalize GeoJSON state names to match mapData keys
  function normalizeStateName(name) {
    if (!name) return '';
    const fixes = {
      'Coahuila de Zaragoza': 'Coahuila',
      'Querétaro de Arteaga': 'Querétaro',
      'Michoacán de Ocampo': 'Michoacán',
      'México': 'Estado de México',
      'Veracruz de Ignacio de la Llave': 'Veracruz',
      'Distrito Federal': 'Ciudad de México',
    };
    return fixes[name] || name;
  }

  const mapPanel = document.getElementById('mapPanel');
  const mapStateSelect = document.getElementById('mapStateSelect');
  const mapContainer = document.getElementById('mexicoMap');
  const mapLoading = document.getElementById('mapLoading');
  let selectedNode = null;
  let currentFilter = 'todos';
  let mapSvg = null;

  function renderStatePanel(stateName) {
    const data = mapData[stateName];
    if (!data) {
      mapPanel.innerHTML = `<div class="map-panel-default"><div class="map-panel-icon">🗺️</div><h3>${stateName}</h3><p>Información no disponible para este estado.</p></div>`;
      return;
    }
    const dists = data.distribuidores;
    let html = `<div class="state-panel-title">${stateName}</div>`;
    if (dists.length === 0) {
      html += `<div class="zone-available"><div class="zone-badge">Zona disponible</div><p>Esta zona está disponible para nuevos distribuidores autorizados. Sé el primero en representar GB FORCE en <strong>${stateName}</strong>.</p><a href="oportunidad.html#formulario" class="btn-gold">Quiero tomar esta zona</a></div>`;
    } else {
      dists.forEach(d => {
        html += `<div class="distribuidor-card"><div class="dist-name">${d.nombre}</div>${d.municipio ? `<div class="dist-city">📍 ${d.municipio}</div>` : ''}<div class="dist-contact"><a href="https://wa.me/${d.wa}?text=Hola,%20encontré%20tu%20contacto%20en%20GB%20FORCE" target="_blank">💬 Contactar por WhatsApp</a></div></div>`;
      });
      html += `<a href="oportunidad.html#formulario" class="btn-ghost" style="margin-top:1rem;display:inline-flex;">Ser distribuidor en ${stateName}</a>`;
    }
    mapPanel.innerHTML = html;
  }

  function applyFilter(paths) {
    paths.each(function(d) {
      const sn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
      const hasDist = mapData[sn] && mapData[sn].distribuidores.length > 0;
      let opacity = '1';
      if (currentFilter === 'autorizado') opacity = hasDist ? '1' : '0.2';
      else if (currentFilter === 'disponible') opacity = !hasDist ? '1' : '0.2';
      d3.select(this).style('opacity', opacity);
    });
  }

  function initD3Map() {
    const w = mapContainer.clientWidth || 700;
    const h = Math.round(w * 0.6);
    const svg = d3.select('#mapSvg').attr('width', w).attr('height', h);
    mapSvg = svg;
    svg.selectAll('*').remove();

    const geo = window.MEXICO_GEO;
    if (!geo) {
      if (mapLoading) mapLoading.textContent = 'Error: no se encontraron datos del mapa.';
      return;
    }
    if (mapLoading) mapLoading.style.display = 'none';

    // Background
    svg.append('rect').attr('width', w).attr('height', h).attr('fill', '#0d0d0d');

    // Compute bounding box from all polygon coordinates (handles Polygon + MultiPolygon)
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    function scanRing(ring) {
      ring.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    }
    geo.features.forEach(f => {
      const geom = f.geometry;
      if (geom.type === 'Polygon') {
        scanRing(geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => scanRing(poly[0]));
      }
    });

    // Linear projection: scale coordinates to fit SVG with padding
    const pad = 28;
    const rangeX = maxLon - minLon;
    const rangeY = maxLat - minLat;
    const scaleX = (w - pad * 2) / rangeX;
    const scaleY = (h - pad * 2) / rangeY;
    const sc = Math.min(scaleX, scaleY);
    const offX = (w - sc * rangeX) / 2;
    const offY = (h - sc * rangeY) / 2;

    function proj([lon, lat]) {
      return [
        offX + sc * (lon - minLon),
        h - (offY + sc * (lat - minLat))  // flip Y: lat increases upward
      ];
    }

    function ringD(ring) {
      return ring.map((c, i) => {
        const [x, y] = proj(c);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ') + ' Z';
    }

    function featureD(geom) {
      if (geom.type === 'Polygon') {
        return ringD(geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        // Render all polygons (islands, peninsulas, etc.)
        return geom.coordinates.map(poly => ringD(poly[0])).join(' ');
      }
      return '';
    }

    function featureCentroid(geom) {
      // Use the largest polygon for label placement
      let ring;
      if (geom.type === 'Polygon') {
        ring = geom.coordinates[0];
      } else {
        ring = geom.coordinates.reduce((a, b) => b[0].length > a[0].length ? b : a)[0];
      }
      const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      return proj([cx, cy]);
    }

    const paths = svg.selectAll('path')
      .data(geo.features)
      .enter()
      .append('path')
      .attr('d', d => featureD(d.geometry))
      .attr('class', d => {
        const sn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
        const hasDist = mapData[sn] && mapData[sn].distribuidores.length > 0;
        return 'estado' + (hasDist ? '' : ' disponible');
      })
      .on('mouseenter', function() { d3.select(this).classed('hovered', true); })
      .on('mouseleave', function() { d3.select(this).classed('hovered', false); })
      .on('click', function(event, d) {
        if (selectedNode) d3.select(selectedNode).classed('selected', false).classed('hovered', false);
        selectedNode = this;
        d3.select(this).classed('selected', true);
        const sn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
        if (mapStateSelect) mapStateSelect.value = sn;
        renderStatePanel(sn);
      });

    // State labels
    svg.selectAll('text')
      .data(geo.features.filter(d => {
        const sn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
        return ['Ciudad de México','Tlaxcala','Morelos','Aguascalientes','Colima'].indexOf(sn) === -1;
      }))
      .enter()
      .append('text')
      .attr('class', 'map-state-label')
      .attr('x', d => featureCentroid(d.geometry)[0])
      .attr('y', d => featureCentroid(d.geometry)[1])
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .text(d => {
        const sn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
        const abbrev = { 'Baja California': 'B.C.', 'Baja California Sur': 'B.C.S.', 'San Luis Potosí': 'S.L.P.', 'Estado de México': 'Méx.', 'Nuevo León': 'N.L.' };
        return abbrev[sn] || (sn.length > 10 ? sn.split(' ')[0] : sn);
      });

    applyFilter(paths);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        applyFilter(svg.selectAll('path'));
      });
    });
  }

  // Select listener — registrado una sola vez, antes de que cargue el mapa
  if (mapStateSelect) {
    mapStateSelect.addEventListener('change', () => {
      if (!mapSvg) return;
      const sn = mapStateSelect.value;
      if (!sn) return;
      mapSvg.selectAll('path').each(function(d) {
        const pathSn = normalizeStateName(d.properties.name || d.properties.ESTADO || '');
        if (pathSn === sn) {
          if (selectedNode) d3.select(selectedNode).classed('selected', false).classed('hovered', false);
          selectedNode = this;
          d3.select(this).classed('selected', true);
          renderStatePanel(sn);
        }
      });
    });
  }

  if (mapContainer) {
    loadDistribuidores().then(() => {
      initD3Map();
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(initD3Map, 300);
      });
    });
  }

  // ── SCROLL ANIMATIONS ──
  const fadeEls = document.querySelectorAll(
    '.problem-card, .ingredient-card, .opp-card, .profile-card, .material-card, .pricing-card, .timeline-item, .dash-card, .use-case-card, .differentiator-point, .rebel-point, .how-to-step'
  );
  fadeEls.forEach(el => el.classList.add('fade-up'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  fadeEls.forEach(el => observer.observe(el));

  // Staggered children in grids
  const grids = document.querySelectorAll('.problems-grid, .ingredients-grid, .opportunity-grid, .profiles-grid, .materials-grid, .pricing-cards, .dashboard-grid, .use-cases-grid, .differentiator-points, .rebel-points-grid');
  grids.forEach(grid => {
    const items = grid.querySelectorAll('.fade-up');
    items.forEach((item, i) => { item.style.transitionDelay = `${i * 0.05}s`; });
  });

  // ── ACTIVE NAV LINK ──
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav a');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { threshold: 0.3 });
  sections.forEach(s => io.observe(s));

});
