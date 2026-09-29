import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { bronzeMaterial, buildEagle, buildPillar, poseEagle, sapphireEnv, shardGeometry, shardMaterial } from '../eagle.js'

const S = 5 // eagle model units -> scene units (wingspan 5)

// Night-to-dawn sky with a cyan horizon and drifting cloud bands.
const skyFrag = /* glsl */ `
  uniform float uTime;
  uniform float uLift;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }
  void main(){
    float y = vUv.y + uLift * 0.35;
    vec3 top = vec3(0.012, 0.03, 0.08);
    vec3 mid = vec3(0.0, 0.13, 0.33);
    vec3 horizon = vec3(0.12, 0.62, 0.95);
    vec3 col = mix(horizon, mid, smoothstep(0.02, 0.38, y));
    col = mix(col, top, smoothstep(0.38, 0.95, y));
    float band = fbm(vec2(vUv.x * 3.0 + uTime * 0.015, y * 7.0));
    col += vec3(0.25, 0.55, 0.9) * smoothstep(0.55, 0.9, band) * 0.18 * smoothstep(0.7, 0.1, y);
    vec2 g = floor(vUv * vec2(260.0, 160.0));
    float star = step(0.997, hash(g)) * smoothstep(0.45, 0.9, y);
    col += star * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class Hero {
  constructor(canvas) {
    this.canvas = canvas
    this.mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.environment = sapphireEnv(this.renderer)
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    this.camera.position.set(0, 1.4, 11)

    this.skyUniforms = { uTime: { value: 0 }, uLift: { value: 0 } }
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: skyFrag,
        uniforms: this.skyUniforms,
        depthWrite: false,
      }),
    )
    sky.frustumCulled = false
    sky.renderOrder = -1
    this.scene.add(sky)

    // Night: moon-blue key and rim, and the warm floodlights that light the
    // statue from the plaza below.
    const key = new THREE.DirectionalLight('#bfe4ff', 1.6)
    key.position.set(3, 5, 6)
    const back = new THREE.DirectionalLight('#00d2ff', 3.2)
    back.position.set(-4, 2, -5)
    const flood = new THREE.SpotLight('#ffcf8a', 60, 30, 0.22, 0.8)
    flood.position.set(2.5, 1, 8)
    flood.target.position.set(0, 0.6, 0)
    this.scene.add(key, back, flood, flood.target, new THREE.AmbientLight('#6f8cff', 0.35))

    // stage: drag rotation (pillar + eagle); pivot: the eagle's flight.
    this.stage = new THREE.Group()
    this.stage.position.y = -0.4
    this.scene.add(this.stage)
    const pillar = buildPillar(6, new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.92 }))
    pillar.scale.setScalar(S)
    this.stage.add(pillar)
    this.pivot = new THREE.Group()
    this.stage.add(this.pivot)

    this.material = bronzeMaterial()
    this.shardMat = shardMaterial(this.material, S)
    this.shards = null
    this.eagle = null
    buildEagle(this.material).then((eagle) => {
      eagle.scale.setScalar(S)
      this.eagle = eagle
      this.pivot.add(eagle)
      this.onReady?.()
    })

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82))
    this.composer.addPass(new OutputPass())

    this.progress = 0
    this.time = 0
    this.yaw = 0
    this.pitch = 0.05
    this.vYaw = 0
    this.vPitch = 0
    this.burst = 0
    this.burstDir = 0
    this.#bindDrag()
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  #bindDrag() {
    const c = this.canvas
    let drag = null
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0 }
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      drag.moved += Math.abs(dx) + Math.abs(dy)
      this.vYaw = dx * 0.008
      this.vPitch = dy * 0.005
      this.yaw += this.vYaw
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.vPitch, -0.6, 0.8)
    })
    const end = (e) => {
      if (drag && drag.moved < 6 && this.#hitEagle(e)) this.shatter()
      drag = null
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', () => (drag = null))
  }

  #hitEagle(e) {
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    return !!this.eagle && ray.intersectObject(this.eagle, true).length > 0
  }

  // Burst into glass shards, hang for a beat, then snap back together.
  shatter() {
    // Shards are cut from the rest pose, so only the statue can shatter.
    if (this.shards || !this.eagle || this.progress > 0.04) return
    this.shards = new THREE.Mesh(shardGeometry(this.eagle), this.shardMat)
    this.eagle.userData.mesh.visible = false
    this.eagle.add(this.shards)
    this.burstT = 0
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    const portrait = w / h < 0.8
    this.camera.position.z = portrait ? 19 : 11.5
    this.lookY = portrait ? -2.6 : -1.1
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    this.skyUniforms.uTime.value = this.time
    this.skyUniforms.uLift.value = p

    // Drag inertia; idle slow turn.
    this.vYaw *= Math.pow(0.05, dt)
    // Idle: sway gently around facing the viewer.
    this.yaw += this.vYaw * 0.3
    this.yaw += (Math.sin(this.time * 0.35) * 0.35 - this.yaw) * dt * (Math.abs(this.vYaw) > 0.002 ? 0 : 0.4)
    // Rests in a three-quarter profile, like the statue seen from 백양로;
    // turns to face the viewer as it takes off.
    this.stage.rotation.set(this.pitch * (1 - p) * 0.5, (this.yaw - 0.7) * (1 - THREE.MathUtils.smoothstep(p, 0.05, 0.4)), 0)
    // As it takes off the camera tilts up after it, leaving the pillar below.
    this.camera.lookAt(0, this.lookY + p * 2.5, 0)

    if (!this.eagle) {
      this.composer.render()
      return
    }
    // Scroll: bronze statue -> alive, beating its raised wings, lifting off
    // the pillar toward the viewer and out over the top of the frame.
    const flap = THREE.MathUtils.smoothstep(p, 0.05, 0.25)
    const speed = 2.4 + flap * 4.5
    // Statue holds the wings up (phase 0) until it wakes.
    this.phase = flap > 0.001 ? (this.phase ?? 0) + dt * speed : 0
    poseEagle(this.eagle, this.phase, flap)
    const lift = THREE.MathUtils.smoothstep(p, 0.2, 1)
    const bob = flap * (0.5 - 0.5 * Math.cos(this.phase)) * 0.35
    this.pivot.position.set(0, lift * lift * 9 + lift * 0.6 + bob, lift * 3)
    this.eagle.rotation.x = lift * 0.45

    if (this.shards) {
      this.burstT += dt
      // 0.45 s out, 0.35 s hang, 0.7 s back.
      const t = this.burstT
      const out = THREE.MathUtils.smoothstep(t, 0, 0.45)
      const back = THREE.MathUtils.smoothstep(t, 0.8, 1.5)
      this.shardMat.userData.burst.value = out * (1 - back)
      if (t > 1.5) {
        this.eagle.remove(this.shards)
        this.shards.geometry.dispose()
        this.shards = null
        this.eagle.userData.mesh.visible = true
      }
    }
    this.material.userData.rimPower.value = 0.7 + 0.3 * Math.sin(this.time * 2)
    this.composer.render()
  }
}
