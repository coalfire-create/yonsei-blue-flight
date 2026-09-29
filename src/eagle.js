import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// A faceted chrome-sapphire eagle built from geometry (no model file).
// Faces +z, up +y, wings along ±x; wingspan ≈ 6 units.

export function sapphireEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}

// Chrome sapphire with a royal-blue/cyan fresnel rim.
export function sapphireMaterial({ rim = new THREE.Color('#4facfe') } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#2458d6',
    metalness: 1,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    flatShading: true,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  })
  mat.userData.rim = { value: rim }
  mat.userData.rimPower = { value: 1 }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = mat.userData.rim
    shader.uniforms.uRimPower = mat.userData.rimPower
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;')
      .replace(
        '#include <dithering_fragment>',
        `float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        gl_FragColor.rgb += uRim * fres * 1.6 * uRimPower;
        #include <dithering_fragment>`,
      )
  }
  return mat
}

function flat(shape, depth = 0.07) {
  // Extrude a (span u, chord v) outline into a thin plate lying in the xz plane.
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 })
  geo.rotateX(Math.PI / 2)
  geo.translate(0, depth / 2, 0)
  return geo
}

function innerWingShape() {
  const s = new THREE.Shape()
  s.moveTo(0, 0.42)
  s.lineTo(0.7, 0.4)
  s.lineTo(1.35, 0.3)
  s.lineTo(1.35, -0.42)
  // Scalloped secondary feathers along the trailing edge.
  for (let i = 0; i <= 4; i++) {
    const u = 1.35 - (i + 0.5) * 0.27
    s.lineTo(u, -0.62 - (i % 2) * 0.04)
    s.lineTo(u - 0.13, -0.5)
  }
  s.lineTo(0, -0.5)
  s.closePath()
  return s
}

function outerWingShape() {
  const s = new THREE.Shape()
  s.moveTo(0, 0.3)
  s.lineTo(0.8, 0.22)
  s.lineTo(1.45, 0.08)
  // Primary feathers fan out as separate "fingers" at the tip.
  const fingers = 6
  for (let i = 0; i < fingers; i++) {
    const a = -0.15 - i * 0.2
    const len = 2.05 - i * 0.07
    s.lineTo(Math.cos(a) * len, Math.sin(a) * len * 0.55 + 0.05)
    const na = a - 0.1
    const nl = len - 0.35
    s.lineTo(Math.cos(na) * nl, Math.sin(na) * nl * 0.55 + 0.02)
  }
  s.lineTo(0.9, -0.5)
  s.lineTo(0, -0.42)
  s.closePath()
  return s
}

function tailShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.22, 0)
  s.lineTo(-0.55, -1.05)
  for (let i = 0; i <= 6; i++) {
    const u = -0.55 + (i * 1.1) / 6
    s.lineTo(u, -1.15 - (i % 2) * 0.07)
  }
  s.lineTo(0.55, -1.05)
  s.lineTo(0.22, 0)
  s.closePath()
  return s
}

export function buildEagle(material) {
  const eagle = new THREE.Group()
  const add = (geo, parent = eagle) => {
    const m = new THREE.Mesh(geo, material)
    parent.add(m)
    return m
  }

  // Body and chest.
  const body = new THREE.IcosahedronGeometry(0.8, 1)
  body.scale(0.78, 0.8, 1.45)
  add(body)
  const chest = new THREE.IcosahedronGeometry(0.66, 1)
  chest.scale(0.82, 0.95, 0.85)
  chest.translate(0, 0.18, 0.6)
  add(chest)

  // Head, brow and hooked beak.
  const head = new THREE.Group()
  head.position.set(0, 0.72, 1.2)
  head.scale.setScalar(1.35)
  eagle.add(head)
  const skull = new THREE.IcosahedronGeometry(0.33, 1)
  skull.scale(0.82, 0.86, 1.15)
  add(skull, head)
  const brow = new THREE.ConeGeometry(0.2, 0.36, 5)
  brow.rotateX(Math.PI / 2)
  brow.scale(1.3, 0.45, 1)
  brow.translate(0, 0.14, 0.18)
  add(brow, head)
  const beak = new THREE.ConeGeometry(0.11, 0.42, 6)
  beak.rotateX(Math.PI / 2 + 0.55)
  beak.translate(0, -0.05, 0.42)
  add(beak, head)

  // Tail fan.
  const tail = flat(tailShape(), 0.05)
  tail.rotateX(-0.18)
  tail.translate(0, -0.05, -0.85)
  add(tail)

  // Wings: shoulder pivot -> inner arm -> wrist pivot -> outer hand.
  const wings = [-1, 1].map((side) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.34, 0.2, 0.25)
    shoulder.scale.x = side
    eagle.add(shoulder)
    add(flat(innerWingShape()), shoulder)
    const wrist = new THREE.Group()
    wrist.position.set(1.33, 0, 0)
    shoulder.add(wrist)
    add(flat(outerWingShape(), 0.05), wrist)
    return { shoulder, wrist, side }
  })

  eagle.userData.wings = wings
  eagle.userData.head = head
  return eagle
}

