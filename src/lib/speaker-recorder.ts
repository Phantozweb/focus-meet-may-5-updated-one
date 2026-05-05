// Focus Meet — Speaker-Side Screen Recorder
// Records from speaker's screen share for highest quality
// Uploads to GitHub in clips with metadata + chapter markers

function getGitHubToken(): string {
  // 1. Try environment variable
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GITHUB_TOKEN) {
    return process.env.NEXT_PUBLIC_GITHUB_TOKEN;
  }
  // 2. Try runtime config
  if (typeof window !== 'undefined' && (window as any).__FOCUS_MEET_GITHUB_TOKEN__) {
    return (window as any).__FOCUS_MEET_GITHUB_TOKEN__;
  }
  // 3. Try localStorage
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('focusmeet_github_token');
    if (stored) return stored;
  }
  return '';
}
const GITHUB_OWNER = 'sriramben';
const GITHUB_REPO = 'focus-meet-recordings';
const CLIPS_FOLDER = 'speaker-recordings';
const CLIP_DURATION_MS = 30000;

export interface SpeakerRecordingState {
  isRecording: boolean;
  isScreenRecording: boolean;
  isWebcamRecording: boolean;
  clipCount: number;
  totalUploadedBytes: number;
  lastUploadTime: number | null;
  error: string | null;
  slideChanges: SlideChange[];
  currentSlideIndex: number;
  duration: number; // Recording duration in ms
}

export interface SlideChange {
  slideIndex: number;
  timestamp: number; // ms from recording start
  slideTitle?: string;
}

