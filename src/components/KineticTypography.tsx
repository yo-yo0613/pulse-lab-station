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
  const volEff = Math.max(0, vol - noiseFloor * 0.7);
  const sigmoid = 1 / (1 + Math.exp(-(volEff - 24) / 10));
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

    const weight = mapVolumeToWeight(smoothVolume, noiseFloor);

    // 1. 繁體中文字元 GPU scaleX 極限橫向拉長 (A/B 43 方案 B: 突破中文字體無 wdth 軸缺陷)
    // 持音時 scaleX 狂暴延展至 2.35x；短音時 scaleX 緊縮至 0.75x
    const sustainedWidth = isStaccato
      ? 0.75
      : 1.0 + Math.min(1.35, sustainedDuration * 0.95);
    const widthPercent = Math.round(sustainedWidth * 100);

    // 2. 彈性字距間隙補償 (A/B 47: 防文字橫向重疊打架)
    const letterSpacingPx = isStaccato
      ? -2
      : Math.min(18, Math.round(sustainedDuration * 12));

    // 3. 全螢幕音量物理炸裂縮放 (A/B 44: 0.75x ~ 2.8x 三段式指數級震撼擴張)
    const containerScale = isVoiceActive
      ? smoothVolume > 65
        ? 1.7 + ((smoothVolume - 65) / 35) * 1.1 // 大聲嘶吼爆發區間: 1.7x ~ 2.8x 全螢幕炸裂
        : smoothVolume > 20
        ? 1.0 + ((smoothVolume - 20) / 45) * 0.7 // 正常說話區間: 1.0x ~ 1.7x
        : 0.75 + (smoothVolume / 20) * 0.25     // 輕聲細語微縮區間: 0.75x ~ 1.0x
      : 1.0;

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
    const glowSpread = Math.min(32, Math.round(smoothVolume * 0.35));

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
      const waveAmp = isVoiceActive ? (smoothVolume / 100) * 10 : 0;
      const waveDisplacement = Math.sin(charPhase + pitchNormalized * 4) * waveAmp;
      const totalY = isVoiceActive ? pitchYOffset + waveDisplacement : 0;

      // 垂直縮放 (短促咬字縱向高挑 1.35x vs 大聲膨脹 1.0 ~ 1.5x)
      const scaleY = isStaccato
        ? 1.35
        : isVoiceActive
        ? 1.0 + (smoothVolume / 200)
        : 1.0;

      // 直接向 DOM 節點硬體加速變形寫入 (A/B 43 100% 繁中字型相容)
      el.style.display = 'inline-block';
      el.style.transformOrigin = 'center center';
      el.style.transform = `translateY(${totalY.toFixed(1)}px) scaleX(${sustainedWidth.toFixed(2)}) scaleY(${scaleY.toFixed(2)})`;
      el.style.fontWeight = `${weight}`;
      el.style.letterSpacing = `${letterSpacingPx}px`;
    });
  }, [audioMetrics, noiseFloor, themeColor, accentColor, chars.length]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-4 p-6 text-center select-none transform-gpu will-change-transform transition-transform duration-75 ease-out"
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
            className="kinetic-char inline-block text-3xl sm:text-5xl md:text-6xl text-white font-black transform-gpu"
            style={{
              willChange: 'transform, font-weight, letter-spacing',
              display: isSpace ? 'inline' : 'inline-block',
              transformOrigin: 'center center',
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
