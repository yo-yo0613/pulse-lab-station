import { useState, useEffect, useCallback, useRef } from 'react';
import { defaultThemeConfig } from './config/theme.config';
import type { FsmState, KineticStats, PosterExportData, ThemeConfig } from './types/pulse';
import { DualKineticCanvas } from './components/DualKineticCanvas';
import { HudOverlay } from './components/HudOverlay';
import { IdleView } from './components/IdleView';
import { PosterModal } from './components/PosterModal';
import { DebugDrawer } from './components/DebugDrawer';
import { setupKioskEventJail, handleMaintainerTap } from './utils/kioskLock';
import { unlockAndCheckAudioContext, playShutterSound } from './services/soundEngine';
import { poseDetector } from './services/poseDetector';
import { calculateRank, generateVerificationCode } from './utils/math';
import { Sliders } from 'lucide-react';
import { SharePage } from './components/SharePage';

export function App() {
  // 檢查是否為手機掃碼成果分享頁面 (/share, ?share=true, #/share)
  const isShareView = () => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname.startsWith('/share') ||
      window.location.hash.startsWith('#/share') ||
      window.location.search.includes('share=true')
    );
  };

  if (isShareView()) {
    return <SharePage />;
  }

  // 僅在實體互動展演主站鎖定滾動與手勢
  useEffect(() => {
    document.body.classList.add('kiosk-locked');
    return () => {
      document.body.classList.remove('kiosk-locked');
    };
  }, []);

  const [theme, setTheme] = useState<ThemeConfig>(defaultThemeConfig);
  const [fsmState, setFsmState] = useState<FsmState>('IDLE');
  const [stats, setStats] = useState<KineticStats>({
    smoothVelocity: 0,
    kineticIndex: 0,
    pulseScore: 0,
    isSurge: false,
    surgeCount: 0,
    peakVelocity: 0,
    isEmulated: false,
  });

  // 倒數秒數
  const [remainingSeconds, setRemainingSeconds] = useState(theme.gameplay.sessionDurationSeconds);
  const sessionTimerRef = useRef<number | null>(null);

  // 最佳瞬間快照與海報數據
  const [posterData, setPosterData] = useState<PosterExportData | null>(null);

  // 硬體與調試控制項
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [isEmulationMode, setIsEmulationMode] = useState(false);

  // 音效解鎖與喚醒鎖狀態
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockSentinelRef = useRef<any>(null);

  // 1. 喚醒鎖自癒巡檢 (Screen Wake Lock API with Visibility Re-acquire Loop)
  useEffect(() => {
    const acquireWakeLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        try {
          wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLockSentinelRef.current.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        } catch (e) {
          console.warn('[PULSE LAB] WakeLock request deferred/ignored:', e);
        }
      }
    };

    acquireWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        acquireWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinelRef.current) {
        try {
          wakeLockSentinelRef.current.release();
        } catch (_) {}
      }
    };
  }, []);

  // 2. Kiosk 事件禁錮鎖定 (Event Jail) 與維護者快捷鍵
  useEffect(() => {
    const cleanupJail = setupKioskEventJail(() => {
      setIsDebugOpen((prev) => !prev);
    });
    return cleanupJail;
  }, []);

  // 3. 初次全螢幕手勢解鎖 Web Audio
  const handleUserGestureUnlock = useCallback(async () => {
    await unlockAndCheckAudioContext();
    setIsAudioUnlocked(true);
  }, []);

  // 維護者點擊暗樁 (連續點擊左上角 5 次)
  const handleAdminTap = useCallback(() => {
    handleMaintainerTap(() => {
      setIsDebugOpen((prev) => !prev);
    });
  }, []);

  const statsRef = useRef(stats);
  statsRef.current = stats;

  // 30 秒時限到達，進入結算定格 (ACTIVE -> FREEZE_CAPTURE)
  const handleSessionFinish = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    playShutterSound();
    setFsmState('FREEZE_CAPTURE');
  }, []);

  // 啟動 30 秒體驗 (IDLE -> ACTIVE)
  const handleActivate = useCallback(async () => {
    await unlockAndCheckAudioContext();
    setIsAudioUnlocked(true);
    setRemainingSeconds(theme.gameplay.sessionDurationSeconds);
    setFsmState('ACTIVE');

    // 啟動倒數計時器
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    const startTime = performance.now();
    const durationMs = theme.gameplay.sessionDurationSeconds * 1000;

    sessionTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setRemainingSeconds(left);

      if (elapsed >= durationMs) {
        if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
        handleSessionFinish(); // 時限一到直接切入結算定格！
      }
    }, 100);
  }, [theme.gameplay.sessionDurationSeconds, handleSessionFinish]);

  // 精彩瞬間截圖完成，跳轉 9:16 海報 (FREEZE_CAPTURE -> RESULT_POSTER)
  const handlePeakSnapshotReady = useCallback((blobUrl: string) => {
    const currentStats = statsRef.current;
    const rankInfo = calculateRank(currentStats.pulseScore);
    const verifyCode = generateVerificationCode();
    const nowStr = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    setPosterData({
      snapshotBlobUrl: blobUrl,
      pulseScore: currentStats.pulseScore,
      rank: `${rankInfo.rank} (${rankInfo.title})`,
      verificationCode: verifyCode,
      timestamp: nowStr,
      peakKinetic: currentStats.peakVelocity,
      surgeCount: currentStats.surgeCount,
    });

    // 稍微延遲 350ms 呈現定格快門效果，再彈出海報
    setTimeout(() => {
      setFsmState('RESULT_POSTER');
    }, 350);
  }, []);

  // 再來一次重置回到 IDLE
  const handleRestart = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    setRemainingSeconds(theme.gameplay.sessionDurationSeconds);
    setPosterData(null);
    setFsmState('IDLE');
  }, [theme.gameplay.sessionDurationSeconds]);

  // 游標模擬開關切換
  const handleToggleEmulation = (val: boolean) => {
    setIsEmulationMode(val);
    poseDetector.setEmulationMode(val);
  };

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#0A0A0A] font-mono select-none"
      onClick={handleUserGestureUnlock}
    >
      {/* 雙層粒子畫布與動能計算引擎 */}
      <DualKineticCanvas
        fsmState={fsmState}
        theme={theme}
        showSkeleton={showSkeleton}
        onStatsUpdate={setStats}
        onPeakSnapshotReady={handlePeakSnapshotReady}
        onSessionFinish={handleSessionFinish}
        cameraDeviceId={selectedCameraId}
        isCameraActive={isCameraActive}
      />

      {/* 瑞士極簡數據風 HUD 儀表盤 */}
      <HudOverlay
        fsmState={fsmState}
        stats={stats}
        theme={theme}
        remainingSeconds={remainingSeconds}
        onAdminTap={handleAdminTap}
        wakeLockActive={wakeLockActive}
      />

      {/* 待機引導視圖 (IDLE / COUNTDOWN) */}
      <IdleView
        fsmState={fsmState}
        stats={stats}
        theme={theme}
        onActivate={handleActivate}
        onAudioUnlockClick={handleUserGestureUnlock}
        isAudioUnlocked={isAudioUnlocked}
      />

      {/* 結算 9:16 海報展示與下載模態框 */}
      {fsmState === 'RESULT_POSTER' && posterData && (
        <PosterModal
          data={posterData}
          theme={theme}
          onRestart={handleRestart}
        />
      )}

      {/* 設計師調試抽屜 (Designer Debug Drawer) */}
      <DebugDrawer
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        theme={theme}
        onUpdateTheme={setTheme}
        showSkeleton={showSkeleton}
        onToggleSkeleton={setShowSkeleton}
        isCameraActive={isCameraActive}
        onToggleCamera={setIsCameraActive}
        onSelectCamera={setSelectedCameraId}
        selectedCameraId={selectedCameraId}
        isEmulationMode={isEmulationMode}
        onToggleEmulation={handleToggleEmulation}
      />

      {/* 介面右下角隱藏式除錯面板呼叫小按鈕 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsDebugOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 p-2.5 bg-white/5 hover:bg-white/15 border border-white/20 text-white/50 hover:text-white rounded-full transition-colors backdrop-blur-md cursor-pointer"
        title="開啟設計師調試面板"
      >
        <Sliders className="w-4 h-4" />
      </button>
    </main>
  );
}

export default App;
