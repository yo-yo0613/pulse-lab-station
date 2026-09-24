import React, { useEffect, useState } from 'react';
import type { CameraDevice, ThemeConfig } from '../types/pulse';
import { poseDetector } from '../services/poseDetector';
import { playCountdownTick, playShutterSound, playSurgeBoom } from '../services/soundEngine';
import {
  Sliders,
  X,
  Volume2,
  Camera,
  Eye,
  Activity,
  Maximize,
  Minimize,
  Palette,
} from 'lucide-react';

interface DebugDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  onUpdateTheme: (newTheme: ThemeConfig) => void;
  showSkeleton: boolean;
  onToggleSkeleton: (val: boolean) => void;
  isCameraActive: boolean;
  onToggleCamera: (val: boolean) => void;
  onSelectCamera: (deviceId: string) => void;
  selectedCameraId?: string;
  isEmulationMode: boolean;
  onToggleEmulation: (val: boolean) => void;
}

export const DebugDrawer: React.FC<DebugDrawerProps> = ({
  isOpen,
  onClose,
  theme,
  onUpdateTheme,
  showSkeleton,
  onToggleSkeleton,
  isCameraActive,
  onToggleCamera,
  onSelectCamera,
  selectedCameraId,
  isEmulationMode,
  onToggleEmulation,
}) => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      poseDetector.getAvailableCameras().then(setCameras);
      setIsFullscreen(!!document.fullscreenElement);
    }
  }, [isOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm font-mono select-none">
      <div className="w-full max-w-md h-full bg-[#111111] border-l border-white/20 p-6 flex flex-col justify-between overflow-y-auto text-white">
        <div className="flex flex-col gap-6">
          {/* 標題與關閉按鈕 */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#00F0FF]" />
              <h3 className="font-bold text-lg tracking-wider">DESIGNER DEBUG PANEL</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded cursor-pointer text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 1. 粒子 3 段色彩挑選器 (Color Picker) */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-[#00F0FF] font-bold tracking-widest flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <span>PARTICLE GRADIENT PALETTE</span>
            </span>

            <div className="grid grid-cols-3 gap-3">
              {/* Base Color */}
              <div className="flex flex-col gap-1.5 p-2 bg-white/5 border border-white/10">
                <span className="text-[10px] text-white/50">BASE (0~40%)</span>
                <input
                  type="color"
                  value={theme.particles.baseColor}
                  onChange={(e) =>
                    onUpdateTheme({
                      ...theme,
                      particles: { ...theme.particles, baseColor: e.target.value },
                    })
                  }
                  className="w-full h-8 cursor-pointer bg-transparent border-0"
                />
                <span className="text-[10px] text-center text-white/70">
                  {theme.particles.baseColor}
                </span>
              </div>

              {/* Mid Color */}
              <div className="flex flex-col gap-1.5 p-2 bg-white/5 border border-white/10">
                <span className="text-[10px] text-white/50">MID (40~70%)</span>
                <input
                  type="color"
                  value={theme.particles.midColor}
                  onChange={(e) =>
                    onUpdateTheme({
                      ...theme,
                      particles: { ...theme.particles, midColor: e.target.value },
                    })
                  }
                  className="w-full h-8 cursor-pointer bg-transparent border-0"
                />
                <span className="text-[10px] text-center text-white/70">
                  {theme.particles.midColor}
                </span>
              </div>

              {/* Peak Color */}
              <div className="flex flex-col gap-1.5 p-2 bg-white/5 border border-white/10">
                <span className="text-[10px] text-white/50">PEAK (70~100%)</span>
                <input
                  type="color"
                  value={theme.particles.peakColor}
                  onChange={(e) =>
                    onUpdateTheme({
                      ...theme,
                      particles: { ...theme.particles, peakColor: e.target.value },
                    })
                  }
                  className="w-full h-8 cursor-pointer bg-transparent border-0"
                />
                <span className="text-[10px] text-center text-white/70">
                  {theme.particles.peakColor}
                </span>
              </div>
            </div>
          </div>

          {/* 2. 動能靈敏度與爆發閾值 Slider */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-[#00F0FF] font-bold tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <span>KINETIC SENSITIVITY & THRESHOLD</span>
            </span>

            <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">靈敏度倍率 (Sensitivity):</span>
                <span className="text-[#FFE600] font-bold">
                  {theme.gameplay.sensitivity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                value={theme.gameplay.sensitivity}
                onChange={(e) =>
                  onUpdateTheme({
                    ...theme,
                    gameplay: { ...theme.gameplay, sensitivity: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-[#00F0FF] cursor-pointer"
              />

              <div className="flex justify-between text-xs mt-2">
                <span className="text-white/70">爆發閾值 (Surge Threshold):</span>
                <span className="text-[#FF007A] font-bold">
                  {theme.gameplay.surgeThreshold}%
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="95"
                step="1"
                value={theme.gameplay.surgeThreshold}
                onChange={(e) =>
                  onUpdateTheme({
                    ...theme,
                    gameplay: { ...theme.gameplay, surgeThreshold: parseInt(e.target.value) },
                  })
                }
                className="w-full accent-[#FF007A] cursor-pointer"
              />
            </div>
          </div>

          {/* 3. 視訊鏡頭與骨架檢視 */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-[#00F0FF] font-bold tracking-widest flex items-center gap-2">
              <Camera className="w-4 h-4" />
              <span>HARDWARE & TRACKING</span>
            </span>

            {/* 攝影機選單 */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-white/50">視訊輸入裝置 (Video Device):</span>
              <select
                value={selectedCameraId || ''}
                onChange={(e) => onSelectCamera(e.target.value)}
                className="bg-black border border-white/20 p-2 text-white text-xs cursor-pointer focus:border-[#00F0FF] outline-none"
              >
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 攝影機視訊開關 */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 text-xs">
              <span className="flex items-center gap-2 text-white/80">
                <Camera className="w-4 h-4 text-[#00F0FF]" />
                <span>啟用鏡頭視訊 (Enable Video)</span>
              </span>
              <input
                type="checkbox"
                checked={isCameraActive}
                onChange={(e) => onToggleCamera(e.target.checked)}
                className="w-4 h-4 accent-[#00F0FF] cursor-pointer"
              />
            </div>

            {/* 骨架節點開關 */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 text-xs">
              <span className="flex items-center gap-2 text-white/80">
                <Eye className="w-4 h-4 text-[#00F0FF]" />
                <span>顯示骨架關節節點 (Landmarks)</span>
              </span>
              <input
                type="checkbox"
                checked={showSkeleton}
                onChange={(e) => onToggleSkeleton(e.target.checked)}
                className="w-4 h-4 accent-[#00F0FF] cursor-pointer"
              />
            </div>

            {/* 游標模擬模式切換 */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 text-xs">
              <span className="text-white/80">游標模擬模式 (Cursor Emulation)</span>
              <input
                type="checkbox"
                checked={isEmulationMode}
                onChange={(e) => onToggleEmulation(e.target.checked)}
                className="w-4 h-4 accent-[#FF007A] cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Web Audio 音效試聽 */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-[#00F0FF] font-bold tracking-widest flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              <span>SYNTHESIZER SOUND AUDITION</span>
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => playSurgeBoom(0)}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-xs font-bold text-center cursor-pointer border border-white/15"
              >
                💥 低音砲 (Boom)
              </button>
              <button
                onClick={() => playShutterSound()}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-xs font-bold text-center cursor-pointer border border-white/15"
              >
                📸 快門 (Shutter)
              </button>
              <button
                onClick={() => playCountdownTick(true)}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-xs font-bold text-center cursor-pointer border border-white/15"
              >
                🔔 倒數 (Tick)
              </button>
            </div>
          </div>
        </div>

        {/* 底部維護者工具：全螢幕切換 */}
        <div className="border-t border-white/10 pt-4 flex gap-3">
          <button
            onClick={toggleFullscreen}
            className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer border border-white/20"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'GO FULLSCREEN'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
