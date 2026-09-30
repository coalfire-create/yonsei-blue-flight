import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadModel, rimChunk, sapphireEnv } from '../eagle.js'

// The Underwood statue in front of Underwood Hall, told through its real
// history. The statue does not break; the world around it changes era by
// era: a Joseon hanok village at dawn (1885), the hall rising in scaffolding
// (1915), the unveiling (1928), searchlights and crimson dark as it is taken
// for war metal (1942), Taegukgi and blossom at liberation (1948), a
// battlefield of smoke and fire (6·25), rebuilding at dawn (1955), and the
// campus tonight, where the bronze comes alive and greets you.
//
// Sculpt: public/models/underwood.glb (TRELLIS.2 from a Gemini reference;
// model units: feet at y = FEET, head top ~0.5, +z forward).

const FEET = -0.465
const PED_H = 0.9 // pedestal height, model units
const S = 2.3 // model -> scene units

export const ERAS = [
  { at: 0, year: '1885', title: '언더우드, 제물포에 닿다', body: '1885년 4월 5일, 스물다섯의 선교사 호러스 G. 언더우드가 조선 땅을 밟았다.' },
  { at: 0.1, year: '1915', title: '연희전문학교를 세우다', body: '그가 세운 조선기독교대학(연희전문)이 오늘 연세의 뿌리가 되었다.' },
  { at: 0.2, year: '1928', title: '첫 번째 동상', body: '교직원과 사회 인사들의 기부로, 두 팔을 벌려 모두를 맞이하는 동상이 세워졌다.' },
  { at: 0.34, year: '1942', title: '전쟁 물자로 끌려가다', body: '일제가 동상을 공출해 녹였다. 기단만 남았다.' },
  { at: 0.46, year: '1948', title: '두 번째 동상', body: '해방 후 다시 세운 동상. 제막식에서 김구 선생이 연설했다.' },
  { at: 0.58, year: '6·25', title: '다시 무너지다', body: '한국전쟁으로 동상은 또 한 번 파괴되었다.' },
  { at: 0.68, year: '1955', title: '세 번째 동상', body: '연희 창립 40주년, 같은 모습으로 세 번째 동상이 섰다. 오늘 우리가 보는 그 동상이다.' },
  { at: 0.82, year: 'TODAY', title: '그리고 지금, 당신을', body: '기단은 1928년 그대로, 총탄 자국까지 남아 있다. 세 번 무너져도 다시 선 사람이 두 팔을 벌려 당신을 맞이한다.' },
]

const ss = THREE.MathUtils.smoothstep
// Story time where each era's scene has settled (read while it holds).
const HOLDS = [0.05, 0.15, 0.31, 0.45, 0.565, 0.665, 0.8, 0.93]

// Per-era look: sky, fog, light, film grade. Order follows ERAS.
const LOOK = [
  { top: '#33415f', hor: '#e9b98c', fog: '#b99c82', near: 22, far: 80, amb: '#ffe9d2', ambI: 0.75, sun: '#ffcf9a', sunI: 2.4, flood: 0, sepia: 0.55, sat: 0.9, con: 1.02, cloud: 0.15 },
  { top: '#66768c', hor: '#d9d1c2', fog: '#b7b1a6', near: 20, far: 75, amb: '#f2ebe0', ambI: 0.85, sun: '#fff1d8', sunI: 1.7, flood: 0, sepia: 0.6, sat: 0.8, con: 1.0, cloud: 0.55 },
  { top: '#4f7fb4', hor: '#f1dcb8', fog: '#c8b99f', near: 26, far: 90, amb: '#fff1dc', ambI: 0.8, sun: '#ffe0b0', sunI: 2.6, flood: 10, sepia: 0.42, sat: 0.95, con: 1.03, cloud: 0.25 },
  { top: '#2e1614', hor: '#a3462a', fog: '#4a2018', near: 16, far: 62, amb: '#c08a7a', ambI: 1.0, sun: '#ff9a6a', sunI: 0.9, flood: 45, sepia: 0.25, sat: 0.55, con: 1.15, cloud: 0.7 },
  { top: '#4a8bd4', hor: '#ffe9d8', fog: '#e7dccf', near: 28, far: 95, amb: '#fff6ea', ambI: 0.9, sun: '#fff3de', sunI: 2.8, flood: 0, sepia: 0.12, sat: 1.12, con: 1.02, cloud: 0.2 },
  { top: '#3a1a12', hor: '#d65a22', fog: '#5a3222', near: 12, far: 56, amb: '#ffb07a', ambI: 0.6, sun: '#ff7a3a', sunI: 1.3, flood: 0, sepia: 0.08, sat: 0.85, con: 1.2, cloud: 1 },
  { top: '#314d7b', hor: '#f3b27a', fog: '#b9a292', near: 24, far: 85, amb: '#ffe2c4', ambI: 0.7, sun: '#ffc890', sunI: 2.1, flood: 10, sepia: 0.25, sat: 0.95, con: 1.02, cloud: 0.3 },
  { top: '#020612', hor: '#0d2a5c', fog: '#07101f', near: 25, far: 60, amb: '#5d74a8', ambI: 0.25, sun: '#9cc4ff', sunI: 0.6, flood: 90, sepia: 0, sat: 1, con: 1, cloud: 0 },
]
// Per-era presence of each layer of the world.
const LAYER = {
  hanok: [1, 0.4, 0, 0, 0, 0, 0, 0],
  hall: [0, 0.55, 1, 1, 1, 1, 1, 1],
  scaffold: [0, 1, 0, 0, 0, 0, 1, 0],
  crane: [0, 1, 0, 0, 0, 0, 0.7, 0],
  statue: [0, 0, 1, 0, 1, 0, 1, 1],
  pedestal: [0, 0, 1, 1, 1, 1, 1, 1],
  search: [0, 0, 0, 1, 0, 0, 0, 0],
  flags: [0, 0, 0, 0, 1, 0, 0, 0],
  petals: [0, 0, 0, 0, 1, 0, 0, 0],
  war: [0, 0, 0, 0, 0, 1, 0, 0],
  lamps: [0, 0, 0, 0, 0, 0, 0.3, 1],
  lawn: [0, 0, 1, 0.5, 1, 0, 0.6, 1],
  trees: [0.8, 0.4, 0.8, 0.6, 1, 0.5, 0.6, 1],
  windows: [0, 0, 0.15, 0, 0.1, 0, 0.1, 1],
}
const GROUND = ['#6b5840', '#6a5a46', '#7b7163', '#3a2a24', '#80786b', '#33241b', '#6e665a', '#0d1522']
const CANOPY = ['#2f4a2a', '#3d5234', '#3f6a32', '#2a2a1c', '#f1b9c8', '#1c1712', '#4e7a3a', '#1f3a2a']

