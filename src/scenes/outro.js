import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { buildEagle, poseEagle, sapphireEnv } from '../eagle.js'

// Three portal gates (admissions / research / giving) with swirling light,
// and the "Fly with Yonsei" ending: the eagle launches up through the sky.

const portalFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uHover;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = sin(a * 5.0 + r * 14.0 - uTime * (2.5 + uHover * 3.0)) * 0.5 + 0.5;
    float core = smoothstep(1.0, 0.0, r);
    vec3 col = uColor * (0.25 + swirl * 0.6) * core + vec3(1.0) * pow(core, 6.0) * (0.4 + uHover);
    float alpha = smoothstep(1.0, 0.92, r) * (0.55 + core * 0.45);
    gl_FragColor = vec4(col * (1.0 + uHover * 0.8), alpha);
  }
`

export const PORTALS = [
  { key: 'admission', label: '입학', en: 'ADMISSIONS', href: 'https://admission.yonsei.ac.kr', color: '#00d2ff' },
  { key: 'research', label: '연구', en: 'RESEARCH', href: 'https://www.yonsei.ac.kr', color: '#4facfe' },
  { key: 'giving', label: '기부', en: 'GIVING', href: 'https://www.yonsei.ac.kr', color: '#7fe0a0' },
]

export class Outro {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.environment = sapphireEnv(this.renderer)
    this.scene.background = new THREE.Color('#050c1a')
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    this.camera.position.set(0, 1.2, 14)
    this.time = 0
    this.launch = 0

    this.portals = PORTALS.map((p, i) => {
      const g = new THREE.Group()
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 12, 96), new THREE.MeshStandardMaterial({ color: '#cfe3ff', metalness: 1, roughness: 0.15 }))
      const uni = { uTime: { value: 0 }, uColor: { value: new THREE.Color(p.color) }, uHover: { value: 0 } }
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.45, 64),
        new THREE.ShaderMaterial({
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: portalFrag,
          uniforms: uni,
          transparent: true,
          depthWrite: false,
        }),
      )
      g.add(ring, disc)
      g.position.set((i - 1) * 4.2, -0.3, 0)
      g.userData = { ...p, uni, disc }
      this.scene.add(g)
      return g
    })

    // Placeholder group until the sculpt loads, so the launch logic can run.
    this.eagle = new THREE.Group()
    this.eagle.position.set(0, 3.1, 0)
    this.scene.add(this.eagle)
    buildEagle().then((e) => {
      e.scale.setScalar(2.8)
      e.position.y = -0.3
      this.bird = e
      this.eagle.add(e)
    })
    const key = new THREE.DirectionalLight('#bfe4ff', 2)
    key.position.set(2, 5, 6)
    this.scene.add(key, new THREE.AmbientLight('#6f8cff', 0.5))

    // Light trail behind the launching eagle.
    this.trailPts = []
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#00d2ff', transparent: true, opacity: 0.9 }))
    this.scene.add(this.trail)

    // Starfield.
    const stars = new Float32Array(1500 * 3)
    for (let i = 0; i < 1500; i++) stars.set([(Math.random() - 0.5) * 120, Math.random() * 80 - 10, -30 - Math.random() * 60], i * 3)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(stars, 3))
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#bcdcff', size: 0.15 })))

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.4))
    this.composer.addPass(new OutputPass())

    this.#bindPortals()
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #bindPortals() {
    const ray = new THREE.Raycaster()
    const pick = (e) => {
      const r = this.canvas.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
      const hit = ray.intersectObjects(this.portals.map((p) => p.userData.disc))[0]
      return hit ? this.portals.find((p) => p.userData.disc === hit.object) : null
    }
    this.canvas.addEventListener('pointermove', (e) => {
      this.hovered = pick(e)
      this.canvas.style.cursor = this.hovered ? 'pointer' : ''
    })
    this.canvas.addEventListener('click', (e) => {
      const p = pick(e)
      if (p) window.open(p.userData.href, '_blank', 'noopener')
    })
  }

  fly() {
    this.launch = 0.0001
    this.trailPts = []
  }

  // Screen positions of the portal labels.
  portalScreens() {
    return this.portals.map((p) => {
      const v = p.position.clone().add(new THREE.Vector3(0, -2.1, 0)).project(this.camera)
      return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight }
    })
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.position.z = w / h < 0.8 ? 34 : 14
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    for (const p of this.portals) {
      const u = p.userData.uni
      u.uTime.value = this.time
      u.uHover.value += ((this.hovered === p ? 1 : 0) - u.uHover.value) * Math.min(1, dt * 6)
      p.rotation.y = Math.sin(this.time * 0.5 + p.position.x) * 0.15
    }
    this.phase = (this.phase ?? 0) + dt * (this.launch ? 9 : 3)
    if (this.bird) poseEagle(this.bird, this.phase, 1)
    if (this.launch) {
      this.launch += dt
      const t = this.launch
      // Crouch, then rocket up and away with a sweeping arc.
      const up = Math.max(0, t - 0.25)
      this.eagle.position.set(Math.sin(up * 1.6) * 2.5, 3.1 + up * up * 9, -up * 6)
      this.eagle.rotation.set(-0.9 * Math.min(1, up * 2), 0, Math.sin(up * 1.6) * 0.4)
      this.trailPts.push(this.eagle.position.clone())
      if (this.trailPts.length > 120) this.trailPts.shift()
      this.trail.geometry.setFromPoints(this.trailPts)
      if (t > 4) {
        this.launch = 0
        this.eagle.position.set(0, 3.1, 0)
        this.eagle.rotation.set(0, 0, 0)
        this.trailPts = []
        this.trail.geometry.setFromPoints([])
      }
    } else {
      this.eagle.position.y = 3.1 + Math.sin(this.time * 1.4) * 0.12
    }
    this.composer.render()
  }
}
