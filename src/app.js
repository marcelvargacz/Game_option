import { advanceDay, closePosition, createGame, gameEquity, generateChain, openTrade, summarizeStrategy } from './engine.js';

const assets = {
  LUMA: { name: 'Luma Robotics', spot: 100, volatility: 0.31 },
  VELI: { name: 'Veli Energy', spot: 74, volatility: 0.42 },
  NORA: { name: 'Nora Biotech', spot: 132, volatility: 0.52 },
};
const fmt = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const money = (value) => typeof value === 'string' ? value : fmt.format(value);
const byId = (id) => document.getElementById(id);
const dom = Object.fromEntries(['ticker', 'spot', 'ticker-name', 'day', 'expiry', 'chain', 'legs', 'strategy-card', 'open-trade', 'trade-message', 'positions', 'equity', 'cash', 'reserved', 'presets'].map((id) => [id, byId(id)]));

let game = createGame();
let ticker = 'LUMA';
let spot = assets[ticker].spot;
let selectedExpiry = 30;
let draft = [];

Object.entries(assets).forEach(([symbol, asset]) => dom.ticker.add(new Option(`${symbol} · ${asset.name}`, symbol)));
[14, 30, 60].forEach((days) => dom.expiry.add(new Option(`${days} dní`, days)));
dom.expiry.value = selectedExpiry;

const presets = [
  ['long-call', 'Long Call'], ['long-put', 'Long Put'], ['csp', 'Cash-Secured Put'],
  ['bull-call', 'Bull Call Spread'], ['bear-put', 'Bear Put Spread'], ['iron-condor', 'Iron Condor'],
];
dom.presets.innerHTML = presets.map(([id, label]) => `<button data-preset="${id}">${label}</button>`).join('');

function currentChain() { return generateChain({ ticker, spot, day: game.day, volatility: assets[ticker].volatility }); }
function optionFor(type, strike) { return currentChain()[`${type}s`].find((option) => option.strike === strike && option.expiryDays === selectedExpiry); }
function setDraft(legs) { draft = legs.map((leg) => ({ ...leg, quantity: 1, expiryDays: selectedExpiry })); render(); }
function addLeg(option, side) {
  draft.push({ type: option.type, side, strike: option.strike, premium: side === 'long' ? option.ask : option.bid, quantity: 1, expiryDays: option.expiryDays });
  render();
}
function makePreset(id) {
  const strikes = currentChain().strikes;
  const atmIndex = strikes.reduce((best, value, index) => Math.abs(value - spot) < Math.abs(strikes[best] - spot) ? index : best, 0);
  const at = (offset) => strikes[Math.max(0, Math.min(strikes.length - 1, atmIndex + offset))];
  const leg = (type, side, offset) => { const option = optionFor(type, at(offset)); return { type, side, strike: option.strike, premium: side === 'long' ? option.ask : option.bid }; };
  const recipes = {
    'long-call': [leg('call', 'long', 0)],
    'long-put': [leg('put', 'long', 0)],
    csp: [leg('put', 'short', -1)],
    'bull-call': [leg('call', 'long', 0), leg('call', 'short', 2)],
    'bear-put': [leg('put', 'long', 0), leg('put', 'short', -2)],
    'iron-condor': [leg('put', 'long', -3), leg('put', 'short', -1), leg('call', 'short', 1), leg('call', 'long', 3)],
  };
  setDraft(recipes[id]);
}
function renderChain() {
  const chain = currentChain();
  const calls = new Map(chain.calls.filter((option) => option.expiryDays === selectedExpiry).map((option) => [option.strike, option]));
  const puts = new Map(chain.puts.filter((option) => option.expiryDays === selectedExpiry).map((option) => [option.strike, option]));
  dom.chain.innerHTML = chain.strikes.map((strike) => {
    const call = calls.get(strike), put = puts.get(strike), atm = strike === chain.strikes.reduce((closest, item) => Math.abs(item - spot) < Math.abs(closest - spot) ? item : closest);
    return `<div class="chain-row ${atm ? 'atm' : ''}">
      <div class="option-side"><span class="quote">${call.bid.toFixed(2)} / ${call.ask.toFixed(2)}</span><button data-leg="call-long" data-strike="${strike}">Koupit</button><button class="sell" data-leg="call-short" data-strike="${strike}">Prodat</button></div>
      <div class="strike">${strike}</div>
      <div class="option-side"><button data-leg="put-long" data-strike="${strike}">Koupit</button><button class="sell" data-leg="put-short" data-strike="${strike}">Prodat</button><span class="quote">${put.bid.toFixed(2)} / ${put.ask.toFixed(2)}</span></div>
    </div>`;
  }).join('');
}
function renderDraft() {
  if (!draft.length) { dom.legs.className = 'legs empty'; dom.legs.textContent = 'Vyber nohu z chainu nebo použij předvolbu.'; dom.strategyCard.className = 'strategy-card empty-card'; dom.strategyCard.textContent = 'Sestav strategii — hned vysvětlím, co dělá.'; dom.openTrade.disabled = true; return; }
  dom.legs.className = 'legs';
  dom.legs.innerHTML = draft.map((leg, index) => `<div class="leg"><span><b>${leg.side === 'long' ? 'KUPUJI' : 'PRODÁVÁM'}</b> ${leg.type.toUpperCase()} ${leg.strike} · ${leg.quantity} kontrakt (${leg.quantity * 100} akcií)</span><span>${leg.premium.toFixed(2)} <button data-remove="${index}" aria-label="Odebrat">×</button></span></div>`).join('');
  const summary = summarizeStrategy(draft, spot);
  dom.strategyCard.className = 'strategy-card';
  dom.strategyCard.innerHTML = `<h3>${summary.name}</h3><p>${summary.description}</p><div class="metrics"><div class="metric"><span>Max. zisk</span><strong>${money(summary.maxProfit)}</strong></div><div class="metric"><span>Max. riziko</span><strong>${money(summary.maxLoss)}</strong></div><div class="metric"><span>Break-even</span><strong>${summary.breakEven.toFixed(2)}</strong></div></div><div class="scenarios"><div class="scenario"><b>↑ Trh roste:</b> ${summary.upScenario}</div><div class="scenario"><b>↓ Trh klesá:</b> ${summary.downScenario}</div></div>`;
  dom.openTrade.disabled = false;
}
function renderPortfolio() {
  dom.equity.textContent = money(gameEquity(game));
  dom.cash.textContent = `Volná hotovost: ${money(game.cash)}`;
  dom.reserved.textContent = `Zajištěno: ${money(game.reservedCash)}`;
  if (!game.positions.length) { dom.positions.className = 'empty'; dom.positions.textContent = 'Zatím žádná pozice.'; return; }
  dom.positions.className = '';
  dom.positions.innerHTML = game.positions.map((position) => {
    const summary = summarizeStrategy(position.legs, spot);
    const pnl = position.openingCashFlow + position.mark;
    return `<article class="position"><div class="position-top"><span>${summary.name}</span><span class="${pnl >= 0 ? 'pnl-up' : 'pnl-down'}">${pnl >= 0 ? '+' : ''}${money(pnl)}</span></div><small>Aktuální hodnota: ${money(position.mark)} · otevřeno den ${position.openedDay}</small><button class="close" data-close="${position.id}">Uzavřít pozici</button></article>`;
  }).join('');
}
function renderHeader() { dom.spot.textContent = spot.toFixed(2); dom.tickerName.textContent = `${ticker} · ${assets[ticker].name}`; dom.day.textContent = `Den ${game.day}`; }
function render() { renderHeader(); renderChain(); renderDraft(); renderPortfolio(); }

