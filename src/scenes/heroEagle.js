import * as THREE from 'three'
import { bronzeMaterial, buildEagle, poseEagle, sapphireEnv } from '../eagle.js'

// The bronze eagle perched at the right of the opening, over the silk. It
// breathes, turns toward the pointer, beats its wings when tapped, and as
// the visitor scrolls (progress 0..1) it wakes and climbs out of frame —
// ahead of the camera that follows it down through the clouds.
export class HeroEagle {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.environment = sapphireEnv(this.renderer)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    this.camera.position.set(0, 0, 10)

    // Warm key on the bronze, Yonsei-blue rim from behind.
    const key = new THREE.DirectionalLight('#ffd9ae', 2.4)
    key.position.set(3, 4, 6)
    const rim = new THREE.DirectionalLight('#8fb8ff', 4)
    rim.position.set(-4, 2, -5)
    this.scene.add(key, rim, new THREE.HemisphereLight('#a9c4f0', '#0a1430', 0.6))

    this.root = new THREE.Group()
    this.scene.add(this.root)
    this.material = bronzeMaterial({ rim: '#9cc4ff' })
    buildEagle(this.material).then((eagle) => {
      this.eagle = eagle
      this.root.add(eagle)
      this.onReady?.()
    })

    this.progress = 0
    this.time = 0
    this.phase = 0
    this.burst = 0
    this.mouse = new THREE.Vector2()
    this.target = new THREE.Vector2()
    addEventListener('pointermove', (e) => this.target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // A few strong wingbeats.
  flap() {
    this.burst = 1
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    // Where it perches, in world units at the eagle's depth.
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z
    const halfW = halfH * this.camera.aspect
    this.halfH = halfH
    if (w / h < 0.8) {
      this.anchor = new THREE.Vector3(halfW * 0.3, halfH * 0.4, 0)
      this.size = halfW * 1.05
    } else {
      this.anchor = new THREE.Vector3(halfW * 0.56, halfH * 0.16, 0)
      this.size = Math.min(halfH * 1.35, halfW * 0.62)
    }
  }

  render(dt) {
    this.time += dt
    if (!this.eagle) return
    const p = this.progress
    this.mouse.lerp(this.target, 1 - Math.exp(-dt * 3))

    // Breathing at rest; the tap and the take-off beat for real.
    const wake = THREE.MathUtils.smoothstep(p, 0.05, 0.35)
    const flap = Math.max(0.1, this.burst, wake)
    this.burst = Math.max(0, this.burst - dt * 0.6)
    this.phase += dt * (1.6 + flap * 5.5)
    poseEagle(this.eagle, this.phase, flap)

    const lift = THREE.MathUtils.smoothstep(p, 0.15, 1)
    const bob = Math.sin(this.time * 0.9) * 0.03 * this.size + flap * Math.sin(this.phase) * 0.04 * this.size
    this.root.scale.setScalar(this.size)
    this.root.position.copy(this.anchor)
    this.root.position.y += bob + lift * lift * this.halfH * 2.2
    this.root.position.z += lift * 2.5
    // Three-quarter view toward the wordmark, turning after the pointer;
    // it pitches up into the climb.
    this.root.rotation.set(-this.mouse.y * 0.18 - lift * 0.6, -0.55 + this.mouse.x * 0.4 + lift * 0.4, this.mouse.x * -0.06)
    this.material.userData.rimPower.value = 0.5 + 0.2 * Math.sin(this.time * 1.7)
    this.renderer.render(this.scene, this.camera)
  }
}
