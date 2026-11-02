/* The welcome screen is a self-declaration, never proof of identity or eligibility. */
(() => {
  const gate = document.getElementById('age-gate');
  const content = document.getElementById('service-content');
  if (!gate || !content) return;
  const key = 'speedy:service-age-acknowledged';
  const yes = document.getElementById('age-yes');
  const question = document.getElementById('age-question');
  const declined = document.getElementById('age-declined');
  const service = document.body.dataset.service;
  const allowedServices = ['beer', 'alcohol', 'vapes', 'cannabis', 'convenience'];
  const track = (name, fields = {}) => {
    if (window.speedySite?.live === true && allowedServices.includes(service) && typeof window.gtag === 'function') {
      window.gtag('event', name, { service, ...fields });
    }
  };
  const dismiss = () => {
    gate.close();
    content.inert = false;
    content.removeAttribute('inert');
    const title = document.getElementById('page-title');
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  };
  let acknowledged = false;
  try { acknowledged = window.sessionStorage.getItem(key) === '19-plus'; } catch { /* Storage may be blocked. */ }
  if (acknowledged) {
    dismiss();
  } else {
    // Move the initial, no-JS-visible dialog into the browser's modal top layer.
    gate.removeAttribute('open');
    gate.showModal();
    yes.focus({ preventScroll: true });
  }
  gate.addEventListener('cancel', event => event.preventDefault());
  yes.addEventListener('click', () => {
    try { window.sessionStorage.setItem(key, '19-plus'); } catch { /* Allow this page without persistent storage. */ }
    track('landing_age_confirmation');
    dismiss();
  });
  document.getElementById('age-no').addEventListener('click', () => {
    question.hidden = true;
    declined.hidden = false;
    gate.setAttribute('aria-labelledby', 'age-declined-title');
    gate.removeAttribute('aria-describedby');
    document.getElementById('age-declined-title').focus();
  });
  document.getElementById('age-back').addEventListener('click', () => {
    question.hidden = false;
    declined.hidden = true;
    gate.setAttribute('aria-labelledby', 'age-title');
    gate.setAttribute('aria-describedby', 'age-description');
    yes.focus();
  });
  if (window.speedySite?.live !== true) document.getElementById('landing-preview').hidden = false;
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-landing-destination]') : null;
    const destination = target?.dataset.landingDestination;
    if (!gate.open && ['home', 'order', 'phone', 'services'].includes(destination)) {
      track('service_landing_click', { destination });
    }
  });
})();
