import React, { useEffect, useRef } from 'react';
import type { AudioMetrics } from '../types/speak';

interface KineticTypographyProps {
  text: string;
  audioMetrics: AudioMetrics;
  noiseFloor: number;
  themeColor?: string;
  accentColor?: string;
}

/**
 * 數學 Sigmoid 飽和箝位函數 (A/B 13 方案 B)
 * 保證字重在 [100, 900] 安全區間，大吼極限加粗但不破面
 */
function mapVolumeToWeight(vol: number, noiseFloor: number): number {
  const volEff = Math.max(0, vol - noiseFloor);
  const sigmoid = 1 / (1 + Math.exp(-(volEff - 26) / 10));
  const weight = Math.round(100 + sigmoid * 800);
  return Math.max(100, Math.min(900, weight));
}

export const KineticTypography: React.FC<KineticTypographyProps> = ({
  text,
  audioMetrics,
  noiseFloor,
  themeColor = '#FF0055',
  accentColor = '#00F0FF',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);

  // 將文字拆分為字元陣列 (逐音節分頻變形)
  const chars = Array.from(text);

  // 60fps 透過 Direct CSS Variables 驅動，0 次 React Re-render
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

    const weight = mapVolumeToWeight(smoothVolume, noiseFloor);

    // 1. 拉長音橫向延展 (A/B 15 方案 B：100% -> 150%)
    const widthPercent = 100 + Math.min(50, Math.round(sustainedDuration * 35));
    const letterSpacingPx = Math.min(10, Math.round(sustainedDuration * 7));

    // 2. 父容器注入通用 CSS 變數
    container.style.setProperty('--v-weight', `${weight}`);
    container.style.setProperty('--v-width', `${widthPercent}%`);
    container.style.setProperty('--v-y-offset', `${pitchYOffset}px`);
    container.style.setProperty('--v-letter-spacing', `${letterSpacingPx}px`);
    container.style.letterSpacing = `${letterSpacingPx}px`;

    // 3. 爆發態色差光暈 (Chromatic Aberration)
    const isBurst = smoothVolume > 70;
    const glowColor = isBurst ? themeColor : accentColor;
    const glowSpread = Math.min(28, Math.round(smoothVolume * 0.3));

    if (isVoiceActive) {
      container.style.textShadow = isBurst
        ? `-2px 0 10px rgba(255,0,85,0.8), 2px 0 10px rgba(0,240,255,0.8), 0 0 ${glowSpread}px ${glowColor}`
        : `0 0 ${glowSpread}px ${glowColor}`;
    } else {
      container.style.textShadow = 'none';
    }

    // 4. 逐字波浪起伏與短音/長音幾何變形 (A/B 14, 16, 17, 18 方案 B)
    const widthScale = widthPercent / 100;
    const count = Math.max(1, chars.length);

    charsRef.current.forEach((el, idx) => {
      if (!el) return;

      // 語調波浪：結合基頻 Y 軸浮動 + 音節正弦傳播
      const charPhase = (idx / count) * Math.PI * 2;
      const waveAmp = isVoiceActive ? (smoothVolume / 100) * 8 : 0;
      const waveDisplacement = Math.sin(charPhase + pitchNormalized * 4) * waveAmp;
      const totalY = isVoiceActive ? pitchYOffset + waveDisplacement : 0;

      // 垂直縮放 (短音俐落短小 vs 大聲膨脹)
      const scaleY = isStaccato
        ? 0.94
        : isVoiceActive
        ? 1 + (smoothVolume / 450)
        : 1;

      el.style.transform = `translateY(${totalY.toFixed(1)}px) scaleX(${widthScale.toFixed(2)}) scaleY(${scaleY.toFixed(2)})`;
      el.style.fontWeight = `${weight}`;
      el.style.fontStretch = `${widthPercent}%`;
    });
  }, [audioMetrics, noiseFloor, themeColor, accentColor, chars.length]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-4 p-6 text-center select-none transition-colors duration-150"
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
            className="kinetic-char inline-block transition-transform duration-75 text-3xl sm:text-5xl md:text-6xl text-white font-black"
            style={{
              willChange: 'font-weight, font-stretch, transform',
              display: isSpace ? 'inline' : 'inline-block',
              minWidth: isSpace ? '0.5em' : 'auto',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};
