/**
 * PULSE LAB - 數學計算與輔助函式
 */

/**
 * 線性插值 (LERP)
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * 二維歐幾里得距離
 */
export function euclideanDist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 依據累積動能量計算成就評級 (Rank)
 */
export function calculateRank(score: number): { rank: string; title: string; badgeColor: string } {
  if (score >= 8000) {
    return { rank: 'SSS', title: 'KINETIC BEAST', badgeColor: '#FFE600' };
  } else if (score >= 6000) {
    return { rank: 'SS', title: 'ION SURGE', badgeColor: '#FF007A' };
  } else if (score >= 4000) {
    return { rank: 'S', title: 'VOLTAGE OVERDRIVE', badgeColor: '#00F0FF' };
  } else if (score >= 2000) {
    return { rank: 'A', title: 'PULSE GENERATOR', badgeColor: '#7000FF' };
  } else {
    return { rank: 'B', title: 'STATIC CHARGE', badgeColor: '#888888' };
  }
}

/**
 * 生成 5 碼隨機防偽序號
 */
export function generateVerificationCode(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `PL-${num}`;
}

/**
 * 數值夾止 (Clamp)
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
