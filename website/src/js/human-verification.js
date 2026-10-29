(() => {
  let widgetId;
  let token = '';
  let issuedAt = 0;
  let status;
  let widget;
  let retry;
  let loadingTimer;
  const changed = message => {
    if (status) status.textContent = message;
    document.dispatchEvent(new CustomEvent('speedy:verification-change'));
  };
  const clear = message => { token = ''; issuedAt = 0; changed(message); };
  const unavailable = () => {
    clear('Verification could not load. Retry below or call 519-826-8097 to order.');
    if (retry) retry.hidden = false;
  };
  const ready = () => Boolean(token) && Date.now() - issuedAt < 290000;
  const reset = () => {
    clear('Please complete the human verification.');
    if (widgetId !== undefined && window.turnstile) {
      try { window.turnstile.reset(widgetId); } catch { unavailable(); }
    }
  };
  const render = () => {
    clearTimeout(loadingTimer);
    if (widgetId !== undefined) return;
    try {
      widgetId = window.turnstile.render(widget, {
        sitekey: window.speedySite.turnstileSiteKey,
        action: 'website_order', theme: 'light', size: 'flexible',
        appearance: 'always', 'response-field': false,
        callback: value => {
          token = value; issuedAt = Date.now(); retry.hidden = true;
          changed('Verification complete.');
        },
        'expired-callback': () => clear('Verification expired. Please verify again.'),
        'timeout-callback': () => { clear('Verification timed out. Please retry.'); retry.hidden = false; },
        'error-callback': () => { unavailable(); return true; },
        'refresh-expired': 'auto'
      });
      if (widgetId === undefined) unavailable();
    } catch { unavailable(); }
  };
  const load = () => {
    retry.hidden = true;
    clear('Loading human verification…');
    if (window.turnstile) { widgetId === undefined ? render() : reset(); return; }
    document.getElementById('speedy-turnstile-script')?.remove();
    const script = document.createElement('script');
    script.id = 'speedy-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=speedyTurnstileLoaded';
    script.async = true;
    script.onerror = unavailable;
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(unavailable, 15000);
    document.head.appendChild(script);
  };
  window.speedyTurnstileLoaded = render;
  window.speedyHumanVerification = Object.freeze({
    ready,
    getToken: () => ready() ? token : '',
    reset,
    mount(parent) {
      if (window.speedySite?.live !== true || widget) return;
      const section = document.createElement('div');
      section.className = 'speedy-human-verification';
      widget = document.createElement('div');
      widget.setAttribute('aria-label', 'Human verification');
      status = document.createElement('p');
      status.id = 'speedy-verification-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry verification'; retry.hidden = true;
      retry.addEventListener('click', load);
      section.append(widget, status, retry); parent.appendChild(section);
      if (!window.speedySite.turnstileSiteKey) { unavailable(); retry.hidden = true; return; }
      load();
    }
  });
})();
