import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FsmState, KineticStats, PoseLandmarks, ThemeConfig } from '../types/pulse';
import { ColorLUT } from '../utils/colorLut';
import { euclideanDist, lerp } from '../utils/math';
import { poseDetector } from '../services/poseDetector';
import { playSurgeBoom, playChargeTone } from '../services/soundEngine';

interface DualKineticCanvasProps {
  fsmState: FsmState;
  theme: ThemeConfig;
  showSkeleton: boolean;
  onStatsUpdate: (stats: KineticStats) => void;
  onPeakSnapshotReady: (blobUrl: string) => void;
  onSessionFinish: () => void;
  cameraDeviceId?: string;
  isCameraActive: boolean;
}

const MAX_PARTICLES = 1000;

export const DualKineticCanvas: React.FC<DualKineticCanvasProps> = ({
  fsmState,
  theme,
  showSkeleton,
  onStatsUpdate,
  onPeakSnapshotReady,
  onSessionFinish,
  cameraDeviceId,
  isCameraActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);

  // 精彩瞬間暫存離屏畫布
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 100 階色彩查找表
  const colorLutRef = useRef<ColorLUT>(
    new ColorLUT(theme.particles.baseColor, theme.particles.midColor, theme.particles.peakColor)
  );

  // TypedArray 零 GC 粒子物理池
  const pPos = useRef(new Float32Array(MAX_PARTICLES * 2));
  const pVel = useRef(new Float32Array(MAX_PARTICLES * 2));
  const pData = useRef(new Float32Array(MAX_PARTICLES * 4)); // [life, maxLife, energy, size]
  const pCursor = useRef(0);

  // 動能運算變數
  const prevLandmarksRef = useRef<PoseLandmarks | null>(null);
  const smoothVelocityRef = useRef(0);
  const pulseScoreRef = useRef(0);
  const peakVelocityRef = useRef(0);
  const surgeCountRef = useRef(0);
  const lastSurgeTimeRef = useRef(0);

  // 震動與閃白狀態
  const [isShaking, setIsShaking] = useState(false);
  const [isFlash, setIsFlash] = useState(false);

  // 絕對高精度計時器起點
  const sessionStartTimeRef = useRef(0);
  const isFinishedTriggeredRef = useRef(false);

  // 最佳精彩瞬間暫存分數
  const bestSnapshotEnergyRef = useRef(0);

  // 更新色彩查找表
  useEffect(() => {
    colorLutRef.current.rebuild(theme.particles.baseColor, theme.particles.midColor, theme.particles.peakColor);
  }, [theme.particles.baseColor, theme.particles.midColor, theme.particles.peakColor]);

  // 生成粒子 (Ring Buffer 零 GC)
  const spawnParticle = useCallback(
    (x: number, y: number, vx: number, vy: number, energy: number, size: number, maxLife: number) => {
      const idx = pCursor.current;
      const i2 = idx * 2;
      const i4 = idx * 4;

      pPos.current[i2] = x;
      pPos.current[i2 + 1] = y;
      pVel.current[i2] = vx;
      pVel.current[i2 + 1] = vy;

      pData.current[i4] = maxLife;
      pData.current[i4 + 1] = maxLife;
      pData.current[i4 + 2] = energy;
      pData.current[i4 + 3] = size;

      pCursor.current = (idx + 1) % MAX_PARTICLES;
    },
    []
  );

  // 抓取精彩畫面存入 Snapshot 緩衝區
  const captureSnapshotToBuffer = useCallback(() => {
    if (!videoRef.current || !topCanvasRef.current) return;
    if (!snapshotCanvasRef.current) {
      snapshotCanvasRef.current = document.createElement('canvas');
      snapshotCanvasRef.current.width = 1280;
      snapshotCanvasRef.current.height = 720;
    }
    const snapCtx = snapshotCanvasRef.current.getContext('2d');
    if (!snapCtx) return;

    snapCtx.clearRect(0, 0, 1280, 720);
    snapCtx.fillStyle = '#0A0A0A';
    snapCtx.fillRect(0, 0, 1280, 720);

    // 鏡像視訊
    if (videoRef.current.readyState >= 2 || videoRef.current.videoWidth > 0) {
      snapCtx.save();
      snapCtx.translate(1280, 0);
      snapCtx.scale(-1, 1);
      snapCtx.drawImage(videoRef.current, 0, 0, 1280, 720);
      snapCtx.restore();
    }

    // 發光粒子
    snapCtx.drawImage(topCanvasRef.current, 0, 0, 1280, 720);
  }, []);

  // 導出最終精彩瞬間 Blob
  // 導出最終精彩瞬間 Blob
  const exportFinalSnapshotBlob = useCallback(() => {
    captureSnapshotToBuffer();
    if (!snapshotCanvasRef.current) return;

    try {
      snapshotCanvasRef.current.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          onPeakSnapshotReady(url);
        } else {
          const dataUrl = snapshotCanvasRef.current!.toDataURL('image/png');
          onPeakSnapshotReady(dataUrl);
        }
      }, 'image/png');
    } catch (_) {
      const dataUrl = snapshotCanvasRef.current.toDataURL('image/png');
      onPeakSnapshotReady(dataUrl);
    }
  }, [captureSnapshotToBuffer, onPeakSnapshotReady]);

  // 狀態轉換重置 (僅依賴 fsmState)
  useEffect(() => {
    if (fsmState === 'ACTIVE') {
      sessionStartTimeRef.current = performance.now();
      isFinishedTriggeredRef.current = false;
      pulseScoreRef.current = 0;
      peakVelocityRef.current = 0;
      surgeCountRef.current = 0;
      bestSnapshotEnergyRef.current = 0;
      // 清空所有粒子
      pData.current.fill(0);
    } else if (fsmState === 'FREEZE_CAPTURE') {
      exportFinalSnapshotBlob();
    }
  }, [fsmState, exportFinalSnapshotBlob]);

  // 初始化攝影機與辨識器
  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      await poseDetector.init();
      if (!isMounted) return;

      if (isCameraActive && videoRef.current) {
        await poseDetector.startCameraStream(videoRef.current, cameraDeviceId);
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (videoRef.current) {
        poseDetector.cleanTearDownStream(videoRef.current, () => {});
      }
    };
  }, [cameraDeviceId, isCameraActive]);

  // 主渲染與物理迴圈 (60fps Animation Loop)
  useEffect(() => {
    let animId: number;
    let lastFrameTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // 視訊心跳巡檢
      if (videoRef.current) {
        poseDetector.checkVideoHeartbeat(videoRef.current, () => {
          if (videoRef.current) {
            poseDetector.cleanTearDownStream(videoRef.current, () => {
              if (videoRef.current) poseDetector.startCameraStream(videoRef.current, cameraDeviceId);
            });
          }
        });
      }

      // 檢查倒數時限 (高精度絕對時間差分)
      if (fsmState === 'ACTIVE' && !isFinishedTriggeredRef.current) {
        const elapsed = now - sessionStartTimeRef.current;
        const totalMs = theme.gameplay.sessionDurationSeconds * 1000;
        if (elapsed >= totalMs) {
          isFinishedTriggeredRef.current = true;
          onSessionFinish();
        }
      }

      const bottomCanvas = bottomCanvasRef.current;
      const topCanvas = topCanvasRef.current;
      const container = containerRef.current;

      if (bottomCanvas && topCanvas && container) {
        const rect = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const targetW = Math.floor(rect.width * dpr);
        const targetH = Math.floor(rect.height * dpr);

        if (bottomCanvas.width !== targetW || bottomCanvas.height !== targetH) {
          bottomCanvas.width = targetW;
          bottomCanvas.height = targetH;
          topCanvas.width = targetW;
          topCanvas.height = targetH;
        }

        const bCtx = bottomCanvas.getContext('2d');
        const tCtx = topCanvas.getContext('2d', { alpha: true });

        if (bCtx && tCtx) {
          bCtx.save();
          tCtx.save();
          bCtx.scale(dpr, dpr);
          tCtx.scale(dpr, dpr);

          const W = rect.width;
          const H = rect.height;

          // 1. 底層繪製：清除畫布 (保持透明以透出原生視訊層)
          bCtx.clearRect(0, 0, W, H);

          // 2. 姿態檢測與動能演算法
          let currentLandmarks: PoseLandmarks | null = null;
          let isEmulatedMode = false;

          if (videoRef.current) {
            const detectResult = poseDetector.detectPose(videoRef.current, now);
            currentLandmarks = detectResult.landmarks;
            isEmulatedMode = detectResult.isEmulated;
          }

          // 動能差分計算
          let rawVelocity = 0;
          if (currentLandmarks && prevLandmarksRef.current) {
            const keyPoints = [
              { idx: 15, weight: 2.5 }, // 左手腕
              { idx: 16, weight: 2.5 }, // 右手腕
              { idx: 27, weight: 1.8 }, // 左腳踝
              { idx: 28, weight: 1.8 }, // 右腳踝
              { idx: 11, weight: 1.0 }, // 左肩
              { idx: 12, weight: 1.0 }, // 右肩
            ];

            let totalWeight = 0;
            for (const kp of keyPoints) {
              const cur = currentLandmarks[kp.idx];
              const prev = prevLandmarksRef.current[kp.idx];
              if (cur && prev && (cur.visibility ?? 1) > 0.3) {
                const dist = euclideanDist(cur.x, cur.y, prev.x, prev.y);
                rawVelocity += dist * kp.weight;
                totalWeight += kp.weight;
              }
            }
            if (totalWeight > 0) {
              rawVelocity = (rawVelocity / totalWeight) * 100;
            }
          }
          prevLandmarksRef.current = currentLandmarks;

          // LERP 平滑濾波
          smoothVelocityRef.current = lerp(smoothVelocityRef.current, rawVelocity, 0.18);
          const kineticIndex = Math.min(100, Math.round(smoothVelocityRef.current * theme.gameplay.sensitivity * 5.5));

          if (kineticIndex > peakVelocityRef.current) {
            peakVelocityRef.current = kineticIndex;
          }

          // 累積動能計分
          const isSurgeNow = kineticIndex >= theme.gameplay.surgeThreshold;
          if (fsmState === 'ACTIVE') {
            const addScore = (kineticIndex * 1.2 + 2) * dt * 30;
            pulseScoreRef.current += addScore;

            // 爆發瞬態判斷 (Surge Burst)
            if (isSurgeNow && now - lastSurgeTimeRef.current > theme.sound.surgeCooldownMs) {
              lastSurgeTimeRef.current = now;
              surgeCountRef.current++;
              playSurgeBoom(theme.sound.surgeCooldownMs);
              setIsShaking(true);
              setIsFlash(true);
              setTimeout(() => setIsShaking(false), 280);
              setTimeout(() => setIsFlash(false), 120);
            }

            if (kineticIndex > 30) {
              playChargeTone(kineticIndex);
            }

            // 更新最佳精彩瞬間快照
            if (kineticIndex > bestSnapshotEnergyRef.current || isSurgeNow) {
              bestSnapshotEnergyRef.current = kineticIndex;
              captureSnapshotToBuffer();
            }
          }

          // 回報即時數據
          onStatsUpdate({
            smoothVelocity: smoothVelocityRef.current,
            kineticIndex,
            pulseScore: Math.round(pulseScoreRef.current),
            isSurge: isSurgeNow,
            surgeCount: surgeCountRef.current,
            peakVelocity: peakVelocityRef.current,
            isEmulated: isEmulatedMode,
          });

          // 繪製骨架節點 (若開啟除錯)
          if (showSkeleton && currentLandmarks) {
            bCtx.save();
            bCtx.fillStyle = theme.particles.baseColor;
            bCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            bCtx.lineWidth = 2;

            for (const lm of currentLandmarks) {
              if (lm && (lm.visibility ?? 1) > 0.3) {
                // 鏡像座標 X
                const px = (1 - lm.x) * W;
                const py = lm.y * H;
                bCtx.beginPath();
                bCtx.arc(px, py, 4, 0, Math.PI * 2);
                bCtx.fill();
              }
            }
            bCtx.restore();
          }

          // 3. 粒子物理發射 (手腕與腳踝即時噴射)
          if (currentLandmarks && (fsmState === 'ACTIVE' || fsmState === 'IDLE' || fsmState === 'COUNTDOWN')) {
            const emitters = [15, 16, 27, 28]; // 雙手腕 + 雙腳踝
            const spawnCount = isSurgeNow ? 6 : Math.ceil(kineticIndex / 22);

            for (const eIdx of emitters) {
              const lm = currentLandmarks[eIdx];
              if (lm && (lm.visibility ?? 1) > 0.25) {
                const ex = (1 - lm.x) * W;
                const ey = lm.y * H;

                for (let k = 0; k < spawnCount; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = (Math.random() * 4 + 1.5) * (1 + kineticIndex / 40);
                  const vx = Math.cos(angle) * speed;
                  const vy = Math.sin(angle) * speed - 1.2; // 微向上浮力
                  const life = Math.random() * 0.7 + 0.5;
                  const size = (Math.random() * 2.5 + theme.particles.particleSize) * (1 + kineticIndex / 80);

                  spawnParticle(ex, ey, vx, vy, kineticIndex, size, life);
                }
              }
            }
          }

          // 4. 頂層發光粒子物理更新與渲染 (Lighter Blending)
          tCtx.clearRect(0, 0, W, H);
          tCtx.globalCompositeOperation = 'lighter';

          for (let i = 0; i < MAX_PARTICLES; i++) {
            const i4 = i * 4;
            const life = pData.current[i4];
            if (life <= 0) continue;

            // 物理運動
            const i2 = i * 2;
            pPos.current[i2] += pVel.current[i2];
            pPos.current[i2 + 1] += pVel.current[i2 + 1];

            // 阻尼
            pVel.current[i2] *= 0.96;
            pVel.current[i2 + 1] = pVel.current[i2 + 1] * 0.96 - 0.15; // 浮力向上

            // 生命衰減
            pData.current[i4] -= dt;
            const maxLife = pData.current[i4 + 1];
            const currentLife = Math.max(0, pData.current[i4]);
            const alpha = currentLife / maxLife;

            const energy = pData.current[i4 + 2];
            const size = pData.current[i4 + 3] * alpha;

            // 查表取色 (Color LUT Zero-Overhead)
            const colorStr = colorLutRef.current.getColor(energy, alpha);

            tCtx.fillStyle = colorStr;
            tCtx.beginPath();
            tCtx.arc(pPos.current[i2], pPos.current[i2 + 1], Math.max(0.5, size), 0, Math.PI * 2);
            tCtx.fill();
          }

          bCtx.restore();
          tCtx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    fsmState,
    theme,
    showSkeleton,
    onStatsUpdate,
    onSessionFinish,
    cameraDeviceId,
    spawnParticle,
    captureSnapshotToBuffer,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-[#0A0A0A] ${isShaking ? 'shake-active' : ''}`}
    >
      {/* 原生硬體加速 Video 鏡頭背景：100% 絕對可見，消除黑屏，流暢 60fps */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
        style={{
          transform: 'scaleX(-1)', // 鏡像翻轉
          opacity: 0.65,
        }}
        playsInline
        muted
        autoPlay
      />

      {/* 賽博網格與暗化疊加層 */}
      <div className="absolute inset-0 bg-[#0A0A0A]/40 pointer-events-none z-1 cyber-grid" />

      {/* 底層畫布：骨架與視覺疊加 */}
      <canvas
        ref={bottomCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* 頂層畫布：800+ 顆發光融合粒子 */}
      <canvas
        ref={topCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
      />

      {/* 爆發白光微閃遮罩 (Surge Flash Overlay) */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-100 ${
          isFlash ? 'opacity-35' : 'opacity-0'
        }`}
      />
    </div>
  );
};
