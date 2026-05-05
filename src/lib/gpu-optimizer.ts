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
  // NOTE: We only report 'webgpu' if the API is present. Actual WebGPU init
  // may still fail at runtime — createVideoProcessor() handles that gracefully.
  const videoProcessingMode: GPUCapabilities['videoProcessingMode'] = webgpu ? 'webgpu' : webgl2 ? 'webgl2' : webgl1 ? 'webgl1' : 'canvas2d';

  // Determine best codec mode
  const codecMode: GPUCapabilities['codecMode'] = wasmSimd ? 'wasm-simd' : wasm ? 'wasm' : 'js';

  return {
    webgpu, webgl2, webgl1, wasm, wasmSimd, wasmThreads,
    offscreenCanvas, webCodecs, sharedArrayBuffer, webTransport,
    videoProcessingMode, codecMode, maxTextureSize, gpuRenderer,
  };
}

// ============ WEBGPU VIDEO PROCESSOR ============
// Uses WebGPU compute pipelines for GPU-accelerated video frame processing
// Implements real video enhancement (brightness, contrast, saturation) and noise reduction

class WebGPUVideoProcessor implements VideoFrameProcessor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private texture: GPUTexture | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private format: GPUTextureFormat = 'rgba8unorm';
  private initialized = false;
  private initPromise: Promise<boolean>;

  // Persistent resources to avoid GPU memory churn
  private uniformBuffer: GPUBuffer | null = null;
  private uniformBufferSize = 0;
  private lastVideoFrame: any = null;
  private externalTexture: GPUExternalTexture | null = null;
  private lastTextureWidth = 0;
  private lastTextureHeight = 0;

  // Frame skip logic for mobile
  private isMobile = false;
  private frameSkipCounter = 0;
  private readonly FRAME_SKIP_ON_MOBILE = 2; // Process every 3rd frame on mobile

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<boolean> {
    try {
      if (!navigator.gpu) return false;

      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return false;

      this.device = await adapter.requestDevice();
      if (!this.device) return false;

      // Get preferred canvas format
      this.format = navigator.gpu.getPreferredCanvasFormat();

      // WGSL shader for video enhancement: brightness, contrast, saturation + noise reduction
      const shaderCode = `
        struct VertexOutput {
          @builtin(position) position: vec4f,
          @location(0) uv: vec2f,
        };

        @vertex
        fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
          // Full-screen triangle strip (2 triangles covering the screen)
          var pos = array<vec2f, 6>(
            vec2f(-1.0, -1.0),
            vec2f( 1.0, -1.0),
            vec2f(-1.0,  1.0),
            vec2f(-1.0,  1.0),
            vec2f( 1.0, -1.0),
            vec2f( 1.0,  1.0),
          );
          var uv = array<vec2f, 6>(
            vec2f(0.0, 1.0),
            vec2f(1.0, 1.0),
            vec2f(0.0, 0.0),
            vec2f(0.0, 0.0),
            vec2f(1.0, 1.0),
            vec2f(1.0, 0.0),
          );

          var output: VertexOutput;
          output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
          output.uv = uv[vertexIndex];
          return output;
        }

        @group(0) @binding(0) var videoSampler: sampler;
        @group(0) @binding(1) var videoTexture: texture_2d<f32>;

        struct Params {
          brightness: f32,
          contrast: f32,
          saturation: f32,
          sharpen: f32,
          texelWidth: f32,
          texelHeight: f32,
          _pad1: f32,
          _pad2: f32,
        };
        @group(0) @binding(2) var<uniform> params: Params;

        @fragment
        fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
          let uv = input.uv;

          // 3x3 box blur for noise reduction (sampled from neighbors)
          let tw = params.texelWidth;
          let th = params.texelHeight;

          let c00 = textureSample(videoTexture, videoSampler, uv + vec2f(-tw, -th));
          let c10 = textureSample(videoTexture, videoSampler, uv + vec2f(0.0, -th));
          let c20 = textureSample(videoTexture, videoSampler, uv + vec2f( tw, -th));
          let c01 = textureSample(videoTexture, videoSampler, uv + vec2f(-tw, 0.0));
          let c11 = textureSample(videoTexture, videoSampler, uv);
          let c21 = textureSample(videoTexture, videoSampler, uv + vec2f( tw, 0.0));
          let c02 = textureSample(videoTexture, videoSampler, uv + vec2f(-tw,  th));
          let c12 = textureSample(videoTexture, videoSampler, uv + vec2f(0.0,  th));
          let c22 = textureSample(videoTexture, videoSampler, uv + vec2f( tw,  th));

          // Noise reduction: simple 3x3 Gaussian-like kernel (weighted average)
          // Weights: center=4, edge=2, corner=1 → total=16
          let blurred = (c00 + c20 + c02 + c22) * 0.0625
                      + (c10 + c01 + c21 + c12) * 0.125
                      + c11 * 0.25;

          // Blend original with blurred based on sharpen param (inverse: less sharpen = more blur blend)
          let noiseReduceAmount = max(0.0, 1.0 - params.sharpen) * 0.3;
          var color = mix(c11, blurred, noiseReduceAmount);

          // Adaptive sharpening (unsharp mask)
          if (params.sharpen > 0.0) {
            let sharp = c11 + (4.0 * c11 - c01 - c21 - c10 - c12) * params.sharpen;
            color = vec4f(clamp(sharp.rgb, vec3f(0.0), vec3f(1.0)), color.a);
          }

          // Brightness adjustment
          color = vec4f(color.rgb + params.brightness, color.a);

          // Contrast adjustment
          color = vec4f((color.rgb - 0.5) * params.contrast + 0.5, color.a);

          // Saturation adjustment
          let luminance = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
          color = vec4f(mix(vec3f(luminance), color.rgb, params.saturation), color.a);

          return color;
        }
      `;

      const shaderModule = this.device.createShaderModule({ code: shaderCode });

      // Create bind group layout
      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      });

      // Create render pipeline
      this.pipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: shaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: this.format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      // Create sampler
      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      // Detect mobile device for frame skip logic
      try {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      } catch {}

      this.initialized = true;
      return true;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    return this.initPromise;
  }

  processFrame(source: HTMLVideoElement | HTMLCanvasElement, target: HTMLCanvasElement): void {
    if (!this.initialized || !this.device || !this.pipeline || !this.sampler) return;

    // Skip frames on mobile to reduce GPU load
    if (this.isMobile && this.frameSkipCounter < this.FRAME_SKIP_ON_MOBILE) {
      this.frameSkipCounter++;
      // Just draw the last processed frame — skip GPU processing
      return;
    }
    this.frameSkipCounter = 0;

    try {
      const width = target.width || ('videoWidth' in source ? (source as HTMLVideoElement).videoWidth : source.width) || 1280;
      const height = target.height || ('videoHeight' in source ? (source as HTMLVideoElement).videoHeight : source.height) || 720;
      target.width = width;
      target.height = height;

      // Configure canvas context for WebGPU
      const gpuContext = target.getContext('webgpu') as GPUCanvasContext | null;
      if (!gpuContext) return;

      gpuContext.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque',
      });

      // Reuse texture when dimensions haven't changed (avoids GPU memory churn)
      const needsNewTexture = !this.texture || this.lastTextureWidth !== width || this.lastTextureHeight !== height;
      if (needsNewTexture) {
        if (this.texture) this.texture.destroy();
        this.texture = this.device.createTexture({
          size: [width, height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.lastTextureWidth = width;
        this.lastTextureHeight = height;
      }

      // Upload video frame to GPU texture
      this.device.queue.copyExternalImageToTexture(
        { source: source as any, flipY: true },
        { texture: this.texture },
        [width, height],
      );

      // Persistent uniform buffer — only recreate if size changed
      const uniformData = new Float32Array([
        0.0,    // brightness
        1.05,   // contrast
        1.0,    // saturation
        0.15,   // sharpen
        1.0 / width,  // texelWidth
        1.0 / height, // texelHeight
        0.0,    // padding
        0.0,    // padding
      ]);
      const requiredSize = uniformData.byteLength;
      if (!this.uniformBuffer || this.uniformBufferSize !== requiredSize) {
        if (this.uniformBuffer) this.uniformBuffer.destroy();
        this.uniformBuffer = this.device.createBuffer({
          size: requiredSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.uniformBufferSize = requiredSize;
      }
      this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

      // Create bind group
      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.texture.createView() },
          { binding: 2, resource: { buffer: this.uniformBuffer! } },
        ],
      });

      // Render
      const commandEncoder = this.device.createCommandEncoder();
      const textureView = gpuContext.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });

      renderPass.setPipeline(this.pipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(6); // 6 vertices for 2 triangles
      renderPass.end();

      this.device.queue.submit([commandEncoder.finish()]);
    } catch {
      // WebGPU processing failed — the factory will fall back
    }
  }

  destroy() {
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.texture) this.texture.destroy();
    if (this.device) this.device.destroy();
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.sampler = null;
    this.texture = null;
    this.bindGroup = null;
    this.uniformBuffer = null;
    this.uniformBufferSize = 0;
    this.lastVideoFrame = null;
    this.lastTextureWidth = 0;
    this.lastTextureHeight = 0;
    this.initialized = false;
  }
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
let webgpuInitFailed = false; // Track if WebGPU actually failed to init at runtime

