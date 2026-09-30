import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// The real Earth (NASA Blue Marble day map, city lights on the night side,
// ocean glint and an atmosphere rim) with synapse arcs firing from Sinchon
// via Songdo to world hubs. Drag to spin.

const SINCHON = [37.5658, 126.9386]
const SONGDO = [37.3825, 126.669]
export const HUBS = [
  ['New York', 40.71, -74.0],
  ['London', 51.5, -0.12],
  ['Paris', 48.85, 2.35],
  ['Berlin', 52.52, 13.4],
  ['Tokyo', 35.68, 139.69],
  ['Singapore', 1.35, 103.82],
  ['Sydney', -33.87, 151.21],
  ['San Francisco', 37.77, -122.42],
  ['Toronto', 43.65, -79.38],
  ['São Paulo', -23.55, -46.63],
  ['Beijing', 39.9, 116.4],
  ['Dubai', 25.2, 55.27],
]
const R = 2.2

function ll(lat, lon, r = R) {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r)
}

const shellFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vView;
  // Hex cell distance for a 2D point.
  float hex(vec2 p){
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
  }
  vec2 hexCell(vec2 p){
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    return dot(a, a) < dot(b, b) ? a : b;
  }
  void main(){
    vec3 n = normalize(vPos);
    vec2 uv = vec2(atan(n.z, n.x) * 6.0, asin(n.y) * 6.0);
    float d = hex(hexCell(uv * 3.0));
    float edge = smoothstep(0.45, 0.5, d);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.5);
    float scan = smoothstep(0.02, 0.0, abs(fract(n.y * 2.0 - uTime * 0.15) - 0.5) - 0.48);
    vec3 col = vec3(0.0, 0.45, 1.0) * edge * 0.35 + vec3(0.2, 0.75, 1.0) * fres * 0.7 + vec3(0.3, 0.9, 1.0) * scan * 0.25;
    gl_FragColor = vec4(col, 0.08 + fres * 0.45 + edge * 0.15);
  }
`
const shellVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vView;
  void main(){
    vPos = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`
const arcVert = /* glsl */ `
  varying float vU;
  void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const arcFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOffset;
  uniform vec3 uColor;
  varying float vU;
  void main(){
    float head = fract(uTime * 0.35 + uOffset);
    float g = smoothstep(0.2, 0.0, head - vU) * step(vU, head);
    gl_FragColor = vec4(uColor * (0.25 + g * 2.8), 0.22 + g);
  }
`

