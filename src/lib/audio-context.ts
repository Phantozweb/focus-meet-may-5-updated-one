// Shared AudioContext manager — prevents the 6-context Chrome limit and iOS autoplay issues

let sharedAudioContext: AudioContext | null = null;
let analyserNodes: Map<string, AnalyserNode> = new Map();
let resumed = false;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioContext();
    } catch {
      return null;
    }
  }

  return sharedAudioContext;
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
      resumed = true;
    } catch {}
  }
}

export function isAudioContextResumed(): boolean {
  return resumed || (sharedAudioContext?.state === 'running') || false;
}

export function getOrCreateAnalyser(peerId: string, stream: MediaStream): AnalyserNode | null {
  if (analyserNodes.has(peerId)) {
    return analyserNodes.get(peerId)!;
  }

  const ctx = getSharedAudioContext();
  if (!ctx) return null;

  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    // DO NOT connect to destination — we don't want to play the audio through the analyser
    analyserNodes.set(peerId, analyser);
    return analyser;
  } catch {
    return null;
  }
}

export function cleanupAnalyser(peerId: string): void {
  analyserNodes.delete(peerId);
}

export function cleanupAllAnalysers(): void {
  analyserNodes.clear();
}
