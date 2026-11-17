// P2P 連線（PeerJS / WebRTC）
// 房主用房號當 Peer ID 開房，其他人用房號連進來。牌局資料直接在玩家之間傳（WebRTC 有加密），
// PeerJS 的公用伺服器只負責幫兩邊「牽線」，不經手牌局內容。
import { Peer } from 'peerjs';

const PREFIX = 'hu-mahjong-v1-';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const TIMEOUT = 12000;

export function randomCode(n = 5) {
  let s = '';
  for (const x of crypto.getRandomValues(new Uint8Array(n))) s += ALPHA[x % ALPHA.length];
  return s;
}

export const cleanCode = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

/** 開房間：回傳 { peer, code } */
export async function openRoom() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const peer = await withTimeout(new Promise((resolve, reject) => {
        const p = new Peer(PREFIX + code);
        p.on('open', () => resolve(p));
        p.on('error', e => { p.destroy(); reject(e); });
      }), TIMEOUT, '連不上配對伺服器，請檢查網路');
      return { peer, code };
    } catch (e) {
      if (e.type !== 'unavailable-id') throw e;
    }
  }
  throw new Error('開房失敗，請再試一次');
}

/** 加入房間：回傳 { peer, conn } */
export async function joinRoom(code) {
  const peer = await withTimeout(new Promise((resolve, reject) => {
    const p = new Peer();
    p.on('open', () => resolve(p));
    p.on('error', e => { p.destroy(); reject(e); });
  }), TIMEOUT, '連不上配對伺服器，請檢查網路');
  const conn = await withTimeout(new Promise((resolve, reject) => {
    const c = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'json' });
    c.on('open', () => resolve(c));
    c.on('error', reject);
    peer.on('error', e => reject(e.type === 'peer-unavailable' ? new Error('找不到這個房間，房號對嗎？') : e));
  }), TIMEOUT, '連不上房主，房號對嗎？').catch(e => { peer.destroy(); throw e; });
  return { peer, conn };
}
