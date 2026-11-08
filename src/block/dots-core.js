// Red-dot block tracker: pure functions, no DOM, so they run in the browser and in Node tests.
//
// The block has 4 red dots near the corners of every face. Each frame we:
//   1. find small round red blobs,
//   2. pick the 4 blobs that enclose a white, convex quad (the face),
//   3. fit two face models (square top face, long thin side face) with a homography,
//   4. keep the model whose rotation is a real rotation (smallest orthogonality error),
//   5. among the symmetric solutions, keep the one closest to the previous frame.
// Coordinates: image px with y down; camera frame like OpenCV (x right, y down, z forward).

// ---------------------------------------------------------------- 1. blobs

/** Is this pixel "pen red"? Rejects white, skin, orange and brown. */
function isRed(r, g, b) {
  const mn = g < b ? g : b, mx = r
  if (r < 90 || r <= g || r <= b) return false
  const chroma = mx - mn
  if (chroma < 38) return false
  if (chroma / mx < 0.17) return false
  if (g - b > 0.22 * chroma) return false      // hue drifting to orange / skin
  return true
}

/**
 * @returns [{x, y, area, w, h}] centroids in image px
 */
export function findRedBlobs(rgba, w, h) {
  const mask = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) if (isRed(rgba[p], rgba[p + 1], rgba[p + 2])) mask[i] = 1
  const blobs = []
  const stack = new Int32Array(w * h)
  const maxArea = w * h * 0.004
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue
    let sp = 0, area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, peak = 0
    stack[sp++] = start; mask[start] = 2
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0
      area++; sx += x; sy += y
      const pp = i * 4, red = rgba[pp] - Math.max(rgba[pp + 1], rgba[pp + 2])
      if (red > peak) peak = red
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (mask[j] === 1) { mask[j] = 2; stack[sp++] = j }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (area < 3 || area > maxArea) continue
    if (Math.max(bw, bh) / Math.min(bw, bh) > 2.8) continue      // lines, stripes
    if (area / (bw * bh) < 0.2) continue                           // very ragged shapes (pen dots can be hollow scribbles)
    if (peak < 55) continue                                         // skin and warm shadows never get this red (measured: skin <= 49, pen dots >= 66)
    blobs.push({x: sx / area + 0.5, y: sy / area + 0.5, area, w: bw, h: bh})
  }
  return blobs
}

// ---------------------------------------------------------------- 2. quad

function luma(rgba, w, h, x, y) {
  const xi = Math.max(0, Math.min(w - 1, x | 0)), yi = Math.max(0, Math.min(h - 1, y | 0)), p = (yi * w + xi) * 4
  const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return {l: 0.299 * r + 0.587 * g + 0.114 * b, s: mx ? (mx - mn) / mx : 0}
}

/** Sort 4 points counter-clockwise on screen (y down => by atan2 with flipped y). */
export function orderQuad(pts) {
  const cx = pts.reduce((a, p) => a + p.x, 0) / 4, cy = pts.reduce((a, p) => a + p.y, 0) / 4
  return pts.slice().sort((a, b) => Math.atan2(-(a.y - cy), a.x - cx) - Math.atan2(-(b.y - cy), b.x - cx))
}

function quadArea(q) {
  let s = 0
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y }
  return Math.abs(s) / 2
}

function convexAndSane(q) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (cross === 0) return false
    const s = Math.sign(cross)
    if (sign && s !== sign) return false
    sign = s
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y
    const cos = (v1x * v2x + v1y * v2y) / Math.hypot(v1x, v1y) / Math.hypot(v2x, v2y)
    if (cos > 0.95 || cos < -0.95) return false          // angle outside ~18°..162° (strong tilts are fine)
  }
  return true
}

/** Fraction of interior samples that look like the white block (bright, unsaturated). */
function whiteness(q, rgba, w, h, bright) {
  let ok = 0, n = 0
  for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
    const s = 0.12 + 0.76 * (i - 1) / 4, t = 0.12 + 0.76 * (j - 1) / 4
    // bilinear point inside quad q0 q1 q2 q3
    const ax = q[0].x + (q[1].x - q[0].x) * s, ay = q[0].y + (q[1].y - q[0].y) * s
    const bx = q[3].x + (q[2].x - q[3].x) * s, by = q[3].y + (q[2].y - q[3].y) * s
    const {l, s: sat} = luma(rgba, w, h, ax + (bx - ax) * t, ay + (by - ay) * t)
    n++
    if (l > bright * 0.42 && sat < 0.2) ok++                      // white paint, also when the face is tilted into shadow
  }
  return ok / n
}

