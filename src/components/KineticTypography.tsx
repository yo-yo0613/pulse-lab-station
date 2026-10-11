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
 * 數學 Sigmoid 飽和箝位函數
 * 避免大吼吹氣音量爆表破版，保證在 [100, 900] 安全區間
 */
function mapVolumeToWeight(vol: number, noiseFloor: number): number {
  const volEff = Math.max(0, vol - noiseFloor);
  const sigmoid = 1 / (1 + Math.exp(-(volEff - 28) / 11));
  const weight = Math.round(100 + sigmoid * 800);
  return Math.max(100, Math.min(900, weight));
}

function mapPitchToStretch(pitchNorm: number): number {
  // 75% ~ 125%
  const stretch = Math.round(75 + pitchNorm * 50);
  return Math.max(75, Math.min(125, stretch));
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

    const { smoothVolume, pitchNormalized, isVoiceActive } = audioMetrics;
    const weight = mapVolumeToWeight(smoothVolume, noiseFloor);
    const stretch = mapPitchToStretch(pitchNormalized);

    // 1. 父容器注入通用 CSS 變數
    container.style.setProperty('--v-weight', `${weight}`);
    container.style.setProperty('--v-width', `${stretch}%`);

    // 2. 爆發態色差光暈 (Chromatic Aberration)
    const isBurst = smoothVolume > 70;
    const glowColor = isBurst ? themeColor : accentColor;
    const glowSpread = Math.min(25, Math.round(smoothVolume * 0.28));

    if (isVoiceActive) {
      container.style.textShadow = isBurst
        ? `-2px 0 8px rgba(255,0,85,0.7), 2px 0 8px rgba(0,240,255,0.7), 0 0 ${glowSpread}px ${glowColor}`
        : `0 0 ${glowSpread}px ${glowColor}`;
    } else {
      container.style.textShadow = 'none';
    }

    // 3. 逐字分頻偏移 (微觀音節跳動感)
    charsRef.current.forEach((el, idx) => {
      if (!el) return;
      // 根據音節索引引入微小的波浪時差
      const phase = (idx / Math.max(1, chars.length)) * Math.PI;
      const charScale = isVoiceActive
        ? 1 + Math.sin(phase) * (smoothVolume / 350)
        : 1;

      el.style.transform = `scale(${charScale.toFixed(3)})`;
      el.style.fontStretch = `${stretch}%`;
      el.style.fontWeight = `${weight}`;
    });
  }, [audioMetrics, noiseFloor, themeColor, accentColor, chars.length]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-1.5 gap-y-3 p-6 text-center select-none transition-colors duration-150"
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
            className="kinetic-char tracking-wider inline-block transition-transform duration-75 text-3xl sm:text-5xl md:text-6xl text-white font-black"
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