function moveMarket(direction) {
  const seed = (game.day * 17 + ticker.charCodeAt(0)) % 7;
  const naturalMove = [-0.018, 0.007, -0.006, 0.012, -0.009, 0.004, 0.01][seed];
  spot = Number((spot * (1 + naturalMove + direction * 0.035)).toFixed(2));
  advanceDay(game, { ticker, spot });
  render();
}

dom.chain.addEventListener('click', (event) => {
  const button = event.target.closest('[data-leg]'); if (!button) return;
  const [type, side] = button.dataset.leg.split('-');
  addLeg(optionFor(type, Number(button.dataset.strike)), side);
});
dom.legs.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button) { draft.splice(Number(button.dataset.remove), 1); render(); } });
dom.presets.addEventListener('click', (event) => { const button = event.target.closest('[data-preset]'); if (button) makePreset(button.dataset.preset); });
byId('clear').addEventListener('click', () => { draft = []; dom.tradeMessage.textContent = ''; render(); });
byId('next').addEventListener('click', () => moveMarket(0));
byId('up').addEventListener('click', () => moveMarket(1));
byId('down').addEventListener('click', () => moveMarket(-1));
dom.expiry.addEventListener('change', () => { selectedExpiry = Number(dom.expiry.value); draft = []; render(); });
dom.ticker.addEventListener('change', () => { ticker = dom.ticker.value; spot = assets[ticker].spot; draft = []; render(); });
dom.openTrade.addEventListener('click', () => { const result = openTrade(game, draft, spot); dom.tradeMessage.textContent = result.ok ? `Pozice #${result.position.id} otevřena pouze v simulaci.` : result.error; if (result.ok) draft = []; render(); });
dom.positions.addEventListener('click', (event) => { const button = event.target.closest('[data-close]'); if (!button) return; const result = closePosition(game, Number(button.dataset.close), spot); dom.tradeMessage.textContent = result.ok ? `Pozice uzavřena. Realizované P/L: ${money(result.pnl)}.` : result.error; render(); });

render();