/** Brightness reference: high percentile of luma over a coarse grid. */
export function brightRef(rgba, w, h) {
  const vals = []
  for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 12) vals.push(luma(rgba, w, h, x, y).l)
  vals.sort((a, b) => a - b)
  return vals[Math.floor(vals.length * 0.92)] || 255
}

/**
 * All plausible face quads, best first. Each: {q (ordered), white, area}.
 */
export function candidateQuads(blobs, rgba, w, h, maxBlobs = 16) {
  const bright = brightRef(rgba, w, h)
  const bs = blobs.slice().sort((a, b) => b.area - a.area).slice(0, maxBlobs)
  const out = []
  const minArea = w * h * 0.002
  for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++)
    for (let c = b + 1; c < bs.length; c++) for (let d = c + 1; d < bs.length; d++) {
      const q = orderQuad([bs[a], bs[b], bs[c], bs[d]])
      if (!convexAndSane(q)) continue
      const area = quadArea(q)
      if (area < minArea) continue
      const sizes = q.map(p => p.area), smax = Math.max(...sizes), smin = Math.min(...sizes)
      if (smax > smin * 14) continue                   // dots of one face look alike (allowing for perspective)
      const white = whiteness(q, rgba, w, h, bright)
      if (white < 0.65) continue
      out.push({q, white, area})
    }
  return out.sort((x, y) => y.area - x.area)
}

// ---------------------------------------------------------------- 3. homography + pose

function solve(A, b) {                       // Gaussian elimination, n x n
  const n = b.length
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    if (Math.abs(A[p][i]) < 1e-12) return null
    ;[A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i]
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]
      b[r] -= f * b[i]
    }
  }
  const x = new Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]
    x[i] = s / A[i][i]
  }
  return x
}

/** H maps plane (u, v) -> image (x, y). Exactly 4 correspondences. Row-major 3x3. */
export function homography(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = dst[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y)
  }
  const h = solve(A, b)
  return h ? [...h, 1] : null
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len3 = a => Math.hypot(a[0], a[1], a[2])
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm3 = a => scale3(a, 1 / len3(a))

/**
 * Pose of a plane from a homography in NORMALIZED camera coords.
 * @returns {R: [r1, r2, r3] columns, t, err} or null
 */
export function poseFromHomography(H) {
  const h1 = [H[0], H[3], H[6]], h2 = [H[1], H[4], H[7]], h3 = [H[2], H[5], H[8]]
  const n1 = len3(h1), n2 = len3(h2)
  let lam = 2 / (n1 + n2)
  if (h3[2] * lam < 0) lam = -lam                  // plane in front of the camera
  const r1 = scale3(h1, lam), r2 = scale3(h2, lam), t = scale3(h3, lam)
  const err = Math.abs(1 - n1 / n2) + Math.abs(dot3(h1, h2)) / (n1 * n2)
  const a = norm3(add3(r1, r2)), b = norm3(sub3(r1, r2))
  const o1 = norm3(add3(a, b)), o2 = norm3(sub3(a, b))
  const o3 = cross3(o1, o2)
  return {R: [o1, o2, o3], t, err}
}

// ---------------------------------------------------------------- 4. block models

/**
 * Face models from block measurements (any unit, e.g. cm).
 *   width W (x), depth D (z), thickness T (y)
 *   topInset: dot distance from the edges on the big faces
 *   sideInsetX / sideInsetY: dot distance from the short / long edges on the thin side faces
 */
export function makeModels(cfg) {
  const {W, D, T, topInset, sideInsetX, sideInsetY} = cfg
  const rect = (a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]]          // CCW in (u, v)
  return [
    // big face: u -> block X, v -> block -Z, normal -> block Y, block center is T/2 behind
    {name: 'top', label: 'Top face', pts: rect(W / 2 - topInset, D / 2 - topInset), depth: T, sym: 4,
      axes: (u, v, n) => ({X: u, Y: n, Z: scale3(v, -1)})},
    // side face (long edge W): u -> X, v -> Y, normal -> Z, center is D/2 behind
    {name: 'side', label: 'Side face', pts: rect(W / 2 - sideInsetX, T / 2 - sideInsetY), depth: D, sym: 2,
      axes: (u, v, n) => ({X: u, Y: v, Z: n})},
  ]
}

