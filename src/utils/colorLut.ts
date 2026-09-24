/**
 * PULSE LAB - 100階色彩查找表 (Color Lookup Table / LUT)
 * 預先烘焙 100 階動能漸層色，避免 800+ 顆粒子在 60fps 逐幀進行十六進制解析與線性插值運算。
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export class ColorLUT {
  private lut: string[] = new Array(101);
  private rgbLut: RGB[] = new Array(101);

  constructor(baseHex: string, midHex: string, peakHex: string) {
    this.rebuild(baseHex, midHex, peakHex);
  }

  public rebuild(baseHex: string, midHex: string, peakHex: string) {
    const base = hexToRgb(baseHex);
    const mid = hexToRgb(midHex);
    const peak = hexToRgb(peakHex);

    for (let i = 0; i <= 100; i++) {
      let r = 0, g = 0, b = 0;
      if (i < 50) {
        const t = i / 50;
        r = Math.round(base.r + (mid.r - base.r) * t);
        g = Math.round(base.g + (mid.g - base.g) * t);
        b = Math.round(base.b + (mid.b - base.b) * t);
      } else {
        const t = (i - 50) / 50;
        r = Math.round(mid.r + (peak.r - mid.r) * t);
        g = Math.round(mid.g + (peak.g - mid.g) * t);
        b = Math.round(mid.b + (peak.b - mid.b) * t);
      }
      this.rgbLut[i] = { r, g, b };
      this.lut[i] = `rgb(${r}, ${g}, ${b})`;
    }
  }

  /**
   * 取得指定動能與透明度的 RGBA 字串
   * @param energyPercent 0 ~ 100
   * @param alpha 0.0 ~ 1.0
   */
  public getColor(energyPercent: number, alpha: number = 1.0): string {
    const idx = Math.max(0, Math.min(100, Math.round(energyPercent)));
    const rgb = this.rgbLut[idx];
    if (alpha >= 0.99) {
      return this.lut[idx];
    }
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(2)})`;
  }
}
