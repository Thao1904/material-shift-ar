// Shared "mix" pattern for the block: a 3D field of values 0..1 laid over the block, computed in
// plain JS (so every phone gets exactly the same numbers, whatever its GPU), then uploaded as a
// small 3D texture.
//
// Two properties matter:
//  1. Symmetric. The red-dot block looks the same after a quarter turn about its thickness axis
//     or after flipping it over, so the tracker cannot tell those 8 poses apart (without the
//     optional black mark). The field is averaged over those 8 transforms, so whichever of the 8
//     poses a phone picks, the patches land on the same spots of the real block.
//  2. Uniform. Values are rank-transformed over the block surface, so a band [lo, hi) of the
//     field covers exactly (hi - lo) of the surface. A 30 % share really is 30 % of the block.
import * as THREE from 'three'

// ---- deterministic value noise (integer hash, no Math.random) ----
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}
const fade = t => t * t * (3 - 2 * t)
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi)
  const l = (a, b, t) => a + (b - a) * t
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx), fy),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx), fy), fz)
}
function fbm(x, y, z) {
  let s = 0, a = 0.5
  for (let i = 0; i < 4; i++) { s += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5 }
  return s
}
const OFF = 13.7
/** The raw field at block point (x, y, z) in cm (Y = thickness axis), averaged over the 8 symmetries. */
export function symField(x, y, z, freq) {
  let s = 0
  for (let f = 0; f < 2; f++) {
    const ax = x, ay = f ? -y : y, az = f ? -z : z                       // flip over (180° about X)
    s += fbm(ax * freq + OFF, ay * freq + OFF, az * freq + OFF)          // quarter turns about Y
    s += fbm(az * freq + OFF, ay * freq + OFF, -ax * freq + OFF)
    s += fbm(-ax * freq + OFF, ay * freq + OFF, -az * freq + OFF)
    s += fbm(-az * freq + OFF, ay * freq + OFF, ax * freq + OFF)
  }
  return s / 8
}

/**
 * Build the 3D texture for a box {w, h, d} (cm, h = thickness). `extent` is the size the
 * texture spans (the rendered box, slightly larger than the real one). Returns
 * {texture, sample(x,y,z) -> 0..1 (uniform over the surface), size}.
 */
export function buildMixField(box, {step = null, freq = null, extent = 1.012} = {}) {
  step = step ?? Math.max(box.w, box.h, box.d) / 64
  freq = freq ?? 2.8 / Math.max(box.w, box.h, box.d)
  const E = {x: box.w * extent, y: box.h * extent, z: box.d * extent}
  const nx = Math.min(96, Math.round(E.x / step) + 1), ny = Math.min(96, Math.round(E.y / step) + 1), nz = Math.min(96, Math.round(E.z / step) + 1)
  const raw = new Float32Array(nx * ny * nz).fill(NaN)
  const at = (i, n, L) => (i / (n - 1) - 0.5) * L
  // only a shell near the surface is ever sampled; skip the inside
  const SHELL = 2
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const edge = Math.min(i, nx - 1 - i, j, ny - 1 - j, k, nz - 1 - k)
    if (edge > SHELL) continue
    raw[i + nx * (j + ny * k)] = symField(at(i, nx, E.x), at(j, ny, E.y), at(k, nz, E.z), freq)
  }
  // rank transform over the surface voxels: value -> share of the surface below it
  const surf = []
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) surf.push(raw[i + nx * (j + ny * k)])
  }
  surf.sort((a, b) => a - b)
  const cdf = (v) => {
    let lo = 0, hi = surf.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (surf[m] < v) lo = m + 1; else hi = m }
    return lo / surf.length
  }
  const data = new Uint8Array(nx * ny * nz)
  for (let n = 0; n < data.length; n++) data[n] = Number.isNaN(raw[n]) ? 128 : Math.round(cdf(raw[n]) * 255)
  const texture = new THREE.Data3DTexture(data, nx, ny, nz)
  texture.format = THREE.RedFormat
  texture.type = THREE.UnsignedByteType
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  /** Nearest-voxel lookup (tests + checks), block coords in cm. */
  const sample = (x, y, z) => {
    const i = Math.round((x / E.x + 0.5) * (nx - 1)), j = Math.round((y / E.y + 0.5) * (ny - 1)), k = Math.round((z / E.z + 0.5) * (nz - 1))
    const c = v => Math.max(0, v)
    return data[Math.min(nx - 1, c(i)) + nx * (Math.min(ny - 1, c(j)) + ny * Math.min(nz - 1, c(k)))] / 255
  }
  return {texture, sample, size: [nx, ny, nz], extent: E}
}

/**
 * Turn weights per material into layers: {base, bands: [{m, lo, hi}]}.
 * Materials are ordered by index, so every phone builds the same layers from the same weights.
 * The last material is the base (fills what the bands leave); the others are bands of the field.
 */
export function layersFromWeights(weights, fallback = 0) {
  const list = [...weights.entries()].filter(([, w]) => w > 1e-6).sort((a, b) => a[0] - b[0])
  if (!list.length) return {base: fallback, bands: []}
  const total = list.reduce((s, [, w]) => s + w, 0)
  const bands = []
  let c = 0
  for (let n = 0; n < list.length - 1; n++) {
    const hi = c + list[n][1] / total
    bands.push({m: list[n][0], lo: c, hi})
    c = hi
  }
  return {base: list[list.length - 1][0], bands}
}
