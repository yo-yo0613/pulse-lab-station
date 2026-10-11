import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SpeakState, ScoreResult, PromptScenario } from '../types/speak';
import { PROMPT_SCENARIOS } from '../config/speakScenarios';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import { KineticTypography } from './KineticTypography';
import { VoiceVisualizer3D } from './VoiceVisualizer3D';
import { DynamicMediaOverlay } from './DynamicMediaOverlay';
import { PromptVideoView } from './PromptVideoView';
import { ScoreAnalysisView } from './ScoreAnalysisView';
import { SpeakExportModal } from './SpeakExportModal';
import { compareVoiceDTW } from '../utils/audioDTW';
import { Mic, Sparkles, Square, ArrowRight } from 'lucide-react';

interface SeeHowYouSpeakAppProps {
  onSwitchMode?: () => void;
}

export const SeeHowYouSpeakApp: React.FC<SeeHowYouSpeakAppProps> = ({ onSwitchMode }) => {
  const [speakState, setSpeakState] = useState<SpeakState>('LANDING');
  const [selectedScenario, setSelectedScenario] = useState<PromptScenario>(PROMPT_SCENARIOS[0]);
  const [remainingTime, setRemainingTime] = useState<number>(5.0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [userRecordedVolume, setUserRecordedVolume] = useState<Float32Array>(new Float32Array(0));

  // 音訊分析器 hook
  const {
    audioMetrics,
    isListening,
    noiseFloor,
    getValidRecordings,
    startRecording,
    stopRecording,
    unlockAudio,
  } = useAudioAnalyzer();

  const timerIntervalRef = useRef<number | null>(null);
  const recordStartTimeRef = useRef<number>(0);

  // 1. 展演環境鎖定滾動
  useEffect(() => {
    document.body.classList.add('kiosk-locked');
    return () => {
      document.body.classList.remove('kiosk-locked');
    };
  }, []);

  // 2. 結算演算法：錄音結束時由 DTW 比對
  const finishRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    stopRecording();

    // 取得截斷後的有效錄音長度
    const { volume, pitch } = getValidRecordings();
    setUserRecordedVolume(volume);

    // 一維 DTW 比對
    const dtwResult = compareVoiceDTW(
      volume,
      pitch,
      selectedScenario.referenceVolumeCurve,
      selectedScenario.referencePitchCurve
    );

    const nowStr = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

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

    setScoreResult(res);
    setSpeakState('SCORE_ANALYSIS');
  }, [stopRecording, getValidRecordings, selectedScenario]);

  // 3. 啟動模仿錄音倒數計時 (5.0 秒)
  const handleStartRecording = useCallback(async () => {
    await unlockAudio();
    startRecording();

    setRemainingTime(selectedScenario.durationSeconds);
    setSpeakState('RECORDING');
    recordStartTimeRef.current = performance.now();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - recordStartTimeRef.current) / 1000;
      const left = Math.max(0, selectedScenario.durationSeconds - elapsed);
      setRemainingTime(parseFloat(left.toFixed(1)));

      if (left <= 0) {
        finishRecording();
      }
    }, 50);
  }, [unlockAudio, startRecording, selectedScenario.durationSeconds, finishRecording]);

  // 清除計時器
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // 重置回到待機首頁
  const handleRestart = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    stopRecording();
    setScoreResult(null);
    setUserRecordedVolume(new Float32Array(0));
    setRemainingTime(selectedScenario.durationSeconds);
    setSpeakState('LANDING');
  }, [stopRecording, selectedScenario.durationSeconds]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080808] text-white font-mono select-none">
      {/* 頂部全域狀態 HUD 列 */}
      <header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* 左側 LOGO & 模式指示 */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-black text-sm tracking-tighter"
            style={{ backgroundColor: selectedScenario.accentColor }}
          >
            SPK
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tracking-wider uppercase">
                SEE HOW YOU SPEAK
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/15">
                v2.0 MVP
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tracking-widest">
              聲音動態字體 沉浸式互動裝置
            </p>
          </div>
        </div>

        {/* 中間情緒場景標籤 */}
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

        {/* 右側切換與麥克風狀態 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 border border-white/10 text-[11px] font-mono">
            <Mic
              className={`w-3.5 h-3.5 ${
                isListening ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'
              }`}
            />
            <span className="text-zinc-300">
              {isListening ? '音訊監聽中' : 'MIC 待命'}
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

      {/* 狀態 1：LANDING (引導主視覺畫面) */}
      {speakState === 'LANDING' && (
        <div className="relative w-full h-full flex flex-col items-center justify-center px-6 z-20">
          {/* 背景微光光暈 */}
          <div
            className="absolute w-[500px] h-[500px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700"
            style={{ backgroundColor: selectedScenario.themeColor }}
          />

          <div className="max-w-2xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/5 text-xs text-zinc-300 tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              林妤安《See How You Speak》Top 1 原創概念互動原型
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight">
              把你的聲音
              <br />
              <span
                className="text-transparent bg-clip-text"
                style={{
                  backgroundImage: `linear-gradient(135deg, #FFFFFF, ${selectedScenario.accentColor})`,
                }}
              >
                變成看得見的動態字
              </span>
            </h1>

            <p className="text-sm md:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
              傳統字幕只呈現「說了什麼」，而在這裡，文字將隨你的音量、音高、聲嘶力竭而即時扭曲、膨脹與共振。
            </p>

            {/* 4 步驟流程導引 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 text-left">
              {[
                { step: '01', title: '選取原片', desc: '觀察台詞情緒與聲調' },
                { step: '02', title: '對麥模仿', desc: '傾注聲能跟隨起伏' },
                { step: '03', title: '字體共振', desc: '60fps 零掉幀物理變形' },
                { step: '04', title: '導出憑證', desc: 'DTW 評級與海報掃碼' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-3 rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm"
                >
                  <span
                    className="text-xs font-black font-mono block"
                    style={{ color: selectedScenario.accentColor }}
                  >
                    {item.step}
                  </span>
                  <p className="text-xs font-bold text-white mt-1">{item.title}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* 啟動按鈕 */}
            <div className="pt-6">
              <button
                onClick={() => setSpeakState('PROMPT_VIDEO')}
                className="group px-8 py-4 rounded-xl font-black text-sm tracking-widest uppercase transition-all duration-300 cursor-pointer shadow-2xl flex items-center gap-3 mx-auto active:scale-95 hover:brightness-110"
                style={{
                  backgroundColor: selectedScenario.accentColor,
                  color: '#000000',
                  boxShadow: `0 0 35px ${selectedScenario.themeColor}55`,
                }}
              >
                <span>進入情緒場景選擇</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 狀態 2：PROMPT_VIDEO (情境影片與原聲示範) */}
      {speakState === 'PROMPT_VIDEO' && (
        <PromptVideoView
          scenario={selectedScenario}
          scenarios={PROMPT_SCENARIOS}
          onSelectScenario={setSelectedScenario}
          onReadyToRecord={handleStartRecording}
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

          {/* 錄音頂部狀態 HUD */}
          <div className="relative z-30 flex items-center justify-between pt-16 px-4">
            <div className="flex items-center gap-3 bg-black/60 border border-white/15 px-4 py-2 rounded-full backdrop-blur-md">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs font-mono font-bold text-rose-400">REC 正在錄音模仿中</span>
              <span className="text-xs font-mono text-zinc-400">|</span>
              <span className="text-xs font-mono text-white">倒數 {remainingTime.toFixed(1)} 秒</span>
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
              ✦ 用你的情緒與聲調 大聲喊出這句話 ✦
            </p>
          </div>

          {/* 底部控制器 */}
          <div className="relative z-30 flex items-center justify-center pb-8">
            <button
              onClick={finishRecording}
              className="px-6 py-3 rounded-full bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500 text-rose-400 hover:text-white font-mono text-xs font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              提早完成並計算相似度
            </button>
          </div>
        </div>
      )}

      {/* 狀態 4：SCORE_ANALYSIS (DTW 結算分析) */}
      {speakState === 'SCORE_ANALYSIS' && scoreResult && (
        <ScoreAnalysisView
          scoreResult={scoreResult}
          scenario={selectedScenario}
          onProceedToExport={() => setSpeakState('EXPORT_CARD')}
          onTryAgain={handleStartRecording}
        />
      )}

      {/* 狀態 5：EXPORT_CARD (1080x1920 海報生成與掃碼) */}
      {speakState === 'EXPORT_CARD' && scoreResult && (
        <SpeakExportModal
          scoreResult={scoreResult}
          scenario={selectedScenario}
          userVolumeSlice={userRecordedVolume}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
};
