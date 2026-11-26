import type { PromptScenario } from '../types/speak';

export interface ScenarioTagMeta {
  id: string;
  shortLabel: string;
  title: string;
  focus: string;
  description: string;
}

export const SCENARIO_TAGS: ScenarioTagMeta[] = [
  {
    id: 'tag-drama8',
    shortLabel: 'TAG.01',
    title: '八點檔・情緒爆發',
    focus: 'ΔRMS + HNR + 字重爆發',
    description: '高能量情緒張力與戲劇化嗆聲，驅動字體放大、加粗與強烈震盪。',
  },
  {
    id: 'tag-series',
    shortLabel: 'TAG.02',
    title: '影集・張力對白',
    focus: 'F0 抑揚頓挫 + Pause 停頓',
    description: '情緒層層堆疊與撕心裂肺的重音哭喊，精準捕捉語調起伏與呼吸張力。',
  },
  {
    id: 'tag-movie',
    shortLabel: 'TAG.03',
    title: '電影・節奏反差',
    focus: 'Duration 延音 + ΔF0 上揚',
    description: '誇張拉長音與戲劇化尾音上揚，呈現電影名場面的喜劇反差感。',
  },
  {
    id: 'tag-anime',
    shortLabel: 'TAG.04',
    title: '動畫・高頻爆發',
    focus: 'ΔF0 ↑ · Jitter ↑',
    description: '經典台灣動畫高頻嘶吼與誇張語氣，測試音高極限與微抖動張力。',
  },
  {
    id: 'tag-meme',
    shortLabel: 'TAG.05',
    title: '迷因・魔性反差',
    focus: 'Pause 停頓 + 低沉收尾',
    description: '輕快連珠炮後突然停頓壓低嗓音，考驗節奏頓點與戲劇反差。',
  },
  {
    id: 'tag-theater',
    shortLabel: 'TAG.06',
    title: '情緒劇場・30 秒起承轉合',
    focus: '活潑 ↔ 冷靜 · 極限反差',
    description: '不綁原片畫面，30 秒體驗「活潑開場 → 爆發 → 停頓 → 冷靜低語」的字體反差張力。',
  },
];

function buildUniformTimings(chars: string[], startSec: number, endSec: number) {
  const step = (endSec - startSec) / Math.max(1, chars.length);
  return chars.map((char, idx) => ({
    char,
    startSec: Number((startSec + idx * step).toFixed(2)),
    endSec: Number((startSec + (idx + 1) * step).toFixed(2)),
  }));
}

function buildScenarioCurve(length: number, peakPos = 0.65, base = 34, peak = 90): number[] {
  return Array.from({ length }, (_, idx) => {
    const ratio = idx / Math.max(1, length - 1);
    const bell = Math.exp(-Math.pow((ratio - peakPos) / 0.25, 2));
    return Math.round(base + (peak - base) * bell);
  });
}

function buildPitchCurve(length: number, low = 0.25, high = 0.85): number[] {
  return Array.from({ length }, (_, idx) => {
    const ratio = idx / Math.max(1, length - 1);
    return Number((low + (high - low) * Math.sin(ratio * Math.PI)).toFixed(2));
  });
}

const LINE_FAMILY = '九九八十七！你有你的專屬答案，八十七！';
const LINE_ROOKIE = '我看你是童裝界的馬來貘！';
const LINE_EVIL = '全天下沒有一個爸爸媽媽，要花一個二十年去養一個殺人犯！';
const LINE_HUSBAND = '哇～老公好棒～！';
const LINE_GRANDMA = '把你阿嬤賣掉！';
const LINE_MOUSE = '噢！一般的，狗、貓、馬、天竺鼠……老鼠。';
const LINE_THEATER = '今天天氣真好！等一下、你剛說什麼？……算了，一切都過去了。';

