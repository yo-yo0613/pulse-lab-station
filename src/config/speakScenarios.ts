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
    description: '高能量情緒張力與戲劇化吼叫，驅動字體放大、加粗與強烈震盪。',
  },
  {
    id: 'tag-series',
    shortLabel: 'TAG.02',
    title: '影集・張力對白',
    focus: 'F0 抑揚頓挫 + Pause 停頓',
    description: '情緒層層堆疊與關鍵字句重音，精準捕捉語調起伏與字距呼吸感。',
  },
  {
    id: 'tag-movie',
    shortLabel: 'TAG.03',
    title: '電影・節奏反差',
    focus: 'Staccato + ΔF0 上揚',
    description: '鮮明咬字瞬態與戲劇化尾音延展，呈現電影對白的喜劇節奏感。',
  },
  {
    id: 'tag-anime',
    shortLabel: 'TAG.04',
    title: '動畫・高頻爆發',
    focus: 'ΔF0 ↑ · Jitter ↑',
    description: '經典台灣動畫高頻嘶吼與誇張語氣，測試音高極限與微抖動張力。',
  },
  // 待「迷因 / 老鼠-全聲音.mp4」補齊後即可取消註解開啟：
  // {
  //   id: 'tag-meme',
  //   shortLabel: 'TAG.05',
  //   title: '迷因・魔性洗腦',
  //   focus: 'Duration 延音 + 節奏衝擊',
  //   description: '短促洗腦又帶戲劇感的迷因金句，考驗節奏與模仿準度。',
  // },
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

