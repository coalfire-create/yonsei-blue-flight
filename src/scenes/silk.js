// Fragment shaders for ShaderCanvas (the shared header declares uRes, uTime,
// uMouse, uHover, uProgress and fragColor).

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`

// A sheet of Yonsei-blue silk folding slowly. The pointer is the light — the
// folds catch a sheen wherever it moves. uProgress lets the cloth sink away,
// uTear (0..1) burns it open onto pale sky, and uTone moves the palette from
// night (0, the opening) to dawn (1, the finale).
export const SILK = /* glsl */ `
  uniform float uTear;
  uniform float uTone;
  ${NOISE}

  float fold(vec2 p){
    float t = uTime * 0.11;
    vec2 q = p;
    q += 0.32 * vec2(sin(q.y * 2.1 + t * 2.6), cos(q.x * 1.5 - t * 2.1));
    q += 0.14 * vec2(sin(q.y * 4.3 - t * 3.4), cos(q.x * 3.7 + t * 2.9));
    return sin(q.x * 2.4 + q.y * 1.1 + t * 1.7) * 0.6 + sin(q.x * 0.9 - q.y * 2.2 - t) * 0.4;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * (1.0 + uProgress * 0.35);
    vec2 m = (uMouse - 0.5) * vec2(aspect, 1.0);

    // Surface normal from the fold height.
    float e = 0.004;
    float h = fold(p);
    vec3 n = normalize(vec3(-(fold(p + vec2(e, 0.0)) - h) / e, -(fold(p + vec2(0.0, e)) - h) / e, 1.7));

    // Light hangs above the pointer (or drifts on its own when idle).
    vec3 L = normalize(vec3(m - p, 0.9));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float near = exp(-dot(p - m, p - m) * 1.6);

    // Night: deep royal cloth in the dark.
    vec3 royal = vec3(0.0, 0.16, 0.42);
    vec3 night = mix(vec3(0.005, 0.02, 0.07), royal, diff * (0.45 + 0.55 * near));
    night += royal * 0.35 * smoothstep(-0.2, 1.0, h);
    night += vec3(0.55, 0.72, 1.0) * spec * (0.35 + 0.9 * near);
    night *= 1.0 - 0.55 * length((uv - vec2(0.55, 0.62)) * vec2(1.0, 1.2));
    night *= 1.0 - 0.6 * uProgress;

    // Dawn: pale cloth with blue shadows in its folds.
    vec3 dawn = mix(vec3(0.5, 0.62, 0.9), vec3(0.93, 0.96, 1.0), 0.35 + 0.65 * diff);
    dawn = mix(dawn, vec3(0.78, 0.86, 1.0), smoothstep(0.4, -0.8, h) * 0.3);
    dawn += vec3(1.0) * spec * (0.25 + 0.4 * near);

    vec3 col = mix(night, dawn, uTone);

    // Tearing open: ragged holes onto sky, with a glowing hem.
    if (uTear > 0.0){
      float r = fbm(p * 2.2 + vec2(0.0, uTime * 0.05)) + 0.25 * length(p);
      float edge = uTear * 1.6 - r;
      vec3 sky = vec3(0.8, 0.87, 0.98);
      col = mix(col, sky, smoothstep(0.0, 0.04, edge));
      col += vec3(0.6, 0.8, 1.0) * exp(-abs(edge) * 45.0) * smoothstep(0.0, 0.1, uTear) * 1.6;
    }

    col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.025;
    fragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
  }
`

// Cloud bank between the opening and the campus: layers of cloud rushing
// past the camera as it drops (uProgress), thickest at uDensity 1.
// Output is premultiplied, over the page.
export const CLOUDS = /* glsl */ `
  uniform float uDensity;
  ${NOISE}
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 6; i++){
      float fi = float(i);
      float z = fract(fi / 6.0 + uProgress * 1.4);
      float sc = mix(3.2, 0.35, z);
      vec2 q = p * sc + vec2(fi * 3.1, fi * 1.7) + vec2(uTime * 0.02, -z * 0.6);
      float d = fbm(q);
      float a = smoothstep(0.42, 0.78, d) * smoothstep(0.0, 0.3, z) * smoothstep(1.0, 0.8, z) * uDensity;
      vec3 c = mix(vec3(0.58, 0.68, 0.88), vec3(1.0), smoothstep(0.45, 0.85, d) * (0.55 + 0.45 * uv.y));
      acc.rgb += (1.0 - acc.a) * c * a;
      acc.a += (1.0 - acc.a) * a;
    }
    float haze = uDensity * uDensity * 0.8;
    acc.rgb += (1.0 - acc.a) * vec3(0.8, 0.86, 0.97) * haze;
    acc.a += (1.0 - acc.a) * haze;
    fragColor = acc;
  }
`
