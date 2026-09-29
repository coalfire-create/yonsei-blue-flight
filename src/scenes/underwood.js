import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { loadModel, rimChunk, sapphireEnv, shardGeometry, shardMaterial } from '../eagle.js'

// The Underwood statue in front of Underwood Hall, told through its real
// history: raised in 1928, taken for war metal in 1942, rebuilt in 1948,
// destroyed in the Korean War, raised a third time in 1955 on the same 1928
// pedestal. Scroll drives the timeline; at "today" the bronze comes alive,
// follows the pointer with its eyes and opens its arms to greet you.
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

// Head and arm hinges in the vertex shader (model units).
const hingeChunk = /* glsl */ `
  uniform float uYaw;
  uniform float uPitch;
  uniform float uArm;
  varying float vUp;
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

function statueMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#4a4436', metalness: 1, roughness: 0.46, clearcoat: 0.2, envMapIntensity: 0.9 })
  mat.userData.rim = { value: new THREE.Color('#4facfe') }
  mat.userData.rimPower = { value: 0.8 }
  mat.userData.yaw = { value: 0 }
  mat.userData.pitch = { value: 0 }
  mat.userData.arm = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    for (const k of ['rim', 'rimPower', 'yaw', 'pitch', 'arm']) shader.uniforms['u' + k[0].toUpperCase() + k.slice(1)] = mat.userData[k]
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${hingeChunk}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = poseN(position, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = pose(position);\nvUp = objectNormal.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;\nvarying float vUp;')
      // Old bronze: dark, with a verdigris bloom on the upward faces.
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.47, 0.4), smoothstep(0.35, 0.95, vUp) * 0.5);')
      .replace('#include <dithering_fragment>', rimChunk)
  }
  mat.customProgramCacheKey = () => 'underwood-statue'
  return mat
}

// Underwood Hall's stone facade with lit windows (no ivy), as a canvas.
function facadeTexture(w, h, cols, rows, { door = false, seed = 1 } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  let r = seed
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  ctx.fillStyle = '#5b5a57'
  ctx.fillRect(0, 0, w, h)
  // Rubble stone: irregular blocks in grey-brown tones.
  for (let y = 0; y < h; y += 14) {
    for (let x = -(rnd() * 30); x < w; x += 18 + rnd() * 26) {
      const g = 70 + rnd() * 45
      ctx.fillStyle = `rgb(${g + 8},${g + 4},${g})`
      ctx.fillRect(x + 1, y + 1, 16 + rnd() * 24, 12)
    }
  }
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
      ctx.fillStyle = '#d8d2c4'
      ctx.fillRect(x - 3, y - 3, ww + 6, hh + 6)
      const lit = rnd() < 0.55
      ctx.fillStyle = lit ? `rgb(255,${200 + rnd() * 30},${120 + rnd() * 40})` : '#1a2230'
      ctx.fillRect(x, y, ww, hh)
      ctx.fillStyle = '#d8d2c4'
      ctx.fillRect(x + ww / 2 - 1.5, y, 3, hh)
      ctx.fillRect(x, y + hh * 0.45, ww, 3)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

const skyFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uWarm;
  void main(){
    vec3 top = vec3(0.01, 0.025, 0.07);
    vec3 hor = mix(vec3(0.05, 0.16, 0.36), vec3(0.45, 0.22, 0.12), uWarm);
    gl_FragColor = vec4(mix(hor, top, smoothstep(0.05, 0.75, vUv.y)), 1.0);
  }
`

