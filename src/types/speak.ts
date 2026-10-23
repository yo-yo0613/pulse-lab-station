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
  videoPromptUrl?: string;        // 實體 MP4/MOV 示範影片路徑 (A/B 53 雙軌容器)
  audioPromptUrl?: string;        // 實體 MP3/WAV 示範錄音路徑 (A/B 38 雙軌架構)
  ttsConfig?: {                   // TTS 語氣參數 (A/B 39 Web Speech 語氣合成)
    pitch: number;                // 0.5 ~ 1.5 語調高低
    rate: number;                 // 0.5 ~ 1.5 語速快慢
  };
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
