import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'
import { Hero } from './scenes/hero.js'
import { Baekyang } from './scenes/baekyang.js'
import { ERAS, Underwood } from './scenes/underwood.js'
import { Globe, HUBS } from './scenes/globe.js'
import { Akaraka } from './scenes/akaraka.js'
import { Outro } from './scenes/outro.js'
import { drawAura } from './aura.js'
import { INFO, KIND } from './data/info.js'

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
  await Promise.race([
    Promise.all([document.fonts.load('400 60px "Instrument Serif"', 'Beyond'), document.fonts.load('italic 400 60px "Instrument Serif"', 'Eternity'), document.fonts.load('800 60px "Inter Tight"', 'AKARAKA'), document.fonts.load('500 12px "JetBrains Mono"', 'SPEED')]),
    new Promise((r) => setTimeout(r, 2500)),
  ])

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
  // Chapters overlap by one screen (the next slides up over the last), so a
  // chapter's own story plays out before the next one starts to cover it.
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
  })

  // Headlines rise line by line, behind a mask, as their chapter arrives.
  const splitLines = (el) => {
    const parts = el.innerHTML.split(/<br\s*\/?>/i)
    el.innerHTML = parts.map((p) => `<span class="line"><span class="line__in">${p.trim()}</span></span>`).join('')
  }
  document.querySelectorAll('.flight__head .h2, .global__copy .h2, .akaraka__title, .outro__title').forEach(splitLines)
  document.querySelectorAll('.outro__ko, .dest').forEach((el) => el.classList.add('outro-extra'))
  scenes.slice(1).forEach((s) => {
    s.lines = s.el.querySelectorAll('.line__in')
    s.extras = s.el.querySelectorAll(':scope .scene__sticky > div > .kicker, :scope .scene__sticky > div > .body:not(.uw__body), :scope .outro__head > .kicker, :scope .outro-extra, :scope .outro__actions')
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
  const navLinks = [...document.querySelectorAll('.nav__links a')]
  const progressLine = document.getElementById('progressLine')
  // Card-stack transition: the incoming chapter rounds its top corners and
  // slides up; the outgoing one recedes and dims beneath it.
  const transitions = () => {
    let current = 0
    for (let i = 0; i < scenes.length; i++) {
      const top = scenes[i].el.getBoundingClientRect().top
      const k = i === 0 ? 1 : clamp01(1 - top / viewH)
      if (top <= viewH * 0.5) current = i
      if (i > 0) {
        const r = (1 - k) * 28
        scenes[i].sticky.style.borderRadius = k > 0 && k < 1 ? `${r}px ${r}px 0 0` : ''
        scenes[i].sticky.style.boxShadow = k > 0 && k < 1 ? '0 -30px 80px rgba(0, 0, 0, 0.55)' : ''
        const prev = scenes[i - 1]
        const cover = k > 0 && k < 1 ? k : k >= 1 ? 1 : 0
        prev.sticky.style.transform = cover > 0 && cover < 1 ? `scale(${1 - cover * 0.06})` : ''
        prev.shade.style.opacity = (cover * 0.7).toFixed(3)
        reveal(scenes[i], k > 0.55)
      }
    }
    navLinks.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + scenes[current].el.id))
    progressLine.style.transform = `scaleX(${clamp01(scrollY / Math.max(1, document.documentElement.scrollHeight - viewH))})`
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

    transitions()
    const hp = progress(scenes[0].el)
    hero.progress = hp
    heroCopy.style.opacity = 1 - clamp01((hp - 0.15) / 0.25)

    const fp = progress(scenes[1].el)
    flight.progress = fp
    flightHead.style.opacity = 1 - clamp01((fp - 0.04) / 0.06)

    underwood.progress = underwood.pace(progress(scenes[2].el))

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
        // 신촌 and 송도 sit 30 km apart, so their tags split above and below.
        el.style.transform = `translate(${Math.min(s.x, innerWidth - el.offsetWidth - 12)}px, ${s.y + (i === 0 ? -22 : i === 1 ? 10 : 0)}px)`
      })
    }
    outro.progress = progress(scenes[5].el)
  })
}

boot()