// Wing pose: `flap` 0..1 blends from the heraldic statue pose (wings raised
// in a V with their faces toward the viewer) to a live flapping cycle at
// phase `t` (radians), wings level.
export function poseEagle(eagle, t, flap) {
  for (const { shoulder, wrist, side } of eagle.userData.wings) {
    // The left wing is the right one mirrored in x, so its z/y turns flip sign.
    const beat = Math.sin(t)
    shoulder.rotation.order = 'ZXY'
    shoulder.rotation.x = THREE.MathUtils.lerp(-1.1, 0, flap)
    shoulder.rotation.z = side * THREE.MathUtils.lerp(0.5, 0.1 + beat * 0.75, flap)
    shoulder.rotation.y = side * THREE.MathUtils.lerp(0, 0.05 + beat * 0.08, flap)
    wrist.rotation.z = side * THREE.MathUtils.lerp(0.35, -0.15 + Math.sin(t - 0.9) * 0.45, flap)
  }
  eagle.userData.head.rotation.x = -0.1 + Math.sin(t * 0.5) * 0.04 * (1 - flap)
}

// Triangles of the eagle in its current pose, each tagged with a centroid,
// a burst direction and a random seed, for the glass-shatter transition.
export function shardGeometry(eagle) {
  eagle.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(eagle.matrixWorld).invert()
  const pos = []
  const centers = []
  const dirs = []
  const seeds = []
  const m = new THREE.Matrix4()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  eagle.traverse((o) => {
    if (!o.isMesh) return
    m.multiplyMatrices(inv, o.matrixWorld)
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
    const p = g.attributes.position
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(m)
      b.fromBufferAttribute(p, i + 1).applyMatrix4(m)
      c.fromBufferAttribute(p, i + 2).applyMatrix4(m)
      const cen = a.clone().add(b).add(c).divideScalar(3)
      const dir = cen.clone().normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8)).normalize()
      const r = Math.random()
      for (const v of [a, b, c]) {
        pos.push(v.x, v.y, v.z)
        centers.push(cen.x, cen.y, cen.z)
        dirs.push(dir.x, dir.y, dir.z)
        seeds.push(r)
      }
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3))
  geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geo.computeVertexNormals()
  return geo
}

// Material for the shards: the sapphire look, with triangles flying out along
// aDir and tumbling as uBurst goes 0 -> 1, and snapping back as it returns.
export function shardMaterial(base) {
  const mat = base.clone()
  mat.userData.burst = { value: 0 }
  mat.userData.rim = base.userData.rim
  mat.userData.rimPower = base.userData.rimPower
  mat.onBeforeCompile = (shader) => {
    base.onBeforeCompile(shader)
    shader.uniforms.uBurst = mat.userData.burst
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBurst;
        attribute vec3 aCenter;
        attribute vec3 aDir;
        attribute float aSeed;
        mat3 rotAxis(vec3 ax, float a){
          ax = normalize(ax); float s = sin(a), c = cos(a), oc = 1.0 - c;
          return mat3(oc*ax.x*ax.x+c, oc*ax.x*ax.y+ax.z*s, oc*ax.z*ax.x-ax.y*s,
                      oc*ax.x*ax.y-ax.z*s, oc*ax.y*ax.y+c, oc*ax.y*ax.z+ax.x*s,
                      oc*ax.z*ax.x+ax.y*s, oc*ax.y*ax.z-ax.x*s, oc*ax.z*ax.z+c);
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `float k = uBurst * (0.7 + aSeed * 0.6);
        mat3 R = rotAxis(vec3(aSeed - 0.5, 1.0, aDir.x), k * (4.0 + aSeed * 6.0));
        vec3 transformed = R * (position - aCenter) * (1.0 - k * 0.3) + aCenter + aDir * k * (2.5 + aSeed * 3.5);`,
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>`)
  }
  mat.customProgramCacheKey = () => 'shard'
  return mat
}
