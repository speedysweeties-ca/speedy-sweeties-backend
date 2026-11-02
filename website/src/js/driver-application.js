(() => {
  const form = document.getElementById('driver-application');
  const status = document.getElementById('application-status');
  const review = document.getElementById('application-review');
  const email = document.getElementById('application-email');
  const fields = document.getElementById('application-fields');
  if (!form || !status || !review || !email || !fields) return;
  if (window.speedySite?.live !== true) {
    status.textContent = 'Preview only — the application form is disabled. Visit www.speedysweeties.ca/drive-with-us/ to apply.';
    return;
  }
  fields.disabled = false;
  const clearDraft = () => {
    review.hidden = true;
    email.removeAttribute('href');
    document.getElementById('application-copy').value = '';
    status.textContent = '';
  };
  form.addEventListener('input', clearDraft);
  form.addEventListener('change', clearDraft);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const names = [
      ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['city', 'City or area'],
      ['vehicle', 'Vehicle access'], ['licence', 'Valid driver’s licence'],
      ['availability', 'Availability'], ['experience', 'Experience / notes']
    ];
    const body = 'Hello Speedy Sweeties,\n\nI would like to apply to join your delivery team.\n\n' +
      names.map(([id, label]) => `${label}: ${document.getElementById(`applicant-${id}`).value.trim() || 'Not provided'}`).join('\n') +
      '\n\nI understand this is an independent contractor opportunity and agree to be contacted about my application.';
    document.getElementById('application-copy').value = body;
    email.href = 'mailto:speedysweeties@hotmail.com?subject=' + encodeURIComponent('Driver application — Speedy Sweeties') + '&body=' + encodeURIComponent(body);
    review.hidden = false;
    status.textContent = 'Your email text is ready. Your application has not been sent. Review it below, then send it from your email app.';
    document.getElementById('application-copy').focus();
  });
})();
