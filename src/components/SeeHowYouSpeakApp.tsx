import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import type {
  SpeakState,
  ScoreResult,
  PromptScenario,
  AudioMetrics,
  CharAcousticSnapshot,
  PhraseCharTiming,
} from '../types/speak';
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
  RotateCcw,
} from 'lucide-react';

interface SeeHowYouSpeakAppProps {
  onSwitchMode?: () => void;
}

type CoverflowItem =
  | { kind: 'tag'; id: string; tag: ScenarioTagMeta; firstScenarioIdx: number }
  | { kind: 'scenario'; id: string; scenario: PromptScenario; tagIdx: number };

// PDF 前三頁：單一畫面三階段錄音室狀態機
type StudioStep = 'WATCH' | 'COUNTDOWN' | 'RECORD' | 'REVIEW';

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

function clampVal(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function formatTimeMMSS(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimeShort(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getImitationWindow(scenario: PromptScenario, videoDuration?: number): {
  startSec: number;
  endSec: number;
  durationSec: number;
  charTimings: PhraseCharTiming[];
} {
  const totalDur =
    videoDuration && isFinite(videoDuration) && videoDuration > 1
      ? videoDuration
      : scenario.durationSeconds || 6.0;
  const startSec =
    scenario.imitateStartSec !== undefined
      ? clampVal(scenario.imitateStartSec, 0, Math.max(0, totalDur - 1.2))
      : 0.4;
  const rawEnd =
    scenario.imitateEndSec !== undefined
      ? scenario.imitateEndSec
      : Math.min(totalDur, startSec + Math.min(6.0, totalDur - startSec));
  const endSec = clampVal(rawEnd, startSec + 1.0, totalDur);
  const durationSec = Math.max(1.0, Number((endSec - startSec).toFixed(1)));

  const chars = Array.from(scenario.line);
  if (scenario.charTimings && scenario.charTimings.length === chars.length) {
    return { startSec, endSec, durationSec, charTimings: scenario.charTimings };
  }

  const step = durationSec / Math.max(1, chars.length);
  const uniform: PhraseCharTiming[] = chars.map((char, i) => ({
    char,
    startSec: Number((startSec + i * step).toFixed(2)),
    endSec: Number((startSec + (i + 1) * step).toFixed(2)),
  }));
  return { startSec, endSec, durationSec, charTimings: uniform };
}

function createInitialSnapshots(line: string, filled = false): CharAcousticSnapshot[] {
  return Array.from(line).map((char) => ({
    char,
    scale: 1.0,
    yOffset: 0,
    scaleX: 1.0,
    letterSpacing: 0,
    weight: 600,
    fillProgress: filled ? 1 : 0,
    isHighlight: false,
  }));
}

/**
 * 選片頁卡片「字幕效果預覽」：根據劇本參考曲線預先生成高低大小錯落的視覺預覽快照
 */
function buildPreviewSnapshots(scenario: PromptScenario): CharAcousticSnapshot[] {
  const chars = Array.from(scenario.line);
  const volCurve = scenario.referenceVolumeCurve || [30, 75, 95, 65, 30];
  const pitchCurve = scenario.referencePitchCurve || [0.4, 0.7, 0.9, 0.6, 0.4];
  const n = Math.max(1, chars.length);

  return chars.map((char, idx) => {
    const p = n > 1 ? idx / (n - 1) : 0.5;
    const vIdx = Math.min(volCurve.length - 1, Math.floor(p * volCurve.length));
    const pIdx = Math.min(pitchCurve.length - 1, Math.floor(p * pitchCurve.length));
    const vol = volCurve[vIdx] ?? 50;
    const pitch = pitchCurve[pIdx] ?? 0.5;
    const isPeak = vol >= 85;
    return {
      char,
      scale: clampVal(0.86 + (vol / 100) * 0.52, 0.82, 1.42),
      yOffset: Math.round(clampVal((pitch - 0.5) * -26, -16, 16)),
      scaleX: isPeak ? 1.32 : vol >= 70 ? 1.12 : 1.0,
      letterSpacing: vol < 40 ? 3 : 0,
      weight: isPeak ? 900 : vol >= 65 ? 700 : 500,
      fillProgress: 1,
      isHighlight: isPeak,
    };
  });
}

/**
 * 隱性問題 02 防線：將玩家實際錄音的有效音量/音高切片等比例映射至每個字，確保提早唸完或停頓都能完整呈現聲學造型
 */
function buildSnapshotsFromRecording(
  line: string,
  volSlice: Float32Array,
  pitchSlice: Float32Array,
  prevSnapshots: CharAcousticSnapshot[]
): CharAcousticSnapshot[] {
  const chars = Array.from(line);
  const n = Math.max(1, chars.length);
  if (!volSlice || volSlice.length < 4) {
    return prevSnapshots.map((s) => ({
      ...s,
      fillProgress: 1,
    }));
  }

  let peakVol = 1;
  for (let i = 0; i < volSlice.length; i++) {
    if (volSlice[i] > peakVol) peakVol = volSlice[i];
  }
  const agc = peakVol < 45 ? Math.min(4.2, 78 / Math.max(8, peakVol)) : 1.0;

  return chars.map((char, idx) => {
    const prev = prevSnapshots[idx];
    const segStart = Math.floor((idx / n) * volSlice.length);
    const segEnd = Math.max(segStart + 1, Math.floor(((idx + 1) / n) * volSlice.length));

    let maxVol = 0;
    let sumPitch = 0;
    let sustainedFrames = 0;
    for (let i = segStart; i < segEnd && i < volSlice.length; i++) {
      const v = Math.min(100, (volSlice[i] || 0) * agc);
      if (v > maxVol) maxVol = v;
      sumPitch += pitchSlice[i] ?? 0.5;
      if (v > 32) sustainedFrames++;
    }
    const avgPitch = sumPitch / Math.max(1, segEnd - segStart);
    const sustainRatio = sustainedFrames / Math.max(1, segEnd - segStart);

    // 若錄音當下該字已有明顯即時形變，融合即時峰值與切片特徵
    const calcScale = clampVal(0.84 + (maxVol / 100) * 0.62, 0.82, 1.52);
    const finalScale = prev && prev.scale > 1.04 ? Math.max(prev.scale, calcScale) : calcScale;
    const calcY = Math.round(clampVal((avgPitch - 0.45) * -30, -18, 18));
    const finalY = prev && Math.abs(prev.yOffset) > 3 ? prev.yOffset : calcY;
    const calcScaleX = clampVal(1.0 + (sustainRatio > 0.55 ? (maxVol / 100) * 0.55 : 0), 1.0, 1.85);
    const finalScaleX = prev && prev.scaleX > 1.08 ? Math.max(prev.scaleX, calcScaleX) : calcScaleX;
    const isHighlight = finalScale >= 1.22 || finalScaleX >= 1.25;

    return {
      char,
      scale: Number(finalScale.toFixed(2)),
      yOffset: finalY,
      scaleX: Number(finalScaleX.toFixed(2)),
      letterSpacing: maxVol < 28 ? 3 : 0,
      weight: isHighlight ? 900 : maxVol > 45 ? 700 : 500,
      fillProgress: 1,
      isHighlight,
    };
  });
}

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
  if (start === -1 || end - start < 15) {
    return { volTrimmed: vol, pitchTrimmed: pitch };
  }
  const s = Math.max(0, start - 6);
  const e = Math.min(vol.length, end + 8);
  return {
    volTrimmed: vol.subarray(s, e),
    pitchTrimmed: pitch.subarray(s, e),
  };
}

function derivePersonaAndFourScores(
  overallScore: number,
  volumeScore: number,
  pitchScore: number,
  volTrimmed: Float32Array,
  scenario: PromptScenario
): {
  sustainScore: number;
  rateScore: number;
  personaTitle: string;
  coachingComment: string;
} {
  const targetFrames = Math.max(30, (scenario.imitateEndSec ?? 4.5) - (scenario.imitateStartSec ?? 0.5)) * 60;
  const userFrames = Math.max(15, volTrimmed.length);
  const ratio = userFrames / Math.max(30, targetFrames);

  let activeFrames = 0;
  for (let i = 0; i < volTrimmed.length; i++) {
    if (volTrimmed[i] > 18) activeFrames++;
  }
  const sustainDensity = activeFrames / Math.max(1, volTrimmed.length);

  const sustainScore = Math.round(clampVal(overallScore * 0.55 + sustainDensity * 48, 52, 98));
  const ratePenalty = Math.min(32, Math.abs(1 - ratio) * 45);
  const rateScore = Math.round(clampVal(94 - ratePenalty, 50, 96));

  let personaTitle = '情緒張力型';
  if (volumeScore >= 82 && pitchScore >= 80) {
    personaTitle = '聲動表現型';
  } else if (pitchScore > volumeScore + 8) {
    personaTitle = '高頻抑揚型';
  } else if (sustainScore >= 82) {
    personaTitle = '綿長延音型';
  }

  let coachingComment = '音量起伏抓得很準，語速與尾音延展相當自然！';
  if (rateScore < 68) {
    coachingComment = '音量起伏抓得很準，語速可以再放慢一點對齊角色節奏。';
  } else if (volumeScore < 68) {
    coachingComment = '音高走勢很到位，重音字可以再放開音量更有張力！';
  } else if (pitchScore < 68) {
    coachingComment = '氣勢與音量非常飽滿，尾音高低起伏可以再誇張一些！';
  }

  return { sustainScore, rateScore, personaTitle, coachingComment };
}

export const SeeHowYouSpeakApp: React.FC<SeeHowYouSpeakAppProps> = ({ onSwitchMode }) => {
  const [speakState, setSpeakState] = useState<SpeakState>('LANDING');
  const [selectedScenario, setSelectedScenario] = useState<PromptScenario>(PROMPT_SCENARIOS[0]);

  // ============================================================================
  // Page 2: 太鼓達人 / Netflix 單一水平列 Coverflow 狀態
  // ============================================================================
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

  const [railIndex, setRailIndex] = useState<number>(1);
  const [previewMuted, setPreviewMuted] = useState<boolean>(true);
  const [previewDemoMetrics, setPreviewDemoMetrics] = useState<AudioMetrics>(DEFAULT_DEMO_METRICS);
  const [previewActiveCharIndex, setPreviewActiveCharIndex] = useState<number>(-1);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const wheelCooldownRef = useRef<number>(0);

  // ============================================================================
  // Page 3: PDF 前三頁「單一畫面三階錄音室」狀態 (1 看情境 -> 2 錄音 -> 3 看效果)
  // ============================================================================
  const [studioStep, setStudioStep] = useState<StudioStep>('WATCH');
  const [countdownNum, setCountdownNum] = useState<3 | 2 | 1>(3);
  const [studioVideoTime, setStudioVideoTime] = useState<number>(0);
  const [studioVideoDuration, setStudioVideoDuration] = useState<number>(10);
  const [isActivelyRecording, setIsActivelyRecording] = useState<boolean>(false);
  const [elapsedRecordTime, setElapsedRecordTime] = useState<number>(0);
  const [activeKtvCharIdx, setActiveKtvCharIdx] = useState<number>(-1);
  const [charSnapshots, setCharSnapshots] = useState<CharAcousticSnapshot[]>(() =>
    createInitialSnapshots(PROMPT_SCENARIOS[0].line, false)
  );
  const charSnapshotsRef = useRef<CharAcousticSnapshot[]>(
    createInitialSnapshots(PROMPT_SCENARIOS[0].line, false)
  );

  const studioVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineBarRef = useRef<HTMLDivElement | null>(null);
  const isDraggingTimelineRef = useRef<boolean>(false);

  // ============================================================================
  // Page 4: 結算頁 (% 波浪湧升 -> 左欄 9:16 動態配音小卡 + 右欄 4 維度 & QR + 右上 30s SVG 倒數環)
  // ============================================================================
  const [resultSubStage, setResultSubStage] = useState<0 | 1 | 2>(0);
  const [animatedScore, setAnimatedScore] = useState<number>(0);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [resultCountdownSec, setResultCountdownSec] = useState<number>(30);
  const resultCardVideoRef = useRef<HTMLVideoElement | null>(null);

  // 首頁 BGM 控制 (離開首頁即自動停止)
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const [bgmMuted, setBgmMuted] = useState<boolean>(false);

  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [userRecordedVolume, setUserRecordedVolume] = useState<Float32Array>(new Float32Array(0));
  const [userRecordedPitch, setUserRecordedPitch] = useState<Float32Array>(new Float32Array(0));

  // 原音回放狀態
  const [isPlayingUserVoice, setIsPlayingUserVoice] = useState<boolean>(false);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);

  // 維護者抽屜與全模態狀態
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

  const audioMetricsRef = useRef<AudioMetrics>(audioMetrics);
  useEffect(() => {
    audioMetricsRef.current = audioMetrics;
  }, [audioMetrics]);

  const animFrameIdRef = useRef<number | null>(null);
  const countdownTimersRef = useRef<number[]>([]);

  // 當前情境的模仿段時間窗與逐字時間碼
  const imitationWindow = useMemo(
    () => getImitationWindow(selectedScenario, studioVideoDuration),
    [selectedScenario, studioVideoDuration]
  );

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

  // 影片有聲播放（選片預覽 / Step 1 看情境）或個人原音回放期間軟體靜音麥克風 (防喇叭迴音自激)
  useEffect(() => {
    const isWatchStepAudible = speakState === 'RECORDING' && studioStep === 'WATCH';
    setMuteInput(isVideoPlayingUnmuted || isPlayingUserVoice || isWatchStepAudible);
  }, [isVideoPlayingUnmuted, isPlayingUserVoice, speakState, studioStep, setMuteInput]);

  // 停止當前任何正在播放的個人錄音 Audio 實例
  const stopUserVoiceAudio = useCallback(() => {
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current.currentTime = 0;
      replayAudioRef.current = null;
    }
    setIsPlayingUserVoice(false);
  }, []);

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

  // 2. Slide 2 Coverflow 預覽影片同步 MATS 動態字幕
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
      const lineCharsCount = Math.max(1, Array.from(sc.line).length);
      const charIdx = sc.selectionVideoUrl
        ? Math.min(lineCharsCount - 1, Math.floor(progress * lineCharsCount))
        : resolveScenarioCharIndex(sc, curTime, progress);
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

  // ============================================================================
  // 3. Page 3 單一畫面三階錄音室控制器 (PDF Pages 1–3)
  //    Step 1: 看情境 (WATCH) -> 3-2-1 倒數 (COUNTDOWN) -> Step 2: 錄音 (RECORD) -> Step 3: 看效果 (REVIEW)
  // ============================================================================
  const clearStudioTimers = useCallback(() => {
    countdownTimersRef.current.forEach((t) => clearTimeout(t));
    countdownTimersRef.current = [];
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  }, []);

  // 進入 Page 3 錄音頁：預設從 Step 1「1 看情境」開始播放完整情境影片 (含原音)
  const enterRecordingStage = useCallback(
    async (scenarioOverride?: PromptScenario) => {
      const targetScenario = scenarioOverride || selectedScenario;
      if (scenarioOverride) {
        setSelectedScenario(scenarioOverride);
      }
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
      }
      clearStudioTimers();
      stopUserVoiceAudio();
      setIsVideoPlayingUnmuted(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      await unlockAudio();
      const initSnaps = createInitialSnapshots(targetScenario.line, false);
      charSnapshotsRef.current = initSnaps;
      setCharSnapshots(initSnaps);
      setActiveKtvCharIdx(-1);
      setIsActivelyRecording(false);
      setElapsedRecordTime(0);
      setStudioVideoTime(0);
      setStudioVideoDuration(targetScenario.durationSeconds || 10);
      setStudioStep('WATCH');
      setSpeakState('RECORDING');
    },
    [selectedScenario, clearStudioTimers, stopUserVoiceAudio, unlockAudio]
  );

  // Step 2 錄音結束 -> 封裝 WAV 與逐字聲學定格快照 -> 直接切入同畫面 Step 3「3 看效果」(REVIEW)
  const stopStudioRecordingToReview = useCallback(() => {
    clearStudioTimers();
    stopRecording();
    setIsActivelyRecording(false);

    const { volume, pitch } = getValidRecordings();
    const { volTrimmed, pitchTrimmed } = trimSilenceMargins(volume, pitch, noiseFloor);
    setUserRecordedVolume(volTrimmed);
    setUserRecordedPitch(pitchTrimmed);

    // 隱性問題 02 防線：將玩家實際發聲切片融合至逐字快照，確保整句每個字都擁有專屬高低大小造型
    const finalized = buildSnapshotsFromRecording(
      selectedScenario.line,
      volTrimmed,
      pitchTrimmed,
      charSnapshotsRef.current
    );
    charSnapshotsRef.current = finalized;
    setCharSnapshots(finalized);
    setActiveKtvCharIdx(finalized.length);
    setStudioStep('REVIEW');
  }, [clearStudioTimers, stopRecording, getValidRecordings, noiseFloor, selectedScenario]);

  const stopStudioRecordingToReviewRef = useRef(stopStudioRecordingToReview);
  useEffect(() => {
    stopStudioRecordingToReviewRef.current = stopStudioRecordingToReview;
  }, [stopStudioRecordingToReview]);

  // 從 Step 1「看情境」或 Step 3「重錄」按下【開始模仿 / 重錄】：強制對齊模仿段起點 -> 3-2-1 倒數 -> Step 2 錄音
  const startImitationCountdown = useCallback(async () => {
    clearStudioTimers();
    stopUserVoiceAudio();
    await unlockAudio();

    const freshSnaps = createInitialSnapshots(selectedScenario.line, false);
    charSnapshotsRef.current = freshSnaps;
    setCharSnapshots(freshSnaps);
    setActiveKtvCharIdx(-1);
    setElapsedRecordTime(0);
    setIsActivelyRecording(false);

    // 隱性問題 01 防線：進入 3-2-1 倒數瞬間，強制將影片 seek 對齊至模仿段起點 imitateStartSec 並暫停待命
    const vid = studioVideoRef.current;
    if (vid) {
      vid.pause();
      vid.muted = true;
      vid.currentTime = imitationWindow.startSec;
      setStudioVideoTime(imitationWindow.startSec);
    }

    setCountdownNum(3);
    setStudioStep('COUNTDOWN');

    countdownTimersRef.current.push(
      window.setTimeout(() => setCountdownNum(2), 750),
      window.setTimeout(() => setCountdownNum(1), 1500),
      window.setTimeout(() => {
        setMuteInput(false);
        startRecording();
        setIsActivelyRecording(true);
        setStudioStep('RECORD');

        const v = studioVideoRef.current;
        if (v) {
          v.muted = true;
          v.currentTime = imitationWindow.startSec;
          v.play().catch(() => {});
        }

        const totalImitateDur = imitationWindow.durationSec;
        const timings = imitationWindow.charTimings;
        const chars = Array.from(selectedScenario.line);

        const tickRecord = () => {
          const elapsed = getElapsedHardwareTime();
          const curMediaTime = imitationWindow.startSec + elapsed;
          setElapsedRecordTime(Number(Math.min(totalImitateDur, elapsed).toFixed(1)));
          setStudioVideoTime(Math.min(imitationWindow.endSec, curMediaTime));

          // KTV 逐字填色進度 + Web Audio 即時聲學變形定格快照
          const live = audioMetricsRef.current;
          const isVoice = live.isVoiceActive && live.smoothVolume > Math.max(8, noiseFloor * 0.75);
          const liveScale = isVoice
            ? clampVal(0.92 + (live.smoothVolume / 100) * 0.62, 0.85, 1.52)
            : 1.0;
          const liveY = isVoice
            ? Math.round(
                clampVal(
                  live.deltaF0 !== undefined ? -live.deltaF0 * 28 : live.pitchYOffset * 0.72,
                  -20,
                  20
                )
              )
            : 0;
          const liveScaleX =
            isVoice && live.sustainedDuration > 0.25
              ? clampVal(1.0 + (live.sustainedDuration - 0.25) * 1.15, 1.0, 1.9)
              : 1.0;
          const liveSpacing =
            (live.pauseDurationMs ?? 0) >= 240
              ? clampVal(((live.pauseDurationMs ?? 0) / 110) * 1.8, 0, 10)
              : 0;

          let currentActiveIdx = -1;
          const nextSnaps = charSnapshotsRef.current.map((prevSnap, idx) => {
            const t = timings[idx];
            const cStart = t ? t.startSec : imitationWindow.startSec + (idx / chars.length) * totalImitateDur;
            const cEnd = t
              ? t.endSec
              : imitationWindow.startSec + ((idx + 1) / chars.length) * totalImitateDur;
            const cDur = Math.max(0.12, cEnd - cStart);

            if (curMediaTime >= cEnd) {
              return {
                ...prevSnap,
                fillProgress: 1,
              };
            }
            if (curMediaTime >= cStart && curMediaTime < cEnd) {
              currentActiveIdx = idx;
              const fillProgress = clampVal((curMediaTime - cStart) / cDur, 0.05, 0.99);
              // 保留該字發音期間的最大音量縮放與拉長特徴
              const peakScale = isVoice ? Math.max(prevSnap.scale, liveScale) : prevSnap.scale;
              const peakScaleX = isVoice ? Math.max(prevSnap.scaleX, liveScaleX) : prevSnap.scaleX;
              const activeY = isVoice ? liveY : prevSnap.yOffset;
              const isHighlight = peakScale >= 1.2 || peakScaleX >= 1.25;
              return {
                char: chars[idx],
                scale: Number(peakScale.toFixed(2)),
                yOffset: activeY,
                scaleX: Number(peakScaleX.toFixed(2)),
                letterSpacing: Math.max(prevSnap.letterSpacing, liveSpacing),
                weight: isHighlight ? 900 : peakScale > 1.08 ? 700 : 600,
                fillProgress,
                isHighlight,
              };
            }
            return prevSnap;
          });

          charSnapshotsRef.current = nextSnaps;
          setCharSnapshots(nextSnaps);
          setActiveKtvCharIdx(currentActiveIdx);

          if (elapsed >= totalImitateDur) {
            stopStudioRecordingToReviewRef.current();
          } else {
            animFrameIdRef.current = requestAnimationFrame(tickRecord);
          }
        };

        animFrameIdRef.current = requestAnimationFrame(tickRecord);
      }, 2250)
    );
  }, [
    clearStudioTimers,
    stopUserVoiceAudio,
    unlockAudio,
    selectedScenario,
    imitationWindow,
    setMuteInput,
    startRecording,
    getElapsedHardwareTime,
    noiseFloor,
  ]);

  // Step 3「3 看效果」：自動將壓暗去人聲影片定位至模仿段並與玩家 WAV 原音同步播放
  const playReviewDubbing = useCallback(() => {
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current.currentTime = 0;
      replayAudioRef.current = null;
    }
    const vid = studioVideoRef.current;
    if (vid) {
      vid.muted = true;
      vid.currentTime = imitationWindow.startSec;
      vid.play().catch(() => {});
    }
    if (userAudioUrl) {
      const audio = new Audio(userAudioUrl);
      replayAudioRef.current = audio;
      audio.onplay = () => setIsPlayingUserVoice(true);
      audio.onended = () => setIsPlayingUserVoice(false);
      audio.onerror = () => setIsPlayingUserVoice(false);
      audio.play().catch(() => setIsPlayingUserVoice(false));
    }
  }, [imitationWindow.startSec, userAudioUrl]);

  // 當進入 Step 3「3 看效果」且 userAudioUrl 就緒時，自動播放一次玩家的配音成片效果
  useEffect(() => {
    if (speakState !== 'RECORDING' || studioStep !== 'REVIEW') return;
    playReviewDubbing();
    return () => {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause();
        replayAudioRef.current.currentTime = 0;
        replayAudioRef.current = null;
      }
    };
  }, [speakState, studioStep, playReviewDubbing]);

  // Step 1「看情境」與 Step 3「看效果」的影片時間軸同步與區間循環控制
  useEffect(() => {
    if (speakState !== 'RECORDING') return;
    const vid = studioVideoRef.current;
    if (!vid) return;

    if (studioStep === 'WATCH') {
      vid.muted = false;
      vid.currentTime = 0;
      vid.play().catch(() => {
        // 若瀏覽器阻擋有聲自動播放，靜音啟動
        vid.muted = true;
        vid.play().catch(() => {});
      });
    }
  }, [speakState, studioStep, selectedScenario.id]);

  // 離開 RECORDING 時清理計時器與音訊
  useEffect(() => {
    if (speakState === 'RECORDING') return;
    clearStudioTimers();
  }, [speakState, clearStudioTimers]);

  // Step 3 按下【確定，看結果 →】：計算綜合分數與 4 維度指標 (音量/音高/延音/語速) 進入 Page 4
  const confirmAndGoToResult = useCallback(() => {
    clearStudioTimers();
    stopUserVoiceAudio();
    if (studioVideoRef.current) {
      studioVideoRef.current.pause();
    }

    const { matsSummary } = getValidRecordings();
    const volTrimmed = userRecordedVolume;
    const pitchTrimmed = userRecordedPitch;

    const nowStr = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const dtwResult =
      volTrimmed.length < 15
        ? {
            overallScore: 68,
            volumeScore: 66,
            pitchScore: 70,
            rank: 'A' as const,
            rankTitle: '微聲探索者 (WHISPER SEED)',
            comment: '音量起伏自然，建議更靠近麥克風放大重音張力！',
          }
        : compareVoiceDTW(
            volTrimmed,
            pitchTrimmed,
            selectedScenario.referenceVolumeCurve,
            selectedScenario.referencePitchCurve
          );

    const { sustainScore, rateScore, personaTitle, coachingComment } = derivePersonaAndFourScores(
      dtwResult.overallScore,
      dtwResult.volumeScore,
      dtwResult.pitchScore,
      volTrimmed,
      selectedScenario
    );

    const finalRes: ScoreResult = {
      overallScore: dtwResult.overallScore,
      volumeScore: dtwResult.volumeScore,
      pitchScore: dtwResult.pitchScore,
      sustainScore,
      rateScore,
      personaTitle,
      rank: dtwResult.rank,
      rankTitle: dtwResult.rankTitle,
      comment: coachingComment,
      verificationCode: `SPK-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: nowStr,
      scenarioId: selectedScenario.id,
      matsMetrics: matsSummary,
    };

    setScoreResult(finalRes);
    setResultSubStage(0);
    setResultCountdownSec(30);
    setShowDetailModal(false);
    setSpeakState('SCORE_ANALYSIS');
  }, [
    clearStudioTimers,
    stopUserVoiceAudio,
    getValidRecordings,
    userRecordedVolume,
    userRecordedPitch,
    selectedScenario,
  ]);

  // 進度條點擊或拖曳 (PDF Page 1: 可以拖曳進度條重聽)
  const seekStudioVideoByClientX = useCallback(
    (clientX: number) => {
      if (studioStep === 'RECORD' || studioStep === 'COUNTDOWN') return;
      const bar = timelineBarRef.current;
      const vid = studioVideoRef.current;
      if (!bar || !vid || !studioVideoDuration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = clampVal((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const targetTime = ratio * studioVideoDuration;
      vid.currentTime = targetTime;
      setStudioVideoTime(targetTime);
      if (vid.paused) {
        vid.play().catch(() => {});
      }
    },
    [studioStep, studioVideoDuration]
  );

  // ============================================================================
  // 4. Page 4: `%` 波浪湧升過渡 -> 左欄 9:16 動態配音小卡 + 右欄 4 維度與 QR + 右上 28 秒倒數進度環
  // ============================================================================
  useEffect(() => {
    if (speakState !== 'SCORE_ANALYSIS' || !scoreResult) return;

    let rafId: number;
    const start = performance.now();
    const target = scoreResult.overallScore;
    const duration = 1250;

    const animateNum = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedScore(Math.round(target * eased));
      if (p < 1) {
        rafId = requestAnimationFrame(animateNum);
      }
    };
    rafId = requestAnimationFrame(animateNum);

    // 2.1 秒後由 `%` 湧升儀式感順暢展開雙欄「9:16 動態配音小卡 + 四維度分數 + QR Code」
    const autoStageTimer = window.setTimeout(() => {
      setResultSubStage((prev) => (prev === 0 ? 1 : prev));
    }, 2100);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(autoStageTimer);
    };
  }, [speakState, scoreResult]);

  // 6. 重置回到 Slide 1 (回首頁)
  const handleRestart = useCallback(() => {
    clearStudioTimers();
    stopUserVoiceAudio();
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
    }
    if (studioVideoRef.current) {
      studioVideoRef.current.pause();
    }
    setIsVideoPlayingUnmuted(false);
    setMuteInput(false);
    stopRecording();
    clearRecordedAudio();
    setIsActivelyRecording(false);
    setElapsedRecordTime(0);
    setScoreResult(null);
    setResultSubStage(0);
    setShowDetailModal(false);
    setSpeakState('LANDING');
    calibrateNoiseFloor();
  }, [
    clearStudioTimers,
    stopUserVoiceAudio,
    stopRecording,
    clearRecordedAudio,
    calibrateNoiseFloor,
    setMuteInput,
  ]);

  const handleRestartRef = useRef(handleRestart);
  useEffect(() => {
    handleRestartRef.current = handleRestart;
  }, [handleRestart]);

  // 首頁 BGM 循環播放控制 (僅在 LANDING 頁面播放，離開即停，並支援瀏覽器首次互動自動解鎖)
  useEffect(() => {
    const bgm = bgmAudioRef.current;
    if (!bgm) return;

    if (speakState !== 'LANDING' || bgmMuted) {
      bgm.pause();
      if (speakState !== 'LANDING') {
        bgm.currentTime = 0;
      }
      return;
    }

    bgm.volume = 0.28;
    const tryPlay = () => {
      if (speakState === 'LANDING' && !bgmMuted) {
        bgm.play().catch(() => {});
      }
    };
    tryPlay();

    const unlockOnInteract = () => {
      tryPlay();
    };
    window.addEventListener('pointerdown', unlockOnInteract, { once: true });
    window.addEventListener('keydown', unlockOnInteract, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockOnInteract);
      window.removeEventListener('keydown', unlockOnInteract);
    };
  }, [speakState, bgmMuted]);

  // Page 4 右上角「30 秒後自動回首頁」可視化 SVG 圓形倒數進度環 (試聽原音或開啟匯出視窗時暫停)
  useEffect(() => {
    if (speakState !== 'SCORE_ANALYSIS' || resultSubStage === 0) return;
    if (showDetailModal || isMaintainerOpen || isPlayingUserVoice) return;

    const timer = window.setInterval(() => {
      setResultCountdownSec((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => handleRestartRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [speakState, resultSubStage, showDetailModal, isMaintainerOpen, isPlayingUserVoice]);

  // 在結算頁有任何滑鼠點擊或滾輪互動時，重置 30 秒倒數環，避免使用者操作中途被切掉
  const resetResultCountdown = useCallback(() => {
    if (speakState === 'SCORE_ANALYSIS') {
      setResultCountdownSec(30);
    }
  }, [speakState]);

  // 原音回放控制 (與結算頁左側 9:16 小卡影片同步重播)
  const toggleReplayUserVoice = useCallback(() => {
    resetResultCountdown();
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
    if (resultCardVideoRef.current) {
      resultCardVideoRef.current.currentTime = imitationWindow.startSec;
      resultCardVideoRef.current.play().catch(() => {});
    }
    const audio = new Audio(userAudioUrl);
    replayAudioRef.current = audio;
    audio.onended = () => setIsPlayingUserVoice(false);
    audio.onerror = (err) => {
      console.warn('[See How You Speak] Audio replay failed:', err);
      setIsPlayingUserVoice(false);
    };
    setIsPlayingUserVoice(true);
    audio.play().catch((err) => {
      console.warn('[See How You Speak] Audio play() rejected:', err);
      setIsPlayingUserVoice(false);
    });
  }, [userAudioUrl, isPlayingUserVoice, imitationWindow.startSec, resetResultCountdown]);

  // 當結算頁展開雙欄 9:16 動態配音小卡 (resultSubStage === 1) 時，自動播放一次玩家的配音與影片
  useEffect(() => {
    if (speakState !== 'SCORE_ANALYSIS' || resultSubStage !== 1) return;
    if (resultCardVideoRef.current) {
      resultCardVideoRef.current.currentTime = imitationWindow.startSec;
      resultCardVideoRef.current.play().catch(() => {});
    }
    if (userAudioUrl) {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause();
        replayAudioRef.current.currentTime = 0;
        replayAudioRef.current = null;
      }
      const audio = new Audio(userAudioUrl);
      replayAudioRef.current = audio;
      audio.onplay = () => setIsPlayingUserVoice(true);
      audio.onended = () => setIsPlayingUserVoice(false);
      audio.onerror = () => setIsPlayingUserVoice(false);
      audio.play().catch(() => setIsPlayingUserVoice(false));
    }
    return () => {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause();
        replayAudioRef.current.currentTime = 0;
        replayAudioRef.current = null;
      }
    };
  }, [speakState, resultSubStage, imitationWindow.startSec, userAudioUrl]);

  // 7. Cytus II 滾輪驅動控制器 (Slide 1 -> Slide 2, Slide 2 Coverflow 水平移動, Slide 4 -> 展開小卡)
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
        resetResultCountdown();
        if (resultSubStage === 0 && dir > 0) {
          setResultSubStage(1);
        }
      }
    },
    [
      speakState,
      railIndex,
      moveRailTo,
      resultSubStage,
      isMaintainerOpen,
      showDetailModal,
      unlockAudio,
      resetResultCountdown,
    ]
  );

  // 8. Omni-Input 整合遙控與快捷鍵
  const handleOmniAction = useCallback(
    (action: OmniActionType, source: OmniInputSource, payload?: any) => {
      // 結算頁由右上角可視化 28 秒 SVG 倒數進度環統一接管，封鎖隱藏的 12s 看門狗干擾
      if (source === 'watchdog') {
        return;
      }
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
      if (action === 'FORCE_SUBMIT' && speakState === 'RECORDING') {
        if (studioStep === 'RECORD') {
          stopStudioRecordingToReview();
        } else if (studioStep === 'REVIEW') {
          confirmAndGoToResult();
        }
        return;
      }
      if (action === 'START_RECORDING') {
        enterRecordingStage();
        return;
      }
      if (action === 'PREV_STEP') {
        if (speakState === 'PROMPT_VIDEO') {
          moveRailTo(railIndex - 1);
        } else if (speakState === 'RECORDING') {
          setSpeakState('PROMPT_VIDEO');
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
          if (studioStep === 'WATCH') {
            startImitationCountdown();
          } else if (studioStep === 'RECORD' && isActivelyRecording) {
            stopStudioRecordingToReview();
          } else if (studioStep === 'REVIEW') {
            confirmAndGoToResult();
          }
        } else if (speakState === 'SCORE_ANALYSIS') {
          if (resultSubStage === 0) {
            setResultSubStage(1);
          } else {
            handleRestart();
          }
        }
      }
    },
    [
      speakState,
      studioStep,
      coverflowRail,
      railIndex,
      moveRailTo,
      activeRailItem,
      isActivelyRecording,
      resultSubStage,
      handleRestart,
      enterRecordingStage,
      startImitationCountdown,
      stopStudioRecordingToReview,
      confirmAndGoToResult,
      unlockAudio,
    ]
  );

  const { lastActionSource } = useOmniInput({
    currentState: speakState,
    audioMetrics,
    voiceTriggerLocked: isVideoPlayingUnmuted || isPlayingUserVoice,
    onAction: handleOmniAction,
    enableVoiceVad,
    watchdogPaused: true, // 由 Page 4 可視化 28 秒 SVG 倒數進度環完全取代隱藏看門狗
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

  // Slide 1 水面倒影微動態波形位移 + 標題逐詞聲控物理量
  // 調高首頁觸發門檻，避免現場喇叭播放 BGM 造成誤觸發
  const landingVoiceActive =
    audioMetrics.isVoiceActive &&
    audioMetrics.smoothVolume > Math.max(26, noiseFloor * 1.45);
  const reflectionWaveShift = landingVoiceActive
    ? Math.max(-5, Math.min(5, audioMetrics.pitchYOffset * 0.22))
    : 0;
  const heroVolNorm = landingVoiceActive ? audioMetrics.smoothVolume / 100 : 0;
  const heroPitchOffset = landingVoiceActive
    ? clampVal(audioMetrics.pitchYOffset * 0.55, -18, 18)
    : 0;
  const heroSustainScaleX =
    landingVoiceActive && audioMetrics.sustainedDuration > 0.2
      ? clampVal(1 + audioMetrics.sustainedDuration * 0.45, 1, 1.48)
      : 1;
  const heroJitterX =
    landingVoiceActive && (audioMetrics.jitter ?? 0) > 1.5
      ? Math.sin(audioMetrics.rawVolume) * 2.2
      : 0;

  // Page 3 進度條上的模仿段色塊位置百分比
  const safeTotalDur = Math.max(1, studioVideoDuration);
  const imitateLeftPct = clampVal((imitationWindow.startSec / safeTotalDur) * 100, 0, 92);
  const imitateWidthPct = clampVal(
    ((imitationWindow.endSec - imitationWindow.startSec) / safeTotalDur) * 100,
    8,
    100 - imitateLeftPct
  );
  const playheadPct = clampVal((studioVideoTime / safeTotalDur) * 100, 0, 100);
  const isInsideImitateSegment =
    studioVideoTime >= imitationWindow.startSec - 0.15 &&
    studioVideoTime <= imitationWindow.endSec + 0.25;

  // SVG 倒數進度環參數 (r = 11, circumference ≈ 69.1)
  const ringCircumference = 2 * Math.PI * 11;
  const ringDashOffset = ringCircumference * (1 - clampVal(resultCountdownSec / 30, 0, 1));

  return (
    <div
      onWheel={handleGlobalWheel}
      onClick={resetResultCountdown}
      className="relative w-screen h-screen overflow-hidden bg-white text-black select-none"
    >
      {/* 貫穿全流程的 Figma 極簡黑白 Looper 粒子球 + 流體波浪畫布 */}
      <VoiceVisualizer3D
        audioMetrics={audioMetrics}
        aestheticMode="figma-monochrome"
        stage={speakState}
        scoreValue={scoreResult?.overallScore ?? 73}
        resultSubStage={resultSubStage}
      />

      {/* 極簡隱蔽式頂部列 (僅於 LANDING 與 PROMPT_VIDEO 顯示，錄音室與結算頁使用專屬導覽頂欄) */}
      {(speakState === 'LANDING' || speakState === 'PROMPT_VIDEO') && (
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
              MATS v2.0 // Acoustic Typography
            </span>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
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

            <button
              onClick={() => unlockAudio()}
              className="px-3 py-1 rounded-full bg-white/75 hover:bg-white border border-black/15 text-[10px] font-iosevka text-black/80 flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-all"
              title="點擊啟用 / 確認麥克風即時收音交互"
            >
              <Mic className={`w-3 h-3 ${isListening ? 'text-black' : 'text-black/40'}`} />
              <span
                className={`w-1.5 h-1.5 rounded-full transition-transform ${
                  audioMetrics.isVoiceActive
                    ? 'bg-black scale-125'
                    : isListening
                    ? 'bg-black/50'
                    : 'bg-black/20'
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
      )}

      {/* ================================================================
          PAGE 1: LANDING (首頁：背景動態字幕浮現示範 + 標題隨麥克風變大/高低/拉長)
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
            {/* 首頁循環 BGM (離開首頁即自動停止) */}
            <audio ref={bgmAudioRef} src="/audio/bgm_landing.mp3" loop preload="auto" />

            {/* 右上角 / 左上角極簡 BGM 靜音切換 */}
            <button
              onClick={() => setBgmMuted((m) => !m)}
              className="fixed top-4 left-4 z-30 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 shadow-sm flex items-center gap-1.5 text-[11px] font-iosevka text-black/75 cursor-pointer transition-all"
              title={bgmMuted ? '開啟首頁背景音樂' : '靜音首頁背景音樂'}
            >
              {bgmMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{bgmMuted ? 'BGM OFF' : 'BGM ON'}</span>
            </button>

            {/* 中央主標題與水面鏡像倒影：每個單字隨麥克風音量變大、隨音高上下跳動、隨延音拉長 */}
            <div className="relative flex flex-col items-center justify-center select-none pointer-events-none">
              <span className="font-iosevka text-[10px] sm:text-xs tracking-[0.35em] text-black/50 uppercase mb-3">
                AI 語音動態字幕體驗
              </span>

              <div className="font-yuji text-[clamp(2.2rem,5.4vw,4.35rem)] leading-[1.08] text-black tracking-tight text-center drop-shadow-[0_0_24px_rgba(255,255,255,0.9)] flex flex-wrap items-baseline justify-center gap-x-3 sm:gap-x-4">
                <motion.span
                  animate={{
                    y: heroPitchOffset * 0.4,
                    scale: 1 + heroVolNorm * 0.12,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="inline-block"
                >
                  See
                </motion.span>
                <motion.span
                  animate={{
                    y: -Math.abs(heroPitchOffset) * 0.85 - heroVolNorm * 10,
                    scale: 1.06 + heroVolNorm * 0.38,
                    x: heroJitterX,
                  }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                  className="inline-block font-bold"
                >
                  How
                </motion.span>
                <motion.span
                  animate={{
                    y: heroPitchOffset * 0.65,
                    scale: 1 + heroVolNorm * 0.16,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="inline-block"
                >
                  You
                </motion.span>
                <motion.span
                  animate={{
                    y: heroPitchOffset,
                    scale: 1.04 + heroVolNorm * 0.42,
                    scaleX: heroSustainScaleX,
                    x: -heroJitterX,
                  }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                  className="inline-block font-bold origin-left"
                >
                  Speak.
                </motion.span>
              </div>

              {/* 水面水平交界微留白 */}
              <div className="h-5 sm:h-7" />

              {/* 上下翻轉鏡像倒影，隨聲音微幅漣漪搖晃 */}
              <div
                aria-hidden="true"
                className="font-yuji text-[clamp(2.2rem,5.4vw,4.35rem)] leading-[1.08] text-black/75 tracking-tight text-center water-reflection-mask"
                style={{
                  transform: `scaleY(-1) translateX(${reflectionWaveShift.toFixed(1)}px) scaleX(${heroSustainScaleX.toFixed(2)})`,
                  filter: `blur(${landingVoiceActive ? 1.9 : 1.1}px)`,
                }}
              >
                See How You Speak.
              </div>

              {/* 破冰提示與聲控說明膠囊 (PDF Page 4) */}
              <p className="mt-5 font-mats-tc text-xs sm:text-sm text-black/65 tracking-wide">
                你的音高、音量、延音與語速，會即時變成會動的字幕
              </p>

              <button
                onClick={() => unlockAudio()}
                className="mt-3 pointer-events-auto px-4 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 shadow-sm flex items-center gap-2 text-xs font-mats-tc text-black/80 cursor-pointer transition-all"
              >
                <Mic
                  className={`w-3.5 h-3.5 ${
                    landingVoiceActive ? 'text-black animate-bounce' : 'text-black/55'
                  }`}
                />
                <span>
                  對麥克風說聲「哈囉」，上面的標題會跟著你的聲音變大、跳動、拉長
                </span>
              </button>
            </div>

            {/* 底部發光白暈圓膠囊 START. 按鈕 */}
            <motion.button
              onClick={async () => {
                await unlockAudio().catch(() => {});
                setSpeakState('PROMPT_VIDEO');
              }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              className="absolute bottom-[6.5vh] sm:bottom-[8vh] left-1/2 -translate-x-1/2 w-[232px] h-[92px] glow-pill-white flex items-center justify-center cursor-pointer group"
            >
              <span className="font-iosevka text-[30px] sm:text-[36px] font-medium text-black tracking-[0.04em] transition-transform group-hover:tracking-[0.08em]">
                START.
              </span>
            </motion.button>

            <span className="fixed bottom-2.5 left-1/2 -translate-x-1/2 font-iosevka text-[10px] tracking-[0.22em] text-black/45 pointer-events-none">
              SPEAK TO TEST MIC · CLICK START OR SCROLL TO ENTER
            </span>
          </motion.section>
        )}

        {/* ================================================================
            PAGE 2: PROMPT_VIDEO (選片頁：側邊壓暗影片卡 + 秒數與難度標籤 + 動態字幕預覽)
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
            {/* 背景微透明預覽氛圍層 (改用輕量靜態縮圖，避免重複開啟 1080p video 搶頻寬) */}
            {activeRailItem?.kind === 'scenario' && activeRailItem.scenario.posterUrl && (
              <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.09]">
                <img
                  key={`bg-${activeRailItem.scenario.id}`}
                  src={activeRailItem.scenario.posterUrl}
                  alt=""
                  className="w-full h-full object-cover grayscale blur-[3px] scale-105"
                />
              </div>
            )}

            {/* 頂部操作輔助列 */}
            <div className="relative z-20 w-full max-w-6xl flex items-center justify-between text-[11px] font-iosevka text-black/60">
              <button
                onClick={() => setSpeakState('LANDING')}
                className="px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 cursor-pointer transition-all font-mats-tc text-xs text-black/80"
              >
                ← 返回首頁
              </button>
              <span className="hidden sm:inline tracking-[0.18em] uppercase">
                選一段你想模仿的台詞 · SCROLL OR CLICK ({railIndex + 1}/{coverflowRail.length})
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

            {/* 中央 3D 層疊 Coverflow 視窗 (側邊非焦點卡改為「影片壓暗縮圖」) */}
            <div className="relative z-20 w-full max-w-6xl flex-1 flex items-center justify-center my-2 perspective-[1200px]">
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
                  : '#222222';

                const scImitateDur =
                  item.kind === 'scenario'
                    ? Math.round(
                        (item.scenario.imitateEndSec ?? 5) - (item.scenario.imitateStartSec ?? 0.5)
                      )
                    : 5;
                const scStars = item.kind === 'scenario' ? item.scenario.difficultyStars ?? 2 : 2;
                const starString = '★'.repeat(scStars) + '☆'.repeat(3 - scStars);

                return (
                  <motion.div
                    key={item.id}
                    initial={false}
                    animate={{
                      x: `${translateXPercent}%`,
                      scale,
                      opacity: isCenter ? 1 : absOff === 1 ? 0.92 : absOff === 2 ? 0.75 : 0.52,
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
                    className={`absolute w-[88vw] max-w-[840px] aspect-[869/493] rounded-[31px] shadow-[0_24px_60px_rgba(0,0,0,0.22)] border overflow-hidden transition-colors ${
                      isCenter
                        ? item.kind === 'tag'
                          ? 'border-black/40 text-white cursor-pointer'
                          : 'border-black/20 text-black'
                        : 'border-black/25 cursor-pointer pointer-events-auto'
                    }`}
                  >
                    {/* 側邊非焦點卡：改為「影片壓暗縮圖 + 台詞預覽」 (Canva 白板便利貼共識) */}
                    {!isCenter && (
                      <div className="relative w-full h-full flex flex-col justify-between p-6 bg-neutral-900 text-white overflow-hidden">
                        {item.kind === 'scenario' && item.scenario.posterUrl && (
                          <img
                            src={item.scenario.posterUrl}
                            alt={item.scenario.title}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover opacity-35 grayscale brightness-75 pointer-events-none"
                          />
                        )}
                        <div className="relative z-10 flex items-center justify-between text-[10px] font-iosevka text-white/65">
                          <span>
                            {item.kind === 'tag'
                              ? item.tag.shortLabel
                              : `${item.scenario.tagLabel} · 模仿 ${scImitateDur} 秒`}
                          </span>
                        </div>
                        <div className="relative z-10 my-auto text-center">
                          <span className="font-mats-tc text-base font-bold tracking-wider text-white/85 block">
                            {item.kind === 'tag' ? item.tag.title : item.scenario.character}
                          </span>
                          {item.kind === 'scenario' && (
                            <span className="font-mats-tc text-xs text-white/60 mt-1 block">
                              「{item.scenario.line}」
                            </span>
                          )}
                        </div>
                        <div className="relative z-10 text-right font-iosevka text-[10px] text-white/45">
                          CLICK TO PREVIEW
                        </div>
                      </div>
                    )}

                    {/* 中央焦點 TAG 排頭卡 */}
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

                    {/* 中央焦點台詞挑戰卡 (PDF Page 5: 類別 / 模仿秒數 / 難度 + 一句話情境 + 動態字幕效果預覽 + 選這段) */}
                    {isCenter && item.kind === 'scenario' && (
                      <div className="w-full h-full grid grid-cols-1 md:grid-cols-12 gap-4 p-5 sm:p-7 bg-[#E5E5E5]/95 backdrop-blur-md">
                        {/* 左欄：原片預覽視窗 + 字幕效果預覽框 */}
                        <div className="md:col-span-7 flex flex-col gap-2.5 justify-between">
                          <div className="relative w-full flex-1 min-h-[155px] rounded-[20px] overflow-hidden bg-black/95 border border-black/15 flex items-center justify-center group">
                            {(item.scenario.selectionVideoUrl || item.scenario.videoPromptUrl) && (
                              <video
                                key={item.scenario.id}
                                ref={previewVideoRef}
                                src={item.scenario.selectionVideoUrl || item.scenario.videoPromptUrl}
                                poster={item.scenario.posterUrl}
                                preload="auto"
                                autoPlay
                                loop
                                playsInline
                                muted={previewMuted}
                                className="w-full h-full object-contain"
                                onPlay={() => setIsVideoPlayingUnmuted(!previewMuted)}
                                onPause={() => setIsVideoPlayingUnmuted(false)}
                              />
                            )}
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
                            <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/70 text-white/90 font-iosevka text-[10px]">
                              {item.scenario.selectionVideoUrl
                                ? `精華預覽 · 模仿 ${scImitateDur} 秒`
                                : `模仿段 ${formatTimeShort(item.scenario.imitateStartSec ?? 0.5)}–${formatTimeShort(item.scenario.imitateEndSec ?? 5.5)}`}
                            </span>
                          </div>

                          {/* 動態字幕效果預覽框 (PDF Page 5: 字幕效果預覽) */}
                          <div className="w-full py-2 px-3.5 rounded-[16px] bg-white/85 border border-black/12 flex flex-col justify-center min-h-[76px] overflow-hidden">
                            <div className="flex items-center justify-between text-[9px] font-iosevka text-black/45 mb-0.5">
                              <span>字幕效果預覽 // KINETIC PREVIEW</span>
                              <span>{item.scenario.tagFocus}</span>
                            </div>
                            <div className="flex items-center justify-center">
                              <KineticTypography
                                text={item.scenario.line}
                                audioMetrics={previewDemoMetrics}
                                noiseFloor={12}
                                variant="card"
                                aestheticMode="monochrome"
                                ktvMode={true}
                                charSnapshots={buildPreviewSnapshots(item.scenario)}
                                activeCharIndex={previewActiveCharIndex}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 右欄：類別/秒數/難度標籤 + 角色名稱 + 一句話交代情境 + 【選這段 →】 */}
                        <div className="md:col-span-5 flex flex-col justify-between py-1">
                          <div className="space-y-2.5">
                            {/* PDF Page 5 三合一資訊膠囊列 */}
                            <div className="flex flex-wrap items-center gap-1.5 font-iosevka text-[10px]">
                              <span className="px-2.5 py-0.5 rounded-full bg-black text-white font-bold">
                                {item.scenario.tagLabel}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-white/80 border border-black/15 text-black/80 font-bold">
                                模仿 {scImitateDur} 秒
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-white/80 border border-black/15 text-black/75">
                                難度 {starString}
                              </span>
                            </div>

                            <h3 className="font-mats-tc font-black text-xl sm:text-2xl text-black leading-snug">
                              {item.scenario.title}
                            </h3>

                            {/* 一句話交代情境 (PDF Page 5) */}
                            <p className="font-mats-tc text-xs text-black/75 leading-relaxed bg-white/60 p-2.5 rounded-xl border border-black/10">
                              {item.scenario.contextDesc || item.scenario.hint}
                            </p>

                            <div className="p-2.5 rounded-xl bg-white/80 border border-black/10">
                              <span className="font-iosevka text-[9px] text-black/45 block mb-0.5">
                                TARGET MANDARIN LINE
                              </span>
                              <p className="font-mats-tc font-bold text-sm sm:text-base text-black">
                                「{item.scenario.line}」
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              enterRecordingStage(item.scenario);
                            }}
                            className="w-full mt-3 py-3.5 px-5 rounded-full bg-black hover:bg-neutral-800 text-white font-mats-tc font-bold text-xs sm:text-sm tracking-[0.1em] flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
                          >
                            <span>選這段 // 進入模仿</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* 底部 5 顆 TAG. 快速分類膠囊按鈕 + 水平進度捲動軸 */}
            <div className="relative z-20 w-full max-w-5xl flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-5">
                {SCENARIO_TAGS.map((tag, tIdx) => {
                  const isActiveTag = activeTagIdx === tIdx;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleJumpToTag(tag.id)}
                      className={`h-[42px] sm:h-[50px] px-4 sm:px-6 rounded-[50px] font-iosevka text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 border ${
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
            PAGE 3: RECORDING STUDIO (100% 採用 PDF 前三頁功能，保留極簡黑白美學)
            同一畫面依序切換：1 看情境 (WATCH) -> 3-2-1 倒數 -> 2 錄音 (RECORD) -> 3 看效果 (REVIEW)
           ================================================================ */}
        {speakState === 'RECORDING' && (
          <motion.section
            key="slide-3-recording-studio"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-between py-4 sm:py-6 px-4 sm:px-10"
          >
            {/* 頂部導覽列：左上固定【< 返回選片】、中央片名與類別、右上三階段步驟指示器 */}
            <div className="w-full max-w-5xl flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  clearStudioTimers();
                  stopUserVoiceAudio();
                  stopRecording();
                  setIsActivelyRecording(false);
                  setSpeakState('PROMPT_VIDEO');
                }}
                className="px-4 py-1.5 rounded-full bg-white/85 hover:bg-white border border-black/20 text-black font-mats-tc text-xs font-medium flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>返回選片</span>
              </button>

              <div className="flex flex-col items-center text-center">
                <span className="font-iosevka text-[10px] tracking-[0.15em] text-black/50">
                  [{selectedScenario.tagLabel}]
                </span>
                <h2 className="font-mats-tc font-bold text-sm sm:text-base text-black">
                  {selectedScenario.title}
                </h2>
              </div>

              {/* 右上角三階段步驟指示器：1 看情境 | 2 錄音 | 3 看效果 */}
              <div className="flex items-center gap-1.5 bg-white/80 p-1 rounded-full border border-black/15 backdrop-blur-md">
                <button
                  onClick={() => {
                    if (studioStep !== 'RECORD' && studioStep !== 'COUNTDOWN') {
                      stopUserVoiceAudio();
                      setStudioStep('WATCH');
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-mats-tc font-bold transition-all ${
                    studioStep === 'WATCH'
                      ? 'bg-black text-white shadow-sm'
                      : 'text-black/45 hover:text-black/75 cursor-pointer'
                  }`}
                >
                  1 看情境
                </button>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mats-tc font-bold transition-all ${
                    studioStep === 'COUNTDOWN' || studioStep === 'RECORD'
                      ? 'bg-black text-white shadow-sm'
                      : 'text-black/45'
                  }`}
                >
                  2 錄音
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mats-tc font-bold transition-all ${
                    studioStep === 'REVIEW'
                      ? 'bg-black text-white shadow-sm'
                      : 'text-black/45'
                  }`}
                >
                  3 看效果
                </span>
              </div>
            </div>

            {/* 中央主影片與動態字幕舞台 (PDF Pages 1, 2, 3 共用同一視窗) */}
            <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center my-2 min-h-0">
              <div
                className={`relative w-full h-full max-h-[56vh] aspect-video rounded-[24px] overflow-hidden bg-neutral-950 shadow-[0_20px_60px_rgba(0,0,0,0.22)] transition-all duration-300 flex items-center justify-center ${
                  studioStep === 'RECORD'
                    ? 'border-[2.5px] border-black ring-4 ring-black/15'
                    : 'border border-black/20'
                }`}
              >
                {/* 情境影片層：錄音中自動壓暗且原音靜音 */}
                {selectedScenario.videoPromptUrl && (
                  <video
                    key={selectedScenario.id}
                    ref={studioVideoRef}
                    src={
                      (studioStep === 'RECORD' || studioStep === 'REVIEW') &&
                      selectedScenario.muteVideoUrl
                        ? selectedScenario.muteVideoUrl
                        : selectedScenario.videoPromptUrl
                    }
                    poster={selectedScenario.posterUrl}
                    preload="auto"
                    playsInline
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && isFinite(d) && d > 0.5) {
                        setStudioVideoDuration(d);
                      }
                    }}
                    onTimeUpdate={(e) => {
                      if (studioStep === 'RECORD') return;
                      const t = e.currentTarget.currentTime;
                      setStudioVideoTime(t);
                      // 在 Step 3「看效果」時，限制影片在模仿段區間內循環
                      if (studioStep === 'REVIEW' && t >= imitationWindow.endSec) {
                        e.currentTarget.currentTime = imitationWindow.startSec;
                        e.currentTarget.play().catch(() => {});
                      }
                    }}
                    onEnded={(e) => {
                      if (studioStep === 'WATCH') {
                        e.currentTarget.currentTime = 0;
                        e.currentTarget.play().catch(() => {});
                      } else if (studioStep === 'REVIEW') {
                        e.currentTarget.currentTime = imitationWindow.startSec;
                        e.currentTarget.play().catch(() => {});
                      }
                    }}
                    className={`w-full h-full object-contain transition-all duration-300 ${
                      studioStep === 'RECORD' || studioStep === 'COUNTDOWN'
                        ? 'brightness-[0.38] contrast-105'
                        : studioStep === 'REVIEW'
                        ? 'brightness-[0.65]'
                        : 'brightness-95'
                    }`}
                  />
                )}

                {/* 左上角狀態膠囊：Step 2 顯示 REC 00:03 / 00:05；Step 3 顯示 🔊 你的聲音 */}
                {studioStep === 'RECORD' && (
                  <div className="absolute top-4 left-4 z-20 px-3.5 py-1.5 rounded-full bg-black/85 border border-white/25 text-white font-iosevka text-xs font-bold flex items-center gap-2 backdrop-blur-md">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span>
                      REC {formatTimeMMSS(elapsedRecordTime)} /{' '}
                      {formatTimeMMSS(imitationWindow.durationSec)}
                    </span>
                  </div>
                )}

                {studioStep === 'REVIEW' && (
                  <button
                    onClick={playReviewDubbing}
                    className="absolute top-4 left-4 z-20 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-black font-mats-tc text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                  >
                    <Volume2
                      className={`w-3.5 h-3.5 ${isPlayingUserVoice ? 'animate-pulse' : ''}`}
                    />
                    <span>你的聲音</span>
                  </button>
                )}

                {studioStep === 'WATCH' && (
                  <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/65 border border-white/15 text-white/85 font-mats-tc text-[11px] backdrop-blur-md">
                    完整情境（含原音）
                  </div>
                )}

                {/* 3-2-1 倒數遮罩層 */}
                <AnimatePresence>
                  {studioStep === 'COUNTDOWN' && (
                    <motion.div
                      key={`cd-${countdownNum}`}
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.2 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px] text-white"
                    >
                      <span className="font-iosevka text-7xl sm:text-8xl font-bold tracking-wider">
                        {countdownNum}
                      </span>
                      <span className="mt-2 font-mats-tc text-xs sm:text-sm text-white/80">
                        準備開口模仿黃色高亮段落：「{selectedScenario.line}」
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 影片底部字幕舞台：
                    - Step 1 (WATCH): 非模仿段顯示標準字幕，進入模仿段顯示動態示範字幕
                    - Step 2 (RECORD): KTV 逐字填色 + 即時隨玩家音量/音高/延音變形定格
                    - Step 3 (REVIEW): 呈現玩家剛錄好的定格聲學動態字幕造型 */}
                <div className="absolute bottom-0 left-0 right-0 z-20 pt-10 pb-4 px-4 bg-gradient-to-t from-black/90 via-black/55 to-transparent flex flex-col items-center justify-end">
                  {studioStep === 'WATCH' ? (
                    <div className="w-full flex flex-col items-center">
                      {isInsideImitateSegment ? (
                        <span className="mb-1 px-2.5 py-0.5 rounded-full bg-[#F5A623]/25 border border-[#F5A623]/60 text-[#F5A623] font-iosevka text-[10px]">
                          ★ 目標模仿段落
                        </span>
                      ) : null}
                      <p
                        className={`font-mats-tc font-bold text-xl sm:text-3xl tracking-wide text-center transition-colors ${
                          isInsideImitateSegment ? 'text-[#F5A623]' : 'text-white/90'
                        }`}
                      >
                        {selectedScenario.line}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-center">
                      <KineticTypography
                        text={selectedScenario.line}
                        audioMetrics={audioMetrics}
                        noiseFloor={noiseFloor}
                        variant="preview"
                        aestheticMode="monochrome"
                        darkSurface={true}
                        ktvMode={true}
                        charSnapshots={charSnapshots}
                        activeCharIndex={activeKtvCharIdx}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 進度條與「模仿段 0:18–0:23」高亮色塊標示 (PDF Pages 1, 2, 3) */}
              <div className="w-full max-w-3xl mt-6 px-2">
                <div className="flex items-center gap-3">
                  <span className="font-iosevka text-xs text-black/60 w-11 text-right">
                    {formatTimeMMSS(studioVideoTime)}
                  </span>

                  <div
                    ref={timelineBarRef}
                    onMouseDown={(e) => {
                      isDraggingTimelineRef.current = true;
                      seekStudioVideoByClientX(e.clientX);
                    }}
                    onMouseMove={(e) => {
                      if (isDraggingTimelineRef.current) {
                        seekStudioVideoByClientX(e.clientX);
                      }
                    }}
                    onMouseUp={() => {
                      isDraggingTimelineRef.current = false;
                    }}
                    onMouseLeave={() => {
                      isDraggingTimelineRef.current = false;
                    }}
                    className={`relative flex-1 h-2.5 rounded-full bg-black/15 select-none ${
                      studioStep === 'WATCH' || studioStep === 'REVIEW'
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed'
                    }`}
                  >
                    {/* 已播放基礎軌 */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-black/35 rounded-l-full"
                      style={{ width: `${playheadPct}%` }}
                    />

                    {/* 模仿段高亮色塊 + 上方標籤 */}
                    <div
                      className="absolute top-0 bottom-0 rounded-full bg-black border border-black shadow-sm"
                      style={{
                        left: `${imitateLeftPct}%`,
                        width: `${imitateWidthPct}%`,
                      }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-black text-white font-iosevka text-[10px] font-bold shadow">
                        {studioStep === 'REVIEW' ? '你的模仿' : '模仿段'}{' '}
                        {formatTimeShort(imitationWindow.startSec)}–
                        {formatTimeShort(imitationWindow.endSec)}
                      </span>
                    </div>

                    {/* 可拖曳圓點 Playhead */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-[2.5px] border-black shadow-md transition-transform hover:scale-125"
                      style={{ left: `${playheadPct}%` }}
                    />
                  </div>

                  <span className="font-iosevka text-xs text-black/60 w-11">
                    {formatTimeMMSS(studioVideoDuration)}
                  </span>
                </div>
              </div>
            </div>

            {/* 底部狀態提示與「每階段單一主按鈕」控制區 (PDF Pages 1, 2, 3) */}
            <div className="w-full max-w-3xl flex flex-col items-center gap-3 pb-1">
              {/* Step 1: 看情境 */}
              {studioStep === 'WATCH' && (
                <>
                  <p className="font-mats-tc text-xs sm:text-sm text-black/65 text-center">
                    先看完整情境。<strong className="text-black font-bold">黑色高亮段落</strong>
                    是你要模仿的台詞，可以拖曳進度條重聽。
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        const vid = studioVideoRef.current;
                        if (vid) {
                          vid.currentTime = 0;
                          vid.play().catch(() => {});
                        }
                      }}
                      className="px-5 py-3 rounded-full bg-white/85 hover:bg-white border border-black/20 text-black font-mats-tc text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>再看一次</span>
                    </button>

                    <button
                      onClick={startImitationCountdown}
                      className="px-8 py-3.5 rounded-full bg-black hover:bg-neutral-800 text-white font-mats-tc text-sm sm:text-base font-bold flex items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.22)] cursor-pointer active:scale-95 transition-all"
                    >
                      <Mic className="w-4 h-4" />
                      <span>開始模仿</span>
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: 倒數或錄音中 */}
              {(studioStep === 'COUNTDOWN' || studioStep === 'RECORD') && (
                <>
                  <div className="flex items-center justify-center gap-3 text-xs font-mats-tc text-black/70">
                    <span>音量</span>
                    {/* 即時迷你音量波形柱 */}
                    <div className="flex items-center gap-0.5 h-5 px-2">
                      {[0.35, 0.6, 0.85, 1.0, 0.75, 0.95, 0.65, 0.45, 0.8, 0.5].map((w, i) => {
                        const activeH = Math.max(
                          4,
                          Math.min(20, Math.round((audioMetrics.smoothVolume / 100) * 22 * w))
                        );
                        return (
                          <span
                            key={i}
                            className={`w-1 rounded-full transition-all duration-75 ${
                              audioMetrics.isVoiceActive ? 'bg-black' : 'bg-black/25'
                            }`}
                            style={{ height: `${activeH}px` }}
                          />
                        );
                      })}
                    </div>
                    <span>跟著字唸，片段結束會自動停止</span>
                  </div>

                  <button
                    onClick={stopStudioRecordingToReview}
                    disabled={studioStep === 'COUNTDOWN'}
                    className="px-8 py-3.5 rounded-full bg-black hover:bg-neutral-800 disabled:opacity-40 text-white font-mats-tc text-sm sm:text-base font-bold flex items-center gap-2 shadow-lg cursor-pointer transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>停止錄音</span>
                  </button>
                </>
              )}

              {/* Step 3: 看效果 (含四維度怎麼看圖例 + 重錄 / 再看一次 / 確定，看結果 →) */}
              {studioStep === 'REVIEW' && (
                <>
                  {/* PDF Page 3：怎麼看四維度直覺圖例 (隱性問題 03 防線) */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[11px] font-mats-tc">
                    <span className="text-black/55 font-bold mr-1">怎麼看：</span>
                    <span className="px-2.5 py-1 rounded-full bg-white/85 border border-black/15 text-black/80">
                      字變大 ＝ 音量大
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white/85 border border-black/15 text-black/80">
                      位置高 ＝ 音調高
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white/85 border border-black/15 text-black/80">
                      字拉長 ＝ 延音
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white/85 border border-black/15 text-black/80">
                      字距緊 ＝ 講得快
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={startImitationCountdown}
                      className="px-5 py-3 rounded-full bg-white/85 hover:bg-white border border-black/20 text-black font-mats-tc text-xs sm:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>重錄</span>
                    </button>

                    <button
                      onClick={playReviewDubbing}
                      className="px-5 py-3 rounded-full bg-white/85 hover:bg-white border border-black/20 text-black font-mats-tc text-xs sm:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>再看一次</span>
                    </button>

                    <button
                      onClick={confirmAndGoToResult}
                      className="px-8 py-3.5 rounded-full bg-black hover:bg-neutral-800 text-white font-mats-tc text-sm sm:text-base font-bold flex items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.24)] cursor-pointer active:scale-95 transition-all"
                    >
                      <span>確定，看結果</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.section>
        )}

        {/* ================================================================
            PAGE 4: SCORE_ANALYSIS (保留 % 波浪湧升動畫 ➔ 左欄 9:16 動態配音小卡 + 右欄 4 維度分數 & QR Code + 右上角 28 秒自動回首頁倒數進度環)
           ================================================================ */}
        {speakState === 'SCORE_ANALYSIS' && scoreResult && (
          <motion.section
            key="slides-4-5-6-result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 w-full h-full flex flex-col items-center justify-between py-5 px-4 sm:px-10"
          >
            {/* Sub-stage 0 (~2 秒儀式感)：% 隨黑白液態波浪湧升聚焦 */}
            {resultSubStage === 0 && (
              <div
                onClick={() => setResultSubStage(1)}
                className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
              >
                <motion.div
                  initial={{ filter: 'blur(8px)', scale: 0.88, opacity: 0 }}
                  animate={{ filter: 'blur(0px)', scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  className="flex flex-col items-center justify-center"
                >
                  <span className="font-iosevka text-[clamp(4rem,10vw,8.5rem)] font-medium text-black leading-none tracking-tight">
                    {animatedScore}%
                  </span>
                  <span className="mt-3 font-iosevka text-xs tracking-[0.25em] text-black/55 uppercase">
                    ANALYZING ACOUSTIC SIMILARITY...
                  </span>
                </motion.div>
              </div>
            )}

            {/* Sub-stage 1 (PDF Page 6 主畫面)：頂欄 (含 28 秒自動回首頁倒數環) + 左欄 9:16 動態配音小卡 + 右欄 4 維度與 QR Code */}
            {resultSubStage >= 1 && (
              <>
                {/* 頂部列：左側「你的模仿結果」、右側「◯ 28 秒後自動回首頁」SVG 倒數進度環 */}
                <div className="w-full max-w-5xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-mats-tc font-black text-lg sm:text-xl text-black">
                      你的模仿結果
                    </h2>
                    <span className="hidden sm:inline-block font-iosevka text-[10px] tracking-[0.2em] text-black/45">
                      #{scoreResult.verificationCode}
                    </span>
                  </div>

                  {/* PDF Page 6 右上角：自動回首頁 SVG 圓形倒數進度環 (隱性問題 05 防線) */}
                  <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/85 border border-black/15 shadow-sm backdrop-blur-md">
                    <svg className="w-6 h-6 -rotate-90" viewBox="0 0 28 28">
                      <circle
                        cx="14"
                        cy="14"
                        r="11"
                        fill="none"
                        stroke="rgba(0,0,0,0.12)"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="14"
                        cy="14"
                        r="11"
                        fill="none"
                        stroke="#000000"
                        strokeWidth="2.5"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringDashOffset}
                        strokeLinecap="round"
                        className="transition-all duration-500"
                      />
                    </svg>
                    <span
                      className={`font-mats-tc text-xs font-medium ${
                        resultCountdownSec <= 5 ? 'text-red-600 font-bold animate-pulse' : 'text-black/75'
                      }`}
                    >
                      {resultCountdownSec} 秒後自動回首頁
                    </span>
                  </div>
                </div>

                {/* 中央雙欄主體：左欄 9:16 動態配音小卡 (主角) + 右欄 相似度 / 4 維度條 / QR Code */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="w-full max-w-5xl flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 items-center my-auto py-2"
                >
                  {/* 左欄主角：9:16 直式動態配音小卡 (影片 + 你的聲音 + 動態字幕循環播放) */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center">
                    <div className="w-full max-w-[275px] sm:max-w-[300px] aspect-[9/16] max-h-[68vh] rounded-[26px] bg-neutral-950 text-white border border-black/25 shadow-[0_24px_65px_rgba(0,0,0,0.28)] p-4 flex flex-col justify-between overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-iosevka text-[10px] tracking-[0.22em] text-white/60 block">
                            SEE HOW YOU SPEAK
                          </span>
                          <span className="font-iosevka text-[9px] text-white/40 block mt-0.5">
                            {scoreResult.timestamp}
                          </span>
                        </div>
                        <button
                          onClick={toggleReplayUserVoice}
                          className="shrink-0 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white font-mats-tc text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          {isPlayingUserVoice ? (
                            <>
                              <Square className="w-2.5 h-2.5 fill-current" />
                              <span>播放中</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>重聽原音</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 9:16 小卡內部影片與玩家動態字幕舞台 (object-contain 確保 4:3/16:9 橫式人臉不被裁切) */}
                      <div
                        onClick={toggleReplayUserVoice}
                        className="relative w-full flex-1 my-2.5 rounded-2xl overflow-hidden bg-black border border-white/10 flex flex-col justify-between cursor-pointer group"
                      >
                        {selectedScenario.videoPromptUrl && (
                          <video
                            ref={resultCardVideoRef}
                            src={selectedScenario.muteVideoUrl || selectedScenario.videoPromptUrl}
                            poster={selectedScenario.posterUrl}
                            preload="auto"
                            autoPlay
                            loop
                            muted
                            playsInline
                            onTimeUpdate={(e) => {
                              if (e.currentTarget.currentTime >= imitationWindow.endSec) {
                                e.currentTarget.currentTime = imitationWindow.startSec;
                              }
                            }}
                            className="absolute inset-0 w-full h-full object-contain opacity-85 group-hover:opacity-100 transition-opacity"
                          />
                        )}
                        <div className="relative z-10 p-2.5 flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full bg-black/70 text-white/85 font-mats-tc text-[10px]">
                            影片＋你的聲音
                          </span>
                        </div>

                        <div className="relative z-10 mt-auto pt-8 pb-3 px-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex items-center justify-center">
                          <KineticTypography
                            text={selectedScenario.line}
                            audioMetrics={audioMetrics}
                            noiseFloor={noiseFloor}
                            variant="card"
                            aestheticMode="monochrome"
                            darkSurface={true}
                            ktvMode={true}
                            charSnapshots={charSnapshots}
                          />
                        </div>
                      </div>

                      {/* 9:16 小卡底部封號與分數 */}
                      <div className="flex items-end justify-between pt-1">
                        <div>
                          <span className="font-mats-tc text-[10px] text-white/55 block">
                            {selectedScenario.title}
                          </span>
                          <span className="font-mats-tc font-black text-base text-white">
                            {scoreResult.personaTitle || '情緒張力型'}
                          </span>
                        </div>
                        <span className="font-iosevka font-bold text-2xl text-[#F5A623] leading-none">
                          {scoreResult.overallScore}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 右欄輔助資訊：相似度 % + 評語 + 4 維度分數條 (音量/音高/延音/語速) + QR Code + 按鈕 */}
                  <div className="md:col-span-7 flex flex-col justify-between space-y-4 bg-white/80 backdrop-blur-md p-6 sm:p-8 rounded-[28px] border border-black/15 shadow-[0_16px_45px_rgba(0,0,0,0.08)]">
                    <div>
                      <span className="font-mats-tc text-xs text-black/55 font-medium">
                        和原聲的相似度
                      </span>
                      <div className="flex items-baseline gap-4 mt-0.5">
                        <span className="font-iosevka text-5xl sm:text-6xl font-bold text-black tracking-tight">
                          {animatedScore}%
                        </span>
                        <span className="px-3 py-1 rounded-full bg-black text-white font-mats-tc text-xs font-bold">
                          {scoreResult.personaTitle || scoreResult.rankTitle}
                        </span>
                      </div>
                      <p className="mt-2 font-mats-tc text-xs sm:text-sm text-black/75">
                        {scoreResult.comment}
                      </p>
                    </div>

                    {/* PDF Page 6：4 維度量化長條圖 (音量 / 音高 / 延音 / 語速) */}
                    <div className="space-y-2.5 py-1">
                      {[
                        { label: '音量', value: scoreResult.volumeScore },
                        { label: '音高', value: scoreResult.pitchScore },
                        { label: '延音', value: scoreResult.sustainScore ?? 78 },
                        { label: '語速', value: scoreResult.rateScore ?? 74 },
                      ].map((m) => (
                        <div key={m.label} className="flex items-center gap-3">
                          <span className="font-mats-tc text-xs font-bold text-black/75 w-10">
                            {m.label}
                          </span>
                          <div className="flex-1 h-2.5 rounded-full bg-black/10 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${clampVal(m.value, 10, 100)}%` }}
                              transition={{ duration: 0.7, ease: 'easeOut' }}
                              className="h-full rounded-full bg-black"
                            />
                          </div>
                          <span className="font-iosevka text-xs font-bold text-black w-8 text-right">
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* QR Code 掃描帶走小卡區塊 (PDF Page 6) */}
                    <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-neutral-900 text-white">
                      <div className="p-2 rounded-xl bg-white shrink-0">
                        <QRCodeCanvas
                          value={shareQrUrl}
                          size={84}
                          level="M"
                          marginSize={0}
                          fgColor="#000000"
                          bgColor="#FFFFFF"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-mats-tc font-bold text-sm text-white">
                          掃描帶走你的小卡
                        </h4>
                        <p className="font-mats-tc text-xs text-white/65 mt-0.5 leading-relaxed">
                          直式 9:16 動態成果頁，可以直接在手機回味或分享到限時動態。
                        </p>
                        <button
                          onClick={() => setShowDetailModal(true)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-iosevka text-white/85 underline hover:text-white cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>開啟大圖海報與下載視窗</span>
                        </button>
                      </div>
                    </div>

                    {/* 底部行動按鈕：再玩一次 / 回首頁 */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => {
                          stopUserVoiceAudio();
                          setSpeakState('PROMPT_VIDEO');
                        }}
                        className="px-6 py-3 rounded-full bg-white hover:bg-neutral-100 border border-black/20 text-black font-mats-tc text-xs sm:text-sm font-bold cursor-pointer transition-all"
                      >
                        再玩一次
                      </button>

                      <button
                        onClick={handleRestart}
                        className="px-8 py-3 rounded-full bg-black hover:bg-neutral-800 text-white font-mats-tc text-xs sm:text-sm font-bold cursor-pointer shadow-md transition-all"
                      >
                        回首頁
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* 詳細 MATS 小卡 / 海報預覽與下載覆蓋層 */}
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

      {/* 維護者暗樁調試抽屜 */}
      <MaintainerDrawer
        isOpen={isMaintainerOpen}
        onClose={() => setIsMaintainerOpen(false)}
        noiseFloor={noiseFloor}
        onCalibrateNoise={calibrateNoiseFloor}
        lastActionSource={lastActionSource}
        watchdogRemaining={speakState === 'SCORE_ANALYSIS' ? resultCountdownSec : null}
        enableVoiceVad={enableVoiceVad}
        onToggleVoiceVad={() => setEnableVoiceVad((prev) => !prev)}
      />
    </div>
  );
};
