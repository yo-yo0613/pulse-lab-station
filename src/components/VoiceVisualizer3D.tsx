import React, { useEffect, useRef } from 'react';
import type { AudioMetrics, SpeakState } from '../types/speak';

interface VoiceVisualizer3DProps {
  audioMetrics: AudioMetrics;
  themeColor?: string;
  accentColor?: string;
  aestheticMode?: 'figma-monochrome' | 'cyber';
  stage?: SpeakState;
  scoreValue?: number;
  resultSubStage?: number; // 0: % Surge, 1: TAKE a LOOK, 2: QR + flow back~
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

export const VoiceVisualizer3D: React.FC<VoiceVisualizer3DProps> = ({
  audioMetrics,
  themeColor = '#FF0055',
  accentColor = '#00F0FF',
  aestheticMode = 'figma-monochrome',
  stage = 'LANDING',
  scoreValue = 67,
  resultSubStage = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef<AudioMetrics>(audioMetrics);
  const stateRef = useRef({ stage, scoreValue, resultSubStage, aestheticMode });

  useEffect(() => {
    metricsRef.current = audioMetrics;
  }, [audioMetrics]);

  useEffect(() => {
    stateRef.current = { stage, scoreValue, resultSubStage, aestheticMode };
  }, [stage, scoreValue, resultSubStage, aestheticMode]);

  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef<number>(0);
  const waveRiseRef = useRef<number>(0);
  const smoothVolVisualRef = useRef<number>(0);
  const smoothPitchVisualRef = useRef<number>(0.3);

  // 當切換到結算舞台時重置海浪湧升動畫進度 (0 -> 1)
  useEffect(() => {
    if (stage === 'SCORE_ANALYSIS') {
      waveRiseRef.current = 0;
    }
  }, [stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.parentElement?.clientHeight || window.innerHeight;

    const resize = () => {
      if (!canvas.parentElement) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement.clientWidth || window.innerWidth;
      height = canvas.parentElement.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    // 初始化粒子 (單色微粒 / 賽博粒子共用池)
    const NUM_PARTICLES = 90;
    particlesRef.current = Array.from({ length: NUM_PARTICLES }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.9,
      vy: (Math.random() - 0.5) * 0.9,
      radius: Math.random() * 1.8 + 0.8,
      alpha: Math.random() * 0.45 + 0.15,
      color: Math.random() > 0.5 ? themeColor : accentColor,
    }));

    const drawFigmaLooperSphere = (
      cx: number,
      cy: number,
      baseRadius: number,
      volNorm: number,
      pitchNorm: number,
      jitter: number,
      hnrDb: number,
      phase: number,
      alphaScale: number
    ) => {
      const RING_COUNT = 68;
      // 透過 HNR 調整線條清亮/柔和程度
      const baseAlpha = Math.max(0.05, Math.min(0.16, 0.08 + volNorm * 0.05)) * alphaScale;
      const blurSoftness = hnrDb < 14 ? Math.max(0.7, 1 - (14 - hnrDb) * 0.03) : 1.0;

      ctx.save();
      ctx.lineWidth = 0.85 + volNorm * 0.4;

      for (let i = 0; i < RING_COUNT; i++) {
        const t = i / RING_COUNT;
        const rotAngle =
          t * Math.PI * 1.15 +
          phase * 0.22 +
          (pitchNorm - 0.5) * 0.55 +
          Math.sin(phase * 0.4 + t * Math.PI * 2) * 0.18;

        // Figma Looper signature 雙新月偏心旋轉橢圓幾何
        const eccShift = Math.sin(t * Math.PI * 2 + phase * 0.35) * (baseRadius * (0.09 + volNorm * 0.05));
        const offsetX = Math.cos(rotAngle * 1.4) * eccShift;
        const offsetY = Math.sin(rotAngle * 1.1) * eccShift;

        const rx = baseRadius * (0.76 + 0.28 * Math.sin(t * Math.PI) + volNorm * 0.11);
        const ry = baseRadius * (0.72 + 0.31 * Math.cos(t * Math.PI * 0.85) + volNorm * 0.09);
        const jitterWarp = jitter > 2.2 ? Math.sin(phase * 14 + i * 0.7) * Math.min(4.5, (jitter - 2.2) * 1.1) : 0;

        ctx.strokeStyle = `rgba(18, 18, 18, ${(baseAlpha * (0.65 + 0.5 * Math.sin(t * Math.PI)) * blurSoftness).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          cx + offsetX + jitterWarp * 0.3,
          cy + offsetY,
          Math.max(12, rx + jitterWarp),
          Math.max(12, ry - jitterWarp * 0.5),
          rotAngle,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawHorizontalAcousticWaves = (
      yCenter: number,
      strands: number,
      volNorm: number,
      pitchNorm: number,
      waveform: Float32Array,
      phase: number,
      amplitudePx: number
    ) => {
      ctx.save();
      const STEPS = 110;
      const wfLen = waveform?.length || 0;

      for (let s = 0; s < strands; s++) {
        const strandRatio = strands === 1 ? 0 : s / (strands - 1) - 0.5;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(20, 20, 20, ${(0.58 - s * 0.12).toFixed(2)})`;
        ctx.lineWidth = s === 0 ? 1.25 : 0.9;

        for (let i = 0; i <= STEPS; i++) {
          const xNorm = i / STEPS;
          const x = xNorm * width;

          const wfIdx = wfLen > 0 ? Math.floor(xNorm * (wfLen - 1)) : 0;
          const rawSample = wfLen > 0 ? waveform[wfIdx] || 0 : 0;

          // 中段與全域緩波 + 即時麥克風時域波形疊加
          const carrier1 = Math.sin(xNorm * Math.PI * (2.6 + pitchNorm * 1.4) + phase * (1.2 + s * 0.35) + s * 1.7);
          const carrier2 = Math.cos(xNorm * Math.PI * 5.2 - phase * 0.8 + s * 2.1);
          const idleSway = (carrier1 * 0.7 + carrier2 * 0.3) * (amplitudePx * (0.35 + volNorm * 1.45));
          const voiceSpike = rawSample * (amplitudePx * 2.8 * (0.2 + volNorm));

          const y = yCenter + strandRatio * 8 + idleSway + voiceSpike;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawRisingLiquidWave = (
      scorePct: number,
      riseProgress: number,
      volNorm: number,
      phase: number
    ) => {
      // 依據分數分級計算海浪湧升目標高度與波動張力 (0-59%, 60-84%, 85-100%)
      let targetRatioFromBottom = 0.42;
      let waveAmp = 28;
      let waveFreq = 1.15;

      if (scorePct >= 85) {
        targetRatioFromBottom = 0.68;
        waveAmp = 54;
        waveFreq = 1.65;
      } else if (scorePct >= 60) {
        targetRatioFromBottom = 0.57;
        waveAmp = 42;
        waveFreq = 1.3;
      } else {
        targetRatioFromBottom = 0.41;
        waveAmp = 26;
        waveFreq = 0.95;
      }

      // Smoothstep easing 湧升插值
      const ease = 1 - Math.pow(1 - riseProgress, 3);
      const baseSurfaceY = height - height * targetRatioFromBottom * ease;

      ctx.save();
      const STEPS = 96;

      // 主液態浪體 (matching Figma Vector 23:26969 + Rectangle 12 23:26970)
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i <= STEPS; i++) {
        const xNorm = i / STEPS;
        const x = xNorm * width;
        const primary =
          Math.sin(xNorm * Math.PI * 1.8 * waveFreq + phase * 0.75 + 0.6) * waveAmp +
          Math.cos(xNorm * Math.PI * 3.1 - phase * 0.5) * (waveAmp * 0.35);
        const micro = Math.sin(xNorm * Math.PI * 7 + phase * 1.4) * (3 + volNorm * 10);
        const y = baseSurfaceY + primary + micro;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();

      const waveGrad = ctx.createLinearGradient(0, baseSurfaceY - waveAmp, 0, height);
      waveGrad.addColorStop(0, 'rgba(65, 65, 65, 0.56)');
      waveGrad.addColorStop(0.28, 'rgba(135, 135, 135, 0.34)');
      waveGrad.addColorStop(0.65, 'rgba(185, 185, 185, 0.42)');
      waveGrad.addColorStop(1, 'rgba(115, 115, 115, 0.72)');
      ctx.fillStyle = waveGrad;
      ctx.fill();

      // 浪尖細緻高光描邊
      ctx.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const xNorm = i / STEPS;
        const x = xNorm * width;
        const primary =
          Math.sin(xNorm * Math.PI * 1.8 * waveFreq + phase * 0.75 + 0.6) * waveAmp +
          Math.cos(xNorm * Math.PI * 3.1 - phase * 0.5) * (waveAmp * 0.35);
        const micro = Math.sin(xNorm * Math.PI * 7 + phase * 1.4) * (3 + volNorm * 10);
        const y = baseSurfaceY + primary + micro;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 底部雙重正弦聲波細線 (Figma id="23:26971" / "23:26972" at bottom 11%)
      drawHorizontalAcousticWaves(height * 0.89, 2, Math.max(0.22, volNorm), 0.5, metricsRef.current.waveform, phase * 1.15, 18);

      ctx.restore();
    };

    const render = () => {
      animId = requestAnimationFrame(render);
      const metrics = metricsRef.current;
      const { stage: curStage, scoreValue: curScore, aestheticMode: mode } = stateRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // 視覺平滑阻尼追蹤麥克風輸入 (保證 0% 待機仍有呼吸，開口立刻爆發反饋)
      smoothVolVisualRef.current += (metrics.smoothVolume - smoothVolVisualRef.current) * 0.16;
      smoothPitchVisualRef.current += (metrics.pitchNormalized - smoothPitchVisualRef.current) * 0.14;

      const volNorm = Math.min(1, smoothVolVisualRef.current / 100);
      const pitchNorm = smoothPitchVisualRef.current;
      const jitter = metrics.jitter ?? 0;
      const hnrDb = metrics.hnrDb ?? 18;

      phaseRef.current += 0.016 + volNorm * 0.045;
      waveRiseRef.current = Math.min(1, waveRiseRef.current + 0.022);

      if (mode === 'cyber') {
        // 保留既有賽博深黑粒子核模式作為兼容選項
        const centerX = width / 2;
        const centerY = height / 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const baseRadius = Math.min(width, height) * 0.18;
        const expandRadius = baseRadius + volNorm * (baseRadius * 0.9);
        const radialGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.2, centerX, centerY, expandRadius * 1.8);
        radialGrad.addColorStop(0, themeColor);
        radialGrad.addColorStop(0.45, accentColor);
        radialGrad.addColorStop(1, 'rgba(10, 10, 10, 0)');
        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        for (let i = 0; i <= 36; i++) {
          const angle = (i / 36) * Math.PI * 2;
          const wave = Math.sin(angle * 5 + phaseRef.current) * (smoothVolVisualRef.current * 0.22);
          const pitchWobble = Math.cos(angle * 3 - phaseRef.current * 1.5) * (pitchNorm * 18);
          const r = expandRadius + wave + pitchWobble;
          const px = centerX + Math.cos(angle) * r;
          const py = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }

      // ================================================================
      // FIGMA 極簡黑白流體粒子與幾何線框球美學 (Slide 16:9 - 1 ~ 6 全程貫穿)
      // ================================================================

      // 1. 白底至底部柔和灰階空間漸層 (Figma Rectangle 1/12)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(0.7, '#FFFFFF');
      bgGrad.addColorStop(0.88, '#E4E4E4');
      bgGrad.addColorStop(1, '#9E9E9E');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY =
        curStage === 'LANDING'
          ? height * 0.455
          : curStage === 'PROMPT_VIDEO'
          ? height * 0.46
          : curStage === 'SCORE_ANALYSIS'
          ? height * 0.48
          : height * 0.48;

      const sphereBaseRadius = Math.min(width, height) * (curStage === 'SCORE_ANALYSIS' ? 0.305 : 0.325);

      // 2. 選曲封面流 (Slide 2) 中央暗色柔霧球體暈影 (Figma id="12:8598")
      if (curStage === 'PROMPT_VIDEO') {
        const auraR = Math.min(width, height) * 0.43;
        const auraGrad = ctx.createRadialGradient(centerX, centerY, auraR * 0.15, centerX, centerY, auraR);
        auraGrad.addColorStop(0, 'rgba(30, 30, 30, 0.62)');
        auraGrad.addColorStop(0.58, 'rgba(60, 60, 60, 0.25)');
        auraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, auraR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. 結算海浪階段 (Slides 4, 5, 6)：在線框球後方或交融繪製湧升液態浪體
      if (curStage === 'SCORE_ANALYSIS') {
        drawRisingLiquidWave(curScore, waveRiseRef.current, volNorm, phaseRef.current);
      }

      // 4. Figma LooperGroup 3D 線框幾何球體 (全程隨麥克風呼吸與形變)
      const sphereAlpha = curStage === 'PROMPT_VIDEO' ? 0.55 : 1.0;
      drawFigmaLooperSphere(
        centerX,
        centerY,
        sphereBaseRadius,
        volNorm,
        pitchNorm,
        jitter,
        hnrDb,
        phaseRef.current,
        sphereAlpha
      );

      // 5. 中央貫穿聲學波紋線
      if (curStage === 'LANDING') {
        drawHorizontalAcousticWaves(height * 0.485, 2, volNorm, pitchNorm, metrics.waveform, phaseRef.current, 9);
      } else if (curStage === 'RECORDING') {
        drawHorizontalAcousticWaves(height * 0.5, 3, Math.max(0.12, volNorm), pitchNorm, metrics.waveform, phaseRef.current * 1.4, 24);
      }

      // 6. 細微單色漂浮聲學塵埃粒子
      const particles = particlesRef.current;
      const speedMult = 0.6 + volNorm * 2.8;
      ctx.save();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * speedMult;
        p.y += p.vy * speedMult;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = `rgba(30, 30, 30, ${(p.alpha * (0.28 + volNorm * 0.55)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (0.9 + volNorm * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [themeColor, accentColor]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
