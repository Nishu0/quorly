"use client";

import { useEffect, useRef } from "react";

/**
 * Dithered cloud field: fractal noise pushed to two colours through a Bayer
 * 4×4 ordered dither, so every pixel is either paper or blue and the gradient
 * exists only as a pattern. Two colours, no anti-aliasing — the constraint is
 * the aesthetic.
 */
const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_light;
uniform vec3  u_dark;
uniform float u_scale;

float hash(vec2 p) {
  p = fract(p * vec2(233.14, 113.23));
  p += dot(p, p.yx + 19.19);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Layered noise: each octave halves in amplitude and doubles in frequency,
// which is what gives clouds their soft-then-detailed structure.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Bayer 4x4 threshold map, unrolled — WebGL1 has no array indexing by a
// non-constant expression.
float bayer(vec2 c) {
  int x = int(mod(c.x, 4.0));
  int y = int(mod(c.y, 4.0));
  float l = 0.0;
  if (x==0 && y==0) l = 0.0000;
  if (x==1 && y==0) l = 0.5000;
  if (x==2 && y==0) l = 0.1250;
  if (x==3 && y==0) l = 0.6250;
  if (x==0 && y==1) l = 0.7500;
  if (x==1 && y==1) l = 0.2500;
  if (x==2 && y==1) l = 0.8750;
  if (x==3 && y==1) l = 0.3750;
  if (x==0 && y==2) l = 0.1875;
  if (x==1 && y==2) l = 0.6875;
  if (x==2 && y==2) l = 0.0625;
  if (x==3 && y==2) l = 0.5625;
  if (x==0 && y==3) l = 0.9375;
  if (x==1 && y==3) l = 0.4375;
  if (x==2 && y==3) l = 0.8125;
  if (x==3 && y==3) l = 0.3125;
  return l;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 st = uv;
  st.x *= u_resolution.x / u_resolution.y;

  float n = fbm(st * u_scale + vec2(u_time * 0.05, u_time * 0.02));
  n = smoothstep(0.3, 0.7, n);

  // Dither at a fixed pixel grid so the pattern stays crisp regardless of DPR.
  float stepVal = step(bayer(gl_FragCoord.xy), n);

  gl_FragColor = vec4(mix(u_dark, u_light, stepVal), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, src: string, type: number) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("shader:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function DitherBackground({
  light = "#faf7f0",
  dark = "#1f4b3f",
  scale = 3,
  className = "",
}: {
  light?: string;
  dark?: string;
  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return; // no WebGL: the CSS background underneath stands in

    const vs = compile(gl, VERTEX, gl.VERTEX_SHADER);
    const fs = compile(gl, FRAGMENT, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const pos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    gl.uniform3fv(gl.getUniformLocation(program, "u_light"), rgb(light));
    gl.uniform3fv(gl.getUniformLocation(program, "u_dark"), rgb(dark));
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), scale);

    // Render at CSS pixels, not device pixels: the dither grid is the point,
    // and a retina buffer would shrink it into a smooth grey.
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = Date.now();
    let frame = 0;

    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      // Still frame for reduced motion — the texture without the drift.
      gl.uniform1f(uTime, reduced ? 0 : (Date.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [light, dark, scale]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className}`}
    />
  );
}