export const PROMPT_SCENARIOS: PromptScenario[] = [
  // TAG.01: 八點檔・情緒爆發
  {
    id: 'family-reunion-9987',
    title: '一家團圓 // 九九八十七',
    character: '八點檔名場面',
    emotion: '激動 / 質問 / 尾音爆擊',
    tagId: 'tag-drama8',
    tagLabel: 'TAG.01 八點檔',
    tagFocus: 'ΔRMS ↑ · 字重爆發',
    line: LINE_FAMILY,
    hint: '「九九八十七」節奏鏗鏘有力，最後「八十七！」拉高音量與音高爆擊收尾！',
    contextDesc: '八點檔超荒謬算術對峙名場面：「九九八十七！你有你的專屬答案，八十七！」',
    difficultyStars: 2,
    imitateStartSec: 8,
    imitateEndSec: 12.5,
    durationSeconds: 15.55,
    selectionVideoUrl: '/video/clips/family_select.mp4',
    videoPromptUrl: '/video/clips/family_full.mp4',
    muteVideoUrl: '/video/clips/family_imitate.mp4',
    posterUrl: '/video/clips/family_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(24, 0.82, 38, 95),
    referencePitchCurve: buildPitchCurve(24, 0.32, 0.88),
    charTimings: buildUniformTimings(Array.from(LINE_FAMILY), 8, 12.5),
    scriptCues: [
      { startSec: 0.3, endSec: 7.8, text: '（前導劇情）九九乘法表爭議現場對峙中…', speaker: 'left' },
      { startSec: 8, endSec: 12.5, text: LINE_FAMILY, speaker: 'center', isTarget: true },
    ],
  },
  {
    id: 'rookie-diary-malay',
    title: '新兵日記 // 童裝界的馬來貘',
    character: '班長訓話名場面',
    emotion: '嚴肅 / 反差 / 鏗鏘有力',
    tagId: 'tag-drama8',
    tagLabel: 'TAG.01 八點檔',
    tagFocus: 'Staccato · 斷奏頓挫',
    line: LINE_ROOKIE,
    hint: '從頭聽完班長訓話鋪陳後，一本正經地唸出「我看你是童裝界的馬來貘！」，越認真越好笑！',
    contextDesc: '嚴肅軍營裡突然冒出一本正經的「我看你是童裝界的馬來貘」爆笑吐槽。',
    difficultyStars: 2,
    imitateStartSec: 6,
    imitateEndSec: 8.5,
    durationSeconds: 12.89,
    selectionVideoUrl: '/video/clips/rookie_select.mp4',
    videoPromptUrl: '/video/clips/rookie_full.mp4',
    muteVideoUrl: '/video/clips/rookie_imitate.mp4',
    posterUrl: '/video/clips/rookie_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(24, 0.65, 38, 88),
    referencePitchCurve: buildPitchCurve(24, 0.28, 0.78),
    charTimings: buildUniformTimings(Array.from(LINE_ROOKIE), 6, 8.5),
    scriptCues: [
      { startSec: 0.3, endSec: 5.8, text: '（班長嚴肅訓話鋪陳中，準備接下一句…）', speaker: 'left' },
      { startSec: 6, endSec: 8.5, text: LINE_ROOKIE, speaker: 'center', isTarget: true },
    ],
  },

  // TAG.02: 影集・張力對白
  {
    id: 'distance-between-us',
    title: '我們與惡的距離 // 二十年質問',
    character: '李媽媽經典哭喊',
    emotion: '撕心裂肺 / 哭腔 / 情緒潰堤',
    tagId: 'tag-series',
    tagLabel: 'TAG.02 影集',
    tagFocus: 'F0 起伏 · 哭腔震顫',
    line: LINE_EVIL,
    hint: '先跟隨前段對話進入情緒，再帶著顫抖哭腔在「二十年」與「殺人犯！」釋放最高張力！',
    contextDesc: '台劇天花板催淚名場面，母親壓抑已久的崩潰哭喊直擊人心。',
    difficultyStars: 3,
    imitateStartSec: 12,
    imitateEndSec: 18,
    durationSeconds: 20.52,
    selectionVideoUrl: '/video/clips/evil_select.mp4',
    videoPromptUrl: '/video/clips/evil_full.mp4',
    muteVideoUrl: '/video/clips/evil_imitate.mp4',
    posterUrl: '/video/clips/evil_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(28, 0.78, 34, 96),
    referencePitchCurve: buildPitchCurve(28, 0.28, 0.9),
    charTimings: buildUniformTimings(Array.from(LINE_EVIL), 12, 18),
    scriptCues: [
      { startSec: 0.5, endSec: 11.7, text: '（前導對話情緒堆疊中…準備換李媽媽開口）', speaker: 'right' },
      { startSec: 12, endSec: 18, text: LINE_EVIL, speaker: 'center', isTarget: true },
    ],
  },

  // TAG.03: 電影・節奏反差
  {
    id: 'marry-my-dead-body-husband',
    title: '關於我和鬼 // 老公好棒',
    character: '毛毛 / 吳明翰',
    emotion: '誇張 / 撒嬌 / 延音拉長',
    tagId: 'tag-movie',
    tagLabel: 'TAG.03 電影',
    tagFocus: 'Duration 延音 · ΔF0 ↑',
    line: LINE_HUSBAND,
    hint: '開頭「哇～」與結尾「好棒～！」盡情把聲音拉長，看字幕跟著水平伸展！',
    contextDesc: '《關於我和鬼變成家人這件事》超經典反差撒嬌名台詞，一秒拉滿戲劇效果。',
    difficultyStars: 1,
    imitateStartSec: 4,
    imitateEndSec: 7,
    durationSeconds: 14.1,
    selectionVideoUrl: '/video/clips/husband_select.mp4',
    videoPromptUrl: '/video/clips/husband_full.mp4',
    muteVideoUrl: '/video/clips/husband_imitate.mp4',
    posterUrl: '/video/clips/husband_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(20, 0.62, 38, 90),
    referencePitchCurve: buildPitchCurve(20, 0.35, 0.92),
    charTimings: buildUniformTimings(Array.from(LINE_HUSBAND), 4, 7),
    scriptCues: [
      { startSec: 0.3, endSec: 3.8, text: '（前導畫面鋪陳中…準備喊出！）', speaker: 'left' },
      { startSec: 4, endSec: 7, text: LINE_HUSBAND, speaker: 'center', isTarget: true },
    ],
  },

  // TAG.04: 動畫・高頻爆發
  {
    id: 'grandma-sell-away',
    title: '魔法阿媽 // 把你阿嬤賣掉',
    character: '惡靈黑貓酷羅',
    emotion: '邪惡威脅 / 沙啞高頻爆發',
    tagId: 'tag-anime',
    tagLabel: 'TAG.04 動畫',
    tagFocus: 'ΔF0 ↑ · Jitter ↑',
    line: LINE_GRANDMA,
    hint: '壓出沙啞惡魔嗓音大喊「把你阿嬤賣掉！」，觸發極限字體放大與震顫！',
    contextDesc: '台灣動畫史最洗腦的童年陰影名台詞，短短幾秒考驗你的爆發力。',
    difficultyStars: 2,
    imitateStartSec: 3,
    imitateEndSec: 5.5,
    durationSeconds: 6.51,
    selectionVideoUrl: '/video/clips/grandma_select.mp4',
    videoPromptUrl: '/video/clips/grandma_full.mp4',
    muteVideoUrl: '/video/clips/grandma_imitate.mp4',
    posterUrl: '/video/clips/grandma_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(18, 0.65, 44, 96),
    referencePitchCurve: buildPitchCurve(18, 0.42, 0.94),
    charTimings: buildUniformTimings(Array.from(LINE_GRANDMA), 3, 5.5),
    scriptCues: [
      { startSec: 0.2, endSec: 2.8, text: '（黑貓酷羅蓄力登場…）', speaker: 'left' },
      { startSec: 3, endSec: 5.5, text: LINE_GRANDMA, speaker: 'center', isTarget: true },
    ],
  },

  // TAG.05: 迷因・魔性反差
  {
    id: 'ratatouille-mouse-meme',
    title: '料理鼠王 // 迷因：老鼠',
    character: '小林 (Linguini)',
    emotion: '心虛裝鎮定 / 頓點反差',
    tagId: 'tag-meme',
    tagLabel: 'TAG.05 迷因',
    tagFocus: 'Pause 停頓 · 低音收尾',
    line: LINE_MOUSE,
    hint: '兩段接力！先問小林有什麼興趣，等對方回話後，再接「噢！一般的，狗、貓、馬、天竺鼠……老鼠。」',
    contextDesc: '被問到喜歡什麼動物時心虛硬擠清單，最後一秒小聲冒出「……老鼠」的經典迷因。',
    difficultyStars: 2,
    imitateStartSec: 1,
    imitateEndSec: 14,
    relaySegments: [
      { startSec: 1, endSec: 6, line: '告訴我小林，你有什麼興趣？你喜歡動物嗎？' },
      { startSec: 9, endSec: 14, line: LINE_MOUSE },
    ],
    durationSeconds: 14.37,
    selectionVideoUrl: '/video/clips/mouse_select.mp4',
    videoPromptUrl: '/video/clips/mouse_full.mp4',
    muteVideoUrl: '/video/clips/mouse_imitate.mp4',
    posterUrl: '/video/clips/mouse_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: [88, 62, 55, 58, 60, 62, 66, 22, 18, 48, 42],
    referencePitchCurve: [0.85, 0.62, 0.55, 0.58, 0.6, 0.64, 0.68, 0.35, 0.3, 0.24, 0.22],
    charTimings: buildUniformTimings(Array.from(LINE_MOUSE), 9, 14),
    scriptCues: [
      { startSec: 1, endSec: 6, text: '告訴我小林，你有什麼興趣？你喜歡動物嗎？', speaker: 'left', isTarget: true },
      { startSec: 6, endSec: 9, text: '呵呵呵，什麼？動物？哪一種？', speaker: 'right' },
      { startSec: 9, endSec: 14, text: LINE_MOUSE, speaker: 'left', isTarget: true },
    ],
  },

  // TAG.06: 30 秒情緒起承轉合自由劇場 (回應韓老師建議)
  {
    id: 'emotion-theater-30s',
    title: '聲音劇場 // 30 秒情緒起承轉合',
    character: '自由聲音導演',
    emotion: '活潑 → 激動 → 停頓 → 冷靜',
    tagId: 'tag-theater',
    tagLabel: 'TAG.06 情緒劇場',
    tagFocus: '活潑大粗字 ↔ 冷靜小細字',
    line: LINE_THEATER,
    hint: '不綁定電影！30 秒內依序用「活潑高昂 → 驚訝質問 → 突然冷靜低語」唸出台詞，感受極限字體反差！',
    contextDesc: '30 秒起承轉合聲音演技挑戰：從輕快開朗瞬間轉折為低沉冷靜，看文字如何隨情緒劇烈變形。',
    difficultyStars: 3,
    imitateStartSec: 0,
    imitateEndSec: 30,
    durationSeconds: 30,
    isFreeTheater: true,
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: [78, 84, 72, 92, 95, 45, 25, 32, 28, 22],
    referencePitchCurve: [0.76, 0.82, 0.68, 0.88, 0.9, 0.5, 0.35, 0.28, 0.22, 0.2],
    charTimings: buildUniformTimings(Array.from(LINE_THEATER), 0, 30),
    scriptCues: [
      { startSec: 0, endSec: 7.5, text: '【起・活潑高昂】今天天氣真好！心情超棒！', speaker: 'center', isTarget: true },
      { startSec: 7.5, endSec: 16, text: '【承・突然驚訝】等一下、你剛才到底說了什麼？！', speaker: 'center', isTarget: true },
      { startSec: 16, endSec: 23, text: '【轉・壓抑停頓】……不要再說了。', speaker: 'center', isTarget: true },
      { startSec: 23, endSec: 30, text: '【合・冷靜低語】算了，一切都過去了。', speaker: 'center', isTarget: true },
    ],
  },
];
