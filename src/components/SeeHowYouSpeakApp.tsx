import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import type { SpeakState, ScoreResult, PromptScenario, AudioMetrics } from '../types/speak';
import type { OmniActionType, OmniInputSource } from '../types/omniInput';
import { PROMPT_SCENARIOS, SCENARIO_TAGS, type ScenarioTagMeta } from '../config/speakScenarios';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import { useOmniInput } from '../hooks/useOmniInput';
import { KineticTypography } from './KineticTypography';
import { VoiceVisualizer3D } from './VoiceVisualizer3D';
import { resolveScenarioCharIndex } from './PromptVideoView';
import { SpeakExportModal, buildSpeakShareUrl } from './SpeakExportModal';
import { MaintainerDrawer } from './MaintainerDrawer';
import { compareVoiceDTW } from '../utils/audioDTW';
import { handleMaintainerTap } from '../utils/kioskLock';
import {
  Mic,
  Volume2,
  VolumeX,
  Play,
  Square,
  Radio,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  CheckCircle2,
  Activity,
} from 'lucide-react';

interface SeeHowYouSpeakAppProps {
  onSwitchMode?: () => void;
}

type CoverflowItem =
  | { kind: 'tag'; id: string; tag: ScenarioTagMeta; firstScenarioIdx: number }
  | { kind: 'scenario'; id: string; scenario: PromptScenario; tagIdx: number };

const EMPTY_FREQ = new Uint8Array(32);
const EMPTY_WAVE = new Float32Array(32);

const DEFAULT_DEMO_METRICS: AudioMetrics = {
  rawVolume: 0,
  smoothVolume: 0,
  pitchHz: 150,
  pitchNormalized: 0.4,
  pitchYOffset: 0,
  sustainedDuration: 0,
  isSustained: false,
  isStaccato: false,
  isVoiceActive: false,
  frequencyData: EMPTY_FREQ,
  waveform: EMPTY_WAVE,
  f0MacroHz: 150,
  deltaRms: 0,
  deltaF0: 0,
  jitter: 0,
  hnrDb: 18,
  pauseDurationMs: 0,
};

function trimSilenceMargins(
  vol: Float32Array,
  pitch: Float32Array,
  floor: number
): { volTrimmed: Float32Array; pitchTrimmed: Float32Array } {
  const gate = Math.max(8, floor * 0.75);
  let start = -1;
  let end = -1;
  for (let i = 0; i < vol.length; i++) {
    if (vol[i] > gate) {
      if (start === -1) start = i;
      end = i;
    }
  }
  if (start === -1 || end - start < 20) {
    return { volTrimmed: vol, pitchTrimmed: pitch };
  }
  const s = Math.max(0, start - 6);
  const e = Math.min(vol.length, end + 8);
  return {
    volTrimmed: vol.subarray(s, e),
    pitchTrimmed: pitch.subarray(s, e),
  };
}

