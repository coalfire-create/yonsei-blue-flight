import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// The 노천극장 at night during Akaraka: a stepped bowl of instanced people
// holding blue lights, a stadium wave rolling around the tiers, and a sonic
// shockwave from every click. Sound is synthesised (WebAudio), not recorded.

const vert = /* glsl */ `
  attribute vec3 aSeat;
  attribute float aAng;
  attribute float aRand;
  uniform float uTime;
  uniform vec4 uPulses[6];
  varying float vGlow;
  varying float vRand;
  void main(){
    // Stadium wave: travels around the bowl by angle.
    float wave = pow(max(0.0, sin(aAng * 1.5 - uTime * 2.4)), 24.0);
    // Click pulses: rings expanding from a point on the bowl.
    float pulse = 0.0;
    for (int i = 0; i < 6; i++){
      vec4 p = uPulses[i];
      float age = uTime - p.w;
      if (age < 0.0 || age > 2.2) continue;
      float d = distance(aSeat.xz, p.xz);
      float front = d - age * 38.0;
      pulse += exp(-front * front * 0.02) * (1.0 - age / 2.2);
    }
    float jump = wave * 1.6 + pulse * 1.3 + sin(uTime * 6.0 + aRand * 30.0) * 0.06;
    vec3 p = position;
    p.y += 0.9;
    // Arms up during the wave.
    p.y *= 1.0 + wave * 0.45;
    vec3 world = aSeat + p + vec3(0.0, jump, 0.0);
    vGlow = wave + pulse;
    vRand = aRand;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`
const frag = /* glsl */ `
  varying float vGlow;
  varying float vRand;
  void main(){
    vec3 base = mix(vec3(0.01, 0.03, 0.1), vec3(0.02, 0.1, 0.3), vRand);
    vec3 col = base + vec3(0.1, 0.6, 1.0) * min(vGlow, 1.5) * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class Akaraka {
  constructor(canvas) {
    this.canvas = canvas
    this.mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.75))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#02060f')
    this.scene.fog = new THREE.Fog('#02060f', 60, 190)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400)
    this.time = 0
    this.pulses = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -99))
    this.nextPulse = 0

    this.#buildBowl()
    this.#buildStage()
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.55))
    this.composer.addPass(new OutputPass())

    canvas.addEventListener('pointerdown', (e) => this.cheer(e))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #buildBowl() {
    // Semicircular tiers facing the stage at the origin (stage toward -z).
    const seats = []
    const tiers = this.mobile ? 26 : 40
    for (let t = 0; t < tiers; t++) {
      const r = 22 + t * 2.1
      const y = t * 1.05
      const n = Math.floor(r * Math.PI * 0.95 / (this.mobile ? 1.5 : 1.05))
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.95 / 2 + (i / (n - 1)) * Math.PI * 0.95
        seats.push([Math.sin(a) * r + (Math.random() - 0.5) * 0.4, y, Math.cos(a) * r + (Math.random() - 0.5) * 0.4, a])
      }
    }
    this.count = seats.length
    const person = new THREE.CapsuleGeometry(0.28, 0.9, 2, 6)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = person.index
    geo.setAttribute('position', person.getAttribute('position'))
    geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(new Float32Array(seats.flatMap((s) => [s[0], s[1], s[2]])), 3))
    geo.setAttribute('aAng', new THREE.InstancedBufferAttribute(new Float32Array(seats.map((s) => s[3])), 1))
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(seats.map(() => Math.random())), 1))
    geo.instanceCount = seats.length
    this.uniforms = { uTime: { value: 0 }, uPulses: { value: this.pulses } }
    const crowd = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms }))
    crowd.frustumCulled = false
    this.scene.add(crowd)

    // Stone tiers under the crowd.
    for (let t = 0; t < tiers; t += 2) {
      const r = 22 + t * 2.1
      const step = new THREE.Mesh(
        new THREE.RingGeometry(r - 1.1, r + 3.1, 64, 1, -Math.PI * 0.475 + Math.PI / 2, Math.PI * 0.95),
        new THREE.MeshBasicMaterial({ color: t % 4 ? '#08142a' : '#0a1a36', side: THREE.DoubleSide }),
      )
      step.rotation.x = -Math.PI / 2
      step.rotation.z = Math.PI
      step.position.y = t * 1.05 - 0.05
      this.scene.add(step)
    }
    this.bowlPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -10)
  }

  #buildStage() {
    const stage = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 10), new THREE.MeshBasicMaterial({ color: '#0b1d3d' }))
    stage.position.set(0, 0.6, -2)
    this.scene.add(stage)
    // Light beams sweeping from the stage.
    this.beams = []
    for (let i = 0; i < 6; i++) {
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(4, 90, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#00d2ff' : '#4facfe', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      beam.geometry.translate(0, -45, 0)
      beam.position.set(-10 + i * 4, 1.5, -4)
      this.scene.add(beam)
      this.beams.push(beam)
    }
    // Giant screen text.
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 256
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#00132e'
    ctx.fillRect(0, 0, 1024, 256)
    ctx.fillStyle = '#fff'
    ctx.font = '800 150px "Syne", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('AKARAKA', 512, 130)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }))
    screen.position.set(0, 8, -8)
    this.scene.add(screen)
  }

  // Click: a shockwave through the crowd from where you clicked, plus a roar.
  cheer(e) {
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    if (!ray.ray.intersectPlane(this.bowlPlane, hit)) hit.set(0, 10, 40)
    this.pulses[this.nextPulse++ % 6].set(hit.x, hit.y, hit.z, this.time)
    this.shake = 1
    this.#roar()
  }

  // A crowd roar and drum hit from filtered noise, no audio files.
  #roar() {
    if (this.muted) return
    this.ctx ??= new AudioContext()
    const ac = this.ctx
    const now = ac.currentTime
    const len = 1.6
    const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5)
    const src = ac.createBufferSource()
    src.buffer = buf
    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.setValueAtTime(600, now)
    band.frequency.exponentialRampToValueAtTime(1400, now + 0.25)
    band.Q.value = 0.7
    const g = ac.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.35, now + 0.08)
    g.gain.exponentialRampToValueAtTime(0.001, now + len)
    src.connect(band).connect(g).connect(ac.destination)
    src.start(now)
    const kick = ac.createOscillator()
    const kg = ac.createGain()
    kick.frequency.setValueAtTime(120, now)
    kick.frequency.exponentialRampToValueAtTime(40, now + 0.3)
    kg.gain.setValueAtTime(0.6, now)
    kg.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    kick.connect(kg).connect(ac.destination)
    kick.start(now)
    kick.stop(now + 0.4)
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.8 ? 70 : 50
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    this.uniforms.uTime.value = this.time
    this.shake = Math.max(0, (this.shake ?? 0) - dt * 2.5)
    const s = this.shake * 0.6
    const orbit = Math.sin(this.time * 0.1) * 0.25
    // From the stage, looking up into the stands.
    this.camera.position.set(Math.sin(orbit) * 10 + (Math.random() - 0.5) * s, 9 + (Math.random() - 0.5) * s, -12)
    this.camera.lookAt(0, 16, 55)
    this.beams.forEach((b, i) => {
      b.rotation.x = -1.05 + Math.sin(this.time * 0.9 + i) * 0.35
      b.rotation.z = Math.sin(this.time * 0.7 + i * 1.7) * 0.5
      b.material.opacity = 0.07 + this.shake * 0.12
    })
    this.composer.render()
  }
}
