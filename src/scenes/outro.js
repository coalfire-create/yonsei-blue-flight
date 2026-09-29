import * as THREE from 'three'
import { backdrop } from '../backdrop.js'
import { bronzeMaterial, buildEagle, poseEagle, sapphireEnv } from '../eagle.js'

// Finale: dusk falls over the whole campus (a baked still of the flight
// scene's world) while the bronze eagle soars in a wide figure-eight above
// it, drawing a golden ribbon of light. "Fly with Yonsei" sends it diving
// past the viewer and back into the sky.

const TRAIL = 110

const ribbonVert = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  varying float vT;
  varying float vSide;
  void main(){
    vT = aT;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const ribbonFrag = /* glsl */ `
  uniform float uGlow;
  varying float vT;
  varying float vSide;
  void main(){
    float edge = 1.0 - abs(vSide);
    float a = pow(vT, 1.6) * (0.25 + edge * 0.75) * uGlow;
    vec3 c = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.92, 0.7), vT);
    gl_FragColor = vec4(c * a, a);
  }
`

export class Outro {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.environment = sapphireEnv(this.renderer)
    this.scene.environmentIntensity = 0.6
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
    this.camera.position.set(0, 0, 16)
    this.time = 0
    this.launch = 0
    this.progress = 0

    this.bg = backdrop('outro')
    this.scene.add(this.bg.mesh)

    // Last light from the west, a cool sky fill.
    const sun = new THREE.DirectionalLight('#ffbf7a', 4.2)
    sun.position.set(-6, 2, 3)
    const rim = new THREE.DirectionalLight('#9fc6ff', 2)
    rim.position.set(4, 3, -6)
    this.scene.add(sun, rim, new THREE.HemisphereLight('#7f9fd6', '#3a2a1c', 0.6))

    this.eagle = new THREE.Group()
    this.scene.add(this.eagle)
    this.mat = bronzeMaterial({ rim: '#ffb870' })
    buildEagle(this.mat).then((e) => {
      e.scale.setScalar(3.4)
      e.rotation.x = 0.55 // level the landing pose out into flight
      this.bird = e
      this.eagle.add(e)
    })

    // Golden ribbon trailing the eagle.
    const pos = new Float32Array(TRAIL * 2 * 3)
    const t = new Float32Array(TRAIL * 2)
    const side = new Float32Array(TRAIL * 2)
    for (let i = 0; i < TRAIL; i++) {
      t[i * 2] = t[i * 2 + 1] = i / (TRAIL - 1)
      side[i * 2] = -1
      side[i * 2 + 1] = 1
    }
    const idx = []
    for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1))
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
    g.setIndex(idx)
    this.ribbonU = { uGlow: { value: 1 } }
    this.ribbon = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({ vertexShader: ribbonVert, fragmentShader: ribbonFrag, uniforms: this.ribbonU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    this.ribbon.frustumCulled = false
    this.scene.add(this.ribbon)
    this.trail = []

    // Sparks shed from the wings.
    this.sparkGeo = new THREE.BufferGeometry()
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3).fill(-999), 3))
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.sparks.frustumCulled = false
    this.scene.add(this.sparks)
    this.sparkLife = new Float32Array(240)
    this.sparkVel = new Float32Array(240 * 3)
    this.nextSpark = 0

    this.resize()
    addEventListener('resize', () => this.resize())
  }

  fly() {
    if (this.launch) return
    this.launch = 0.0001
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.bg.resize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.position.z = this.portrait ? 26 : 16
    this.camera.updateProjectionMatrix()
  }

  // The soaring path: a wide, tilted figure-eight in the upper sky.
  #path(t, out) {
    const w = this.portrait ? 3.4 : 6.8
    return out.set(Math.sin(t) * w, 2.4 + Math.sin(t * 2) * 0.8 + (this.portrait ? 3 : 0), -2 + Math.sin(t * 2) * 2.2)
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    // Dusk deepens as you settle into the finale.
    const u = this.bg.u
    u.uDark.value = 0.12 + p * 0.2
    u.uWarm.value = 0.9
    u.uZoom.value = 1.05 + Math.min(this.time, 60) * 0.002 + p * 0.05
    u.uOff.value.set(Math.sin(this.time * 0.05) * 0.01, 0.02 - p * 0.03)
    this.bg.update(dt)

    const s = this.time * 0.22
    const here = this.#path(s, new THREE.Vector3())
    const next = this.#path(s + 0.02, new THREE.Vector3())
    if (this.launch) {
      // Dive toward the viewer and sweep up past the camera, then glide
      // back in onto the path.
      this.launch += dt
      const k = this.launch
      const out = THREE.MathUtils.smootherstep(k, 0, 1.6)
      const back = THREE.MathUtils.smootherstep(k, 2.4, 4.2)
      const dive = new THREE.Vector3(0, -1 + out * 9, 13 * out)
      const w = Math.min(out, 1 - back)
      here.lerp(dive, w)
      next.lerp(dive.clone().add(new THREE.Vector3(0, 0.6, 0.5)), w)
      if (k > 4.3) this.launch = 0
    }
    this.eagle.position.lerp(here, this.placed ? 1 - Math.exp(-dt * 6) : 1)
    this.placed = true
    const vel = next.sub(here)
    this.eagle.lookAt(this.eagle.position.clone().add(vel))
    const turn = Math.cos(s) * (this.portrait ? 0.4 : 0.55)
    this.bank = (this.bank ?? 0) + (-turn - (this.bank ?? 0)) * (1 - Math.exp(-dt * 3))
    this.eagle.rotateZ(this.bank)
    if (this.bird) {
      // Glide, then a few strong beats on each climb (and on launch).
      const climb = Math.max(0, Math.cos(s * 2)) + (this.launch ? 1 : 0)
      this.phase = (this.phase ?? 0) + dt * (2 + climb * 5)
      poseEagle(this.bird, this.phase, 0.35 + Math.min(1, climb) * 0.65)
    }

    // Ribbon: newest point at the eagle, widening toward it.
    this.trail.unshift(this.eagle.position.clone().add(new THREE.Vector3(0, -0.1, 0)))
    if (this.trail.length > TRAIL) this.trail.pop()
    const pa = this.ribbon.geometry.attributes.position
    const camDir = new THREE.Vector3()
    for (let i = 0; i < TRAIL; i++) {
      const a = this.trail[Math.min(i, this.trail.length - 1)]
      const b = this.trail[Math.min(i + 1, this.trail.length - 1)]
      const dir = a.clone().sub(b)
      camDir.copy(this.camera.position).sub(a)
      const side = dir.cross(camDir)
      if (side.lengthSq() > 1e-10) side.normalize().multiplyScalar(0.02 + (1 - i / TRAIL) * 0.22)
      const j = TRAIL - 1 - i // aT runs 0 (tail) -> 1 (head)
      pa.setXYZ(j * 2, a.x + side.x, a.y + side.y, a.z + side.z)
      pa.setXYZ(j * 2 + 1, a.x - side.x, a.y - side.y, a.z - side.z)
    }
    pa.needsUpdate = true

    // Sparks.
    const sp = this.sparkGeo.attributes.position
    const e = this.eagle.position
    for (let q = 0; q < (this.launch ? 6 : 2); q++) {
      const i = this.nextSpark++ % 240
      sp.setXYZ(i, e.x + (Math.random() - 0.5) * 1.6, e.y + (Math.random() - 0.5) * 0.4, e.z + (Math.random() - 0.5) * 0.6)
      this.sparkVel.set([(Math.random() - 0.5) * 0.3, -0.3 - Math.random() * 0.4, (Math.random() - 0.5) * 0.3], i * 3)
      this.sparkLife[i] = 1
    }
    for (let i = 0; i < 240; i++) {
      if (this.sparkLife[i] <= 0) continue
      this.sparkLife[i] -= dt * 0.6
      if (this.sparkLife[i] <= 0) sp.setXYZ(i, 0, -999, 0)
      else sp.setXYZ(i, sp.getX(i) + this.sparkVel[i * 3] * dt, sp.getY(i) + this.sparkVel[i * 3 + 1] * dt, sp.getZ(i) + this.sparkVel[i * 3 + 2] * dt)
    }
    sp.needsUpdate = true
    this.mat.userData.rimPower.value = 0.5 + (this.launch ? 0.6 : 0)
    this.renderer.render(this.scene, this.camera)
  }
}