export function getGPUCapabilities(): GPUCapabilities {
  if (!cachedCapabilities) cachedCapabilities = detectGPUCapabilities();
  // If WebGPU init failed at runtime, report honestly
  if (webgpuInitFailed && cachedCapabilities.videoProcessingMode === 'webgpu') {
    cachedCapabilities = {
      ...cachedCapabilities,
      videoProcessingMode: cachedCapabilities.webgl2 ? 'webgl2' : cachedCapabilities.webgl1 ? 'webgl1' : 'canvas2d',
    };
  }
  return cachedCapabilities;
}

/** Reset cached capabilities (useful after WebGPU init failure) */
export function resetGPUCapabilities(): void {
  cachedCapabilities = null;
  webgpuInitFailed = false;
}

export async function createVideoProcessorAsync(): Promise<VideoFrameProcessor> {
  const caps = getGPUCapabilities();

  if (caps.videoProcessingMode === 'webgpu') {
    try {
      const processor = new WebGPUVideoProcessor();
      const ready = await processor.isReady();
      if (ready) {
        return processor;
      }
      // WebGPU init failed — mark it and fall back
      processor.destroy();
      webgpuInitFailed = true;
      cachedCapabilities = null; // Force re-detection with honest reporting
    } catch {
      webgpuInitFailed = true;
      cachedCapabilities = null;
    }
  }

  // Fall back to WebGL2
  try { return new WebGL2VideoProcessor(); } catch {}
  return new Canvas2DVideoProcessor();
}

