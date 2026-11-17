// 一將（東南西北四圈）的進行：輪莊、連莊、換圈、累計分數
import { Round } from './round.js';
import { randomSeed } from './rng.js';

export class Match {
  constructor({ firstDealer = 0, seedFn = randomSeed } = {}) {
    this.firstDealer = firstDealer;
    this.dealer = firstDealer;
    this.roundWind = 0; // 0 東風圈 … 3 北風圈
    this.streak = 0;    // 連莊次數
    this.scores = [0, 0, 0, 0];
    this.over = false;
    this.history = [];
    this.seedFn = seedFn;
    this.round = null;
  }

  /** 東風東、東風南…北風北 */
  get label() {
    const W = '東南西北';
    return `${W[this.roundWind]}風${W[(this.dealer - this.firstDealer + 4) % 4]}`;
  }

  newRound() {
    if (this.over) throw new Error('這將已經結束');
    this.round = new Round({ seed: this.seedFn(), dealer: this.dealer, roundWind: this.roundWind, streak: this.streak });
    return this.round;
  }

  /** 一局結束後呼叫：加總分數並決定下一局莊家 */
  finishRound() {
    const res = this.round.result;
    if (!res) throw new Error('這局還沒結束');
    res.delta.forEach((d, i) => { this.scores[i] += d; });
    this.history.push({ label: this.label, dealer: this.dealer, streak: this.streak, result: res });
    // 莊家胡牌或流局 → 連莊；其他人胡 → 下莊
    if (res.type === 'draw' || res.winner === this.dealer) {
      this.streak++;
      return { keep: true, over: false };
    }
    this.streak = 0;
    this.dealer = (this.dealer + 1) % 4;
    if (this.dealer === this.firstDealer) {
      this.roundWind++;
      if (this.roundWind === 4) { this.over = true; return { keep: false, over: true }; }
    }
    return { keep: false, over: false };
  }
}
