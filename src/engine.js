export const CONTRACT_MULTIPLIER = 100;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value, digits = 2) => Number(value.toFixed(digits));

export function quoteOption({ type, strike, spot, expiryDays, volatility = 0.32 }) {
  const timeFactor = Math.sqrt(Math.max(expiryDays, 1) / 365);
  const intrinsic = type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const distance = Math.abs(strike - spot) / Math.max(spot, 1);
  const extrinsic = Math.max(0.08, spot * volatility * timeFactor * 0.34 * Math.exp(-distance * 5));
  const mid = round(intrinsic + extrinsic);
  const spread = Math.max(0.05, mid * 0.04);
  return { mid, bid: round(Math.max(0.01, mid - spread / 2)), ask: round(mid + spread / 2) };
}

export function generateChain({ ticker, spot, day = 0, volatility = 0.32 }) {
  const offsets = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
  const expiryDays = [14, 30, 60];
  const strikes = offsets.map((offset) => Math.max(5, Math.round((spot + offset) / 5) * 5));
  const option = (type, strike, days) => ({
    id: `${ticker}-${type}-${strike}-${days}-${day}`,
    ticker, type, strike, expiryDays: days, multiplier: CONTRACT_MULTIPLIER,
    ...quoteOption({ type, strike, spot, expiryDays: days, volatility }),
  });
  return {
    ticker, spot, day, volatility, strikes, expiryDays,
    calls: strikes.flatMap((strike) => expiryDays.map((days) => option('call', strike, days))),
    puts: strikes.flatMap((strike) => expiryDays.map((days) => option('put', strike, days))),
  };
}

export function createGame({ budget = 100000 } = {}) {
  const game = {
    cash: budget,
    startingCash: budget,
    reservedCash: 0,
    day: 0,
    nextPositionId: 1,
    positions: [],
    closedPositions: [],
  };
  game.openTrade = (legs, spot) => openTrade(game, legs, spot);
  return game;
}

function normalizedLeg(leg) {
  return {
    type: leg.type,
    side: leg.side,
    strike: Number(leg.strike),
    premium: Number(leg.premium),
    quantity: Number(leg.quantity ?? 1),
    expiryDays: Number(leg.expiryDays ?? 30),
  };
}

function cashFlowForLeg(leg) {
  const sign = leg.side === 'short' ? 1 : -1;
  return sign * leg.premium * leg.quantity * CONTRACT_MULTIPLIER;
}

function reservedForLeg(leg) {
  return leg.type === 'put' && leg.side === 'short'
    ? leg.strike * leg.quantity * CONTRACT_MULTIPLIER
    : 0;
}

export function openTrade(game, rawLegs, spot) {
  const legs = rawLegs.map(normalizedLeg);
  if (!legs.length) return { ok: false, error: 'Vyber alespoň jednu opční nohu.' };
  if (legs.some((leg) => !['call', 'put'].includes(leg.type) || !['long', 'short'].includes(leg.side) || leg.quantity < 1 || leg.premium <= 0)) {
    return { ok: false, error: 'Neplatné parametry opčního obchodu.' };
  }
  const cashFlow = legs.reduce((sum, leg) => sum + cashFlowForLeg(leg), 0);
  const reserve = legs.reduce((sum, leg) => sum + reservedForLeg(leg), 0);
  const debit = Math.max(0, -cashFlow);
  if (game.cash < debit + reserve) return { ok: false, error: 'Nedostatek volné hotovosti pro prémium a zajištění.' };
  game.cash = round(game.cash + cashFlow);
  game.reservedCash = round(game.reservedCash + reserve);
  const position = {
    id: game.nextPositionId++, legs, openedSpot: spot, openedDay: game.day,
    openingCashFlow: cashFlow, reserve, mark: round(-cashFlow),
  };
  game.positions.push(position);
  return { ok: true, position };
}

function payoffAtExpiry(legs, spot) {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call' ? Math.max(spot - leg.strike, 0) : Math.max(leg.strike - spot, 0);
    const sign = leg.side === 'long' ? 1 : -1;
    return total + sign * (intrinsic - leg.premium) * leg.quantity * CONTRACT_MULTIPLIER;
  }, 0);
}

function strategyName(legs, spot) {
  if (legs.length === 1) {
    const leg = legs[0];
    if (leg.type === 'call' && leg.side === 'long') return 'Long Call';
    if (leg.type === 'put' && leg.side === 'long') return 'Long Put';
    if (leg.type === 'put' && leg.side === 'short') return 'Cash-Secured Put';
    if (leg.type === 'call' && leg.side === 'short') return 'Short Call (neomezené riziko)';
  }
  const calls = legs.filter((leg) => leg.type === 'call');
  const puts = legs.filter((leg) => leg.type === 'put');
  if (calls.length === 2 && puts.length === 0 && calls.some((l) => l.side === 'long') && calls.some((l) => l.side === 'short')) return 'Bull Call Spread';
  if (puts.length === 2 && calls.length === 0 && puts.some((l) => l.side === 'long') && puts.some((l) => l.side === 'short')) return 'Bear Put Spread';
  if (calls.length === 2 && puts.length === 2 && calls.filter((l) => l.side === 'short').length === 2) return 'Iron Condor';
  return `Vlastní strategie (${legs.length} nohy)`;
}

