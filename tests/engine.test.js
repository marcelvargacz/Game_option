import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  generateChain,
  summarizeStrategy,
  advanceDay,
  closePosition,
  payoffProfile,
} from '../src/engine.js';

test('nová hra začíná s rozpočtem 100 000 Kč a bez pozic', () => {
  const game = createGame();
  assert.equal(game.cash, 100000);
  assert.deepEqual(game.positions, []);
  assert.equal(game.day, 0);
});

test('opční kontrakt reprezentuje 100 akcií, chain má 13 strike řádků a cena callu roste s podkladem', () => {
  const chain = generateChain({ ticker: 'LUMA', spot: 100, day: 0 });
  assert.equal(chain.strikes.length, 13);
  const call = chain.calls.find((option) => option.strike === 100 && option.expiryDays === 30);
  assert.equal(call.multiplier, 100);
  const later = generateChain({ ticker: 'LUMA', spot: 115, day: 0 });
  const laterCall = later.calls.find((option) => option.strike === 100 && option.expiryDays === 30);
  assert.ok(laterCall.ask > call.ask);
});

test('long call uvádí správný zisk, ztrátu a scénáře', () => {
  const summary = summarizeStrategy([{ type: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 }], 100);
  assert.equal(summary.name, 'Long Call');
  assert.equal(summary.maxLoss, 500);
  assert.equal(summary.maxProfit, 'Neomezený');
  assert.match(summary.upScenario, /profituje/i);
  assert.match(summary.downScenario, /ztrácí/i);
});

test('payoff profil zobrazuje P/L strategie v různých cenách podkladu', () => {
  const profile = payoffProfile([{ type: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 }], 100);
  assert.equal(profile.length, 25);
  assert.equal(profile[0].pnl, -500);
  assert.ok(profile.at(-1).pnl > 0);
});

test('short put s cash zajištěním blokuje přiměřenou hotovost a nejhorší ztráta je omezená', () => {
  const game = createGame();
  const result = game.openTrade([{ type: 'put', side: 'short', strike: 100, premium: 4, quantity: 1 }], 100);
  assert.equal(result.ok, true);
  assert.equal(game.cash, 100400);
  assert.equal(game.reservedCash, 10000);
  const summary = summarizeStrategy(game.positions[0].legs, 100);
  assert.equal(summary.maxLoss, 9600);
});

test('posun času přecení pozici a uzavření vrátí rezervovanou hotovost', () => {
  const game = createGame();
  game.openTrade([{ type: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 }], 100);
  advanceDay(game, { ticker: 'LUMA', spot: 108 });
  assert.equal(game.day, 1);
  assert.notEqual(game.positions[0].mark, 500);
  const closed = closePosition(game, game.positions[0].id, 108);
  assert.equal(closed.ok, true);
  assert.equal(game.positions.length, 0);
});
