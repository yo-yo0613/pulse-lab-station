import type { PosterExportData, ThemeConfig } from '../types/pulse';

/**
 * PULSE LAB - 9:16 高清海報離線合成引擎 (Poster Exporter)
 * 具備：
 * 1. 單例 1080x1920 離屏畫布靜態複用（零顯存洩漏）
 * 2. Canvas object-fit: cover 居中等比例裁切（防相機畫面壓扁）
 * 3. await document.fonts.ready 字體排版保全
 * 4. 非同步 canvas.toBlob() + createObjectURL 背景零拷貝導出
 * 5. 強制純白高對比靜區背板與 Nearest-Neighbor 銳利 QR Code 繪製
 * 6. 100% 離線免網文字能量認證 Payload
 */

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getSharedCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = 1080;
    sharedCanvas.height = 1920;
    const ctx = sharedCanvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      throw new Error('Failed to create 2D context on poster canvas');
    }
    sharedCtx = ctx;
  }
  if (!sharedCtx) {
    throw new Error('Poster canvas context is null');
  }
  sharedCtx.clearRect(0, 0, 1080, 1920);
  return { canvas: sharedCanvas, ctx: sharedCtx };
}

/**
 * object-fit: cover 居中等比例裁切計算
 */
function getCoverCrop(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number
): { sx: number; sy: number; sw: number; sh: number } {
  const sourceRatio = sourceW / sourceH;
  const targetRatio = targetW / targetH;
  let sx = 0,
    sy = 0,
    sw = sourceW,
    sh = sourceH;

  if (sourceRatio > targetRatio) {
    // 來源較寬，裁切兩側
    sw = sourceH * targetRatio;
    sx = (sourceW - sw) / 2;
  } else {
    // 來源較高，裁切上下
    sh = sourceW / targetRatio;
    sy = (sourceH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

/**
 * 合成 9:16 賽博瑞士極簡海報並生成 Blob URL
 */
export async function generatePosterBlobUrl(
  data: PosterExportData,
  theme: ThemeConfig,
  qrCanvasElement: HTMLCanvasElement | null
): Promise<string> {
  // 1. 等待系統字體快取就緒
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const { canvas, ctx } = getSharedCanvas();
  const W = 1080;
  const H = 1920;

  // 2. 深黑背景底色 (#0a0a0a)
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, W, H);

  // 3. 繪製瑞士網格輔助細線 (Swiss Grid Lines)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const step = 60;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 4. 載入並繪製最佳精彩瞬間截圖 (以 cover 比例置入中上方視窗)
  if (data.snapshotBlobUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = data.snapshotBlobUrl;
    });

    if (img.width > 0 && img.height > 0) {
      const targetPhotoX = 60;
      const targetPhotoY = 220;
      const targetPhotoW = 960;
      const targetPhotoH = 1100;

      const { sx, sy, sw, sh } = getCoverCrop(img.width, img.height, targetPhotoW, targetPhotoH);

      // 照片外框遮罩
      ctx.save();
      ctx.beginPath();
      ctx.rect(targetPhotoX, targetPhotoY, targetPhotoW, targetPhotoH);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, targetPhotoX, targetPhotoY, targetPhotoW, targetPhotoH);

      // 照片四周微光暈外框
      ctx.strokeStyle = theme.poster.accentColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(targetPhotoX, targetPhotoY, targetPhotoW, targetPhotoH);
      ctx.restore();

      // 視窗四角準心標記 (Swiss Crosshairs)
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      const chSize = 16;
      // 左上
      ctx.strokeRect(targetPhotoX - 4, targetPhotoY - 4, chSize, 2);
      ctx.strokeRect(targetPhotoX - 4, targetPhotoY - 4, 2, chSize);
      // 右上
      ctx.strokeRect(targetPhotoX + targetPhotoW - chSize + 4, targetPhotoY - 4, chSize, 2);
      ctx.strokeRect(targetPhotoX + targetPhotoW + 2, targetPhotoY - 4, 2, chSize);
    }
  }

  // 5. 頂部品牌標題區域
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 52px ui-monospace, monospace';
  ctx.fillText(theme.branding.mainTitle, 60, 110);

  ctx.fillStyle = theme.poster.accentColor;
  ctx.font = '700 24px ui-monospace, monospace';
  ctx.fillText(`// ${theme.branding.subTitle}`, 60, 155);

  ctx.fillStyle = '#888888';
  ctx.font = '400 18px ui-monospace, monospace';
  ctx.fillText(data.timestamp, W - 320, 110);
  ctx.fillText(`VERIFY: #${data.verificationCode}`, W - 320, 140);

  // 頂部分割線
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 180);
  ctx.lineTo(W - 60, 180);
  ctx.stroke();

  // 6. 下方數據儀表盤區域 (HUD Metrics)
  const statsY = 1380;

  // 動能分數大字 (PULSE SCORE)
  ctx.fillStyle = '#888888';
  ctx.font = '600 20px ui-monospace, monospace';
  ctx.fillText('ACCUMULATED KINETIC SCORE', 60, statsY);

  ctx.fillStyle = theme.particles.peakColor;
  ctx.font = '900 96px ui-monospace, monospace';
  ctx.fillText(data.pulseScore.toLocaleString(), 60, statsY + 90);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 28px ui-monospace, monospace';
  ctx.fillText('PTS', 500, statsY + 85);

  // 評級勳章 (RANK)
  ctx.fillStyle = '#888888';
  ctx.font = '600 18px ui-monospace, monospace';
  ctx.fillText('PERFORMANCE RANK', 60, statsY + 145);

  ctx.fillStyle = '#FF007A';
  ctx.font = '900 48px ui-monospace, monospace';
  ctx.fillText(data.rank, 60, statsY + 195);

  // 次要數據欄
  ctx.fillStyle = '#AAAAAA';
  ctx.font = '500 18px ui-monospace, monospace';
  ctx.fillText(`PEAK VELOCITY: ${Math.round(data.peakKinetic)}%`, 60, statsY + 245);
  ctx.fillText(`SURGE BURSTS: ${data.surgeCount} TIMES`, 60, statsY + 275);
  ctx.fillText(`SESSION: 30.00s FULL SPEED`, 60, statsY + 305);

  // 7. 右下角離線 QR Code (純白靜區高對比背板 + Nearest-Neighbor 繪製)
  if (qrCanvasElement) {
    const qrTargetSize = 220;
    const qrX = W - 60 - qrTargetSize;
    const qrY = statsY + 70;
    const quietZone = 16;
    const totalBox = qrTargetSize + quietZone * 2;

    // 白色靜區背板
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrX - quietZone, qrY - quietZone, totalBox, totalBox);

    // 外框裝飾
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - quietZone, qrY - quietZone, totalBox, totalBox);

    // 最近鄰取樣繪製純黑 QR 碼
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrCanvasElement, qrX, qrY, qrTargetSize, qrTargetSize);
    ctx.imageSmoothingEnabled = true;

    // 掃描指引文字
    ctx.fillStyle = '#888888';
    ctx.font = '600 14px ui-monospace, monospace';
    ctx.fillText('SCAN FOR CERTIFICATE', qrX - 10, qrY + qrTargetSize + 32);
    ctx.fillText('100% OFFLINE VERIFIED', qrX - 10, qrY + qrTargetSize + 50);
  }

  // 8. 底部防偽飾條與浮水印
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, H - 75);
  ctx.lineTo(W - 60, H - 75);
  ctx.stroke();

  ctx.fillStyle = '#555555';
  ctx.font = '400 15px ui-monospace, monospace';
  ctx.fillText(theme.branding.watermark, 60, H - 45);
  ctx.fillText('ZERO-NETWORK AIR-GAPPED // PULSE LAB KINETIC ENGINE', W - 560, H - 45);

  // 9. 非同步背景 toBlob 零複製導出
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve('');
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      resolve(blobUrl);
    }, 'image/png');
  });
}

/**
 * 觸發同步海報下載
 */
export function downloadPosterFile(blobUrl: string, filename: string): void {
  if (!blobUrl) return;
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
