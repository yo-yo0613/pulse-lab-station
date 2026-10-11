import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Download,
  Share2,
  Check,
  Award,
} from 'lucide-react';
import { PROMPT_SCENARIOS } from '../config/speakScenarios';
import type { PromptScenario } from '../types/speak';

interface SpeakShareParams {
  score: number;
  rank: string;
  title: string;
  code: string;
  line: string;
  sc: string;
  ts: string;
  imageUrl?: string;
}

export const SpeakSharePage: React.FC = () => {
  const [params, setParams] = useState<SpeakShareParams>({
    score: 95,
    rank: 'SSS',
    title: '聲能傳奇 (Acoustic Legend)',
    code: 'SPK-88219',
    line: '我絕對不會向這個世界認輸！給我聽清楚！',
    sc: 'fury-roar',
    ts: '2026/10/11',
  });

  const [copied, setCopied] = useState(false);
  const [generatingPoster, setGeneratingPoster] = useState(false);
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 解析 URL 參數 (支援 /share-speak?..., #/share-speak?..., /?share-speak=true...)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let searchStr = window.location.search;
    if (!searchStr && window.location.hash.includes('?')) {
      searchStr = window.location.hash.substring(window.location.hash.indexOf('?'));
    }

    const query = new URLSearchParams(searchStr);
    const scoreParam = query.get('score');
    const rankParam = query.get('rank');
    const titleParam = query.get('title');
    const codeParam = query.get('code');
    const lineParam = query.get('line');
    const scParam = query.get('sc');
    const tsParam = query.get('ts');
    const imgParam = query.get('img');

    let cleanImg: string | undefined = undefined;
    if (imgParam) {
      try {
        cleanImg = decodeURIComponent(imgParam);
      } catch (_) {
        cleanImg = imgParam;
      }
    }

    setParams({
      score: scoreParam ? parseInt(scoreParam, 10) : 95,
      rank: rankParam ? decodeURIComponent(rankParam) : 'SSS',
      title: titleParam ? decodeURIComponent(titleParam) : '聲能傳奇 (Acoustic Legend)',
      code: codeParam || 'SPK-88219',
      line: lineParam ? decodeURIComponent(lineParam) : '我絕對不會向這個世界認輸！給我聽清楚！',
      sc: scParam || 'fury-roar',
      ts: tsParam ? decodeURIComponent(tsParam) : new Date().toLocaleDateString('zh-TW'),
      imageUrl: cleanImg,
    });
  }, []);

  // 確保行動端瀏覽器解除任何 kiosk 鎖定
  useEffect(() => {
    document.body.classList.remove('kiosk-locked');
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const scenario: PromptScenario =
    PROMPT_SCENARIOS.find((s: PromptScenario) => s.id === params.sc) || PROMPT_SCENARIOS[0];

  // 若無 Cloudinary 圖片，本地動態渲染 9:16 卡片
  const renderFallbackCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return '';

    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 深黑底色
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, W, H);

    // 漸變微光
    const grad = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, 800);
    grad.addColorStop(0, `${scenario.themeColor}33`);
    grad.addColorStop(1, '#08080800');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 網格點
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = 60; x < W; x += 60) {
      for (let y = 60; y < H; y += 60) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // 邊框
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, W - 80, H - 80);

    // 頂部標頭
    ctx.fillStyle = scenario.accentColor;
    ctx.font = '900 32px ui-monospace, monospace';
    ctx.fillText('SEE HOW YOU SPEAK // 聲音視覺認證憑證', 70, 110);

    ctx.fillStyle = '#666666';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.fillText(`VERIFICATION NO: ${params.code}  |  DATE: ${params.ts}`, 70, 150);

    // 主體卡片
    const cardX = 70;
    const cardY = 220;
    const cardW = W - 140;
    const cardH = 1100;

    ctx.fillStyle = '#111111';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = scenario.themeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // 標籤
    ctx.fillStyle = scenario.accentColor;
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText(`⚡ 情緒場景: ${scenario.title} (${scenario.emotion})`, cardX + 40, cardY + 70);

    // 核心大字呈現
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 68px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`「${params.line}」`, W / 2, cardY + 380);

    // 模擬動態波形
    ctx.strokeStyle = scenario.accentColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    const waveY = cardY + 680;
    for (let i = 0; i < 60; i++) {
      const x = cardX + 40 + i * ((cardW - 80) / 59);
      const val = Math.sin(i * 0.2) * 50 + Math.cos(i * 0.5) * 30;
      const y = waveY - val;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#888888';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.fillText('// 實錄聲音波形簽名 (ACOUSTIC SIGNATURE)', W / 2, cardY + 820);

    // 評級印章
    ctx.textAlign = 'left';
    ctx.strokeStyle = scenario.accentColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(cardX + 50, cardY + 890, 240, 130);
    ctx.fillStyle = scenario.accentColor;
    ctx.font = '900 86px system-ui, sans-serif';
    ctx.fillText(params.rank, cardX + 75, cardY + 985);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillText(`${params.score} 分`, cardX + 320, cardY + 950);
    ctx.fillStyle = '#999999';
    ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillText(params.title, cardX + 320, cardY + 995);

    // 底部資訊
    ctx.fillStyle = '#444444';
    ctx.font = '500 20px ui-monospace, monospace';
    ctx.fillText('SEE HOW YOU SPEAK // KINETIC TYPOGRAPHY EXHIBITION', 70, H - 70);

    return new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve('');
        resolve(URL.createObjectURL(blob));
      }, 'image/png');
    });
  }, [params, scenario]);

  useEffect(() => {
    if (!params.imageUrl) {
      renderFallbackCard().then((url) => {
        if (url) setPosterBlobUrl(url);
      });
    }
  }, [params.imageUrl, renderFallbackCard]);

  // 下載按鈕處理
  const handleDownload = async () => {
    setGeneratingPoster(true);
    let targetUrl = params.imageUrl || posterBlobUrl;

    if (!targetUrl) {
      targetUrl = await renderFallbackCard();
    }

    if (targetUrl) {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = `SEE-HOW-YOU-SPEAK-${params.code}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setGeneratingPoster(false);
  };

  // 複製連結處理
  const handleCopyLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch (_) {}
    }
    window.prompt('複製分享連結：', window.location.href);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center px-4 py-8 select-text">
      {/* 隱藏離線畫布供備援繪製 */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 頂部導航列 */}
      <header className="w-full max-w-md flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-black text-xs"
            style={{ backgroundColor: scenario.accentColor }}
          >
            SPK
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wider uppercase font-mono">
              See How You Speak
            </h1>
            <p className="text-[10px] text-zinc-400 font-mono tracking-widest">
              聲音動態字體 體驗憑證
            </p>
          </div>
        </div>
        <span
          className="px-2.5 py-1 text-[11px] font-mono rounded-full border"
          style={{
            borderColor: `${scenario.themeColor}66`,
            color: scenario.accentColor,
            backgroundColor: `${scenario.themeColor}15`,
          }}
        >
          {params.rank} 等級
        </span>
      </header>

      {/* 主體展示區 */}
      <main className="w-full max-w-md flex-1 flex flex-col items-center mt-6">
        {/* 卡片預覽 */}
        <div className="relative w-full aspect-[9/16] max-h-[560px] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-zinc-950 flex flex-col justify-between p-6">
          {params.imageUrl ? (
            <img
              src={params.imageUrl}
              alt="聲音視覺化卡片"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : posterBlobUrl ? (
            <img
              src={posterBlobUrl}
              alt="聲音視覺化卡片"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 font-mono text-xs">
              正在載入聲音視覺卡片...
            </div>
          )}

          {/* 懸浮裝飾標籤 */}
          <div className="relative z-10 flex items-center justify-between">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-sm text-black font-bold uppercase tracking-widest"
              style={{ backgroundColor: scenario.accentColor }}
            >
              ACOUSTIC CERTIFICATE
            </span>
            <span className="text-[11px] font-mono text-white/70 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded">
              {params.code}
            </span>
          </div>
        </div>

        {/* 核心成績摘要面板 */}
        <section className="w-full mt-6 p-4 rounded-xl bg-zinc-900/80 border border-white/10 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5" style={{ color: scenario.accentColor }} />
              <span className="text-xs font-mono text-zinc-300">總體模仿相似度</span>
            </div>
            <div className="text-right">
              <span
                className="text-2xl font-black font-mono"
                style={{ color: scenario.accentColor }}
              >
                {params.score}
              </span>
              <span className="text-xs text-zinc-400 font-mono ml-1">/ 100</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3">
            <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
              <p className="text-[10px] text-zinc-400 font-mono">重現台詞</p>
              <p className="text-xs font-bold text-white mt-1 truncate">「{params.line}」</p>
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
              <p className="text-[10px] text-zinc-400 font-mono">情緒稱號</p>
              <p className="text-xs font-bold text-zinc-200 mt-1 truncate">{params.title}</p>
            </div>
          </div>
        </section>

        {/* 互動按鈕群 */}
        <div className="w-full flex flex-col gap-3 mt-6">
          <button
            onClick={handleDownload}
            disabled={generatingPoster}
            className="w-full py-3.5 px-4 rounded-xl font-bold font-mono text-sm tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
            style={{
              backgroundColor: scenario.accentColor,
              color: '#000000',
            }}
          >
            <Download className="w-4 h-4" />
            {generatingPoster ? '正在產生高清海報...' : '儲存高清視覺海報 (9:16)'}
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full py-3 px-4 rounded-xl font-mono text-xs tracking-wider flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white transition-all cursor-pointer active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">連結已複製至剪貼簿！</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>複製專屬分享連結</span>
              </>
            )}
          </button>

          <a
            href="/"
            className="w-full py-2.5 px-4 text-center font-mono text-xs text-zinc-400 hover:text-white transition-colors"
          >
            ← 返回展場首頁 重新體驗
          </a>
        </div>
      </main>

      {/* 底部宣告 */}
      <footer className="w-full max-w-md pt-8 text-center text-[10px] text-zinc-600 font-mono">
        SEE HOW YOU SPEAK // KINETIC TYPOGRAPHY INSTALLATION
      </footer>
    </div>
  );
};
