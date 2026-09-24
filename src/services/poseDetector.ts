import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { CameraDevice, PoseLandmarks } from '../types/pulse';

/**
 * PULSE LAB - 展演級 MediaPipe Pose 檢測器與硬體守護神
 */

const STORAGE_CAMERA_KEY = 'pulse_preferred_camera_id';

interface LockedSubject {
  centerX: number;
  torsoArea: number;
  lockedAt: number;
}

export class PoseDetectorService {
  private landmarker: PoseLandmarker | null = null;
  private isInitialized = false;
  private isEmulated = false;
  private isDetecting = false;

  // 視訊串流心跳守門狗
  private lastVideoCheckTime = 0;
  private lastVideoCurrentTime = -1;
  private isRunning = false;

  // 鎖定主體黏著度
  private currentLock: LockedSubject | null = null;

  // 昏暗光影滯後緩衝
  private lastValidLandmarks: PoseLandmarks | null = null;
  private lastSeenTimestamp = 0;
  private readonly DROPOUT_TOLERANCE_MS = 800;

  // 游標模擬座標
  private mousePos = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  private prevMouse = { x: 0.5, y: 0.5 };

  constructor() {
    this.setupCursorTracking();
  }

  private setupCursorTracking() {
    if (typeof window === 'undefined') return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0, clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      const normX = Math.max(0, Math.min(1, clientX / window.innerWidth));
      const normY = Math.max(0, Math.min(1, clientY / window.innerHeight));

      this.mousePos.vx = normX - this.prevMouse.x;
      this.mousePos.vy = normY - this.prevMouse.y;
      this.mousePos.x = normX;
      this.mousePos.y = normY;
      this.prevMouse.x = normX;
      this.prevMouse.y = normY;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);
  }

  /**
   * 初始化檢測器 (3秒超時雙重載入備援)
   */
  public async init(): Promise<{ success: boolean; isEmulated: boolean }> {
    if (this.isInitialized) {
      return { success: true, isEmulated: this.isEmulated };
    }

    const loadLocalModelPromise = async () => {
      const vision = await FilesetResolver.forVisionTasks('/models/wasm');

      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      return landmarker;
    };

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn('[PULSE LAB] MediaPipe local model init timed out (>3.5s). Engaging Emulation Mode.');
        resolve(null);
      }, 3500);
    });

    try {
      const result = await Promise.race([loadLocalModelPromise(), timeoutPromise]);
      if (result) {
        this.landmarker = result;
        this.isInitialized = true;
        this.isEmulated = false;
        console.info('[PULSE LAB] MediaPipe Tasks-Vision Local Model Initialized Successfully.');
        return { success: true, isEmulated: false };
      } else {
        this.isInitialized = true;
        this.isEmulated = true;
        return { success: true, isEmulated: true };
      }
    } catch (err) {
      console.warn('[PULSE LAB] MediaPipe init error, falling back to Emulation Mode:', err);
      this.isInitialized = true;
      this.isEmulated = true;
      return { success: true, isEmulated: true };
    }
  }

  /**
   * 取得可用鏡頭設備列表
   */
  public async getAvailableCameras(): Promise<CameraDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
    } catch (e) {
      console.warn('[PULSE LAB] enumerateDevices failed:', e);
      return [];
    }
  }

  public getSavedCameraDeviceId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_CAMERA_KEY);
  }

  public saveCameraDeviceId(id: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_CAMERA_KEY, id);
  }

  /**
   * 啟動攝影機視訊串流
   */
  public async startCameraStream(
    videoElement: HTMLVideoElement,
    preferredDeviceId?: string
  ): Promise<boolean> {
    const targetDeviceId = preferredDeviceId || this.getSavedCameraDeviceId();

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.muted = true;
      videoElement.defaultMuted = true;
      videoElement.setAttribute('muted', '');
      videoElement.setAttribute('playsinline', '');
      videoElement.srcObject = stream;

      try {
        await videoElement.play();
      } catch (_) {
        videoElement.onloadedmetadata = () => {
          videoElement.play().catch(() => {});
        };
      }

      this.isRunning = true;
      this.lastVideoCheckTime = performance.now();
      this.lastVideoCurrentTime = videoElement.currentTime;

      if (targetDeviceId) {
        this.saveCameraDeviceId(targetDeviceId);
      }
      return true;
    } catch (err) {
      console.warn('[PULSE LAB] Primary camera failed, trying generic constraints:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        videoElement.muted = true;
        videoElement.defaultMuted = true;
        videoElement.setAttribute('muted', '');
        videoElement.setAttribute('playsinline', '');
        videoElement.srcObject = fallbackStream;
        videoElement.play().catch(() => {});
        this.isRunning = true;
        return true;
      } catch (err2) {
        console.warn('[PULSE LAB] No camera available:', err2);
        return false;
      }
    }
  }

  public cleanTearDownStream(videoElement: HTMLVideoElement | null, onCooldownComplete: () => void): void {
    this.isRunning = false;
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch (_) {}
      });
      videoElement.srcObject = null;
    }
    setTimeout(onCooldownComplete, 300);
  }

  public checkVideoHeartbeat(videoElement: HTMLVideoElement, onFrozen: () => void): void {
    if (!this.isRunning || this.isEmulated || videoElement.readyState < 2) return;
    const now = performance.now();
    if (now - this.lastVideoCheckTime > 3000) {
      if (videoElement.currentTime > 0 && Math.abs(videoElement.currentTime - this.lastVideoCurrentTime) < 0.001) {
        console.warn('[PULSE LAB] Video stream frozen detected! Auto-triggering restart...');
        onFrozen();
      }
      this.lastVideoCurrentTime = videoElement.currentTime;
      this.lastVideoCheckTime = now;
    }
  }

  public detectPose(videoElement: HTMLVideoElement, timestamp: number): {
    landmarks: PoseLandmarks | null;
    isEmulated: boolean;
  } {
    if (this.isEmulated || !this.landmarker) {
      return {
        landmarks: this.generateEmulatedLandmarks(this.mousePos.x, this.mousePos.y),
        isEmulated: true,
      };
    }

    if (this.isDetecting || videoElement.readyState < 2) {
      return {
        landmarks: this.getSmoothedLandmarks(null, timestamp),
        isEmulated: false,
      };
    }

    this.isDetecting = true;
    let detectedLandmarks: PoseLandmarks | null = null;

    try {
      const result = this.landmarker.detectForVideo(videoElement, timestamp);
      if (result && result.landmarks && result.landmarks.length > 0) {
        detectedLandmarks = this.filterAndLockPrimarySubject(result.landmarks, timestamp);
      }
    } catch (e) {
      console.warn('[PULSE LAB] Detection error in frame:', e);
    } finally {
      this.isDetecting = false;
    }

    const smoothed = this.getSmoothedLandmarks(detectedLandmarks, timestamp);
    return {
      landmarks: smoothed,
      isEmulated: false,
    };
  }

  private filterAndLockPrimarySubject(landmarksList: PoseLandmarks[], now: number): PoseLandmarks | null {
    const candidates: Array<{ centerX: number; torsoArea: number; landmarks: PoseLandmarks }> = [];

    for (const landmarks of landmarksList) {
      const lShoulder = landmarks[11], rShoulder = landmarks[12];
      const lHip = landmarks[23], rHip = landmarks[24];

      if (!lShoulder || !rShoulder || !lHip || !rHip) continue;

      const centerX = (lShoulder.x + rShoulder.x + lHip.x + rHip.x) / 4;
      // 擴大中央 ROI 感測範圍至 10% ~ 90%
      if (centerX < 0.10 || centerX > 0.90) continue;

      const width = Math.abs(rShoulder.x - lShoulder.x);
      const height = Math.abs((lHip.y + rHip.y) / 2 - (lShoulder.y + rShoulder.y) / 2);
      const torsoArea = Math.max(0.01, width * height);

      candidates.push({ centerX, torsoArea, landmarks });
    }

    if (candidates.length === 0) {
      // 若中央無主體，取任意最大的骨架
      if (landmarksList.length > 0) {
        return landmarksList[0];
      }
      return null;
    }

    if (!this.currentLock) {
      const primary = candidates.reduce((p, c) => (c.torsoArea > p.torsoArea ? c : p), candidates[0]);
      this.currentLock = { centerX: primary.centerX, torsoArea: primary.torsoArea, lockedAt: now };
      return primary.landmarks;
    }

    let bestMatch = candidates[0];
    let minDistance = 999;
    for (const c of candidates) {
      const dist = Math.abs(c.centerX - this.currentLock.centerX);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = c;
      }
    }

    const biggest = candidates.reduce((p, c) => (c.torsoArea > p.torsoArea ? c : p), candidates[0]);
    if (
      biggest !== bestMatch &&
      biggest.torsoArea > bestMatch.torsoArea * 1.35 &&
      now - this.currentLock.lockedAt > 1500
    ) {
      this.currentLock = { centerX: biggest.centerX, torsoArea: biggest.torsoArea, lockedAt: now };
      return biggest.landmarks;
    }

    this.currentLock.centerX = bestMatch.centerX;
    this.currentLock.torsoArea = bestMatch.torsoArea;
    return bestMatch.landmarks;
  }

  private getSmoothedLandmarks(detected: PoseLandmarks | null, now: number): PoseLandmarks | null {
    if (detected && detected[11] && (detected[11].visibility ?? 1) > 0.3) {
      this.lastValidLandmarks = detected;
      this.lastSeenTimestamp = now;
      return detected;
    }

    if (this.lastValidLandmarks && now - this.lastSeenTimestamp < this.DROPOUT_TOLERANCE_MS) {
      return this.lastValidLandmarks;
    }

    return null;
  }

  private generateEmulatedLandmarks(mx: number, my: number): PoseLandmarks {
    const dummy: PoseLandmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.9 }));

    dummy[0] = { x: mx, y: Math.max(0.1, my - 0.25), visibility: 0.95 };
    dummy[11] = { x: mx - 0.12, y: my - 0.12, visibility: 0.95 };
    dummy[12] = { x: mx + 0.12, y: my - 0.12, visibility: 0.95 };
    dummy[23] = { x: mx - 0.08, y: my + 0.2, visibility: 0.95 };
    dummy[24] = { x: mx + 0.08, y: my + 0.2, visibility: 0.95 };

    dummy[15] = { x: mx - 0.05, y: my, visibility: 0.99 };
    dummy[16] = { x: mx + 0.05, y: my, visibility: 0.99 };

    dummy[27] = { x: mx - 0.1, y: Math.min(0.95, my + 0.45), visibility: 0.95 };
    dummy[28] = { x: mx + 0.1, y: Math.min(0.95, my + 0.45), visibility: 0.95 };

    return dummy;
  }

  public setEmulationMode(emulate: boolean): void {
    this.isEmulated = emulate;
  }

  public isEmulationActive(): boolean {
    return this.isEmulated;
  }
}

export const poseDetector = new PoseDetectorService();
