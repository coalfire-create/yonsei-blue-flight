import * as THREE from 'three'

// Full-screen backdrop from a baked still of the 3D campus (public/bg/*,
// rendered from the flight scene's own world). Cover-fit, with parallax
// offset, zoom and a colour grade; picks the portrait bake on tall screens.

const frag = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uScreen, uImg, uZoom, uDark, uWarm, uReady;
  uniform vec2 uOff;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main(){
    vec2 uv = vUv - 0.5;
    // Cover fit.
    if (uScreen > uImg) uv.y *= uImg / uScreen; else uv.x *= uScreen / uImg;
    uv = uv / uZoom + 0.5 + uOff;
    vec3 c = texture2D(uTex, clamp(uv, 0.001, 0.999)).rgb;
    c = mix(c, c * uTint, uDark);
    c *= 1.0 - uDark * 0.55;
    // Warm grade: lift contrast and saturation, push toward amber.
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, mix(vec3(l), c, 1.35) * vec3(1.14, 0.98, 0.82), uWarm);
    c = mix(c, (c - 0.45) * 1.25 + 0.45, uWarm * 0.6);
    c = max(c, 0.0);
    // Vignette.
    float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.2, 1.0)));
    c *= mix(0.55, 1.0, v);
    gl_FragColor = vec4(c * uReady, 1.0);
  }
`

export function backdrop(name) {
  const u = {
    uTex: { value: null },
    uScreen: { value: 1 },
    uImg: { value: 1 },
    uZoom: { value: 1 },
    uDark: { value: 0 },
    uWarm: { value: 0 },
    uReady: { value: 0 },
    uOff: { value: new THREE.Vector2() },
    uTint: { value: new THREE.Color('#5a7cc0') },
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: frag,
      uniforms: u,
      depthWrite: false,
      depthTest: false,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  const loader = new THREE.TextureLoader()
  let current = ''
  const load = (tall) => {
    const file = `/bg/${name}-${tall ? 'tall' : 'wide'}.jpg`
    if (file === current) return
    current = file
    loader.load(file, (t) => {
      if (file !== current) return
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      u.uTex.value?.dispose()
      u.uTex.value = t
      u.uImg.value = t.image.width / t.image.height
    })
  }
  return {
    mesh,
    u,
    resize(w, h) {
      u.uScreen.value = w / h
      load(w / h < 0.8)
    },
    // Fade in once loaded.
    update(dt) {
      if (u.uTex.value) u.uReady.value = Math.min(1, u.uReady.value + dt * 1.5)
    },
  }
}
