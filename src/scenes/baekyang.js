import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import DATA from '../data/campus.json'
import WORLD from '../data/world.json'
import { buildEagle, buildPillar, PILLAR_TOP, poseEagle } from '../eagle.js'

// The eagle's flight over the whole Sinchon campus, built only from free open
// data: OpenStreetMap footprints, land use and trees (© OSM contributors) on
// AWS Terrain Tiles elevation. Golden-hour sky and shadows; every building
// gets walls, windows and roofs by style (gothic stone halls, granite, glass,
// hospital, dorm, town). Scroll drives the tour; the pointer steers; a hall
// picked from the directory pulls the flight over to circle it.

export const TARGETS = [
  { key: 'gate', name: '정문', en: 'Main Gate', body: '신촌에서 연세의 모든 이야기가 시작되는 곳.' },
  { hall: '공학원', name: '공학원', en: 'Engineering Research Park', body: '제1~4공학관과 이어지는 공과대학 구역의 관문.' },
  { key: 'eagle', name: '독수리상', en: 'Eagle Statue', body: '1970년 학생들의 모금으로 세운 청동 독수리. 날개 폭 5.2m, 10m 탑 위에서 비상한다.' },
  { hall: '중앙도서관', name: '중앙도서관', en: 'Central Library', code: '301', body: '지성의 심장. 밤늦도록 불이 꺼지지 않는 곳.' },
  { hall: '백양관', name: '백양관', en: 'Baekyang Hall', code: '310', body: '백양로 한가운데, 캠퍼스의 교차로.' },
  { hall: '언더우드관', name: '언더우드관', en: 'Underwood Hall', code: '501', body: '1924년에 지어진 연세의 상징 석조 건물. 앞마당에서 언더우드 동상이 두 팔을 벌리고 있다.' },
  { hall: '노천극장', name: '노천극장', en: 'Open-Air Theater', body: '아카라카의 함성이 울려 퍼지는 곳.' },
  { hall: '새천년관', name: '새천년관', en: 'New Millennium Hall', body: '노천극장 너머, 캠퍼스 동쪽 언덕.' },
  { hall: '세브란스병원 본관', name: '세브란스병원', en: 'Severance Hospital', body: '1885년 광혜원에서 시작된 연세 의료의 본관.' },
]

const T = WORLD.terrain
const X1 = T.x0 + (T.w - 1) * T.step
const Z1 = T.z0 + (T.h - 1) * T.step
const MOBILE = innerWidth < 760
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(235))

// Wall / roof look by style: s = style index, per-building seed, base and top.
const STYLE = { c: 0, g: 1, m: 2, h: 3, d: 4, t: 5, a: 6 }
const buildingChunks = {
  vertexPars: /* glsl */ `
    attribute vec4 aB; // style, seed, base y, top y
    varying vec4 vB;
    varying vec3 vPos;
    varying vec2 vUv2;
    varying float vUp;
  `,
  vertex: /* glsl */ `
    vB = aB;
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv2 = uv;
    vUp = normal.y;
  `,
  fragmentPars: /* glsl */ `
    varying vec4 vB;
    varying vec3 vPos;
    varying vec2 vUv2;
    varying float vUp;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1,0), 1.0)), c = hash(vec3(i + vec2(0,1), 1.0)), d = hash(vec3(i + 1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    // Per style: bay width, floor height, window w, window h, wall colour, glass tint.
    void styleOf(float s, float seed, out vec4 g, out vec3 wall, out vec3 glass){
      if (s < 0.5)      { g = vec4(3.6, 3.8, 1.5, 2.2); wall = vec3(0.6, 0.58, 0.54); glass = vec3(0.14, 0.17, 0.21); }   // granite
      else if (s < 1.5) { g = vec4(3.1, 4.2, 1.2, 2.3); wall = vec3(0.5, 0.46, 0.41); glass = vec3(0.1, 0.12, 0.15); }  // gothic rubble stone
      else if (s < 2.5) { g = vec4(1.6, 4.0, 1.52, 3.7); wall = vec3(0.5, 0.54, 0.58); glass = vec3(0.16, 0.25, 0.33); }   // curtain wall
      else if (s < 3.5) { g = vec4(3.0, 3.7, 2.7, 1.6); wall = vec3(0.78, 0.78, 0.76); glass = vec3(0.16, 0.22, 0.28); }  // hospital ribbon
      else if (s < 4.5) { g = vec4(2.8, 3.0, 1.1, 1.3); wall = vec3(0.7, 0.62, 0.52); glass = vec3(0.15, 0.17, 0.19); }  // dorm
      else {
        g = vec4(3.2, 3.0, 1.3, 1.4);
        float k = floor(seed * 5.0);
        wall = k < 1.0 ? vec3(0.66, 0.63, 0.58) : k < 2.0 ? vec3(0.58, 0.49, 0.42) : k < 3.0 ? vec3(0.5, 0.31, 0.24) : k < 4.0 ? vec3(0.76, 0.75, 0.72) : vec3(0.46, 0.49, 0.52);
        glass = vec3(0.16, 0.18, 0.2);
      }
    }
  `,
  color: /* glsl */ `
    float bStyle = vB.x, bSeed = vB.y, bBase = vB.z, bTop = vB.w;
    vec4 g; vec3 wall; vec3 glass;
    styleOf(bStyle, bSeed, g, wall, glass);
    float hgt = vPos.y - bBase;
    float isWall = 1.0 - step(0.5, abs(vUp));
    float winMask = 0.0;
    float lit = 0.0;
    if (isWall > 0.5) {
      // Masonry courses and weathering.
      float course = smoothstep(0.02, 0.0, abs(fract(hgt / 0.62) - 0.5) - 0.47);
      wall *= 0.92 + 0.12 * vnoise(vec2(vUv2.x * 0.7, hgt * 1.3) + bSeed * 50.0) - course * 0.06 * step(bStyle, 1.5);
      wall *= 0.9 + 0.1 * smoothstep(0.0, 3.0, hgt);
      float fl = floor(hgt / g.y);
      float bay = floor(vUv2.x / g.x);
      vec2 cell = vec2(fract(vUv2.x / g.x) * g.x - g.x * 0.5, fract(hgt / g.y) * g.y - g.y * 0.45);
      float inWin = step(abs(cell.x), g.z * 0.5) * step(abs(cell.y), g.w * 0.5);
      // No windows in the parapet band; gothic halls get mullions.
      inWin *= step(hgt, bTop - bBase - 0.9) * step(0.9, hgt);
      if (bStyle > 0.5 && bStyle < 1.5) inWin *= step(0.07, abs(cell.x)) * step(0.07, abs(cell.y - 0.3));
      winMask = inWin;
      float r = hash(vec3(fl, bay, bSeed * 91.0));
      lit = inWin * step(0.82, r);
      // Glass mirrors the golden sky toward the top of each pane.
      vec3 sky = mix(vec3(0.95, 0.72, 0.45), vec3(0.45, 0.6, 0.8), clamp(cell.y / g.w + 0.5, 0.0, 1.0));
      vec3 glassCol = mix(glass, sky, 0.28 + 0.2 * r);
      wall = mix(wall, glassCol, inWin);
    } else {
      // Roofs: concrete with vents and tar joints.
      float n = vnoise(vPos.xz * 0.35 + bSeed * 20.0);
      wall = mix(vec3(0.42, 0.42, 0.41), vec3(0.52, 0.51, 0.49), n) * (0.9 + 0.1 * bSeed);
      wall *= 1.0 - 0.15 * step(0.93, fract(vPos.x * 0.12)) * step(0.5, fract(vPos.z * 0.05));
    }
    diffuseColor.rgb = wall;
  `,
  roughness: /* glsl */ `
    roughnessFactor = mix(0.85, 0.18, winMask);
  `,
  metalness: /* glsl */ `
    metalnessFactor = mix(0.0, 0.55, winMask);
  `,
  emissive: /* glsl */ `
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.4) * lit * 0.9;
  `,
}

