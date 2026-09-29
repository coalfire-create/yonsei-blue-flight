import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// A stylised Underwood Hall façade (stone, gabled wings, central tower).
// Dragging across it grows ivy: leaves sprout along the brush stroke, each
// scaling in over ~0.6 s. Season buttons shift every leaf's colour.

export const SEASONS = {
  summer: { a: '#1a5d1a', b: '#4fbf4a', label: '여름' },
  autumn: { a: '#7a1024', b: '#e0562b', label: '가을' },
  winter: { a: '#8fd8ff', b: '#ffffff', label: '겨울' },
  spring: { a: '#2e7d4f', b: '#a8e36a', label: '봄' },
}
const MAX_LEAVES = 9000

const leafVert = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute float aBorn;
  attribute float aRand;
  uniform float uTime;
  varying float vShade;
  varying float vRand;
  varying vec2 vUv;
  mat3 basis(vec3 n, float a){
    vec3 t = normalize(cross(abs(n.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0), n));
    vec3 b = cross(n, t);
    float c = cos(a), s = sin(a);
    vec3 t2 = t * c + b * s, b2 = -t * s + b * c;
    return mat3(t2, b2, n);
  }
  void main(){
    float age = clamp((uTime - aBorn) / 0.6, 0.0, 1.0);
    float grow = age * age * (3.0 - 2.0 * age) * (1.0 + 0.25 * sin(age * 3.14159));
    float sway = sin(uTime * 1.6 + aRand * 20.0) * 0.12;
    mat3 B = basis(aNormal, aRand * 6.2831 + sway);
    vec3 local = vec3(position.xy * (0.55 + aRand * 0.6) * grow, position.x * position.x * 0.25);
    vec3 p = aPos + B * local + aNormal * 0.02;
    vShade = 0.6 + 0.4 * position.y;
    vRand = aRand;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`
const leafFrag = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uFrost;
  varying float vShade;
  varying float vRand;
  varying vec2 vUv;
  void main(){
    vec3 col = mix(uA, uB, vRand) * vShade;
    // Midrib vein.
    col *= 0.85 + 0.15 * smoothstep(0.0, 0.05, abs(vUv.x));
    col += uFrost * vec3(0.5, 0.8, 1.0) * pow(1.0 - abs(vUv.x) * 2.0, 3.0) * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`

// Ivy leaf outline: pointed heart shape.
function leafGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.05)
  s.bezierCurveTo(0.35, 0.05, 0.42, 0.4, 0.2, 0.6)
  s.lineTo(0, 0.95)
  s.lineTo(-0.2, 0.6)
  s.bezierCurveTo(-0.42, 0.4, -0.35, 0.05, 0, -0.05)
  return new THREE.ShapeGeometry(s, 4)
}

function stoneTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#8c8577'
  ctx.fillRect(0, 0, 512, 512)
  // Coursed ashlar blocks.
  for (let row = 0; row < 16; row++) {
    const h = 32
    const off = row % 2 ? 40 : 0
    for (let x = -off; x < 512; x += 80) {
      const l = 108 + Math.random() * 40
      ctx.fillStyle = `rgb(${l + 20},${l + 14},${l})`
      ctx.fillRect(x + 2, row * h + 2, 76, h - 4)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Ivy {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
    this.time = 0
    this.count = 0
    this.mouse = new THREE.Vector2()

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 d; void main(){ vec3 c = mix(vec3(0.05,0.22,0.45), vec3(0.01,0.04,0.12), smoothstep(-0.1,0.6,d.y)); gl_FragColor = vec4(c,1.0); }',
      }),
    )
    this.scene.add(sky)
    this.scene.add(new THREE.HemisphereLight('#bcd8ff', '#1b2a1b', 1.6))
    const sun = new THREE.DirectionalLight('#ffe6c4', 2.4)
    sun.position.set(-6, 10, 12)
    this.scene.add(sun)

    this.#buildHall()
    this.#buildLeaves()
    this.#buildPost()
    this.#bindBrush()
    this.setSeason('summer', true)
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #buildHall() {
    const stone = stoneTexture()
    const mat = (rx, ry) => {
      const t = stone.clone()
      t.needsUpdate = true
      t.repeat.set(rx, ry)
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })
    }
    const roof = new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.6, metalness: 0.2 })
    const glass = new THREE.MeshStandardMaterial({ color: '#0a1830', emissive: '#ffcf80', emissiveIntensity: 0.25, roughness: 0.2 })
    this.hall = new THREE.Group()
    this.walls = []
    const box = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(w / 4, h / 4))
      m.position.set(x, y + h / 2, z)
      this.hall.add(m)
      this.walls.push(m)
      return m
    }
    const gable = (w, h, d, x, y, z) => {
      const s = new THREE.Shape()
      s.moveTo(-w / 2, 0)
      s.lineTo(0, h)
      s.lineTo(w / 2, 0)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
      g.translate(0, 0, -d / 2)
      const m = new THREE.Mesh(g, roof)
      m.position.set(x, y, z)
      this.hall.add(m)
    }
    // Wings and central tower.
    box(9, 6, 4, -7, 0, 0)
    box(9, 6, 4, 7, 0, 0)
    gable(9.6, 2.2, 4.4, -7, 6, 0)
    gable(9.6, 2.2, 4.4, 7, 6, 0)
    box(5, 9.5, 5, 0, 0, 0.4)
    const tower = box(3.2, 3.2, 3.2, 0, 9.5, 0.4)
    // Crenellations on the tower.
    for (let i = -1; i <= 1; i += 2)
      for (let j = -1; j <= 1; j += 2) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), mat(0.2, 0.2))
        c.position.set(i * 1.3, 13.05, 0.4 + j * 1.3)
        this.hall.add(c)
      }
    tower.userData.skip = true
    // Arched windows.
    const win = (x, y, z, w = 0.9, h = 1.6) => {
      const s = new THREE.Shape()
      s.moveTo(-w / 2, 0)
      s.lineTo(-w / 2, h - w / 2)
      s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true)
      s.lineTo(w / 2, 0)
      s.closePath()
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), glass)
      m.position.set(x, y, z)
      this.hall.add(m)
    }
    for (const wx of [-7, 7])
      for (let i = -3; i <= 3; i++) {
        win(wx + i * 1.2, 1.0, 2.02)
        win(wx + i * 1.2, 3.6, 2.02)
      }
    win(0, 1.0, 2.92, 1.6, 3.2)
    win(0, 5.2, 2.92, 1.1, 2.2)
    win(0, 10.4, 2.02, 0.9, 1.6)
    // Steps and lawn.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: '#12321f', roughness: 1 }))
    lawn.rotation.x = -Math.PI / 2
    lawn.position.z = 10
    this.scene.add(lawn)
    this.hall.position.y = 0
    this.scene.add(this.hall)
  }

  #buildLeaves() {
    const base = leafGeometry()
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES * 3), 3)
    this.aNormal = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES * 3), 3)
    this.aBorn = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES).fill(1e9), 1)
    this.aRand = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES), 1)
    for (const a of [this.aPos, this.aNormal, this.aBorn, this.aRand]) a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aPos', this.aPos)
    geo.setAttribute('aNormal', this.aNormal)
    geo.setAttribute('aBorn', this.aBorn)
    geo.setAttribute('aRand', this.aRand)
    geo.instanceCount = 0
    this.leafU = {
      uTime: { value: 0 },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uFrost: { value: 0 },
    }
    this.leaves = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: leafVert, fragmentShader: leafFrag, uniforms: this.leafU, side: THREE.DoubleSide }))
    this.leaves.frustumCulled = false
    this.scene.add(this.leaves)
    this.targetA = new THREE.Color()
    this.targetB = new THREE.Color()
  }

  #buildPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.4, 0.85))
    this.composer.addPass(new OutputPass())
  }

  #bindBrush() {
    const ray = new THREE.Raycaster()
    const c = this.canvas
    let down = false
    let last = null
    const paint = (e) => {
      const r = c.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, this.camera)
      const hit = ray.intersectObjects(this.walls, false)[0]
      if (!hit) return (last = null)
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      // Fill the gap since the last sample so fast strokes stay continuous.
      const from = last ?? hit.point
      const steps = Math.max(1, Math.ceil(from.distanceTo(hit.point) / 0.12))
      for (let s = 1; s <= steps; s++) {
        const p = from.clone().lerp(hit.point, s / steps)
        for (let k = 0; k < 3; k++) {
          const j = new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7)
          j.addScaledVector(n, -j.dot(n))
          this.#addLeaf(p.clone().add(j), n, this.time + k * 0.05 + s * 0.01)
        }
      }
      last = hit.point.clone()
      this.painted = true
    }
    c.addEventListener('pointerdown', (e) => {
      down = true
      last = null
      c.setPointerCapture(e.pointerId)
      paint(e)
    })
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect()
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      if (down) paint(e)
    })
    const up = () => ((down = false), (last = null))
    c.addEventListener('pointerup', up)
    c.addEventListener('pointerleave', up)
  }

  #addLeaf(p, n, born) {
    const i = this.count % MAX_LEAVES
    this.aPos.setXYZ(i, p.x, p.y, p.z)
    this.aNormal.setXYZ(i, n.x, n.y, n.z)
    this.aBorn.setX(i, born)
    this.aRand.setX(i, Math.random())
    this.count++
    this.leaves.geometry.instanceCount = Math.min(this.count, MAX_LEAVES)
    for (const a of [this.aPos, this.aNormal, this.aBorn, this.aRand]) a.needsUpdate = true
  }

  // Seed some ivy climbing from the ground so the wall is never bare.
  seed() {
    if (this.seeded) return
    this.seeded = true
    const n = new THREE.Vector3(0, 0, 1)
    for (const wx of [-10.5, -3.2, 3.2, 10.5]) {
      let x = wx
      for (let y = 0; y < 5.5; y += 0.08) {
        x += (Math.random() - 0.5) * 0.25
        const z = Math.abs(wx) > 5 ? 2.02 : 2.92
        this.#addLeaf(new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y, z), n, this.time + y * 0.35)
      }
    }
  }

  setSeason(key, instant = false) {
    const s = SEASONS[key]
    this.targetA.set(s.a)
    this.targetB.set(s.b)
    this.frost = key === 'winter' ? 1 : 0
    if (instant) {
      this.leafU.uA.value.copy(this.targetA)
      this.leafU.uB.value.copy(this.targetB)
    }
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.dist = w / h < 0.8 ? 64 : 27
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    this.leafU.uTime.value = this.time
    const k = Math.min(1, dt * 2.5)
    this.leafU.uA.value.lerp(this.targetA, k)
    this.leafU.uB.value.lerp(this.targetB, k)
    this.leafU.uFrost.value += (this.frost - this.leafU.uFrost.value) * k
    const yaw = this.mouse.x * 0.08
    this.camera.position.set(Math.sin(yaw) * this.dist, 5.5 + this.mouse.y * 0.8, Math.cos(yaw) * this.dist)
    this.camera.lookAt(0, 5.2, 0)
    this.composer.render()
  }
}
