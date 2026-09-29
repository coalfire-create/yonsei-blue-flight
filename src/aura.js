// "Aura Wing" card: a one-of-a-kind holographic card drawn from the visitor's
// own flight trail (pointer path over the hero) and how much ivy they grew.

const W = 720
const H = 1080

export function drawAura(canvas, { trail, leaves, season }) {
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#0a2a66')
  g.addColorStop(0.55, '#050c1a')
  g.addColorStop(1, '#003876')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Holographic sheen.
  const sheen = ctx.createLinearGradient(0, H * 0.2, W, H * 0.8)
  sheen.addColorStop(0, 'rgba(0,210,255,0)')
  sheen.addColorStop(0.45, 'rgba(0,210,255,0.18)')
  sheen.addColorStop(0.55, 'rgba(180,120,255,0.14)')
  sheen.addColorStop(1, 'rgba(0,210,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)

  // The visitor's trail, mirrored into a pair of wings.
  const pts = trail.length > 8 ? trail : demoTrail()
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (x) => ((x - minX) / Math.max(1e-6, maxX - minX)) * 280
  const sy = (y) => 260 + ((y - minY) / Math.max(1e-6, maxY - minY)) * 420
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const side of [-1, 1]) {
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath()
      pts.forEach(([x, y], i) => {
        const X = W / 2 + side * (20 + sx(x))
        const Y = sy(y)
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)
      })
      ctx.strokeStyle = ['rgba(0,210,255,0.12)', 'rgba(79,172,254,0.35)', 'rgba(255,255,255,0.9)'][pass]
      ctx.lineWidth = [22, 8, 1.6][pass]
      ctx.lineJoin = ctx.lineCap = 'round'
      ctx.stroke()
    }
  }
  ctx.restore()

  // Ivy pattern along the bottom, one leaf per ~20 grown (season colour).
  const leafColor = { summer: '#4fbf4a', autumn: '#e0562b', winter: '#bfe9ff', spring: '#a8e36a' }[season] ?? '#4fbf4a'
  const n = Math.min(90, 12 + Math.floor(leaves / 20))
  for (let i = 0; i < n; i++) {
    const x = 40 + ((i * 97) % (W - 80))
    const y = H - 150 - ((i * 53) % 120)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(((i * 1.7) % 6.28) - 3.14)
    ctx.fillStyle = leafColor
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(10, -4, 12, -14, 5, -20)
    ctx.lineTo(0, -28)
    ctx.lineTo(-5, -20)
    ctx.bezierCurveTo(-12, -14, -10, -4, 0, 0)
    ctx.fill()
    ctx.restore()
  }

  // Text.
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.font = '700 22px "Space Grotesk", sans-serif'
  ctx.fillText('YONSEI · AURA WING', 48, 76)
  ctx.textAlign = 'right'
  const id = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
  ctx.fillText(`No. ${id}`, W - 48, 76)
  ctx.textAlign = 'left'
  ctx.font = '800 64px "Syne", sans-serif'
  ctx.fillText('BLUE', 48, 170)
  ctx.fillText('FLIGHT', 48, 232)
  ctx.font = '600 22px "Pretendard Variable", Pretendard, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`비행 궤적 ${pts.length}점 · 담쟁이 ${leaves}잎`, 48, H - 70)
  ctx.font = '500 18px "Space Grotesk", sans-serif'
  ctx.fillText('Beyond the Horizon, Into Eternity.', 48, H - 40)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.strokeRect(18, 18, W - 36, H - 36)
}

function demoTrail() {
  return Array.from({ length: 60 }, (_, i) => [Math.sin(i * 0.2) * 0.5 + i / 60, Math.cos(i * 0.13) * 0.4 + i / 90])
}