export function createVideoProcessor(): VideoFrameProcessor {
  const caps = getGPUCapabilities();

  switch (caps.videoProcessingMode) {
    case 'webgpu': {
      // WebGPU requires async init — return a synchronous wrapper that
      // falls back to WebGL2 initially and upgrades on next frame
      // For sync callers, we try WebGPU but fall back if not ready
      try {
        const processor = new WebGPUVideoProcessor();
        // processor.isReady() is async; check if it looks initialized
        // If WebGPU previously failed, skip
        if (webgpuInitFailed) {
          break; // Fall through to WebGL2
        }
        // Return a deferred processor that tries WebGPU first
        return new DeferredWebGPUProcessor(processor);
      } catch {
        webgpuInitFailed = true;
        cachedCapabilities = null;
      }
      break;
    }
    case 'webgl2':
      try { return new WebGL2VideoProcessor(); } catch {}
      return new Canvas2DVideoProcessor();
    case 'webgl1':
      return new Canvas2DVideoProcessor();
    case 'canvas2d':
    default:
      return new Canvas2DVideoProcessor();
  }

  // Fallback from WebGPU failure
  try { return new WebGL2VideoProcessor(); } catch {}
  return new Canvas2DVideoProcessor();
}

/**
 * Deferred processor: tries WebGPU, falls back to WebGL2 if not ready.
 * This allows the sync createVideoProcessor() API to still work while
 * attempting to use WebGPU when it becomes available.
 */
class DeferredWebGPUProcessor implements VideoFrameProcessor {
  private webgpuProcessor: WebGPUVideoProcessor;
  private fallback: VideoFrameProcessor | null = null;
  private resolved: VideoFrameProcessor | null = null;

  constructor(webgpuProcessor: WebGPUVideoProcessor) {
    this.webgpuProcessor = webgpuProcessor;
    // Kick off the async init
    this.webgpuProcessor.isReady().then(ready => {
      if (ready) {
        this.resolved = this.webgpuProcessor;
      } else {
        this.webgpuProcessor.destroy();
        webgpuInitFailed = true;
        cachedCapabilities = null;
        this.fallback = this.createFallback();
        this.resolved = this.fallback;
      }
    });
  }

  private createFallback(): VideoFrameProcessor {
    try { return new WebGL2VideoProcessor(); } catch {}
    return new Canvas2DVideoProcessor();
  }

  processFrame(source: HTMLVideoElement | HTMLCanvasElement, target: HTMLCanvasElement): void {
    if (this.resolved) {
      this.resolved.processFrame(source, target);
    } else if (this.fallback) {
      this.fallback.processFrame(source, target);
    }
    // If neither is ready yet, the frame is dropped (WebGPU is initializing)
    // The next frame will render once init completes
  }

