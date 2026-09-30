import * as THREE from 'three'

// Opening backdrop: a swirling accretion-disc halo behind the eagle (drawn
// in lines of light by the hero scene), a ring field rippling out from the
// pointer, and motes of light rising; it flares as the bronze is born.

const frag = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime, uProgress;
  uniform vec2 uMouse;
  uniform float uActive;
  uniform float uCy;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }

  // One wing of strands fanning from a shoulder at the origin (x to the tip).
  vec3 wing(vec2 q, float beat, float fold){
    float r = length(q);
    float a = atan(q.y, q.x) + r * 0.22;      // strands sweep back as they reach out
    float a0 = -0.8 + beat * 0.22 + fold;     // inner trailing feathers, hanging down-out
    float span = 1.85 - fold * 1.0;           // up to the raised leading edge
    float t = (a - a0) / span;                // 0 = trailing edge, 1 = leading edge
    if (t < 0.0 || t > 1.0) return vec3(0.0);
    // Raised eagle wing: short inner secondaries, long primaries toward the
    // tip splayed into fingers, a clean leading edge.
    float len = 0.7 * mix(0.34, 1.0, smoothstep(0.0, 0.75, t)) * (1.0 - 0.55 * smoothstep(0.84, 1.0, t)) * (1.0 - fold * 0.7);
    len *= t > 0.5 && t < 0.86 ? 0.9 + 0.1 * sin(t * 110.0) : 1.0;
    float body = smoothstep(len, len * 0.55, r) * smoothstep(0.015, 0.07, r);
    // Main feathers and fine barbs.
    float k1 = t * 26.0;
    float k2 = t * 140.0;
    float f1 = exp(-pow((fract(k1) - 0.5) * 7.0, 2.0) * 3.0);
    float f2 = exp(-pow((fract(k2) - 0.5) * 3.0, 2.0) * 4.0) * 0.35;
    float edge = exp(-pow((r - len * 0.97) * 60.0, 2.0)) * 0.9;   // bright tips
    // Light travelling out along the strands.
    float pulse = 0.55 + 0.45 * sin(r * 26.0 - uTime * 2.2 + floor(k1) * 1.7);
    float lum = (f1 * pulse + f2) * body + edge * smoothstep(0.0, 0.05, body + 0.02) * step(0.0, len - r + 0.02);
    vec3 root = vec3(0.1, 0.3, 0.95);
    vec3 tip = vec3(0.78, 0.9, 1.0);
    vec3 col = mix(root, tip, smoothstep(0.1, 0.9, r / max(len, 0.01)));
    return col * lum;
  }

  void main(){
    float aspect = uRes.x / uRes.y;
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float pr = uProgress;
    vec2 m = uMouse - 0.5;

    // Night: deep blue with a halo behind the eagle.
    vec3 col = mix(vec3(0.012, 0.035, 0.12), vec3(0.004, 0.012, 0.05), smoothstep(-0.5, 0.6, p.y));
    vec2 c = vec2(0.0, uCy < -1.0 ? (aspect < 0.8 ? 0.2 : 0.14) : uCy);
    col += vec3(0.1, 0.25, 0.8) * exp(-length((p - c) * vec2(0.8, 1.2)) * 3.2) * 0.6;

    // Accretion halo: a thin ring of swirling light, hot on one side.
    vec2 hp2 = (p - c) * vec2(1.0, 1.0);
    float d = length(hp2);
    float ang = atan(hp2.y, hp2.x);
    float R0 = aspect < 0.8 ? 0.27 : 0.36;
    float swirl = 0.55 + 0.45 * sin(ang * 3.0 - uTime * 0.7 + d * 18.0) * (0.6 + 0.4 * noise(vec2(ang * 6.0 + uTime * 0.9, d * 30.0)));
    float streak = pow(noise(vec2(ang * 24.0 - uTime * 1.6, d * 50.0)), 3.0);
    float ringW = 0.006 + 0.02 * swirl;
    float ring = exp(-pow((d - R0) / ringW, 2.0));
    float disc = smoothstep(R0 + 0.16, R0, d) * smoothstep(R0 - 0.1, R0, d) * (0.3 + streak) * 0.5;
    float hot = 0.65 + 0.35 * cos(ang - 0.9 + uTime * 0.12);
    float haloK = 1.0 - smoothstep(0.1, 0.35, pr);
    col += (vec3(0.35, 0.6, 1.0) * ring * 1.6 + vec3(0.15, 0.35, 1.0) * disc) * hot * swirl * haloK;
    col += vec3(0.02, 0.05, 0.2) * smoothstep(R0, 0.0, d) * haloK;  // dark core

    // Ring field rippling out from the pointer.
    vec2 mp = (uMouse - 0.5) * vec2(aspect, 1.0);
    float md = length(p - mp);
    col += vec3(0.25, 0.45, 1.0) * pow(0.5 + 0.5 * sin(md * 90.0 - uTime * 5.0), 12.0) * exp(-md * 7.0) * 0.35 * uActive;

    // Scroll: the halo flares as the bronze is born.
    col += vec3(0.25, 0.45, 1.0) * exp(-length((p - c) * vec2(0.9, 1.3)) * 4.0) * smoothstep(0.04, 0.14, pr) * (1.0 - smoothstep(0.18, 0.35, pr));

    // Rising motes.
    vec2 g = vec2(p.x * 40.0, p.y * 40.0 - uTime * 0.8);
    vec2 id = floor(g);
    float h = hash(id);
    float mote = step(0.965, h) * exp(-length(fract(g) - 0.5 - (h - 0.5) * 0.6) * 18.0);
    col += vec3(0.6, 0.8, 1.0) * mote * (0.4 + 0.6 * sin(uTime * 2.0 + h * 40.0)) * smoothstep(-0.4, 0.3, p.y);

    // Scroll flash, vignette, grain.
    col += vec3(0.6, 0.75, 1.0) * exp(-pow((pr - 0.15) * 20.0, 2.0)) * 0.25;
    col *= 1.0 - 0.5 * pow(length(vUv - 0.5) * 1.25, 2.0);
    col += (hash(vUv * uRes + uTime) - 0.5) * 0.025;
    col = 1.0 - exp(-col * 1.3);
    gl_FragColor = vec4(pow(col, vec3(0.92)), 1.0);
  }
`

export class HeroLight {
  constructor(canvas, { cy = -9 } = {}) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 1.75))
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.u = { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uProgress: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uActive: { value: 0 }, uCy: { value: cy } }
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, uniforms: this.u })))
    this.mouse = new THREE.Vector2(0.5, 0.5)
    addEventListener('pointermove', (e) => {
      this.mouse.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight)
      this.moved = true
    })
    this.progress = 0
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.u.uRes.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio())
  }

  render(dt) {
    this.u.uTime.value += dt
    this.u.uProgress.value = this.progress
    this.u.uActive.value += ((this.moved ? 1 : 0) - this.u.uActive.value) * Math.min(1, dt * 2)
    this.u.uMouse.value.lerp(this.mouse, Math.min(1, dt * 2))
    this.renderer.render(this.scene, this.camera)
  }
}
