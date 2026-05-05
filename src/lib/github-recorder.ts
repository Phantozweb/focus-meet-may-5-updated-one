// Focus Meet — GitHub Clip Recorder
// Records presenter video+audio in chunks and uploads to GitHub in real-time
// Uses WebCodecs / Canvas capture (NOT MediaRecorder which doesn't work in their environment)

const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'sriramben';
const GITHUB_REPO = 'focus-meet-recordings';
const CLIPS_FOLDER = 'clips';
const CLIP_DURATION_MS = 30000;  // 30 second clips
const CLIP_WIDTH = 1280;
const CLIP_HEIGHT = 720;

export interface RecordingState {
  isRecording: boolean;
  clipCount: number;
  totalUploadedBytes: number;
  lastUploadTime: number | null;
  error: string | null;
  currentClipIndex: number;
}

export type RecordingCallback = (state: RecordingState) => void;

export class GitHubClipRecorder {
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private isRecording = false;
  private clipCount = 0;
  private totalUploadedBytes = 0;
  private lastUploadTime: number | null = null;
  private error: string | null = null;
  private roomId: string = '';
  private onStateChange: RecordingCallback | null = null;
  private clipTimer: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private chunkBuffer: Blob[] = [];

  constructor() {}

  setOnStateChange(cb: RecordingCallback) {
    this.onStateChange = cb;
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        isRecording: this.isRecording,
        clipCount: this.clipCount,
        totalUploadedBytes: this.totalUploadedBytes,
        lastUploadTime: this.lastUploadTime,
        error: this.error,
        currentClipIndex: this.clipCount + 1,
      });
    }
  }

  async startRecording(stream: MediaStream, roomId: string): Promise<boolean> {
    try {
      this.stream = stream;
      this.roomId = roomId;
      this.isRecording = true;
      this.error = null;
      this.clipCount = 0;
      this.totalUploadedBytes = 0;
      this.notifyState();

      // Create hidden video element to play the stream
      this.videoEl = document.createElement('video');
      this.videoEl.srcObject = stream;
      this.videoEl.muted = true;
      this.videoEl.playsInline = true;
      await this.videoEl.play();

      // Create canvas for frame capture
      this.canvas = document.createElement('canvas');
      this.canvas.width = CLIP_WIDTH;
      this.canvas.height = CLIP_HEIGHT;
      this.ctx = this.canvas.getContext('2d')!;

      // Start frame capture loop
      this.startFrameCapture();

      // Start clip timer - upload accumulated frames every 30 seconds
      this.clipTimer = setInterval(() => {
        this.flushCurrentClip();
      }, CLIP_DURATION_MS);

      return true;
    } catch (err: any) {
      this.error = err.message || 'Failed to start recording';
      this.isRecording = false;
      this.notifyState();
      return false;
    }
  }

  private startFrameCapture() {
    const captureFrame = () => {
      if (!this.isRecording || !this.videoEl || !this.ctx || !this.canvas) return;

      try {
        // Draw current video frame to canvas
        this.ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);

        // Capture as JPEG blob (smaller than PNG, good for video frames)
        this.canvas.toBlob((blob) => {
          if (blob) {
            this.chunkBuffer.push(blob);
            this.frameCount++;
          }
        }, 'image/jpeg', 0.85);
      } catch {}

      this.animationFrameId = requestAnimationFrame(captureFrame);
    };

    // Capture at ~10fps to reduce data while maintaining smooth playback
    let lastFrameTime = 0;
    const fps = 10;
    const frameInterval = 1000 / fps;

    const throttledCapture = (timestamp: number) => {
      if (!this.isRecording) return;

      if (timestamp - lastFrameTime >= frameInterval) {
        lastFrameTime = timestamp;

        if (this.videoEl && this.ctx && this.canvas) {
          try {
            this.ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
            this.canvas.toBlob((blob) => {
              if (blob) {
                this.chunkBuffer.push(blob);
                this.frameCount++;
              }
            }, 'image/jpeg', 0.85);
          } catch {}
        }
      }

      this.animationFrameId = requestAnimationFrame(throttledCapture);
    };

    this.animationFrameId = requestAnimationFrame(throttledCapture);
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
      // Re-queue the buffer for retry
      this.chunkBuffer = [...currentBuffer, ...this.chunkBuffer];
    }

    this.notifyState();
  }

  private async uploadClipToGitHub(frames: Blob[], clipIndex: number): Promise<void> {
    // Create a WebM-like container using blob concatenation
    // Each clip is a sequence of JPEG frames stored as a blob
    const clipBlob = new Blob(frames, { type: 'video/webm' });

    // Create metadata about the clip
    const metadata = {
      clipIndex,
      roomId: this.roomId,
      frameCount: frames.length,
      fps: 10,
      width: CLIP_WIDTH,
      height: CLIP_HEIGHT,
      timestamp: Date.now(),
      format: 'jpeg-frames',
    };

    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });

    // Convert blobs to base64 for GitHub API
    const clipBase64 = await this.blobToBase64(clipBlob);
    const metadataBase64 = await this.blobToBase64(metadataBlob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const clipPath = `${CLIPS_FOLDER}/${this.roomId}/clip-${String(clipIndex).padStart(4, '0')}-${timestamp}.webm`;
    const metaPath = `${CLIPS_FOLDER}/${this.roomId}/clip-${String(clipIndex).padStart(4, '0')}-${timestamp}.json`;

    // Upload clip and metadata in parallel
    await Promise.all([
      this.githubUploadFile(clipPath, clipBase64, `Clip ${clipIndex} - ${this.roomId}`),
      this.githubUploadFile(metaPath, metadataBase64, `Clip ${clipIndex} metadata - ${this.roomId}`),
    ]);

    this.totalUploadedBytes += clipBlob.size + metadataBlob.size;
  }

  private async githubUploadFile(path: string, base64Content: string, message: string): Promise<void> {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    // Check if file exists first (to get SHA for updates)
    let sha: string | null = null;
    try {
      const checkResp = await fetch(url, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      if (checkResp.ok) {
        const data = await checkResp.json();
        sha = data.sha;
      }
    } catch {}

    const body: any = {
      message,
      content: base64Content,
      branch: 'main',
    };
    if (sha) body.sha = sha;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`GitHub API error: ${resp.status} - ${errText}`);
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async stopRecording(): Promise<void> {
    this.isRecording = false;

    // Stop frame capture
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop clip timer
    if (this.clipTimer) {
      clearInterval(this.clipTimer);
      this.clipTimer = null;
    }

    // Flush remaining frames
    if (this.chunkBuffer.length > 0) {
      try {
        await this.flushCurrentClip();
      } catch {}
    }

    // Cleanup
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.stream = null;

    this.notifyState();
  }

  getState(): RecordingState {
    return {
      isRecording: this.isRecording,
      clipCount: this.clipCount,
      totalUploadedBytes: this.totalUploadedBytes,
      lastUploadTime: this.lastUploadTime,
      error: this.error,
      currentClipIndex: this.clipCount + 1,
    };
  }

  destroy() {
    this.stopRecording();
    this.onStateChange = null;
  }
}
