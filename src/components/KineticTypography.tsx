import React, { useEffect, useRef, useMemo } from 'react';
import type { AudioMetrics } from '../types/speak';

export interface KineticTypographyProps {
  text: string;
  audioMetrics: AudioMetrics;
  noiseFloor: number;
  themeColor?: string;
  accentColor?: string;
  variant?: 'hero' | 'preview' | 'card';
  volumeSlice?: Float32Array;
  pitchSlice?: Float32Array;
  playbackProgress?: number;
  isPlaying?: boolean;
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

interface CharAcousticProfile {
  char: string;
  weight: number;
  scaleX: number;
  scaleY: number;
  yOffset: number;
  fontSizeRatio: number;
  isBurst: boolean;
  vol: number;
}

export const KineticTypography: React.FC<KineticTypographyProps> = ({
  text,
  audioMetrics,
  noiseFloor,
  themeColor = '#FF0055',
  accentColor = '#00F0FF',
  variant = 'hero',
  volumeSlice,
  pitchSlice,
  playbackProgress = 0,
  isPlaying = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);

  // 將文字拆分為字元陣列 (逐字元 GPU 幾何延展)
  const chars = useMemo(() => Array.from(text), [text]);

  // 逐字元聲學幾何靜態印記 (A/B 48 空間映射：靜態即海報)
  const charProfiles = useMemo<CharAcousticProfile[]>(() => {
    const N = chars.length;
    if (!volumeSlice || volumeSlice.length === 0) {
      return chars.map((char) => ({
        char,
        weight: variant === 'card' ? 600 : 500,
        scaleX: 1.0,
        scaleY: 1.0,
        yOffset: 0,
        fontSizeRatio: 1.0,
        isBurst: false,
        vol: 0,
      }));
    }

    // 計算錄音最大峰值以實施 AGC 自動動態範圍擴展
    let peak = 1;
    const vLen = volumeSlice.length;
    for (let i = 0; i < vLen; i++) {
      if (volumeSlice[i] > peak) peak = volumeSlice[i];
    }
    const gain = peak < 45 ? Math.min(4.5, 75 / Math.max(8, peak)) : 1.0;

    return chars.map((char, i) => {
      const isPunc = ['「', '」', '，', '。', '！', '？', '…', '～', ' '].includes(char);
      const progress = N > 1 ? i / (N - 1) : 0;
      const vIdx = Math.min(vLen - 1, Math.floor(progress * vLen));
      const rawVol = volumeSlice[vIdx] || 0;
      const vol = Math.min(100, Math.round(rawVol * gain));
      const pVal = pitchSlice && pitchSlice.length > 0 ? (pitchSlice[vIdx] || 0.5) : 0.5;

      // 1. 標點符號若為拉長音符或感嘆號，繼承前字大吼能量
      if (isPunc) {
        if (char === '～' || char === '！' || char === '？') {
          return {
            char,
            weight: 800,
            scaleX: Math.min(1.35, 1.1 + (vol / 100) * 0.25),
            scaleY: 1.08,
            yOffset: 0,
            fontSizeRatio: 1.08,
            isBurst: vol > 45,
            vol,
          };
        }
        return {
          char,
          weight: 600,
          scaleX: 1.0,
          scaleY: 1.0,
          yOffset: 0,
          fontSizeRatio: 1.0,
          isBurst: false,
          vol,
        };
      }

      // 2. 音量對應字級與字重 (大聲加粗至 900 特黑，小聲 500 輕黑)
      let fontSizeRatio = 1.0;
      let weight = 500;
      let isBurst = false;

      if (vol > 55) {
        fontSizeRatio = 1.10 + ((vol - 55) / 45) * 0.12; // 1.10x ~ 1.22x
        weight = 900;
        isBurst = true;
      } else if (vol > 25) {
        fontSizeRatio = 0.98 + ((vol - 25) / 30) * 0.12; // 0.98x ~ 1.10x
        weight = 700;
      } else {
        fontSizeRatio = Math.max(0.90, 0.90 + (vol / 25) * 0.08); // 0.90x ~ 0.98x
        weight = 500;
      }

      // 3. 拉長音幾何延展 (尾音或高音量處 scaleX 1.15 ~ 1.35x 橫向拉長)
      let scaleX = 1.0;
      if (vol > 40 && (i >= N - 5 || vol > 55)) {
        scaleX = Math.min(1.35, 1.05 + (vol / 100) * 0.35);
      }

      // 4. 音高微幅浮動 (-10px ~ +10px)
      const yOffset = Math.round((pVal - 0.5) * -16);

      return {
        char,
        weight,
        scaleX,
        scaleY: isBurst ? 1.10 : 1.0,
        yOffset,
        fontSizeRatio,
        isBurst,
        vol,
      };
    });
  }, [chars, volumeSlice, pitchSlice, variant]);

  // 60fps 透過 Direct CSS & GPU Transforms 驅動，0 次 React Re-render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const count = Math.max(1, chars.length);

    // ========================================================
    // 分支 A：卡片專用雙態引擎 (Dual-State Acoustic Kinetic Subtitle Engine)
    // ========================================================
    if (variant === 'card' && volumeSlice && volumeSlice.length > 0) {
      const { smoothVolume } = audioMetrics;

      if (isPlaying) {
        // --- 動態播放態：卡拉 OK 能量聚光燈逐字巡航 ---
        const activeIdx = Math.min(count - 1, Math.max(0, Math.floor(playbackProgress * count)));
        const containerScale = smoothVolume > 60 ? 1.05 : smoothVolume > 20 ? 1.02 : 1.0;
        container.style.transform = `scale(${containerScale.toFixed(2)})`;
        container.style.transformOrigin = 'center center';

        charsRef.current.forEach((el, idx) => {
          if (!el) return;
          const p = charProfiles[idx] || {
            weight: 600,
            scaleX: 1.0,
            scaleY: 1.0,
            yOffset: 0,
            fontSizeRatio: 1.0,
            isBurst: false,
          };

          if (idx === activeIdx) {
            // 聚光燈當前字元：高亮上浮 6px + 縱向彈跳 + 專屬光暈
            el.style.fontWeight = '900';
            el.style.color = '#FFFFFF';
            el.style.opacity = '1';
            const sX = (p.scaleX * 1.08).toFixed(2);
            const sY = (p.scaleY * 1.25).toFixed(2);
            const sTotal = (p.fontSizeRatio * 1.15).toFixed(2);
            el.style.transform = `translateY(${p.yOffset - 6}px) scaleX(${sX}) scaleY(${sY}) scale(${sTotal})`;
            el.style.textShadow = `0 0 16px ${themeColor}, 0 0 8px ${accentColor}, 0 0 24px #FFFFFF`;
          } else if (idx < activeIdx) {
            // 已經配音過的字元：維持聲態形狀與清晰明亮
            el.style.fontWeight = `${p.weight}`;
            el.style.color = '#FFFFFF';
            el.style.opacity = '1';
            el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scaleY(${p.scaleY.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
            el.style.textShadow = p.isBurst ? `0 0 8px ${accentColor}88` : 'none';
          } else {
            // 尚未配音的字元：維持聲態形狀，略帶 80% 待機不透明度
            el.style.fontWeight = `${p.weight}`;
            el.style.color = 'rgba(255, 255, 255, 0.82)';
            el.style.opacity = '0.82';
            el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scaleY(${p.scaleY.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
            el.style.textShadow = 'none';
          }
        });
      } else {
        // --- 靜態待機態：所見即海報，逐字預先刻畫聲態印記 ---
        container.style.transform = 'scale(1.0)';
        container.style.textShadow = 'none';

        charsRef.current.forEach((el, idx) => {
          if (!el) return;
          const p = charProfiles[idx] || {
            weight: 600,
            scaleX: 1.0,
            scaleY: 1.0,
            yOffset: 0,
            fontSizeRatio: 1.0,
            isBurst: false,
          };
          el.style.fontWeight = `${p.weight}`;
          el.style.color = '#FFFFFF';
          el.style.opacity = '1';
          el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scaleY(${p.scaleY.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
          el.style.textShadow = p.isBurst ? `0 0 10px ${accentColor}88` : 'none';
        });
      }
      return;
    }

    // ========================================================
    // 分支 B：經典即時動態字體 (用於 hero 錄音大舞台 與 preview 示範頁)
    // ========================================================
    const {
      smoothVolume,
      pitchNormalized,
      pitchYOffset,
      sustainedDuration,
      isStaccato,
      isVoiceActive,
    } = audioMetrics;

    const weight = mapVolumeToWeight(smoothVolume, noiseFloor, variant);

    const maxSustain = variant === 'card' ? 0.35 : variant === 'preview' ? 0.70 : 1.35;
    const sustainedWidth = isStaccato
      ? 0.75
      : 1.0 + Math.min(maxSustain, sustainedDuration * 0.95);
    const widthPercent = Math.round(sustainedWidth * 100);

    const maxSpacing = variant === 'card' ? 6 : variant === 'preview' ? 10 : 18;
    const spacingMultiplier = variant === 'card' ? 4 : variant === 'preview' ? 8 : 12;
    const letterSpacingPx = isStaccato
      ? -1
      : Math.min(maxSpacing, Math.round(sustainedDuration * spacingMultiplier));

    let containerScale = 1.0;
    if (isVoiceActive) {
      if (variant === 'preview') {
        containerScale = smoothVolume > 65
          ? 1.25 + ((smoothVolume - 65) / 35) * 0.20
          : smoothVolume > 20
          ? 0.95 + ((smoothVolume - 20) / 45) * 0.30
          : 0.85 + (smoothVolume / 20) * 0.10;
      } else {
        containerScale = smoothVolume > 65
          ? 1.7 + ((smoothVolume - 65) / 35) * 1.1
          : smoothVolume > 20
          ? 1.0 + ((smoothVolume - 20) / 45) * 0.7
          : 0.75 + (smoothVolume / 20) * 0.25;
      }
    }

    container.style.setProperty('--v-weight', `${weight}`);
    container.style.setProperty('--v-width', `${widthPercent}%`);
    container.style.setProperty('--v-y-offset', `${pitchYOffset}px`);
    container.style.setProperty('--v-letter-spacing', `${letterSpacingPx}px`);
    container.style.letterSpacing = `${letterSpacingPx}px`;
    container.style.transform = `scale(${containerScale.toFixed(2)})`;
    container.style.transformOrigin = 'center center';

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

    charsRef.current.forEach((el, idx) => {
      if (!el) return;
      const charPhase = (idx / count) * Math.PI * 2;
      const waveAmp = isVoiceActive ? (smoothVolume / 100) * (variant === 'card' ? 4 : 10) : 0;
      const waveDisplacement = Math.sin(charPhase + pitchNormalized * 4) * waveAmp;
      const totalY = isVoiceActive ? pitchYOffset + waveDisplacement : 0;

      const scaleY = isStaccato
        ? (variant === 'card' ? 1.15 : 1.35)
        : isVoiceActive
        ? 1.0 + (smoothVolume / (variant === 'card' ? 300 : 200))
        : 1.0;

      el.style.display = 'inline-block';
      el.style.transformOrigin = 'center center';
      el.style.transform = `translateY(${totalY.toFixed(1)}px) scaleX(${sustainedWidth.toFixed(2)}) scaleY(${scaleY.toFixed(2)})`;
      el.style.fontWeight = `${weight}`;
      el.style.letterSpacing = `${letterSpacingPx}px`;
      el.style.color = '#FFFFFF';
      el.style.opacity = '1';
    });
  }, [
    audioMetrics,
    noiseFloor,
    themeColor,
    accentColor,
    chars.length,
    variant,
    volumeSlice,
    charProfiles,
    playbackProgress,
    isPlaying,
  ]);

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
            className={`kinetic-char inline-block font-black transform-gpu transition-all duration-75 ${
              variant === 'card'
                ? 'text-base sm:text-lg md:text-xl'
                : variant === 'preview'
                ? 'text-xl sm:text-3xl md:text-4xl'
                : 'text-3xl sm:text-5xl md:text-6xl'
            } text-white`}
            style={{
              willChange: 'transform, font-weight, color, text-shadow, opacity',
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
