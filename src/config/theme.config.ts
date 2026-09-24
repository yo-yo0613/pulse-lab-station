import type { ThemeConfig } from '../types/pulse';

/**
 * PULSE LAB - 視覺與參數設定中心 (Theming & Asset Decoupling Center)
 * 供視覺設計師、3D 美術與現場音效夥伴零程式門檻調整全站參數與素材參照路徑。
 */
export const defaultThemeConfig: ThemeConfig = {
  branding: {
    mainTitle: 'PULSE LAB',
    subTitle: '30秒動能快閃互動體驗站',
    tagline: 'RELEASE YOUR KINETIC ENERGY',
    logoPath: '/assets/brand/logo.svg',
    watermark: 'PULSE LAB // TOKYO POP-UP EXHIBITION 2026',
  },
  gameplay: {
    sessionDurationSeconds: 30, // 體驗時長 (預設 30 秒)
    countdownSeconds: 3,        // 預備倒數 (預設 3 秒)
    surgeThreshold: 70,         // 動能爆發觸發閾值 (0~100)
    sensitivity: 1.35,          // 動作位移靈敏度倍率
    inactivityResetSeconds: 25, // 海報頁面無人操作自動回到 IDLE 倒數
  },
  particles: {
    baseColor: '#00F0FF',       // 低動能：電光冷藍
    midColor: '#FF007A',        // 中動能：賽博洋紅
    peakColor: '#FFE600',       // 爆發態：極限金黃
    maxParticles: 800,          // 常駐與噴發粒子池上限
    particleSize: 3.0,          // 基礎粒子半徑
  },
  poster: {
    accentColor: '#00F0FF',
    frameOpacity: 0.85,
    showWatermark: true,
    qrMode: 'share_url',        // 'share_url' (手機掃碼打開 Vercel 成果展示網頁) | 'offline_text' (純文字) | 'custom_url'
    customUrl: 'http://192.168.1.100:5173/gallery',
  },
  cloudinary: {
    enabled: true,
    cloudName: 'dt1ridsu5',
    uploadPreset: 'sister_preset',
  },
  sound: {
    mode: 'synth',              // 'synth' (原生 Web Audio API 合成) | 'custom' (讀取外置音檔)
    masterVolume: 0.85,
    surgeCooldownMs: 350,       // 爆發音效節流防抖冷卻時間 (毫秒)
  },
};