export const PROMPT_SCENARIOS: PromptScenario[] = [
  // TAG.01: 八點檔・情緒爆發
  {
    id: 'family-reunion-9987',
    title: '一家團圓 // 經典情緒爆發',
    character: '八點檔主角',
    emotion: '激動 / 質問 / 爆發張力',
    tagId: 'tag-drama8',
    tagLabel: 'TAG.01 八點檔',
    tagFocus: 'ΔRMS ↑ · 字重爆發',
    line: '你現在到底想怎麼樣！',
    hint: '先看完整情境鋪陳，倒數後用八點檔十足的底氣與音量吼出氣勢！',
    contextDesc: '八點檔高潮對峙現場，積壓已久的情緒在這一刻全面爆發。',
    difficultyStars: 2,
    imitateStartSec: 7.98,
    imitateEndSec: 12.4,
    durationSeconds: 15.55,
    selectionVideoUrl: '/video/clips/family_select.mp4',
    videoPromptUrl: '/video/clips/family_full.mp4',
    muteVideoUrl: '/video/clips/family_imitate.mp4',
    posterUrl: '/video/clips/family_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(24, 0.72, 36, 94),
    referencePitchCurve: buildPitchCurve(24, 0.3, 0.86),
    charTimings: buildUniformTimings(Array.from('你現在到底想怎麼樣！'), 7.98, 12.4),
  },
  {
    id: 'rookie-diary-malay',
    title: '新兵日記 // 童裝界的馬來饃',
    character: '班長與新兵',
    emotion: '嚴肅 / 反差 / 鏗鏘有力',
    tagId: 'tag-drama8',
    tagLabel: 'TAG.01 八點檔',
    tagFocus: 'Staccato · 斷奏頓挫',
    line: '童裝界的馬來饃！',
    hint: '咬字要像軍中點名一樣乾脆俐落，把「馬來饃」三個字拉出戲劇反差！',
    contextDesc: '嚴肅軍營裡突然冒出荒謬又一本正經的「童裝界的馬來饃」名場面。',
    difficultyStars: 2,
    imitateStartSec: 5.67,
    imitateEndSec: 8.0,
    durationSeconds: 12.89,
    selectionVideoUrl: '/video/clips/rookie_select.mp4',
    videoPromptUrl: '/video/clips/rookie_full.mp4',
    muteVideoUrl: '/video/clips/rookie_imitate.mp4',
    posterUrl: '/video/clips/rookie_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(24, 0.55, 38, 88),
    referencePitchCurve: buildPitchCurve(24, 0.28, 0.78),
    charTimings: buildUniformTimings(Array.from('童裝界的馬來饃！'), 5.67, 8.0),
  },

  // TAG.02: 影集・張力對白
  {
    id: 'distance-between-us',
    title: '我們與惡的距離 // 靈魂質問',
    character: '劇中核心角色',
    emotion: '沉重 / 激昂 / 質問張力',
    tagId: 'tag-series',
    tagLabel: 'TAG.02 影集',
    tagFocus: 'F0 起伏 · 停頓張力',
    line: '你們到底想要我怎麼樣？',
    hint: '注意前半句壓抑與後半句情緒上衝的力道反差，讓字距隨語氣拉開！',
    contextDesc: '在壓抑與衝突的極限邊緣，一句句直擊人心的質問在對話中炸開。',
    difficultyStars: 3,
    imitateStartSec: 11.69,
    imitateEndSec: 17.98,
    durationSeconds: 20.52,
    selectionVideoUrl: '/video/clips/evil_select.mp4',
    videoPromptUrl: '/video/clips/evil_full.mp4',
    muteVideoUrl: '/video/clips/evil_imitate.mp4',
    posterUrl: '/video/clips/evil_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(28, 0.68, 30, 92),
    referencePitchCurve: buildPitchCurve(28, 0.22, 0.84),
    charTimings: buildUniformTimings(Array.from('你們到底想要我怎麼樣？'), 11.69, 17.98),
  },

  // TAG.03: 電影・節奏反差
  {
    id: 'marry-my-dead-body-husband',
    title: '關於我和鬼 // 老公好棒',
    character: '毛毛 / 吳明翰',
    emotion: '嬌羞 / 反差 / 延音上揚',
    tagId: 'tag-movie',
    tagLabel: 'TAG.03 電影',
    tagFocus: 'Duration 延音 · ΔF0 ↑',
    line: '老公好棒～！',
    hint: '尾音微微上揚並適度拉長，看字體在畫面中同步伸展！',
    contextDesc: '《關於我和鬼變成家人這件事》超經典反差名台詞，一秒進入戲劇狀態。',
    difficultyStars: 1,
    imitateStartSec: 3.82,
    imitateEndSec: 7.18,
    durationSeconds: 14.1,
    selectionVideoUrl: '/video/clips/husband_select.mp4',
    videoPromptUrl: '/video/clips/husband_full.mp4',
    muteVideoUrl: '/video/clips/husband_imitate.mp4',
    posterUrl: '/video/clips/husband_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(20, 0.6, 35, 86),
    referencePitchCurve: buildPitchCurve(20, 0.35, 0.9),
    charTimings: buildUniformTimings(Array.from('老公好棒～！'), 3.82, 7.18),
  },

  // TAG.04: 動畫・高頻爆發
  {
    id: 'grandma-sell-away',
    title: '魔法阿媽 // 把你阿嬤賣掉',
    character: '酷羅 / 豆豆',
    emotion: '威脅 / 尖銳 / 高頻爆發',
    tagId: 'tag-anime',
    tagLabel: 'TAG.04 動畫',
    tagFocus: 'ΔF0 ↑ · Jitter ↑',
    line: '把你阿嬤賣掉！',
    hint: '短短兩秒半一口氣喊出！提高音高與音量，觸發極限放大與抖動效果。',
    contextDesc: '台灣動畫史最洗腦的經典威脅台詞，短短幾秒考驗你的爆發力。',
    difficultyStars: 2,
    imitateStartSec: 2.5,
    imitateEndSec: 5.03,
    durationSeconds: 6.51,
    selectionVideoUrl: '/video/clips/grandma_select.mp4',
    videoPromptUrl: '/video/clips/grandma_full.mp4',
    muteVideoUrl: '/video/clips/grandma_imitate.mp4',
    posterUrl: '/video/clips/grandma_poster.jpg',
    themeColor: '#111111',
    accentColor: '#FFFFFF',
    referenceVolumeCurve: buildScenarioCurve(18, 0.62, 42, 95),
    referencePitchCurve: buildPitchCurve(18, 0.4, 0.92),
    charTimings: buildUniformTimings(Array.from('把你阿嬤賣掉！'), 2.5, 5.03),
  },

  // --------------------------------------------------------------------------
  // 預留片位（待美術組補齊三版本後解除註解並填入對應檔名與時間碼）：
  // 1. 迷因：老鼠（目前缺 老鼠-全聲音.mp4）
  // 2. 影集：俗女養成記（目前僅原片，待拆出全聲音/選片/模仿三版本）
  // --------------------------------------------------------------------------
];
