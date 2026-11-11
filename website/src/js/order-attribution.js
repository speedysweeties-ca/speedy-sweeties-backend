/* Coarse, best-effort entry attribution. No identifiers or arbitrary URL text are retained. */
(() => {
  if (!window.speedySite?.live) return;
  const key = 'speedy-order-attribution-v1';
  const ttl = 30 * 60 * 1000;
  const pages = new Map([
    ['/', 'home'], ['/beer-delivery-guelph/', 'beer'],
    ['/alcohol-delivery-guelph/', 'alcohol'], ['/vape-delivery-guelph/', 'vape'],
    ['/cannabis-delivery-guelph/', 'cannabis'], ['/convenience-delivery-guelph/', 'convenience']
  ]);
  const pairs = new Map([
    ['google', ['organic', 'cpc']], ['bing', ['organic', 'cpc']],
    ['yahoo', ['organic']], ['duckduckgo', ['organic']],
    ['facebook', ['social', 'paid_social']], ['instagram', ['social', 'paid_social']],
    ['chatgpt.com', ['ai-assistant']], ['perplexity.ai', ['ai-assistant']],
    ['copilot.microsoft.com', ['ai-assistant']], ['gemini.google.com', ['ai-assistant']],
    ['other_referral', ['referral']]
  ]);
  const matches = (host, domain) => host === domain || host.endsWith('.' + domain);
  const pairValid = record => (record.source === '' && record.medium === '') || pairs.get(record.source)?.includes(record.medium);
  const remove = () => { try { window.sessionStorage.removeItem(key); } catch (_) {} };
  const now = () => Date.now();
  const landing = pages.get(window.location.pathname) || 'other';
  let record;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key));
    if (saved && pairValid(saved) && ['home', 'beer', 'alcohol', 'vape', 'cannabis', 'convenience', 'other'].includes(saved.landing)
      && ['utm', 'referrer', 'click_tag', 'unknown'].includes(saved.method)
      && Number.isFinite(saved.createdAt) && saved.createdAt <= now() && now() - saved.createdAt < ttl) {
      // Copy only defined, validated fields; never spread stored data into an order.
      record = { source: saved.source, medium: saved.medium, landing: saved.landing, method: saved.method, createdAt: saved.createdAt };
    } else remove();
  } catch (_) { remove(); }
  let source = '', medium = '', method = 'unknown', external = false;
  try {
    const ref = new URL(document.referrer);
    const host = ref.hostname.toLowerCase();
    external = ['http:', 'https:'].includes(ref.protocol) && !['www.speedysweeties.ca', 'speedysweeties.ca'].includes(host);
    if (external) {
      if (['chatgpt.com', 'chat.openai.com'].some(domain => matches(host, domain))) [source, medium] = ['chatgpt.com', 'ai-assistant'];
      else if (['perplexity.ai', 'copilot.microsoft.com', 'gemini.google.com'].some(domain => matches(host, domain))) {
        source = ['perplexity.ai', 'copilot.microsoft.com', 'gemini.google.com'].find(domain => matches(host, domain)); medium = 'ai-assistant';
      } else if (['google.com', 'google.ca', 'google.co.uk', 'www.google.com', 'www.google.ca', 'www.google.co.uk'].includes(host)) [source, medium] = ['google', 'organic'];
      else if (['bing.com', 'yahoo.com', 'duckduckgo.com'].some(domain => matches(host, domain))) {
        source = ['bing', 'yahoo', 'duckduckgo'].find(name => matches(host, name + '.com')); medium = 'organic';
      } else if (['facebook.com', 'instagram.com'].some(domain => matches(host, domain))) {
        source = matches(host, 'facebook.com') ? 'facebook' : 'instagram'; medium = 'social';
      } else [source, medium] = ['other_referral', 'referral'];
      method = 'referrer';
    }
  } catch (_) {}
  try {
    const query = new URLSearchParams(window.location.search);
    const taggedSource = (query.get('utm_source') || '').trim().toLowerCase();
    const taggedMedium = (query.get('utm_medium') || '').trim().toLowerCase();
    const normalizedSource = taggedSource === 'chatgpt' ? 'chatgpt.com' : taggedSource;
    // AI links may carry only utm_source, or use the ordinary referral medium.
    const normalizedMedium = pairs.get(normalizedSource)?.includes('ai-assistant') && ['', 'referral'].includes(taggedMedium)
      ? 'ai-assistant' : taggedMedium;
    if (pairs.get(normalizedSource)?.includes(normalizedMedium)) {
      source = normalizedSource; medium = normalizedMedium; method = 'utm';
    } else if (['gclid', 'gbraid', 'wbraid'].some(name => Boolean(query.get(name)))) {
      source = 'google'; medium = 'cpc'; method = 'click_tag';
    } else if (query.get('msclkid')) {
      source = 'bing'; medium = 'cpc'; method = 'click_tag';
    }
  } catch (_) {}
  if (!record || external || method === 'utm' || method === 'click_tag') {
    record = { source, medium, method, landing, createdAt: now() };
    try { window.sessionStorage.setItem(key, JSON.stringify(record)); } catch (_) {}
  }
  // Expiry is not extended by internal navigation or by submitting another order.
  window.setTimeout(remove, Math.max(0, record.createdAt + ttl - now()));
  window.speedyOrderAttribution = Object.freeze({
    fields() {
      if (now() - record.createdAt >= ttl || record.createdAt > now()) {
        remove();
        return { utmContent: 'web_v1:unknown:expired' };
      }
      return {
        ...(record.source ? { utmSource: record.source, utmMedium: record.medium } : {}),
        utmContent: 'web_v1:' + record.landing + ':' + record.method
      };
    }
  });
})();