export class Globe {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2))
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    this.camera.position.set(0, 0.6, 8.5)
    this.group = new THREE.Group()
    this.scene.add(this.group)
    this.time = 0

    const load = new THREE.TextureLoader()
    const tex = (f, srgb = true) => {
      const t = load.load('/earth/' + f)
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return t
    }
    // Sun fixed in view space (upper left), so the terminator sweeps as it spins.
    this.sunDir = new THREE.Vector3(-0.8, 0.35, 0.55).normalize()
    this.earthU = { uSun: { value: new THREE.Vector3() } }
    const earthMat = new THREE.MeshPhongMaterial({
      map: tex('earth_atmos_2048.jpg'),
      specularMap: tex('earth_specular_2048.jpg', false),
      normalMap: tex('earth_normal_2048.jpg', false),
      normalScale: new THREE.Vector2(0.6, 0.6),
      specular: new THREE.Color('#5b7cab'),
      shininess: 22,
      emissiveMap: tex('earth_lights_2048.png'),
      emissive: new THREE.Color('#ffc27a'),
    })
    // City lights only on the night side.
    earthMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSun = this.earthU.uSun
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSun;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float night = smoothstep(0.1, -0.25, dot(normalize(vNormal), normalize(uSun)));
          totalEmissiveRadiance *= night * 1.6;`)
    }
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMat)
    this.group.add(earth)
    // Atmosphere: a soft blue rim, brighter on the day side.
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.012, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.earthU,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vV;
          void main(){
            float rim = pow(1.0 - max(dot(vN, vV), 0.0), 4.0);
            float day = 0.25 + 0.75 * smoothstep(-0.3, 0.6, dot(vN, normalize(uSun)));
            gl_FragColor = vec4(vec3(0.4, 0.66, 1.0) * rim * day * 1.3, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    )
    this.group.add(atmo)
    this.atmo = atmo
    this.sun = new THREE.DirectionalLight('#fff5e6', 2.6)
    this.scene.add(this.sun, new THREE.AmbientLight('#26375a', 0.35))
    this.shell = earth

    // Arcs: Sinchon -> Songdo, then Songdo -> each hub.
    const sinchon = ll(...SINCHON)
    const songdo = ll(...SONGDO)
    this.arcMats = []
    const arc = (a, b, i, color) => {
      const lift = R * (1.05 + a.distanceTo(b) / (2 * R) * 0.5)
      const c1 = a.clone().lerp(b, 0.25).setLength(lift)
      const c2 = a.clone().lerp(b, 0.75).setLength(lift)
      const mat = new THREE.ShaderMaterial({ vertexShader: arcVert, fragmentShader: arcFrag, uniforms: { uTime: { value: 0 }, uOffset: { value: i * 0.083 }, uColor: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      this.arcMats.push(mat)
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CubicBezierCurve3(a, c1, c2, b), 64, 0.012, 5, false), mat))
    }
    arc(sinchon, songdo, 0, '#ffffff')
    HUBS.forEach(([, la, lo], i) => arc(songdo, ll(la, lo), i + 1, '#9cc4ff'))

    // Nodes.
    const dot = (v, size, color) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color }))
      m.position.copy(v)
      this.group.add(m)
    }
    dot(sinchon, 0.06, '#ffffff')
    dot(songdo, 0.05, '#bfe9ff')
    this.hubAnchors = HUBS.map(([, la, lo]) => {
      const v = ll(la, lo)
      dot(v, 0.035, '#4facfe')
      return v
    })
    this.homeAnchors = [sinchon, songdo]

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.9))
    this.composer.addPass(new OutputPass())

    // Start with Korea facing the viewer.
    this.rotY = -(126.9 * Math.PI) / 180 - Math.PI / 2 + 0.4
    this.vel = 0
    this.tilt = 0.35
    this.#bindDrag()
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #bindDrag() {
    const c = this.canvas
    let drag = null
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY }
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointermove', (e) => {
      if (!drag) return
      this.vel = (e.clientX - drag.x) * 0.006
      this.rotY += this.vel
      this.tilt = THREE.MathUtils.clamp(this.tilt + (e.clientY - drag.y) * 0.004, -0.6, 0.9)
      drag = { x: e.clientX, y: e.clientY }
    })
    const end = () => (drag = null)
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    this.dragging = () => !!drag
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.position.z = w / h < 0.8 ? 12 : 9.2
    // Leave the left third to the headline on wide screens.
    this.group.position.x = w / h < 0.8 ? 0 : 1.25
    this.camera.updateProjectionMatrix()
  }

  // Screen positions of the hubs (for labels), with a facing value.
  hubScreens() {
    const out = []
    const toCam = new THREE.Vector3()
    this.group.updateMatrixWorld()
    for (const a of [...this.homeAnchors, ...this.hubAnchors]) {
      const w = a.clone().applyMatrix4(this.group.matrixWorld)
      const n = w.clone().normalize()
      toCam.copy(this.camera.position).sub(w).normalize()
      const p = w.clone().project(this.camera)
      out.push({ x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, facing: n.dot(toCam) })
    }
    return out
  }

  render(dt) {
    this.time += dt
    if (!this.dragging()) {
      this.vel *= Math.pow(0.05, dt)
      this.rotY += this.vel + dt * 0.08
    }
    this.group.rotation.set(this.tilt, this.rotY, 0)
    // Sun in view space; the atmosphere shell stays with the camera.
    this.sun.position.copy(this.sunDir).multiplyScalar(10)
    this.earthU.uSun.value.copy(this.sunDir)
    for (const m of this.arcMats) m.uniforms.uTime.value = this.time
    this.composer.render()
  }
}
