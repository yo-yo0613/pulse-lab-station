import React, { useEffect, useState, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { PosterExportData, ThemeConfig } from '../types/pulse';
import { downloadPosterFile, generatePosterBlobUrl } from '../services/posterExporter';
import { Download, RotateCcw, CheckCircle, Sparkles } from 'lucide-react';

interface PosterModalProps {
  data: PosterExportData;
  theme: ThemeConfig;
  onRestart: () => void;
}

export const PosterModal: React.FC<PosterModalProps> = ({ data, theme, onRestart }) => {
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [resetCountdown, setResetCountdown] = useState(theme.gameplay.inactivityResetSeconds);
  const qrRef = useRef<HTMLDivElement>(null);

  // 依據 qrMode 生成 QR Code 內容 (預設為 Vercel 手機成果展示分享網址)
  const getQrPayload = () => {
    if (theme.poster.qrMode === 'share_url') {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const params = new URLSearchParams({
        score: String(data.pulseScore),
        rank: data.rank,
        code: data.verificationCode,
        peak: String(Math.round(data.peakKinetic)),
        bursts: String(data.surgeCount),
        ts: data.timestamp,
      });
      return `${origin}/share?${params.toString()}`;
    }

    if (theme.poster.qrMode === 'custom_url' && theme.poster.customUrl) {
      return `${theme.poster.customUrl}?score=${data.pulseScore}&rank=${encodeURIComponent(data.rank)}&code=${data.verificationCode}`;
    }

    return `⚡ PULSE LAB 能量認證 ⚡\n評級: ${data.rank}\n動能累積: ${data.pulseScore.toLocaleString()} PTS\n日期: ${data.timestamp}\n防偽驗證碼: #${data.verificationCode}\n“30秒極限動能釋放完畢！”`;
  };

  const qrCodePayload = getQrPayload();

  // 自動非同步預生成海報 Blob URL
  const generatePoster = useCallback(async () => {
    setIsGenerating(true);
    let qrCanvas: HTMLCanvasElement | null = null;
    if (qrRef.current) {
      qrCanvas = qrRef.current.querySelector('canvas');
    }

    try {
      const url = await generatePosterBlobUrl(data, theme, qrCanvas);
      setPosterBlobUrl(url);
    } catch (e) {
      console.warn('[PULSE LAB] Poster generation error:', e);
    } finally {
      setIsGenerating(false);
    }
  }, [data, theme]);

  useEffect(() => {
    // 延遲 50ms 確保 QRCodeCanvas 已在 DOM 繪製完成
    const timer = setTimeout(generatePoster, 50);
    return () => clearTimeout(timer);
  }, [generatePoster]);

  // 無人值守自適應自動重置 (Inactivity Auto-Reset Watchdog)
  useEffect(() => {
    const interval = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onRestart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onRestart]);

  const handleDownload = () => {
    if (!posterBlobUrl) return;
    downloadPosterFile(posterBlobUrl, `PULSE_LAB_${data.verificationCode}.png`);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none overflow-y-auto">
      {/* 隱藏離線 QR Code Canvas 用於合成海報 */}
      <div ref={qrRef} className="hidden">
        <QRCodeCanvas
          value={qrCodePayload}
          size={300}
          level="H"
          marginSize={2}
          fgColor="#000000"
          bgColor="#FFFFFF"
        />
      </div>

      <div className="relative flex flex-col lg:flex-row items-center gap-8 max-w-5xl w-full my-auto">
        {/* 左側：9:16 直立海報預覽 (Cover 居中裁切 + 瑞士網格排版) */}
        <div className="relative w-[320px] sm:w-[360px] h-[570px] sm:h-[640px] bg-[#0A0A0A] border border-white/20 shadow-[0_0_50px_rgba(0,240,255,0.2)] flex items-center justify-center overflow-hidden">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Sparkles className="w-8 h-8 text-[#00F0FF] animate-spin" />
              <span className="text-xs tracking-widest">SYNTHESIZING POSTER...</span>
            </div>
          ) : (
            <img
              src={posterBlobUrl}
              alt="PULSE LAB Poster"
              className="w-full h-full object-contain"
            />
          )}

          {/* 四角準心標記 */}
          <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-white/50" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-white/50" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-white/50" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-white/50" />
        </div>

        {/* 右側：結算數據面板與控制項 */}
        <div className="flex flex-col gap-6 text-white max-w-md w-full">
          {/* 自動重置倒數光條 (Auto-Reset Watchdog Indicator) */}
          <div className="flex flex-col gap-1 bg-white/5 border border-white/10 p-3">
            <div className="flex justify-between text-xs text-white/50 tracking-wider">
              <span>INACTIVITY WATCHDOG</span>
              <span className="text-[#FFE600] font-bold">AUTO-RESET IN {resetCountdown}s</span>
            </div>
            <div className="w-full h-1 bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#FFE600] transition-all duration-1000 ease-linear"
                style={{
                  width: `${(resetCountdown / theme.gameplay.inactivityResetSeconds) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* 成就與動能數據展示 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-[#00F0FF] tracking-widest">
              <CheckCircle className="w-4 h-4" />
              <span>30-SECOND SESSION COMPLETE</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight">KINETIC CERTIFICATE</h2>
            <p className="text-xs text-white/40 tracking-wider">
              SESSION VERIFICATION CODE: #{data.verificationCode}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 border border-white/10 p-4">
              <span className="text-[10px] text-white/40 tracking-widest block">FINAL SCORE</span>
              <span className="text-3xl font-black text-[#FFE600] tracking-tight">
                {data.pulseScore.toLocaleString()}
              </span>
              <span className="text-xs text-[#00F0FF] ml-1 font-bold">PTS</span>
            </div>

            <div className="bg-white/5 border border-white/10 p-4">
              <span className="text-[10px] text-white/40 tracking-widest block">ACHIEVEMENT RANK</span>
              <span className="text-2xl font-black text-[#FF007A] tracking-tight">
                {data.rank}
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 p-3">
              <span className="text-[10px] text-white/40 tracking-widest block">PEAK VELOCITY</span>
              <span className="text-lg font-bold text-white">
                {Math.round(data.peakKinetic)}%
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 p-3">
              <span className="text-[10px] text-white/40 tracking-widest block">SURGE BURSTS</span>
              <span className="text-lg font-bold text-white">
                {data.surgeCount} TIMES
              </span>
            </div>
          </div>

          {/* 下載與操作按鈕 */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleDownload}
              disabled={isGenerating || !posterBlobUrl}
              className="w-full py-4 bg-[#00F0FF] hover:bg-[#00d0df] text-black font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-transform active:scale-98 shadow-[0_0_20px_rgba(0,240,255,0.4)] disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              <span>下載海報 PNG (DOWNLOAD POSTER)</span>
            </button>

            <button
              onClick={onRestart}
              className="w-full py-3 bg-transparent border border-white/30 hover:border-white text-white font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>再來一次 (RESTART SESSION)</span>
            </button>
          </div>

          {/* Kiosk 瀏覽器雙重長按提示 */}
          <div className="text-[11px] text-white/40 tracking-wider text-center">
            💡 提示：點擊按鈕下載，或在左方海報圖片上長按 / 右鍵直接另存圖片
          </div>
        </div>
      </div>
    </div>
  );
};
