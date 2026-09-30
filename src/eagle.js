import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The Yonsei eagle statue: a bronze eagle landing on the top of a tall white
// stone pillar, wings raised up and back (as on 백양로). The sculpt is a mesh
// (public/models/eagle.glb: TRELLIS.2 image-to-3D from a generated reference,
// generated pedestal cut off, meshopt-compressed; model units: wingspan 1,
// +z forward, y up) and its wings beat through a vertex-shader hinge at the
// shoulders and elbows.

const MODEL_URL = '/models/eagle.glb'
export const PILLAR_TOP = -0.207 // model-unit y where the talons grip
const PILLAR_W = 0.26

export function sapphireEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}

const models = new Map()
// Loads a generated sculpt as one plain float geometry in model units.
export function loadModel(url) {
  if (models.has(url)) return models.get(url)
  const p = new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(url)
    .then((gltf) => {
      let mesh
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((o) => o.isMesh && (mesh ??= o))
      // Dequantize into plain floats in model units so the shader hinges
      // and the shard burst can work on real positions.
      const src = mesh.geometry
      const geo = new THREE.BufferGeometry()
      for (const name of ['position', 'normal']) {
        const a = src.getAttribute(name)
        const out = new Float32Array(a.count * 3)
        for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3)
        geo.setAttribute(name, new THREE.BufferAttribute(out, 3))
      }
      geo.setIndex(src.index)
      geo.applyMatrix4(mesh.matrixWorld)
      geo.computeBoundingSphere()
      return geo
    })
  models.set(url, p)
  return p
}

export const rimChunk = `float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  gl_FragColor.rgb += uRim * fres * 0.6 * uRimPower;
  #include <dithering_fragment>`

// Wing hinge in the vertex shader. Shoulder pivots at x = ±0.09 and elbow at
// x = ±0.3 (raised pose), both rotating about the forward (z) axis; weights
// ramp in so the body never tears.
const hingeChunk = `
  uniform float uBeat;   // shoulder angle, radians (+ = downstroke)
  uniform float uBeat2;  // elbow lag angle
  vec3 hinge(vec3 p, vec3 piv, float a){
    float s = sin(a), c = cos(a);
    vec3 d = p - piv;
    return piv + vec3(c * d.x - s * d.y, s * d.x + c * d.y, d.z);
  }
  // Only the wings: not the tail (behind), legs (below) or the head.
  float wingMask(vec3 p){
    return smoothstep(-0.2, -0.12, p.z) * smoothstep(-0.1, 0.0, p.y);
  }
  vec3 wing(vec3 p){
    float side = sign(p.x);
    float ax = abs(p.x);
    float m = wingMask(p);
    float w1 = smoothstep(0.07, 0.15, ax) * m;
    float w2 = smoothstep(0.26, 0.36, ax) * m;
    p = hinge(p, vec3(side * 0.3, 0.2, p.z), -side * uBeat2 * w2);
    p = hinge(p, vec3(side * 0.09, 0.06, p.z), -side * uBeat * w1);
    return p;
  }
  vec3 wingN(vec3 p, vec3 n){
    float side = sign(p.x);
    float ax = abs(p.x);
    float a = -side * wingMask(p) * (uBeat * smoothstep(0.07, 0.15, ax) + uBeat2 * smoothstep(0.26, 0.36, ax));
    float s = sin(a), c = cos(a);
    return vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
  }
`

export function bronzeMaterial({ rim = '#4facfe' } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#6a4524',
    metalness: 1,
    roughness: 0.38,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.85,
  })
  mat.userData.rim = { value: new THREE.Color(rim) }
  mat.userData.rimPower = { value: 1 }
  mat.userData.beat = { value: 0 }
  mat.userData.beat2 = { value: 0 }
  mat.userData.flat = { value: 0 } // 1: a flat 2D emblem, 0: the 3D bronze
  mat.userData.flatColor = { value: new THREE.Color('#1d4fb8') }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlat = mat.userData.flat
    shader.uniforms.uFlatColor = mat.userData.flatColor
    shader.uniforms.uRim = mat.userData.rim
    shader.uniforms.uRimPower = mat.userData.rimPower
    shader.uniforms.uBeat = mat.userData.beat
    shader.uniforms.uBeat2 = mat.userData.beat2
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vUp;\nuniform float uFlat;\n${hingeChunk}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = wingN(position, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = wing(position);\ntransformed.z *= 1.0 - uFlat * 0.96; // pressed flat into an emblem\nvUp = objectNormal.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;\nuniform float uFlat;\nuniform vec3 uFlatColor;\nvarying float vUp;')
      // Weathered patina: upward faces catch a gold wear, undersides stay dark.
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * 0.5, vec3(0.72, 0.52, 0.24), smoothstep(0.2, 0.95, vUp) * 0.45);')
      .replace(
        '#include <dithering_fragment>',
        rimChunk +
          `
        // Emblem: one flat ink with a pale keyline on the silhouette.
        float keyl = smoothstep(0.35, 0.8, pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 1.5));
        vec3 ink = uFlatColor * (0.92 + keyl * 0.12);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, ink, uFlat);`,
      )
  }
  mat.customProgramCacheKey = () => 'bronze-eagle'
  return mat
}