// Head and arm hinges plus a dissolve (model units).
const hingeChunk = /* glsl */ `
  uniform float uYaw;
  uniform float uPitch;
  uniform float uArm;
  varying float vUp;
  varying vec3 vObj;
  mat3 rotY(float a){ float s = sin(a), c = cos(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
  mat3 rotX(float a){ float s = sin(a), c = cos(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  mat3 rotZ(float a){ float s = sin(a), c = cos(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
  mat3 headRot(vec3 p){ float w = smoothstep(0.33, 0.37, p.y); return rotY(uYaw * w) * rotX(uPitch * w); }
  mat3 armRot(vec3 p){
    float side = sign(p.x);
    float w = smoothstep(0.165, 0.235, abs(p.x)) * smoothstep(-0.06, 0.02, p.y) * (1.0 - smoothstep(0.3, 0.34, p.y));
    return rotZ(side * uArm * w) * rotY(-side * uArm * w * 0.35);
  }
  vec3 pose(vec3 p){
    vec3 neck = vec3(0.0, 0.345, -0.005);
    p = neck + headRot(p) * (p - neck);
    vec3 elbow = vec3(sign(p.x) * 0.19, 0.16, 0.0);
    return elbow + armRot(p) * (p - elbow);
  }
  vec3 poseN(vec3 p, vec3 n){ return armRot(p) * (headRot(p) * n); }
`
const dissolveChunk = /* glsl */ `
  uniform float uGone;
  varying vec3 vObj;
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`

function statueMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#4a4436', metalness: 1, roughness: 0.46, clearcoat: 0.2, envMapIntensity: 0.9 })
  mat.userData.rim = { value: new THREE.Color('#4facfe') }
  mat.userData.rimPower = { value: 0.8 }
  mat.userData.yaw = { value: 0 }
  mat.userData.pitch = { value: 0 }
  mat.userData.arm = { value: 0 }
  mat.userData.gone = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    for (const k of ['rim', 'rimPower', 'yaw', 'pitch', 'arm', 'gone']) shader.uniforms['u' + k[0].toUpperCase() + k.slice(1)] = mat.userData[k]
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${hingeChunk}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = poseN(position, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = pose(position);\nvUp = objectNormal.y;\nvObj = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;\nvarying float vUp;\n' + dissolveChunk)
      // Dissolve into (or gather out of) embers, from the feet up.
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float dn = n3(vObj * 22.0) * 0.7 + (vObj.y + 0.5) * 0.3;
        if (dn < uGone * 1.05) discard;`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.47, 0.4), smoothstep(0.35, 0.95, vUp) * 0.5);')
      .replace(
        '#include <dithering_fragment>',
        `float edge = 1.0 - smoothstep(uGone * 1.05, uGone * 1.05 + 0.06, dn);
        gl_FragColor.rgb += vec3(1.0, 0.55, 0.2) * edge * step(0.001, uGone) * 3.0;
        ` + rimChunk,
      )
  }
  mat.customProgramCacheKey = () => 'underwood-statue'
  return mat
}

// Underwood Hall's stone facade with windows (no ivy), as a canvas.
function facadeTexture(w, h, cols, rows, { door = false, seed = 1 } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  let r = seed
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  ctx.fillStyle = '#5b5a57'
  ctx.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 14) {
    for (let x = -(rnd() * 30); x < w; x += 18 + rnd() * 26) {
      const g = 70 + rnd() * 45
      ctx.fillStyle = `rgb(${g + 8},${g + 4},${g})`
      ctx.fillRect(x + 1, y + 1, 16 + rnd() * 24, 12)
    }
  }
  // A second canvas holds only the window glow (emissive map).
  const e = document.createElement('canvas')
  e.width = w
  e.height = h
  const ex = e.getContext('2d')
  ex.fillStyle = '#000'
  ex.fillRect(0, 0, w, h)
  const cw = w / cols
  const rh = h / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.28
      const y = j * rh + rh * 0.22
      const ww = cw * 0.44
      const hh = rh * 0.56
      if (door && j === rows - 1 && Math.abs(i - (cols - 1) / 2) < 0.6) {
        ctx.fillStyle = '#1b140c'
        ctx.beginPath()
        ctx.moveTo(x - cw * 0.1, y + hh + rh * 0.2)
        ctx.lineTo(x - cw * 0.1, y + hh * 0.3)
        ctx.arc(x + ww / 2, y + hh * 0.3, ww / 2 + cw * 0.1, Math.PI, 0)
        ctx.lineTo(x + ww + cw * 0.1, y + hh + rh * 0.2)
        ctx.fill()
        continue
      }
      ctx.fillStyle = '#8f887c'
      ctx.fillRect(x - 3, y - 3, ww + 6, hh + 6)
      ctx.fillStyle = '#161d29'
      ctx.fillRect(x, y, ww, hh)
      if (rnd() < 0.45) {
        ex.fillStyle = `rgb(${230 + rnd() * 25},${170 + rnd() * 30},${100 + rnd() * 30})`
        ex.fillRect(x, y, ww, hh)
      }
      for (const cc of [ctx, ex]) {
        cc.fillStyle = cc === ctx ? '#8f887c' : '#000'
        cc.fillRect(x + ww / 2 - 1.5, y, 3, hh)
        cc.fillRect(x, y + hh * 0.45, ww, 3)
      }
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const glow = new THREE.CanvasTexture(e)
  glow.colorSpace = THREE.SRGBColorSpace
  return { tex, glow }
}

const skyFrag = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uTop, uHor;
  uniform float uCloud, uTime;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec3 c = mix(uHor, uTop, smoothstep(0.0, 1.15, vUv.y));
    float cl = fbm(vec2(vUv.x * 3.0 + uTime * 0.02, vUv.y * 5.0 - uTime * 0.01));
    c = mix(c, mix(uHor, uTop, 0.55) * 0.7, smoothstep(0.45, 0.85, cl) * uCloud * 0.8);
    gl_FragColor = vec4(c, 1.0);
  }
`

// Soft round sprite.
function dotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// A tiny particle system: per-point size, alpha and colour, updated on the CPU.
class Particles {
  constructor(n, { additive = false, tex }) {
    this.n = n
    this.pos = new Float32Array(n * 3).fill(-999)
    this.vel = new Float32Array(n * 3)
    this.life = new Float32Array(n)
    this.max = new Float32Array(n).fill(1)
    this.size = new Float32Array(n)
    this.alpha = new Float32Array(n)
    this.col = new Float32Array(n * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3))
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uScale: { value: 300 } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float uScale;
          void main(){ vA = aAlpha; vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uTex; varying float vA; varying vec3 vC;
          void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); }`,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    )
    this.points.frustumCulled = false
    this.next = 0
  }
  spawn(p, v, life, col) {
    const i = this.next++ % this.n
    this.pos.set(p, i * 3)
    this.vel.set(v, i * 3)
    this.life[i] = this.max[i] = life
    this.col.set(col, i * 3)
    return i
  }
  // shape(t 0..1 of life) -> [size, alpha]
  update(dt, shape, gravity = 0, drift = 0, time = 0) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const t = 1 - this.life[i] / this.max[i]
      this.vel[i * 3 + 1] += gravity * dt
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(time * 1.3 + i) * drift) * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(time * 1.1 + i * 0.7) * drift) * dt
      const [s, a] = shape(t, i)
      this.size[i] = s
      this.alpha[i] = a
    }
    const g = this.points.geometry.attributes
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = g.aCol.needsUpdate = true
  }
}

// Curved hanok roof: a slab with a ridge and upturned eaves.
function hanokRoof(W, D, h) {
  const g = new THREE.BoxGeometry(W, 0.22, D, 18, 1, 8)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const xn = p.getX(i) / (W / 2)
    const zn = p.getZ(i) / (D / 2)
    p.setY(i, p.getY(i) + h * (1 - Math.abs(zn)) - h * 0.25 * zn * zn + 0.45 * Math.pow(Math.abs(xn), 4) + 0.25 * Math.pow(Math.abs(zn), 4))
  }
  g.computeVertexNormals()
  return g
}

// Taegukgi (simplified but correct in layout), as a canvas texture.
function taegukgi() {
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#fbfbf7'
  g.fillRect(0, 0, 384, 256)
  const cx = 192
  const cy = 128
  const R = 48
  g.save()
  g.translate(cx, cy)
  g.rotate(Math.atan2(2, 3)) // the circle's axis follows the diagonal
  g.fillStyle = '#c60c30'
  g.beginPath()
  g.arc(0, 0, R, Math.PI, 0)
  g.arc(R / 2, 0, R / 2, 0, Math.PI, false)
  g.arc(-R / 2, 0, R / 2, 0, Math.PI, true)
  g.fill()
  g.fillStyle = '#003478'
  g.beginPath()
  g.arc(0, 0, R, 0, Math.PI)
  g.arc(-R / 2, 0, R / 2, Math.PI, 0, false)
  g.arc(R / 2, 0, R / 2, Math.PI, 0, true)
  g.fill()
  g.restore()
  // Trigrams: 건 (top-left), 곤 (bottom-right), 감 (top-right), 리 (bottom-left).
  const tri = (ang, bars) => {
    g.save()
    g.translate(cx + Math.cos(ang) * 92, cy + Math.sin(ang) * 92)
    g.rotate(ang + Math.PI / 2)
    g.fillStyle = '#111'
    bars.forEach((broken, k) => {
      const y = -18 + k * 14
      if (broken) {
        g.fillRect(-24, y, 21, 9)
        g.fillRect(3, y, 21, 9)
      } else g.fillRect(-24, y, 48, 9)
    })
    g.restore()
  }
  const a = Math.atan2(2, 3)
  tri(Math.PI + a, [0, 0, 0])
  tri(a, [1, 1, 1])
  tri(-a, [1, 0, 1])
  tri(Math.PI - a, [0, 1, 0])
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Underwood {
  constructor(canvas) {
    this.canvas = canvas
    this.mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.env = sapphireEnv(this.renderer)
    this.scene.fog = new THREE.Fog('#07101f', 25, 60)
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300)
    this.progress = 0
    this.time = 0
    this.pointer = new THREE.Vector2()
    this.look = new THREE.Vector2()
    this.w = new Float32Array(8)
    this.dot = dotTexture()

    this.skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uCloud: { value: 0 }, uTime: { value: 0 } }
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: skyFrag, uniforms: this.skyU, depthWrite: false }),
    )
    sky.frustumCulled = false
    sky.renderOrder = -1
    this.scene.add(sky)

    this.#buildGround()
    this.#buildMountains()
    this.#buildHall()
    this.#buildPedestal()
    this.#buildTrees()
    this.#buildHanok()
    this.#buildConstruction()
    this.#buildSearchlights()
    this.#buildLiberation()
    this.#buildWar()
    this.#buildLamps()
    this.#buildLights()

    this.statue = new THREE.Group()
    this.statue.scale.setScalar(S)
    this.statue.position.y = (PED_H - FEET) * S
    this.scene.add(this.statue)
    this.mat = statueMaterial()
    this.mat.envMap = this.env
    loadModel('/models/underwood.glb').then((geo) => {
      this.mesh = new THREE.Mesh(geo, this.mat)
      this.statue.add(this.mesh)
    })
    // Embers shed while the statue dissolves or gathers.
    this.embers = new Particles(260, { additive: true, tex: this.dot })
    this.scene.add(this.embers.points)

    // Greeting ripple along the plaza.
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), new THREE.MeshBasicMaterial({ color: '#ffd59a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.ripple.rotation.x = -Math.PI / 2
    this.ripple.position.y = 0.03
    this.scene.add(this.ripple)
    this.greetT = 99

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.8))
    this.composer.addPass(new OutputPass())

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    })
    canvas.addEventListener('click', (e) => this.alive > 0.6 && this.#hit(e) && this.greet())
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #buildGround() {
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#0d1522', roughness: 0.97 })
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)
    // The round lawn and curb around the statue (as in the 1920s photos).
    this.lawnMat = new THREE.MeshStandardMaterial({ color: '#12261b', roughness: 1, transparent: true })
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), this.lawnMat)
    lawn.rotation.x = -Math.PI / 2
    lawn.position.y = 0.01
    this.curb = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.07, 6, 96), new THREE.MeshStandardMaterial({ color: '#9b978f', roughness: 0.9 }))
    this.curb.rotation.x = Math.PI / 2
    this.curb.position.y = 0.04
    this.scene.add(lawn, this.curb)
  }

  // 안산 behind the campus, in every era.
  #buildMountains() {
    const m = new THREE.MeshStandardMaterial({ color: '#2c3a2a', roughness: 1, flatShading: true })
    for (const [x, z, sx, sy] of [[-40, -95, 60, 26], [25, -110, 70, 34], [80, -90, 50, 20], [-95, -80, 50, 18]]) {
      const g = new THREE.IcosahedronGeometry(1, 2)
      g.scale(sx, sy, 22)
      const hill = new THREE.Mesh(g, m)
      hill.position.set(x, -2, z)
      this.scene.add(hill)
    }
  }

  #buildHall() {
    const hall = new THREE.Group()
    hall.position.z = -24
    const { tex: wingTex, glow: wingGlow } = facadeTexture(1024, 256, 9, 3, { seed: 7 })
    const { tex: towerTex, glow: towerGlow } = facadeTexture(256, 512, 2, 5, { door: true, seed: 3 })
    this.hallMats = []
    const stone = (tex, glow) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0, color: '#8a8a8a', roughness: 0.95 })
      this.hallMats.push(m)
      return m
    }
    const roofMat = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.8 })
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 9), stone(wingTex, wingGlow))
      wing.position.set(side * 11.5, 4.5, 0)
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.2, 17.2, 4, 1), roofMat)
      roof.rotation.z = Math.PI / 2
      roof.rotation.x = Math.PI / 4
      roof.scale.set(1, 1, 0.5)
      roof.position.set(side * 11.5, 10.6, 0)
      hall.add(wing, roof)
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 7), stone(towerTex, towerGlow))
    tower.position.set(0, 8, 1)
    hall.add(tower)
    const merlon = new THREE.BoxGeometry(0.9, 1, 0.9)
    const mm = new THREE.MeshStandardMaterial({ color: '#5f5d58', roughness: 0.95 })
    for (let i = 0; i < 4; i++) {
      for (const z of [-2.0, 4.0]) {
        const m = new THREE.Mesh(merlon, mm)
        m.position.set(-2.55 + i * 1.7, 16.5, z)
        hall.add(m)
      }
    }
    this.hall = hall
    this.scene.add(hall)
  }

  #buildPedestal() {
    const g = new THREE.Group()
    const granite = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.85 })
    const u = S
    const box = (w, h, d, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, d * u), granite)
      m.position.y = y * u
      g.add(m)
      return m
    }
    box(0.95, 0.08, 0.95, 0.04)
    box(0.78, 0.12, 0.78, 0.14)
    box(0.56, 0.56, 0.56, 0.48)
    box(0.7, 0.06, 0.7, 0.79)
    box(0.6, 0.05, 0.6, 0.875)
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.26 * u, 0.34 * u), new THREE.MeshStandardMaterial({ color: '#3b3a31', metalness: 0.9, roughness: 0.45 }))
    plaque.position.set(0, 0.48 * u, 0.281 * u)
    g.add(plaque)
    // Pockmarks said to be bullet scars, left on the 1928 pedestal.
    const dent = new THREE.CircleGeometry(0.012 * u, 10)
    const dm = new THREE.MeshStandardMaterial({ color: '#4a4843', roughness: 1 })
    for (const [x, y] of [[-0.2, 0.62], [-0.17, 0.35], [0.19, 0.28], [0.22, 0.58], [-0.08, 0.24], [0.15, 0.7]]) {
      const d = new THREE.Mesh(dent, dm)
      d.position.set(x * u, y * u, 0.2811 * u)
      g.add(d)
    }
    this.pedestal = g
    this.scene.add(g)
  }

  // Round trees flanking the plaza; their canopy follows the season/era.
  #buildTrees() {
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6)
    trunk.translate(0, 1.5, 0)
    const crown = new THREE.IcosahedronGeometry(2, 1)
    crown.translate(0, 4.2, 0)
    this.canopy = new THREE.MeshStandardMaterial({ color: '#3f6a32', roughness: 0.9, flatShading: true })
    const bark = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 1 })
    this.trees = new THREE.Group()
    for (const [x, z, s] of [[-9, -6, 1.1], [9, -7, 1], [-13, 2, 0.9], [13, 1, 1.05], [-6, -14, 0.9], [7, -15, 1], [-17, -12, 1.2], [18, -13, 1.1]]) {
      const t = new THREE.Group()
      t.add(new THREE.Mesh(trunk, bark), new THREE.Mesh(crown, this.canopy))
      t.position.set(x, 0, z)
      t.scale.setScalar(s)
      t.userData.s = s
      this.trees.add(t)
    }
    this.scene.add(this.trees)
  }

  // 1885: a Joseon hamlet with tiled hanok roofs, pines and stone walls.
  #buildHanok() {
    const g = new THREE.Group()
    const wall = new THREE.MeshStandardMaterial({ color: '#e6ddca', roughness: 0.95 })
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3222', roughness: 0.9 })
    const tile = new THREE.MeshStandardMaterial({ color: '#3b3f45', roughness: 0.7 })
    const stoneM = new THREE.MeshStandardMaterial({ color: '#8b8477', roughness: 1 })
    const house = (W, D) => {
      const h = new THREE.Group()
      const base = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.5, D * 0.8), stoneM)
      base.position.y = 0.25
      const body = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 1.9, D * 0.62), wall)
      body.position.y = 1.45
      h.add(base, body)
      for (let i = 0; i <= 4; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.16), wood)
        post.position.set(-W * 0.39 + (i * W * 0.78) / 4, 1.45, D * 0.31 + 0.02)
        h.add(post)
      }
      const roof = new THREE.Mesh(hanokRoof(W * 1.15, D * 1.05, 0.9), tile)
      roof.position.y = 2.55
      h.add(roof)
      return h
    }
    for (const [x, z, r, s] of [[-13, -12, 0.3, 1.2], [-21, -20, -0.2, 1.4], [12, -13, -0.35, 1.25], [20, -21, 0.2, 1.4], [-6, -26, 0.1, 1.5], [7, -28, -0.1, 1.3], [26, -9, -0.6, 1.1], [-26, -7, 0.5, 1.1]]) {
      const h = house(5, 3.4)
      h.position.set(x, 0, z)
      h.rotation.y = r
      h.scale.setScalar(s)
      g.add(h)
    }
    // Low stone walls around the yards.
    for (const [x, z, len, r] of [[-11, -3, 9, 0.2], [11, -4, 10, -0.2], [0, -17, 14, 0]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.5), stoneM)
      w.position.set(x, 0.45, z)
      w.rotation.y = r
      g.add(w)
    }
    // Pines.
    const needle = new THREE.MeshStandardMaterial({ color: '#233a24', roughness: 1, flatShading: true })
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Group()
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.4 - k * 0.3, 1.6, 7), needle)
        c.position.y = 3 + k * 0.9
        p.add(c)
      }
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3.2, 5), wood)
      tr.position.y = 1.6
      p.add(tr)
      const a = Math.PI + (i / 15) * Math.PI
      p.position.set(Math.cos(a) * (24 + (i % 3) * 6), 0, -6 + Math.sin(a) * (14 + (i % 2) * 8))
      p.rotation.z = Math.sin(i) * 0.15
      g.add(p)
    }
    this.hanok = g
    this.scene.add(g)
  }

  // 1915 / 1955: timber scaffolding over the hall and a tower crane.
  #buildConstruction() {
    const parts = []
    const pole = (x, y, z, w, h, d) => {
      const b = new THREE.BoxGeometry(w, h, d)
      b.translate(x, y, z)
      parts.push(b)
    }
    const zf = -19.2
    for (let x = -20; x <= 20; x += 2.5) pole(x, 7, zf, 0.14, 14, 0.14)
    for (let y = 2; y <= 13; y += 2.2) pole(0, y, zf, 41, 0.12, 0.12)
    for (let x = -20; x < 20; x += 5) {
      const b = new THREE.BoxGeometry(0.08, 7.2, 0.08)
      b.rotateZ(0.62)
      b.translate(x + 2.5, 6, zf + 0.05)
      parts.push(b)
    }
    // Plank decks.
    for (let y = 4.2; y <= 13; y += 4.4) pole(0, y, zf + 0.6, 41, 0.08, 1.2)
    this.scaffold = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 }))
    this.scene.add(this.scaffold)

    const crane = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({ color: '#b08a36', roughness: 0.6, metalness: 0.3 })
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.9, 28, 0.9), steel)
    mast.position.y = 14
    const jib = new THREE.Group()
    jib.position.y = 28
    const arm = new THREE.Mesh(new THREE.BoxGeometry(26, 0.7, 0.7), steel)
    arm.position.x = 7
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 4), new THREE.MeshBasicMaterial({ color: '#222' }))
    cable.position.set(15, -6, 0)
    const load = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1), new THREE.MeshStandardMaterial({ color: '#7c7468' }))
    load.position.set(15, -12, 0)
    jib.add(arm, cable, load)
    crane.add(mast, jib)
    crane.position.set(16, 0, -32)
    this.crane = crane
    this.jib = jib
    this.scene.add(crane)
  }

  // 1942: searchlights sweeping a crimson night.
  #buildSearchlights() {
    this.beams = []
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(
        new THREE.ConeGeometry(3.2, 70, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      )
      b.geometry.translate(0, -35, 0)
      b.position.set(-22 + i * 22, 0.5, -36)
      this.beams.push(b)
      this.scene.add(b)
    }
  }

  // 1948: Taegukgi on poles and falling blossom.
  #buildLiberation() {
    const tex = taegukgi()
    const flagMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 })
    this.flagT = { value: 0 }
    flagMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.flagT
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat k = (position.x + 1.2) / 2.4;\ntransformed.z += sin(position.x * 2.6 - uT * 5.0) * 0.22 * k;\ntransformed.y += sin(position.x * 1.7 - uT * 3.0) * 0.06 * k;')
    }
    const pm = new THREE.MeshStandardMaterial({ color: '#d8d4cc', metalness: 0.6, roughness: 0.4 })
    this.flags = new THREE.Group()
    for (const [x, z] of [[-8, -11], [8, -11], [-13, -15], [13, -15]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), pm)
      pole.position.set(x, 3.5, z)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 24, 8), flagMat)
      flag.position.set(x + 1.25, 6.1, z)
      this.flags.add(pole, flag)
    }
    this.scene.add(this.flags)
    this.petals = new Particles(360, { tex: this.dot })
    this.scene.add(this.petals.points)
  }

  // 6·25: smoke columns, fires, craters, sandbags and barbed wire.
  #buildWar() {
    const g = new THREE.Group()
    const scorch = new THREE.MeshStandardMaterial({ color: '#15110e', roughness: 1 })
    for (const [x, z, r] of [[-8, 3, 2.2], [9, -2, 2.8], [-15, -10, 3.2], [15, -14, 2.4], [3, 7, 1.6]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 24), scorch)
      c.rotation.x = -Math.PI / 2
      c.position.set(x, 0.02, z)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 5, 24), new THREE.MeshStandardMaterial({ color: '#3b2a1f', roughness: 1 }))
      rim.rotation.x = Math.PI / 2
      rim.scale.z = 0.4
      rim.position.set(x, 0.05, z)
      g.add(c, rim)
    }
    // Sandbag walls.
    const bag = new THREE.CapsuleGeometry(0.28, 0.6, 3, 6)
    bag.rotateZ(Math.PI / 2)
    bag.scale(1, 0.55, 0.8)
    const bags = []
    for (const [x0, z0, n, r] of [[-10, 6, 9, 0.15], [6, 7, 8, -0.2], [-18, -2, 7, 0.9]]) {
      for (let k = 0; k < n; k++) {
        for (let row = 0; row < 3; row++) {
          const b = bag.clone()
          b.translate(k * 0.9 + (row % 2) * 0.45, 0.2 + row * 0.33, 0)
          b.rotateY(r)
          b.translate(x0, 0, z0)
          bags.push(b)
        }
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(bags), new THREE.MeshStandardMaterial({ color: '#7d6d4f', roughness: 1 })))
    // Barbed-wire line: X posts and a coiled wire.
    const wire = []
    for (let k = 0; k < 10; k++) {
      const x = -16 + k * 3.6
      for (const r of [0.5, -0.5]) {
        const p = new THREE.BoxGeometry(0.08, 1.6, 0.08)
        p.rotateZ(r)
        p.translate(x, 0.7, 10)
        wire.push(p)
      }
    }
    const coil = new THREE.TorusGeometry(0.5, 0.02, 4, 12)
    for (let k = 0; k < 60; k++) {
      const c = coil.clone()
      c.rotateY(Math.PI / 2)
      c.translate(-16 + k * 0.55, 0.55, 10)
      wire.push(c)
    }
    g.add(new THREE.Mesh(mergeGeometries(wire.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => (q.deleteAttribute('uv'), q))), new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.8, metalness: 0.4 })))
    // Rubble.
    const rubble = []
    for (let k = 0; k < 60; k++) {
      const r = new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.5, 0)
      const a = Math.random() * Math.PI * 2
      const d = 5 + Math.random() * 16
      r.translate(Math.cos(a) * d, 0.1, -6 + Math.sin(a) * d * 0.7)
      rubble.push(r)
    }
    g.add(new THREE.Mesh(mergeGeometries(rubble), new THREE.MeshStandardMaterial({ color: '#5b544b', roughness: 1, flatShading: true })))
    this.war = g
    this.scene.add(g)

    this.fires = [[-9, 0.3, 3], [15, 0.3, -14], [-15, 0.3, -10], [-6, 9.5, -19.4], [10, 5, -19.4], [2, 13, -18.5]]
    this.fireLights = [new THREE.PointLight('#ff7a2a', 0, 30, 1.6), new THREE.PointLight('#ff5a1a', 0, 30, 1.6)]
    this.fireLights[0].position.set(-9, 2, 3)
    this.fireLights[1].position.set(10, 6, -16)
    this.scene.add(...this.fireLights)
    this.smoke = new Particles(220, { tex: this.dot })
    this.flames = new Particles(260, { additive: true, tex: this.dot })
    this.ash = new Particles(240, { additive: true, tex: this.dot })
    this.scene.add(this.smoke.points, this.flames.points, this.ash.points)
    this.flash = 0
  }

  // Today: lamp posts round the plaza.
  #buildLamps() {
    this.lamps = new THREE.Group()
    const post = new THREE.MeshStandardMaterial({ color: '#1b1f26', metalness: 0.6, roughness: 0.4 })
    this.lampGlow = new THREE.SpriteMaterial({ map: this.dot, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.15 + (k / 5) * 0.7) + Math.PI
      const l = new THREE.Group()
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), post)
      p.position.y = 1.8
      const bulb = new THREE.Sprite(this.lampGlow)
      bulb.position.y = 3.7
      bulb.scale.setScalar(0.55)
      l.add(p, bulb)
      l.position.set(Math.cos(a) * 6.5, 0, -Math.sin(a) * 6.5 - 1)
      this.lamps.add(l)
    }
    this.scene.add(this.lamps)
  }

  #buildLights() {
    this.amb = new THREE.HemisphereLight('#5d74a8', '#2a2016', 0.25)
    this.sun = new THREE.DirectionalLight('#9cc4ff', 0.6)
    this.sun.position.set(-8, 10, 6)
    this.flood = new THREE.SpotLight('#ffd7a0', 90, 40, 0.18, 0.7)
    this.flood.position.set(3, 7, 9)
    this.flood.target.position.set(0, 3.2, 0)
    this.flood2 = new THREE.SpotLight('#bfe0ff', 35, 40, 0.2, 0.8)
    this.flood2.position.set(-5, 6, 6)
    this.flood2.target.position.set(0, 3.4, 0)
    this.scene.add(this.amb, this.sun, this.flood, this.flood.target, this.flood2, this.flood2.target)
  }

  #hit(e) {
    const r = this.canvas.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
    return ray.intersectObjects([this.statue, this.pedestal], true).length > 0
  }

  // Wave of welcome: arms lift higher, a nod, a warm ripple across the plaza.
  greet() {
    this.greetT = 0
    this.onGreet?.()
  }

  headScreen() {
    const v = new THREE.Vector3(0, 0.5, 0).applyMatrix4(this.statue.matrixWorld).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight }
  }

  // Scroll -> story time. Each era holds still for most of its stretch of
  // scroll so it can be read, then eases through the change to the next.
  pace(raw) {
    const n = HOLDS.length
    const f = THREE.MathUtils.clamp(raw, 0, 1) * n
    const k = Math.min(n - 1, Math.floor(f))
    const t = f - k
    if (k === n - 1) return HOLDS[k] + (1 - HOLDS[k]) * t
    const move = THREE.MathUtils.smootherstep(t, 0.55, 1)
    return HOLDS[k] + (HOLDS[k + 1] - HOLDS[k]) * move
  }

  era() {
    let i = 0
    ERAS.forEach((e, k) => this.progress >= e.at && (i = k))
    return i
  }

  // How much of each era is on screen now (two neighbours cross-fade).
  weights() {
    const p = this.progress
    const w = this.w.fill(0)
    if (p <= HOLDS[0]) w[0] = 1
    else if (p >= HOLDS.at(-1)) w[7] = 1
    else {
      let k = 0
      while (p > HOLDS[k + 1]) k++
      const t = THREE.MathUtils.smootherstep((p - HOLDS[k]) / (HOLDS[k + 1] - HOLDS[k]), 0, 1)
      w[k] = 1 - t
      w[k + 1] = t
    }
    return w
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 56 : 38
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const w = this.weights()
    const mix = (arr) => arr.reduce((s, v, i) => s + v * w[i], 0)
    const col = (key, out) => {
      out.setRGB(0, 0, 0)
      const c = new THREE.Color()
      LOOK.forEach((L, i) => w[i] && out.add(c.set(L[key]).multiplyScalar(w[i])))
      return out
    }
    const num = (key) => LOOK.reduce((s, L, i) => s + L[key] * w[i], 0)
    const colOf = (arr, out) => {
      out.setRGB(0, 0, 0)
      const c = new THREE.Color()
      arr.forEach((v, i) => w[i] && out.add(c.set(v).multiplyScalar(w[i])))
      return out
    }

    // Sky, fog, light and film grade.
    col('top', this.skyU.uTop.value)
    col('hor', this.skyU.uHor.value)
    this.skyU.uCloud.value = num('cloud')
    this.skyU.uTime.value = this.time
    col('fog', this.scene.fog.color)
    this.scene.fog.near = num('near')
    this.scene.fog.far = num('far')
    col('amb', this.amb.color)
    this.amb.intensity = num('ambI')
    col('sun', this.sun.color)
    this.sun.intensity = num('sunI')
    this.flood.intensity = num('flood')
    this.flood2.intensity = num('flood') * 0.4
    this.canvas.style.filter = `sepia(${num('sepia').toFixed(3)}) saturate(${num('sat').toFixed(3)}) contrast(${num('con').toFixed(3)})`
    this.grain = num('sepia') * 0.6 + mix(LAYER.war) * 0.3

    colOf(GROUND, this.groundMat.color)
    const lawn = mix(LAYER.lawn)
    this.lawnMat.opacity = lawn
    this.curb.visible = lawn > 0.02
    colOf(CANOPY, this.canopy.color)

    // Layers grow out of / sink into the ground as eras change.
    const grow = (obj, k) => {
      obj.visible = k > 0.01
      obj.scale.y = Math.max(0.001, k)
    }
    const hallK = mix(LAYER.hall)
    grow(this.hall, hallK)
    const windows = mix(LAYER.windows)
    const scorch = mix(LAYER.war)
    for (const m of this.hallMats) {
      m.emissiveIntensity = windows * 0.6
      m.color.setScalar(0.54 * (1 - scorch * 0.55))
    }
    grow(this.hanok, mix(LAYER.hanok))
    grow(this.scaffold, mix(LAYER.scaffold))
    grow(this.crane, mix(LAYER.crane))
    this.jib.rotation.y = Math.sin(this.time * 0.15) * 0.6
    const ped = mix(LAYER.pedestal)
    this.pedestal.position.y = (ped - 1) * PED_H * S
    this.pedestal.visible = ped > 0.001
    const treeK = mix(LAYER.trees)
    this.trees.children.forEach((t) => {
      t.visible = treeK > 0.01
      t.scale.setScalar(t.userData.s * Math.max(0.001, treeK))
    })
    grow(this.flags, mix(LAYER.flags))
    this.flagT.value = this.time
    const lampK = mix(LAYER.lamps)
    grow(this.lamps, lampK)
    this.lampGlow.opacity = lampK * 0.8
    grow(this.war, scorch)

    const search = mix(LAYER.search)
    this.beams.forEach((b, i) => {
      b.visible = search > 0.01
      b.material.opacity = search * 0.22
      // Apex on the ground behind the hall, sweeping the sky.
      b.rotation.set(Math.PI + 0.35 + Math.sin(this.time * 0.37 + i) * 0.15, 0, Math.sin(this.time * 0.5 + i * 2.1) * 0.55)
    })

    // Statue: gathers out of, or dissolves into, embers.
    const present = mix(LAYER.statue)
    const gone = 1 - present
    const prevGone = this.mat.userData.gone.value
    this.mat.userData.gone.value = gone
    if (this.mesh) this.mesh.visible = gone < 0.995
    const change = Math.abs(gone - prevGone) / Math.max(dt, 1e-3)
    const e = this.embers
    for (let q = 0; q < Math.min(8, change * 40); q++) {
      const y = (PED_H + Math.random() * 1) * S
      e.spawn([(Math.random() - 0.5) * 1.6, y, (Math.random() - 0.5) * 0.8], [(Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6], 1.2 + Math.random(), [1, 0.6, 0.25])
    }
    e.update(dt, (t) => [0.25 * (1 - t), (1 - t) * 0.9], 0, 0.3, this.time)

    // Blossom.
    const petal = mix(LAYER.petals)
    for (let q = 0; q < petal * 3; q++)
      this.petals.spawn([(Math.random() - 0.5) * 40, 12 + Math.random() * 4, -12 + (Math.random() - 0.5) * 24], [0.6 + Math.random() * 0.4, -0.9 - Math.random() * 0.5, 0], 9, [1, 0.8, 0.86])
    this.petals.update(dt, (t) => [0.22, petal * Math.min(1, t * 6) * (1 - t)], 0, 0.8, this.time)

    // War: smoke, flames, ash, flicker and distant flashes.
    const war = scorch
    if (war > 0.01) {
      for (const [x, y, z] of this.fires) {
        if (Math.random() < war * 0.9) this.flames.spawn([x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 0.6], [(Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.5, 0], 0.7 + Math.random() * 0.5, [1, 0.45 + Math.random() * 0.2, 0.12])
        if (Math.random() < war * 0.35) this.smoke.spawn([x + (Math.random() - 0.5), y + 1.5, z], [0.4 + Math.random() * 0.3, 1.5 + Math.random(), 0], 7, [0.12, 0.1, 0.09])
      }
      for (let q = 0; q < war * 2; q++) this.ash.spawn([(Math.random() - 0.5) * 40, 14, -10 + (Math.random() - 0.5) * 30], [(Math.random() - 0.5) * 0.5, -1 - Math.random(), 0], 10, [1, 0.5, 0.2])
      if (Math.random() < dt * 0.35 * war) this.flash = 1
    }
    this.flames.update(dt, (t) => [1.4 * (1 - t) + 0.2, war * (1 - t)], 0, 0.4, this.time)
    this.smoke.update(dt, (t) => [3 + t * 9, war * 0.55 * Math.min(1, t * 4) * (1 - t)], 0, 0.3, this.time)
    this.ash.update(dt, (t) => [0.12, war * (1 - t) * 0.9], 0, 0.6, this.time)
    this.flash = Math.max(0, this.flash - dt * 2.5)
    const flick = 0.7 + Math.sin(this.time * 17) * 0.15 + Math.sin(this.time * 7.3) * 0.15
    this.fireLights.forEach((l) => (l.intensity = war * 60 * flick))
    this.amb.intensity += this.flash * 1.8 * war

    // Camera: a slow arc through the years, settling face to face today;
    // a faint tremor in the war.
    this.alive = ss(this.progress, 0.82, 0.9)
    const a = (1 - this.alive) * Math.sin(this.progress * Math.PI * 2) * 0.3
    const dist = this.portrait ? 15 : 11.5
    const shake = war * (0.03 + this.flash * 0.12)
    this.camera.position.set(Math.sin(a) * dist + (Math.random() - 0.5) * shake, 1.8 + this.alive * 0.2 + (Math.random() - 0.5) * shake, Math.cos(a) * dist)
    this.camera.lookAt(0, this.portrait ? 3.8 : 3.4, 0)

    if (this.mesh) {
      // Alive: eyes on the pointer, arms opening wider to welcome.
      this.greetT += dt
      const g = this.greetT < 2.4 ? Math.sin((this.greetT / 2.4) * Math.PI) : 0
      this.look.lerp(this.pointer, Math.min(1, dt * 4))
      const u = this.mat.userData
      u.yaw.value = this.alive * THREE.MathUtils.clamp(this.look.x * 0.6, -0.6, 0.6)
      u.pitch.value = this.alive * (THREE.MathUtils.clamp(-this.look.y * 0.3, -0.25, 0.3) + g * 0.18 * Math.sin(this.greetT * 6))
      u.arm.value = this.alive * (0.35 + Math.sin(this.time * 1.3) * 0.03 + g * 0.55)
      u.rimPower.value = 0.4 + this.alive * 0.6 + g * 0.8
    }
    const rp = this.greetT / 2.4
    this.ripple.material.opacity = rp < 1 ? (1 - rp) * 0.8 : 0
    this.ripple.scale.setScalar(1 + rp * 12)
    this.composer.render()
  }
}
