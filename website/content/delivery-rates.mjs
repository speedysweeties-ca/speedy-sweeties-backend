import { readFileSync } from 'node:fs';

// The homepage remains the maintained fee source. Read it at build time so
// the beer FAQ cannot silently retain an old amount after a rate update.
export function renderBeerPriceAnswer(homepage) {
  const section = homepage.match(/<section id="rates"[\s\S]*?(?=<section id="contact-us")/)?.[0];
  if (!section || !section.includes('*Prices subject to HST')) {
    throw new Error('Beer price FAQ requires the homepage rates and HST notice.');
  }
  const value = label => {
    const matches = [...section.matchAll(new RegExp(`<div class="rates-text">${label}\\s*</div>\\s*<div class="rates-text">([\\s\\S]*?)</div>`, 'g'))];
    if (matches.length !== 1) throw new Error(`Expected one homepage rate: ${label}`);
    return matches[0][1].replace(/<[^>]*>/g, '').trim();
  };
  const city = value('Delivery within city limits');
  const debit = value('Debit at the door');
  const card = value('Visa or Mastercard Payment');
  if (!/^\$\d+\.\d{2}$/.test(city) || !/^(Free|\$\d+\.\d{2})$/.test(debit) ||
      !/^\$\d+(?:\.\d{2})? flat surcharge per order, including HST\.$/.test(card)) {
    throw new Error('Review changed homepage fee wording before publishing the beer FAQ.');
  }
  const debitSentence = debit === 'Free' ? 'Debit at the door has no payment fee.' : `Debit at the door has a ${debit} payment fee plus HST.`;
  return `Delivery within Guelph city limits is ${city} plus HST. ${debitSentence} Visa or Mastercard has a ${card} Extra stops and deliveries outside the city have additional charges. Check our current rates, or call 519-826-8097 to confirm availability and pricing outside Guelph.`;
}

export function getBeerDeliveryPriceAnswer() {
  return renderBeerPriceAnswer(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'));
}
