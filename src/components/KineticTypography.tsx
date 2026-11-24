import React, { useEffect, useRef, useMemo } from 'react';
import type { AudioMetrics, CharAcousticSnapshot } from '../types/speak';

export interface KineticTypographyProps {
  text: string;
  audioMetrics: AudioMetrics;
  noiseFloor: number;
  themeColor?: string;
  accentColor?: string;
  variant?: 'hero' | 'preview' | 'card';
  aestheticMode?: 'monochrome' | 'cyber';
  darkSurface?: boolean; // 於深色影片視窗內顯示高對比白/琥珀金 KTV 填色
  ktvMode?: boolean;     // 啟用 KTV 逐字填色 + 已唸字詞聲學定格快照
  charSnapshots?: CharAcousticSnapshot[];
  showTelemetry?: boolean;
  volumeSlice?: Float32Array;
  pitchSlice?: Float32Array;
  playbackProgress?: number;
  isPlaying?: boolean;
  activeCharIndex?: number; // 逐字卡拉OK彈跳焦點 (-1: 待機, 0..N-1: 爆發當前字, >=N: 全句完成)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * MATS v1.0 音量 → 字重 (500 ~ 900)
 * 結合個人基準正規化 ΔRMS 與絕對音量包絡線
 */
function mapVolumeToWeight(
  vol: number,
  noiseFloor: number,
  variant: 'hero' | 'preview' | 'card' = 'hero',
  deltaRms?: number
): number {
  const volEff = Math.max(0, vol - noiseFloor * 0.7);
  const deltaBoost = deltaRms !== undefined ? Math.max(0, deltaRms) * 18 : 0;
  const sigmoid = 1 / (1 + Math.exp(-(volEff + deltaBoost - 24) / 10));
  const baseWeight = variant === 'card' ? 500 : 450;
  const dynamicWeight = Math.round(baseWeight + sigmoid * (900 - baseWeight));
  return clamp(dynamicWeight, baseWeight, 900);
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
  aestheticMode = 'cyber',
  darkSurface = false,
  ktvMode = false,
  charSnapshots,
  showTelemetry = false,
  volumeSlice,
  pitchSlice,
  playbackProgress = 0,
  isPlaying = false,
  activeCharIndex,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const phaseTickRef = useRef<number>(0);

  const isMonochrome = aestheticMode === 'monochrome';
  const baseInk = darkSurface ? '#FFFFFF' : isMonochrome ? '#000000' : '#FFFFFF';
  const dimInk = darkSurface
    ? 'rgba(255, 255, 255, 0.34)'
    : isMonochrome
    ? 'rgba(0, 0, 0, 0.42)'
    : 'rgba(255, 255, 255, 0.58)';
  const ktvAccentInk = darkSurface ? '#F5A623' : '#111111';

  // 將文字拆分為字元陣列 (逐字元 GPU 幾何延展)
  const chars = useMemo(() => Array.from(text), [text]);

  // 逐字元聲學幾何靜態印記 (靜態即海報)
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
      const pVal = pitchSlice && pitchSlice.length > 0 ? pitchSlice[vIdx] || 0.5 : 0.5;

      if (isPunc) {
        if (char === '～' || char === '！' || char === '？') {
          return {
            char,
            weight: 800,
            scaleX: clamp(1.1 + (vol / 100) * 0.3, 1.0, 2.2),
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

      let fontSizeRatio = 1.0;
      let weight = 500;
      let isBurst = false;

      if (vol > 55) {
        fontSizeRatio = clamp(1.1 + ((vol - 55) / 45) * 0.25, 0.75, 1.55);
        weight = 900;
        isBurst = true;
      } else if (vol > 25) {
        fontSizeRatio = 0.98 + ((vol - 25) / 30) * 0.12;
        weight = 700;
      } else {
        fontSizeRatio = clamp(0.82 + (vol / 25) * 0.16, 0.75, 1.0);
        weight = 500;
      }

      let scaleX = 1.0;
      if (vol > 40 && (i >= N - 5 || vol > 55)) {
        scaleX = clamp(1.05 + (vol / 100) * 0.45, 1.0, 2.2);
      }

      const yOffset = Math.round(clamp((pVal - 0.5) * -28, -20, 20));

      return {
        char,
        weight,
        scaleX,
        scaleY: isBurst ? 1.08 : 1.0,
        yOffset,
        fontSizeRatio,
        isBurst,
        vol,
      };
    });
  }, [chars, volumeSlice, pitchSlice, variant]);

