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
  pitchNormalized: number;    // 0 ~ 1 歸一化音高
  isVoiceActive: boolean;    // 是否突破環境底噪門檻
  frequencyData: Uint8Array; // 頻譜資料 (低/中/高頻)
  waveform: Float32Array;    // 時域波形資料
}

export interface PromptScenario {
  id: string;
  title: string;
  character: string;
  emotion: string;
  line: string;
  hint: string;
  themeColor: string;
  accentColor: string;
  durationSeconds: number;
  referenceVolumeCurve: number[]; // 歸一化標準音量曲線 (0~100)
  referencePitchCurve: number[];  // 歸一化標準音高曲線 (0~1)
}

export interface ScoreResult {
  overallScore: number;     // 0 ~ 100 綜合相似度
  volumeScore: number;      // 音量起伏相似度 (60% 權重)
  pitchScore: number;       // 音高走勢相似度 (40% 權重)
  rank: string;             // SSS / SS / S / A
  rankTitle: string;        // 聲動大師 / 靈魂共鳴者 / 聲學實力派 / 能量突變者
  comment: string;
  verificationCode: string;
  timestamp: string;
  scenarioId: string;
  cloudImageUrl?: string;
}
