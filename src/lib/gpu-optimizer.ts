// Focus Meet — GPU / WebGL / WebAssembly Optimizer
// Hardware-accelerated video rendering, codec offloading, and frame processing
// Automatically detects best available API and falls back gracefully

export interface GPUCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  webgl1: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  wasmThreads: boolean;
  offscreenCanvas: boolean;
  webCodecs: boolean;
  sharedArrayBuffer: boolean;
  webTransport: boolean;
  videoProcessingMode: 'webgpu' | 'webgl2' | 'webgl1' | 'canvas2d';
  codecMode: 'wasm-simd' | 'wasm' | 'js';
  maxTextureSize: number;
  gpuRenderer: string;
}

export interface VideoFrameProcessor {
  processFrame(source: HTMLVideoElement | HTMLCanvasElement, target: HTMLCanvasElement): void;
  destroy(): void;
}

// ============ CAPABILITY DETECTION ============

export function detectGPUCapabilities(): GPUCapabilities {
  if (typeof window === 'undefined') {
    return {
      webgpu: false, webgl2: false, webgl1: false,
      wasm: false, wasmSimd: false, wasmThreads: false,
      offscreenCanvas: false, webCodecs: false,
      sharedArrayBuffer: false, webTransport: false,
      videoProcessingMode: 'canvas2d', codecMode: 'js',
      maxTextureSize: 2048, gpuRenderer: 'SSR',
    };
  }

  // WebGPU detection
  let webgpu = false;
  try { webgpu = !!(navigator as any).gpu; } catch {}

  // WebGL2 detection
  let webgl2 = false;
  let maxTextureSize = 2048;
  let gpuRenderer = 'Unknown';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    if (gl) {
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpuRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
    }
  } catch {}

  // WebGL1 fallback
  let webgl1 = false;
  if (!webgl2) {
    try {
      const c = document.createElement('canvas');
      webgl1 = !!c.getContext('webgl');
    } catch {}
  }

  // WASM detection
  let wasm = false;
  let wasmSimd = false;
  let wasmThreads = false;
  try {
    wasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';
    if (wasm) {
      // SIMD detection
      try {
        const simdTest = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
        WebAssembly.validate(simdTest);
        wasmSimd = true;
      } catch {}
      // Threads detection
      wasmThreads = typeof SharedArrayBuffer !== 'undefined';
    }
  } catch {}

  // OffscreenCanvas
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  // WebCodecs
  let webCodecs = false;
  try { webCodecs = !!(window as any).VideoFrame && !!(window as any).VideoEncoder; } catch {}

  // SharedArrayBuffer
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  // WebTransport
  let webTransport = false;
  try { webTransport = typeof WebTransport !== 'undefined'; } catch {}

  // Determine best video processing mode
  const videoProcessingMode: GPUCapabilities['videoProcessingMode'] = webgpu ? 'webgpu' : webgl2 ? 'webgl2' : webgl1 ? 'webgl1' : 'canvas2d';

  // Determine best codec mode
  const codecMode: GPUCapabilities['codecMode'] = wasmSimd ? 'wasm-simd' : wasm ? 'wasm' : 'js';

  return {
    webgpu, webgl2, webgl1, wasm, wasmSimd, wasmThreads,
    offscreenCanvas, webCodecs, sharedArrayBuffer, webTransport,
    videoProcessingMode, codecMode, maxTextureSize, gpuRenderer,
  };
}

// ============ WEBGL2 VIDEO PROCESSOR ============
// Uses WebGL2 for GPU-accelerated video rendering with post-processing

class WebGL2VideoProcessor implements VideoFrameProcessor {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private initialized = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
      if (!gl) return;
      this.gl = gl;

      // Vertex shader - full screen quad
      const vsSource = `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        out vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      // Fragment shader - video rendering with adaptive sharpening
      const fsSource = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_video;
        uniform float u_sharpen;
        uniform float u_brightness;
        uniform float u_contrast;
        out vec4 fragColor;

        void main() {
          vec4 color = texture(u_video, v_texCoord);

          // Adaptive sharpening for video clarity
          if (u_sharpen > 0.0) {
            vec2 texelSize = 1.0 / vec2(textureSize(u_video, 0));
            vec4 top    = texture(u_video, v_texCoord + vec2(0.0, -texelSize.y));
            vec4 bottom = texture(u_video, v_texCoord + vec2(0.0,  texelSize.y));
            vec4 left   = texture(u_video, v_texCoord + vec2(-texelSize.x, 0.0));
            vec4 right  = texture(u_video, v_texCoord + vec2( texelSize.x, 0.0));
            vec4 sharp = color + (4.0 * color - top - bottom - left - right) * u_sharpen;
            color = vec4(clamp(sharp.rgb, 0.0, 1.0), color.a);
          }

          // Brightness & contrast adjustment
          color.rgb = (color.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

          fragColor = color;
        }
      `;

      const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return;

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

      this.program = program;

