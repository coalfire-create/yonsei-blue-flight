import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import DATA from '../data/campus.json'
import { buildEagle, buildPillar, PILLAR_TOP, poseEagle, sapphireEnv } from '../eagle.js'

// Eagle-eye flight up the real 백양로 from the main gate to Underwood Hall,
// over OpenStreetMap footprints of the Sinchon campus (© OSM contributors).
// Scroll drives the flight; the pointer steers the view and pushes speed.

const buildingVert = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const buildingFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uScan;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main(){
    vec3 n = normalize(vNormal);
    float light = 0.45 + 0.55 * max(dot(n, normalize(vec3(-0.3, 0.9, 0.4))), 0.0);
    vec3 col = uColor * light;
    // Low-poly floor lines and a scan band sweeping up the walls.
    float fl = smoothstep(0.92, 1.0, fract(vWorld.y / 4.0));
    col += uEdge * fl * 0.35 * step(abs(n.y), 0.5);
    float scan = exp(-pow((vWorld.z - uScan) * 0.03, 2.0));
    col += uEdge * scan * 0.25;
    float fog = smoothstep(260.0, 900.0, length(vWorld - cameraPosition));
    gl_FragColor = vec4(mix(col, vec3(0.02, 0.05, 0.1), fog), 1.0);
  }
