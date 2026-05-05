// Focus Meet — Adaptive Content Delivery Engine
// Determines what content each viewer receives based on their bandwidth
// Ensures ALL viewers get the SAME knowledge, just different media delivery

export type DeliveryMode = 'full' | 'slides-audio' | 'audio-only';

export interface ViewerDeliveryProfile {
  peerId: string;
  mode: DeliveryMode;
  bandwidthKbps: number;
  rttMs: number;
  packetLoss: number;
  lastUpdated: number;
  slideIndex: number;         // Current slide this viewer is on
  receivingVideo: boolean;    // Whether video stream is active
  receivingAudio: boolean;    // Whether audio stream is active
  receivingSlides: boolean;   // Whether slide updates are being sent
  quality: '720p' | '480p' | '360p' | 'audio';
}

export interface SlideSyncMessage {
  type: 'slide-change' | 'slide-annotation' | 'slide-laser' | 'slide-clear';
  slideIndex: number;
  annotation?: { x: number; y: number; type: 'draw' | 'arrow' | 'text'; data: any };
  laser?: { x: number; y: number };  // Normalized 0-1 coordinates
  timestamp: number;
  senderId: string;
}

export class AdaptiveDeliveryEngine {
  private viewerProfiles: Map<string, ViewerDeliveryProfile> = new Map();
  private currentSlideIndex = 0;
  private slideAnnotations: Map<number, any[]> = new Map();
  private laserPosition: { x: number; y: number } | null = null;

  // Thresholds for mode switching
  private readonly FULL_MODE_MIN_KBPS = 1500;    // Need 1.5 Mbps for video
  private readonly SLIDES_MODE_MIN_KBPS = 300;    // Need 300 kbps for slides+audio
  private readonly AUDIO_ONLY_MAX_RTT = 800;       // Above 800ms RTT → audio only
  private readonly AUDIO_ONLY_MAX_LOSS = 0.25;     // Above 25% loss → audio only

  // Slide image size estimate (for bandwidth calculation)
  private readonly SLIDE_IMAGE_SIZE_KB = 150;      // ~150KB per slide image
  private readonly AUDIO_BITRATE_KBPS = 128;        // 128 kbps audio

  // Get delivery mode for a viewer based on their network conditions
  getDeliveryMode(bandwidthKbps: number, rttMs: number, packetLoss: number): DeliveryMode {
    if (bandwidthKbps >= this.FULL_MODE_MIN_KBPS && rttMs < 400 && packetLoss < 0.08) {
      return 'full';            // Video + slides + audio
    }
    if (bandwidthKbps >= this.SLIDES_MODE_MIN_KBPS && rttMs < this.AUDIO_ONLY_MAX_RTT && packetLoss < this.AUDIO_ONLY_MAX_LOSS) {
      return 'slides-audio';    // Slides + audio (no video)
    }
    return 'audio-only';         // Audio only
  }

  // Update a viewer's profile
  updateViewerProfile(peerId: string, bandwidth: { kbps: number; rttMs: number; packetLoss: number }): ViewerDeliveryProfile {
    const mode = this.getDeliveryMode(bandwidth.kbps, bandwidth.rttMs, bandwidth.packetLoss);

    const profile: ViewerDeliveryProfile = {
      peerId,
      mode,
      bandwidthKbps: bandwidth.kbps,
      rttMs: bandwidth.rttMs,
      packetLoss: bandwidth.packetLoss,
      lastUpdated: Date.now(),
      slideIndex: this.currentSlideIndex,
      receivingVideo: mode === 'full',
      receivingAudio: true, // Everyone gets audio
      receivingSlides: mode === 'full' || mode === 'slides-audio',
      quality: mode === 'full' ? '720p' : mode === 'slides-audio' ? '480p' : 'audio',
    };

    this.viewerProfiles.set(peerId, profile);
    return profile;
  }

  // Get current slide index
  getCurrentSlideIndex(): number {
    return this.currentSlideIndex;
  }

  // Change slide (speaker action)
  changeSlide(index: number): SlideSyncMessage {
    this.currentSlideIndex = index;
    return {
      type: 'slide-change',
      slideIndex: index,
      timestamp: Date.now(),
      senderId: '', // Will be filled by caller
    };
  }

  // Update laser pointer position (speaker action)
  updateLaser(x: number, y: number): SlideSyncMessage {
    this.laserPosition = { x, y };
    return {
      type: 'slide-laser',
      slideIndex: this.currentSlideIndex,
      laser: { x, y },
      timestamp: Date.now(),
      senderId: '',
    };
  }

  // Add annotation to current slide
  addAnnotation(annotation: { x: number; y: number; type: 'draw' | 'arrow' | 'text'; data: any }): SlideSyncMessage {
    const annotations = this.slideAnnotations.get(this.currentSlideIndex) || [];
    annotations.push(annotation);
    this.slideAnnotations.set(this.currentSlideIndex, annotations);

    return {
      type: 'slide-annotation',
      slideIndex: this.currentSlideIndex,
      annotation,
      timestamp: Date.now(),
      senderId: '',
    };
  }

  // Clear annotations on current slide
  clearAnnotations(): SlideSyncMessage {
    this.slideAnnotations.delete(this.currentSlideIndex);
    return {
      type: 'slide-clear',
      slideIndex: this.currentSlideIndex,
      timestamp: Date.now(),
      senderId: '',
    };
  }

  // Get stats about delivery modes
  getDeliveryStats(): { full: number; slidesAudio: number; audioOnly: number; total: number } {
    let full = 0, slidesAudio = 0, audioOnly = 0;
    for (const [, profile] of this.viewerProfiles) {
      if (profile.mode === 'full') full++;
      else if (profile.mode === 'slides-audio') slidesAudio++;
      else audioOnly++;
    }
    return { full, slidesAudio, audioOnly, total: full + slidesAudio + audioOnly };
  }

  // Get bandwidth savings vs sending video to everyone
  getBandwidthSavings(): { videoKbps: number; slidesKbps: number; savingsPercent: number } {
    const stats = this.getDeliveryStats();
    const videoKbps = stats.full * 2500 + stats.slidesAudio * 0 + stats.audioOnly * 0;
    const slidesKbps = stats.slidesAudio * (this.SLIDE_IMAGE_SIZE_KB * 8 / 10); // 150KB slide, ~10s per slide
    const totalIfAllVideo = stats.total * 2500;
    const savingsPercent = totalIfAllVideo > 0 ? ((totalIfAllVideo - videoKbps - slidesKbps) / totalIfAllVideo) * 100 : 0;

    return { videoKbps, slidesKbps, savingsPercent };
  }

  getProfile(peerId: string): ViewerDeliveryProfile | undefined {
    return this.viewerProfiles.get(peerId);
  }

  removeViewer(peerId: string) {
    this.viewerProfiles.delete(peerId);
  }

  getLaserPosition(): { x: number; y: number } | null {
    return this.laserPosition;
  }

  getAnnotations(slideIndex: number): any[] {
    return this.slideAnnotations.get(slideIndex) || [];
  }

  getViewerCount(): number {
    return this.viewerProfiles.size;
  }

  getAllProfiles(): ViewerDeliveryProfile[] {
    return Array.from(this.viewerProfiles.values());
  }
}
