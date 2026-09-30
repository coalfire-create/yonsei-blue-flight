// The Yonsei University seal as a vector (redrawn after the university's
// published symbol: the ring with YONSEI UNIVERSITY and 연세대학교, and the
// shield holding ㅇ and ㅅ, the book of truth, the torch of freedom and
// 1885). Drawn in light: rules trace on, the shield fills, the lettering
// arrives letter by letter and a sheen sweeps across now and then.

let n = 0
export function sealSVG({ className = '' } = {}) {
  const id = `seal${n++}`
  return `
<svg class="seal ${className}" viewBox="0 0 400 400" aria-label="연세대학교 심볼" role="img">
  <defs>
    <path id="${id}t" d="M 44,200 A 156,156 0 0,1 356,200" />
    <path id="${id}b" d="M 34,200 A 166,166 0 0,0 366,200" />
    <clipPath id="${id}c"><path d="${SHIELD}" /></clipPath>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#fff" stop-opacity="0" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.55" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <clipPath id="${id}all"><circle cx="200" cy="200" r="197" /></clipPath>
  </defs>
  <g class="seal__band">
    <circle class="seal__disc" cx="200" cy="200" r="194" />
    <circle class="seal__rule" cx="200" cy="200" r="194" pathLength="1" />
    <circle class="seal__rule" cx="200" cy="200" r="132" pathLength="1" />
    <circle class="seal__rule seal__rule--thin" cx="200" cy="200" r="124" pathLength="1" />
  </g>
  <text class="seal__type seal__type--en"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${[...'YONSEI UNIVERSITY'].map((c, i) => `<tspan style="--i:${i}">${c}</tspan>`).join('')}</textPath></text>
  <text class="seal__type seal__type--ko"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${[...'연 세 대 학 교'].map((c, i) => `<tspan style="--i:${i + 17}">${c}</tspan>`).join('')}</textPath></text>
  <circle class="seal__dot" cx="34" cy="200" r="4.5" />
  <circle class="seal__dot" cx="366" cy="200" r="4.5" />
  <g class="seal__shield">
    <path class="seal__shieldfill" d="${SHIELD}" />
    <g clip-path="url(#${id}c)">
      <!-- ㅅ: the chevron, and 1885 beneath it -->
      <path class="seal__mark" d="M112,300 L200,222 L288,300 L288,326 L200,248 L112,326 Z" />
      <text class="seal__year" x="200" y="296" text-anchor="middle">1885</text>
    </g>
    <!-- ㅇ -->
    <circle class="seal__o" cx="200" cy="170" r="21" />
    <!-- book (truth) -->
    <path class="seal__icon" d="M137,158 q9,-4 17,1 v17 q-8,-5 -17,-1 z M157,159 q8,-5 17,-1 v17 q-9,-4 -17,1 z" />
    <!-- torch (freedom) -->
    <path class="seal__icon" d="M256,151 q-7,6 -3,12 q2,-5 5,-6 q1,5 5,6 q3,-7 -2,-11 q-2,3 -3,3 q0,-3 -2,-4 z M255,165 h10 l-3,4 h-4 z M258,169 h4 l-1,16 h-2 z" />
    <path class="seal__shieldrule" d="${SHIELD}" pathLength="1" />
  </g>
  <rect class="seal__sheen" x="-400" y="0" width="300" height="400" fill="url(#${id}s)" clip-path="url(#${id}all)" />
</svg>`
}

const SHIELD = 'M118,128 C150,120 176,114 200,108 C224,114 250,120 282,128 L282,214 C282,262 248,296 200,318 C152,296 118,262 118,214 Z'
