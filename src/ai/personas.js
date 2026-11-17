// 三位街坊的牌風參數（同一套 AI，參數不同）
//   bigHand  做大牌傾向：越高越願意為了清一色／混一色／碰碰胡放慢速度
//   call     吃碰積極度：越高越常吃碰
//   defense  防守：有人可能聽牌時，越高越會改打安全牌
//   think    出牌思考時間（毫秒）
export const PERSONAS = {
  abo: {
    id: 'abo', name: '柑仔店阿伯', short: '阿伯',
    bigHand: 0.8, call: 0.25, defense: 0.55, think: 1100,
  },
  azhu: {
    id: 'azhu', name: '檳榔攤阿珠姨', short: '阿珠姨',
    bigHand: 0.15, call: 0.95, defense: 0.2, think: 450,
  },
  lin: {
    id: 'lin', name: '退休林老師', short: '林老師',
    bigHand: 0.4, call: 0.5, defense: 0.95, think: 800,
  },
};

// 座位 1 下家、2 對家、3 上家
export const SEAT_PERSONAS = [null, PERSONAS.abo, PERSONAS.azhu, PERSONAS.lin];
