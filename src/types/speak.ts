/**
 * 《See How You Speak》 專案型別定義
 * 嚴格遵循 PRD v2.0.0 規範
 */

export type SpeakState =
  | 'LANDING'        // 待機探索、環境底噪校準
  | 'PROMPT_VIDEO'   // 原片示範台詞與標準聲波
  | 'RECORDING'      // 使用者錄音模仿 + 動態字體 60fps 渲染
  | 'SCORE_ANALYSIS' // DTW 語調相似度演算比對
  | 'EXPORT_CARD';   // 聲音視覺卡片生成與 QR 掃碼

export interface AudioMetrics {
  rawVolume: number;         // 0 ~ 100 未濾波音量
  smoothVolume: number;      // 彈簧阻尼平滑音量
  pitchHz: number;           // 85 ~ 350Hz 基頻
  pitchNormalized: number;   // 0 ~ 1 歸一化音高
  pitchYOffset: number;      // -28 ~ +28 px 語調高低 Y 軸位移
  sustainedDuration: number; // 0 ~ 1.5s 拉長音累加秒數
  isSustained: boolean;      // 是否觸發拉長音狀態
  isStaccato: boolean;       // 是否為短促音/咬字快攻瞬態
  isVoiceActive: boolean;    // 是否突破環境底噪門檻
  frequencyData: Uint8Array; // 頻譜資料 (低/中/高頻)
  waveform: Float32Array;    // 時域波形資料
  // --- MATS v1.0 Extended Acoustic Features ---
  f0MacroHz?: number;        // 300ms 滑動均值巨觀語調基頻 (抗四聲干擾)
  deltaRms?: number;         // 個人基準正規化相對音量 (-1 ~ +3)
  deltaF0?: number;          // 個人基準正規化相對音高 (-1 ~ +1)
  jitter?: number;           // 頻率微擾 (音高震顫度 %, 0 ~ 10)
  hnrDb?: number;            // 諧波雜訊比 (氣聲/沙啞指標 dB, 4 ~ 26)
  speechRate?: number;       // 語速估計 (音節/秒)
  pauseDurationMs?: number;  // 前段靜音停頓時長 (ms)
  valence?: number;          // 情緒效價軸 (-1.0 負向 ~ +1.0 正向)
  arousal?: number;          // 情緒喚起軸 (-1.0 平靜 ~ +1.0 高亢)
}

export interface PhraseCharTiming {
  char: string;
  startSec: number;
  endSec: number;
}

export interface CharAcousticSnapshot {
  char: string;
  scale: number;         // 音量 -> 字體縮放 (0.78 ~ 1.55)
  yOffset: number;       // 音高 -> 垂直位移 (-20 ~ +20 px)
  scaleX: number;        // 延音 -> 水平拉伸 (1.0 ~ 2.1)
  letterSpacing: number; // 語速/停頓 -> 字距 (-1 ~ 12 px)
  weight: number;        // 字重 (500 ~ 900)
  fillProgress: number;  // KTV 逐字填色進度 (0 ~ 1)
  isHighlight?: boolean; // 是否為重音/長音強調字
}

export interface PhraseCycle {
  startSec: number;
  endSec: number;
  charTimings: PhraseCharTiming[];
}

export interface PromptScenario {
  id: string;
  title: string;
  character: string;
  emotion: string;
  tagId: string;             // TAG category ID (e.g. 'tag-panic')
  tagLabel: string;          // Display tag name for Slide 2 header & pill
  tagFocus?: string;         // MATS acoustic dimension highlight for TAG card
  line: string;
  hint: string;
  contextDesc?: string;      // 一句話交代情境鋪陳 (PDF Page 5)
  difficultyStars?: 1 | 2 | 3; // 難度星級 (1~3)
  imitateStartSec?: number;  // 模仿段於完整情境影片中的起始秒數
  imitateEndSec?: number;    // 模仿段於完整情境影片中的結束秒數
  selectionVideoUrl?: string; // 選填：選片階段專用的精華預覽短片 (*-選片.mp4)
  muteVideoUrl?: string;     // 選填：去掉人聲的模仿片段影片路徑 (*-模仿.mp4)
  themeColor: string;
  accentColor: string;
  durationSeconds: number;
  referenceVolumeCurve: number[]; // 歸一化標準音量曲線 (0~100)
  referencePitchCurve: number[];  // 歸一化標準音高曲線 (0~1)
  videoPromptUrl?: string;        // 實體 MP4/MOV/WEBM 示範影片路徑
  audioPromptUrl?: string;        // 實體 MP3/WAV 示範錄音路徑
  ttsConfig?: {                   // TTS 語氣參數
    pitch: number;                // 0.5 ~ 1.5 語調高低
    rate: number;                 // 0.5 ~ 1.5 語速快慢
  };
  charTimings?: PhraseCharTiming[];
  phraseCycles?: PhraseCycle[];   // 多段重複出現台詞時間軸 (例如達達 40.8s 影片中的 6 次吼叫)
}

export interface MATSMetricsSummary {
  avgDeltaRms: number;
  avgF0Hz: number;
  avgJitter: number;
  avgHnrDb: number;
  avgPauseMs: number;
  valence: number;
  arousal: number;
  quadrantLabel: string;
  isCalibrated: boolean;
}

export interface ScoreResult {
  overallScore: number;     // 0 ~ 100 綜合相似度
  volumeScore: number;      // 音量起伏相似度
  pitchScore: number;       // 音高走勢相似度
  sustainScore?: number;    // 延音時長相似度 (0 ~ 100)
  rateScore?: number;       // 語速節奏相似度 (0 ~ 100)
  personaTitle?: string;    // 語氣風格封號 (例如：情緒張力型)
  rank: string;             // SSS / SS / S / A
  rankTitle: string;        // 聲動大師 / 靈魂共鳴者 / 聲學實力派 / 能量突變者
  comment: string;
  verificationCode: string;
  timestamp: string;
  scenarioId: string;
  cloudImageUrl?: string;
  matsMetrics?: MATSMetricsSummary;
}
