import React, { useEffect, useRef } from 'react';
import type { AudioMetrics } from '../types/speak';

interface KineticTypographyProps {
  text: string;
  audioMetrics: AudioMetrics;
  noiseFloor: number;
  themeColor?: string;
  accentColor?: string;
  variant?: 'hero' | 'preview' | 'card';
}

/**
 * 數學 Sigmoid 飽和箝位函數 (A/B 13 方案 B & A/B 66 待機中黑至爆發特黑)
 * 卡片與預覽模式待機以 500 (Medium) 為基準，大吼極限加粗至 900 (Heavy)
 */
function mapVolumeToWeight(vol: number, noiseFloor: number, variant: 'hero' | 'preview' | 'card' = 'hero'): number {
  const volEff = Math.max(0, vol - noiseFloor * 0.7);
  const sigmoid = 1 / (1 + Math.exp(-(volEff - 24) / 10));
  const baseWeight = variant === 'card' ? 500 : 400;
  const dynamicWeight = Math.round(baseWeight + sigmoid * (900 - baseWeight));
  return Math.max(baseWeight, Math.min(900, dynamicWeight));
}

export const KineticTypography: React.FC<KineticTypographyProps> = ({
  text,
  audioMetrics,
  noiseFloor,
  themeColor = '#FF0055',
  accentColor = '#00F0FF',
  variant = 'hero',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);

  // 將文字拆分為字元陣列 (逐字元 GPU 幾何延展)
  const chars = Array.from(text);

  // 60fps 透過 Direct CSS & GPU Transforms 驅動，0 次 React Re-render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const {
      smoothVolume,
      pitchNormalized,
      pitchYOffset,
      sustainedDuration,
      isStaccato,
      isVoiceActive,
    } = audioMetrics;

    const weight = mapVolumeToWeight(smoothVolume, noiseFloor, variant);

    // 1. 繁體中文字元 GPU scaleX 極限橫向拉長 (A/B 43 方案 B / Defense 7.54 卡片約束變換矩陣)
    // card 模式上限 1.35x, preview 模式上限 1.70x, hero 模式上限 2.35x
    const maxSustain = variant === 'card' ? 0.35 : variant === 'preview' ? 0.70 : 1.35;
    const sustainedWidth = isStaccato
      ? 0.75
      : 1.0 + Math.min(maxSustain, sustainedDuration * 0.95);
    const widthPercent = Math.round(sustainedWidth * 100);

    // 2. 彈性字距間隙補償 (A/B 47 & A/B 65: 中文緊湊原生字隙，僅在聲音爆發時向外微幅延展)
    const maxSpacing = variant === 'card' ? 6 : variant === 'preview' ? 10 : 18;
    const spacingMultiplier = variant === 'card' ? 4 : variant === 'preview' ? 8 : 12;
    const letterSpacingPx = isStaccato
      ? -1
      : Math.min(maxSpacing, Math.round(sustainedDuration * spacingMultiplier));

    // 3. 全螢幕音量物理炸裂縮放 (A/B 44: Hero 0.75x ~ 2.8x; Preview 0.85x ~ 1.45x; Card 0.95x ~ 1.25x)
    let containerScale = 1.0;
    if (isVoiceActive) {
      if (variant === 'card') {
        // 卡片微型環境專用約束變換矩陣 (Card Scale Clamp Matrix, Defense 7.54)
        containerScale = smoothVolume > 60
          ? 1.12 + ((smoothVolume - 60) / 40) * 0.15 // 1.12x ~ 1.27x
          : smoothVolume > 15
          ? 0.98 + ((smoothVolume - 15) / 45) * 0.14 // 0.98x ~ 1.12x
          : 0.95 + (smoothVolume / 15) * 0.03;      // 0.95x ~ 0.98x
      } else if (variant === 'preview') {
        containerScale = smoothVolume > 65
          ? 1.25 + ((smoothVolume - 65) / 35) * 0.20 // 1.25x ~ 1.45x
          : smoothVolume > 20
          ? 0.95 + ((smoothVolume - 20) / 45) * 0.30 // 0.95x ~ 1.25x
          : 0.85 + (smoothVolume / 20) * 0.10;
      } else {
        // Hero 全螢幕舞台 (A/B 44: 0.75x ~ 2.8x)
        containerScale = smoothVolume > 65
          ? 1.7 + ((smoothVolume - 65) / 35) * 1.1
          : smoothVolume > 20
          ? 1.0 + ((smoothVolume - 20) / 45) * 0.7
          : 0.75 + (smoothVolume / 20) * 0.25;
      }
    }

    // 4. 父容器注入通用 CSS 變數與物理縮放
    container.style.setProperty('--v-weight', `${weight}`);
    container.style.setProperty('--v-width', `${widthPercent}%`);
    container.style.setProperty('--v-y-offset', `${pitchYOffset}px`);
    container.style.setProperty('--v-letter-spacing', `${letterSpacingPx}px`);
    container.style.letterSpacing = `${letterSpacingPx}px`;
    container.style.transform = `scale(${containerScale.toFixed(2)})`;
    container.style.transformOrigin = 'center center';

    // 5. 爆發態色差光暈 (Chromatic Aberration)
    const isBurst = smoothVolume > 60;
    const glowColor = isBurst ? themeColor : accentColor;
    const glowSpread = Math.min(variant === 'card' ? 14 : 32, Math.round(smoothVolume * 0.35));

    if (isVoiceActive) {
      container.style.textShadow = isBurst
        ? `-3px 0 12px rgba(255,0,85,0.85), 3px 0 12px rgba(0,240,255,0.85), 0 0 ${glowSpread}px ${glowColor}`
        : `0 0 ${glowSpread}px ${glowColor}`;
    } else {
      container.style.textShadow = 'none';
    }

    // 6. 逐字元 GPU 幾何變形 (A/B 43 / 7.37 核心：scaleX 實體拉伸中文字元)
    const count = Math.max(1, chars.length);

    charsRef.current.forEach((el, idx) => {
      if (!el) return;

      // 語調波浪：結合基頻 Y 軸浮動 + 音節正弦傳播
      const charPhase = (idx / count) * Math.PI * 2;
      const waveAmp = isVoiceActive ? (smoothVolume / 100) * (variant === 'card' ? 4 : 10) : 0;
      const waveDisplacement = Math.sin(charPhase + pitchNormalized * 4) * waveAmp;
      const totalY = isVoiceActive ? pitchYOffset + waveDisplacement : 0;

      // 垂直縮放 (短促咬字縱向高挑 vs 大聲膨脹)
      const scaleY = isStaccato
        ? (variant === 'card' ? 1.15 : 1.35)
        : isVoiceActive
        ? 1.0 + (smoothVolume / (variant === 'card' ? 300 : 200))
        : 1.0;

      // 直接向 DOM 節點硬體加速變形寫入 (A/B 43 100% 繁中字型相容)
      el.style.display = 'inline-block';
      el.style.transformOrigin = 'center center';
      el.style.transform = `translateY(${totalY.toFixed(1)}px) scaleX(${sustainedWidth.toFixed(2)}) scaleY(${scaleY.toFixed(2)})`;
      el.style.fontWeight = `${weight}`;
      el.style.letterSpacing = `${letterSpacingPx}px`;
    });
  }, [audioMetrics, noiseFloor, themeColor, accentColor, chars.length, variant]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full mx-auto flex flex-wrap items-center justify-center select-none transform-gpu will-change-transform ${
        variant === 'card'
          ? 'max-w-xs gap-x-0 gap-y-1 p-1 sm:p-2'
          : variant === 'preview'
          ? 'max-w-2xl gap-x-0.5 gap-y-2 p-2 sm:p-3'
          : 'max-w-4xl gap-x-1 gap-y-4 p-6'
      }`}
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {chars.map((char, index) => {
        const isSpace = char === ' ' || char === '　';
        return (
          <span
            key={index}
            ref={(el) => {
              charsRef.current[index] = el;
            }}
            className={`kinetic-char inline-block font-black transform-gpu ${
              variant === 'card'
                ? 'text-base sm:text-lg md:text-xl'
                : variant === 'preview'
                ? 'text-xl sm:text-3xl md:text-4xl'
                : 'text-3xl sm:text-5xl md:text-6xl'
            } text-white`}
            style={{
              willChange: 'transform, font-weight, letter-spacing',
              display: isSpace ? 'inline' : 'inline-block',
              transformOrigin: 'center center',
              minWidth: isSpace ? '0.4em' : 'auto',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};
