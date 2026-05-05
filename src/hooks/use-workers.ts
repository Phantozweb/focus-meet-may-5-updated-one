'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { WorkerMessage, WorkerResponse } from '@/workers/signaling.worker';
import type { VideoWorkerMessage, VideoWorkerResponse } from '@/workers/video-processor.worker';
import type { SignalMessage } from '@/lib/types';

// ============ WORKER PROXY INTERFACE ============

export interface WorkerProxy {
  processSignalBatch: (messages: SignalMessage[]) => Promise<SignalMessage[]>;
  calculateBandwidth: (input: BandwidthCalcInput) => Promise<BandwidthCalcResult>;
  persistAttendance: (entries: AttendanceEntry[]) => Promise<{ success: boolean; count: number; serializedData: string }>;
  batchTreeUpdate: (nodes: Record<string, any>) => void;
  calculateRelayScores: (nodes: RelayNodeInput[]) => Promise<RelayScoreResult[]>;
  processVideoFrame: (frame: ImageBitmap, width: number, height: number, options?: VideoProcessOptions) => Promise<VideoProcessResult | null>;
  workerProxy: object;
}

export interface BandwidthCalcInput {
  currentRTT: number;
  previousRTT: number;
  rttAlpha: number;
  currentJitter: number;
  bytesSentDelta: number;
  bytesReceivedDelta: number;
  timeDeltaMs: number;
  packetsLost: number;
  packetsReceived: number;
  availableBitrate: number;
}

export interface BandwidthCalcResult {
  rttMs: number;
  jitterMs: number;
  estimatedDownKbps: number;
  estimatedUpKbps: number;
  packetLoss: number;
  availableBitrate: number;
}

export interface AttendanceEntry {
  peerId: string;
  displayName: string;
  joinedAt: number;
  lastSeenAt: number;
  leftAt: number | null;
}

export interface RelayNodeInput {
  peerId: string;
  rttMs: number;
  estimatedUpKbps: number;
  availableBitrate: number;
  currentRelayLoad: number;
  maxRelayCapacity: number;
  depth: number;
  deviceType: string;
  isClusterHead: boolean;
  relaySuccessCount: number;
  relayFailCount: number;
  connectedAt: number;
}

export interface RelayScoreResult {
  peerId: string;
  score: number;
}

export interface VideoProcessOptions {
  brightness?: number;
  contrast?: number;
}

export interface VideoProcessResult {
  frameId: string;
  imageBitmap: ImageBitmap | null;
  width: number;
  height: number;
  processingTimeMs: number;
  fallback?: boolean;
}

// ============ HOOK ============

