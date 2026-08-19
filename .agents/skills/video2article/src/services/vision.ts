import sharp from 'sharp';
import type { KeyframeMetadata } from '../types';

/**
 * 计算图片的简易 8x8 感知灰度 Hash（aHash）
 */
async function calculateSimpleHash(imagePath: string): Promise<string> {
  try {
    const { data } = await sharp(imagePath)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;

    let hash = '';
    for (let i = 0; i < data.length; i++) {
      hash += data[i] >= avg ? '1' : '0';
    }
    return hash;
  } catch {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }
}

/**
 * 计算两个 64 位二进制 Hash 的汉明距离
 */
function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * 对导出的关键帧按图像相似度进行去重过滤
 * @param keyframes 原始关键帧列表
 * @param threshold 汉明距离阈值 (小于该值视为重复帧，默认 8)
 */
export async function filterDeduplicateKeyframes(
  keyframes: KeyframeMetadata[],
  threshold: number = 8
): Promise<KeyframeMetadata[]> {
  if (keyframes.length <= 1) return keyframes;

  const result: KeyframeMetadata[] = [];
  let lastAcceptedHash = '';

  for (const kf of keyframes) {
    const hash = await calculateSimpleHash(kf.filepath);
    kf.hash = hash;

    if (!lastAcceptedHash) {
      result.push(kf);
      lastAcceptedHash = hash;
      continue;
    }

    const dist = hammingDistance(hash, lastAcceptedHash);
    // 只有当画面变化足够显著（汉明距离大于阈值）时才保留
    if (dist >= threshold) {
      result.push(kf);
      lastAcceptedHash = hash;
    }
  }

  return result;
}