`

// Buildings that get a lock-on target, with card copy.
export const TARGETS = [
  { key: 'gate', name: '정문', en: 'Main Gate', body: '신촌에서 연세의 모든 이야기가 시작되는 곳.' },
  { key: 'eagle', name: '독수리상', en: 'Eagle Statue', body: '1970년 학생들의 모금으로 세운 청동 독수리. 날개 폭 5.2m, 10m 탑 위에서 비상한다.' },
  { key: 'library', name: '중앙도서관', en: 'Central Library', code: '301', body: '지성의 심장. 밤늦도록 불이 꺼지지 않는 곳.' },
  { key: 'union', name: '학생회관', en: 'Student Union', code: '207', body: '동아리와 학생 자치의 중심.' },
  { key: 'baekyang', name: '백양관', en: 'Baekyang Hall', code: '310', body: '백양로 한가운데, 캠퍼스의 교차로.' },
  { key: 'amphitheater', name: '노천극장', en: 'Open-Air Theater', body: '아카라카의 함성이 울려 퍼지는 곳.' },
  { key: 'underwood', name: '언더우드관', en: 'Underwood Hall', code: '501', body: '1924년에 지어진 연세의 상징 석조 건물. 앞마당에서 언더우드 동상이 두 팔을 벌리고 있다.' },
]

export class Baekyang {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.25 : 1.75))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#050c1a')
    this.camera = new THREE.PerspectiveCamera(62, 1, 1, 3000)
    this.progress = 0
    this.boost = 0
    this.mouse = new THREE.Vector2()
    this.time = 0

    this.#buildGround()
    this.#buildBuildings()
    this.#buildRoute()
    this.#buildHalls()
    this.#buildStatue()
    this.#buildPost()

    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    canvas.addEventListener('pointerenter', () => (this.hover = true))
    canvas.addEventListener('pointerleave', () => (this.hover = false))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: '#07142b' }))
    g.rotation.x = -Math.PI / 2
    this.scene.add(g)
    const grid = new THREE.GridHelper(3000, 150, '#0e2a55', '#0b2146')
    grid.position.y = 0.05
    this.scene.add(grid)
    const pts = []
    for (const line of DATA.paths) for (let i = 0; i < line.length - 1; i++) pts.push(line[i][0], 0.2, line[i][1], line[i + 1][0], 0.2, line[i + 1][1])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#1f4f8f', transparent: true, opacity: 0.7 })))
  }

  #buildBuildings() {
    const groups = { campus: [], town: [] }
    for (const b of DATA.buildings) {
      const shape = new THREE.Shape(b.p.map(([x, z]) => new THREE.Vector2(x, -z)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      groups[b.c ? 'campus' : 'town'].push(geo)
    }
    this.scanU = { value: 0 }
    const mat = (color, edge) =>
      new THREE.ShaderMaterial({
        vertexShader: buildingVert,
        fragmentShader: buildingFrag,
        uniforms: { uColor: { value: new THREE.Color(color) }, uEdge: { value: new THREE.Color(edge) }, uScan: this.scanU },
      })
    const campus = mergeGeometries(groups.campus)
    this.scene.add(new THREE.Mesh(campus, mat('#1b4f9c', '#00d2ff')))
    this.scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(campus, 25), new THREE.LineBasicMaterial({ color: '#4facfe', transparent: true, opacity: 0.55 })))
    this.scene.add(new THREE.Mesh(mergeGeometries(groups.town), mat('#0c1c38', '#1f4f8f')))
  }

  #buildRoute() {
    const pts = DATA.route.map(([x, z]) => new THREE.Vector3(x, 0.6, z))
    this.route = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    // 백양로 drawn as a glowing avenue.
    const road = new THREE.Mesh(
      new THREE.TubeGeometry(this.route, 300, 3.2, 4, false),
      new THREE.MeshBasicMaterial({ color: '#00d2ff', transparent: true, opacity: 0.55 }),
    )
    road.scale.y = 0.05
    this.scene.add(road)

    // Lock-on targets: world anchor + a wireframe box around the building.
    this.targets = TARGETS.map((t) => {
      const lm = DATA.landmarks[t.key]
      const ring = DATA.landmarks[t.key + 'Ring']
      const b = ring && DATA.buildings.find((q) => q.n && q.p.length === ring.length && Math.abs(q.p[0][0] - ring[0][0]) < 0.5 && Math.abs(q.p[0][1] - ring[0][1]) < 0.5)
      const h = b ? b.h : 14
      const anchor = new THREE.Vector3(lm[0], h + 6, lm[1])
      let box = null
      if (ring) {
        const xs = ring.map((p) => p[0])
        const zs = ring.map((p) => p[1])
        const w = Math.max(...xs) - Math.min(...xs) + 6
        const d = Math.max(...zs) - Math.min(...zs) + 6
        box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h + 6, d)),
          new THREE.LineBasicMaterial({ color: '#00d2ff', transparent: true, opacity: 0 }),
        )
        box.position.set((Math.max(...xs) + Math.min(...xs)) / 2, (h + 6) / 2, (Math.max(...zs) + Math.min(...zs)) / 2)
        this.scene.add(box)
      }
      // Where along the route this target is closest.
      let bestU = 0
      let bestD = Infinity
      for (let i = 0; i <= 200; i++) {
        const q = this.route.getPointAt(i / 200)
        const d = Math.hypot(q.x - lm[0], q.z - lm[1])
        if (d < bestD) (bestD = d), (bestU = i / 200)
      }
      return { ...t, anchor, box, u: bestU }
    })
  }

  // Every named campus building gets a name tag (one per name, on its largest
  // footprint); the lock-on landmarks keep their own reticles instead.
  #buildHalls() {
    const locked = new Set(TARGETS.map((t) => t.name))
    const best = new Map()
    for (const b of DATA.buildings) {
      if (!b.c || !b.n || locked.has(b.n)) continue
      let area = 0
      let cx = 0
      let cz = 0
      b.p.forEach(([x, z], i) => {
        const [x2, z2] = b.p[(i + 1) % b.p.length]
        area += x * z2 - x2 * z
        cx += x
        cz += z
      })
      area = Math.abs(area / 2)
      if ((best.get(b.n)?.area ?? -1) < area) best.set(b.n, { name: b.n, code: b.code, lv: b.lv, area, anchor: new THREE.Vector3(cx / b.p.length, b.h + 3, cz / b.p.length) })
    }
    this.halls = [...best.values()]
  }

  // The real statue on its 10 m pillar (bronze eagle, 5.2 m wingspan),
  // at its OSM position, facing down 백양로 toward the main gate.
  #buildStatue() {
    this.scene.environment = sapphireEnv(this.renderer)
    const [x, z] = DATA.landmarks.eagle
    const span = 5.2
    const g = new THREE.Group()
    g.scale.setScalar(span)
    g.position.set(x, 10 - PILLAR_TOP * span, z)
    const gate = this.route.getPointAt(0)
    g.rotation.y = Math.atan2(gate.x - x, gate.z - z)
    g.add(buildPillar(10 / span, new THREE.MeshStandardMaterial({ color: '#b9c6da', roughness: 0.85 })))
    buildEagle().then((e) => g.add(e))
    const glow = new THREE.PointLight('#ffd9a0', 400, 40)
    glow.position.set(x, 8, z)
    this.scene.add(g, glow)

    // The eagle you follow: flies ahead of the camera up 백양로, its wings
    // beating faster the faster you scroll.
    this.flier = new THREE.Group()
    this.flier.visible = false
    this.scene.add(this.flier)
    const key = new THREE.DirectionalLight('#ffe2b8', 0.9)
    key.position.set(0.4, 1, 0.6)
    this.flier.add(key, key.target)
    buildEagle().then((e) => {
      e.scale.setScalar(15)
      // Level the landing-pose body out into flight.
      e.rotation.x = 0.55
      this.flierModel = e
      this.flier.add(e)
      this.flier.visible = true
    })
    this.flapPhase = 0
    this.bank = 0
  }

  #buildPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.5))
    this.composer.addPass(new OutputPass())
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.8 ? 78 : 62
    this.camera.updateProjectionMatrix()
  }

  #flyEagle(dt, u) {
    if (!this.flierModel) return
    // Scroll speed drives the wingbeat; gliding slowly when idle.
    const speed = Math.abs(u - (this.lastU ?? u)) / Math.max(dt, 1e-3)
    this.lastU = u
    this.beat = (this.beat ?? 0) + (Math.min(1, speed * 6) - (this.beat ?? 0)) * Math.min(1, dt * 3)
    this.flapPhase += dt * (2.2 + this.beat * 7)
    poseEagle(this.flierModel, this.flapPhase, 0.55 + this.beat * 0.45)

    // Hold a spot ~55 m ahead of the camera, low in the frame, drifting
    // opposite the pointer so steering shows parallax.
    const cam = this.camera
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const bob = Math.sin(this.flapPhase) * -0.9
    const pos = cam.position.clone()
      // In the campus overview it flies on ahead and down into the scene.
      .addScaledVector(fwd, 55 + (this.overview ?? 0) * 230)
      .addScaledVector(up, -11 - (this.overview ?? 0) * 60 + bob)
      .addScaledVector(right, -this.mouse.x * 6 + Math.sin(this.time * 0.6) * 3)
    this.flier.position.lerp(pos, this.flier.userData.placed ? Math.min(1, dt * 8) : 1)
    this.flier.userData.placed = true
    // Face up the avenue; bank into the route's turns and the pointer.
    const t = this.route.getTangentAt(Math.min(1, this.u + 0.02))
    const t2 = this.route.getTangentAt(Math.min(1, this.u + 0.08))
    const turn = t.x * t2.z - t.z * t2.x
    this.bank += (THREE.MathUtils.clamp(turn * 8 - this.mouse.x * 0.5, -0.7, 0.7) - this.bank) * Math.min(1, dt * 2)
    this.flier.lookAt(this.flier.position.clone().add(new THREE.Vector3(t.x, 0, t.z)))
    this.flier.rotateZ(this.bank)
  }

  // Screen position of a world point, or null if behind the camera.
  screen(v) {
    const p = v.clone().project(this.camera)
    if (p.z > 1) return null
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight }
  }

  render(dt) {
    this.time += dt
    // Hovering the canvas pushes the "throttle": the camera surges ahead of scroll.
    this.boost += ((this.hover ? 0.045 : 0) - this.boost) * Math.min(1, dt * 2)
    const u = Math.min(1, this.progress + this.boost * (1 - this.progress))
    this.u = this.u === undefined ? u : this.u + (u - this.u) * Math.min(1, dt * 4)
    const here = this.route.getPointAt(this.u)
    const ahead = this.route.getPointAt(Math.min(1, this.u + 0.06))
    // Swoop: high over the gate, dropping to eagle height along the avenue,
    // climbing again to look at Underwood Hall.
    // Finale: past Underwood Hall the camera soars up and back to take in
    // the whole campus, every hall named.
    const up = THREE.MathUtils.smoothstep(this.u, 0.86, 1)
    const alt = 130 - 95 * Math.sin(Math.min(1, this.u * 1.25) * Math.PI * 0.5) + up * 330
    const side = this.mouse.x * 26 * (1 - up * 0.6)
    // Start further back so the main gate is in view, then close in.
    const back = 60 + 110 * Math.max(0, 1 - this.u * 6) + up * 380
    this.camera.position.set(here.x + side, alt + this.mouse.y * 12, here.z + back)
    this.camera.lookAt(THREE.MathUtils.lerp(ahead.x + side * 0.4, 20, up), 12, THREE.MathUtils.lerp(ahead.z - 40, -120, up))
    this.overview = up
    this.camera.rotateZ(-this.mouse.x * 0.12)
    this.scanU.value = here.z - 60 + ((this.time * 120) % 240)
    this.#flyEagle(dt, u)

    // Lock-on boxes glow while their building is in range.
    for (const t of this.targets) {
      // Targets light up as they come up ahead and fade once passed.
      const d = t.u - this.u
      t.near = Math.max(0, d >= 0 ? 1 - d / 0.2 : 1 + d / 0.06)
      if (t.box) t.box.material.opacity = t.near
    }
    this.composer.render()
  }
}
