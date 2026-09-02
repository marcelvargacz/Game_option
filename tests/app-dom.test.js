import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(id = '') { this.id = id; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.disabled = false; this.className = ''; this.options = []; this.handlers = {}; }
  add(option) { this.options.push(option); if (!this.value) this.value = String(option.value); }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  dispatch(type, target = this) { this.handlers[type]?.({ target, preventDefault() {} }); }
}

function setupDom() {
  const ids = ['ticker', 'spot', 'ticker-name', 'day', 'expiry', 'row-count', 'chain', 'legs', 'strategy-card', 'open-trade', 'trade-message', 'positions', 'equity', 'cash', 'reserved', 'presets', 'clear', 'next', 'up', 'down'];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  globalThis.document = { getElementById: (id) => elements[id] };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  return elements;
}

test('změna tickeru, expirace a počtu řádků vykreslí přehledný opční chain', async () => {
  const elements = setupDom();
  await import(`../src/app.js?test=${Date.now()}`);
  assert.equal((elements.chain.innerHTML.match(/chain-row/g) ?? []).length, 9);
  assert.match(elements.chain.innerHTML, /class="bid"><button data-leg="call-short"/);
  assert.match(elements.chain.innerHTML, /class="ask"><button data-leg="call-long"/);
  assert.match(elements.chain.innerHTML, /class="bid"><button data-leg="put-short"/);
  assert.match(elements.chain.innerHTML, /class="ask"><button data-leg="put-long"/);
  elements.ticker.value = 'VELI';
  elements.ticker.dispatch('change');
  assert.equal((elements.chain.innerHTML.match(/chain-row/g) ?? []).length, 9);
  elements.expiry.value = '60';
  elements.expiry.dispatch('change');
  assert.equal((elements.chain.innerHTML.match(/chain-row/g) ?? []).length, 9);
  elements['row-count'].value = '5';
  elements['row-count'].dispatch('change');
  assert.equal((elements.chain.innerHTML.match(/chain-row/g) ?? []).length, 5);
  elements['row-count'].value = '13';
  elements['row-count'].dispatch('change');
  assert.equal((elements.chain.innerHTML.match(/chain-row/g) ?? []).length, 13);
});
