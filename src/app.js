import { advanceDay, closePosition, createGame, gameEquity, generateChain, openTrade, payoffProfile, summarizeStrategy } from './engine.js';

const assets = {
  LUMA: { name: 'Luma Robotics', spot: 100, volatility: 0.31 },
  VELI: { name: 'Veli Energy', spot: 74, volatility: 0.42 },
  NORA: { name: 'Nora Biotech', spot: 132, volatility: 0.52 },
};
const fmt = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const money = (value) => typeof value === 'string' ? value : fmt.format(value);
const byId = (id) => document.getElementById(id);
const dom = {
  ticker: byId('ticker'), spot: byId('spot'), tickerName: byId('ticker-name'), day: byId('day'),
  expiry: byId('expiry'), rowCount: byId('row-count'), chain: byId('chain'), legs: byId('legs'), strategyCard: byId('strategy-card'),
  openTrade: byId('open-trade'), tradeMessage: byId('trade-message'), positions: byId('positions'),
  equity: byId('equity'), cash: byId('cash'), shares: byId('shares'), reserved: byId('reserved'), stockChart: byId('stock-chart'), presets: byId('presets'),
};

let game = createGame();
let ticker = 'LUMA';
let spot = assets[ticker].spot;
let selectedExpiry = 30;
let selectedRows = 9;
let draft = [];
let autoTimer = null;
let priceHistory = [{ day: 0, spot }];

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
function selectionClass(type, side, strike) { return draft.some((leg) => leg.type === type && leg.side === side && leg.strike === strike) ? ` selected-${side}` : ''; }
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
function moneyness(type, strike, atmStrike) {
  if (strike === atmStrike) return 'atm';
  return type === 'call' ? (strike < spot ? 'itm' : 'otm') : (strike > spot ? 'itm' : 'otm');
}
function renderChain() {
  const chain = currentChain();
  const calls = new Map(chain.calls.filter((option) => option.expiryDays === selectedExpiry).map((option) => [option.strike, option]));
  const puts = new Map(chain.puts.filter((option) => option.expiryDays === selectedExpiry).map((option) => [option.strike, option]));
  const centerIndex = chain.strikes.reduce((best, value, index) => Math.abs(value - spot) < Math.abs(chain.strikes[best] - spot) ? index : best, 0);
  const start = Math.max(0, Math.min(chain.strikes.length - selectedRows, centerIndex - Math.floor(selectedRows / 2)));
  const visibleStrikes = chain.strikes.slice(start, start + selectedRows);
  dom.chain.innerHTML = visibleStrikes.map((strike) => {
    const call = calls.get(strike), put = puts.get(strike), atm = strike === chain.strikes[centerIndex];
    const callStatus = moneyness('call', strike, chain.strikes[centerIndex]);
    const putStatus = moneyness('put', strike, chain.strikes[centerIndex]);
    return `<div class="chain-row ${atm ? 'atm' : ''}">
      <div class="bid ${callStatus}"><button class="${selectionClass('call', 'short', strike)}" data-leg="call-short" data-strike="${strike}" title="Prodat Call za Bid">${call.bid.toFixed(2)}</button></div><div class="ask ${callStatus}"><button class="${selectionClass('call', 'long', strike)}" data-leg="call-long" data-strike="${strike}" title="Koupit Call za Ask">${call.ask.toFixed(2)}</button></div>
      <div class="strike">${strike}</div>
      <div class="bid ${putStatus}"><button class="${selectionClass('put', 'short', strike)}" data-leg="put-short" data-strike="${strike}" title="Prodat Put za Bid">${put.bid.toFixed(2)}</button></div><div class="ask ${putStatus}"><button class="${selectionClass('put', 'long', strike)}" data-leg="put-long" data-strike="${strike}" title="Koupit Put za Ask">${put.ask.toFixed(2)}</button></div>
    </div>`;
  }).join('');
}
function renderPayoffChart(legs, referenceSpot) {
  const points = payoffProfile(legs, referenceSpot);
  const width = 360, height = 130, pad = 20;
  const values = points.map((point) => point.pnl);
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const range = Math.max(max - min, 1);
  const x = (index) => pad + (index * (width - pad * 2)) / (points.length - 1);
  const y = (value) => height - pad - ((value - min) * (height - pad * 2)) / range;
  const zeroY = y(0);
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.pnl).toFixed(1)}`).join(' ');
  const spotIndex = points.reduce((best, point, index) => Math.abs(point.spot - referenceSpot) < Math.abs(points[best].spot - referenceSpot) ? index : best, 0);
  return `<figure class="payoff-chart"><figcaption>Payoff při expiraci · P/L podle ceny podkladu</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Graf payoff strategie"><line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" class="zero-line"/><line x1="${x(spotIndex)}" y1="${pad}" x2="${x(spotIndex)}" y2="${height - pad}" class="spot-line"/><polyline points="${line}" class="payoff-line"/><text x="${pad}" y="${height - 4}">0</text><text x="${width - pad - 26}" y="${height - 4}">${points.at(-1).spot}</text></svg></figure>`;
}
function renderDraft() {
  if (!draft.length) { dom.legs.className = 'legs empty'; dom.legs.textContent = 'Vyber nohu z chainu nebo použij předvolbu.'; dom.strategyCard.className = 'strategy-card empty-card'; dom.strategyCard.textContent = 'Sestav strategii — hned vysvětlím, co dělá.'; dom.openTrade.disabled = true; return; }
  dom.legs.className = 'legs';
  dom.legs.innerHTML = draft.map((leg, index) => `<div class="leg"><span><b>${leg.side === 'long' ? 'KUPUJI' : 'PRODÁVÁM'}</b> ${leg.type.toUpperCase()} ${leg.strike} · ${leg.quantity} kontrakt (${leg.quantity * 100} akcií)<small>Expirace: den ${game.day + leg.expiryDays}</small></span><span>${leg.premium.toFixed(2)} <button data-remove="${index}" aria-label="Odebrat">×</button></span></div>`).join('');
  const summary = summarizeStrategy(draft, spot);
  dom.strategyCard.className = 'strategy-card';
  dom.strategyCard.innerHTML = `<h3>${summary.name}</h3><p>${summary.description}</p><div class="metrics"><div class="metric"><span>Max. zisk</span><strong>${money(summary.maxProfit)}</strong></div><div class="metric"><span>Max. riziko</span><strong>${money(summary.maxLoss)}</strong></div><div class="metric"><span>Break-even</span><strong>${summary.breakEven.toFixed(2)}</strong></div></div><div class="scenarios"><div class="scenario"><b>↑ Trh roste:</b> ${summary.upScenario}</div><div class="scenario"><b>↓ Trh klesá:</b> ${summary.downScenario}</div></div>${renderPayoffChart(draft, spot)}`;
  dom.openTrade.disabled = false;
}
function renderPortfolio() {
  dom.equity.textContent = money(gameEquity(game));
  dom.cash.textContent = `Volná hotovost: ${money(game.cash)}`;
  dom.shares.textContent = `Akcie: ${game.shares} ks`;
  dom.reserved.textContent = `Zajištěno: ${money(game.reservedCash)}`;
  const settlementLog = game.settlements.length ? `<div class="settlement-log"><b>Vypořádání expirací</b>${game.settlements.slice(-5).reverse().flatMap((record) => record.events.map((event) => `<small>Den ${record.settledDay}: ${event.action}</small>`)).join('')}</div>` : '';
  if (!game.positions.length) { dom.positions.className = 'empty'; dom.positions.innerHTML = `Zatím žádná otevřená opční pozice.${settlementLog}`; return; }
  dom.positions.className = '';
  dom.positions.innerHTML = game.positions.map((position) => {
    const summary = summarizeStrategy(position.legs, spot);
    const pnl = position.openingCashFlow + position.mark;
    const legDetails = position.legs.map((leg) => `${leg.side === 'long' ? 'Koupená' : 'Prodaná'} ${leg.type.toUpperCase()} ${leg.strike} × ${leg.quantity} @ ${leg.premium.toFixed(2)}`).join('<br>');
    return `<article class="position"><div class="position-top"><span>${summary.name}</span><span class="${pnl >= 0 ? 'pnl-up' : 'pnl-down'}">${pnl >= 0 ? '+' : ''}${money(pnl)}</span></div><small>Aktuální hodnota: ${money(position.mark)} · otevřeno den ${position.openedDay} · expirace: den ${position.openedDay + Math.min(...position.legs.map((leg) => leg.expiryDays))}</small><div class="position-detail"><div><b>Provedení:</b><br>${legDetails}</div><div class="position-metrics"><span>Čisté prémium <b>${money(position.openingCashFlow)}</b></span><span>Max. zisk <b>${money(summary.maxProfit)}</b></span><span>Max. ztráta <b>${money(summary.maxLoss)}</b></span></div>${renderPayoffChart(position.legs, position.openedSpot)}</div><button class="close" data-close="${position.id}">Uzavřít pozici</button></article>`;
  }).join('') + settlementLog;
}
function renderStockChart() {
  const history = priceHistory.slice(-30);
  const width = 360, height = 105, pad = 18;
  const values = history.map((point) => point.spot);
  const min = Math.min(...values) * 0.98, max = Math.max(...values) * 1.02;
  const range = Math.max(max - min, 1);
  const x = (index) => pad + (index * (width - pad * 2)) / Math.max(history.length - 1, 1);
  const y = (value) => height - pad - ((value - min) * (height - pad * 2)) / range;
  const line = history.map((point, index) => `${x(index).toFixed(1)},${y(point.spot).toFixed(1)}`).join(' ');
  dom.stockChart.innerHTML = `<div><b>Cena akcie ${ticker}</b><small>Simulovaná historie · den ${history[0].day}–${history.at(-1).day}</small></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Vývoj ceny akcie ${ticker}"><polyline points="${line}"/><circle cx="${x(history.length - 1)}" cy="${y(history.at(-1).spot)}" r="3"/><text x="${pad}" y="${height - 3}">${min.toFixed(1)}</text><text x="${width - pad - 32}" y="${height - 3}">${max.toFixed(1)}</text></svg>`;
}
function renderHeader() { dom.spot.textContent = spot.toFixed(2); dom.tickerName.textContent = `${ticker} · ${assets[ticker].name}`; dom.day.textContent = `Den ${game.day}`; }
function render() { renderHeader(); renderStockChart(); renderChain(); renderDraft(); renderPortfolio(); }

