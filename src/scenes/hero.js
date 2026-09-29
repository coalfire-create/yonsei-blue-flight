import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { backdrop } from '../backdrop.js'
import { bronzeMaterial, buildEagle, buildPillar, poseEagle, sapphireEnv, shardGeometry, shardMaterial } from '../eagle.js'

const S = 5 // eagle model units -> scene units (wingspan 5)

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

    // Behind the statue: the real campus up 백양로 toward 안산, baked from
    // the flight scene's 3D world at golden hour.
    this.bg = backdrop('hero')
    this.scene.add(this.bg.mesh)

    // Golden hour to match the backdrop: low warm sun, cool sky fill.
    const key = new THREE.DirectionalLight('#ffd3a0', 2.4)
    key.position.set(3, 5, 6)
    const back = new THREE.DirectionalLight('#ffe7c2', 2.6)
    back.position.set(-5, 3, -5)
    const flood = new THREE.SpotLight('#ffcf8a', 60, 30, 0.22, 0.8)
    flood.position.set(2.5, 1, 8)
    flood.target.position.set(0, 0.6, 0)
    this.scene.add(key, back, flood, flood.target, new THREE.HemisphereLight('#bcd6f5', '#6b5a44', 0.7))

    // stage: drag rotation (pillar + eagle); pivot: the eagle's flight.
    this.stage = new THREE.Group()
    this.stage.position.y = -0.4
    this.scene.add(this.stage)
    const pillar = buildPillar(6, new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.92 }))
    pillar.scale.setScalar(S)
    this.stage.add(pillar)
    this.pivot = new THREE.Group()
    this.stage.add(this.pivot)

    this.material = bronzeMaterial({ rim: '#ffd3a0' })
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
    this.bg.resize(w, h)
    this.camera.aspect = w / h
    const portrait = w / h < 0.8
    this.camera.position.z = portrait ? 19 : 11.5
    this.lookY = portrait ? -2.6 : -1.1
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    // The campus drifts with the drag and falls away as the eagle climbs.
    const bu = this.bg.u
    bu.uOff.value.set(-this.yaw * 0.025, p * 0.1)
    bu.uZoom.value = 1.04 + p * 0.12
    bu.uDark.value = 0.12 + p * 0.25
    this.bg.update(dt)

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
    this.material.userData.rimPower.value = 0.45 + 0.15 * Math.sin(this.time * 2)
    this.composer.render()
  }
}
