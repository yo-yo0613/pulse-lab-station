import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SpeakState, ScoreResult, PromptScenario } from '../types/speak';
import type { OmniActionType, OmniInputSource } from '../types/omniInput';
import { PROMPT_SCENARIOS } from '../config/speakScenarios';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import { useOmniInput } from '../hooks/useOmniInput';
import { KineticTypography } from './KineticTypography';
import { VoiceVisualizer3D } from './VoiceVisualizer3D';
import { DynamicMediaOverlay } from './DynamicMediaOverlay';
import { PromptVideoView } from './PromptVideoView';
import { ScoreAnalysisView } from './ScoreAnalysisView';
import { SpeakExportModal } from './SpeakExportModal';
import { MaintainerDrawer } from './MaintainerDrawer';
import { compareVoiceDTW } from '../utils/audioDTW';
import { handleMaintainerTap } from '../utils/kioskLock';
import { Mic, Sparkles, Square, ArrowRight, Radio } from 'lucide-react';

interface SeeHowYouSpeakAppProps {
  onSwitchMode?: () => void;
}

export const SeeHowYouSpeakApp: React.FC<SeeHowYouSpeakAppProps> = ({ onSwitchMode }) => {
  const [speakState, setSpeakState] = useState<SpeakState>('LANDING');
  const [selectedScenario, setSelectedScenario] = useState<PromptScenario>(PROMPT_SCENARIOS[0]);
  const [isActivelyRecording, setIsActivelyRecording] = useState<boolean>(false);
  const [elapsedRecordTime, setElapsedRecordTime] = useState<number>(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [userRecordedVolume, setUserRecordedVolume] = useState<Float32Array>(new Float32Array(0));
  const [userRecordedPitch, setUserRecordedPitch] = useState<Float32Array>(new Float32Array(0));

  // 手動 Toggle 錄音防連擊防禦 (A/B 55, 7.49 300ms 點擊互鎖)
  const lastToggleTimeRef = useRef<number>(0);

  // 維護者抽屜與全模態控制狀態
  const [isMaintainerOpen, setIsMaintainerOpen] = useState(false);
  const [enableVoiceVad, setEnableVoiceVad] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // 音訊分析器 hook
  const {
    audioMetrics,
    isListening,
    noiseFloor,
    userAudioUrl,
    getValidRecordings,
    startRecording,
    stopRecording,
    unlockAudio,
    setMuteInput,
    calibrateNoiseFloor,
    getElapsedHardwareTime,
    clearRecordedAudio,
  } = useAudioAnalyzer();

  const animFrameIdRef = useRef<number | null>(null);

  // 1. 展演環境鎖定滾動
  useEffect(() => {
    document.body.classList.add('kiosk-locked');
    return () => {
      document.body.classList.remove('kiosk-locked');
    };
  }, []);

  // 影片播放期間軟體靜音麥克風 (Defense 7.22 防喇叭迴音自激)
  useEffect(() => {
    setMuteInput(isVideoPlaying);
  }, [isVideoPlaying, setMuteInput]);

  // 2. 結算演算法：錄音結束時由 DTW 比對
  const finishRecording = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    stopRecording();

    // 取得截斷後的有效錄音長度
    const { volume, pitch } = getValidRecordings();
    setUserRecordedVolume(volume);
    setUserRecordedPitch(pitch);

    const nowStr = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // 5.5 超短錄音或誤觸防禦 (< 15 影格約小於 250ms，防止 DTW 矩陣越界白屏)
    if (volume.length < 15) {
      const fallbackRes: ScoreResult = {
        overallScore: 60,
        volumeScore: 55,
        pitchScore: 65,
        rank: 'A',
        rankTitle: '能量初生者',
        comment: '錄音時間過短或未檢測到有效聲音，建議靠近麥克風大聲模仿！',
        verificationCode: `SPK-${Math.floor(10000 + Math.random() * 90000)}`,
        timestamp: nowStr,
        scenarioId: selectedScenario.id,
      };
      setScoreResult(fallbackRes);
      setSpeakState('SCORE_ANALYSIS');
      return;
    }

    // 一維 DTW 比對
    const dtwResult = compareVoiceDTW(
      volume,
      pitch,
      selectedScenario.referenceVolumeCurve,
      selectedScenario.referencePitchCurve
    );

    const res: ScoreResult = {
      overallScore: dtwResult.overallScore,
      volumeScore: dtwResult.volumeScore,
      pitchScore: dtwResult.pitchScore,
      rank: dtwResult.rank,
      rankTitle: dtwResult.rankTitle,
      comment: dtwResult.comment,
      verificationCode: `SPK-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: nowStr,
      scenarioId: selectedScenario.id,
    };

    setIsActivelyRecording(false);
    setScoreResult(res);
    setSpeakState('SCORE_ANALYSIS');
  }, [stopRecording, getValidRecordings, selectedScenario]);

  // 3. 進入錄音畫面 (待命手動按開始)
  const handleEnterRecordingStage = useCallback(async () => {
    // 零延遲中斷任何示範發音與 TTS (A/B 41, 7.35 防串音污染錄音與 DTW)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      (window as any).__activeUtterance = null;
    }
    setIsVideoPlaying(false);
    setMuteInput(false);

    await unlockAudio();
    setIsActivelyRecording(false);
    setElapsedRecordTime(0);
    setSpeakState('RECORDING');
  }, [unlockAudio, setMuteInput]);

  // 手動 Toggle 錄音開關：點一次開始，再點一次結束 (A/B 55, 7.49 互鎖防禦, 7.50 12s 看門狗)
  const handleToggleRecording = useCallback(async () => {
    const now = performance.now();
    // 300ms 點擊互鎖防抖動
    if (now - lastToggleTimeRef.current < 300) {
      return;
    }
    lastToggleTimeRef.current = now;

    if (!isActivelyRecording) {
      // 點擊【開始錄音】
      await unlockAudio();
      setMuteInput(false);
      startRecording();
      setIsActivelyRecording(true);
      setElapsedRecordTime(0);

      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);

      const checkDuration = () => {
        const elapsed = getElapsedHardwareTime();
        setElapsedRecordTime(parseFloat(elapsed.toFixed(1)));

        // 12 秒安全看門狗上限 (Defense 7.50，防止離席佔線)
        if (elapsed >= 12.0) {
          finishRecording();
        } else {
          animFrameIdRef.current = requestAnimationFrame(checkDuration);
        }
      };

      animFrameIdRef.current = requestAnimationFrame(checkDuration);
    } else {
      // 點擊【結束錄音】
      finishRecording();
    }
  }, [isActivelyRecording, unlockAudio, setMuteInput, startRecording, getElapsedHardwareTime, finishRecording]);

  // 清除計時器
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, []);

  // 重置回到待機首頁 (Defense 7.31 清理 Blob 記憶體防洩漏)
  const handleRestart = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      (window as any).__activeUtterance = null;
    }
    setIsVideoPlaying(false);
    setMuteInput(false);
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    stopRecording();
    clearRecordedAudio(); // 釋放 Audio Blob 記憶體
    setIsActivelyRecording(false);
    setElapsedRecordTime(0);
    setScoreResult(null);
    setUserRecordedVolume(new Float32Array(0));
    setUserRecordedPitch(new Float32Array(0));
    setSpeakState('LANDING');
    // 自動重新取樣底噪 (A/B 32)
    calibrateNoiseFloor();
  }, [stopRecording, clearRecordedAudio, calibrateNoiseFloor, setMuteInput]);

  // 4. 全模態輸入事件分發聚合器 (A/B 28 Omni-Input Action Bus)
  const handleOmniAction = useCallback(
    (action: OmniActionType, _source: OmniInputSource, payload?: any) => {
      if (action === 'TOGGLE_REMOTE_DRAWER') {
        setIsMaintainerOpen((prev) => !prev);
        return;
      }

      if (action === 'RESTART') {
        handleRestart();
        return;
      }

      if (action === 'SELECT_SCENARIO') {
        if (typeof payload === 'number' && PROMPT_SCENARIOS[payload]) {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            (window as any).__activeUtterance = null;
          }
          setSelectedScenario(PROMPT_SCENARIOS[payload]);
        }
        return;
      }

      if (action === 'FORCE_SUBMIT') {
        if (speakState === 'RECORDING') {
          if (isActivelyRecording) {
            finishRecording();
          }
        }
        return;
      }

      if (action === 'START_RECORDING') {
        if (speakState === 'PROMPT_VIDEO' || speakState === 'LANDING') {
          handleEnterRecordingStage();
        } else if (speakState === 'RECORDING') {
          handleToggleRecording();
        }
        return;
      }

      if (action === 'PREV_STEP') {
        if (speakState === 'PROMPT_VIDEO' || speakState === 'SCORE_ANALYSIS') {
          setSpeakState('LANDING');
        }
        return;
      }

      if (action === 'NEXT_STEP') {
        if (speakState === 'LANDING') {
          unlockAudio().then(() => {
            setSpeakState('PROMPT_VIDEO');
          });
        } else if (speakState === 'PROMPT_VIDEO') {
          handleEnterRecordingStage();
        } else if (speakState === 'RECORDING') {
          handleToggleRecording();
        } else if (speakState === 'SCORE_ANALYSIS') {
          setSpeakState('EXPORT_CARD');
        } else if (speakState === 'EXPORT_CARD') {
          handleRestart();
        }
      }
    },
    [speakState, handleRestart, handleEnterRecordingStage, handleToggleRecording, isActivelyRecording, finishRecording, unlockAudio]
  );

  const { dispatchAction, lastActionSource, watchdogRemaining } = useOmniInput({
    currentState: speakState,
    audioMetrics,
    voiceTriggerLocked: isVideoPlaying,
    onAction: handleOmniAction,
    enableVoiceVad,
  });

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080808] text-white font-mono select-none">
      {/* 頂部全域狀態 HUD 列 */}
      <header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* 左側 LOGO & 模式指示 (連續點擊 5 次開啟維護者暗樁抽屜) */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => handleMaintainerTap(() => setIsMaintainerOpen(true))}
            className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-black text-sm tracking-tighter cursor-pointer active:scale-95 transition-transform"
            style={{ backgroundColor: selectedScenario.accentColor }}
            title="連續點擊 5 次開啟維護者暗樁抽屜"
          >
            SPK
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tracking-wider uppercase">
                SEE HOW YOU SPEAK
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/15">
                v2.7.0 TYPO-AGC
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tracking-widest">
              聲音動態字體 沉浸式互動裝置
            </p>
          </div>
        </div>

        {/* 中間情緒場景標籤 (僅在特定畫面顯現，避免與內部情境切換器疊圖衝突) */}
        {speakState === 'LANDING' && (
          <div className="hidden md:flex items-center gap-2 bg-black/50 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: selectedScenario.accentColor }}
            />
            <span className="text-xs font-mono font-bold" style={{ color: selectedScenario.accentColor }}>
              {selectedScenario.title.split('//')[0]}
            </span>
            <span className="text-xs text-zinc-500 font-mono">| {selectedScenario.emotion}</span>
          </div>
        )}

        {/* 右側切換與麥克風狀態 */}
        <div className="flex items-center gap-3">
          {/* 維護者暗樁快捷按鈕 */}
          <button
            onClick={() => setIsMaintainerOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="開啟全模態控制與遙控抽屜 (快速鍵 M)"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>全模態控制</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 border border-white/10 text-[11px] font-mono">
            <Mic
              className={`w-3.5 h-3.5 ${
                isListening ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'
              }`}
            />
            <span className="text-zinc-300">
              {isListening ? (enableVoiceVad ? '聲控待命中' : '收音中') : 'MIC 待命'}
            </span>
          </div>

          {onSwitchMode && (
            <button
              onClick={onSwitchMode}
              className="px-3 py-1 rounded border border-white/20 bg-white/5 hover:bg-white/15 text-[11px] text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="切換回 PULSE LAB 體感模式"
            >
              切換 PULSE LAB
            </button>
          )}
        </div>
      </header>

      {/* 狀態 1：LANDING (新媒體展演沉浸式主視覺畫面) */}
      {speakState === 'LANDING' && (
        <div
          onClick={() => dispatchAction('NEXT_STEP', 'touch')}
          className="relative w-full h-full flex flex-col justify-between p-8 md:p-12 z-20 cursor-pointer overflow-hidden transition-all duration-700 select-none group"
        >
          {/* 展場背景流體光暈與聲學共振核心 */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full blur-[160px] opacity-20 pointer-events-none transition-all duration-1000 group-hover:scale-110 group-hover:opacity-30"
            style={{ backgroundColor: selectedScenario.themeColor }}
          />

          {/* 展場四角精密十字準心與技術規格標註 */}
          <div className="absolute top-20 left-8 text-[11px] font-mono text-zinc-600 tracking-widest hidden md:block pointer-events-none">
            + [GRID: 01-ACOUSTIC] // KINETIC MATRIX<br />
            + [SAMPLE RATE: 48kHz] // COMPOSITOR ACCEL
          </div>
          <div className="absolute top-20 right-8 text-[11px] font-mono text-zinc-600 text-right tracking-widest hidden md:block pointer-events-none">
            + [CURATOR: LIN YU-AN] // TOP 1<br />
            + [SYSTEM: REACT 19 + WEB AUDIO]
          </div>
          <div className="absolute bottom-24 left-8 text-[11px] font-mono text-zinc-600 tracking-widest hidden md:block pointer-events-none">
            + [DTW ENGINE: 1D WARPING MATRIX]<br />
            + [POSTER SYNTHESIS: 1080x1920 9:16]
          </div>
          <div className="absolute bottom-24 right-8 text-[11px] font-mono text-zinc-600 text-right tracking-widest hidden md:block pointer-events-none">
            + [OMNI-INPUT: TOUCH / VAD / CLICKER / REMOTE]<br />
            + [STATUS: 60FPS IDLE MONITORING]
          </div>

          {/* 中央巨幅破版前衛字體 (Kinetic Typography Poster Style) */}
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 my-auto">
            {/* 展演代號標籤 */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/20 bg-white/5 backdrop-blur-md text-[11px] text-zinc-300 font-mono tracking-widest uppercase transition-all group-hover:border-white/40">
              <span
                className="w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: selectedScenario.accentColor }}
              />
              <span>IMMERSIVE AUDIO-VISUAL INSTALLATION</span>
            </div>

            {/* 巨型英文字標 */}
            <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter uppercase leading-[0.85] text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-white/30 drop-shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-transform duration-500 group-hover:scale-[1.02]">
              SEE HOW<br />
              <span
                style={{
                  color: selectedScenario.accentColor,
                  textShadow: `0 0 45px ${selectedScenario.themeColor}88`,
                }}
              >
                YOU SPEAK
              </span>
            </h1>

            {/* 中文核心概念字標 */}
            <div className="space-y-2 pt-2">
              <p className="text-2xl sm:text-4xl font-black tracking-[0.35em] text-white/90">
                看 你 怎 麼 說 話
              </p>
              <p className="text-xs sm:text-sm font-mono text-zinc-400 tracking-widest max-w-lg mx-auto">
                // 聲音的形狀，由你決定。傳統字幕記錄內容，此處看見情緒。
              </p>
            </div>

            {/* 聲學互動觸發光環 (Sonic Orb Trigger) */}
            <div className="pt-8">
              <div
                className="relative inline-flex items-center justify-center p-1 rounded-full border transition-all duration-500 group-hover:scale-105"
                style={{
                  borderColor: `${selectedScenario.accentColor}66`,
                  boxShadow: `0 0 30px ${selectedScenario.themeColor}44`,
                }}
              >
                <div
                  className="px-8 py-3.5 rounded-full font-mono font-black text-xs sm:text-sm tracking-[0.25em] uppercase flex items-center gap-3 transition-colors"
                  style={{
                    backgroundColor: selectedScenario.accentColor,
                    color: '#000000',
                  }}
                >
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>
                    {enableVoiceVad ? '開口說話或點擊任意處開始' : '點擊任意處開始體驗'} // ENTER
                  </span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </div>
          </div>

          {/* 底部情緒場景快速預選條 (Exhibition Scenario Switcher) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl mx-auto flex items-center justify-between gap-2 p-2 rounded-xl bg-black/60 border border-white/10 backdrop-blur-lg z-30"
          >
            <span className="text-[10px] font-mono text-zinc-500 px-3 tracking-widest uppercase hidden sm:inline">
              SELECT PRESET
            </span>
            <div className="flex-1 flex gap-1.5 overflow-x-auto">
              {PROMPT_SCENARIOS.map((sc, idx) => {
                const isActive = sc.id === selectedScenario.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => dispatchAction('SELECT_SCENARIO', 'touch', idx)}
                    className={`flex-1 min-w-[110px] py-2 px-2.5 rounded-lg text-left font-mono text-[11px] transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-white/15 border-white/60 text-white shadow-lg'
                        : 'bg-transparent border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: sc.accentColor }}
                      />
                      <span className="font-bold truncate">{sc.title.split('//')[0]}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 狀態 2：PROMPT_VIDEO (情境影片與原聲示範) */}
      {speakState === 'PROMPT_VIDEO' && (
        <PromptVideoView
          scenario={selectedScenario}
          scenarios={PROMPT_SCENARIOS}
          onSelectScenario={(sc) => {
            const idx = PROMPT_SCENARIOS.findIndex((s) => s.id === sc.id);
            dispatchAction('SELECT_SCENARIO', 'touch', idx >= 0 ? idx : 0);
          }}
          onReadyToRecord={() => dispatchAction('START_RECORDING', 'touch')}
          onPlayStateChange={setIsVideoPlaying}
        />
      )}

      {/* 狀態 3：RECORDING (即時錄音與字體渲染) */}
      {speakState === 'RECORDING' && (
        <div className="relative w-full h-full flex flex-col justify-between p-6 z-20">
          {/* 背景 2.5D Canvas 音訊粒子與核心 */}
          <VoiceVisualizer3D
            audioMetrics={audioMetrics}
            themeColor={selectedScenario.themeColor}
            accentColor={selectedScenario.accentColor}
          />

          {/* 預留 TouchDesigner/AE 視訊疊層 */}
          <DynamicMediaOverlay
            audioMetrics={audioMetrics}
          />

          {/* 錄音頂部狀態 HUD (A/B 55 手動 Toggle 狀態與時長顯示) */}
          <div className="relative z-30 flex items-center justify-between pt-16 px-4">
            <div className="flex items-center gap-3 bg-black/60 border border-white/15 px-4 py-2 rounded-full backdrop-blur-md">
              <span
                className={`w-3 h-3 rounded-full ${
                  isActivelyRecording ? 'bg-rose-500 animate-ping' : 'bg-amber-400'
                }`}
              />
              <span
                className={`text-xs font-mono font-bold ${
                  isActivelyRecording ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {isActivelyRecording ? 'REC 正在錄音模仿中' : 'STANDBY 待命錄音中'}
              </span>
              <span className="text-xs font-mono text-zinc-400">|</span>
              <span className="text-xs font-mono text-white">
                {isActivelyRecording
                  ? `已錄製 ${elapsedRecordTime.toFixed(1)} 秒 (上限 12s)`
                  : '請點擊下方按鈕開始'}
              </span>
            </div>

            {/* 即時音高與音量數據 */}
            <div className="flex items-center gap-3 bg-black/60 border border-white/15 px-4 py-2 rounded-full backdrop-blur-md text-xs font-mono">
              <span className="text-zinc-400">
                VOL: <b className="text-white">{Math.round(audioMetrics.smoothVolume)}%</b>
              </span>
              <span className="text-zinc-400">
                PITCH: <b style={{ color: selectedScenario.accentColor }}>{Math.round(audioMetrics.pitchHz)} Hz</b>
              </span>
              <span className="text-zinc-500">
                GATE: {audioMetrics.isVoiceActive ? '語音觸發' : '環境底噪'}
              </span>
            </div>
          </div>

          {/* 中央動態字體展示區 (CSS 直通管線 60fps) */}
          <div className="relative z-30 flex-1 flex flex-col items-center justify-center px-4">
            <KineticTypography
              text={selectedScenario.line}
              audioMetrics={audioMetrics}
              noiseFloor={noiseFloor}
              themeColor={selectedScenario.themeColor}
              accentColor={selectedScenario.accentColor}
            />

            <p className="mt-8 text-xs font-mono text-zinc-400 tracking-wider">
              {isActivelyRecording
                ? '✦ 用你的情緒與聲調 大聲喊出這句話，說完後點擊結束 ✦'
                : '✦ 請點擊下方「開始錄音」，對著麥克風大聲模仿 ✦'}
            </p>
          </div>

          {/* 底部控制器 (手動 Toggle：點擊開始 ➔ 點擊結束，A/B 55) */}
          <div className="relative z-30 flex items-center justify-center pb-8 gap-4">
            {!isActivelyRecording ? (
              <button
                onClick={handleToggleRecording}
                className="px-8 py-4 rounded-full font-mono text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-3 transition-all cursor-pointer shadow-xl active:scale-95 hover:brightness-110"
                style={{
                  backgroundColor: selectedScenario.accentColor,
                  color: '#000000',
                  boxShadow: `0 0 30px ${selectedScenario.themeColor}88`,
                }}
              >
                <Mic className="w-4 h-4 animate-pulse" />
                <span>點擊開始錄音 (START RECORDING)</span>
              </button>
            ) : (
              <button
                onClick={handleToggleRecording}
                className="px-8 py-4 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white font-mono text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-3 transition-all cursor-pointer shadow-[0_0_35px_rgba(244,63,94,0.6)] active:scale-95 animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>正在錄音中... 點擊結束 (FINISH & SCORE)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 狀態 4：SCORE_ANALYSIS (DTW 結算分析) */}
      {speakState === 'SCORE_ANALYSIS' && scoreResult && (
        <ScoreAnalysisView
          scoreResult={scoreResult}
          scenario={selectedScenario}
          userAudioUrl={userAudioUrl}
          onProceedToExport={() => dispatchAction('NEXT_STEP', 'touch')}
          onTryAgain={() => dispatchAction('START_RECORDING', 'touch')}
          onPlayStateChange={setMuteInput}
        />
      )}

      {/* 狀態 5：EXPORT_CARD (1080x1920 海報生成與掃碼) */}
      {speakState === 'EXPORT_CARD' && scoreResult && (
        <SpeakExportModal
          scoreResult={scoreResult}
          scenario={selectedScenario}
          userVolumeSlice={userRecordedVolume}
          userPitchSlice={userRecordedPitch}
          userAudioUrl={userAudioUrl}
          onRestart={() => dispatchAction('RESTART', 'touch')}
          onPlayStateChange={setMuteInput}
        />
      )}

      {/* 維護者暗樁調試抽屜 (連續 5 次點擊 Logo 或按 M 鍵開啟) */}
      <MaintainerDrawer
        isOpen={isMaintainerOpen}
        onClose={() => setIsMaintainerOpen(false)}
        noiseFloor={noiseFloor}
        onCalibrateNoise={calibrateNoiseFloor}
        lastActionSource={lastActionSource}
        watchdogRemaining={watchdogRemaining}
        enableVoiceVad={enableVoiceVad}
        onToggleVoiceVad={() => setEnableVoiceVad((prev) => !prev)}
      />
    </div>
  );
};
