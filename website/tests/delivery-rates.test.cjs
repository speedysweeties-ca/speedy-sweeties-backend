const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const homepage = readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');

test('homepage fee edits propagate to the beer FAQ without editing service copy', async () => {
  const { renderBeerPriceAnswer } = await import('../content/delivery-rates.mjs');
  const changed = homepage.replace('$10.64', '$12.34').replace('$5 flat surcharge', '$7.50 flat surcharge');
  const answer = renderBeerPriceAnswer(changed);
  assert.match(answer, /city limits is \$12\.34 plus HST/);
  assert.match(answer, /\$7\.50 flat surcharge per order, including HST/);
  assert.match(answer, /Debit at the door has no payment fee/);
  assert.doesNotMatch(answer, /\$10\.64|\$5 flat surcharge/);
});

test('missing, duplicate or unrecognized rate wording fails before publication', async () => {
  const { renderBeerPriceAnswer } = await import('../content/delivery-rates.mjs');
  assert.throws(() => renderBeerPriceAnswer(homepage.replace('Delivery within city limits', 'Changed delivery label')));
  assert.throws(() => renderBeerPriceAnswer(homepage.replace('*Prices subject to HST', 'Changed tax treatment')));
  assert.throws(() => renderBeerPriceAnswer(homepage.replace('$5 flat surcharge per order, including HST.', 'Ask about card fees.')));
  const row = '<div class="rates-text">Delivery within city limits</div><div class="rates-text">$1.00</div>';
  assert.throws(() => renderBeerPriceAnswer(homepage.replace('<section id="contact-us"', row + '<section id="contact-us"')));
});
