// Procedural PBR materials: Wood, Marble, Metal, White.
// Textures are painted once into canvases at startup, so the project ships no image files.
import * as THREE from 'three'

const SIZE = 512

// ---------- seeded value noise + fbm ----------
function makeNoise(seed) {
  const p = new Uint8Array(512)
  let s = seed >>> 0
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const perm = Array.from({length: 256}, (_, i) => i)
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]
  const fade = t => t * t * (3 - 2 * t)
  const h = (x, y) => p[(p[x & 255] + y) & 255] / 255
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1)
    const u = fade(xf), v = fade(yf)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const fbm = (x, y, oct = 5) => {
    let sum = 0, amp = 0.5, f = 1
    for (let i = 0; i < oct; i++) { sum += amp * noise(x * f, y * f); f *= 2; amp *= 0.5 }
    return sum
  }
  return {noise, fbm}
}

function paint(fn) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE
  const g = c.getContext('2d'), img = g.createImageData(SIZE, SIZE), d = img.data
  const bump = document.createElement('canvas'); bump.width = bump.height = SIZE
  const bg = bump.getContext('2d'), bimg = bg.createImageData(SIZE, SIZE), bd = bimg.data
  const out = [0, 0, 0, 0]
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    fn(x, y, out)                      // out = [r, g, b, height 0..1]
    const i = (y * SIZE + x) * 4
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255
    const hv = Math.max(0, Math.min(255, out[3] * 255))
    bd[i] = bd[i + 1] = bd[i + 2] = hv; bd[i + 3] = 255
  }
  g.putImageData(img, 0, 0); bg.putImageData(bimg, 0, 0)
  return {color: c, bump}
}

const mix = (a, b, t) => a + (b - a) * t
const clamp01 = v => Math.max(0, Math.min(1, v))

function woodCanvas() {
  const {fbm, noise} = makeNoise(7)
  return paint((x, y, o) => {
    const u = x / SIZE, v = y / SIZE
    // flat-sawn oak: wide cathedral rings, warped, with fine pores and color drift
    const warp = fbm(u * 2.2, v * 0.45, 5) * 5.5 + Math.pow(Math.abs(v - 0.5) * 2, 2) * 1.4
    const ring = Math.sin((u * 9 + warp) * Math.PI * 2)
    let t = Math.pow(clamp01(ring * 0.5 + 0.5), 7) * 0.45
    const pores = Math.pow(noise(u * 700, v * 14), 7)
    const streak = (fbm(u * 70, v * 1.2, 4) - 0.5) * 0.5
    const drift = fbm(u * 1.5 + 4, v * 1.5, 3)
    t = clamp01(t + 0.32 + streak + pores * 0.3)
    o[0] = mix(196, 118, t) - drift * 22; o[1] = mix(150, 78, t) - drift * 18; o[2] = mix(98, 42, t) - drift * 12
    o[3] = 0.6 - t * 0.35 - pores * 0.5
  })
}

function marbleCanvas() {
  const {fbm} = makeNoise(21)
  return paint((x, y, o) => {
    const u = x / SIZE, v = y / SIZE
    const turb = fbm(u * 4, v * 4, 6)
    const veinA = Math.abs(Math.sin((u * 3.2 + v * 2.1 + turb * 4.2) * Math.PI))
    const veinB = Math.abs(Math.sin((u * 7.5 - v * 5.0 + fbm(u * 9, v * 9, 5) * 3.5) * Math.PI))
    const a = Math.pow(1 - veinA, 22), b = Math.pow(1 - veinB, 40) * 0.55
    const cloud = (fbm(u * 2.5 + 9, v * 2.5, 4) - 0.5) * 22
    const t = clamp01(a + b)
    o[0] = mix(240 + cloud, 92, t); o[1] = mix(238 + cloud, 96, t); o[2] = mix(233 + cloud, 104, t)
    o[3] = 0.5
  })
}

function metalCanvas() {
  const {noise, fbm} = makeNoise(33)
  return paint((x, y, o) => {
    const u = x / SIZE, v = y / SIZE
    const brush = noise(u * 2, v * 380) * 0.55 + noise(u * 6, v * 900) * 0.45   // long horizontal streaks
    const blot = fbm(u * 3, v * 3, 3)
    const g = 205 + (brush - 0.5) * 20 + (blot - 0.5) * 10
    o[0] = g; o[1] = g + 2; o[2] = g + 6
    o[3] = brush                                        // reused as roughness map
  })
}

function whiteCanvas() {
  const {fbm} = makeNoise(45)
  return paint((x, y, o) => {
    const u = x / SIZE, v = y / SIZE
    const n = fbm(u * 40, v * 40, 3)
    const g = 241 + (n - 0.5) * 8
    o[0] = g; o[1] = g - 1; o[2] = g - 4
    o[3] = n
  })
}

function tex(canvas, color = true) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Returns [{key, label, swatch(canvas), make(): Material}] */
export function createMaterialLibrary() {
  const wood = woodCanvas(), marble = marbleCanvas(), metal = metalCanvas(), white = whiteCanvas()
  return [
    {
      key: 'wood', label: 'Wood', swatch: wood.color,
      make: () => new THREE.MeshPhysicalMaterial({
        map: tex(wood.color), bumpMap: tex(wood.bump, false), bumpScale: 1.2,
        roughness: 0.58, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.2, sheenRoughness: 0.8,
      }),
    },
    {
      key: 'marble', label: 'Marble', swatch: marble.color,
      make: () => new THREE.MeshPhysicalMaterial({
        map: tex(marble.color), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06,
        ior: 1.55, specularIntensity: 0.9,
      }),
    },
    {
      key: 'metal', label: 'Metal', swatch: metal.color,
      make: () => new THREE.MeshPhysicalMaterial({
        map: tex(metal.color), roughnessMap: tex(metal.bump, false), metalness: 1, roughness: 0.32,
        anisotropy: 0.8, envMapIntensity: 1.4,
      }),
    },
    {
      key: 'white', label: 'White', swatch: white.color,
      make: () => new THREE.MeshPhysicalMaterial({
        map: tex(white.color), bumpMap: tex(white.bump, false), bumpScale: 0.35,
        roughness: 0.88, sheen: 0.3, sheenRoughness: 1,
      }),
    },
  ]
}
