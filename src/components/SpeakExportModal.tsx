import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ScoreResult, PromptScenario } from '../types/speak';
import { uploadToCloudinary } from '../services/cloudinary';
import { defaultThemeConfig } from '../config/theme.config';
import { Download, RotateCcw, CheckCircle, Sparkles, Loader2 } from 'lucide-react';

interface SpeakExportModalProps {
  scoreResult: ScoreResult;
  scenario: PromptScenario;
  userVolumeSlice: Float32Array;
  onRestart: () => void;
}

export const SpeakExportModal: React.FC<SpeakExportModalProps> = ({
  scoreResult,
  scenario,
  userVolumeSlice,
  onRestart,
}) => {
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(true);
  const qrRef = useRef<HTMLDivElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. 合成 1080x1920 高清聲音視覺卡片
  const renderCardPoster = useCallback(async (): Promise<string> => {
    let canvas = offscreenCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      offscreenCanvasRef.current = canvas;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const W = 1080;
    const H = 1920;

    // 深黑底色
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, W, H);

    // 瑞士網格
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

    // 頂部標題
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 52px ui-monospace, monospace';
    ctx.fillText('SEE HOW YOU SPEAK', 70, 130);

    ctx.fillStyle = scenario.themeColor;
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText('// 看你怎麼說話：聲音視覺化實驗室', 70, 175);

    ctx.fillStyle = '#888888';
    ctx.font = '400 20px ui-monospace, monospace';
    ctx.fillText(`VERIFIED: #${scoreResult.verificationCode}`, W - 360, 130);
    ctx.fillText(scoreResult.timestamp, W - 360, 165);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 210);
    ctx.lineTo(W - 70, 210);
    ctx.stroke();

    // 中央：動態字體視覺成果框 (Visual Window)
    const cardX = 70;
    const cardY = 250;
    const cardW = W - 140;
    const cardH = 880;

    ctx.fillStyle = '#111111';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = scenario.themeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // 四角十字準心
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    const ch = 20;
    ctx.strokeRect(cardX - 4, cardY - 4, ch, 2);
    ctx.strokeRect(cardX - 4, cardY - 4, 2, ch);
    ctx.strokeRect(cardX + cardW - ch + 4, cardY - 4, ch, 2);
    ctx.strokeRect(cardX + cardW + 2, cardY - 4, 2, ch);
    ctx.strokeRect(cardX - 4, cardY + cardH + 2, ch, 2);
    ctx.strokeRect(cardX - 4, cardY + cardH - ch + 4, 2, ch);
    ctx.strokeRect(cardX + cardW - ch + 4, cardY + cardH + 2, ch, 2);
    ctx.strokeRect(cardX + cardW + 2, cardY + cardH - ch + 4, 2, ch);

    // 標籤
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(cardX + cardW - 320, cardY + 20, 300, 38);
    ctx.fillStyle = scenario.accentColor;
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.fillText(`⚡ ${scenario.emotion}`, cardX + cardW - 305, cardY + 45);

    // 核心大字呈現
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 68px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`「${scenario.line}」`, W / 2, cardY + 360);

    // 聲音波形簽名 (Oscilloscope Signature)
    ctx.strokeStyle = scenario.accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const waveY = cardY + 650;
    const step = cardW / Math.max(1, userVolumeSlice.length - 1);

    for (let i = 0; i < userVolumeSlice.length; i++) {
      const vol = userVolumeSlice[i] || 0;
      const x = cardX + i * step;
      const y = waveY - (vol / 100) * 160;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#888888';
    ctx.font = '600 18px ui-monospace, monospace';
    ctx.fillText('// 實錄聲音波形簽名 (REAL-TIME ACOUSTIC SIGNATURE)', W / 2, cardY + 800);
    ctx.textAlign = 'left';

    // 下方：成就數據與評級
    const statsY = 1200;
    ctx.fillStyle = '#FFE600';
    ctx.font = '900 110px ui-monospace, monospace';
    ctx.fillText(`${scoreResult.overallScore}%`, 70, statsY + 100);

    ctx.fillStyle = '#888888';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.fillText('VOICE SIMILARITY SCORE', 70, statsY);

    ctx.fillStyle = scenario.themeColor;
    ctx.font = '900 48px ui-monospace, monospace';
    ctx.fillText(`${scoreResult.rank} ${scoreResult.rankTitle}`, 70, statsY + 180);

    // 細項
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillText(`💥 音量能量還原度: ${scoreResult.volumeScore}%`, 70, statsY + 250);
    ctx.fillText(`🎵 音調走勢吻合度: ${scoreResult.pitchScore}%`, 70, statsY + 300);
    ctx.fillText(`🗣️ 模仿角色: ${scenario.character}`, 70, statsY + 350);

    // QR Code 嵌入右下角
    let qrCanvas: HTMLCanvasElement | null = null;
    if (qrRef.current) {
      qrCanvas = qrRef.current.querySelector('canvas');
    }
    if (qrCanvas) {
      const qrSize = 190;
      const qrX = W - 70 - qrSize;
      const qrY = H - 100 - qrSize;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 14px ui-monospace, monospace';
      ctx.fillText('SCAN FOR MOBILE CARD', qrX - 5, qrY - 18);
    }

    // 底部浮水印
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, H - 70);
    ctx.lineTo(W - 70, H - 70);
    ctx.stroke();

    ctx.fillStyle = '#555555';
    ctx.font = '500 18px ui-monospace, monospace';
    ctx.fillText('SEE HOW YOU SPEAK // KINETIC TYPOGRAPHY EXHIBITION', 70, H - 35);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve('');
        resolve(URL.createObjectURL(blob));
      }, 'image/png');
    });
  }, [scenario, scoreResult, userVolumeSlice]);

  // 2. 生成分享 QR Code 網址 (帶上 Cloudinary 圖片連結)
  const getQrPayload = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      score: String(scoreResult.overallScore),
      rank: scoreResult.rank,
      title: scoreResult.rankTitle,
      code: scoreResult.verificationCode,
      line: scenario.line,
      sc: scenario.id,
      ts: scoreResult.timestamp,
    });
    if (uploadedImageUrl) {
      params.set('img', uploadedImageUrl);
    } else if (userVolumeSlice && userVolumeSlice.length > 0) {
      // 離線降級：取 16 個代表性聲波特徵點壓入 URL (A/B 24 方案 B)
      const samples: number[] = [];
      const step = Math.max(1, Math.floor(userVolumeSlice.length / 16));
      for (let i = 0; i < 16; i++) {
        const idx = Math.min(userVolumeSlice.length - 1, i * step);
        samples.push(Math.round(userVolumeSlice[idx] || 0));
      }
      params.set('w', samples.join(','));
    }
    return `${origin}/share-speak?${params.toString()}`;
  }, [scoreResult, scenario, uploadedImageUrl, userVolumeSlice]);

  const qrCodePayload = getQrPayload();

  // 3. 初始合成海報與非同步 Cloudinary 上傳
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setIsGenerating(true);
      const url = await renderCardPoster();
      if (!isMounted) return;
      setPosterBlobUrl(url);
      setIsGenerating(false);

      // 上傳至 Cloudinary
      if (defaultThemeConfig.cloudinary?.enabled && url) {
        setIsUploading(true);
        try {
          const cloudUrl = await uploadToCloudinary(url, defaultThemeConfig.cloudinary);
          if (isMounted) {
            if (cloudUrl) {
              setUploadedImageUrl(cloudUrl);
            }
            setIsUploading(false);
          }
        } catch (_) {
          if (isMounted) setIsUploading(false);
        }
      } else {
        setIsUploading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [renderCardPoster]);

  // 當 uploadedImageUrl 就緒時，重新繪製帶有完整圖片參數的 QR Code 海報
  useEffect(() => {
    if (!isUploading) {
      renderCardPoster().then((url) => {
        if (url) setPosterBlobUrl(url);
      });
    }
  }, [isUploading, uploadedImageUrl, renderCardPoster]);

  // 下載海報
  const handleDownload = () => {
    if (!posterBlobUrl) return;
    const a = document.createElement('a');
    a.href = posterBlobUrl;
    a.download = `SEE_HOW_YOU_SPEAK_${scoreResult.verificationCode}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none overflow-y-auto">
      {/* 隱藏 QR Code 用於 Canvas 抓取 */}
      <div ref={qrRef} className="hidden">
        <QRCodeCanvas
          value={qrCodePayload}
          size={250}
          level="H"
          marginSize={1}
          fgColor="#000000"
          bgColor="#FFFFFF"
        />
      </div>

      <div className="relative flex flex-col lg:flex-row items-center gap-8 max-w-5xl w-full my-auto">
        {/* 左側：9:16 海報預覽 */}
        <div className="relative w-[320px] sm:w-[360px] h-[570px] sm:h-[640px] bg-[#0A0A0A] border border-white/20 shadow-[0_0_50px_rgba(255,0,85,0.25)] flex items-center justify-center overflow-hidden">
          {isGenerating || isUploading ? (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Sparkles className="w-8 h-8 text-[#FF0055] animate-spin" />
              <span className="text-xs tracking-widest text-[#00F0FF]">
                {isUploading ? 'SYNCING CLOUD CARD...' : 'SYNTHESIZING CARD...'}
              </span>
            </div>
          ) : (
            <img src={posterBlobUrl} alt="Voice Card" className="w-full h-full object-contain" />
          )}

          {/* 四角準心 */}
          <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-white/50" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-white/50" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-white/50" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-white/50" />
        </div>

        {/* 右側：掃碼與控制項 */}
        <div className="flex flex-col gap-6 text-white max-w-md w-full">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#00F0FF] tracking-widest mb-1">
              <CheckCircle className="w-4 h-4" />
              <span>VOICE CERTIFICATE GENERATED</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight">KINETIC VOICE CARD</h2>
            <p className="text-xs text-white/40 tracking-wider">
              VERIFICATION CODE: #{scoreResult.verificationCode}
            </p>
          </div>

          {/* 掃碼卡片 */}
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-3.5 rounded-sm">
            <div className="bg-white p-1 rounded-sm shrink-0 min-w-[88px] min-h-[88px] flex items-center justify-center">
              {isUploading ? (
                <div className="w-[80px] h-[80px] bg-[#0A0A0A] border border-[#00F0FF]/40 flex flex-col items-center justify-center gap-1.5 p-1 text-center">
                  <Loader2 className="w-5 h-5 text-[#00F0FF] animate-spin" />
                  <span className="text-[9px] text-[#00F0FF] font-bold">同步雲端中</span>
                </div>
              ) : (
                <QRCodeCanvas
                  value={qrCodePayload}
                  size={80}
                  level="M"
                  marginSize={1}
                  fgColor="#000000"
                  bgColor="#FFFFFF"
                />
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
                📱 手機掃碼取得專屬聲音卡片
              </span>
              {isUploading ? (
                <span className="text-[11px] text-[#00F0FF] flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span>高清海報同步至雲端中...</span>
                </span>
              ) : uploadedImageUrl ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 shrink-0" />
                  <span>雲端聲音卡片已就緒！掃碼即存</span>
                </span>
              ) : (
                <span className="text-[11px] text-white/50">即時儲存海報與分享至社群</span>
              )}
            </div>
          </div>

          {/* 下載與重試按鈕 */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownload}
              disabled={isGenerating || !posterBlobUrl}
              className="w-full py-4 bg-[#00F0FF] hover:bg-[#00d0df] text-black font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-transform active:scale-98 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              <span>下載海報 PNG (DOWNLOAD POSTER)</span>
            </button>

            <button
              onClick={onRestart}
              className="w-full py-3 bg-transparent border border-white/30 hover:border-white text-white font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>換個台詞再玩一次 (TRY ANOTHER LINE)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
