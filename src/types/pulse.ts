/**
 * PULSE LAB - TypeScript Type Definitions
 */

export type FsmState = 'IDLE' | 'COUNTDOWN' | 'ACTIVE' | 'FREEZE_CAPTURE' | 'RESULT_POSTER';

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type PoseLandmarks = LandmarkPoint[];

export interface KineticStats {
  smoothVelocity: number;
  kineticIndex: number; // 0 ~ 100%
  pulseScore: number;
  isSurge: boolean;
  surgeCount: number;
  peakVelocity: number;
  isEmulated: boolean;
}

export interface ThemeConfig {
  branding: {
    mainTitle: string;
    subTitle: string;
    tagline: string;
    logoPath: string;
    watermark: string;
  };
  gameplay: {
    sessionDurationSeconds: number; // default: 30
    countdownSeconds: number;       // default: 3
    surgeThreshold: number;          // 0~100 (default: 72)
    sensitivity: number;             // multiplier (default: 1.3)
    inactivityResetSeconds: number;  // auto-reset watchdog (default: 25)
  };
  particles: {
    baseColor: string; // low kinetic (e.g. '#00F0FF')
    midColor: string;  // mid kinetic (e.g. '#FF007A')
    peakColor: string; // surge burst (e.g. '#FFE600')
    maxParticles: number; // default: 800
    particleSize: number; // base size (default: 2.8)
  };
  poster: {
    accentColor: string;
    frameOpacity: number;
    showWatermark?: boolean;
    qrMode: 'share_url' | 'offline_text' | 'custom_url';
    customUrl?: string;
  };
  sound: {
    mode: 'synth' | 'custom';
    masterVolume: number;
    surgeCooldownMs: number; // default: 350ms
  };
}

export interface PosterExportData {
  snapshotBlobUrl: string;
  pulseScore: number;
  rank: string;
  verificationCode: string;
  timestamp: string;
  peakKinetic: number;
  surgeCount: number;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}
