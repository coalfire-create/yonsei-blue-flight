import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'
import { ShaderCanvas } from './shader-canvas.js'
import { SILK, CLOUDS } from './scenes/silk.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => t * t * (3 - 2 * t)
const bell = (k, at, w) => Math.exp(-(((k - at) / w) ** 2))
const CHAPTERS = ['OPENING', '01 — CAMPUS', '02 — UNDERWOOD', '03 — GLOBAL', '04 — AKARAKA']

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
  // The opening needs only the silk. The eagle and every later chapter load
  // in the background while the loader counts.
  const eagleMod = import('./scenes/heroEagle.js')
  const chapterMods = Promise.all([
    import('./scenes/baekyang.js'),
    import('./scenes/underwood.js'),
    import('./scenes/globe.js'),
    import('./scenes/akaraka.js'),
    import('./data/info.js'),
    import('./aura.js'),
  ])

  const num = document.getElementById('loaderNum')
  const bar = document.getElementById('loaderBar')
  const c = { v: 0 }
  const paint = () => ((num.textContent = Math.round(c.v)), (bar.style.transform = `scaleX(${c.v / 100})`))
  const tween = gsap.to(c, { v: 100, duration: 1.4, ease: 'power2.inOut', onUpdate: paint })
  await Promise.race([
    Promise.all([
      document.fonts.load('900 100px "Noto Serif KR"', '延世'),
      document.fonts.load('400 60px "Instrument Serif"', 'Beyond'),
      document.fonts.load('italic 400 60px "Instrument Serif"', 'Eternity'),
      document.fonts.load('800 60px "Inter Tight"', 'AKARAKA'),
      document.fonts.load('500 12px "JetBrains Mono"', 'SPEED'),
      eagleMod,
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ])

  // Mobile browsers change innerHeight as the address bar slides; only take a
  // new viewport height when the width changes.
  let viewH = innerHeight
  let viewW = innerWidth
  addEventListener('resize', () => innerWidth !== viewW && ((viewW = innerWidth), (viewH = innerHeight)))

  /* Opening: silk, the eagle, the wordmark. */
  const heroEl = document.getElementById('hero')
  // The silk's light wanders on its own until a mouse takes over.
  const hero = new ShaderCanvas(document.getElementById('cvHero'), SILK, {
    maxDpr: 1.5,
    idleMouse: (t) => [0.62 + 0.22 * Math.sin(t * 0.23), 0.66 + 0.14 * Math.sin(t * 0.31 + 1.1)],
    uniforms: { uTear: 0, uTone: 0 },
  })
  let heroEagle = null
  eagleMod
    .then(({ HeroEagle }) => {
      const cv = document.getElementById('cvEagle')
      heroEagle = new HeroEagle(cv)
      heroEagle.onReady = () => cv.classList.add('is-ready')
    })
    .catch(() => {})
  heroEl.addEventListener('pointerdown', (e) => !e.target.closest('a, button') && heroEagle?.flap())
  // Remember the pointer path for the Aura Wing card.
  const trail = []
  heroEl.addEventListener('pointermove', (e) => {
    if (trail.length < 400 && (trail.length === 0 || Math.hypot(e.clientX - trail.at(-1)[0], e.clientY - trail.at(-1)[1]) > 12)) trail.push([e.clientX / innerWidth, e.clientY / innerHeight])
  })
  const heroBody = document.querySelector('.hero__body')
  const heroWord = document.querySelector('.hero__word')
  let time = 0
  const heroView = {
    render(dt) {
      hero.render(time, dt)
      heroEagle?.render(dt)
    },
  }
  const heroTick = () => {
    const hp = clamp01(-heroEl.getBoundingClientRect().top / Math.max(1, heroEl.offsetHeight - viewH * 2))
    hero.set('uProgress', hp)
    if (heroEagle) heroEagle.progress = hp
    // The whole block lifts together, the word swelling, and fades before the clouds.
    heroBody.style.transform = `translateY(${hp * -18}vh)`
    heroBody.style.opacity = (1 - clamp01((hp - 0.6) / 0.4)).toFixed(3)
    heroWord.style.transform = `scale(${1 + hp * 0.08})`
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

  // Until the chapters arrive only the opening runs.
  let chapterTick = null
  let last = performance.now()
  gsap.ticker.add(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt
    if (chapterTick) chapterTick(dt)
    else {
      heroTick()
      heroView.render(dt)
    }
  })

  await tween
  /* intro: the light screen wipes up and "Yonsei" rises out of the silk */
  const intro = new Promise((done) =>
    gsap
      .timeline({ onComplete: done })
      .to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.inOut' })
      .from('.hero .char', { yPercent: 110, opacity: 0, stagger: 0.06, duration: 1.4, ease: 'expo.out' }, '-=0.5')
      .from('.nav, .hero .eyebrow, .reveal-hero', { y: 20, opacity: 0, stagger: 0.08, duration: 1, ease: 'power3.out' }, '-=1.1'),
  )
  // Build the heavy chapters after the intro has played, then let the page scroll.
  const [mods] = await Promise.all([chapterMods, intro])
  chapterTick = setupChapters(mods)
  lenis.start()

  function setupChapters([{ Baekyang }, { ERAS, Underwood }, { Globe, HUBS }, { Akaraka }, { INFO, KIND }, { drawAura }]) {
    const flight = new Baekyang(document.getElementById('cvFlight'))
    const underwood = new Underwood(document.getElementById('cvUnderwood'))
    const globe = new Globe(document.getElementById('cvGlobe'))
    const akaraka = new Akaraka(document.getElementById('cvAkaraka'))
    // The finale is the opening's silk again, at dawn.
    const outroSilk = new ShaderCanvas(document.getElementById('cvOutro'), SILK, {
      maxDpr: 1.25,
      idleMouse: (t) => [0.4 + 0.25 * Math.sin(t * 0.2), 0.7 + 0.12 * Math.sin(t * 0.27)],
      uniforms: { uTear: 0, uTone: 1 },
    })
    const outro = { render: (dt) => outroSilk.render(time, dt) }
    if (import.meta.env.DEV) Object.assign(window, { __flight: flight, __globe: globe })

    const scenes = [
      { el: heroEl, view: heroView },
      { el: document.getElementById('flight'), view: flight },
      { el: document.getElementById('underwood'), view: underwood },
      { el: document.getElementById('global'), view: globe },
      { el: document.getElementById('akaraka'), view: akaraka },
      { el: document.getElementById('outro'), view: outro },
    ]
    const io = new IntersectionObserver((es) => es.forEach((e) => (scenes.find((s) => s.el === e.target).on = e.isIntersecting)), { rootMargin: '5% 0px' })
    scenes.forEach((s) => io.observe(s.el))
    // Chapters overlap by one screen (the next one arrives over the last), so
    // a chapter's own story plays out before the next one starts to cover it.
    const progress = (el) => {
      const r = el.getBoundingClientRect()
      const last = el === scenes.at(-1).el
      return clamp01(-r.top / Math.max(1, r.height - viewH * (last ? 1 : 2)))
    }
    scenes.forEach((s, i) => {
      s.el.style.zIndex = i + 1
      s.sticky = s.el.querySelector('.scene__sticky')
      s.shade = document.createElement('div')
      s.shade.className = 'scene__shade'
      s.sticky.appendChild(s.shade)
      s.frames = []
      s.capGap = 0.5
      s.capAt = 0
    })

    // Headlines rise line by line, behind a mask, as their chapter arrives.
    const splitLines = (el) => {
      const parts = el.innerHTML.split(/<br\s*\/?>/i)
      el.innerHTML = parts.map((p) => `<span class="line"><span class="line__in">${p.trim()}</span></span>`).join('')
    }
    document.querySelectorAll('.flight__head .h2, .global__copy .h2, .akaraka__title, .outro__title').forEach(splitLines)
    document.querySelectorAll('.outro__top, .outro__row').forEach((el) => el.classList.add('outro-extra'))
    scenes.slice(1).forEach((s) => {
      s.lines = s.el.querySelectorAll('.line__in')
      s.extras = s.el.querySelectorAll(':scope .scene__sticky > div > .kicker, :scope .scene__sticky > div > .body:not(.uw__body), :scope .outro-extra')
      gsap.set(s.lines, { yPercent: 110 })
      gsap.set(s.extras, { opacity: 0, y: 18 })
      s.shown = false
    })
    const reveal = (s, on) => {
      if (on === s.shown) return
      s.shown = on
      if (on) {
        gsap.to(s.lines, { yPercent: 0, duration: 1.2, stagger: 0.09, ease: 'expo.out', overwrite: true })
        gsap.to(s.extras, { opacity: 1, y: 0, duration: 1, stagger: 0.08, delay: 0.25, ease: 'power3.out', overwrite: true })
      } else {
        gsap.to(s.lines, { yPercent: 110, duration: 0.4, ease: 'power2.in', overwrite: true })
        gsap.to(s.extras, { opacity: 0, y: 18, duration: 0.3, overwrite: true })
      }
    }

    /* Transition layers. */
    const cloudCv = document.createElement('canvas')
    cloudCv.className = 'clouds'
    document.body.appendChild(cloudCv)
    const clouds = new ShaderCanvas(cloudCv, CLOUDS, { alpha: true, maxDpr: 0.6, uniforms: { uDensity: 0 } })
    const iris = document.createElement('div')
    iris.className = 'iris'
    const slit = document.createElement('div')
    slit.className = 'slit'
    document.body.append(iris, slit)
    const rewind = document.getElementById('rewind')
    const rewindCv = document.getElementById('rewindCv')
    const rewindCtx = rewindCv.getContext('2d')
    const rewindLabel = document.getElementById('rewindLabel')
    const rewindTime = document.getElementById('rewindTime')
    const flash = document.getElementById('flash')
    let tape = null
    let tapeShown = -1

    // Small stills of each chapter as it plays, for the rewind: taken right
    // after the chapter renders (the WebGL buffers are still readable then).
    // When a chapter's reel fills up, every other still is dropped and the
    // spacing doubles, so the reel always spans the whole visit.
    const capture = (s) => {
      if (time < s.capAt) return
      s.capAt = time + s.capGap
      const w = 360
      const h = Math.round((w * viewH) / innerWidth)
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const g = cv.getContext('2d')
      g.fillStyle = s === scenes[3] ? '#0a2a60' : '#050c1a'
      g.fillRect(0, 0, w, h)
      try {
        for (const src of s.sticky.querySelectorAll(':scope > canvas')) g.drawImage(src, 0, 0, w, h)
      } catch {
        return
      }
      s.frames.push(cv)
      if (s.frames.length >= 14) {
        s.frames = s.frames.filter((_, i) => i % 2 === 0)
        s.capGap *= 2
      }
    }

    const navLinks = [...document.querySelectorAll('.nav__links a')]
    const progressLine = document.getElementById('progressLine')
    const pin = (s, top, on, extra = '') => (s.sticky.style.transform = on ? `translate3d(0, ${-top}px, 0) ${extra}` : '')
    let current = 0
    // Every chapter arrives its own way: through cloud, through an iris,
    // through a widening slit, behind a diagonal sweep, and last on a tape
    // rewinding the whole visit.
    const transitions = () => {
      current = 0
      let cloudsOn = false
      for (let i = 1; i < scenes.length; i++) {
        const s = scenes[i]
        const prev = scenes[i - 1]
        const top = s.el.getBoundingClientRect().top
        const k = clamp01(1 - top / viewH)
        const on = k > 0 && k < 1
        if (top <= viewH * 0.5) current = i
        s.sticky.style.clipPath = ''
        if (i === 1) {
          // The silk burns open, cloud rushes past, and the campus fades up
          // below as the camera drops out of the sky.
          pin(s, top, on, `scale(${1 + (1 - k) * 0.06})`)
          s.sticky.style.opacity = on ? ease(clamp01((k - 0.35) / 0.5)).toFixed(3) : ''
          flight.intro = 1 - k
          hero.set('uTear', clamp01(k / 0.5))
          prev.sticky.style.transform = on ? `scale(${1 + k * 0.08})` : ''
          if (on) {
            cloudsOn = true
            clouds.set('uDensity', Math.sin(Math.PI * k))
            clouds.set('uProgress', k)
          }
          reveal(s, k > 0.8)
        } else if (i === 2) {
          // Iris: a ring of light opens from the centre; the campus zooms in
          // after it.
          pin(s, top, on)
          const r = Math.pow(ease(k), 1.3) * 76
          if (on) {
            s.sticky.style.clipPath = `circle(${r.toFixed(2)}% at 50% 50%)`
            prev.sticky.style.transform = `scale(${1 + k * 0.3})`
          }
          const px = (r / 100) * Math.hypot(innerWidth, viewH) * Math.SQRT1_2 * 2
          iris.style.width = iris.style.height = `${px.toFixed(1)}px`
          iris.style.opacity = on ? (Math.min(1, k * 8) * (1 - ease(clamp01((k - 0.7) / 0.3)))).toFixed(3) : '0'
          prev.shade.style.opacity = on ? (k * 0.5).toFixed(3) : '0'
          reveal(s, k > 0.55)
        } else if (i === 3) {
          // Slit: the frame opens from a line of light across the middle.
          pin(s, top, on)
          const e = ease(k)
          if (on) {
            s.sticky.style.clipPath = `inset(${(50 * (1 - e)).toFixed(2)}% 0 ${(50 * (1 - e)).toFixed(2)}% 0)`
            prev.sticky.style.transform = `scale(${1 - k * 0.08})`
          }
          slit.style.height = `${(e * viewH).toFixed(1)}px`
          slit.style.opacity = on ? (Math.min(1, k * 10) * (1 - ease(clamp01((k - 0.75) / 0.25)))).toFixed(3) : '0'
          prev.shade.style.opacity = on ? (k * 0.7).toFixed(3) : '0'
          reveal(s, k > 0.55)
        } else if (i === 4) {
          // Diagonal sweep from the lower left; the globe is pushed away.
          pin(s, top, on)
          if (on) {
            const c = ease(k) * 2
            const pts = c <= 1 ? [[0, 100], [0, 100 - c * 100], [0, 100 - c * 100], [c * 100, 100], [c * 100, 100]] : [[0, 100], [0, 0], [(c - 1) * 100, 0], [100, (2 - c) * 100], [100, 100]]
            s.sticky.style.clipPath = `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`
            prev.sticky.style.transform = `translate3d(${(k * 8).toFixed(2)}vw, ${(-k * 6).toFixed(2)}vh, 0) scale(${1 - k * 0.06})`
          }
          prev.shade.style.opacity = on ? (k * 0.6).toFixed(3) : '0'
          reveal(s, k > 0.55)
        } else {
          // The rewind: every chapter played backwards on tape, back to the
          // silk; a flash; then the same silk at dawn.
          pin(s, top, on)
          const r = clamp01(k / 0.84)
          if (on && r < 1) {
            tape ??= scenes.slice(0, 5).flatMap((sc, n) => sc.frames.map((cv) => ({ cv, n })))
            if (tape.length) {
              const idx = Math.round((1 - r) * (tape.length - 1))
              if (idx !== tapeShown) {
                tapeShown = idx
                if (rewindCv.width !== innerWidth) ((rewindCv.width = innerWidth), (rewindCv.height = viewH))
                const f = tape[idx]
                // Tape jitter: a small random shift each frame.
                rewindCtx.drawImage(f.cv, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, rewindCv.width, rewindCv.height)
                rewindLabel.textContent = CHAPTERS[f.n]
                const secs = Math.round((idx / Math.max(1, tape.length - 1)) * 300)
                rewindTime.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
              }
            }
          } else if (!on) {
            // Film the next visit afresh.
            tape = null
            tapeShown = -1
          }
          rewind.style.opacity = on && tape?.length ? (1 - clamp01((k - 0.84) / 0.04)).toFixed(3) : '0'
          flash.style.opacity = on ? bell(k, 0.87, 0.045).toFixed(3) : '0'
          prev.shade.style.opacity = '0'
          reveal(s, k > 0.9)
          document.body.classList.toggle('is-light', k > 0.88)
        }
      }
      cloudCv.style.visibility = cloudsOn ? 'visible' : 'hidden'
      if (cloudsOn) clouds.render(time, 1 / 60)
      navLinks.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + scenes[current].el.id))
      progressLine.style.transform = `scaleX(${clamp01(scrollY / Math.max(1, document.documentElement.scrollHeight - viewH))})`
    }

    /* 백양로: speed lines streaming past as the flight rushes. */
    const speedCv = document.getElementById('speedLines')
    const speedCtx = speedCv.getContext('2d')
    const streaks = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 0.6 + Math.random() * 1.6 }))
    let speedClear = true
    const drawSpeed = (dt, rush) => {
      const w = speedCv.clientWidth
      const h = speedCv.clientHeight
      if (speedCv.width !== w || speedCv.height !== h) ((speedCv.width = w), (speedCv.height = h))
      if (rush < 0.02) {
        if (!speedClear) speedCtx.clearRect(0, 0, w, h)
        speedClear = true
        return
      }
      speedClear = false
      const g = speedCtx
      g.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h * 0.45
      const R = Math.hypot(w, h) / 2
      // Edges darken toward a tunnel.
      const v = g.createRadialGradient(cx, cy, R * 0.35, cx, cy, R)
      v.addColorStop(0, 'rgba(2, 6, 15, 0)')
      v.addColorStop(1, `rgba(2, 6, 15, ${(rush * 0.55).toFixed(3)})`)
      g.fillStyle = v
      g.fillRect(0, 0, w, h)
      g.strokeStyle = '#dcebff'
      g.lineCap = 'round'
      for (const l of streaks) {
        l.r += dt * (0.4 + rush * 2.6)
        if (l.r > 1) ((l.r = 0.18 + Math.random() * 0.2), (l.a = Math.random() * Math.PI * 2))
        const r0 = l.r * R
        const r1 = r0 + rush * R * 0.3 * l.r
        g.globalAlpha = rush * 0.5 * l.r
        g.lineWidth = l.w
        g.beginPath()
        g.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0)
        g.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1)
        g.stroke()
      }
      g.globalAlpha = 1
    }

    /* Finale marquee: drifts on its own, faster with the scroll. */
    const marquee = document.getElementById('marquee')
    let marqueeX = 0

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
        openCard(h),
      )
      locks.prepend(el)
      h.alpha = 0
      return el
    })
    const placeTags = (dt, reserved) => {
      const cam = flight.camera.position
      const far = 260 + flight.overview * 700
      const max = (innerWidth < 760 ? 6 : 16) + Math.round(flight.overview * (innerWidth < 760 ? 4 : 40))
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
    /* Building directory: pick any hall and the eagle flies over to circle it. */
    const dir = document.getElementById('dir')
    const dirList = document.getElementById('dirList')
    const dirSearch = document.getElementById('dirSearch')
    const dirBack = document.getElementById('dirBack')
    document.getElementById('dirCount').textContent = flight.directory.length
    const dirItems = flight.directory.map((h) => {
      const li = document.createElement('li')
      li.innerHTML = `<button type="button"><span>${h.name}</span><small>${h.code ? h.code : ''}</small></button>`
      li.firstChild.addEventListener('click', () => {
        dir.hidden = true
        goTo(h)
      })
      dirList.appendChild(li)
      return { li, name: h.name }
    })
    dirSearch.addEventListener('input', () => {
      const q = dirSearch.value.trim()
      dirItems.forEach(({ li, name }) => (li.hidden = q && !name.includes(q)))
    })
    // Keep wheel/touch scrolling inside the list from driving the page.
    dirList.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
    dir.setAttribute('data-lenis-prevent', '')
    document.getElementById('dirBtn').addEventListener('click', () => {
      dir.hidden = !dir.hidden
      if (!dir.hidden) dirSearch.focus({ preventScroll: true })
    })
    document.getElementById('dirClose').addEventListener('click', () => (dir.hidden = true))
    dirBack.addEventListener('click', () => flight.exitFree())
    flight.onExitFree = () => {
      dirBack.hidden = true
      card.hidden = true
    }
    const card = document.getElementById('card')
    // Detail card: story, key facts, nearby halls, fly-to and map link.
    const cardEls = Object.fromEntries(['Code', 'Name', 'En', 'Body', 'Rows', 'Facts', 'Near', 'Go', 'Map'].map((k) => [k, document.getElementById('card' + k)]))
    const findHall = (name) => flight.directory.find((h) => h.name === name || h.name.startsWith(name))
    const openCard = (t) => {
      const hall = t.anchor ? t : findHall(t.name) || t
      const info = INFO[t.name] || INFO[t.name.replace(/병원 본관$/, '병원')] || {}
      const code = t.code || hall.code
      cardEls.Code.textContent = [info.kind || KIND[hall.style] || (t.key ? '랜드마크' : '캠퍼스 건물'), code ? `No. ${code}` : ''].filter(Boolean).join('  ·  ')
      cardEls.Name.textContent = t.name
      cardEls.En.textContent = t.en || hall.en || 'Yonsei University · Sinchon Campus'
      cardEls.Body.textContent = info.story || t.body || hall.body || '연세대학교 신촌캠퍼스의 건물이에요.'
      const rows = [...(info.rows || [])]
      if ((t.lv || hall.lv) && !rows.some(([k]) => k === '층수')) rows.push(['층수', `지상 ${t.lv || hall.lv}층`])
      cardEls.Rows.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')
      cardEls.Facts.innerHTML = (info.facts || []).map((f) => `<li>${f}</li>`).join('')
      // Three nearest named halls, each a jump.
      const a = hall.anchor || t.anchor
      const near = a ? flight.directory.filter((h) => h.name !== t.name && h.anchor).map((h) => [h, Math.hypot(h.anchor.x - a.x, h.anchor.z - a.z)]).sort((x, y) => x[1] - y[1]).slice(0, 3) : []
      if (!info.story && !t.body && !hall.body && near.length)
        cardEls.Body.textContent = `${near[0][0].name}에서 ${Math.round(near[0][1])}m 떨어진 ${(KIND[hall.style] || '캠퍼스 건물').replace(/물$/, '물')}이에요. 아래 '가까이 날아가 보기'로 독수리와 함께 둘러보세요.`
      cardEls.Near.innerHTML = near.length ? '<span>주변</span>' + near.map(([h, d]) => `<button type="button" data-n="${h.name}">${h.name} <small>${Math.round(d)}m</small></button>`).join('') : ''
      cardEls.Near.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goTo(findHall(b.dataset.n))))
      cardEls.Go.hidden = !a
      cardEls.Go.onclick = () => goTo({ ...hall, anchor: a, size: hall.size || 60, name: t.name })
      cardEls.Map.href = `https://map.kakao.com/?q=${encodeURIComponent('연세대학교 ' + t.name.replace(/연세대학교 /, ''))}`
      card.hidden = false
      card.openedAt = flight.progress
      gsap.fromTo(card, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true })
    }
    const goTo = (h) => {
      if (!h) return
      flight.flyTo(h)
      dirBack.hidden = false
      openCard(h)
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
    const uwGrain = document.getElementById('uwGrain')
    const uwBubble = document.getElementById('uwBubble')
    const uwDots = ERAS.map((e) => {
      const li = document.createElement('li')
      li.textContent = e.year
      document.getElementById('uwDots').appendChild(li)
      return li
    })
    if (matchMedia('(hover: none)').matches) document.querySelector('.hint--flight').lastChild.textContent = '화면을 끌어 방향 전환 · 타겟을 탭해 보세요'
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
      mute.lastChild.textContent = akaraka.muted ? 'SOUND OFF' : 'SOUND ON'
      mute.classList.toggle('is-off', akaraka.muted)
    })

    /* Outro: launch and the Aura Wing card. */
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

    // Each hint shows until the visitor acts (or for 7 s once in view).
    document.querySelectorAll('.hint:not(.hint--uw)').forEach((h) => {
      const sec = h.closest('.scene')
      let timer = 0
      const quiet = () => h.classList.add('is-quiet')
      sec?.addEventListener('pointerdown', quiet, { once: true })
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !timer) timer = setTimeout(quiet, 7000)
      }).observe(sec)
    })

    return (dt) => {
      transitions()
      heroTick()

      const fp = progress(scenes[1].el)
      flight.progress = fp
      flightHead.style.opacity = 1 - clamp01((fp - 0.04) / 0.06)
      underwood.progress = underwood.pace(progress(scenes[2].el))
      globe.progress = progress(scenes[3].el)

      for (const s of scenes) {
        if (!s.on) continue
        s.view.render(dt)
        // Film only a chapter that holds the whole screen.
        if (s === scenes[current] && s !== scenes[5] && !s.sticky.style.clipPath && !(s === scenes[1] && flight.intro > 0.001)) capture(s)
      }

      if (scenes[1].on) {
        speedEl.textContent = Math.round(30 + flight.speed * 3.6)
        drawSpeed(dt, flight.rush)
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
        // A card from the tour closes itself once the flight has moved on.
        if (!card.hidden && !flight.free && Math.abs(flight.progress - card.openedAt) > 0.04) card.hidden = true
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
        uwGrain.style.opacity = underwood.grain.toFixed(3)
        if (!uwBubble.hidden) {
          const h = underwood.headScreen()
          uwBubble.style.transform = `translate(${h.x + 24}px, ${h.y - 70}px)`
        }
      }
      if (scenes[3].on) {
        globe.hubScreens().forEach((s, i) => {
          const el = hubEls[i]
          const a = clamp01((s.facing - 0.1) / 0.3) * globe.reveal[i]
          el.style.opacity = a
          el.style.visibility = a > 0.02 ? 'visible' : 'hidden'
          // 신촌 and 송도 sit 30 km apart, so their tags split above and below.
          el.style.transform = `translate(${Math.min(s.x, innerWidth - el.offsetWidth - 12)}px, ${s.y + (i === 0 ? -22 : i === 1 ? 10 : 0)}px)`
        })
      }
      if (scenes[5].on) {
        marqueeX -= dt * (40 + Math.min(900, Math.abs(lenis.velocity) * 30))
        const span = marquee.firstElementChild.offsetWidth || 1
        if (marqueeX < -span) marqueeX += span
        marquee.style.transform = `translate3d(${marqueeX.toFixed(1)}px, 0, 0)`
      }
    }
  }
}

boot()