      // Create VAO with full-screen quad
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);

      // Position buffer (full-screen triangle strip)
      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,  1, 1,
      ]), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // Tex coord buffer
      const texBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 1,  1, 1,  0, 0,  1, 0,
      ]), gl.STATIC_DRAW);
      const texLoc = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      // Create video texture
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.bindVertexArray(null);
      this.initialized = true;
    } catch {}
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  processFrame(source: HTMLVideoElement | HTMLCanvasElement, target: HTMLCanvasElement): void {
    if (!this.initialized || !this.gl || !this.program || !this.texture || !this.vao) return;

    const gl = this.gl;
    const width = target.width || ('videoWidth' in source ? (source as HTMLVideoElement).videoWidth : source.width) || 1280;
    const height = target.height || ('videoHeight' in source ? (source as HTMLVideoElement).videoHeight : source.height) || 720;
    target.width = width;
    target.height = height;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    // Upload video frame to texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as any);

    // Set uniforms
    const sharpenLoc = gl.getUniformLocation(this.program, 'u_sharpen');
    const brightnessLoc = gl.getUniformLocation(this.program, 'u_brightness');
    const contrastLoc = gl.getUniformLocation(this.program, 'u_contrast');
    gl.uniform1f(sharpenLoc, 0.15);   // Subtle sharpening for clarity
    gl.uniform1f(brightnessLoc, 0.0);
    gl.uniform1f(contrastLoc, 1.05);   // Slight contrast boost

    // Draw
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  destroy() {
    if (this.gl) {
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.texture) this.gl.deleteTexture(this.texture);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
    }
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.vao = null;
    this.initialized = false;
  }
}

// ============ CANVAS2D FALLBACK PROCESSOR ============

class Canvas2DVideoProcessor implements VideoFrameProcessor {
  processFrame(source: HTMLVideoElement | HTMLCanvasElement, target: HTMLCanvasElement): void {
    const ctx = target.getContext('2d');
    if (!ctx) return;
    const width = 'videoWidth' in source ? (source as HTMLVideoElement).videoWidth || 1280 : source.width;
    const height = 'videoHeight' in source ? (source as HTMLVideoElement).videoHeight || 720 : source.height;
    target.width = width;
    target.height = height;
    ctx.drawImage(source, 0, 0, width, height);
  }

  destroy() {}
}

// ============ VIDEO PROCESSOR FACTORY ============

let cachedCapabilities: GPUCapabilities | null = null;

export function getGPUCapabilities(): GPUCapabilities {
  if (!cachedCapabilities) cachedCapabilities = detectGPUCapabilities();
  return cachedCapabilities;
}

export function createVideoProcessor(): VideoFrameProcessor {
  const caps = getGPUCapabilities();

  switch (caps.videoProcessingMode) {
    case 'webgpu':
      // WebGPU path — fall through to WebGL2 for now as WebGPU video is still experimental
    case 'webgl2':
      try { return new WebGL2VideoProcessor(); } catch {}
      return new Canvas2DVideoProcessor();
    case 'webgl1':
      return new Canvas2DVideoProcessor();
    case 'canvas2d':
    default:
      return new Canvas2DVideoProcessor();
  }
}

// ============ WASM CODEC STUB ============
// Placeholder for future WASM AV1 codec integration
// When WASM SIMD is available, codec operations run in a Web Worker

export interface CodecProcessor {
  encode(frame: ImageData): Uint8Array | null;
  decode(data: Uint8Array): ImageData | null;
  destroy(): void;
}

export function createCodecProcessor(): CodecProcessor | null {
  const caps = getGPUCapabilities();
  if (!caps.wasm) return null;

  // Return a JS-based codec stub that will be replaced with WASM AV1 when available
  return {
    encode(frame: ImageData): Uint8Array | null {
      // Stub: return raw pixel data (placeholder for WASM AV1 encoding)
      return new Uint8Array(frame.data.buffer.slice(0));
    },
    decode(data: Uint8Array): ImageData | null {
      // Stub: treat as raw pixel data (placeholder for WASM AV1 decoding)
      const len = data.length;
      const pixels = len / 4;
      const w = Math.ceil(Math.sqrt(pixels));
      const h = Math.ceil(pixels / w);
      return new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), w, h);
    },
    destroy() {},
  };
}

// ============ OFFSCREEN CANVAS HELPER ============
// Creates an OffscreenCanvas for worker-based rendering when available

export function createOffscreenCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// ============ PERFORMANCE MONITORING ============

export interface GPUPerfMetrics {
  fps: number;
  frameTimeMs: number;
  gpuMode: string;
  codecMode: string;
  textureSize: number;
  renderer: string;
  optimizations: string[];
}

export function getGPUPerfMetrics(frameTimeMs: number = 16.67): GPUPerfMetrics {
  const caps = getGPUCapabilities();
  const optimizations: string[] = [];

  if (caps.webgpu) optimizations.push('WebGPU');
  if (caps.webgl2) optimizations.push('WebGL2');
  if (caps.wasmSimd) optimizations.push('WASM-SIMD');
  if (caps.wasm) optimizations.push('WASM');
  if (caps.offscreenCanvas) optimizations.push('OffscreenCanvas');
  if (caps.webCodecs) optimizations.push('WebCodecs');
  if (caps.sharedArrayBuffer) optimizations.push('SharedArrayBuffer');
  if (caps.webTransport) optimizations.push('WebTransport');

  return {
    fps: Math.round(1000 / frameTimeMs),
    frameTimeMs: Math.round(frameTimeMs * 100) / 100,
    gpuMode: caps.videoProcessingMode,
    codecMode: caps.codecMode,
    textureSize: caps.maxTextureSize,
    renderer: caps.gpuRenderer,
    optimizations,
  };
}