/** Camera intrinsics for an image w x h with a horizontal-or-vertical (longest side) FOV. */
export function intrinsics(w, h, fovLongDeg) {
  const f = (Math.max(w, h) / 2) / Math.tan((fovLongDeg * Math.PI / 180) / 2)
  return {fx: f, fy: f, cx: w / 2, cy: h / 2}
}

function quatFromAxes(X, Y, Z) {             // rotation matrix columns -> quaternion [x, y, z, w]
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2]
  const tr = m00 + m11 + m22
  let x, y, z, w
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s }
  return [x, y, z, w]
}

/**
 * Block pose for one ordered quad.
 * @returns best {model, center [x,y,z], quat [x,y,z,w] (OpenCV camera frame), err, normalDot} or null
 */
export function solveQuad(q, K, models, prevQuat) {
  const img = q.map(p => [(p.x - K.cx) / K.fx, (p.y - K.cy) / K.fy])
  let best = null
  for (const m of models) {
    const sols = []
    for (const dir of [1, -1]) for (let k = 0; k < 4; k++) {
      const dst = [0, 1, 2, 3].map(i => img[(k + dir * i + 8) % 4])
      const H = homography(m.pts, dst)
      if (!H) continue
      const P = poseFromHomography(H)
      if (!P) continue
      const [u, v, n] = P.R
      if (dot3(n, P.t) >= 0) continue                     // seeing the back of the face: wrong winding
      const ax = m.axes(u, v, n)
      const center = sub3(P.t, scale3(n, m.depth / 2))
      sols.push({model: m, center, quat: quatFromAxes(ax.X, ax.Y, ax.Z), err: P.err, facing: -dot3(n, norm3(P.t))})
    }
    if (!sols.length) continue
    const minErr = Math.min(...sols.map(s => s.err))
    // symmetric equivalents have (almost) the same error; pick the one closest to last frame
    const near = sols.filter(s => s.err < minErr + 0.02)
    let pick = near[0]
    if (prevQuat) {
      let bestDot = -1
      for (const s of near) {
        const d = Math.abs(s.quat[0] * prevQuat[0] + s.quat[1] * prevQuat[1] + s.quat[2] * prevQuat[2] + s.quat[3] * prevQuat[3])
        if (d > bestDot) { bestDot = d; pick = s }
      }
    }
    if (!best || pick.err < best.err) best = {...pick, alts: near}
  }
  return best
}

// ---------------------------------------------------------------- 5. origin mark

const qrot = ([qx, qy, qz, qw], [x, y, z]) => {
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]
}

/** Project a point given in block coordinates (cm) into the image. */
export function projectBlockPoint(sol, K, p) {
  const v = qrot(sol.quat, p)
  const c = [v[0] + sol.center[0], v[1] + sol.center[1], v[2] + sol.center[2]]
  return c[2] > 0 ? [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy] : null
}

/**
 * Where the black origin mark sits, in block coordinates: on the top face, next to the
 * red dot at (-X, -Z), moved `markOffset` cm toward the center along both edges.
 */
export function markPoint(cfg) {
  const a = cfg.W / 2 - cfg.topInset, b = cfg.D / 2 - cfg.topInset
  return [-a + cfg.markOffset, cfg.T / 2, -b + cfg.markOffset]
}

/** Darkness score around an image point: share of dark, unsaturated-ish pixels in a small disc. */
function darkScore(rgba, w, h, x, y, r, bright) {
  let dark = 0, n = 0
  const R = Math.max(1.5, r)
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue
    const xi = Math.round(x + dx), yi = Math.round(y + dy)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue
    const p = (yi * w + xi) * 4, R_ = rgba[p], G = rgba[p + 1], B = rgba[p + 2]
    const l = 0.299 * R_ + 0.587 * G + 0.114 * B
    n++
    if (l < bright * 0.45 && !(R_ > G * 1.4 && R_ > B * 1.3)) dark++       // dark, and not one of the red dots
  }
  return n ? dark / n : 0
}

/**
 * Pick the symmetric solution whose projected mark lands on a dark dot.
 * @returns {sol, score} (score 0 when no hypothesis shows the mark)
 */
