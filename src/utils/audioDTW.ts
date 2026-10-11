/**
 * 一維動態時間規整 (Dynamic Time Warping, DTW) 語調比對引擎
 * 容許時間軸局部彈性拉伸/壓縮，科學客觀比對語氣波形形態
 */

export interface DTWComparisonResult {
  overallScore: number;     // 0 ~ 100 綜合相似度
  volumeScore: number;      // 音量波形相似度 (0 ~ 100)
  pitchScore: number;       // 音調走勢相似度 (0 ~ 100)
  rank: 'SSS' | 'SS' | 'S' | 'A';
  rankTitle: string;
  comment: string;
  alignedPathLength: number;
}

/**
 * 簡易一維序列降採樣 / 內插至目標長度
 */
function resampleArray(source: Float32Array | number[], targetLen: number): number[] {
  if (source.length === 0) return new Array(targetLen).fill(0);
  if (source.length === targetLen) return Array.from(source);

  const result: number[] = new Array(targetLen);
  const factor = (source.length - 1) / (targetLen - 1);

  for (let i = 0; i < targetLen; i++) {
    const srcIdx = i * factor;
    const lower = Math.floor(srcIdx);
    const upper = Math.min(source.length - 1, Math.ceil(srcIdx));
    const weight = srcIdx - lower;
    result[i] = source[lower] * (1 - weight) + source[upper] * weight;
  }
  return result;
}

/**
 * 計算兩組一維數值序列的 DTW 累積距離
 */
function computeDTWDistance(seqA: number[], seqB: number[]): number {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return 100;

  // 建立動態規劃矩陣
  const dtw: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(Infinity)
  );
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seqA[i - 1] - seqB[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],     // 插入
        dtw[i][j - 1],     // 刪除
        dtw[i - 1][j - 1]  // 匹配
      );
    }
  }

  // 平均歸一化單步距離
  return dtw[n][m] / (n + m);
}

/**
 * 比較錄製波形與示範標準波形
 * 傳入切片後的有效資料（嚴禁包含末尾未填滿的 0）
 */
export function compareVoiceDTW(
  userVolume: Float32Array | number[],
  userPitch: Float32Array | number[],
  refVolumeCurve: number[],
  refPitchCurve: number[]
): DTWComparisonResult {
  // 1. 將兩組序列統一樣本長度至 64 點進行特徵比較
  const SAMPLE_POINTS = 64;
  const userVolNorm = resampleArray(userVolume, SAMPLE_POINTS);
  const userPitchNorm = resampleArray(userPitch, SAMPLE_POINTS);
  const refVolNorm = resampleArray(refVolumeCurve, SAMPLE_POINTS);
  const refPitchNorm = resampleArray(refPitchCurve, SAMPLE_POINTS);

  // 2. 計算音量與音高 DTW 距離
  const volDist = computeDTWDistance(userVolNorm, refVolNorm); // 0 ~ 100
  const pitchDist = computeDTWDistance(
    userPitchNorm.map((p) => p * 100),
    refPitchNorm.map((p) => p * 100)
  );

  // 3. 映射至 0 ~ 100 分數 (距離越小，分數越高)
  // 一般人正常模仿容差在 15~25 之間
  const volumeScore = Math.max(0, Math.min(100, Math.round(100 - volDist * 1.5)));
  const pitchScore = Math.max(0, Math.min(100, Math.round(100 - pitchDist * 1.6)));

  // 4. 綜合權重：音量起伏 60% + 音調曲線 40%
  const overallScore = Math.round(volumeScore * 0.6 + pitchScore * 0.4);

  // 5. 評級與客製化展覽評語
  let rank: 'SSS' | 'SS' | 'S' | 'A' = 'A';
  let rankTitle = '能量突變者';
  let comment = '爆發力十足！聲音極具辨識度與個人風格。';

  if (overallScore >= 92) {
    rank = 'SSS';
    rankTitle = '聲動大師 (KINETIC MASTER)';
    comment = '神級還原！音量張力與情緒起伏與原聲高度共振！';
  } else if (overallScore >= 82) {
    rank = 'SS';
    rankTitle = '靈魂共鳴者 (SOUL ECHO)';
    comment = '情緒張力極佳，關鍵爆發音與咬字節奏拿捏精準！';
  } else if (overallScore >= 70) {
    rank = 'S';
    rankTitle = '聲學實力派 (PULSE VOCALIST)';
    comment = '語調起伏自然生動，文字形變呈現出鮮明力量！';
  }

  return {
    overallScore,
    volumeScore,
    pitchScore,
    rank,
    rankTitle,
    comment,
    alignedPathLength: SAMPLE_POINTS,
  };
}
