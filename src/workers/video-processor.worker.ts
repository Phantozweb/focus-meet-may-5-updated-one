// Focus Meet — Video Processor Worker
// Offloads video frame processing from the main thread.
// Uses OffscreenCanvas when available for GPU-accelerated processing.
//
// Uses self.onmessage pattern for web worker compatibility.

// ============ TYPES ============

export type VideoWorkerMessageType = 'PROCESS_FRAME' | 'COMPUTE_QUALITY_METRICS' | 'INIT_CANVAS';
export type VideoWorkerResponseType = 'FRAME_PROCESSED' | 'QUALITY_METRICS_RESULT' | 'CANVAS_INITIALIZED' | 'FRAME_ERROR';

export interface VideoWorkerMessage {
  type: VideoWorkerMessageType;
  payload: any;
}

export interface VideoWorkerResponse {
  type: VideoWorkerResponseType;
  payload: any;
}

interface ProcessFramePayload {
  frame: ImageBitmap;
  width: number;
  height: number;
  brightness: number;    // -1 to 1, 0 = no change
  contrast: number;      // 0.5 to 2.0, 1.0 = no change
  frameId: string;
}

interface ProcessFrameResult {
  frameId: string;
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
  processingTimeMs: number;
}

interface QualityMetricsPayload {
  frame: ImageBitmap;
  width: number;
  height: number;
  referenceData: Uint8ClampedArray | null;  // Previous frame data for PSNR
  frameId: string;
}

interface QualityMetricsResult {
  frameId: string;
  blurScore: number;          // 0-1, lower = more blurry
  estimatedPSNR: number;      // dB, higher = better quality
  averageBrightness: number;  // 0-255
  contrastRatio: number;      // 0-1
  processingTimeMs: number;
}

// ============ STATE ============

let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
let hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

// ============ HELPERS ============

function postResult(response: VideoWorkerResponse): void {
  self.postMessage(response);
}

// ============ CANVAS INITIALIZATION ============

function initCanvas(width: number, height: number): void {
  if (hasOffscreenCanvas) {
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d');
  }
}

// ============ FRAME PROCESSING ============

function processFrame(payload: ProcessFramePayload): void {
  const startTime = performance.now();
  const { frame, width, height, brightness, contrast, frameId } = payload;

  try {
    // Ensure canvas is initialized
    if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      initCanvas(width, height);
    }

    if (offscreenCtx && offscreenCanvas) {
      // GPU-accelerated path using OffscreenCanvas
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;

      // Draw the input frame
      offscreenCtx.drawImage(frame, 0, 0, width, height);

      // Apply brightness/contrast normalization
      if (brightness !== 0 || contrast !== 1.0) {
        const imageData = offscreenCtx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Brightness adjustment: add offset
        const brightnessOffset = brightness * 255;

        // Contrast adjustment: scale around midpoint
        const contrastFactor = contrast;

        for (let i = 0; i < data.length; i += 4) {
          // Apply contrast then brightness
          data[i] = clamp((data[i] - 128) * contrastFactor + 128 + brightnessOffset);     // R
          data[i + 1] = clamp((data[i + 1] - 128) * contrastFactor + 128 + brightnessOffset); // G
          data[i + 2] = clamp((data[i + 2] - 128) * contrastFactor + 128 + brightnessOffset); // B
          // Alpha unchanged
        }

        offscreenCtx.putImageData(imageData, 0, 0);
      }

      // Create new ImageBitmap from processed canvas
      const bitmapPromise = offscreenCanvas.transferToImageBitmap();
      const processingTimeMs = performance.now() - startTime;

      // Close the input frame to free memory
      frame.close();

      postResult({
        type: 'FRAME_PROCESSED',
        payload: {
          frameId,
          imageBitmap: bitmapPromise,
          width,
          height,
          processingTimeMs,
        } as ProcessFrameResult,
      });
    } else {
      // Fallback: no OffscreenCanvas — return frame as-is with minimal processing
      const processingTimeMs = performance.now() - startTime;
      frame.close();

      postResult({
        type: 'FRAME_PROCESSED',
        payload: {
          frameId,
          imageBitmap: null,
          width,
          height,
          processingTimeMs,
          fallback: true,
        },
      });
    }
  } catch (error: any) {
    frame.close();
    postResult({
      type: 'FRAME_ERROR',
      payload: {
        frameId,
        error: error.message || 'Frame processing failed',
      },
    });
  }
}

// ============ QUALITY METRICS ============

