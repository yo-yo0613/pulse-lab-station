import React, { useRef, useEffect } from 'react';
import type { AudioMetrics } from '../types/speak';

interface DynamicMediaOverlayProps {
  audioMetrics: AudioMetrics;
  mediaSrc?: string;       // 外部 TouchDesigner 影片或動畫路徑
  enableSimulatedFX?: boolean; // 是否開啟內建模擬 TouchDesigner 粒子流體
  blendMode?: 'screen' | 'lighten' | 'normal';
}

/**
 * 跨領域動態影音資材插槽組件 (Media Slot Architecture)
 * 供林妤安與美術團隊即插即用 TouchDesigner / AE 輸出之影片與動畫
 */
export const DynamicMediaOverlay: React.FC<DynamicMediaOverlayProps> = ({
  audioMetrics,
  mediaSrc,
  enableSimulatedFX = true,
  blendMode = 'screen',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Web Audio 即時驅動影片播放速率與發光透明度
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const { smoothVolume, isVoiceActive } = audioMetrics;

    // 播放速率映射 (0.5x 低沉緩慢 ➔ 2.0x 激昂急促)
    const targetRate = 0.6 + (smoothVolume / 100) * 1.4;
    video.playbackRate = Math.max(0.5, Math.min(2.5, targetRate));

    // 發光透明度
    video.style.opacity = isVoiceActive ? `${0.5 + (smoothVolume / 100) * 0.5}` : '0.25';
  }, [audioMetrics]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* 1. 若有傳入外部 TouchDesigner 導出影片，以指定混合模式無縫疊加 */}
      {mediaSrc ? (
        <video
          ref={videoRef}
          src={mediaSrc}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover transition-opacity duration-150"
          style={{ mixBlendMode: blendMode }}
        />
      ) : enableSimulatedFX ? (
        /* 2. 預設插槽模擬效果 (展示給美術組看成果預覽) */
        <div
          className="w-full h-full opacity-40 transition-opacity duration-200"
          style={{
            mixBlendMode: 'screen',
            background: `radial-gradient(circle at 50% 50%, rgba(0, 240, 255, ${
              audioMetrics.smoothVolume / 220
            }) 0%, transparent 70%)`,
          }}
        />
      ) : null}
    </div>
  );
};