export function useWorkers(): {
  processSignalBatch: (messages: SignalMessage[]) => Promise<SignalMessage[]>;
  calculateBandwidth: (input: BandwidthCalcInput) => Promise<BandwidthCalcResult>;
  persistAttendance: (entries: AttendanceEntry[]) => Promise<{ success: boolean; count: number; serializedData: string }>;
  batchTreeUpdate: (nodes: Record<string, any>) => void;
  calculateRelayScores: (nodes: RelayNodeInput[]) => Promise<RelayScoreResult[]>;
  processVideoFrame: (frame: ImageBitmap, width: number, height: number, options?: VideoProcessOptions) => Promise<VideoProcessResult | null>;
  workerProxy: object;
} {
  const signalingWorkerRef = useRef<Worker | null>(null);
  const videoWorkerRef = useRef<Worker | null>(null);
  const pendingCallbacksRef = useRef<Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>>(new Map());
  const callbackIdRef = useRef(0);
  const isReadyRef = useRef(false);

  // Initialize workers
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    try {
      signalingWorkerRef.current = new Worker(
        new URL('@/workers/signaling.worker.ts', import.meta.url)
      );

      videoWorkerRef.current = new Worker(
        new URL('@/workers/video-processor.worker.ts', import.meta.url)
      );

      // Signaling worker message handler
      signalingWorkerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { type, payload } = event.data;

        // Handle tree update results (no callback needed — fire and forget from batching)
        if (type === 'TREE_UPDATE_RESULT') {
          // Tree update results are handled by the engine directly
          return;
        }

        // Handle callback-based responses
        const callbackId = payload?._callbackId;
        if (callbackId) {
          const cb = pendingCallbacksRef.current.get(callbackId);
          if (cb) {
            pendingCallbacksRef.current.delete(callbackId);
            cb.resolve(payload);
          }
        }
      };

      signalingWorkerRef.current.onerror = (error) => {
        console.error('[useWorkers] Signaling worker error:', error);
      };

      // Video worker message handler
      videoWorkerRef.current.onmessage = (event: MessageEvent<VideoWorkerResponse>) => {
        const { payload } = event.data;

        const callbackId = payload?._callbackId;
        if (callbackId) {
          const cb = pendingCallbacksRef.current.get(callbackId);
          if (cb) {
            pendingCallbacksRef.current.delete(callbackId);
            cb.resolve(payload);
          }
        }
      };

      videoWorkerRef.current.onerror = (error) => {
        console.error('[useWorkers] Video worker error:', error);
      };

      isReadyRef.current = true;
    } catch (error) {
      console.warn('[useWorkers] Failed to initialize workers, falling back to main thread:', error);
      isReadyRef.current = false;
    }

    return () => {
      signalingWorkerRef.current?.terminate();
      videoWorkerRef.current?.terminate();
      signalingWorkerRef.current = null;
      videoWorkerRef.current = null;
      isReadyRef.current = false;
      pendingCallbacksRef.current.clear();
    };
  }, []);

  // Helper: send message to signaling worker with callback
  const sendToSignalingWorker = useCallback(<T>(message: WorkerMessage): Promise<T> => {
    return new Promise((resolve, reject) => {
      const worker = signalingWorkerRef.current;
      if (!worker) {
        reject(new Error('Signaling worker not available'));
        return;
      }

      const callbackId = String(++callbackIdRef.current);
      const enrichedMessage = {
        ...message,
        payload: { ...message.payload, _callbackId: callbackId },
      };

      pendingCallbacksRef.current.set(callbackId, { resolve, reject });

      // Timeout after 10s
      setTimeout(() => {
        if (pendingCallbacksRef.current.has(callbackId)) {
          pendingCallbacksRef.current.delete(callbackId);
          reject(new Error('Worker timeout'));
        }
      }, 10000);

      worker.postMessage(enrichedMessage);
    });
  }, []);

  // Helper: send message to video worker with callback
  const sendToVideoWorker = useCallback(<T>(message: VideoWorkerMessage, transfer?: Transferable[]): Promise<T> => {
    return new Promise((resolve, reject) => {
      const worker = videoWorkerRef.current;
      if (!worker) {
        reject(new Error('Video worker not available'));
        return;
      }

      const callbackId = String(++callbackIdRef.current);
      const enrichedMessage = {
        ...message,
        payload: { ...message.payload, _callbackId: callbackId },
      };

      pendingCallbacksRef.current.set(callbackId, { resolve, reject });

      setTimeout(() => {
        if (pendingCallbacksRef.current.has(callbackId)) {
          pendingCallbacksRef.current.delete(callbackId);
          reject(new Error('Worker timeout'));
        }
      }, 10000);

      if (transfer) {
        worker.postMessage(enrichedMessage, transfer);
      } else {
        worker.postMessage(enrichedMessage);
      }
    });
  }, []);

  // ============ PUBLIC API ============

  const processSignalBatch = useCallback(async (messages: SignalMessage[]): Promise<SignalMessage[]> => {
    const worker = signalingWorkerRef.current;
    if (!worker) return messages; // Fallback: return as-is

    try {
      const result = await sendToSignalingWorker<{ messages: SignalMessage[] }>({
        type: 'PROCESS_SIGNAL_BATCH',
        payload: { messages },
      });
      return result.messages || messages;
    } catch {
      return messages; // Fallback on error
    }
  }, [sendToSignalingWorker]);

  const calculateBandwidth = useCallback(async (input: BandwidthCalcInput): Promise<BandwidthCalcResult> => {
    const worker = signalingWorkerRef.current;
    if (!worker) {
      // Fallback: simple calculation on main thread
      return {
        rttMs: input.currentRTT,
        jitterMs: input.currentJitter,
        estimatedDownKbps: Math.round((input.bytesReceivedDelta * 8) / (Math.max(input.timeDeltaMs, 1) / 1000 * 1000)),
        estimatedUpKbps: Math.round((input.bytesSentDelta * 8) / (Math.max(input.timeDeltaMs, 1) / 1000 * 1000)),
        packetLoss: input.packetsReceived > 0 ? input.packetsLost / (input.packetsLost + input.packetsReceived) : 0,
        availableBitrate: input.availableBitrate,
      };
    }

    try {
      const result = await sendToSignalingWorker<BandwidthCalcResult>({
        type: 'CALCULATE_BANDWIDTH',
        payload: input,
      });
      return result;
    } catch {
      return {
        rttMs: input.currentRTT,
        jitterMs: input.currentJitter,
        estimatedDownKbps: 0,
        estimatedUpKbps: 0,
        packetLoss: 0,
        availableBitrate: input.availableBitrate,
      };
    }
  }, [sendToSignalingWorker]);

  const persistAttendance = useCallback(async (entries: AttendanceEntry[]): Promise<{ success: boolean; count: number; serializedData: string }> => {
    const worker = signalingWorkerRef.current;
    if (!worker) {
      // Fallback: persist directly
      try {
        const serializedData = JSON.stringify({ version: 1, savedAt: Date.now(), entries });
        return { success: true, count: entries.length, serializedData };
      } catch {
        return { success: false, count: 0, serializedData: '' };
      }
    }

    try {
      const result = await sendToSignalingWorker<{ success: boolean; count: number; serializedData: string }>({
        type: 'PERSIST_ATTENDANCE',
        payload: { entries },
      });
      return result;
    } catch {
      return { success: false, count: 0, serializedData: '' };
    }
  }, [sendToSignalingWorker]);

  const batchTreeUpdate = useCallback((nodes: Record<string, any>): void => {
    const worker = signalingWorkerRef.current;
    if (!worker) return;

    worker.postMessage({
      type: 'BATCH_TREE_UPDATE',
      payload: { nodes, timestamp: Date.now() },
    } as WorkerMessage);
  }, []);

  const calculateRelayScores = useCallback(async (nodes: RelayNodeInput[]): Promise<RelayScoreResult[]> => {
    const worker = signalingWorkerRef.current;
    if (!worker) return []; // Fallback: no scores

    try {
      const result = await sendToSignalingWorker<{ scores: RelayScoreResult[] }>({
        type: 'CALCULATE_RELAY_SCORES',
        payload: { nodes },
      });
      return result.scores || [];
    } catch {
      return [];
    }
  }, [sendToSignalingWorker]);

  const processVideoFrame = useCallback(async (
    frame: ImageBitmap,
    width: number,
    height: number,
    options?: VideoProcessOptions
  ): Promise<VideoProcessResult | null> => {
    const worker = videoWorkerRef.current;
    if (!worker) return null;

    try {
      const result = await sendToVideoWorker<VideoProcessResult>({
        type: 'PROCESS_FRAME',
        payload: {
          frame,
          width,
          height,
          brightness: options?.brightness ?? 0,
          contrast: options?.contrast ?? 1.0,
          frameId: `frame-${Date.now()}`,
        },
      }, [frame]);
      return result;
    } catch {
      return null;
    }
  }, [sendToVideoWorker]);

  // Worker proxy object for the engine
  const workerProxy = useMemo(() => ({
    processSignalBatch,
    calculateBandwidth,
    persistAttendance,
    batchTreeUpdate,
    calculateRelayScores,
  }), [processSignalBatch, calculateBandwidth, persistAttendance, batchTreeUpdate, calculateRelayScores]);

  return {
    processSignalBatch,
    calculateBandwidth,
    persistAttendance,
    batchTreeUpdate,
    calculateRelayScores,
    processVideoFrame,
    workerProxy,
  };
}