  // 60fps MATS v1.0 物理引擎驅動 (0 React Re-render per char style update)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    phaseTickRef.current += 1;
    const count = Math.max(1, chars.length);

    // ========================================================
    // 分支 KTV：PDF 前三頁「2 錄音 / 3 看效果」逐字填色 + 定格聲學快照引擎
    // ========================================================
    if (ktvMode && charSnapshots && charSnapshots.length > 0) {
      container.style.transform = 'scale(1.0)';
      container.style.filter = 'none';
      container.style.textShadow = 'none';

      charsRef.current.forEach((el, idx) => {
        if (!el) return;
        const snap = charSnapshots[idx];
        if (!snap) return;

        const fillPct = clamp(Math.round(snap.fillProgress * 100), 0, 100);
        const sScale = clamp(snap.scale, 0.78, 1.55);
        const sY = clamp(snap.yOffset, -22, 22);
        const sX = clamp(snap.scaleX, 0.85, 2.1);
        const sSpace = clamp(snap.letterSpacing, -1, 12);
        const extraHorizontalEm = Math.max(0, (sX * sScale - 1) * 0.48);

        el.style.display = 'inline-block';
        el.style.transformOrigin = 'center bottom';
        el.style.fontWeight = `${clamp(snap.weight, 500, 900)}`;
        el.style.letterSpacing = '0px';
        el.style.marginLeft = `${extraHorizontalEm.toFixed(2)}em`;
        el.style.marginRight = `calc(${extraHorizontalEm.toFixed(2)}em + ${Math.max(0, sSpace).toFixed(1)}px)`;
        el.style.transform = `translate3d(0, ${sY.toFixed(1)}px, 0) scaleX(${sX.toFixed(2)}) scale(${sScale.toFixed(2)})`;

        if (fillPct >= 99) {
          // 已完成填色或回放中已定格的字：高能量或拉長字使用重點色突顯
          el.style.backgroundImage = 'none';
          el.style.webkitBackgroundClip = 'border-box';
          el.style.webkitTextFillColor = 'currentColor';
          el.style.color = snap.isHighlight ? ktvAccentInk : baseInk;
          el.style.opacity = '1';
          el.style.textShadow = snap.isHighlight
            ? darkSurface
              ? '0 4px 16px rgba(245, 166, 35, 0.38)'
              : '0 4px 12px rgba(0, 0, 0, 0.22)'
            : 'none';
        } else if (fillPct > 0) {
          // 正在唸的當前字：由左至右 KTV 漸進填色 + 即時聲學縮放
          el.style.backgroundImage = `linear-gradient(90deg, ${ktvAccentInk} ${fillPct}%, ${dimInk} ${fillPct}%)`;
          el.style.webkitBackgroundClip = 'text';
          el.style.webkitTextFillColor = 'transparent';
          el.style.color = ktvAccentInk;
          el.style.opacity = '1';
          el.style.textShadow = 'none';
        } else {
          // 尚未唸到的字：保持半透明基準灰
          el.style.backgroundImage = 'none';
          el.style.webkitBackgroundClip = 'border-box';
          el.style.webkitTextFillColor = 'currentColor';
          el.style.color = dimInk;
          el.style.opacity = '0.78';
          el.style.textShadow = 'none';
        }
      });
      return;
    }