export function summarizeStrategy(rawLegs, spot) {
  const legs = rawLegs.map(normalizedLeg);
  const strikes = [...new Set(legs.map((leg) => leg.strike))].sort((a, b) => a - b);
  const probes = [0, ...strikes, Math.max(spot * 3, ...strikes.map((strike) => strike * 2), 1000)];
  const values = probes.map((price) => payoffAtExpiry(legs, price));
  const terminalSlope = legs.reduce((sum, leg) => sum + (leg.type === 'call' ? (leg.side === 'long' ? 1 : -1) * leg.quantity : 0), 0);
  const maxLoss = round(Math.max(0, -Math.min(...values)));
  const maxProfit = terminalSlope > 0 ? 'Neomezený' : round(Math.max(...values));
  const name = strategyName(legs, spot);
  const netPremium = round(legs.reduce((sum, leg) => sum + cashFlowForLeg(leg), 0));
  const shortPut = legs.length === 1 && legs[0].type === 'put' && legs[0].side === 'short';
  const descriptionMap = {
    'Long Call': 'Kupuješ právo koupit 100 akcií za strike. Platíš prémium a sázíš na růst.',
    'Long Put': 'Kupuješ právo prodat 100 akcií za strike. Platíš prémium a sázíš na pokles.',
    'Cash-Secured Put': 'Prodáváš právo prodat ti 100 akcií za strike a držíš hotovost pro případ přiřazení.',
    'Bull Call Spread': 'Kupuješ call s nižším strikem a prodáváš call s vyšším. Růst ano, ale zisk je omezený.',
    'Bear Put Spread': 'Kupuješ put s vyšším strikem a prodáváš put s nižším. Pokles ano, ale zisk je omezený.',
    'Iron Condor': 'Kombinace dvou kreditních spreadů. Profituje z pohybu ceny v předem zvoleném pásmu.',
  };
  const bullish = name === 'Long Call' || name === 'Bull Call Spread';
  const bearish = name === 'Long Put' || name === 'Bear Put Spread';
  const neutral = name === 'Iron Condor' || shortPut;
  return {
    name, netPremium, maxLoss: shortPut ? round((legs[0].strike - legs[0].premium) * CONTRACT_MULTIPLIER * legs[0].quantity) : maxLoss,
    maxProfit, breakEven: round(legs.length === 1 && legs[0].type === 'call' && legs[0].side === 'long' ? legs[0].strike + legs[0].premium : legs.length === 1 && legs[0].type === 'put' && legs[0].side === 'long' ? legs[0].strike - legs[0].premium : spot),
    description: descriptionMap[name] ?? 'Sleduj součet všech nohou: každá opce představuje právo nebo povinnost nad 100 akciemi.',
    upScenario: bullish ? 'Při růstu podkladu strategie profituje; zisk a hranice závisí na strikech.' : bearish ? 'Při růstu podkladu strategie ztrácí hodnotu.' : neutral ? 'Při mírném růstu může profitovat, pokud cena zůstane v bezpečném pásmu.' : 'Při růstu se výsledek řídí součtem všech vybraných nohou.',
    downScenario: bearish ? 'Při poklesu podkladu strategie profituje; zisk a hranice závisí na strikech.' : bullish ? 'Při poklesu strategie ztrácí hodnotu; maximálně ztratíš zaplacené prémium.' : neutral ? 'Při prudkém poklesu hrozí ztráta nebo přiřazení akcií.' : 'Při poklesu se výsledek řídí součtem všech vybraných nohou.',
  };
}

function markPosition(position, spot, gameDay) {
  return round(position.legs.reduce((total, leg) => {
    const remaining = Math.max(0, leg.expiryDays - (gameDay - position.openedDay));
    const quote = quoteOption({ type: leg.type, strike: leg.strike, spot, expiryDays: remaining });
    const sign = leg.side === 'long' ? 1 : -1;
    return total + sign * quote.mid * leg.quantity * CONTRACT_MULTIPLIER;
  }, 0));
}

export function advanceDay(game, { ticker = 'LUMA', spot }) {
  game.day += 1;
  game.positions.forEach((position) => { position.mark = markPosition(position, spot, game.day); });
  return generateChain({ ticker, spot, day: game.day });
}

export function closePosition(game, id, spot) {
  const index = game.positions.findIndex((position) => position.id === id);
  if (index === -1) return { ok: false, error: 'Pozice nebyla nalezena.' };
  const position = game.positions[index];
  const closeValue = markPosition(position, spot, game.day);
  game.cash = round(game.cash + closeValue);
  game.reservedCash = round(game.reservedCash - position.reserve);
  game.positions.splice(index, 1);
  game.closedPositions.push({ ...position, closedDay: game.day, closedValue: closeValue, pnl: round(position.openingCashFlow + closeValue) });
  return { ok: true, pnl: round(position.openingCashFlow + closeValue) };
}

export function gameEquity(game) {
  return round(game.cash + game.reservedCash + game.positions.reduce((sum, p) => sum + p.mark, 0));
}
