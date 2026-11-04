(() => {
  const counter = document.querySelector('[data-page-counter]');
  if (!counter || counter.dataset.started) return;
  counter.dataset.started = 'true';
  const value = counter.querySelector('[data-page-count]');
  if (window.speedySite?.live !== true || window.location.hostname !== 'www.speedysweeties.ca') {
    value.textContent = 'Preview';
    return;
  }
  // Aggregate page loads only: no visitor identifiers, cookies or browser storage.
  // Never retry an increment: a lost response may already have been counted.
  fetch('https://speedy-api-lbfe.onrender.com/api/v1/page-views/' + encodeURIComponent(counter.dataset.pageCounter), {
    method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(8000)
  }).then(async response => {
    if (!response.ok) throw new Error('Counter unavailable');
    const data = await response.json();
    if (typeof data.views !== 'string' || !/^[0-9]{1,19}$/.test(data.views)) throw new Error('Invalid count');
    value.textContent = BigInt(data.views).toLocaleString('en-CA');
  }).catch(() => { value.textContent = 'Temporarily unavailable'; });
})();
