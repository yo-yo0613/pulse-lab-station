/**
 * Cloudinary 雲端相片即時同步服務
 * 讓 30 秒快閃拍下的現場照片能秒級上傳雲端，供手機端 QR Code 掃描即時檢視與下載
 */

export interface CloudinaryConfig {
  enabled: boolean;
  cloudName: string;
  uploadPreset: string;
}

export async function uploadToCloudinary(
  blobOrUrl: Blob | string,
  config: CloudinaryConfig
): Promise<string | null> {
  if (!config.enabled || !config.cloudName || !config.uploadPreset) {
    return null;
  }

  try {
    const formData = new FormData();

    if (typeof blobOrUrl === 'string' && blobOrUrl.startsWith('data:')) {
      formData.append('file', blobOrUrl);
    } else {
      let blob: Blob;
      if (typeof blobOrUrl === 'string') {
        const res = await fetch(blobOrUrl);
        blob = await res.blob();
      } else {
        blob = blobOrUrl;
      }
      formData.append('file', blob, 'peak_moment.png');
    }

    formData.append('upload_preset', config.uploadPreset);

    // 建立 6 秒超時控制器，避免弱網環境卡死海報流程
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[Cloudinary] Upload failed with status:', response.status);
      return null;
    }

    const data = await response.json();
    return data.secure_url || null;
  } catch (error) {
    console.warn('[Cloudinary] Upload error (falling back to offline badge):', error);
    return null;
  }
}