    // ========================================================
    // 分支 A：卡片雙態回放引擎 (Dual-State Acoustic Subtitle)
    // ========================================================
    if (variant === 'card' && volumeSlice && volumeSlice.length > 0) {
      const { smoothVolume, sustainedDuration, isVoiceActive, deltaRms, deltaF0, hnrDb = 18 } =
        audioMetrics;

      if (isPlaying) {
        const activeIdx = clamp(Math.floor(playbackProgress * count), 0, count - 1);
        const effDeltaRms = deltaRms !== undefined ? deltaRms : Math.max(0, (smoothVolume - 35) / 40);
        const containerScale = isVoiceActive
          ? clamp(1.0 + effDeltaRms * 0.15, 0.9, 1.2)
          : 1.0;

        container.style.transform = `scale(${containerScale.toFixed(2)})`;
        container.style.transformOrigin = 'center center';

        const liveWeight = mapVolumeToWeight(smoothVolume, noiseFloor, 'card', deltaRms);
        const liveSustainScale =
          sustainedDuration > 0.35
            ? clamp(1.0 + (sustainedDuration - 0.35) * 0.85, 1.0, 1.55)
            : 1.0;
        const matsPitchY =
          deltaF0 !== undefined ? clamp(-deltaF0 * 24, -18, 18) : audioMetrics.pitchYOffset * 0.3;
        const cardBlurPx = isVoiceActive && hnrDb < 14 ? clamp((14 - hnrDb) * 0.25, 0, 2.2) : 0;

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
            const curWeight = Math.max(p.weight, liveWeight);
            el.style.fontWeight = `${curWeight}`;
            el.style.color = baseInk;
            el.style.opacity = '1';
            el.style.filter = cardBlurPx > 0.1 ? `blur(${cardBlurPx.toFixed(2)}px)` : 'none';

            const sX = clamp(p.scaleX * liveSustainScale, 1.0, 1.65).toFixed(2);
            const sTotal = clamp(
              p.fontSizeRatio * (isVoiceActive ? 1.06 + (smoothVolume / 260) : 1.0),
              0.75,
              1.45
            ).toFixed(2);
            const curY = clamp(p.yOffset + matsPitchY, -20, 20);

            el.style.transform = `translateY(${curY.toFixed(1)}px) scaleX(${sX}) scale(${sTotal})`;
            el.style.textShadow = isMonochrome
              ? '0 4px 10px rgba(0,0,0,0.22)'
              : smoothVolume > 50
              ? `-2px 0 10px rgba(255,0,85,0.7), 2px 0 10px rgba(0,240,255,0.7), 0 0 16px #FFFFFF`
              : `0 0 12px ${themeColor}`;
          } else if (idx < activeIdx) {
            el.style.fontWeight = `${p.weight}`;
            el.style.color = baseInk;
            el.style.opacity = '0.92';
            el.style.filter = 'none';
            el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
            el.style.textShadow = 'none';
          } else {
            el.style.fontWeight = `${p.weight}`;
            el.style.color = dimInk;
            el.style.opacity = '0.65';
            el.style.filter = 'none';
            el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
            el.style.textShadow = 'none';
          }
        });
      } else {
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
          el.style.color = baseInk;
          el.style.opacity = '1';
          el.style.filter = 'none';
          el.style.transform = `translateY(${p.yOffset}px) scaleX(${p.scaleX.toFixed(2)}) scale(${p.fontSizeRatio.toFixed(2)})`;
          el.style.textShadow = p.isBurst && !isMonochrome ? `0 0 10px ${accentColor}88` : 'none';
        });
      }
      return;
    }

    // ========================================================
    // 分支 B：MATS v1.0 即時六維映射動態字體引擎 (hero & preview)
    // 包含三層可讀性物理箝位防線 (Pitfall 03)
    // ========================================================
    const {
      smoothVolume,
      pitchNormalized,
      pitchYOffset,
      sustainedDuration,
      isStaccato,
      isVoiceActive,
      deltaRms,
      deltaF0,
      jitter = 0,
      hnrDb = 18,
      pauseDurationMs = 0,
    } = audioMetrics;

    // Rule 1: 音量 (ΔRMS) -> 字級縮放與字重 (Clamp: scale 0.75~1.55, weight 500~900)
    const weight = mapVolumeToWeight(smoothVolume, noiseFloor, variant, deltaRms);
    const effectiveDeltaRms =
      deltaRms !== undefined ? Math.max(0, deltaRms) : Math.max(0, (smoothVolume - 25) / 55);
    const rawMatsScale = isVoiceActive
      ? 1.0 + clamp(effectiveDeltaRms * 0.8, 0, 0.5)
      : 1.0;
    const variantScaleBoost = variant === 'preview' ? Math.min(1.32, rawMatsScale) : rawMatsScale;
    const safeContainerScale = clamp(variantScaleBoost, 0.75, 1.55);

    // Rule 2: 巨觀音高 (ΔF0) -> Y 軸偏移 (Clamp: -20px ~ +20px)
    const macroY = isVoiceActive
      ? deltaF0 !== undefined
        ? clamp(-deltaF0 * 30, -20, 20)
        : clamp(pitchYOffset * 0.72, -20, 20)
      : 0;

    // Rule 3: 音長 (Duration > 0.35s) -> 字寬水平拉伸 (Clamp: scaleX <= 2.2)
    const sustainExcess = Math.max(0, sustainedDuration - 0.35);
    const maxSustainX = variant === 'card' ? 1.35 : variant === 'preview' ? 1.65 : 2.2;
    const matsScaleX = isStaccato
      ? 0.85
      : clamp(1.0 + clamp(sustainExcess * 1.5, 0, 1.4), 0.8, maxSustainX);

    // Rule 4: 停頓時間 (Pause >= 250ms) -> 文字間距 (Clamp: 0px ~ 12px)
    const pauseSpacing =
      pauseDurationMs >= 250
        ? clamp((pauseDurationMs / 100) * 2, 0, 12)
        : isStaccato
        ? -1
        : clamp(sustainedDuration * 3.5, 0, 6);

    // Rule 5: 音高微擾 (Jitter > 2.2%) -> 高頻微幅震顫 (Clamp: <= 2.5px)
    const jitterAmpX = isVoiceActive && jitter > 2.2 ? clamp((jitter - 2.2) * 0.45, 0, 1.5) : 0;
    const jitterAmpY = isVoiceActive && jitter > 2.2 ? clamp((jitter - 2.2) * 0.3, 0, 1.0) : 0;

    // Rule 6: 氣聲/沙啞雜訊比 (HNR < 14dB) -> 邊緣微微暈開霧化 (Clamp: <= 2.5px, opacity >= 0.45)
    const hnrBlurPx = isVoiceActive && hnrDb < 14 ? clamp((14 - hnrDb) * 0.3, 0, 2.5) : 0;
    const safeOpacity = isVoiceActive
      ? clamp(1.0 - (hnrBlurPx / 2.5) * 0.18, 0.45, 1.0)
      : 1.0;

    // 寫入 CSS Custom Properties 供外部/GPU 取用
    container.style.setProperty('--v-weight', `${weight}`);
    container.style.setProperty('--v-width', `${Math.round(matsScaleX * 100)}%`);
    container.style.setProperty('--v-y-offset', `${macroY.toFixed(1)}px`);
    container.style.setProperty('--v-letter-spacing', `${pauseSpacing.toFixed(1)}px`);
    container.style.letterSpacing = `${pauseSpacing.toFixed(1)}px`;
    container.style.transform = `scale(${safeContainerScale.toFixed(2)})`;
    container.style.transformOrigin = 'center center';
    container.style.filter = hnrBlurPx > 0.08 ? `blur(${hnrBlurPx.toFixed(2)}px)` : 'none';

    const isBurst = smoothVolume > 60;
    if (isMonochrome) {
      if (isVoiceActive && isBurst) {
        container.style.textShadow = '0px 18px 8px rgba(0, 0, 0, 0.16)';
      } else {
        container.style.textShadow = 'none';
      }
    } else {
      const glowColor = isBurst ? themeColor : accentColor;
      const glowSpread = Math.min(variant === 'card' ? 14 : 28, Math.round(smoothVolume * 0.35));
      if (isVoiceActive) {
        container.style.textShadow = isBurst
          ? `-2px 0 10px rgba(255,0,85,0.85), 2px 0 10px rgba(0,240,255,0.85), 0 0 ${glowSpread}px ${glowColor}`
          : `0 0 ${glowSpread}px ${glowColor}`;
      } else {
        container.style.textShadow = 'none';
      }
    }

    charsRef.current.forEach((el, idx) => {
      if (!el) return;
      el.style.backgroundImage = 'none';
      el.style.webkitBackgroundClip = 'border-box';
      el.style.webkitTextFillColor = 'currentColor';
      el.style.marginRight = '0px';

      // 示範頁逐字卡拉OK彈跳焦點 (搭配 phraseCycles)
      if (variant === 'preview' && activeCharIndex !== undefined) {
        el.style.display = 'inline-block';
        el.style.transformOrigin = 'center center';
        el.style.letterSpacing = `${pauseSpacing.toFixed(1)}px`;

        if (activeCharIndex === -1) {
          el.style.fontWeight = '500';
          el.style.color = dimInk;
          el.style.opacity = '0.58';
          el.style.transform = 'translateY(0px) scale(1.0)';
          el.style.textShadow = 'none';
        } else if (idx === activeCharIndex) {
          const burstScale = clamp(1.22 + (smoothVolume / 100) * 0.22, 1.0, 1.55);
          const burstY = clamp(macroY * 0.45 - 6, -20, 20);
          el.style.fontWeight = '900';
          el.style.color = darkSurface ? ktvAccentInk : baseInk;
          el.style.opacity = '1.0';
          el.style.transform = `translateY(${burstY.toFixed(1)}px) scale(${burstScale.toFixed(2)}) scaleX(${Math.min(1.55, matsScaleX).toFixed(2)})`;
          el.style.textShadow = isMonochrome
            ? '0 10px 14px rgba(0, 0, 0, 0.28)'
            : `-3px 0 12px rgba(255,0,85,0.85), 3px 0 12px rgba(0,240,255,0.85), 0 0 18px #FFFFFF`;
        } else if (idx < activeCharIndex) {
          el.style.fontWeight = '700';
          el.style.color = baseInk;
          el.style.opacity = '0.95';
          el.style.transform = 'translateY(0px) scale(1.04)';
          el.style.textShadow = isMonochrome ? 'none' : `0 0 8px ${accentColor}66`;
        } else {
          el.style.fontWeight = '500';
          el.style.color = dimInk;
          el.style.opacity = '0.52';
          el.style.transform = 'translateY(0px) scale(1.0)';
          el.style.textShadow = 'none';
        }
        return;
      }

      // Live 即時 60fps 聲學動態排版
      const charPhase = (idx / count) * Math.PI * 2;
      const waveAmp = isVoiceActive ? (smoothVolume / 100) * (variant === 'card' ? 3 : 6) : 0;
      const waveDisplacement = Math.sin(charPhase + pitchNormalized * 4) * waveAmp;
      const shakeX =
        jitterAmpX > 0 ? Math.sin(phaseTickRef.current * 1.9 + idx * 2.7) * jitterAmpX : 0;
      const shakeY =
        jitterAmpY > 0 ? Math.cos(phaseTickRef.current * 2.3 + idx * 1.9) * jitterAmpY : 0;

      const totalY = clamp(macroY + waveDisplacement + shakeY, -20, 20);
      const scaleY = isStaccato ? 1.18 : 1.0;

      el.style.display = 'inline-block';
      el.style.transformOrigin = 'center center';
      el.style.transform = `translate3d(${shakeX.toFixed(2)}px, ${totalY.toFixed(1)}px, 0) scaleX(${matsScaleX.toFixed(2)}) scaleY(${scaleY.toFixed(2)})`;
      el.style.fontWeight = `${weight}`;
      el.style.letterSpacing = `${pauseSpacing.toFixed(1)}px`;
      el.style.color = baseInk;
      el.style.opacity = `${safeOpacity.toFixed(2)}`;
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
    activeCharIndex,
    isMonochrome,
    darkSurface,
    ktvMode,
    charSnapshots,
    baseInk,
    dimInk,
    ktvAccentInk,
  ]);

  return (
    <div className="w-full flex flex-col items-center">
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
            "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', ui-sans-serif, system-ui, sans-serif",
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
              className={`kinetic-char inline-block font-black transform-gpu transition-[color,opacity] duration-75 ${
                variant === 'card'
                  ? chars.length > 16
                    ? 'text-sm sm:text-base'
                    : 'text-base sm:text-lg md:text-xl'
                  : variant === 'preview'
                  ? chars.length > 16
                    ? 'text-lg sm:text-xl md:text-2xl'
                    : 'text-2xl sm:text-3xl md:text-4xl'
                  : chars.length > 16
                  ? 'text-2xl sm:text-3xl md:text-4xl'
                  : 'text-4xl sm:text-5xl md:text-6xl'
              } ${isMonochrome ? 'text-black' : 'text-white'}`}
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

      {/* 可選 MATS v1.0 即時六維聲學遙測微標籤 */}
      {showTelemetry && (
        <div
          className={`mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-iosevka tracking-wider border backdrop-blur-md ${
            isMonochrome
              ? 'bg-white/70 border-black/15 text-black/75'
              : 'bg-black/50 border-white/15 text-zinc-300'
          }`}
        >
          <span>ΔRMS {((audioMetrics.deltaRms ?? 0) * 100).toFixed(0)}%</span>
          <span>·</span>
          <span>F0 {audioMetrics.f0MacroHz ?? audioMetrics.pitchHz}Hz</span>
          <span>·</span>
          <span>JITTER {(audioMetrics.jitter ?? 0).toFixed(1)}%</span>
          <span>·</span>
          <span>HNR {(audioMetrics.hnrDb ?? 18).toFixed(1)}dB</span>
          <span>·</span>
          <span>PAUSE {audioMetrics.pauseDurationMs ?? 0}ms</span>
        </div>
      )}
    </div>
  );
};