export const SeeHowYouSpeakApp: React.FC<SeeHowYouSpeakAppProps> = ({ onSwitchMode }) => {
  const [speakState, setSpeakState] = useState<SpeakState>('LANDING');
  const [selectedScenario, setSelectedScenario] = useState<PromptScenario>(PROMPT_SCENARIOS[0]);

  // Slide 2: 太鼓達人單一水平列 Coverflow 狀態 ([TAG Header] -> [Scenario 1] -> [Scenario 2] -> [TAG Header]...)
  const coverflowRail = useMemo<CoverflowItem[]>(() => {
    const items: CoverflowItem[] = [];
    SCENARIO_TAGS.forEach((tag, tIdx) => {
      const tagScenarios = PROMPT_SCENARIOS.filter((s) => s.tagId === tag.id);
      const firstIdx = items.length + 1;
      items.push({
        kind: 'tag',
        id: tag.id,
        tag,
        firstScenarioIdx: Math.min(firstIdx, items.length + Math.max(1, tagScenarios.length)),
      });
      tagScenarios.forEach((sc) => {
        items.push({
          kind: 'scenario',
          id: sc.id,
          scenario: sc,
          tagIdx: tIdx,
        });
      });
    });
    return items;
  }, []);

  const [railIndex, setRailIndex] = useState<number>(1); // 預設對準第一張具體情境卡 (達達)
  const [previewMuted, setPreviewMuted] = useState<boolean>(true);
  const [previewDemoMetrics, setPreviewDemoMetrics] = useState<AudioMetrics>(DEFAULT_DEMO_METRICS);
  const [previewActiveCharIndex, setPreviewActiveCharIndex] = useState<number>(-1);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const wheelCooldownRef = useRef<number>(0);

  // Slide 3: READY ? -> 3 -> 2 -> 1 與最多 15 秒錄音 (5 秒後顯示 RESULT.)
  const [readyStep, setReadyStep] = useState<'READY' | '3' | '2' | '1' | 'LIVE'>('READY');
  const [isActivelyRecording, setIsActivelyRecording] = useState<boolean>(false);
  const [elapsedRecordTime, setElapsedRecordTime] = useState<number>(0);
  const [recordProgress, setRecordProgress] = useState<number>(0);
  const [showRefPip, setShowRefPip] = useState<boolean>(false);

  // Slides 4–6: 統一三階段 Cytus II 滾輪驅動結算流 (0: % Surge, 1: TAKE a LOOK., 2: QR CODE & flow back~)
  const [resultSubStage, setResultSubStage] = useState<0 | 1 | 2>(0);
  const [animatedScore, setAnimatedScore] = useState<number>(0);
  const [showFlowBack, setShowFlowBack] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [userRecordedVolume, setUserRecordedVolume] = useState<Float32Array>(new Float32Array(0));
  const [userRecordedPitch, setUserRecordedPitch] = useState<Float32Array>(new Float32Array(0));

  // 原音回放狀態
  const [isPlayingUserVoice, setIsPlayingUserVoice] = useState<boolean>(false);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);

  // 維護者抽屜與全模態狀態 (預設關閉 Landing 聲控誤觸以保留麥克風首頁互動)
  const [isMaintainerOpen, setIsMaintainerOpen] = useState(false);
  const [enableVoiceVad, setEnableVoiceVad] = useState(false);
  const [isVideoPlayingUnmuted, setIsVideoPlayingUnmuted] = useState(false);

  const {
    audioMetrics,
    isListening,
    isCalibratingBaseline,
    baselineProfile,
    noiseFloor,
    userAudioUrl,
    getValidRecordings,
    startRecording,
    stopRecording,
    unlockAudio,
    setMuteInput,
    calibrateNoiseFloor,
    calibratePersonalBaseline,
    getElapsedHardwareTime,
    clearRecordedAudio,
  } = useAudioAnalyzer();

  const animFrameIdRef = useRef<number | null>(null);

  // 1. 展演環境鎖定滾動 + 檢查既有麥克風授權以實現首頁零延遲球體聲波交互
  useEffect(() => {
    document.body.classList.add('kiosk-locked');

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((res) => {
          if (res.state === 'granted') {
            unlockAudio().catch(() => {});
          }
        })
        .catch(() => {});
    }

    return () => {
      document.body.classList.remove('kiosk-locked');
    };
  }, [unlockAudio]);

  // 影片有聲播放或個人原音回放期間軟體靜音麥克風 (防喇叭迴音自激)
  useEffect(() => {
    setMuteInput(isVideoPlayingUnmuted || isPlayingUserVoice);
  }, [isVideoPlayingUnmuted, isPlayingUserVoice, setMuteInput]);

  // 選取 Coverflow 軌道項目並同步情境
  const activeRailItem = coverflowRail[railIndex] || coverflowRail[0];

  const moveRailTo = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(coverflowRail.length - 1, nextIdx));
      setRailIndex(clamped);
      const item = coverflowRail[clamped];
      if (item?.kind === 'scenario') {
        setSelectedScenario(item.scenario);
      }
      setIsVideoPlayingUnmuted(false);
    },
    [coverflowRail]
  );

  // 2. Slide 2 Coverflow 預覽影片同步 MATS 動態字幕與多循環詞彙驅動 (如達達 40.8s 的 6 次喊叫)
  useEffect(() => {
    if (speakState !== 'PROMPT_VIDEO' || activeRailItem?.kind !== 'scenario') {
      return;
    }

    const sc = activeRailItem.scenario;
    let rafId: number;

    const tickPreview = () => {
      rafId = requestAnimationFrame(tickPreview);
      const vid = previewVideoRef.current;
      if (!vid || !vid.duration) return;

      const curTime = vid.currentTime;
      const progress = Math.max(0, Math.min(1, curTime / vid.duration));
      const charIdx = resolveScenarioCharIndex(sc, curTime, progress);
      setPreviewActiveCharIndex(charIdx);

      const isActiveSpeech = charIdx >= 0 && charIdx < Array.from(sc.line).length;
      const volCurve = sc.referenceVolumeCurve || [30, 75, 95, 65, 30];
      const pitchCurve = sc.referencePitchCurve || [0.4, 0.7, 0.9, 0.6, 0.4];
      const fIdx = progress * (volCurve.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(volCurve.length - 1, i0 + 1);
      const r = fIdx - i0;
      const baseVol = volCurve[i0] + (volCurve[i1] - volCurve[i0]) * r;
      const vol = isActiveSpeech ? Math.max(55, baseVol) : baseVol * 0.45;
      const pNorm = pitchCurve[i0] + (pitchCurve[i1] - pitchCurve[i0]) * r;

      setPreviewDemoMetrics({
        ...DEFAULT_DEMO_METRICS,
        rawVolume: vol,
        smoothVolume: Math.round(vol),
        pitchHz: Math.round(90 + pNorm * 250),
        pitchNormalized: pNorm,
        pitchYOffset: Math.round((pNorm - 0.5) * -28),
        sustainedDuration: isActiveSpeech && pNorm > 0.7 ? 0.65 : 0.1,
        isVoiceActive: isActiveSpeech || vol > 25,
        deltaRms: isActiveSpeech ? 0.45 : 0,
        deltaF0: pNorm - 0.5,
      });
    };

    rafId = requestAnimationFrame(tickPreview);
    return () => cancelAnimationFrame(rafId);
  }, [speakState, activeRailItem]);

  // 3. 結算演算法：錄音結束時提取主動發言切片與 MATS 摘要進入 Slides 4-6
  const finishRecording = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    stopRecording();
    setIsActivelyRecording(false);

    const { volume, pitch, matsSummary } = getValidRecordings();
    const { volTrimmed, pitchTrimmed } = trimSilenceMargins(volume, pitch, noiseFloor);

    setUserRecordedVolume(volTrimmed);
    setUserRecordedPitch(pitchTrimmed);

    const nowStr = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const dtwResult =
      volTrimmed.length < 15
        ? {
            overallScore: 62,
            volumeScore: 60,
            pitchScore: 64,
            rank: 'A' as const,
            rankTitle: '微聲探索者 (WHISPER SEED)',
            comment: '檢測到微弱環境與氣聲信號，建議靠近麥克風放大聲量張力！',
          }
        : compareVoiceDTW(
            volTrimmed,
            pitchTrimmed,
            selectedScenario.referenceVolumeCurve,
            selectedScenario.referencePitchCurve
          );

    const finalRes: ScoreResult = {
      overallScore: dtwResult.overallScore,
      volumeScore: dtwResult.volumeScore,
      pitchScore: dtwResult.pitchScore,
      rank: dtwResult.rank,
      rankTitle: dtwResult.rankTitle,
      comment: dtwResult.comment,
      verificationCode: `SPK-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: nowStr,
      scenarioId: selectedScenario.id,
      matsMetrics: matsSummary,
    };

    setScoreResult(finalRes);
    setResultSubStage(0);
    setShowFlowBack(false);
    setShowDetailModal(false);
    setSpeakState('SCORE_ANALYSIS');
  }, [stopRecording, getValidRecordings, noiseFloor, selectedScenario]);

  // 4. 進入 Slide 3: 先跑 READY ? -> 3 -> 2 -> 1，倒數完畢自動開啟最長 15 秒錄音
  const enterRecordingStage = useCallback(async () => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
    }
    setIsVideoPlayingUnmuted(false);
    setIsPlayingUserVoice(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    await unlockAudio();
    setMuteInput(false);
    setIsActivelyRecording(false);
    setElapsedRecordTime(0);
    setRecordProgress(0);
    setReadyStep('READY');
    setSpeakState('RECORDING');
  }, [unlockAudio, setMuteInput]);

  // Slide 3 READY ? -> 3 -> 2 -> 1 時間軸與 15 秒錄音硬體時鐘
  useEffect(() => {
    if (speakState !== 'RECORDING') return;

    let cancelled = false;
    const timers: number[] = [];

    const beginActiveCapture = async () => {
      if (cancelled) return;
      await unlockAudio();
      setMuteInput(false);
      startRecording();
      setReadyStep('LIVE');
      setIsActivelyRecording(true);
      setElapsedRecordTime(0);
      setRecordProgress(0);

      const MAX_RECORD_SEC = 15.0;
      const tick = () => {
        if (cancelled) return;
        const elapsed = getElapsedHardwareTime();
        setElapsedRecordTime(Number(elapsed.toFixed(1)));
        setRecordProgress(Math.min(100, (elapsed / MAX_RECORD_SEC) * 100));

        if (elapsed >= MAX_RECORD_SEC) {
          finishRecording();
        } else {
          animFrameIdRef.current = requestAnimationFrame(tick);
        }
      };
      animFrameIdRef.current = requestAnimationFrame(tick);
    };

    timers.push(window.setTimeout(() => !cancelled && setReadyStep('3'), 850));
    timers.push(window.setTimeout(() => !cancelled && setReadyStep('2'), 1550));
    timers.push(window.setTimeout(() => !cancelled && setReadyStep('1'), 2250));
    timers.push(window.setTimeout(() => !cancelled && beginActiveCapture(), 2950));

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [speakState, unlockAudio, setMuteInput, startRecording, getElapsedHardwareTime, finishRecording]);

  // 5. Slide 4 -> 5 -> 6 動畫與計時控制 (% 數字計數從模糊到清晰 + 自動推動 + 5秒後顯示 flow back~)
  useEffect(() => {
    if (speakState !== 'SCORE_ANALYSIS' || !scoreResult) return;

    let rafId: number;
    const start = performance.now();
    const target = scoreResult.overallScore;
    const duration = 1350;

    const animateNum = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedScore(Math.round(target * eased));
      if (p < 1) {
        rafId = requestAnimationFrame(animateNum);
      }
    };
    rafId = requestAnimationFrame(animateNum);

    // 2.6 秒後若尚在 Slide 4 (%)，順暢滑向 Slide 5 (TAKE a LOOK.)
    const autoStageTimer = window.setTimeout(() => {
      setResultSubStage((prev) => (prev === 0 ? 1 : prev));
    }, 2600);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(autoStageTimer);
    };
  }, [speakState, scoreResult]);

  const goToResultSubStage = useCallback((nextOrUpdater: 0 | 1 | 2 | ((prev: 0 | 1 | 2) => 0 | 1 | 2)) => {
    setResultSubStage((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      if (next !== 2) {
        setShowFlowBack(false);
      }
      return next;
    });
  }, []);

  // 進入 Slide 6 (QR CODE) 五秒後才優雅浮現底部 "flow back~" 按鈕 (符合 Canva Slide 4 設計腳本)
  useEffect(() => {
    if (speakState !== 'SCORE_ANALYSIS' || resultSubStage !== 2) {
      return;
    }
    const flowTimer = window.setTimeout(() => {
      setShowFlowBack(true);
    }, 5000);
    return () => clearTimeout(flowTimer);
  }, [speakState, resultSubStage]);

  // 6. 重置回到 Slide 1 (flow back~)
  const handleRestart = useCallback(() => {
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
    }
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    setIsPlayingUserVoice(false);
    setIsVideoPlayingUnmuted(false);
    setMuteInput(false);
    stopRecording();
    clearRecordedAudio();
    setIsActivelyRecording(false);
    setElapsedRecordTime(0);
    setScoreResult(null);
    setResultSubStage(0);
    setShowFlowBack(false);
    setShowDetailModal(false);
    setSpeakState('LANDING');
    calibrateNoiseFloor();
  }, [stopRecording, clearRecordedAudio, calibrateNoiseFloor, setMuteInput]);

  // 原音回放控制 (Zero-Feedback Mic Mute)
  const toggleReplayUserVoice = useCallback(() => {
    if (!userAudioUrl) return;
    if (isPlayingUserVoice && replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current.currentTime = 0;
      setIsPlayingUserVoice(false);
      return;
    }
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
    }
    const audio = new Audio(userAudioUrl);
    replayAudioRef.current = audio;
    audio.onended = () => setIsPlayingUserVoice(false);
    audio.onerror = () => setIsPlayingUserVoice(false);
    setIsPlayingUserVoice(true);
    audio.play().catch(() => setIsPlayingUserVoice(false));
  }, [userAudioUrl, isPlayingUserVoice]);

  // 7. Cytus II 滾輪驅動控制器 (Slide 1 -> Slide 2, Slide 2 Coverflow 水平移動, Slide 4/5/6 三階轉場)
  const handleGlobalWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (isMaintainerOpen || showDetailModal) return;

      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < 12) return;

      const now = performance.now();
      if (now - wheelCooldownRef.current < 190) return;
      wheelCooldownRef.current = now;

      const dir = delta > 0 ? 1 : -1;

      if (speakState === 'LANDING' && dir > 0) {
        unlockAudio().catch(() => {});
        setSpeakState('PROMPT_VIDEO');
        return;
      }

      if (speakState === 'PROMPT_VIDEO') {
        moveRailTo(railIndex + dir);
        return;
      }

      if (speakState === 'SCORE_ANALYSIS') {
        goToResultSubStage((prev) => Math.max(0, Math.min(2, prev + dir)) as 0 | 1 | 2);
      }
    },
    [speakState, railIndex, moveRailTo, goToResultSubStage, isMaintainerOpen, showDetailModal, unlockAudio]
  );

  // 8. Omni-Input 整合遙控與快捷鍵
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
      if (action === 'SELECT_SCENARIO' && typeof payload === 'number' && PROMPT_SCENARIOS[payload]) {
        const sc = PROMPT_SCENARIOS[payload];
        setSelectedScenario(sc);
        const foundIdx = coverflowRail.findIndex(
          (item) => item.kind === 'scenario' && item.scenario.id === sc.id
        );
        if (foundIdx >= 0) moveRailTo(foundIdx);
        return;
      }
      if (action === 'FORCE_SUBMIT' && speakState === 'RECORDING' && isActivelyRecording) {
        finishRecording();
        return;
      }
      if (action === 'START_RECORDING') {
        enterRecordingStage();
        return;
      }
      if (action === 'PREV_STEP') {
        if (speakState === 'PROMPT_VIDEO') {
          moveRailTo(railIndex - 1);
        } else if (speakState === 'SCORE_ANALYSIS') {
          goToResultSubStage((prev) => Math.max(0, prev - 1) as 0 | 1 | 2);
        }
        return;
      }
      if (action === 'NEXT_STEP') {
        if (speakState === 'LANDING') {
          unlockAudio().catch(() => {});
          setSpeakState('PROMPT_VIDEO');
        } else if (speakState === 'PROMPT_VIDEO') {
          if (activeRailItem?.kind === 'tag') {
            moveRailTo(railIndex + 1);
          } else {
            enterRecordingStage();
          }
        } else if (speakState === 'RECORDING') {
          if (isActivelyRecording && elapsedRecordTime >= 5.0) {
            finishRecording();
          }
        } else if (speakState === 'SCORE_ANALYSIS') {
          if (resultSubStage < 2) {
            goToResultSubStage((prev) => (prev + 1) as 0 | 1 | 2);
          } else if (showFlowBack) {
            handleRestart();
          }
        }
      }
    },
    [
      speakState,
      coverflowRail,
      railIndex,
      moveRailTo,
      goToResultSubStage,
      activeRailItem,
      isActivelyRecording,
      elapsedRecordTime,
      resultSubStage,
      showFlowBack,
      handleRestart,
      finishRecording,
      enterRecordingStage,
      unlockAudio,
    ]
  );

  const { lastActionSource, watchdogRemaining } = useOmniInput({
    currentState: speakState,
    audioMetrics,
    voiceTriggerLocked: isVideoPlayingUnmuted || isPlayingUserVoice,
    onAction: handleOmniAction,
    enableVoiceVad,
  });

  // 結算海報 QR Code URL (與 SpeakExportModal 共用統一規範，離線攜帶聲學 DNA 切片)
  const shareQrUrl = useMemo(() => {
    if (!scoreResult) return '';
    return buildSpeakShareUrl({
      scoreResult,
      scenario: selectedScenario,
      uploadedImageUrl: null,
      userVolumeSlice: userRecordedVolume,
      userPitchSlice: userRecordedPitch,
    });
  }, [scoreResult, selectedScenario, userRecordedVolume, userRecordedPitch]);

  // 跳轉到指定 TAG 類別標題或第一支片段
  const handleJumpToTag = (tagId: string) => {
    const idx = coverflowRail.findIndex((item) => item.kind === 'tag' && item.tag.id === tagId);
    if (idx >= 0) {
      moveRailTo(idx);
    }
  };

  // Slide 2 當前高亮 TAG index
  const activeTagIdx = useMemo(() => {
    if (!activeRailItem) return 0;
    if (activeRailItem.kind === 'tag') {
      return SCENARIO_TAGS.findIndex((t) => t.id === activeRailItem.tag.id);
    }
    return activeRailItem.tagIdx;
  }, [activeRailItem]);

  // Slide 1 水面倒影微動態波形位移 (純函數推導，0 Render Impurity)
  const reflectionWaveShift = audioMetrics.isVoiceActive
    ? Math.max(-5, Math.min(5, audioMetrics.pitchYOffset * 0.22))
    : 0;

  return (
    <div
      onWheel={handleGlobalWheel}
      className="relative w-screen h-screen overflow-hidden bg-white text-black select-none"
    >
      {/* 貫穿全流程 6 頁的 Figma 極簡黑白 Looper 粒子球 + 流體波浪畫布 */}
      <VoiceVisualizer3D
        audioMetrics={audioMetrics}
        aestheticMode="figma-monochrome"
        stage={speakState}
        scoreValue={scoreResult?.overallScore ?? 67}
        resultSubStage={resultSubStage}
      />

      {/* 極簡隱蔽式頂部列 (不破壞純白 Figma 視覺，僅於邊緣提供收音狀態與系統校準) */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-8 py-3 pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <button
            onClick={() => handleMaintainerTap(() => setIsMaintainerOpen(true))}
            className="w-7 h-7 rounded-full border border-black/20 bg-white/75 backdrop-blur-md flex items-center justify-center font-iosevka text-[10px] font-bold text-black/80 hover:border-black cursor-pointer transition-all"
            title="連續點擊 5 次開啟維護者抽屜"
          >
            SPK
          </button>
          <span className="hidden sm:inline-block font-iosevka text-[10px] tracking-[0.2em] text-black/45 uppercase">
            MATS v1.0 // Acoustic Typography
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* 個人化基準線快速校準 (僅在 Landing 顯示，A/B 02) */}
          {speakState === 'LANDING' && (
            <button
              onClick={calibratePersonalBaseline}
              disabled={isCalibratingBaseline}
              className="px-3 py-1 rounded-full bg-white/75 hover:bg-white border border-black/15 text-[10px] font-iosevka text-black/75 flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-all"
              title="對準麥克風自然唸一句話 2 秒，校準個人專屬 ΔF0 / ΔRMS 基準"
            >
              {isCalibratingBaseline ? (
                <>
                  <Activity className="w-3 h-3 animate-pulse text-black" />
                  <span>正在採樣自然說話聲 2s...</span>
                </>
              ) : baselineProfile.isCalibrated ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-black" />
                  <span>個人基準已校準 ({baselineProfile.f0Base}Hz)</span>
                </>
              ) : (
                <>
                  <Activity className="w-3 h-3 text-black/50" />
                  <span>2s 個人聲學基準校準</span>
                </>
              )}
            </button>
          )}

          {/* 麥克風收音確認微章 (貫穿全流程) */}
          <button
            onClick={() => unlockAudio()}
            className="px-3 py-1 rounded-full bg-white/75 hover:bg-white border border-black/15 text-[10px] font-iosevka text-black/80 flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-all"
            title="點擊啟用 / 確認麥克風即時收音交互"
          >
            <Mic className={`w-3 h-3 ${isListening ? 'text-black' : 'text-black/40'}`} />
            <span
              className={`w-1.5 h-1.5 rounded-full transition-transform ${
                audioMetrics.isVoiceActive ? 'bg-black scale-125' : isListening ? 'bg-black/50' : 'bg-black/20'
              }`}
            />
            <span>
              {isListening
                ? `${Math.round(audioMetrics.smoothVolume)}% · ${audioMetrics.f0MacroHz ?? audioMetrics.pitchHz}Hz`
                : '啟用 MIC 互動'}
            </span>
          </button>

          <button
            onClick={() => setIsMaintainerOpen(true)}
            className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 hover:bg-white border border-black/15 text-[10px] font-iosevka text-black/60 hover:text-black cursor-pointer transition-all"
            title="維護者控制台 (快速鍵 M)"
          >
            <Radio className="w-3 h-3" />
          </button>

          {onSwitchMode && (
            <button
              onClick={onSwitchMode}
              className="hidden lg:inline-block px-2.5 py-1 rounded-full bg-white/70 hover:bg-white border border-black/15 text-[10px] font-iosevka text-black/55 hover:text-black cursor-pointer transition-all"
            >
              PULSE LAB
            </button>
          )}
        </div>
      </header>

      {/* ================================================================
          SLIDE 1: LANDING (Figma Slide 16:9 - 1, node 5:3)
          標題 + 水平聲波倒影 + 粒子線框球即時語音互動 + 底部發光 START.
         ================================================================ */}
      <AnimatePresence mode="wait">
        {speakState === 'LANDING' && (
          <motion.section
            key="slide-1-landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.45 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6"
          >
            {/* 中央主標題與水面鏡像倒影 */}
            <div className="relative flex flex-col items-center justify-center select-none pointer-events-none">
              <motion.h1
                animate={{
                  y: audioMetrics.isVoiceActive ? -(audioMetrics.smoothVolume / 100) * 8 : 0,
                  scale: audioMetrics.isVoiceActive ? 1 + (audioMetrics.smoothVolume / 100) * 0.04 : 1,
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="font-yuji text-[clamp(2.1rem,5.2vw,4.125rem)] leading-[1.08] text-black tracking-tight text-center drop-shadow-[0_0_24px_rgba(255,255,255,0.9)]"
              >
                See How You Speak.
              </motion.h1>

              {/* 水面水平交界微留白，對應後方聲波水平線 y ≈ 48.5% */}
              <div className="h-5 sm:h-7" />

              {/* 上下翻轉鏡像倒影，隨聲音微幅漣漪搖晃 */}
              <div
                aria-hidden="true"
                className="font-yuji text-[clamp(2.1rem,5.2vw,4.125rem)] leading-[1.08] text-black/75 tracking-tight text-center water-reflection-mask"
                style={{
                  transform: `scaleY(-1) translateX(${reflectionWaveShift.toFixed(1)}px)`,
                  filter: `blur(${audioMetrics.isVoiceActive ? 1.8 : 1.1}px)`,
                }}
              >
                See How You Speak.
              </div>
            </div>

            {/* 底部發光白暈圓膠囊 START. 按鈕 (Figma 8:7459 & 8:7477) */}
            <motion.button
              onClick={async () => {
                await unlockAudio().catch(() => {});
                setSpeakState('PROMPT_VIDEO');
              }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              className="absolute bottom-[7vh] sm:bottom-[8.5vh] left-1/2 -translate-x-1/2 w-[232px] h-[96px] glow-pill-white flex items-center justify-center cursor-pointer group"
            >
              <span className="font-iosevka text-[30px] sm:text-[36px] font-medium text-black tracking-[0.04em] transition-transform group-hover:tracking-[0.08em]">
                START.
              </span>
            </motion.button>

            <span className="fixed bottom-3 left-1/2 -translate-x-1/2 font-iosevka text-[10px] tracking-[0.22em] text-black/45 pointer-events-none">
              SPEAK TO TEST MIC · CLICK START OR SCROLL TO ENTER
            </span>
          </motion.section>
        )}

        {/* ================================================================
            SLIDE 2: PROMPT_VIDEO (Figma Slide 16:9 - 2, node 8:7478)
            太鼓達人單一水平排列 ([TAG] -> [1.] -> [2.] -> [TAG]...) + 滾輪與左鍵選擇
           ================================================================ */}
        {speakState === 'PROMPT_VIDEO' && (
          <motion.section
            key="slide-2-coverflow"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.45 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-between pt-14 pb-6 px-4 sm:px-8"
          >
            {/* 頂部操作輔助列 */}
            <div className="w-full max-w-6xl flex items-center justify-between text-[11px] font-iosevka text-black/60">
              <button
                onClick={() => setSpeakState('LANDING')}
                className="px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-black/15 cursor-pointer transition-all"
              >
                ← FLOW BACK
              </button>
              <span className="hidden sm:inline tracking-[0.18em] uppercase">
                MOUSE WHEEL SCROLL · CLICK CARD TO SELECT ({railIndex + 1}/{coverflowRail.length})
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveRailTo(railIndex - 1)}
                  disabled={railIndex === 0}
                  className="p-1.5 rounded-full bg-white/75 border border-black/15 disabled:opacity-30 cursor-pointer hover:bg-white"
                  aria-label="上一張卡片"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveRailTo(railIndex + 1)}
                  disabled={railIndex === coverflowRail.length - 1}
                  className="p-1.5 rounded-full bg-white/75 border border-black/15 disabled:opacity-30 cursor-pointer hover:bg-white"
                  aria-label="下一張卡片"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 中央 3D 層疊 Coverflow 視窗 (Figma 8:7480 / 12:8445 / 12:8451 / LooperGroup) */}
            <div className="relative w-full max-w-6xl flex-1 flex items-center justify-center my-2 perspective-[1200px]">
              {coverflowRail.map((item, idx) => {
                const offset = idx - railIndex;
                if (Math.abs(offset) > 3) return null;

                const isCenter = offset === 0;
                const absOff = Math.abs(offset);
                const translateXPercent = offset * 28 + (offset > 0 ? 6 : offset < 0 ? -6 : 0);
                const scale = isCenter ? 1.0 : absOff === 1 ? 0.84 : absOff === 2 ? 0.72 : 0.62;
                const zIndex = 30 - absOff * 5;
                const bgTone = isCenter
                  ? item.kind === 'tag'
                    ? '#262626'
                    : '#E2E2E2'
                  : absOff === 1
                  ? '#B8B8B8'
                  : absOff === 2
                  ? '#8F8F8F'
                  : '#666666';

                return (
                  <motion.div
                    key={item.id}
                    initial={false}
                    animate={{
                      x: `${translateXPercent}%`,
                      scale,
                      opacity: isCenter ? 1 : absOff === 1 ? 0.94 : absOff === 2 ? 0.78 : 0.55,
                    }}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                    onClick={() => {
                      if (!isCenter) {
                        moveRailTo(idx);
                      } else if (item.kind === 'tag') {
                        moveRailTo(idx + 1);
                      }
                    }}
                    style={{
                      zIndex,
                      backgroundColor: bgTone,
                    }}
                    className={`absolute w-[88vw] max-w-[820px] aspect-[869/493] rounded-[31px] shadow-[0_24px_60px_rgba(0,0,0,0.18)] border overflow-hidden transition-colors ${
                      isCenter
                        ? item.kind === 'tag'
                          ? 'border-black/40 text-white cursor-pointer'
                          : 'border-black/15 text-black'
                        : 'border-black/10 cursor-pointer pointer-events-auto'
                    }`}
                  >
                    {/* 側邊非焦點卡：維持極簡灰色卡面與微標題，還原 Figma 圖層 */}
                    {!isCenter && (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 opacity-50">
                        <span className="font-iosevka text-sm font-bold tracking-widest">
                          {item.kind === 'tag' ? item.tag.shortLabel : item.scenario.character}
                        </span>
                      </div>
                    )}

                    {/* 中央焦點 TAG 排頭卡 (太鼓達人分類標頭) */}
                    {isCenter && item.kind === 'tag' && (
                      <div className="w-full h-full flex flex-col justify-between p-6 sm:p-10 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 text-white">
                        <div className="flex items-center justify-between">
                          <span className="font-iosevka text-xs sm:text-sm tracking-[0.25em] px-3 py-1 rounded-full bg-white/10 border border-white/20">
                            CATEGORY HEADER // {item.tag.shortLabel}
                          </span>
                          <span className="font-iosevka text-xs text-white/60">
                            {item.tag.focus}
                          </span>
                        </div>

                        <div className="space-y-3 my-auto">
                          <h2 className="font-yuji text-3xl sm:text-5xl tracking-wide">
                            {item.tag.title}
                          </h2>
                          <p className="font-mats-tc text-sm sm:text-base text-white/75 max-w-xl leading-relaxed">
                            {item.tag.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/15 pt-4">
                          <span className="font-iosevka text-xs text-white/55">
                            向右滾輪或點擊進入此分類台詞挑戰
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveRailTo(idx + 1);
                            }}
                            className="px-5 py-2 rounded-full bg-white text-black font-iosevka text-xs font-bold tracking-wider flex items-center gap-2 hover:scale-105 transition-transform cursor-pointer"
                          >
                            <span>展開此分類片段</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 中央焦點台詞挑戰卡 (含原片示範 + MATS 字幕重現) */}
                    {isCenter && item.kind === 'scenario' && (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-12 gap-4 p-5 sm:p-7 bg-[#E5E5E5]/95 backdrop-blur-md">
                        {/* 左欄：原片影音視窗 + MATS 即時卡拉 OK 示範字體 */}
                        <div className="md:col-span-7 flex flex-col gap-2.5 justify-between">
                          <div className="relative w-full flex-1 min-h-[160px] rounded-[20px] overflow-hidden bg-black/90 border border-black/15 flex items-center justify-center group">
                            {item.scenario.videoPromptUrl && (
                              <video
                                key={item.scenario.id}
                                ref={previewVideoRef}
                                src={item.scenario.videoPromptUrl}
                                autoPlay
                                loop
                                playsInline
                                muted={previewMuted}
                                className="w-full h-full object-contain"
                                onPlay={() => setIsVideoPlayingUnmuted(!previewMuted)}
                                onPause={() => setIsVideoPlayingUnmuted(false)}
                              />
                            )}
                            {/* 聲音開關按鈕 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMuted((m) => {
                                  const next = !m;
                                  setIsVideoPlayingUnmuted(!next);
                                  return next;
                                });
                              }}
                              className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black text-white font-iosevka text-[10px] flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-all"
                            >
                              {previewMuted ? (
                                <>
                                  <VolumeX className="w-3 h-3 text-white/70" />
                                  <span>開啟原片聲音</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3 h-3 text-white animate-pulse" />
                                  <span>播放原聲中</span>
                                </>
                              )}
                            </button>
                            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/65 text-white/85 font-iosevka text-[10px]">
                              {item.scenario.tagLabel}
                            </span>
                          </div>

                          {/* 示範動態字體條 */}
                          <div className="w-full py-2 px-3 rounded-[16px] bg-white/75 border border-black/10 flex items-center justify-center min-h-[68px] overflow-hidden">
                            <KineticTypography
                              text={item.scenario.line}
                              audioMetrics={previewDemoMetrics}
                              noiseFloor={12}
                              variant="preview"
                              aestheticMode="monochrome"
                              activeCharIndex={previewActiveCharIndex}
                              isPlaying={true}
                            />
                          </div>
                        </div>

                        {/* 右欄：角色資訊與進入錄音按鈕 */}
                        <div className="md:col-span-5 flex flex-col justify-between py-1">
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-iosevka text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-black text-white">
                                {item.scenario.tagFocus || 'MATS PROSODY'}
                              </span>
                            </div>

                            <h3 className="font-mats-tc font-black text-xl sm:text-2xl text-black leading-snug">
                              {item.scenario.character}
                            </h3>
                            <p className="font-iosevka text-xs text-black/60">
                              {item.scenario.emotion}
                            </p>

                            <div className="p-3 rounded-2xl bg-white/65 border border-black/10">
                              <span className="font-iosevka text-[10px] text-black/45 block mb-1">
                                TARGET MANDARIN LINE
                              </span>
                              <p className="font-mats-tc font-bold text-base sm:text-lg text-black">
                                「{item.scenario.line}」
                              </p>
                            </div>

                            <p className="font-mats-tc text-xs text-black/70 leading-relaxed hidden sm:block">
                              {item.scenario.hint}
                            </p>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedScenario(item.scenario);
                              enterRecordingStage();
                            }}
                            className="w-full mt-3 py-3.5 px-5 rounded-full bg-black hover:bg-neutral-800 text-white font-iosevka font-bold text-xs sm:text-sm tracking-[0.14em] flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>進入模仿 // SELECT</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* 底部 5 顆 TAG. 快速分類膠囊按鈕 + 水平進度捲動軸 (Figma id="12:8681"..8688 & Line 1/2) */}
            <div className="w-full max-w-5xl flex flex-col items-center gap-4 z-30">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-5">
                {SCENARIO_TAGS.map((tag, tIdx) => {
                  const isActiveTag = activeTagIdx === tIdx;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleJumpToTag(tag.id)}
                      className={`h-[44px] sm:h-[54px] px-4 sm:px-7 rounded-[50px] font-iosevka text-xs sm:text-base transition-all cursor-pointer flex items-center gap-2 border ${
                        isActiveTag
                          ? 'bg-black text-white border-black shadow-md scale-105'
                          : 'bg-[rgba(128,128,128,0.2)] hover:bg-[rgba(128,128,128,0.32)] text-black/80 border-black/10'
                      }`}
                    >
                      <span className="font-bold">{tag.shortLabel}</span>
                      <span className="hidden md:inline text-[11px] opacity-80">
                        {tag.title.split('・')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Figma 底部水平軌道與白色進度條 */}
              <div className="relative w-full max-w-4xl h-[3px] bg-white/60 rounded-full overflow-hidden">
                <motion.div
                  className="absolute top-0 bottom-0 bg-black/75 rounded-full"
                  animate={{
                    left: `${(railIndex / Math.max(1, coverflowRail.length - 1)) * 78}%`,
                    width: '22%',
                  }}
                  transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                />
              </div>
            </div>
          </motion.section>
        )}

        {/* ================================================================
            SLIDE 3: RECORDING (Figma Slide 16:9 - 3, node 15:8864)
            READY ? -> 3 -> 2 -> 1 -> 最長 15s 錄音，5 秒後浮現 RESULT.
           ================================================================ */}
        {speakState === 'RECORDING' && (
          <motion.section
            key="slide-3-recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-between py-12 px-6"
          >
            {/* 頂部細緻狀態條 */}
            <div className="w-full max-w-xl flex flex-col items-center gap-2 pt-4">
              <div className="w-full flex items-center justify-between text-xs font-iosevka text-black/75 px-2">
                <span className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActivelyRecording ? 'bg-black animate-ping' : 'bg-black/40'
                    }`}
                  />
                  {readyStep !== 'LIVE'
                    ? 'PREPARE VOCAL'
                    : `REC · ${elapsedRecordTime.toFixed(1)}s / 15.0s`}
                </span>
                <div className="flex items-center gap-3">
                  {selectedScenario.videoPromptUrl && (
                    <button
                      onClick={() => setShowRefPip((v) => !v)}
                      className="underline decoration-black/30 hover:text-black cursor-pointer"
                    >
                      {showRefPip ? '隱藏參考畫面' : '參考畫面 (靜音)'}
                    </button>
                  )}
                  <span className="opacity-65">{selectedScenario.character}</span>
                </div>
              </div>
              <div className="w-full h-[2px] bg-black/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black transition-all duration-75"
                  style={{ width: `${recordProgress}%` }}
                />
              </div>
            </div>

            {/* 可選靜音 PiP 參考畫面 */}
            {showRefPip && selectedScenario.videoPromptUrl && (
              <div className="fixed top-20 right-6 z-40 w-44 rounded-2xl overflow-hidden border border-black/20 shadow-xl bg-black">
                <video
                  src={selectedScenario.videoPromptUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* 中央核心：READY ? 3 2 1 動畫 ➔ MATS 1.0 即時聲學動態字體 */}
            <div className="relative flex-1 w-full flex flex-col items-center justify-center">
              {readyStep !== 'LIVE' ? (
                <motion.div
                  key={readyStep}
                  initial={{ opacity: 0, scale: 0.85, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.15 }}
                  transition={{ duration: 0.35 }}
                  className="relative flex flex-col items-center justify-center select-none"
                >
                  {/* Figma id="31:27409" 多層垂直疊影 READY ? */}
                  <span
                    aria-hidden="true"
                    className="font-iosevka text-[40px] sm:text-[54px] font-medium text-black/15 -mb-10 sm:-mb-12"
                  >
                    {readyStep === 'READY' ? 'READY ?' : readyStep}
                  </span>
                  <span className="font-iosevka text-[42px] sm:text-[58px] font-medium text-black tracking-[0.06em]">
                    {readyStep === 'READY' ? 'READY ?' : readyStep}
                  </span>
                  <span className="mt-4 font-mats-tc text-sm text-black/55">
                    即將挑戰：「{selectedScenario.line}」
                  </span>
                </motion.div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center px-4">
                  <KineticTypography
                    text={selectedScenario.line}
                    audioMetrics={audioMetrics}
                    noiseFloor={noiseFloor}
                    variant="hero"
                    aestheticMode="monochrome"
                    showTelemetry={true}
                  />
                  <span className="mt-5 font-iosevka text-[11px] tracking-[0.18em] text-black/50">
                    {elapsedRecordTime < 5.0
                      ? `SPEAK INTO MIC · RESULT BUTTON UNLOCKS IN ${(5.0 - elapsedRecordTime).toFixed(1)}S`
                      : 'CONTINUE SPEAKING OR CLICK RESULT BELOW'}
                  </span>
                </div>
              )}
            </div>

            {/* 底部 RESULT. 按鈕：錄製開始滿 5 秒後才漸顯出現 (Figma 19:9050 / 19:9052) */}
            <div className="h-[96px] flex items-center justify-center">
              <AnimatePresence>
                {readyStep === 'LIVE' && elapsedRecordTime >= 5.0 && (
                  <motion.button
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={finishRecording}
                    className="w-[232px] h-[96px] glow-pill-white flex items-center justify-center cursor-pointer"
                  >
                    <span className="font-iosevka text-[32px] sm:text-[36px] font-medium text-black tracking-[0.04em]">
                      RESULT.
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        )}

        {/* ================================================================
            SLIDES 4, 5, 6: UNIFIED 3-STAGE CYTUS II WHEEL RESULT FLOW
            Sub-stage 0 (Slide 4): 湧升液態海浪 + 中央模糊浮現百分比 %
            Sub-stage 1 (Slide 5): % 滑至右側 + 中央浮現 TAKE a LOOK. + 原音/小卡按鈕
            Sub-stage 2 (Slide 6): 中央轉為 QR CODE + 五秒後底部波浪浮現 flow back~
           ================================================================ */}
        {speakState === 'SCORE_ANALYSIS' && scoreResult && (
          <motion.section
            key="slides-4-5-6-result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6"
          >
            {/* 百分比數值 (%): Slide 4 居於球心並從模糊轉清晰，Slide 5/6 滑移至右側 (x ≈ 85%) */}
            <motion.div
              animate={
                resultSubStage === 0
                  ? {
                      x: 0,
                      y: 0,
                      scale: 1,
                      filter: 'blur(0px)',
                    }
                  : {
                      x: '36vw',
                      y: 0,
                      scale: 0.72,
                      filter: 'blur(0px)',
                    }
              }
              initial={{ filter: 'blur(6px)', scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              onClick={() => {
                if (resultSubStage === 0) goToResultSubStage(1);
              }}
              className={`z-20 flex flex-col items-center justify-center ${
                resultSubStage === 0 ? 'cursor-pointer' : 'pointer-events-none'
              }`}
            >
              <span className="font-iosevka text-[clamp(3.6rem,9vw,8rem)] font-medium text-black leading-none tracking-tight">
                {animatedScore}%
              </span>
              {resultSubStage > 0 && (
                <span className="mt-1 font-iosevka text-[11px] tracking-[0.2em] text-black/55 uppercase">
                  {scoreResult.rank} · MATCH
                </span>
              )}
            </motion.div>

            {/* Sub-stage 1 (Slide 5): 中央浮現 TAKE a LOOK. (含垂直水波投影 text-shadow 0 53px 4px) */}
            <AnimatePresence>
              {resultSubStage === 1 && (
                <motion.div
                  key="substage-take-a-look"
                  initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.05, filter: 'blur(4px)' }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
                >
                  <button
                    onClick={() => goToResultSubStage(2)}
                    className="pointer-events-auto cursor-pointer group text-center focus:outline-none"
                    title="點擊生成 QR CODE 帶走聲音視覺化小卡"
                  >
                    <div
                      className="font-iosevka text-[clamp(3.2rem,8.2vw,7.5rem)] font-medium text-black leading-[1.02] tracking-tight transition-transform duration-300 group-hover:scale-105"
                      style={{
                        textShadow: '0px 38px 5px rgba(0, 0, 0, 0.22)',
                      }}
                    >
                      TAKE
                      <br />
                      a LOOK.
                    </div>
                  </button>

                  {/* 互動微膠囊：聆聽現場原音 + 檢視 MATS 小卡與 5 維分析 */}
                  <div className="mt-10 flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
                    {userAudioUrl && (
                      <button
                        onClick={toggleReplayUserVoice}
                        className="px-4 py-2 rounded-full bg-white/80 hover:bg-white border border-black/15 text-black font-iosevka text-xs font-medium flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                      >
                        {isPlayingUserVoice ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>STOP VOICE</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>PLAY MY VOICE</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => setShowDetailModal(true)}
                      className="px-4 py-2 rounded-full bg-white/80 hover:bg-white border border-black/15 text-black font-iosevka text-xs font-medium flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>預覽動態小卡 & MATS 分析</span>
                    </button>

                    <button
                      onClick={() => goToResultSubStage(2)}
                      className="px-4 py-2 rounded-full bg-black text-white hover:bg-neutral-800 font-iosevka text-xs font-medium flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <span>QR CODE</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Sub-stage 2 (Slide 6): 球體中心轉為 250x250 QR CODE */}
              {resultSubStage === 2 && (
                <motion.div
                  key="substage-qrcode"
                  initial={{ opacity: 0, scale: 0.85, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
                >
                  <div className="pointer-events-auto flex flex-col items-center gap-4">
                    <div className="p-3.5 rounded-2xl bg-white/95 border border-black/15 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
                      <QRCodeCanvas
                        value={shareQrUrl}
                        size={210}
                        level="M"
                        marginSize={1}
                        fgColor="#000000"
                        bgColor="#FFFFFF"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {userAudioUrl && (
                        <button
                          onClick={toggleReplayUserVoice}
                          className="px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 text-black font-iosevka text-[11px] flex items-center gap-1.5 cursor-pointer"
                        >
                          {isPlayingUserVoice ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                          <span>{isPlayingUserVoice ? 'STOP' : 'PLAY VOICE'}</span>
                        </button>
                      )}
                      <button
                        onClick={() => setShowDetailModal(true)}
                        className="px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 text-black font-iosevka text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>開啟完整聲音小卡與下載</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 頂部/角落 MATS v1.0 簡潔聲學摘要標籤 (Slide 5 & 6) */}
            {resultSubStage > 0 && scoreResult.matsMetrics && (
              <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 hidden sm:flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/65 border border-black/10 backdrop-blur-md font-iosevka text-[10px] text-black/70">
                <span>{scoreResult.matsMetrics.quadrantLabel}</span>
                <span>·</span>
                <span>F0 {scoreResult.matsMetrics.avgF0Hz}Hz</span>
                <span>·</span>
                <span>JITTER {scoreResult.matsMetrics.avgJitter}%</span>
                <span>·</span>
                <span>HNR {scoreResult.matsMetrics.avgHnrDb}dB</span>
              </div>
            )}

            {/* 底部滾輪與狀態指示 */}
            {resultSubStage < 2 && (
              <button
                onClick={() => goToResultSubStage((p) => Math.min(2, p + 1) as 0 | 1 | 2)}
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 font-iosevka text-[10px] tracking-[0.22em] text-black/55 hover:text-black cursor-pointer"
              >
                SCROLL WHEEL DOWN OR CLICK TO CONTINUE ↓
              </button>
            )}

            {/* Slide 6 底部雙波浪中央 "flow back~" 按鈕 (進入 Slide 6 後滿 5 秒浮現，Figma 31:27520 / 31:27523) */}
            <AnimatePresence>
              {resultSubStage === 2 && showFlowBack && (
                <motion.button
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  whileHover={{ scale: 1.07 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRestart}
                  className="fixed bottom-[4.5vh] left-1/2 -translate-x-1/2 z-30 w-[232px] h-[96px] glow-pill-white flex items-center justify-center cursor-pointer"
                >
                  <span className="font-iosevka text-[26px] sm:text-[32px] font-medium text-black tracking-[0.02em]">
                    flow back~
                  </span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 詳細 MATS 小卡 / 海報預覽與下載覆蓋層 (點擊 TAKE a LOOK 中的預覽按鈕開啟) */}
      {showDetailModal && scoreResult && (
        <div className="fixed inset-0 z-50">
          <button
            onClick={() => setShowDetailModal(false)}
            className="fixed top-5 right-5 z-[60] p-2.5 rounded-full bg-white text-black shadow-xl hover:scale-105 transition-transform cursor-pointer"
            title="關閉小卡預覽"
          >
            <X className="w-5 h-5" />
          </button>
          <SpeakExportModal
            scoreResult={scoreResult}
            scenario={selectedScenario}
            userVolumeSlice={userRecordedVolume}
            userPitchSlice={userRecordedPitch}
            userAudioUrl={userAudioUrl}
            onRestart={handleRestart}
            onPlayStateChange={setIsPlayingUserVoice}
          />
        </div>
      )}

      {/* 維護者暗樁調試抽屜 (連續 5 次點擊左上角 SPK 或按 M 鍵開啟) */}
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
