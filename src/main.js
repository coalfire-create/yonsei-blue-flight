import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'
import { Hero } from './scenes/hero.js'
import { Baekyang } from './scenes/baekyang.js'
import { ERAS, Underwood } from './scenes/underwood.js'
import { Globe, HUBS } from './scenes/globe.js'
import { Akaraka } from './scenes/akaraka.js'
import { Outro, PORTALS } from './scenes/outro.js'
import { drawAura } from './aura.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))

function splitChars(el) {
  el.setAttribute('aria-label', el.textContent)
  const words = el.textContent.split(' ')
  el.textContent = ''
  // Chars are wrapped per word so lines only break between words.
  words.forEach((w, n) => {
    const word = document.createElement('span')
    word.className = 'word'
    word.setAttribute('aria-hidden', 'true')
    for (const ch of w) {
      const c = document.createElement('span')
      c.className = 'char'
      c.textContent = ch
      word.appendChild(c)
    }
    el.appendChild(word)
    if (n < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
}

async function boot() {
  const num = document.getElementById('loaderNum')
  const bar = document.getElementById('loaderBar')
  const c = { v: 0 }
  const paint = () => ((num.textContent = Math.round(c.v)), (bar.style.transform = `scaleX(${c.v / 100})`))
  const tween = gsap.to(c, { v: 100, duration: 1.4, ease: 'power2.inOut', onUpdate: paint })
  await Promise.race([Promise.all([document.fonts.load('800 60px "Syne"', 'AKARAKA'), document.fonts.load('700 20px "Space Grotesk"', 'YONSEI')]), new Promise((r) => setTimeout(r, 2500))])

  // Mobile browsers change innerHeight as the address bar slides; only take a
  // new viewport height when the width changes.
  let viewH = innerHeight
  let viewW = innerWidth
  addEventListener('resize', () => innerWidth !== viewW && ((viewW = innerWidth), (viewH = innerHeight)))

  const hero = new Hero(document.getElementById('cvHero'))
  const flight = new Baekyang(document.getElementById('cvFlight'))
  const underwood = new Underwood(document.getElementById('cvUnderwood'))
  const globe = new Globe(document.getElementById('cvGlobe'))
  const akaraka = new Akaraka(document.getElementById('cvAkaraka'))
  const outro = new Outro(document.getElementById('cvOutro'))
  if (import.meta.env.DEV) Object.assign(window, { __flight: flight })

  const scenes = [
    { el: document.getElementById('hero'), view: hero },
    { el: document.getElementById('flight'), view: flight },
    { el: document.getElementById('underwood'), view: underwood },
    { el: document.getElementById('global'), view: globe },
    { el: document.getElementById('akaraka'), view: akaraka },
    { el: document.getElementById('outro'), view: outro },
  ]
  const io = new IntersectionObserver((es) => es.forEach((e) => (scenes.find((s) => s.el === e.target).on = e.isIntersecting)), { rootMargin: '5% 0px' })
  scenes.forEach((s) => io.observe(s.el))
  const progress = (el) => {
    const r = el.getBoundingClientRect()
    return clamp01(-r.top / Math.max(1, r.height - viewH))
  }

  document.querySelectorAll('.split').forEach(splitChars)

  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 })
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.stop()
  document.querySelectorAll('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      lenis.scrollTo(a.getAttribute('href'), { duration: 2 })
    }),
  )

  await tween
  gsap
    .timeline({ onComplete: () => lenis.start() })
    .to('#loader', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' })
    .from('.hero .char', { yPercent: 110, opacity: 0, stagger: 0.025, duration: 1.2, ease: 'expo.out' }, '-=0.5')
    .from('.nav, .hero .kicker, .reveal-hero', { y: 20, opacity: 0, stagger: 0.08, duration: 1, ease: 'power3.out' }, '-=1')

  /* Hero: remember the pointer path for the Aura Wing card. */
  const trail = []
  document.getElementById('cvHero').addEventListener('pointermove', (e) => {
    if (trail.length < 400 && (trail.length === 0 || Math.hypot(e.clientX - trail.at(-1)[0], e.clientY - trail.at(-1)[1]) > 12)) trail.push([e.clientX / innerWidth, e.clientY / innerHeight])
  })
  const heroCopy = document.querySelector('.hero__copy')

  /* 백양로: lock-on reticles and cards. */
  const locks = document.getElementById('locks')
  const lockEls = flight.targets.map((t) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'lock'
    el.innerHTML = `<span class="lock__box"></span><span class="lock__name">${t.name}</span>`
    el.addEventListener('click', () => openCard(t))
    locks.appendChild(el)
    return el
  })
  // Name tags for every other campus building.
  const tagEls = flight.halls.map((h) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'tag'
    el.textContent = h.name
    el.addEventListener('click', () =>
      openCard({ name: h.name, code: h.code, en: 'Yonsei University · Sinchon Campus', body: h.lv ? `연세대학교 신촌캠퍼스 · 지상 ${h.lv}층` : '연세대학교 신촌캠퍼스' }),
    )
    locks.prepend(el)
    h.alpha = 0
    return el
  })
  const placeTags = (dt, reserved) => {
    const cam = flight.camera.position
    const far = 260 + flight.overview * 700
    const max = (innerWidth < 760 ? 7 : 16) + Math.round(flight.overview * (innerWidth < 760 ? 12 : 40))
    const cand = []
    flight.halls.forEach((h, i) => {
      const d = cam.distanceTo(h.anchor)
      const sc = d < far && flight.screen(h.anchor)
      if (sc && sc.x > 10 && sc.x < innerWidth - 10 && sc.y > 70 && sc.y < viewH - 30) cand.push({ i, d, sc })
    })
    // Nearest first; skip tags that would overlap one already placed.
    cand.sort((a, b) => a.d - b.d)
    const placed = [...reserved]
    const shown = new Set()
    for (const c of cand) {
      if (placed.length - reserved.length >= max) break
      const w = tagEls[c.i].offsetWidth || 80
      if (placed.some((p) => Math.abs(p.x - c.sc.x) < (p.w + w) / 2 + 4 && Math.abs(p.y - c.sc.y) < 24)) continue
      placed.push({ x: c.sc.x, y: c.sc.y, w })
      shown.add(c.i)
      const el = tagEls[c.i]
      el.style.transform = `translate(${c.sc.x}px, ${c.sc.y}px) translate(-50%, -100%)`
    }
    // Fade rather than blink as tags come and go.
    flight.halls.forEach((h, i) => {
      h.alpha += ((shown.has(i) ? 1 : 0) - h.alpha) * Math.min(1, dt * 6)
      const el = tagEls[i]
      el.style.opacity = h.alpha.toFixed(2)
      el.style.visibility = h.alpha > 0.03 ? 'visible' : 'hidden'
      el.style.pointerEvents = shown.has(i) ? 'auto' : 'none'
    })
  }
  const card = document.getElementById('card')
  const openCard = (t) => {
    document.getElementById('cardCode').textContent = t.code ? `BLDG ${t.code}` : 'LANDMARK'
    document.getElementById('cardName').textContent = t.name
    document.getElementById('cardEn').textContent = t.en
    document.getElementById('cardBody').textContent = t.body
    card.hidden = false
    gsap.fromTo(card, { rotateX: -60, opacity: 0, y: 30 }, { rotateX: 0, opacity: 1, y: 0, duration: 0.7, ease: 'back.out(1.6)' })
  }
  document.getElementById('cardClose').addEventListener('click', () => (card.hidden = true))
  const speedEl = document.getElementById('speed')
  const lockName = document.getElementById('lockName')
  const flightHead = document.querySelector('.flight__head')

  /* Underwood: era captions, timeline dots, greeting bubble. */
  const uwYear = document.getElementById('uwYear')
  const uwTitle = document.getElementById('uwTitle')
  const uwBody = document.getElementById('uwBody')
  const uwHint = document.getElementById('uwHint')
  const uwBubble = document.getElementById('uwBubble')
  const uwDots = ERAS.map((e) => {
    const li = document.createElement('li')
    li.textContent = e.year
    document.getElementById('uwDots').appendChild(li)
    return li
  })
  if (matchMedia('(hover: none)').matches) uwHint.lastChild.textContent = '화면을 끌면 언더우드가 바라봅니다 · 동상을 탭해 인사해 보세요'
  let uwEra = -1
  let greets = 0
  underwood.onGreet = () => {
    greets++
    uwBubble.hidden = false
    gsap.fromTo(uwBubble, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' })
    gsap.to(uwBubble, { opacity: 0, delay: 2.2, duration: 0.4, onComplete: () => (uwBubble.hidden = true) })
  }

  /* Globe labels. */
  const hubsWrap = document.getElementById('hubs')
  const hubEls = ['신촌 SINCHON', '송도 SONGDO', ...HUBS.map((h) => h[0])].map((name, i) => {
    const el = document.createElement('span')
    el.className = `hub${i < 2 ? ' hub--home' : ''}`
    el.textContent = name
    hubsWrap.appendChild(el)
    return el
  })

  /* Akaraka sound toggle. */
  const mute = document.getElementById('mute')
  mute.addEventListener('click', () => {
    akaraka.muted = !akaraka.muted
    mute.textContent = akaraka.muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'
  })

  /* Outro: portals, launch and the Aura Wing card. */
  const portalWrap = document.getElementById('portalLabels')
  const portalEls = PORTALS.map((p) => {
    const a = document.createElement('a')
    a.className = 'portal-label'
    a.href = p.href
    a.target = '_blank'
    a.rel = 'noopener'
    a.innerHTML = `<b>${p.label}</b><span>${p.en}</span>`
    portalWrap.appendChild(a)
    return a
  })
  document.getElementById('flyBtn').addEventListener('click', () => outro.fly())
  const aura = document.getElementById('aura')
  const auraCanvas = document.getElementById('auraCanvas')
  const auraStage = document.getElementById('auraStage')
  document.getElementById('auraBtn').addEventListener('click', () => {
    drawAura(auraCanvas, { trail, greets })
    document.getElementById('auraSave').href = auraCanvas.toDataURL('image/png')
    aura.hidden = false
    lenis.stop()
  })
  document.getElementById('auraClose').addEventListener('click', () => ((aura.hidden = true), lenis.start()))
  aura.addEventListener('pointermove', (e) => {
    const x = e.clientX / innerWidth - 0.5
    const y = e.clientY / innerHeight - 0.5
    auraStage.style.transform = `rotateY(${x * 24}deg) rotateX(${-y * 18}deg)`
  })

  let last = performance.now()
  gsap.ticker.add(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    const hp = progress(scenes[0].el)
    hero.progress = hp
    heroCopy.style.opacity = 1 - clamp01((hp - 0.15) / 0.25)

    const fp = progress(scenes[1].el)
    flight.progress = fp
    flightHead.style.opacity = 1 - clamp01((fp - 0.04) / 0.06)

    underwood.progress = progress(scenes[2].el)

    for (const s of scenes) if (s.on) s.view.render(dt)

    if (scenes[1].on) {
      speedEl.textContent = Math.round(40 + flight.boost * 1200 + Math.min(60, Math.abs(lenis.velocity) * 3))
      let best = null
      const lockBoxes = []
      flight.targets.forEach((t, i) => {
        const el = lockEls[i]
        const sc = t.near > 0.25 && flight.screen(t.anchor)
        const on = sc && sc.x > 20 && sc.x < innerWidth - 20 && sc.y > 80 && sc.y < viewH - 20
        el.style.visibility = on ? 'visible' : 'hidden'
        if (!on) return
        el.style.opacity = t.near
        el.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -50%) scale(${0.8 + t.near * 0.3})`
        el.classList.toggle('is-locked', t.near > 0.75)
        lockBoxes.push({ x: sc.x, y: sc.y + 30, w: 120 })
        if (!best || t.near > best.near) best = t
      })
      lockName.textContent = best && best.near > 0.75 ? best.name : '—'
      placeTags(dt, lockBoxes)
    }
    if (scenes[2].on) {
      const i = underwood.era()
      if (i !== uwEra) {
        uwEra = i
        const e = ERAS[i]
        uwYear.textContent = e.year
        uwTitle.textContent = e.title
        uwBody.textContent = e.body
        uwDots.forEach((d, k) => d.classList.toggle('is-on', k === i))
        gsap.fromTo([uwYear, uwTitle, uwBody], { y: 24, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.6, ease: 'expo.out', overwrite: true })
      }
      uwHint.classList.toggle('is-on', underwood.alive > 0.6)
      if (!uwBubble.hidden) {
        const h = underwood.headScreen()
        uwBubble.style.transform = `translate(${h.x + 24}px, ${h.y - 70}px)`
      }
    }
    if (scenes[3].on) {
      globe.hubScreens().forEach((s, i) => {
        const el = hubEls[i]
        const a = clamp01((s.facing - 0.1) / 0.3)
        el.style.opacity = a
        el.style.visibility = a > 0.02 ? 'visible' : 'hidden'
        el.style.transform = `translate(${s.x}px, ${s.y}px)`
      })
    }
    if (scenes[5].on) outro.portalScreens().forEach((s, i) => (portalEls[i].style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, 0)`))
  })
}

boot()