function moveMarket(direction) {
  const seed = (game.day * 17 + ticker.charCodeAt(0)) % 7;
  const naturalMove = [-0.018, 0.007, -0.006, 0.012, -0.009, 0.004, 0.01][seed];
  spot = Number((spot * (1 + naturalMove + direction * 0.035)).toFixed(2));
  const result = advanceDay(game, { ticker, spot });
  priceHistory.push({ day: game.day, spot });
  if (result.settlements.length) dom.tradeMessage.textContent = `Den ${game.day} — vypořádání expirace: ${result.settlements.map((event) => event.action).join(' · ')}`;
  render();
}
function toggleAutoTime() {
  const button = byId('auto-time');
  if (autoTimer) {
    clearInterval(autoTimer); autoTimer = null;
    button.textContent = '▶ Automat: vypnutý'; button.setAttribute?.('aria-pressed', 'false');
  } else {
    autoTimer = setInterval(() => moveMarket(0), 5000);
    button.textContent = '■ Automat: běží · 1 den / 5 s'; button.setAttribute?.('aria-pressed', 'true');
  }
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
byId('auto-time').addEventListener('click', toggleAutoTime);
dom.expiry.addEventListener('change', () => { selectedExpiry = Number(dom.expiry.value); draft = []; render(); });
dom.rowCount.addEventListener('change', () => { selectedRows = Number(dom.rowCount.value); render(); });
dom.ticker.addEventListener('change', () => { ticker = dom.ticker.value; spot = assets[ticker].spot; priceHistory = [{ day: game.day, spot }]; draft = []; render(); });
dom.openTrade.addEventListener('click', () => { const result = openTrade(game, draft, spot); dom.tradeMessage.textContent = result.ok ? `Pozice #${result.position.id} otevřena pouze v simulaci.` : result.error; if (result.ok) draft = []; render(); });
dom.positions.addEventListener('click', (event) => { const button = event.target.closest('[data-close]'); if (!button) return; const result = closePosition(game, Number(button.dataset.close), spot); dom.tradeMessage.textContent = result.ok ? `Pozice uzavřena. Realizované P/L: ${money(result.pnl)}.` : result.error; render(); });

render();
