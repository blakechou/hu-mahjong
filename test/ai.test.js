import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Round } from '../src/core/round.js';
import { createRng } from '../src/core/rng.js';
import { decideTurn, decideClaim } from '../src/ai/ai.js';
import { PERSONAS } from '../src/ai/personas.js';

const LINEUP = [PERSONAS.lin, PERSONAS.abo, PERSONAS.azhu, PERSONAS.lin];

export function playAI(seed, lineup = LINEUP) {
  const r = new Round({ seed, dealer: seed % 4 });
  const rng = createRng(seed);
  r.start();
  let guard = 0;
  while (r.phase !== 'end') {
    if (++guard > 3000) throw new Error('stuck');
    if (r.phase === 'turn') r.act(r.turn, decideTurn(r, r.turn, lineup[r.turn]));
    else {
      const q = Object.keys(r.claims.options).map(Number).find(s => r.legalActions(s).length);
      r.act(q, decideClaim(r, q, lineup[q], rng.next));
    }
  }
  return r;
}

test('四個 AI 對打：大多數局都有人胡，而且跑得夠快', () => {
  const N = 60;
  const t0 = performance.now();
  let wins = 0;
  const winsBy = [0, 0, 0, 0];
  for (let s = 1; s <= N; s++) {
    const r = playAI(s);
    if (r.result.type === 'win') { wins++; winsBy[r.result.winner]++; }
  }
  const ms = (performance.now() - t0) / N;
  console.log(`胡牌率 ${(wins / N * 100).toFixed(0)}%，各家胡 ${winsBy}，每局 ${ms.toFixed(1)}ms`);
  assert.ok(wins / N > 0.55);
  assert.ok(ms < 200);
});
