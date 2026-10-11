import React, { useEffect, useRef } from 'react';
import type { AudioMetrics } from '../types/speak';

interface VoiceVisualizer3DProps {
  audioMetrics: AudioMetrics;
  themeColor?: string;
  accentColor?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

export const VoiceVisualizer3D: React.FC<VoiceVisualizer3DProps> = ({
  audioMetrics,
  themeColor = '#FF0055',
  accentColor = '#00F0FF',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef<AudioMetrics>(audioMetrics);
  metricsRef.current = audioMetrics;

  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 600);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // 初始化 120 顆自適應音波流體粒子
    const NUM_PARTICLES = 120;
    particlesRef.current = Array.from({ length: NUM_PARTICLES }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      radius: Math.random() * 2.5 + 1.2,
      alpha: Math.random() * 0.7 + 0.3,
      color: Math.random() > 0.5 ? themeColor : accentColor,
    }));

    const render = () => {
      animId = requestAnimationFrame(render);
      const metrics = metricsRef.current;
      const { smoothVolume, pitchNormalized, waveform } = metrics;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      phaseRef.current += 0.03 + (smoothVolume / 100) * 0.08;

      // 1. 開啟加算發光混合 (Additive Bloom: lighter 模式，超輕量 60fps)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 2. 中央液態音波能量球 (Liquid Audio Core)
      const baseRadius = Math.min(width, height) * 0.18;
      const expandRadius = baseRadius + (smoothVolume / 100) * (baseRadius * 0.9);

      const radialGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        expandRadius * 1.8
      );
      radialGrad.addColorStop(0, themeColor);
      radialGrad.addColorStop(0.45, accentColor);
      radialGrad.addColorStop(1, 'rgba(10, 10, 10, 0)');

      ctx.fillStyle = radialGrad;
      ctx.beginPath();

      // 有機液態扭曲輪廓 (模擬 MeshDistortMaterial)
      const POINTS = 36;
      for (let i = 0; i <= POINTS; i++) {
        const angle = (i / POINTS) * Math.PI * 2;
        const wave = Math.sin(angle * 5 + phaseRef.current) * (smoothVolume * 0.22);
        const pitchWobble = Math.cos(angle * 3 - phaseRef.current * 1.5) * (pitchNormalized * 18);
        const r = expandRadius + wave + pitchWobble;
        const px = centerX + Math.cos(angle) * r;
        const py = centerY + Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // 3. 示波器實時圓形音波環 (Oscilloscope Ripple Ring)
      if (waveform && waveform.length > 0) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2 + (smoothVolume / 100) * 2.5;
        ctx.beginPath();

        const step = Math.floor(waveform.length / 72);
        for (let i = 0; i < 72; i++) {
          const sample = waveform[i * step] || 0;
          const angle = (i / 72) * Math.PI * 2;
          const r = expandRadius * 1.25 + sample * (smoothVolume * 0.9 + 20);
          const px = centerX + Math.cos(angle) * r;
          const py = centerY + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // 4. 發光粒子群 (Sparkles 擴散雲)
      const particles = particlesRef.current;
      const speedMult = 1 + (smoothVolume / 100) * 3;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * speedMult;
        p.y += p.vy * speedMult;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (0.4 + (smoothVolume / 100) * 0.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 + (smoothVolume / 100) * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [themeColor, accentColor]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