function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + buildingChunks.vertexPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + buildingChunks.vertex)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + buildingChunks.fragmentPars)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + buildingChunks.color)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + buildingChunks.roughness)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + buildingChunks.metalness)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + buildingChunks.emissive)
  }
  mat.customProgramCacheKey = () => 'yonsei-building'
  return mat
}

// Oriented bounding rectangle of a footprint (for gothic roofs and towers).
function obb(pts) {
  let best = null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])
    const c = Math.cos(a)
    const s = Math.sin(a)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, z] of pts) {
      const u = x * c + z * s
      const v = -x * s + z * c
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (!best || area < best.area) best = { area, a, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, L: u1 - u0, W: v1 - v0 }
  }
  const { a, cu, cv } = best
  return { ...best, cx: cu * Math.cos(a) - cv * Math.sin(a), cz: cu * Math.sin(a) + cv * Math.cos(a) }
}

// Hipped slate roof over an L x W rectangle (ridge along L), apex at rh.
function hipRoof(L, W, rh) {
  const l = L / 2
  const w = W / 2
  const r = Math.max(0, l - w)
  const v = [
    [-l, 0, -w], [l, 0, -w], [r, rh, 0], [-r, rh, 0], // side A
    [l, 0, w], [-l, 0, w], [-r, rh, 0], [r, rh, 0], // side B
  ]
  const pos = []
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  quad(v[0], v[3], v[2], v[1])
  quad(v[4], v[7], v[6], v[5])
  pos.push(...[l, 0, -w], ...[r, rh, 0], ...[l, 0, w]) // hip ends
  pos.push(...[-l, 0, w], ...[-r, rh, 0], ...[-l, 0, -w])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

export class Baekyang {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.6))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.5
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(58, 1, 2, 6000)
    this.progress = 0
    this.boost = 0
    this.mouse = new THREE.Vector2()
    this.time = 0
    this.heights = null

    this.#buildSky()
    this.#buildGround()
    this.#buildBuildings()
    this.#buildTrees()
    this.#buildRoute()
    this.#buildHalls()
    this.#buildStatue()
    this.#loadTerrain()

    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    canvas.addEventListener('pointerenter', () => (this.hover = true))
    canvas.addEventListener('pointerleave', () => (this.hover = false))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // Ground height (scene y) at x, z from the heightmap; 0 until it loads.
  groundAt(x, z) {
    const h = this.heights
    if (!h) return 0
    const fx = THREE.MathUtils.clamp((x - T.x0) / T.step, 0, T.w - 1.001)
    const fz = THREE.MathUtils.clamp((z - T.z0) / T.step, 0, T.h - 1.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const a = h[j * T.w + i] * (1 - tx) + h[j * T.w + i + 1] * tx
    const b = h[(j + 1) * T.w + i] * (1 - tx) + h[(j + 1) * T.w + i + 1] * tx
    return a * (1 - tz) + b * tz
  }

  #buildSky() {
    const sky = new Sky()
    sky.scale.setScalar(20000)
    const u = sky.material.uniforms
    u.turbidity.value = 7
    u.rayleigh.value = 2.2
    u.mieCoefficient.value = 0.006
    u.mieDirectionalG.value = 0.85
    u.sunPosition.value.copy(SUN)
    this.scene.add(sky)
    // Reflections from the same sky.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    envScene.add(sky.clone())
    this.scene.environment = pmrem.fromScene(envScene, 0, 1, 30000).texture
    this.scene.environmentIntensity = 0.35
    pmrem.dispose()
    this.scene.fog = new THREE.Fog('#a9b4c0', 900, 3800)

    this.sun = new THREE.DirectionalLight('#ffc98f', 3.2)
    this.sun.castShadow = true
    const sm = MOBILE ? 1024 : 2048
    this.sun.shadow.mapSize.set(sm, sm)
    const c = this.sun.shadow.camera
    c.left = c.bottom = -330
    c.right = c.top = 330
    c.near = 10
    c.far = 1600
    c.updateProjectionMatrix()
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.6
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight('#a9c3e6', '#5a4d3c', 0.55))
  }

  // Ground texture painted from OSM land areas and streets; relief from DEM.
  #buildGround() {
    const W = X1 - T.x0
    const D = Z1 - T.z0
    const CW = MOBILE ? 2048 : 4096
    const CH = Math.round((CW * D) / W)
    const cv = document.createElement('canvas')
    cv.width = CW
    cv.height = CH
    const ctx = cv.getContext('2d')
    const sx = CW / W
    const P = (x, z) => [(x - T.x0) * sx, (z - T.z0) * sx]
    ctx.fillStyle = '#7b7b78'
    ctx.fillRect(0, 0, CW, CH)
    // Grain so large areas never look flat.
    for (let i = 0; i < CW * CH * 0.004; i++) {
      const v = 120 + Math.random() * 40
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`
      ctx.fillRect(Math.random() * CW, Math.random() * CH, 2 + Math.random() * 3, 2 + Math.random() * 3)
    }
    const FILL = { urban: '#807e79', campus: '#9d978a', dirt: '#9b8a6b', grass: '#6f8a47', wood: '#3f5a2e', parking: '#77736d', pitch: '#4f8a3c', track: '#a8553f', water: '#4c6f86', rock: '#8a857b' }
    for (const a of WORLD.areas) {
      ctx.beginPath()
      a.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x, z)) : ctx.moveTo(...P(x, z))))
      ctx.closePath()
      ctx.fillStyle = FILL[a.k]
      ctx.fill()
      if (a.k === 'wood' || a.k === 'grass') {
        // Mottled canopy / lawn.
        ctx.save()
        ctx.clip()
        const xs = a.p.map((p) => P(...p)[0])
        const ys = a.p.map((p) => P(...p)[1])
        const [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        const n = Math.min(4000, ((maxx - minx) * (maxy - miny)) / (a.k === 'wood' ? 60 : 140))
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = a.k === 'wood' ? `rgba(${30 + Math.random() * 40},${60 + Math.random() * 40},${25 + Math.random() * 20},0.55)` : `rgba(${100 + Math.random() * 30},${130 + Math.random() * 30},${60 + Math.random() * 20},0.35)`
          const r = (a.k === 'wood' ? 3 : 2) * sx * (1 + Math.random() * 2)
          ctx.beginPath()
          ctx.arc(minx + Math.random() * (maxx - minx), miny + Math.random() * (maxy - miny), r, 0, 7)
          ctx.fill()
        }
        ctx.restore()
      }
      if (a.k === 'pitch') {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 0.4 * sx
        ctx.stroke()
      }
    }
    // Streets: asphalt with a lighter edge; walks in pale paving.
    const WID = { w: 14, r: 7, p: 9, f: 3 }
    const COL = { w: '#4a4a4c', r: '#57575a', p: '#b8ad9c', f: '#c2b7a5' }
    for (const k of ['w', 'r', 'p', 'f']) {
      for (const pass of [0, 1]) {
        for (const s of DATA.paths) {
          if (s.k !== k) continue
          ctx.beginPath()
          s.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x, z)) : ctx.moveTo(...P(x, z))))
          ctx.strokeStyle = pass ? COL[k] : 'rgba(40,38,34,0.35)'
          ctx.lineWidth = (WID[k] + (pass ? 0 : 1.2)) * sx
          ctx.lineCap = ctx.lineJoin = 'round'
          ctx.stroke()
        }
      }
    }
    // Building contact shadows (ambient occlusion at the walls' feet).
    ctx.fillStyle = 'rgba(30,26,22,0.35)'
    for (const b of DATA.buildings) {
      ctx.beginPath()
      b.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x + 1, z + 1)) : ctx.moveTo(...P(x + 1, z + 1))))
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const seg = MOBILE ? 2 : 1
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / (10 * seg)), Math.round(D / (10 * seg)))
    geo.rotateX(-Math.PI / 2)
    geo.translate(T.x0 + W / 2, 0, T.z0 + D / 2)
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
    this.ground.receiveShadow = true
    this.scene.add(this.ground)
  }

  async #loadTerrain() {
    const img = new Image()
    img.src = '/terrain.png'
    await img.decode()
    const c = document.createElement('canvas')
    c.width = T.w
    c.height = T.h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, T.w, T.h).data
    const h = new Float32Array(T.w * T.h)
    for (let i = 0; i < h.length; i++) h[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 100 + T.hmin
    this.heights = h
    const pos = this.ground.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundAt(pos.getX(i), pos.getZ(i)) - 0.3)
    pos.needsUpdate = true
    this.ground.geometry.computeVertexNormals()
    // Things placed on the ground follow the relief.
    for (const t of this.targets) if (t.key) t.anchor.y = this.groundAt(t.anchor.x, t.anchor.z) + t.lift
    if (this.statue) this.statue.position.y = this.groundAt(this.statue.position.x, this.statue.position.z) + 10 - PILLAR_TOP * 5.2
    this.#buildClearance()
    this.#buildCameraPath()
  }

  // Safe-height map: the highest thing (ground, roof, tower, tree, statue) in
  // each 10 m cell, grown by 30 m so anything flying keeps its distance.
  #buildClearance() {
    const C = 10
    const gw = Math.ceil((X1 - T.x0) / C) + 1
    const gh = Math.ceil((Z1 - T.z0) / C) + 1
    const top = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const x = T.x0 + i * C
        const z = T.z0 + j * C
        top[j * gw + i] = Math.max(this.groundAt(x, z), this.groundAt(x + C, z), this.groundAt(x, z + C), this.groundAt(x + C, z + C))
      }
    const raise = (x0, x1, z0, z1, y) => {
      const i0 = Math.max(0, Math.floor((x0 - T.x0) / C))
      const i1 = Math.min(gw - 1, Math.floor((x1 - T.x0) / C))
      const j0 = Math.max(0, Math.floor((z0 - T.z0) / C))
      const j1 = Math.min(gh - 1, Math.floor((z1 - T.z0) / C))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) top[j * gw + i] = Math.max(top[j * gw + i], y)
    }
    DATA.buildings.forEach((b, k) => {
      const xs = b.p.map((p) => p[0])
      const zs = b.p.map((p) => p[1])
      const tower = /언더우드관|스팀슨관|아펜젤러관/.test(b.n || '') && WORLD.styles[k] === 'g'
      raise(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), WORLD.bases[k] + b.h * (tower ? 1.8 : 1) + (WORLD.styles[k] === 'g' ? 9 : 0))
    })
    for (let k = 0; k < WORLD.trees.length; k += 4) {
      const [x, z, y, sc] = WORLD.trees.slice(k, k + 4)
      raise(x - 4, x + 4, z - 4, z + 4, y + 11 * sc)
    }
    const [ex, ez] = DATA.landmarks.eagle
    raise(ex - 5, ex + 5, ez - 5, ez + 5, this.groundAt(ex, ez) + 24)
    // Grow by R cells (separable max filter).
    const R = 3
    const tmp = new Float32Array(top.length)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        let m = -1e9
        for (let d = -R; d <= R; d++) m = Math.max(m, top[j * gw + Math.min(gw - 1, Math.max(0, i + d))])
        tmp[j * gw + i] = m
      }
    const out = new Float32Array(top.length)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        let m = -1e9
        for (let d = -R; d <= R; d++) m = Math.max(m, tmp[Math.min(gh - 1, Math.max(0, j + d)) * gw + i])
        out[j * gw + i] = m
      }
    this.clear = { data: out, gw, gh, C }
  }

  // Highest obstacle within ~30 m of x, z (ground if unknown).
  clearAt(x, z) {
    const c = this.clear
    if (!c) return this.groundAt(x, z)
    const i = THREE.MathUtils.clamp(Math.floor((x - T.x0) / c.C), 0, c.gw - 2)
    const j = THREE.MathUtils.clamp(Math.floor((z - T.z0) / c.C), 0, c.gh - 2)
    const d = c.data
    return Math.max(d[j * c.gw + i], d[j * c.gw + i + 1], d[(j + 1) * c.gw + i], d[(j + 1) * c.gw + i + 1])
  }

  // The whole scroll flight, precomputed: sampled along the tour, lifted over
  // every obstacle (for the camera and the eagle ahead of it), then smoothed
  // so it glides with no kinks or swings.
  #buildCameraPath() {
    const N = 900
    const A = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), lx: new Float32Array(N), ly: new Float32Array(N), lz: new Float32Array(N) }
    const tan = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      const p = this.route.getPointAt(u)
      tan.set(0, 0, 0)
      for (let k = -6; k <= 6; k++) tan.add(this.route.getTangentAt(THREE.MathUtils.clamp(u + k * 0.012, 0, 1)))
      tan.setY(0).normalize()
      const up = THREE.MathUtils.smoothstep(u, 0.9, 1)
      const start = Math.max(0, 1 - u * 12)
      const back = 95 + start * 120 + up * 520
      A.x[i] = p.x - tan.x * back
      A.z[i] = p.z - tan.z * back
      A.y[i] = Math.max(this.groundAt(p.x, p.z), 0) + 62 + start * 80 + up * 420
      const q = this.route.getPointAt(Math.min(1, u + 0.035))
      A.lx[i] = THREE.MathUtils.lerp(q.x, 60, up)
      A.lz[i] = THREE.MathUtils.lerp(q.z, -380, up)
      A.ly[i] = this.groundAt(q.x, q.z) + 18
    }
    const blur = (arr, r, passes = 3) => {
      const t = new Float32Array(arr.length)
      for (let p = 0; p < passes; p++) {
        for (let i = 0; i < arr.length; i++) {
          let s = 0
          let n = 0
          for (let d = -r; d <= r; d++) {
            const k = Math.min(arr.length - 1, Math.max(0, i + d))
            s += arr[k]
            n++
          }
          t[i] = s / n
        }
        arr.set(t)
      }
    }
    for (const k of ['x', 'z', 'lx', 'lz', 'ly']) blur(A[k], 14)
    // Height that clears the obstacles under the camera and under the eagle
    // (55 m ahead, 11 m below), then smoothed without dipping below it.
    const need = new Float32Array(N)
    const v = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      v.set(A.lx[i] - A.x[i], 0, A.lz[i] - A.z[i]).normalize()
      need[i] = Math.max(this.clearAt(A.x[i], A.z[i]) + 28, this.clearAt(A.x[i] + v.x * 55, A.z[i] + v.z * 55) + 24)
      A.y[i] = Math.max(A.y[i], need[i])
    }
    const maxf = (arr, r) => {
      const t = arr.slice()
      for (let i = 0; i < arr.length; i++) {
        let m = -1e9
        for (let d = -r; d <= r; d++) m = Math.max(m, t[Math.min(arr.length - 1, Math.max(0, i + d))])
        arr[i] = m
      }
    }
    maxf(A.y, 30)
    blur(A.y, 16)
    for (let i = 0; i < N; i++) A.y[i] = Math.max(A.y[i], need[i])
    blur(A.y, 6, 2)
    // Re-sample by travelled distance (camera plus aim) so the glide keeps
    // an even speed through bends instead of crawling and then lurching.
    const cum = new Float32Array(N)
    for (let i = 1; i < N; i++)
      cum[i] = cum[i - 1] + Math.hypot(A.x[i] - A.x[i - 1], A.y[i] - A.y[i - 1], A.z[i] - A.z[i - 1]) + 0.6 * Math.hypot(A.lx[i] - A.lx[i - 1], A.lz[i] - A.lz[i - 1])
    const R = {}
    for (const k of Object.keys(A)) R[k] = new Float32Array(N)
    let j = 0
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * cum[N - 1]
      while (j < N - 2 && cum[j + 1] < s) j++
      const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])
      for (const k of Object.keys(A)) R[k][i] = A[k][j] + (A[k][j + 1] - A[k][j]) * t
    }
    this.path = { ...R, N }
    // Lock-ons peak when the aim passes closest to each landmark.
    for (const tg of this.targets) {
      let best = 0
      let bd = Infinity
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(R.lx[i] - tg.anchor.x, R.lz[i] - tg.anchor.z)
        if (d < bd) (bd = d), (best = i)
      }
      tg.u = best / (N - 1)
    }
  }

  #buildBuildings() {
    const walls = []
    const roofs = []
    const tiers = []
    DATA.buildings.forEach((b, i) => {
      const base = WORLD.bases[i]
      const s = STYLE[WORLD.styles[i]]
      if (s === STYLE.a) {
        // 노천극장: stepped seating rings falling toward the stage.
        const cx = b.p.reduce((a, p) => a + p[0], 0) / b.p.length
        const cz = b.p.reduce((a, p) => a + p[1], 0) / b.p.length
        const ring = (k) => b.p.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, -(cz + (z - cz) * k)))
        const N = 14
        for (let k = 0; k < N; k++) {
          const sh = new THREE.Shape(ring(1 - (k / N) * 0.72))
          sh.holes.push(new THREE.Path(ring(1 - ((k + 1) / N) * 0.72).reverse()))
          const g = new THREE.ExtrudeGeometry(sh, { depth: 1 + (N - k) * 0.75, bevelEnabled: false })
          g.rotateX(-Math.PI / 2)
          g.translate(0, base - 1, 0)
          tiers.push(g)
        }
        const stage = new THREE.Shape(ring(0.28))
        const sg = new THREE.ExtrudeGeometry(stage, { depth: 1.2, bevelEnabled: false })
        sg.rotateX(-Math.PI / 2)
        sg.translate(0, base - 1, 0)
        tiers.push(sg)
        return
      }
      const seed = ((i * 0.6180339) % 1 + 1) % 1
      const shape = new THREE.Shape(b.p.map(([x, z]) => new THREE.Vector2(x, -z)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h + 1, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, base - 1, 0)
      const n = geo.attributes.position.count
      const a = new Float32Array(n * 4)
      for (let k = 0; k < n; k++) a.set([s, seed, base, base + b.h], k * 4)
      geo.setAttribute('aB', new THREE.BufferAttribute(a, 4))
      walls.push(geo)
      // Gothic stone halls get hipped slate roofs, and the three great halls a tower.
      if (s === STYLE.g) {
        const o = obb(b.p)
        const roof = hipRoof(o.L + 1, o.W + 1, Math.min(9, o.W * 0.42))
        roof.rotateY(-o.a)
        roof.translate(o.cx, base + b.h, o.cz)
        roofs.push(roof)
        if (/언더우드관|스팀슨관|아펜젤러관/.test(b.n)) {
          const tw = Math.min(11, o.W * 0.7)
          const m = new THREE.Matrix4().makeRotationY(-o.a).setPosition(o.cx, 0, o.cz)
          const t2 = new THREE.BoxGeometry(tw, b.h * 0.75, tw)
          t2.translate(0, base + b.h + (b.h * 0.75) / 2, 0)
          t2.applyMatrix4(m)
          roofs.push(t2)
          for (let q = 0; q < 8; q++) {
            // Crenellations around the tower top.
            const side = q % 4
            const off = q < 4 ? -0.3 : 0.3
            const mx = side === 0 ? tw / 2 : side === 1 ? -tw / 2 : off * tw
            const mz = side === 2 ? tw / 2 : side === 3 ? -tw / 2 : off * tw
            const mer = new THREE.BoxGeometry(1.4, 1.4, 1.4)
            mer.translate(mx, base + b.h * 1.75 + 0.7, mz)
            mer.applyMatrix4(m)
            roofs.push(mer)
          }
        }
      }
    })
    if (tiers.length) {
      const seats = new THREE.Mesh(mergeGeometries(tiers), new THREE.MeshStandardMaterial({ color: '#9c968b', roughness: 0.9 }))
      seats.castShadow = seats.receiveShadow = true
      this.scene.add(seats)
    }
    this.buildings = new THREE.Mesh(mergeGeometries(walls), buildingMaterial())
    this.buildings.castShadow = this.buildings.receiveShadow = true
    this.scene.add(this.buildings)
    if (roofs.length) {
      const slate = new THREE.Mesh(mergeGeometries(roofs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g))), new THREE.MeshStandardMaterial({ color: '#4c4f54', roughness: 0.7 }))
      slate.castShadow = slate.receiveShadow = true
      this.scene.add(slate)
    }
  }

  // Mapped trees, tree rows and forest cover as instanced low-poly trees.
  #buildTrees() {
    const trunk = new THREE.CylinderGeometry(0.3, 0.45, 4, 5)
    trunk.translate(0, 2, 0)
    const crown = new THREE.IcosahedronGeometry(3.4, 0)
    crown.scale(1, 1.15, 1)
    crown.translate(0, 6.4, 0)
    const crown2 = new THREE.IcosahedronGeometry(2.4, 0)
    crown2.translate(1.2, 8.3, 0.6)
    const parts = [trunk, crown, crown2].map((g) => {
      g = g.index ? g.toNonIndexed() : g
      g.deleteAttribute('uv')
      return g
    })
    const colors = parts.map((g, k) => {
      const c = new Float32Array(g.attributes.position.count * 3)
      const col = k === 0 ? [0.28, 0.2, 0.14] : [1, 1, 1]
      for (let i = 0; i < c.length; i += 3) c.set(col, i)
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
      return g
    })
    const geo = mergeGeometries(colors)
    const all = WORLD.trees.length / 4
    const pick = MOBILE ? 2 : 1
    const n = Math.floor(all / pick)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), n)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      const [x, z, y, s] = WORLD.trees.slice(i * pick * 4, i * pick * 4 + 4)
      q.setFromEuler(e.set(0, (i * 2.399) % 6.28, 0))
      m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(s, s * (0.9 + ((i * 0.37) % 0.3)), s))
      mesh.setMatrixAt(i, m)
      c.setHSL(0.22 + ((i * 0.131) % 0.1), 0.5, 0.17 + ((i * 0.071) % 0.09))
      mesh.setColorAt(i, c)
    }
    mesh.castShadow = !MOBILE
    mesh.receiveShadow = false
    this.scene.add(mesh)
  }

  #buildRoute() {
    // Camera path: a loop over the whole campus through its landmarks.
    const pts = WORLD.tour.map(([x, z]) => new THREE.Vector3(x, 0, z))
    this.route = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)

    const hallOf = (name) => {
      let best = null
      DATA.buildings.forEach((b, i) => {
        if (b.n !== name) return
        const xs = b.p.map((p) => p[0])
        const zs = b.p.map((p) => p[1])
        const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))
        if (!best || size > best.size) best = { b, i, xs, zs, size }
      })
      return best
    }
    this.targets = TARGETS.map((t) => {
      let anchor
      let box = null
      let lift = 0
      if (t.key) {
        const [x, z] = DATA.landmarks[t.key]
        lift = t.key === 'eagle' ? 16 : 12
        anchor = new THREE.Vector3(x, lift, z)
      } else {
        const { b, i, xs, zs } = hallOf(t.hall)
        const base = WORLD.bases[i]
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2
        const cz = (Math.max(...zs) + Math.min(...zs)) / 2
        anchor = new THREE.Vector3(cx, base + b.h + 6, cz)
        box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(...xs) - Math.min(...xs) + 6, b.h + 6, Math.max(...zs) - Math.min(...zs) + 6)),
          new THREE.LineBasicMaterial({ color: '#8db8ff', transparent: true, opacity: 0, fog: false }),
        )
        box.position.set(cx, base + (b.h + 6) / 2, cz)
        this.scene.add(box)
      }
      let bestU = 0
      let bestD = Infinity
      for (let k = 0; k <= 400; k++) {
        const q = this.route.getPointAt(k / 400)
        const d = Math.hypot(q.x - anchor.x, q.z - anchor.z)
        if (d < bestD) (bestD = d), (bestU = k / 400)
      }
      return { ...t, anchor, box, lift, u: bestU }
    })
  }

  // Every named campus building gets a name tag (one per name, on its largest
  // footprint); lock-on targets keep their reticles instead.
  #buildHalls() {
    const locked = new Set(TARGETS.map((t) => t.hall).filter(Boolean))
    const best = new Map()
    DATA.buildings.forEach((b, i) => {
      if (!b.c || !b.n || locked.has(b.n)) return
      let area = 0
      let cx = 0
      let cz = 0
      b.p.forEach(([x, z], k) => {
        const [x2, z2] = b.p[(k + 1) % b.p.length]
        area += x * z2 - x2 * z
        cx += x
        cz += z
      })
      area = Math.abs(area / 2)
      if ((best.get(b.n)?.area ?? -1) < area)
        best.set(b.n, { name: b.n, code: b.code, lv: b.lv, style: WORLD.styles[i], area, size: Math.sqrt(area), anchor: new THREE.Vector3(cx / b.p.length, WORLD.bases[i] + b.h + 3, cz / b.p.length) })
    })
    this.halls = [...best.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    // Directory: every named hall, lock-on ones included.
    this.directory = [
      ...this.halls,
      ...this.targets.filter((t) => t.hall).map((t) => ({ name: t.name, code: t.code, en: t.en, body: t.body, anchor: t.anchor, size: 60 })),
      ...this.targets.filter((t) => t.key && t.key !== 'gate').map((t) => ({ name: t.name, en: t.en, body: t.body, anchor: t.anchor, size: 40, key: t.key })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  // The real statue on its 10 m pillar (bronze eagle, 5.2 m wingspan),
  // facing down 백양로 toward the main gate.
  #buildStatue() {
    const [x, z] = DATA.landmarks.eagle
    const span = 5.2
    const g = new THREE.Group()
    g.scale.setScalar(span)
    g.position.set(x, 10 - PILLAR_TOP * span, z)
    const [gx, gz] = DATA.landmarks.gate
    g.rotation.y = Math.atan2(gx - x, gz - z)
    const pillar = buildPillar(10 / span, new THREE.MeshStandardMaterial({ color: '#e4e0d8', roughness: 0.8 }))
    pillar.traverse((o) => o.isMesh && (o.castShadow = true))
    g.add(pillar)
    buildEagle().then((e) => {
      e.traverse((o) => o.isMesh && (o.castShadow = true))
      g.add(e)
    })
    this.statue = g
    this.scene.add(g)

    // The eagle you follow.
    this.flier = new THREE.Group()
    this.flier.visible = false
    this.scene.add(this.flier)
    buildEagle().then((e) => {
      e.scale.setScalar(15)
      e.rotation.x = 0.55
      this.flierModel = e
      this.flier.add(e)
      this.flier.visible = true
    })
    this.flapPhase = 0
    this.bank = 0
  }

  // Directory: fly over to circle a hall; scrolling hands control back.
  flyTo(h) {
    this.free = { hall: h, t: 0, from: this.camera.position.clone(), fromLook: this.look.clone(), progress: this.progress, ang: Math.atan2(this.camera.position.x - h.anchor.x, this.camera.position.z - h.anchor.z) }
  }

  exitFree() {
    if (!this.free) return
    this.blend = { t: 0, pos: this.camera.position.clone(), look: this.look.clone() }
    this.free = null
    this.onExitFree?.()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 74 : 58
    this.camera.updateProjectionMatrix()
  }

  // A still of the campus (used to bake the hero and finale backdrops):
  // the flying eagle, statue and lock-on boxes are left out.
  still(pos, look, { w = 2400, h = 1500, fov = 50, statue = false } = {}) {
    const keep = [this.flier.visible, this.statue.visible]
    this.flier.visible = false
    this.statue.visible = statue
    for (const t of this.targets) if (t.box) t.box.visible = false
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
    this.camera.position.set(...pos)
    this.camera.lookAt(...look)
    this.sun.target.position.set(...look)
    this.sun.position.set(...look).addScaledVector(SUN, 900)
    this.renderer.render(this.scene, this.camera)
    const url = this.canvas.toDataURL('image/jpeg', 0.88)
    ;[this.flier.visible, this.statue.visible] = keep
    for (const t of this.targets) if (t.box) t.box.visible = true
    this.resize()
    return url
  }

  // Screen position of a world point, or null if behind the camera.
  screen(v) {
    const p = v.clone().project(this.camera)
    if (p.z > 1) return null
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight }
  }

  #tourPose(u) {
    const up = THREE.MathUtils.smoothstep(u, 0.9, 1)
    this.overview = up
    const P = this.path
    const pos = new THREE.Vector3()
    const look = new THREE.Vector3()
    if (P) {
      const f = u * (P.N - 1)
      const i = Math.min(P.N - 2, Math.floor(f))
      const t = f - i
      const L = (a) => a[i] + (a[i + 1] - a[i]) * t
      pos.set(L(P.x), L(P.y), L(P.z))
      look.set(L(P.lx), L(P.ly), L(P.lz))
    } else {
      // Terrain still loading: hold high over the main gate.
      const [gx, gz] = DATA.landmarks.gate
      pos.set(gx, 200, gz + 260)
      look.set(gx, 0, gz - 100)
    }
    // Gentle pointer steer, never into anything.
    const side = new THREE.Vector3(look.z - pos.z, 0, pos.x - look.x).normalize()
    pos.addScaledVector(side, -this.mouse.x * 12 * (1 - up))
    pos.y += this.mouse.y * 6 * (1 - up)
    pos.y = Math.max(pos.y, this.clearAt(pos.x, pos.z) + 22)
    // Portrait screens see more sky, so they look further down.
    look.y -= this.portrait ? 45 + up * 170 : 0
    return { pos, look }
  }

  render(dt) {
    this.time += dt
    this.boost += ((this.hover && !this.free ? 0.03 : 0) - this.boost) * Math.min(1, dt * 2)
    const u = Math.min(1, this.progress + this.boost * (1 - this.progress))
    // Critically damped follow of the scroll position.
    this.u = this.u === undefined ? u : this.u + (u - this.u) * (1 - Math.exp(-dt * 2.6))
    this.look ??= new THREE.Vector3()

    let pose = this.#tourPose(this.u)
    if (this.free && Math.abs(this.progress - this.free.progress) > 0.004) this.exitFree()
    if (this.free) {
      const f = this.free
      const h = f.hall
      f.t += dt
      f.ang += dt * 0.1
      const r = Math.max(80, h.size * 1.9)
      const orbit = new THREE.Vector3(h.anchor.x + Math.sin(f.ang) * r, 0, h.anchor.z + Math.cos(f.ang) * r)
      orbit.y = Math.max(h.anchor.y + 30 + r * 0.3, this.clearAt(orbit.x, orbit.z) + 30)
      const k = THREE.MathUtils.smootherstep(f.t, 0, 3.2)
      // Up and over on the way, clear of every roof.
      const mid = f.from.clone().lerp(orbit, k)
      mid.y = Math.max(mid.y + Math.sin(k * Math.PI) * 70, this.clearAt(mid.x, mid.z) + 30)
      pose = { pos: mid, look: f.fromLook.clone().lerp(h.anchor, THREE.MathUtils.smootherstep(f.t, 0, 2.4)) }
      this.overview = 0
    } else if (this.blend) {
      this.blend.t += dt
      const k = THREE.MathUtils.smootherstep(this.blend.t, 0, 2)
      const p = this.blend.pos.clone().lerp(pose.pos, k)
      p.y = Math.max(p.y + Math.sin(k * Math.PI) * 40, this.clearAt(p.x, p.z) + 25)
      pose = { pos: p, look: this.blend.look.clone().lerp(pose.look, k) }
      if (k >= 1) this.blend = null
    }
    // Low-pass the pose so nothing snaps: position, aim and roll.
    const a = 1 - Math.exp(-dt * 6)
    if (!this.placed) {
      this.camera.position.copy(pose.pos)
      this.look.copy(pose.look)
      this.placed = true
    }
    this.camera.position.lerp(pose.pos, a)
    this.look.lerp(pose.look, a)
    this.aim ??= new THREE.PerspectiveCamera() // camera lookAt convention (-z forward)
    this.aim.position.copy(this.camera.position)
    this.aim.lookAt(this.look)
    this.camQ ??= this.aim.quaternion.clone()
    this.camQ.slerp(this.aim.quaternion, 1 - Math.exp(-dt * 5))
    this.roll = (this.roll ?? 0) + ((this.free ? 0 : -this.mouse.x * 0.06) - (this.roll ?? 0)) * (1 - Math.exp(-dt * 3))
    this.camera.quaternion.copy(this.camQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll))

    // Sun and its shadow box follow what we look at.
    this.sun.target.position.copy(this.look)
    this.sun.position.copy(this.look).addScaledVector(SUN, 900)

    this.#flyEagle(dt, u)
    for (const t of this.targets) {
      const d = t.u - this.u
      t.near = this.free ? 0 : Math.max(0, d >= 0 ? 1 - d / 0.08 : 1 + d / 0.03)
      if (t.box) t.box.material.opacity = t.near * 0.9
    }
    this.renderer.render(this.scene, this.camera)
  }

  #flyEagle(dt, u) {
    if (!this.flierModel) return
    const speed = Math.abs(u - (this.lastU ?? u)) / Math.max(dt, 1e-3)
    this.lastU = u
    const want = Math.min(1, speed * 12 + (this.free && this.free.t < 3.2 ? 1 : 0))
    this.beat = (this.beat ?? 0) + (want - (this.beat ?? 0)) * (1 - Math.exp(-dt * 1.5))
    this.flapPhase += dt * (2.4 + this.beat * 5.5)
    poseEagle(this.flierModel, this.flapPhase, 0.5 + this.beat * 0.5)

    // Hold a spot ahead of and below the camera, above every roof; in the
    // overview it flies on ahead.
    const cam = this.camera
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camQ)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQ)
    const ov = this.overview ?? 0
    const pos = cam.position.clone()
      .addScaledVector(fwd, 55 + ov * 260)
      .addScaledVector(up, -11 - ov * 70 + Math.sin(this.flapPhase) * -0.6)
      .addScaledVector(right, -this.mouse.x * 5 + Math.sin(this.time * 0.5) * 2.5)
    pos.y = Math.max(pos.y, this.clearAt(pos.x, pos.z) + 6)
    if (!this.flier.userData.placed) this.flier.position.copy(pos)
    this.flier.userData.placed = true
    this.flier.position.lerp(pos, 1 - Math.exp(-dt * 4))
    // Heading eases round; bank follows the turn rate.
    const dir = fwd.clone().setY(0).normalize()
    this.eDir ??= dir.clone()
    const prev = this.eDir.clone()
    this.eDir.lerp(dir, 1 - Math.exp(-dt * 3)).normalize()
    const turnRate = (prev.x * this.eDir.z - prev.z * this.eDir.x) / Math.max(dt, 1e-3)
    const bankTo = THREE.MathUtils.clamp(turnRate * 1.2 - this.mouse.x * 0.35, -0.6, 0.6)
    this.bank += (bankTo - this.bank) * (1 - Math.exp(-dt * 2.5))
    this.flier.lookAt(this.flier.position.clone().add(this.eDir))
    this.flier.rotateZ(this.bank)
  }
}
