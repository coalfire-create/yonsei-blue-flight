import * as THREE from 'three'
import { bronzeMaterial, buildEagle, keylineMaterial, poseEagle, sapphireEnv, shardGeometry, shardMaterial } from '../eagle.js'

const S = 5 // eagle model units -> scene units (wingspan 5)

export class Hero {
  constructor(canvas) {
    this.canvas = canvas
    this.mobile = innerWidth < 760
    // Transparent: the duotone campus and the giant 'Yonsei' sit behind it.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.environment = sapphireEnv(this.renderer)
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    this.camera.position.set(0, 1.4, 11)

    // Warm key on the bronze, Yonsei-blue rim from behind.
    const key = new THREE.DirectionalLight('#ffd9ae', 2.6)
    key.position.set(3, 5, 6)
    const back = new THREE.DirectionalLight('#8fb8ff', 3.2)
    back.position.set(-5, 3, -5)
    const flood = new THREE.SpotLight('#ffcf8a', 60, 30, 0.22, 0.8)
    flood.position.set(2.5, 1, 8)
    flood.target.position.set(0, 0.6, 0)
    this.scene.add(key, back, flood, flood.target, new THREE.HemisphereLight('#a9c4f0', '#1a2440', 0.8))

    // stage: drag rotation (pillar + eagle); pivot: the eagle's flight.
    this.stage = new THREE.Group()
    this.stage.position.y = 0.9 // where the light eagle hangs
    this.scene.add(this.stage)
    this.pivot = new THREE.Group()
    this.stage.add(this.pivot)

    this.material = bronzeMaterial({ rim: '#ffd3a0' })
    this.shardMat = shardMaterial(this.material, S)
    this.shards = null
    this.eagle = null
    buildEagle(this.material).then((eagle) => {
      eagle.scale.setScalar(S)
      // Keyline for the 2D emblem state.
      this.keyline = new THREE.Mesh(eagle.userData.mesh.geometry, keylineMaterial(this.material.userData.flat))
      this.keyline.renderOrder = -1
      eagle.add(this.keyline)
      this.eagle = eagle
      this.pivot.add(eagle)
      this.onReady?.()
    })


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
    this.camera.aspect = w / h
    const portrait = w / h < 0.8
    this.lookY = portrait ? -2.4 : 0.25
    this.camera.position.z = portrait ? 23 : 11.5
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const p = this.progress

    // Drag inertia; idle slow turn.
    this.vYaw *= Math.pow(0.05, dt)
    // Idle: sway gently around facing the viewer.
    this.yaw += this.vYaw * 0.3
    this.yaw += (Math.sin(this.time * 0.35) * 0.35 - this.yaw) * dt * (Math.abs(this.vYaw) > 0.002 ? 0 : 0.4)
    // Rests in a three-quarter profile, like the statue seen from 백양로;
    // turns to face the viewer as it takes off.
    // 2D emblem (flat, square to the viewer) -> 3D bronze turning to a
    // three-quarter view -> flight.
    // The light eagle is the 2D stage; the bronze is born white-hot from it.
    // A drawing in lines of light, then solid bronze as it wakes.
    const flat = 0
    const light = 1 - THREE.MathUtils.smoothstep(p, 0.06, 0.18)
    this.material.userData.light.value = light
    this.material.userData.time.value = this.time
    this.material.transparent = light > 0.001
    this.material.depthWrite = light < 0.5
    const turn = THREE.MathUtils.smoothstep(p, 0.04, 0.22) * (1 - THREE.MathUtils.smoothstep(p, 0.3, 0.5))
    this.stage.rotation.set(this.pitch * (1 - flat) * (1 - p) * 0.5, (this.yaw * (1 - flat) - 0.7 * turn) * (1 - THREE.MathUtils.smoothstep(p, 0.3, 0.5)), 0)
    // As it takes off the camera tilts up after it, leaving the pillar below.
    this.camera.lookAt(0, this.lookY + p * 2.5, 0)

    if (!this.eagle) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    // Scroll: bronze statue -> alive, beating its raised wings, lifting off
    // the pillar toward the viewer and out over the top of the frame.
    const flap = THREE.MathUtils.smoothstep(p, 0.16, 0.3)
    const speed = 2.4 + flap * 4.5
    // Statue holds the wings up (phase 0) until it wakes.
    this.phase = flap > 0.001 ? (this.phase ?? 0) + dt * speed : 0
    poseEagle(this.eagle, this.phase, flap)
    const lift = THREE.MathUtils.smoothstep(p, 0.26, 1)
    // The emblem is drawn larger; it settles to statue size as it turns 3D.
    this.pivot.scale.setScalar(1.15 - (1 - light) * 0.15)
    if (this.keyline) this.keyline.visible = flat > 0.02
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
    this.renderer.render(this.scene, this.camera)
  }
}