export class Underwood {
  constructor(canvas) {
    this.canvas = canvas
    this.mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    // Reflections only on the bronze; the stone and plaza take real light.
    this.env = sapphireEnv(this.renderer)
    this.scene.fog = new THREE.Fog('#07101f', 25, 60)
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
    this.progress = 0
    this.time = 0
    this.pointer = new THREE.Vector2()
    this.look = new THREE.Vector2()

    this.skyU = { uWarm: { value: 0 } }
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: skyFrag, uniforms: this.skyU, depthWrite: false, fog: false }),
    )
    sky.frustumCulled = false
    sky.renderOrder = -1
    this.scene.add(sky)

    this.#buildPlaza()
    this.#buildHall()
    this.#buildPedestal()
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
      this.shardMat = shardMaterial(this.mat, S)
      this.shardMat.envMap = this.env
      this.shardMat.userData.floor.value = FEET
      this.shards = new THREE.Mesh(shardGeometry(this.statue), this.shardMat)
      this.shards.visible = false
      this.statue.add(this.shards)
    })

    // Greeting ripple along the plaza.
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), new THREE.MeshBasicMaterial({ color: '#ffd59a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.ripple.rotation.x = -Math.PI / 2
    this.ripple.position.y = 0.03
    this.scene.add(this.ripple)
    this.greetT = 99

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.78))
    this.composer.addPass(new OutputPass())

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    })
    canvas.addEventListener('click', (e) => this.alive > 0.6 && this.#hit(e) && this.greet())
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #buildPlaza() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: '#0d1522', roughness: 0.95 }))
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)
    // The round lawn and curb around the statue (as in the 1920s photos).
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ color: '#12261b', roughness: 1 }))
    lawn.rotation.x = -Math.PI / 2
    lawn.position.y = 0.01
    const curb = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.07, 6, 96), new THREE.MeshStandardMaterial({ color: '#9b978f', roughness: 0.9 }))
    curb.rotation.x = Math.PI / 2
    curb.position.y = 0.04
    this.scene.add(lawn, curb)
  }

  #buildHall() {
    const hall = new THREE.Group()
    hall.position.z = -24
    const stone = (tex) => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffb870', emissiveIntensity: 0.05, color: '#8a8a8a', roughness: 0.95 })
    const wingTex = facadeTexture(1024, 256, 9, 3, { seed: 7 })
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 9), stone(wingTex))
      wing.position.set(side * 11.5, 4.5, 0)
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.2, 17.2, 4, 1), new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.8 }))
      roof.rotation.z = Math.PI / 2
      roof.rotation.x = Math.PI / 4
      roof.scale.set(1, 1, 0.5)
      roof.position.set(side * 11.5, 10.6, 0)
      hall.add(wing, roof)
    }
    const towerTex = facadeTexture(256, 512, 2, 5, { door: true, seed: 3 })
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 7), stone(towerTex))
    tower.position.set(0, 8, 1)
    hall.add(tower)
    // Crenellated parapet on the tower.
    const merlon = new THREE.BoxGeometry(0.9, 1, 0.9)
    const mm = new THREE.MeshStandardMaterial({ color: '#5f5d58', roughness: 0.95 })
    for (let i = 0; i < 4; i++) {
      for (const [x, z] of [[-2.55 + i * 1.7, -2.55 - 0.45 + 1], [-2.55 + i * 1.7, 3.55 + 1 - 0.55]]) {
        const m = new THREE.Mesh(merlon, mm)
        m.position.set(x, 16.5, z)
        hall.add(m)
      }
    }
    this.scene.add(hall)
  }

  #buildPedestal() {
    const g = new THREE.Group()
    const granite = new THREE.MeshStandardMaterial({ color: '#b8b4ab', roughness: 0.8 })
    const u = S
    const box = (w, h, d, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * u, h * u, d * u), granite)
      m.position.y = y * u
      g.add(m)
      return m
    }
    box(0.95, 0.08, 0.95, 0.04)
    box(0.78, 0.12, 0.78, 0.14)
    const shaft = box(0.56, 0.56, 0.56, 0.48)
    box(0.7, 0.06, 0.7, 0.79)
    box(0.6, 0.05, 0.6, 0.875)
    this.pedestal = g
    // Bronze plaque on the front.
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
    this.scene.add(g)
  }

  #buildLights() {
    this.scene.add(new THREE.AmbientLight('#5d74a8', 0.25))
    const moon = new THREE.DirectionalLight('#9cc4ff', 0.6)
    moon.position.set(-6, 10, -4)
    const flood = new THREE.SpotLight('#ffd7a0', 70, 40, 0.2, 0.6)
    flood.position.set(2.5, 0.3, 9)
    flood.target.position.set(0, 3.2, 0)
    const flood2 = new THREE.SpotLight('#bfe0ff', 30, 40, 0.22, 0.7)
    flood2.position.set(-4, 0.5, 6)
    flood2.target.position.set(0, 3.4, 0)
    // Up-light washing the granite pedestal.
    const wash = new THREE.SpotLight('#ffe6c4', 45, 20, 0.5, 0.8)
    wash.position.set(0.8, 0.2, 5)
    wash.target.position.set(0, 1.2, 0)
    this.scene.add(moon, flood, flood.target, flood2, flood2.target, wash, wash.target)
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

  // Screen position of the statue's head (for the greeting bubble).
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

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 52 : 36
    this.camera.updateProjectionMatrix()
  }

  // Timeline -> shard burst, melt and heat.
  #timeline(p) {
    let burst
    if (p < 0.2) burst = 1 - ss(p, 0.1, 0.2) * 0.15
    else if (p < 0.34) burst = 1 - ss(p, 0.22, 0.3)
    else if (p < 0.46) burst = ss(p, 0.36, 0.44)
    else if (p < 0.58) burst = 1 - ss(p, 0.48, 0.55)
    else if (p < 0.68) burst = ss(p, 0.6, 0.63)
    else burst = 1 - ss(p, 0.7, 0.78)
    const fall = p >= 0.3 && p < 0.57 ? 1 : 0
    const heat = (p > 0.34 && p < 0.5 ? ss(p, 0.36, 0.4) * (1 - ss(p, 0.44, 0.5)) : 0) + (p > 0.58 && p < 0.68 ? ss(p, 0.595, 0.605) * (1 - ss(p, 0.61, 0.66)) : 0)
    return { burst, fall, heat }
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    const { burst, fall, heat } = this.#timeline(p)
    this.alive = ss(p, 0.82, 0.9)

    // Pedestal rises out of the plaza in 1928 and stays ever after.
    const rise = ss(p, 0.17, 0.24)
    this.pedestal.position.y = (rise - 1) * PED_H * S
    this.pedestal.visible = rise > 0.001
    this.skyU.uWarm.value = heat * 0.8

    // Camera: a slow arc through the years, settling face to face today.
    const a = (1 - this.alive) * Math.sin(p * Math.PI * 2) * 0.35
    const dist = this.portrait ? 12 : 9
    this.camera.position.set(Math.sin(a) * dist, 1.5 + this.alive * 0.3, Math.cos(a) * dist)
    this.camera.lookAt(0, this.portrait ? 3.4 : 3.1, 0)

    if (this.mesh) {
      const scattered = burst > 0.001
      this.mesh.visible = !scattered
      this.shards.visible = scattered
      this.shardMat.userData.burst.value = burst
      this.shardMat.userData.fall.value = fall
      this.shardMat.userData.heat.value = heat
      this.shardMat.userData.time.value = this.time

      // Alive: eyes on the pointer, arms opening wider to welcome.
      this.greetT += dt
      const g = this.greetT < 2.4 ? Math.sin((this.greetT / 2.4) * Math.PI) : 0
      this.look.lerp(this.pointer, Math.min(1, dt * 4))
      const u = this.mat.userData
      u.yaw.value = this.alive * THREE.MathUtils.clamp(this.look.x * 0.6, -0.6, 0.6)
      u.pitch.value = this.alive * (THREE.MathUtils.clamp(-this.look.y * 0.3, -0.25, 0.3) + g * 0.18 * Math.sin(this.greetT * 6))
      u.arm.value = this.alive * (0.35 + Math.sin(this.time * 1.3) * 0.03 + g * 0.55)
      u.rimPower.value = 0.6 + this.alive * 0.4 + g * 0.8
    }
    const rp = this.greetT / 2.4
    this.ripple.material.opacity = rp < 1 ? (1 - rp) * 0.8 : 0
    this.ripple.scale.setScalar(1 + rp * 12)
    this.composer.render()
  }
}