export class SpeakerRecorder {
  private screenStream: MediaStream | null = null;
  private webcamStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private canvasRecorder: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    videoEl: HTMLVideoElement;
    animId: number | null;
  } | null = null;
  private chunkBuffer: Blob[] = [];
  private clipTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private slideChanges: SlideChange[] = [];
  private currentSlideIndex = -1;
  private clipCount = 0;
  private totalUploadedBytes = 0;
  private lastUploadTime: number | null = null;
  private error: string | null = null;
  private isRecording = false;
  private roomId = '';
  private onStateChange: ((state: SpeakerRecordingState) => void) | null = null;
  private recordingStartTime = 0;

  setOnStateChange(cb: (state: SpeakerRecordingState) => void) {
    this.onStateChange = cb;
  }

  private notifyState() {
    if (!this.onStateChange) return;
    this.onStateChange({
      isRecording: this.isRecording,
      isScreenRecording: !!this.screenStream,
      isWebcamRecording: !!this.webcamStream,
      clipCount: this.clipCount,
      totalUploadedBytes: this.totalUploadedBytes,
      lastUploadTime: this.lastUploadTime,
      error: this.error,
      slideChanges: [...this.slideChanges],
      currentSlideIndex: this.currentSlideIndex,
      duration: this.isRecording ? Date.now() - this.recordingStartTime : 0,
    });
  }

  // Start recording screen share stream
  async startScreenRecording(stream: MediaStream, roomId: string): Promise<boolean> {
    try {
      this.screenStream = stream;
      this.roomId = roomId;
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.startTime = Date.now();
      this.error = null;
      this.clipCount = 0;
      this.totalUploadedBytes = 0;
      this.slideChanges = [];

      // Try MediaRecorder first (better quality)
      if (typeof MediaRecorder !== 'undefined') {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : MediaRecorder.isTypeSupported('video/webm')
              ? 'video/webm'
              : '';

        if (mimeType) {
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 2500000, // 2.5 Mbps for 720p quality
            audioBitsPerSecond: 128000, // 128 kbps audio
          });

          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunkBuffer.push(e.data);
          };

          this.mediaRecorder.start(1000); // Collect data every second
          this.startClipTimer();
          this.notifyState();
          return true;
        }
      }

      // Fallback: Canvas-based recording
      return this.startCanvasRecording(stream, roomId);
    } catch (err: any) {
      this.error = err.message;
      this.isRecording = false;
      this.notifyState();
      return false;
    }
  }

  // Also record webcam (picture-in-picture)
  async addWebcamRecording(stream: MediaStream): Promise<boolean> {
    this.webcamStream = stream;
    this.notifyState();
    return true;
  }

  // Canvas-based fallback recording with audio support
  private async startCanvasRecording(stream: MediaStream, roomId: string): Promise<boolean> {
    try {
      const videoEl = document.createElement('video');
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play();

      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;

      this.canvasRecorder = { canvas, ctx, videoEl, animId: null };

      // Capture canvas stream at 10fps
      const canvasStream = canvas.captureStream(10);

      // Add audio tracks from original stream
      const audioTracks = stream.getAudioTracks();
      for (const track of audioTracks) {
        canvasStream.addTrack(track);
      }

      // Use MediaRecorder on combined stream (video + audio)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      if (mimeType) {
        this.mediaRecorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: 1500000,
          audioBitsPerSecond: 128000,
        });
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.chunkBuffer.push(e.data);
        };
        this.mediaRecorder.start(1000);
      }

      // Render loop
      const fps = 10;
      const frameInterval = 1000 / fps;
      let lastFrameTime = 0;

      const captureLoop = (timestamp: number) => {
        if (!this.isRecording) return;
        if (timestamp - lastFrameTime >= frameInterval) {
          lastFrameTime = timestamp;
          try {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } catch {
            // Frame capture may fail when tab is backgrounded
          }
        }
        if (this.canvasRecorder) {
          this.canvasRecorder.animId = requestAnimationFrame(captureLoop);
        }
      };

      this.canvasRecorder.animId = requestAnimationFrame(captureLoop);
      this.startClipTimer();
      this.notifyState();
      return true;
    } catch (err: any) {
      this.error = err.message;
      this.isRecording = false;
      this.notifyState();
      return false;
    }
  }

  // Record a slide change (for chapter markers)
  recordSlideChange(slideIndex: number, slideTitle?: string) {
    if (!this.isRecording) return;
    this.currentSlideIndex = slideIndex;
    this.slideChanges.push({
      slideIndex,
      timestamp: Date.now() - this.startTime,
      slideTitle,
    });
    this.notifyState();
  }

  private startClipTimer() {
    this.clipTimer = setInterval(() => this.flushCurrentClip(), CLIP_DURATION_MS);
  }

  private async flushCurrentClip() {
    if (this.chunkBuffer.length === 0) return;
    const currentBuffer = [...this.chunkBuffer];
    this.chunkBuffer = [];

    try {
      await this.uploadClipToGitHub(currentBuffer, this.clipCount + 1);
      this.clipCount++;
      this.lastUploadTime = Date.now();
      this.error = null;
    } catch (err: any) {
      this.error = `Clip upload failed: ${err.message}`;
      this.chunkBuffer = [...currentBuffer, ...this.chunkBuffer];
    }
    this.notifyState();
  }

  private async uploadClipToGitHub(frames: Blob[], clipIndex: number) {
    const mimeType = this.mediaRecorder
      ? this.mediaRecorder.mimeType || 'video/webm'
      : 'image/jpeg';
    const clipBlob = new Blob(frames, { type: mimeType });

    const metadata = {
      clipIndex,
      roomId: this.roomId,
      frameCount: frames.length,
      timestamp: Date.now(),
      duration: Date.now() - this.startTime,
      slideChanges: this.slideChanges.filter(
        (sc) => sc.timestamp <= clipIndex * CLIP_DURATION_MS
      ),
      format: this.mediaRecorder ? 'webm' : 'jpeg-frames',
      hasScreenShare: !!this.screenStream,
      hasWebcam: !!this.webcamStream,
    };

    const clipBase64 = await this.blobToBase64(clipBlob);
    const metaBase64 = await this.blobToBase64(
      new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    );

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const clipPath = `${CLIPS_FOLDER}/${this.roomId}/clip-${String(clipIndex).padStart(4, '0')}-${ts}${this.mediaRecorder ? '.webm' : '.bin'}`;
    const metaPath = `${CLIPS_FOLDER}/${this.roomId}/clip-${String(clipIndex).padStart(4, '0')}-${ts}.json`;

    await Promise.all([
      this.githubUploadFile(
        clipPath,
        clipBase64,
        `Speaker recording clip ${clipIndex} - ${this.roomId}`
      ),
      this.githubUploadFile(
        metaPath,
        metaBase64,
        `Clip ${clipIndex} metadata - ${this.roomId}`
      ),
    ]);

    this.totalUploadedBytes += clipBlob.size;
  }

  private async githubUploadFile(
    path: string,
    base64Content: string,
    message: string
  ) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    let sha: string | null = null;
    try {
      const checkResp = await fetch(url, {
        headers: {
          Authorization: `token ${getGitHubToken()}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (checkResp.ok) {
        const data = await checkResp.json();
        sha = data.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    const body: Record<string, string> = {
      message,
      content: base64Content,
      branch: 'main',
    };
    if (sha) body.sha = sha;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${getGitHubToken()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async stopRecording() {
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.canvasRecorder?.animId) {
      cancelAnimationFrame(this.canvasRecorder.animId);
    }
    if (this.clipTimer) clearInterval(this.clipTimer);
    if (this.chunkBuffer.length > 0) {
      try {
        await this.flushCurrentClip();
      } catch {
        // Best effort flush
      }
    }

    // Upload final metadata with all slide changes
    try {
      const finalMeta = {
        roomId: this.roomId,
        totalClips: this.clipCount,
        totalDuration: Date.now() - this.startTime,
        slideChanges: this.slideChanges,
        uploadedAt: Date.now(),
      };
      const metaBase64 = await this.blobToBase64(
        new Blob([JSON.stringify(finalMeta, null, 2)], {
          type: 'application/json',
        })
      );
      await this.githubUploadFile(
        `${CLIPS_FOLDER}/${this.roomId}/session-metadata.json`,
        metaBase64,
        `Session metadata - ${this.roomId}`
      );
    } catch {
      // Best effort metadata upload
    }

    this.screenStream = null;
    this.webcamStream = null;
    this.mediaRecorder = null;
    this.canvasRecorder = null;
    this.notifyState();
  }

  getState(): SpeakerRecordingState {
    return {
      isRecording: this.isRecording,
      isScreenRecording: !!this.screenStream,
      isWebcamRecording: !!this.webcamStream,
      clipCount: this.clipCount,
      totalUploadedBytes: this.totalUploadedBytes,
      lastUploadTime: this.lastUploadTime,
      error: this.error,
      slideChanges: [...this.slideChanges],
      currentSlideIndex: this.currentSlideIndex,
      duration: this.isRecording ? Date.now() - this.recordingStartTime : 0,
    };
  }

  destroy() {
    this.stopRecording();
    this.onStateChange = null;
  }
}
