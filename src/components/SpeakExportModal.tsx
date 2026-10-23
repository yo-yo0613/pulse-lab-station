import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ScoreResult, PromptScenario } from '../types/speak';
import { uploadToCloudinary } from '../services/cloudinary';
import { defaultThemeConfig } from '../config/theme.config';
import { Download, RotateCcw, CheckCircle, Sparkles, Volume2, Square } from 'lucide-react';

interface SpeakExportModalProps {
  scoreResult: ScoreResult;
  scenario: PromptScenario;
  userVolumeSlice: Float32Array;
  userPitchSlice?: Float32Array;
  userAudioUrl?: string | null;
  onRestart: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

interface GlyphInfo {
  char: string;
  fontSize: number;
  weight: number;
  scaleX: number;
  yOffset: number;
  effectiveWidth: number;
  isBurst: boolean;
}

export const SpeakExportModal: React.FC<SpeakExportModalProps> = ({
  scoreResult,
  scenario,
  userVolumeSlice,
  userPitchSlice,
  userAudioUrl,
  onRestart,
  onPlayStateChange,
}) => {
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeTab, setActiveTab] = useState<'poster' | 'video'>('poster');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevBlobUrlRef = useRef<string>('');

  // 0. 安全釋放舊 Blob 記憶體 (Defense 7.31 & 7.45)
  const safeSetBlobUrl = useCallback((newUrl: string) => {
    if (prevBlobUrlRef.current && prevBlobUrlRef.current !== newUrl) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
    }
    prevBlobUrlRef.current = newUrl;
    setPosterBlobUrl(newUrl);
  }, []);

  // 影音同步聯動播放器：野原廣志畫面 + 玩家錄音
  const togglePlayAudio = () => {
    if (!userAudioUrl) return;

    if (isPlayingAudio) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.currentTime = 0;
      }
      setIsPlayingAudio(false);
      onPlayStateChange?.(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(userAudioUrl);
    audioRef.current = audio;

    // 若處於影片模式或有預覽影片，同步播放畫面
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = 0;
      previewVideoRef.current.play().catch(() => {});
    }

    audio.onended = () => {
      setIsPlayingAudio(false);
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.currentTime = 0;
      }
      onPlayStateChange?.(false);
    };

    audio.onerror = () => {
      setIsPlayingAudio(false);
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
      }
      onPlayStateChange?.(false);
    };

    onPlayStateChange?.(true);
    audio
      .play()
      .then(() => {
        setIsPlayingAudio(true);
      })
      .catch(() => {
        setIsPlayingAudio(false);
        onPlayStateChange?.(false);
      });
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current = null;
      }
      onPlayStateChange?.(false);
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = '';
      }
    };
  }, [onPlayStateChange]);

  // 1. 合成 1080x1920 高清聲態海報 (A/B 48 逐字元聲學排版引擎)
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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SEE HOW YOU SPEAK', 70, 100);

    ctx.fillStyle = scenario.themeColor;
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText('// 看你怎麼說話：聲音視覺化實驗室', 70, 165);

    ctx.fillStyle = '#888888';
    ctx.font = '400 20px ui-monospace, monospace';
    ctx.fillText(`VERIFIED: #${scoreResult.verificationCode}`, W - 360, 105);
    ctx.fillText(scoreResult.timestamp, W - 360, 140);

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

    // ========================================================
    // 核心演算法：逐字元聲學排版引擎 (A/B 48, A/B 49, A/B 50, A/B 51)
    // 徹底消滅死板字體，大吼變大、微弱變小、長音拉寬、色差爆裂！
    // ========================================================
    const lineText = `「${scenario.line}」`;
    const chars = Array.from(lineText);
    const N = chars.length;
    const maxLineWidth = cardW - 120; // 兩側留白

    // 依據字數自適應基準字號 (7.44 短字數 vs 長字數補償)
    let baseFontSize = N <= 12 ? 68 : N <= 18 ? 56 : 46;

    const glyphs: GlyphInfo[] = chars.map((char, i) => {
      const isPunc = ['「', '」', '，', '。', '！', '？', '…', ' '].includes(char);
      const progress = N > 1 ? i / (N - 1) : 0;
      const vLen = userVolumeSlice.length;
      const vIdx = vLen > 0 ? Math.min(vLen - 1, Math.floor(progress * vLen)) : 0;
      const vol = userVolumeSlice[vIdx] || 0;
      const pVal =
        userPitchSlice && userPitchSlice.length > 0
          ? userPitchSlice[vIdx] || 0.2
          : 0.2;

      if (isPunc) {
        ctx.font = `700 ${baseFontSize}px system-ui, -apple-system, sans-serif`;
        const rawW = ctx.measureText(char).width;
        return {
          char,
          fontSize: baseFontSize,
          weight: 700,
          scaleX: 1.0,
          yOffset: 0,
          effectiveWidth: rawW + 4,
          isBurst: false,
        };
      }

      // 1. 音量對應字級與字重 (大聲 1.45x 炸裂加粗，小聲 0.72x 微縮)
      let fontSize = baseFontSize;
      let weight = 600;
      let isBurst = false;

      if (vol > 65) {
        fontSize = Math.round(baseFontSize * (1.25 + ((vol - 65) / 35) * 0.45));
        weight = 900;
        isBurst = true;
      } else if (vol > 25) {
        fontSize = Math.round(baseFontSize * (0.95 + ((vol - 25) / 40) * 0.3));
        weight = 700;
      } else {
        fontSize = Math.round(baseFontSize * Math.max(0.72, 0.72 + (vol / 25) * 0.23));
        weight = 400;
      }

      // 2. 拉長音對應幾何延展 (A/B 43: 後段尾音或高音量處 scaleX 1.4 ~ 2.1x 橫向拉長)
      let scaleX = 1.0;
      if (vol > 45 && (i >= N - 7 || vol > 60)) {
        scaleX = Math.min(2.1, 1.05 + (vol / 100) * 1.05);
      }

      // 3. 音高對應 Y 軸浮動波浪
      const yOffset = Math.round((pVal - 0.25) * -42);

      // 4. 動態包圍盒寬度計算 (A/B 49)
      ctx.font = `${weight} ${fontSize}px system-ui, -apple-system, sans-serif`;
      const rawW = ctx.measureText(char).width;
      const effectiveWidth = Math.round(rawW * scaleX + (scaleX > 1.2 ? 14 : 6));

      return {
        char,
        fontSize,
        weight,
        scaleX,
        yOffset,
        effectiveWidth,
        isBurst,
      };
    });

    // 5. 動態自適應多行折行 (A/B 50 防文字衝出海報邊界)
    const lines: GlyphInfo[][] = [];
    let curLine: GlyphInfo[] = [];
    let curLineWidth = 0;

    for (let k = 0; k < glyphs.length; k++) {
      const g = glyphs[k];
      if (curLineWidth + g.effectiveWidth > maxLineWidth && curLine.length > 0) {
        lines.push(curLine);
        curLine = [g];
        curLineWidth = g.effectiveWidth;
      } else {
        curLine.push(g);
        curLineWidth += g.effectiveWidth;
      }
    }
    if (curLine.length > 0) lines.push(curLine);

    // 6. 逐行居中繪製與色差故障投影 (A/B 51)
    const lineSpacing = baseFontSize * 1.65;
    const totalLinesHeight = (lines.length - 1) * lineSpacing;
    const startY = cardY + 380 - totalLinesHeight / 2;

    lines.forEach((lineGlyphs, lineIdx) => {
      const lineWidth = lineGlyphs.reduce((acc, g) => acc + g.effectiveWidth, 0);
      let curX = cardX + (cardW - lineWidth) / 2;
      const lineCenterY = startY + lineIdx * lineSpacing;

      lineGlyphs.forEach((g) => {
        const cx = curX + g.effectiveWidth / 2;
        const cy = lineCenterY + g.yOffset;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(g.scaleX, 1.0);
        ctx.font = `${g.weight} ${g.fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 聲學爆發色差故障陰影 (A/B 51)
        if (g.isBurst) {
          ctx.fillStyle = '#00F0FF';
          ctx.fillText(g.char, -4, 0);
          ctx.fillStyle = '#FF0055';
          ctx.fillText(g.char, 4, 0);
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(g.char, 0, 0);
        ctx.restore();

        curX += g.effectiveWidth;
      });
    });

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
    ctx.textAlign = 'center';
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
  }, [scenario, scoreResult, userVolumeSlice, userPitchSlice]);

  // 2. 生成分享 QR Code 網址 (A/B 52 帶上聲學時域特徵切片 w, p)
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
      // 離線降級：取 16 個代表性音量 (w) 與音高 (p) 特徵點壓入 URL (A/B 24 / A/B 52)
      const samplesW: number[] = [];
      const samplesP: number[] = [];
      const step = Math.max(1, Math.floor(userVolumeSlice.length / 16));
      for (let i = 0; i < 16; i++) {
        const idx = Math.min(userVolumeSlice.length - 1, i * step);
        samplesW.push(Math.round(userVolumeSlice[idx] || 0));
        const pNorm = userPitchSlice ? userPitchSlice[idx] || 0.2 : 0.2;
        samplesP.push(Math.round(pNorm * 100));
      }
      params.set('w', samplesW.join(','));
      params.set('p', samplesP.join(','));
    }
    return `${origin}/share-speak?${params.toString()}`;
  }, [scoreResult, scenario, uploadedImageUrl, userVolumeSlice, userPitchSlice]);

  const qrCodePayload = getQrPayload();

  // 3. 初始合成海報與非同步 Cloudinary 上傳 (Defense 7.31 防重複洩漏)
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setIsGenerating(true);
      const url = await renderCardPoster();
      if (!isMounted) return;
      safeSetBlobUrl(url);
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
  }, [renderCardPoster, safeSetBlobUrl]);

  // 下載海報 (Defense 7.46 本機 Blob 優先秒級下載)
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
        {/* 左側：9:16 海報預覽 或 對嘴配音影片預覽 (林妤安需求：放上影片+錄音) */}
        <div className="flex flex-col items-center gap-2">
          {/* Tab 切換：高清海報 vs 配音影片 */}
          <div className="flex items-center gap-2 bg-black/60 p-1 rounded-xl border border-white/10 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('poster')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'poster'
                  ? 'bg-white/20 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              📄 聲態海報 (POSTER)
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'video'
                  ? 'bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🎬 配音影片 (DUBBING VIDEO)
            </button>
          </div>

          <div className="relative w-[320px] sm:w-[360px] h-[540px] sm:h-[600px] bg-[#0A0A0A] border border-white/20 shadow-[0_0_50px_rgba(255,0,85,0.25)] flex flex-col items-center justify-center overflow-hidden rounded-xl">
            {activeTab === 'poster' ? (
              isGenerating ? (
                <div className="flex flex-col items-center gap-3 text-white/60">
                  <Sparkles className="w-8 h-8 text-[#FF0055] animate-spin" />
                  <span className="text-xs tracking-widest text-[#00F0FF]">
                    SYNTHESIZING ACOUSTIC CARD...
                  </span>
                </div>
              ) : (
                <img src={posterBlobUrl} alt="Voice Card" className="w-full h-full object-contain" />
              )
            ) : (
              /* 配音影片播放區：野原廣志畫面 + 玩家模仿原音同步播放 */
              <div className="w-full h-full flex flex-col items-center justify-between p-4 bg-black/90">
                <div className="text-center pt-2">
                  <span className="text-[11px] font-bold text-cyan-400 tracking-wider">
                    ✦ 你的專屬角色配音成片 ✦
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    畫面：野原廣志 // 聲音：玩家現場演繹
                  </p>
                </div>

                {scenario.videoPromptUrl && (
                  <div className="w-full rounded-xl overflow-hidden border border-white/20 bg-black aspect-video relative shadow-lg">
                    <video
                      ref={previewVideoRef}
                      playsInline
                      muted
                      preload="auto"
                      className="w-full h-full object-contain mx-auto"
                    >
                      <source src={scenario.videoPromptUrl} type="video/mp4" />
                      <source src={scenario.videoPromptUrl.replace('.mp4', '.mov')} type="video/quicktime" />
                    </video>
                  </div>
                )}

                <div className="w-full text-center py-2 px-3 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-lg font-black text-white">「{scenario.line}」</h3>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    語音相似度：<b className="text-[#FFE600]">{scoreResult.overallScore}%</b> ({scoreResult.rankTitle})
                  </p>
                </div>

                <button
                  onClick={togglePlayAudio}
                  className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer border ${
                    isPlayingAudio
                      ? 'bg-amber-500/30 border-amber-500 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-pulse'
                      : 'bg-[#00F0FF]/20 border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/30'
                  }`}
                >
                  {isPlayingAudio ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      <span>⏹ 暫停播放配音成片 (PAUSE)</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>▶ 播放我的配音成片 (PLAY DUBBING)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 四角準心 */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-white/50 pointer-events-none" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-white/50 pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-white/50 pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-white/50 pointer-events-none" />
          </div>
        </div>

        {/* 右側：掃碼與控制項 */}
        <div className="flex flex-col gap-6 text-white max-w-md w-full">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">
              <CheckCircle className="w-4 h-4" />
              <span>Voice Certificate Generated</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">KINETIC VOICE CARD</h1>
            <p className="text-xs text-zinc-400 mt-1">
              VERIFICATION CODE: #{scoreResult.verificationCode}
            </p>
          </div>

          {/* QR Code 掃碼區域 */}
          <div className="bg-zinc-950/80 border border-white/10 p-5 rounded-2xl flex items-center gap-5 backdrop-blur-md">
            <div className="bg-white p-2.5 rounded-xl shrink-0 shadow-lg">
              <QRCodeCanvas
                value={qrCodePayload}
                size={110}
                level="M"
                marginSize={1}
                fgColor="#000000"
                bgColor="#FFFFFF"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-zinc-300">
              <p className="font-bold text-white flex items-center gap-1.5">
                <span>📱 手機掃碼取得專屬聲音卡片</span>
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {isUploading ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    正在同步雲端圖床與聲學 DNA...
                  </span>
                ) : uploadedImageUrl ? (
                  <span className="text-emerald-400">✅ 雲端聲音卡片已就緒！掃碼保存</span>
                ) : (
                  <span>⚡ 離線聲學 DNA 模式：手機秒繪高清海報</span>
                )}
              </p>
            </div>
          </div>

          {/* 原音回放播放器 (A/B 36 原音重現) */}
          {userAudioUrl && (
            <button
              onClick={togglePlayAudio}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer border ${
                isPlayingAudio
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse'
                  : 'bg-white/5 border-white/15 text-zinc-300 hover:text-white hover:border-white/30 hover:bg-white/10'
              }`}
            >
              {isPlayingAudio ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>⏹ 停止播放原音 (STOP)</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>▶️ 聆聽我的現場模仿原音 (PLAY VOICE)</span>
                </>
              )}
            </button>
          )}

          {/* 下載與重玩按鈕 */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="w-full py-3.5 rounded-xl font-black text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer bg-[#00F0FF] hover:bg-[#33F3FF] text-black shadow-[0_0_25px_rgba(0,240,255,0.4)] active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>下載海報 PNG (DOWNLOAD POSTER)</span>
            </button>

            <button
              onClick={onRestart}
              className="w-full py-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 hover:border-white/20 active:scale-95"
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
