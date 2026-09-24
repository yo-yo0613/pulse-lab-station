/**
 * PULSE LAB - 原生 Web Audio API 合成音效引擎 (100% Zero-External File Dependency)
 * 具備：
 * 1. Master DynamicsCompressorNode 全域壓限器（杜絕數位破音與失真）
 * 2. 350ms 節流冷卻（防高頻揮舞振盪器堆疊）
 * 3. 節點 onended 自動斷開清理（防長時間運行記憶體洩漏）
 * 4. AudioContext 自癒重構與初次手勢解鎖
 * 5. 多頻段打擊層疊 (Sub-bass + Mid Punch) + navigator.vibrate 觸覺回饋
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let lastSurgeTime = 0;

function initAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 建立全域壓限器 (Compressor)
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, audioCtx.currentTime);
    compressor.knee.setValueAtTime(20, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    // 主音量增益
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.85, audioCtx.currentTime);

    // 鏈路串接：Nodes -> Compressor -> MasterGain -> Destination
    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

/**
 * 確保 AudioContext 解鎖與健康巡檢
 */
export async function unlockAndCheckAudioContext(): Promise<void> {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (_) {}
  } else if (ctx.state === 'closed') {
    // 異常關閉時自癒重建
    audioCtx = null;
    initAudioContext();
  }
}

/**
 * 播放極限動能爆發音效 (Kinetic Surge Boom)
 * 雙頻段打擊 (85Hz->32Hz Sub-bass + 260Hz->50Hz Mid Punch) + 觸覺震動
 */
export function playSurgeBoom(cooldownMs: number = 350): void {
  const nowMs = performance.now();
  if (nowMs - lastSurgeTime < cooldownMs) {
    return; // 冷卻節流中
  }
  lastSurgeTime = nowMs;

  const ctx = initAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const t = ctx.currentTime;

  // 1. 低頻低音砲 (Sub-bass Sine: 85Hz -> 32Hz)
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(85, t);
  subOsc.frequency.exponentialRampToValueAtTime(32, t + 0.38);

  subGain.gain.setValueAtTime(0.85, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

  subOsc.connect(subGain);
  if (compressor) subGain.connect(compressor);

  subOsc.start(t);
  subOsc.stop(t + 0.38);

  // 2. 中頻打擊瞬態 (Mid Punch Triangle: 260Hz -> 50Hz，在普通喇叭中穿透噪音)
  const punchOsc = ctx.createOscillator();
  const punchGain = ctx.createGain();
  punchOsc.type = 'triangle';
  punchOsc.frequency.setValueAtTime(260, t);
  punchOsc.frequency.exponentialRampToValueAtTime(50, t + 0.14);

  punchGain.gain.setValueAtTime(0.5, t);
  punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

  punchOsc.connect(punchGain);
  if (compressor) punchGain.connect(compressor);

  punchOsc.start(t);
  punchOsc.stop(t + 0.14);

  // 關鍵：發聲結束主動斷開，防止 AudioNode 洩漏
  subOsc.onended = () => {
    try {
      subOsc.disconnect();
      subGain.disconnect();
    } catch (_) {}
  };

  punchOsc.onended = () => {
    try {
      punchOsc.disconnect();
      punchGain.disconnect();
    } catch (_) {}
  };

  // 3. 原生觸覺微反饋 (若硬體/行動端支援)
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 20, 70]);
    }
  } catch (_) {}
}

/**
 * 播放相機快門音效 (Freeze Capture Shutter)
 * 模擬單眼機械反光鏡與快門簾幕聲
 */
export function playShutterSound(): void {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const t = ctx.currentTime;
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * 0.12);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = noiseBuffer.getChannelData(0);

  // 產生白噪音
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  // 建立噪音源與帶通濾波器
  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400, t);
  filter.Q.setValueAtTime(3.0, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

  whiteNoise.connect(filter);
  filter.connect(gain);
  if (compressor) gain.connect(compressor);

  whiteNoise.start(t);
  whiteNoise.stop(t + 0.12);

  // 伴隨快門清脆滴答 (Click)
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(2400, t + 0.05);
  clickGain.gain.setValueAtTime(0.3, t + 0.05);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

  clickOsc.connect(clickGain);
  if (compressor) clickGain.connect(compressor);

  clickOsc.start(t + 0.05);
  clickOsc.stop(t + 0.09);

  // 清理
  whiteNoise.onended = () => {
    try {
      whiteNoise.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch (_) {}
  };
  clickOsc.onended = () => {
    try {
      clickOsc.disconnect();
      clickGain.disconnect();
    } catch (_) {}
  };
}

/**
 * 播放倒數滴答聲 (Countdown Tick)
 * @param isFinal 是否為出發瞬態 (GO!)
 */
export function playCountdownTick(isFinal: boolean = false): void {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const freq = isFinal ? 1760 : 880;
  const duration = isFinal ? 0.35 : 0.12;

  osc.type = isFinal ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (isFinal) {
    osc.frequency.exponentialRampToValueAtTime(880, t + duration);
  }

  gain.gain.setValueAtTime(isFinal ? 0.8 : 0.45, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  if (compressor) gain.connect(compressor);

  osc.start(t);
  osc.stop(t + duration);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch (_) {}
  };
}

/**
 * 動態頻率調制蓄能音 (Charging Tone)
 */
export function playChargeTone(energyPercent: number): void {
  if (energyPercent < 25) return;
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const baseFreq = 220 + (energyPercent / 100) * 440;
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(baseFreq, t);

  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  if (compressor) gain.connect(compressor);

  osc.start(t);
  osc.stop(t + 0.08);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch (_) {}
  };
}