export function resolveByMark(best, rgba, w, h, K, cfg) {
  if (!best || best.model.name !== 'top' || !best.alts) return {sol: best, score: 0}
  const bright = brightRef(rgba, w, h)
  const mp = markPoint(cfg)
  let pick = null, top = 0
  for (const s of best.alts) {
    const c = projectBlockPoint(s, K, mp)
    if (!c) continue
    // radius: projected size of ~0.2 cm at the mark (the drawn dot is ~5 mm wide)
    const e = projectBlockPoint(s, K, [mp[0] + 0.2, mp[1], mp[2]])
    const r = e ? Math.hypot(e[0] - c[0], e[1] - c[1]) : 2
    const sc = darkScore(rgba, w, h, c[0], c[1], r, bright)
    if (sc > top) { top = sc; pick = s }
  }
  return top >= 0.3 ? {sol: {...best, ...pick, alts: best.alts}, score: top} : {sol: best, score: 0}
}

/** All 24 dots of the block in block coordinates, with their face normal. */
export function allDots(cfg) {
  const {W, D, T, topInset, sideInsetX, sideInsetY} = cfg
  const a = W / 2 - topInset, b = D / 2 - topInset, sx = W / 2 - sideInsetX, sz = D / 2 - sideInsetX, sy = T / 2 - sideInsetY
  const out = []
  for (const y of [1, -1]) for (const i of [-1, 1]) for (const j of [-1, 1]) out.push({p: [i * a, y * T / 2, j * b], n: [0, y, 0]})
  for (const z of [1, -1]) for (const i of [-1, 1]) for (const j of [-1, 1]) out.push({p: [i * sx, j * sy, z * D / 2], n: [0, 0, z]})
  for (const x of [1, -1]) for (const i of [-1, 1]) for (const j of [-1, 1]) out.push({p: [x * W / 2, j * sy, i * sz], n: [x, 0, 0]})
  return out
}

/**
 * How well a pose explains the OTHER red blobs: dots of the faces that point at the camera
 * should show up where the pose predicts them. Returns {pred, hit}.
 */
export function support(sol, blobs, quad, K, cfg) {
  let pred = 0, hit = 0
  const used = new Set(quad)
  for (const d of allDots(cfg)) {
    const n = qrot(sol.quat, d.n), v = qrot(sol.quat, d.p)
    const c = [v[0] + sol.center[0], v[1] + sol.center[1], v[2] + sol.center[2]]
    const L = Math.hypot(...c)
    if (-(n[0] * c[0] + n[1] * c[1] + n[2] * c[2]) / L < 0.45) continue     // only faces clearly turned toward the camera
    const px = [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy]
    if (quad.some(q => Math.hypot(q.x - px[0], q.y - px[1]) < 3)) continue  // one of the 4 dots we fitted
    const e = projectBlockPoint(sol, K, [d.p[0] + 0.6, d.p[1], d.p[2]])
    const r = Math.max(6, e ? Math.hypot(e[0] - px[0], e[1] - px[1]) : 6)
    pred++
    if (blobs.some(bl => !used.has(bl) && Math.hypot(bl.x - px[0], bl.y - px[1]) < r)) hit++
  }
  return {pred, hit}
}

/**
 * Full frame: blobs -> quads -> pose.
 * @returns {found, blobs, quad, model, center, quat, err}
 */
export function trackFrame(rgba, w, h, K, models, prevQuat, maxErr = 0.15, cfg = null) {
  const blobs = findRedBlobs(rgba, w, h)
  if (blobs.length < 4) return {found: false, blobs}
  const quads = candidateQuads(blobs, rgba, w, h)
  let best = null
  for (const c of quads.slice(0, 400)) {
    const s = solveQuad(c.q, K, models, prevQuat)
    if (!s || s.err > maxErr) continue
    // prefer large, white, well-fitting quads whose pose also explains the other visible dots
    // big faces give the most accurate pose, so area weighs in; support is a ratio, not a count
    let score = Math.log(c.area) * 0.45 + c.white - s.err * 3
    if (cfg) {
      const sp = support(s, blobs, c.q, K, cfg)
      if (sp.pred >= 4 && sp.hit / sp.pred < 0.34) continue         // the pose predicts dots that are not there
      if (sp.pred) score += 0.6 * sp.hit / sp.pred
    }
    if (!best || score > best.score) best = {...s, quad: c.q, score}
  }
  if (!best) return {found: false, blobs}
  if (cfg && cfg.markOffset) {
    const {sol, score} = resolveByMark(best, rgba, w, h, K, cfg)
    return {found: true, blobs, ...sol, quad: best.quad, markScore: score}
  }
  return {found: true, blobs, ...best, markScore: 0}
}