function computeQualityMetrics(payload: QualityMetricsPayload): void {
  const startTime = performance.now();
  const { frame, width, height, referenceData, frameId } = payload;

  try {
    // We need a canvas to read pixel data
    if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      initCanvas(width, height);
    }

    let imageData: Uint8ClampedArray | null = null;

    if (offscreenCtx && offscreenCanvas) {
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
      offscreenCtx.drawImage(frame, 0, 0, width, height);
      imageData = offscreenCtx.getImageData(0, 0, width, height).data;
    }

    if (!imageData) {
      frame.close();
      postResult({
        type: 'QUALITY_METRICS_RESULT',
        payload: {
          frameId,
          blurScore: 0.5,
          estimatedPSNR: 30,
          averageBrightness: 128,
          contrastRatio: 0.5,
          processingTimeMs: performance.now() - startTime,
          fallback: true,
        } as QualityMetricsResult,
      });
      return;
    }

    // 1. Blur detection using Laplacian variance
    const blurScore = computeBlurScore(imageData, width, height);

    // 2. PSNR estimation (if reference frame available)
    let estimatedPSNR = 40; // default good quality
    if (referenceData && referenceData.length === imageData.length) {
      estimatedPSNR = computePSNR(imageData, referenceData);
    }

    // 3. Average brightness
    const averageBrightness = computeAverageBrightness(imageData);

    // 4. Contrast ratio
    const contrastRatio = computeContrastRatio(imageData);

    const processingTimeMs = performance.now() - startTime;

    frame.close();

    postResult({
      type: 'QUALITY_METRICS_RESULT',
      payload: {
        frameId,
        blurScore,
        estimatedPSNR,
        averageBrightness,
        contrastRatio,
        processingTimeMs,
      } as QualityMetricsResult,
    });
  } catch (error: any) {
    frame.close();
    postResult({
      type: 'QUALITY_METRICS_RESULT',
      payload: {
        frameId,
        blurScore: 0.5,
        estimatedPSNR: 30,
        averageBrightness: 128,
        contrastRatio: 0.5,
        processingTimeMs: performance.now() - startTime,
        error: error.message,
      },
    });
  }
}

// ============ METRIC HELPERS ============

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function computeBlurScore(data: Uint8ClampedArray, width: number, height: number): number {
  // Laplacian variance — higher variance = sharper image
  // We sample a grid for performance (every 4th pixel)
  const step = 4;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = (y * width + x) * 4;
      // Convert to grayscale
      const center = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const top = data[((y - 1) * width + x) * 4] * 0.299 + data[((y - 1) * width + x) * 4 + 1] * 0.587 + data[((y - 1) * width + x) * 4 + 2] * 0.114;
      const bottom = data[((y + 1) * width + x) * 4] * 0.299 + data[((y + 1) * width + x) * 4 + 1] * 0.587 + data[((y + 1) * width + x) * 4 + 2] * 0.114;
      const left = data[(y * width + (x - 1)) * 4] * 0.299 + data[(y * width + (x - 1)) * 4 + 1] * 0.587 + data[(y * width + (x - 1)) * 4 + 2] * 0.114;
      const right = data[(y * width + (x + 1)) * 4] * 0.299 + data[(y * width + (x + 1)) * 4 + 1] * 0.587 + data[(y * width + (x + 1)) * 4 + 2] * 0.114;

      // Laplacian
      const laplacian = top + bottom + left + right - 4 * center;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0.5;

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  // Normalize variance to 0-1 range (empirical: variance > 500 = sharp, < 50 = blurry)
  return Math.min(1, Math.max(0, Math.sqrt(variance) / 500));
}

function computePSNR(current: Uint8ClampedArray, reference: Uint8ClampedArray): number {
  let mse = 0;
  const pixelCount = current.length / 4;
  const step = 4; // Sample for performance

  for (let i = 0; i < current.length; i += step * 4) {
    const dr = current[i] - reference[i];
    const dg = current[i + 1] - reference[i + 1];
    const db = current[i + 2] - reference[i + 2];
    mse += (dr * dr + dg * dg + db * db) / 3;
  }

  mse /= (pixelCount / step);

  if (mse === 0) return 100; // Identical frames

  // PSNR = 10 * log10(MAX^2 / MSE), MAX = 255
  return 10 * Math.log10((255 * 255) / mse);
}

function computeAverageBrightness(data: Uint8ClampedArray): number {
  let total = 0;
  const pixelCount = data.length / 4;
  const step = 4; // Sample for performance

  for (let i = 0; i < data.length; i += step * 4) {
    total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  return total / (pixelCount / step);
}

function computeContrastRatio(data: Uint8ClampedArray): number {
  let minLum = 255;
  let maxLum = 0;
  const step = 4;

  for (let i = 0; i < data.length; i += step * 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // Normalize to 0-1 where 1 = maximum contrast
  if (maxLum + minLum === 0) return 0;
  return (maxLum - minLum) / (maxLum + minLum);
}

// ============ MAIN MESSAGE HANDLER ============

self.onmessage = (event: MessageEvent<VideoWorkerMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'INIT_CANVAS': {
      const { width, height } = payload;
      initCanvas(width, height);
      postResult({
        type: 'CANVAS_INITIALIZED',
        payload: {
          width,
          height,
          hasOffscreenCanvas,
        },
      });
      break;
    }

    case 'PROCESS_FRAME': {
      processFrame(payload as ProcessFramePayload);
      break;
    }

    case 'COMPUTE_QUALITY_METRICS': {
      computeQualityMetrics(payload as QualityMetricsPayload);
      break;
    }

    default: {
      console.warn('[VideoProcessorWorker] Unknown message type:', type);
    }
  }
};

// Signal that the worker is ready
postResult({
  type: 'CANVAS_INITIALIZED',
  payload: { ready: true, hasOffscreenCanvas },
});