// Pale keyline around the flat emblem: an inverted hull, pressed flat with
// the eagle and pushed out along its normals.
export function keylineMaterial(flat, color = '#e9f0ff') {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlat = flat
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFlat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.009;\ntransformed.z *= 1.0 - uFlat * 0.96;\ntransformed.z -= 0.02;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlat;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(0.35, 0.9, uFlat);')
  }
  m.customProgramCacheKey = () => 'eagle-keyline'
  return m
}

export function stoneMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#c9c5bc', roughness: 0.9, metalness: 0 })
}

// The white square pillar the eagle stands on; its top is at PILLAR_TOP.
export function buildPillar(height = 4, mat = stoneMaterial()) {
  const g = new THREE.Group()
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_W, height, PILLAR_W), mat)
  shaft.position.y = PILLAR_TOP - height / 2 - 0.03
  // Capital slab the talons grip, a little wider than the shaft.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_W * 1.25, 0.045, PILLAR_W * 1.25), mat)
  cap.position.set(0, PILLAR_TOP - 0.0225, -0.02)
  g.add(shaft, cap)
  return g
}

// Eagle group (model units; scale it in the scene). Resolves once loaded.
export async function buildEagle(material = bronzeMaterial()) {
  const geo = await loadModel(MODEL_URL)
  const eagle = new THREE.Group()
  const mesh = new THREE.Mesh(geo, material)
  eagle.add(mesh)
  eagle.userData = { mesh, material }
  return eagle
}

// flap 0..1: statue (wings frozen up) -> alive, beating at phase t.
export function poseEagle(eagle, t, flap) {
  const m = eagle.userData.material
  const s = 0.5 - 0.5 * Math.cos(t) // 0 = wings up (statue pose), 1 = down
  const s2 = 0.5 - 0.5 * Math.cos(t - 0.7)
  m.userData.beat.value = flap * s * 1.35
  m.userData.beat2.value = flap * (s2 * 0.55 - 0.1)
}

// Triangles of the eagle, tagged in small clusters with a centroid, a burst
// direction and a random seed, for the shatter transition.
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
    if (!o.isMesh || !o.visible) return
    m.multiplyMatrices(inv, o.matrixWorld)
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
    const p = g.attributes.position
    let dir, r, cen
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(m)
      b.fromBufferAttribute(p, i + 1).applyMatrix4(m)
      c.fromBufferAttribute(p, i + 2).applyMatrix4(m)
      if (i % 36 === 0) {
        cen = a.clone().add(b).add(c).divideScalar(3)
        dir = cen.clone().normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8)).normalize()
        r = Math.random()
      }
      for (const v of [a, b, c]) {
        pos.push(v.x, v.y, v.z)
        centers.push(cen.x, cen.y, cen.z)
        dirs.push(dir.x, dir.y, dir.z)
        seeds.push(r)
      }
    }
    if (g !== o.geometry) g.dispose()
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3))
  geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geo.computeVertexNormals()
  return geo
}

// Shards: bronze with the rim, chunks flying out along aDir and tumbling as
// uBurst goes 0 -> 1, snapping back as it returns. `scale` is the eagle's
// scene scale so the burst distance reads the same at any size.
export function shardMaterial(base, scale = 1) {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#7a5028', metalness: 1, roughness: 0.3, clearcoat: 0.5, side: THREE.DoubleSide, flatShading: true, envMapIntensity: 1.1 })
  mat.userData.burst = { value: 0 }
  mat.userData.fall = { value: 0 } // 1: shards drop and pile below (melting)
  mat.userData.heat = { value: 0 } // molten glow
  mat.userData.time = { value: 0 } // drift while scattered
  mat.userData.floor = { value: 0 } // model-unit y the melt pools on
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBurst = mat.userData.burst
    shader.uniforms.uFall = mat.userData.fall
    shader.uniforms.uHeat = mat.userData.heat
    shader.uniforms.uTime = mat.userData.time
    shader.uniforms.uFloor = mat.userData.floor
    shader.uniforms.uRim = base.userData.rim
    shader.uniforms.uRimPower = base.userData.rimPower
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBurst;
        uniform float uFall;
        uniform float uTime;
        uniform float uFloor;
        varying float vSeed;
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
        vec3 transformed = R * (position - aCenter) * (1.0 - k * 0.3) + aCenter + aDir * k * ${(0.4 / scale).toFixed(4)} * (2.5 + aSeed * 3.5) * (1.0 - uFall * 0.7);
        transformed += k * vec3(sin(uTime * 0.7 + aSeed * 40.0), cos(uTime * 0.5 + aSeed * 31.0), sin(uTime * 0.6 + aSeed * 17.0)) * ${(0.12 / scale).toFixed(4)};
        // Melting: drops and spreads into a low pile.
        transformed.y = mix(transformed.y, uFloor + (aCenter.y - uFloor) * 0.04 + aSeed * 0.03, uFall * smoothstep(0.2, 1.0, k));
        vSeed = aSeed;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;\nuniform float uHeat;\nvarying float vSeed;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb += vec3(1.0, 0.45, 0.12) * uHeat * (0.6 + vSeed);\n' + rimChunk)
  }
  mat.customProgramCacheKey = () => 'bronze-shard'
  return mat
}
