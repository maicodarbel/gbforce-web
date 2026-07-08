/* ============================================
   GB FORCE — META PIXEL HELPERS
   Compartido por index.html, oportunidad.html, login.html, dashboard.html
   ============================================ */

function gbGetCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : '';
}

function gbGenEventId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'gb-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function gbTrackEvent(eventName, customData, eventId) {
  if (typeof fbq !== 'function') return;
  fbq('track', eventName, customData || {}, { eventID: eventId || gbGenEventId() });
}

window.gbFbData = {
  fbp: gbGetCookie('_fbp'),
  fbc: gbGetCookie('_fbc'),
};