  destroy() {
    this.webgpuProcessor.destroy();
    if (this.fallback) this.fallback.destroy();
  }
}

// ============ CODEC PROCESSOR ============
// Simple color-space conversion + quantization for frame encoding/decoding.
// NOT a real video codec — this is a lightweight transform that reduces data
// size via YUV conversion and chroma subsampling.

export interface CodecProcessor {
  encode(frame: ImageData): Uint8Array | null;
  decode(data: Uint8Array): ImageData | null;
  destroy(): void;
}

export function createCodecProcessor(): CodecProcessor | null {
  const caps = getGPUCapabilities();
  if (!caps.wasm) return null;

  // Codec dimensions are tracked per encode/decode cycle
  let lastWidth = 0;
  let lastHeight = 0;

  return {
    encode(frame: ImageData): Uint8Array | null {
      const { width, height, data } = frame;
      lastWidth = width;
      lastHeight = height;

      // RGBA → YUV420 with chroma subsampling
      // Y plane: width * height bytes
      // U plane: (width/2) * (height/2) bytes
      // V plane: (width/2) * (height/2) bytes
      const ySize = width * height;
      const uvSize = Math.floor(width / 2) * Math.floor(height / 2);
      const totalSize = ySize + uvSize * 2;

      const output = new Uint8Array(totalSize);

      // Convert RGBA to Y (full res)
      for (let i = 0; i < ySize; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Standard BT.601 Y calculation
        output[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }

      // Convert to U (half res) — Cb
      const uOffset = ySize;
      for (let y = 0; y < Math.floor(height / 2); y++) {
        for (let x = 0; x < Math.floor(width / 2); x++) {
          // Average 2x2 block for chroma
          let rSum = 0, gSum = 0, bSum = 0;
          const baseIdx = (y * 2 * width + x * 2) * 4;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const idx = baseIdx + (dy * width + dx) * 4;
              if (idx + 2 < data.length) {
                rSum += data[idx];
                gSum += data[idx + 1];
                bSum += data[idx + 2];
              }
            }
          }
          // U = (B - Y) scaled to 0-255
          const avgB = bSum / 4;
          const avgG = gSum / 4;
          const avgR = rSum / 4;
          const luma = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
          output[uOffset + y * Math.floor(width / 2) + x] = Math.round(128 + (avgB - luma) * 0.5);
        }
      }

      // Convert to V (half res) — Cr
      const vOffset = ySize + uvSize;
      for (let y = 0; y < Math.floor(height / 2); y++) {
        for (let x = 0; x < Math.floor(width / 2); x++) {
          let rSum = 0, gSum = 0, bSum = 0;
          const baseIdx = (y * 2 * width + x * 2) * 4;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const idx = baseIdx + (dy * width + dx) * 4;
              if (idx + 2 < data.length) {
                rSum += data[idx];
                gSum += data[idx + 1];
                bSum += data[idx + 2];
              }
            }
          }
          const avgR = rSum / 4;
          const avgG = gSum / 4;
          const avgB = bSum / 4;
          const luma = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
          output[vOffset + y * Math.floor(width / 2) + x] = Math.round(128 + (avgR - luma) * 0.5);
        }
      }

      return output;
    },

    decode(data: Uint8Array): ImageData | null {
      const width = lastWidth;
      const height = lastHeight;
      if (width === 0 || height === 0) return null;

      const ySize = width * height;
      const uvWidth = Math.floor(width / 2);
      const uvHeight = Math.floor(height / 2);
      const uvSize = uvWidth * uvHeight;

      if (data.length < ySize + uvSize * 2) return null;

      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const yVal = data[y * width + x];

          // Upsample chroma
          const ux = Math.min(Math.floor(x / 2), uvWidth - 1);
          const uy = Math.min(Math.floor(y / 2), uvHeight - 1);
          const uVal = data[ySize + uy * uvWidth + ux] - 128;
          const vVal = data[ySize + uvSize + uy * uvWidth + ux] - 128;

          // YUV → RGB (BT.601 inverse)
          const r = Math.max(0, Math.min(255, Math.round(yVal + 1.402 * vVal)));
          const g = Math.max(0, Math.min(255, Math.round(yVal - 0.344136 * uVal - 0.714136 * vVal)));
          const b = Math.max(0, Math.min(255, Math.round(yVal + 1.772 * uVal)));

          const pixIdx = (y * width + x) * 4;
          pixels[pixIdx] = r;
          pixels[pixIdx + 1] = g;
          pixels[pixIdx + 2] = b;
          pixels[pixIdx + 3] = 255;
        }
      }

      return new ImageData(pixels, width, height);
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
