import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Download,
  Share2,
  Play,
  Check,
  Zap,
  Activity,
  Award,
  Calendar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface ShareParams {
  score: number;
  rank: string;
  code: string;
  peak: number;
  bursts: number;
  timestamp: string;
  imageUrl?: string;
}

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
    sw = sourceH * targetRatio;
    sx = (sourceW - sw) / 2;
  } else {
    sh = sourceW / targetRatio;
    sy = (sourceH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

export const SharePage: React.FC = () => {
  const [params, setParams] = useState<ShareParams>({
    score: 30708,
    rank: 'SSS (KINETIC BEAST)',
    code: 'PL-29186',
    peak: 100,
    bursts: 52,
    timestamp: '2026/09/24',
  });

  const [copied, setCopied] = useState(false);
  const [generatingPoster, setGeneratingPoster] = useState(false);
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 解析 URL 參數 (支援 /share?..., /?share=true..., #/share?...)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let searchStr = window.location.search;
    if (!searchStr && window.location.hash.includes('?')) {
      searchStr = window.location.hash.substring(window.location.hash.indexOf('?'));
    }

    const query = new URLSearchParams(searchStr);
    const scoreParam = query.get('score');
    const rankParam = query.get('rank');
    const codeParam = query.get('code');
    const peakParam = query.get('peak');
    const burstsParam = query.get('bursts');
    const tsParam = query.get('ts');
    const imgParam = query.get('img');

    setParams({
      score: scoreParam ? parseInt(scoreParam, 10) : 30708,
      rank: rankParam ? decodeURIComponent(rankParam) : 'SSS (KINETIC BEAST)',
      code: codeParam || 'PL-29186',
      peak: peakParam ? parseInt(peakParam, 10) : 100,
      bursts: burstsParam ? parseInt(burstsParam, 10) : 52,
      timestamp: tsParam ? decodeURIComponent(tsParam) : new Date().toLocaleDateString('zh-TW'),
      imageUrl: imgParam ? decodeURIComponent(imgParam) : undefined,
    });
  }, []);

  // 在前端 Canvas 合成專屬 9:16 行動端證書圖 (含相片或能量勳章)
  const renderMobilePoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setGeneratingPoster(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (typeof document !== 'undefined' && document.fonts) {
      await document.fonts.ready;
    }

    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    // 1. 深沉黑底 (#0A0A0A)
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, W, H);

    // 2. 瑞士極簡網格背景
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 3. 頂部品牌標題
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 56px ui-monospace, monospace';
    ctx.fillText('PULSE LAB', 70, 140);

    ctx.fillStyle = '#00F0FF';
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText('// 30秒動能快閃互動體驗站', 70, 185);

    ctx.fillStyle = '#888888';
    ctx.font = '400 20px ui-monospace, monospace';
    ctx.fillText(`VERIFIED: #${params.code}`, W - 360, 140);
    ctx.fillText(params.timestamp, W - 360, 175);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 220);
    ctx.lineTo(W - 70, 220);
    ctx.stroke();

    // 4. 嘗試載入雲端相片
    let loadedImg: HTMLImageElement | null = null;
    if (params.imageUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
          img.onload = () => {
            loadedImg = img;
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = params.imageUrl!;
        });
      } catch (err) {
        console.warn('Failed to load shared image:', err);
      }
    }

    if (loadedImg && (loadedImg as HTMLImageElement).width > 0) {
      // 4a. 有相片：繪製 9:16 實拍精彩瞬間
      const photoX = 70;
      const photoY = 250;
      const photoW = W - 140; // 940
      const photoH = 960;

      const { sx, sy, sw, sh } = getCoverCrop(
        (loadedImg as HTMLImageElement).width,
        (loadedImg as HTMLImageElement).height,
        photoW,
        photoH
      );

      ctx.save();
      ctx.beginPath();
      ctx.rect(photoX, photoY, photoW, photoH);
      ctx.clip();
      ctx.drawImage(loadedImg, sx, sy, sw, sh, photoX, photoY, photoW, photoH);

      // 照片外框
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3;
      ctx.strokeRect(photoX, photoY, photoW, photoH);
      ctx.restore();

      // 四角十字準心
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      const ch = 18;
      ctx.strokeRect(photoX - 4, photoY - 4, ch, 2);
      ctx.strokeRect(photoX - 4, photoY - 4, 2, ch);
      ctx.strokeRect(photoX + photoW - ch + 4, photoY - 4, ch, 2);
      ctx.strokeRect(photoX + photoW + 2, photoY - 4, 2, ch);
      ctx.strokeRect(photoX - 4, photoY + photoH + 2, ch, 2);
      ctx.strokeRect(photoX - 4, photoY + photoH - ch + 4, 2, ch);
      ctx.strokeRect(photoX + photoW - ch + 4, photoY + photoH + 2, ch, 2);
      ctx.strokeRect(photoX + photoW + 2, photoY + photoH - ch + 4, 2, ch);

      // 照片右上角標籤
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(photoX + photoW - 310, photoY + 16, 294, 38);
      ctx.fillStyle = '#00F0FF';
      ctx.font = '700 16px ui-monospace, monospace';
      ctx.fillText('⚡ 30S PEAK MOMENT // 現場實拍', photoX + photoW - 300, photoY + 41);

      // 5a. 下方動能數據面板
      const statsY = 1250;
      ctx.fillStyle = '#FF007A';
      ctx.font = '900 48px ui-monospace, monospace';
      ctx.fillText(params.rank, 70, statsY);

      ctx.fillStyle = '#888888';
      ctx.font = '600 22px ui-monospace, monospace';
      ctx.fillText('ACCUMULATED KINETIC SCORE', 70, statsY + 60);

      ctx.fillStyle = '#FFE600';
      ctx.font = '900 100px ui-monospace, monospace';
      ctx.fillText(params.score.toLocaleString(), 70, statsY + 155);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 30px ui-monospace, monospace';
      ctx.fillText('PTS', 640, statsY + 145);

      const subY = statsY + 230;
      ctx.fillStyle = '#AAAAAA';
      ctx.font = '600 24px ui-monospace, monospace';
      ctx.fillText(`⚡ PEAK VELOCITY: ${params.peak}% (MAX REACHED)`, 70, subY);
      ctx.fillText(`💥 SURGE BURSTS: ${params.bursts} TIMES OVERDRIVE`, 70, subY + 50);
      ctx.fillText(`🛡️ VERIFICATION ID: #${params.code}`, 70, subY + 100);
    } else {
      // 4b. 無相片時：繪製中央發光動能核心勳章 (Kinetic Core Badge)
      const centerX = W / 2;
      const centerY = 680;

      // 放射漸層光環
      const grad = ctx.createRadialGradient(centerX, centerY, 60, centerX, centerY, 380);
      grad.addColorStop(0, 'rgba(255, 230, 0, 0.25)');
      grad.addColorStop(0.5, 'rgba(255, 0, 122, 0.15)');
      grad.addColorStop(1, 'rgba(10, 10, 10, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 380, 0, Math.PI * 2);
      ctx.fill();

      // 幾何賽博圓環
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 280, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 0, 122, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 240, 0, Math.PI * 2);
      ctx.stroke();

      // 評級徽章
      ctx.fillStyle = '#FFE600';
      ctx.font = '900 84px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(params.rank.split(' ')[0] || 'SSS', centerX, centerY - 20);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 32px ui-monospace, monospace';
      ctx.fillText(params.rank.replace(/^[A-Z]+\s*/, '') || 'KINETIC BEAST', centerX, centerY + 45);

      ctx.fillStyle = '#00F0FF';
      ctx.font = '600 20px ui-monospace, monospace';
      ctx.fillText('OFFICIAL CERTIFIED PERFORMANCE', centerX, centerY + 110);
      ctx.textAlign = 'left';

      // 5b. 動能數據面板
      const statsY = 1180;

      ctx.fillStyle = '#888888';
      ctx.font = '600 22px ui-monospace, monospace';
      ctx.fillText('ACCUMULATED KINETIC SCORE', 70, statsY);

      ctx.fillStyle = '#FFE600';
      ctx.font = '900 110px ui-monospace, monospace';
      ctx.fillText(params.score.toLocaleString(), 70, statsY + 105);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 32px ui-monospace, monospace';
      ctx.fillText('PTS', 580, statsY + 95);

      // 次要數據區塊
      const subY = statsY + 190;
      ctx.fillStyle = '#AAAAAA';
      ctx.font = '600 24px ui-monospace, monospace';
      ctx.fillText(`⚡ PEAK VELOCITY: ${params.peak}% (MAX REACHED)`, 70, subY);
      ctx.fillText(`💥 SURGE BURSTS: ${params.bursts} TIMES OVERDRIVE`, 70, subY + 50);
      ctx.fillText(`⏱️ SESSION DURATION: 30.00s FULL SPEED`, 70, subY + 100);
      ctx.fillText(`🛡️ VERIFICATION ID: #${params.code}`, 70, subY + 150);
    }

    // 6. 底部品牌與浮水印
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, H - 100);
    ctx.lineTo(W - 70, H - 100);
    ctx.stroke();

    ctx.fillStyle = '#666666';
    ctx.font = '500 18px ui-monospace, monospace';
    ctx.fillText('PULSE LAB // KINETIC POP-UP EXHIBITION 2026', 70, H - 60);
    ctx.fillText('POWERED BY PULSE KINETIC ENGINE', W - 430, H - 60);

    // 轉為 Blob URL 供手機下載與長按儲存
    canvas.toBlob((blob) => {
      if (blob) {
        setPosterBlobUrl(URL.createObjectURL(blob));
      }
      setGeneratingPoster(false);
    }, 'image/png');
  }, [params]);

  useEffect(() => {
    renderMobilePoster();
  }, [renderMobilePoster]);

  // 下載海報至手機相簿
  const handleDownload = () => {
    if (!posterBlobUrl) return;
    const a = document.createElement('a');
    a.href = posterBlobUrl;
    a.download = `PULSE_LAB_${params.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 複製社群分享文案 (Instagram / Threads / Line)
  const handleCopyShareText = () => {
    const text = `⚡ 我在《PULSE LAB｜30秒動能快閃互動體驗站》拿到了【${params.rank}】評級！\n🔥 30 秒燃燒動能：${params.score.toLocaleString()} PTS\n💥 爆發次數：${params.bursts} 次｜極限瞬速：${params.peak}%\n數位防偽代碼：#${params.code}\n\n👉 你也來挑戰釋放極限動能：${window.location.origin}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // 立即跳轉自己挑戰
  const handleGoHome = () => {
    window.location.href = window.location.origin;
  };

  return (
    <div className="min-h-screen w-full bg-[#0A0A0A] text-white font-mono flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto select-none">
      {/* 隱藏 Canvas 供海報合成 */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 頂部導航列 */}
      <div className="w-full max-w-lg flex items-center justify-between py-3 border-b border-white/10 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-[#00F0FF] animate-pulse" />
          <span className="font-black text-lg tracking-wider text-white">PULSE LAB</span>
          <span className="text-[10px] px-1.5 py-0.5 border border-[#00F0FF]/40 text-[#00F0FF]">
            CERTIFICATE
          </span>
        </div>

        <button
          onClick={handleGoHome}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00F0FF]/10 hover:bg-[#00F0FF]/20 border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-bold transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-[#00F0FF]" />
          <span>我也要玩</span>
        </button>
      </div>

      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        {/* 證書卡片預覽區 */}
        <div className="relative w-full aspect-[9/16] max-w-[340px] bg-[#111111] border border-white/20 shadow-[0_0_40px_rgba(0,240,255,0.15)] overflow-hidden rounded-sm flex items-center justify-center">
          {generatingPoster || !posterBlobUrl ? (
            <div className="flex flex-col items-center gap-2 text-white/50 text-xs">
              <Sparkles className="w-6 h-6 text-[#00F0FF] animate-spin" />
              <span>GENERATING CERTIFICATE...</span>
            </div>
          ) : (
            <img
              src={posterBlobUrl}
              alt="Pulse Lab Certificate"
              className="w-full h-full object-contain"
            />
          )}

          {/* 四角準心標記 */}
          <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-white/40 pointer-events-none" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-white/40 pointer-events-none" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-white/40 pointer-events-none" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-white/40 pointer-events-none" />
        </div>

        <p className="text-[11px] text-white/40 tracking-wider text-center">
          💡 長按上方圖片可直接儲存至相簿，或點擊下方按鈕下載
        </p>

        {/* 成就數據摘要卡片 */}
        <div className="w-full bg-white/5 border border-white/10 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] text-white/50 tracking-widest block">PERFORMANCE RANK</span>
              <span className="text-xl font-black text-[#FF007A] tracking-tight">{params.rank}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-white/50 tracking-widest block">FINAL SCORE</span>
              <span className="text-2xl font-black text-[#FFE600] tracking-tight">
                {params.score.toLocaleString()} <span className="text-xs text-white">PTS</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-white/70">
              <Zap className="w-4 h-4 text-[#FFE600]" />
              <span>極限速度: {params.peak}%</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Activity className="w-4 h-4 text-[#FF007A]" />
              <span>爆發次數: {params.bursts} 次</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Calendar className="w-4 h-4 text-[#00F0FF]" />
              <span>認證日期: {params.timestamp}</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>序號: #{params.code}</span>
            </div>
          </div>
        </div>

        {/* 操作按鈕群組 */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleDownload}
            disabled={!posterBlobUrl}
            className="w-full py-3.5 bg-[#00F0FF] hover:bg-[#00d0df] text-black font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>儲存海報圖片至相簿 (SAVE POSTER)</span>
          </button>

          <button
            onClick={handleCopyShareText}
            className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? '已複製分享文案！' : '複製社群打卡分享文案'}</span>
          </button>

          <button
            onClick={handleGoHome}
            className="w-full py-3 bg-gradient-to-r from-[#FF007A] to-[#7000FF] hover:opacity-90 text-white font-black text-xs tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,0,122,0.3)] transition-transform active:scale-98 cursor-pointer"
          >
            <Award className="w-4 h-4" />
            <span>我也要挑戰 30 秒動能 (START CHALLENGE)</span>
          </button>
        </div>

        {/* 底部版權 */}
        <div className="text-[10px] text-white/30 tracking-widest text-center pt-4 pb-8">
          PULSE LAB 2026 // ZERO-NETWORK KINETIC STATION
        </div>
      </div>
    </div>
  );
};
