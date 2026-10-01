/* Run before analytics: keep the private tracking token out of page URLs. */
(() => {
  function captureLink() {
    if (!window.location.hash.startsWith("#track=")) return false;
    const token = window.location.hash.slice(7);
    window.speedyTrackingLink = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    window.speedyTrackingLinkInvalid = !window.speedyTrackingLink;
    window.history.replaceState(null, "", window.location.pathname + window.location.search + "#track-my-order");
    return true;
  }
  captureLink();
  window.addEventListener("hashchange", () => {
    if (captureLink()) document.dispatchEvent(new CustomEvent("speedy:tracking-link-opened"));
  });
})();
