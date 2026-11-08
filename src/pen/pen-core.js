// Pen tracker: two neon stickers on any pen -> the pen's 3D axis.
//
// A pen is (almost) a cylinder, so its roll does not matter: two points on its axis are enough.
//   1. find neon blobs (default lime green; hue range is configurable),
//   2. pick the pair that looks like two stickers on one pen (similar width, far enough apart),
//   3. depth: the sticker's width ACROSS the pen axis shows the pen's diameter (it does not
//      foreshorten when the pen tilts), so the ratio of the two widths gives which end is closer,
//      and the known distance between the stickers fixes the absolute scale.
// Image px with y down; camera frame like OpenCV (x right, y down, z forward).

function hueSatVal(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn
  let h = 0
  if (c) {
    if (mx === r) h = 60 * (((g - b) / c) % 6)
    else if (mx === g) h = 60 * ((b - r) / c + 2)
    else h = 60 * ((r - g) / c + 4)
  }
  if (h < 0) h += 360
  return [h, mx ? c / mx : 0, mx]
}

/** Neon sticker blobs with second moments (for orientation-free widths). */
export function findStickerBlobs(rgba, w, h, cfg) {
  const {hueMin = 60, hueMax = 125, satMin = 0.3, valMin = 90} = cfg
  const mask = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const [hh, s, v] = hueSatVal(rgba[p], rgba[p + 1], rgba[p + 2])
    if (hh >= hueMin && hh <= hueMax && s >= satMin && v >= valMin) mask[i] = 1
  }
  const blobs = [], stack = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue
    let sp = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
    stack[sp++] = start; mask[start] = 2
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (mask[j] === 1) { mask[j] = 2; stack[sp++] = j }
      }
    }
    if (n < 12 || n > w * h * 0.05) continue
    const mx = sx / n, my = sy / n
    blobs.push({x: mx + 0.5, y: my + 0.5, n, cxx: sxx / n - mx * mx, cyy: syy / n - my * my, cxy: sxy / n - mx * my})
  }
  return blobs
}

/** Full extent of a blob along unit direction (ux, uy), assuming a filled rectangle. */
function extent(b, ux, uy) {
  const v = ux * ux * b.cxx + 2 * ux * uy * b.cxy + uy * uy * b.cyy
  return Math.sqrt(12 * Math.max(v, 0))
}

/**
 * Pick the two stickers.
 * @returns {a, b, wa, wb, la, lb} (widths across / lengths along the pen axis, px) or null
 */
export function pickPair(blobs, prev) {
  const bs = blobs.slice().sort((p, q) => q.n - p.n).slice(0, 8)
  let best = null
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A = bs[i], B = bs[j]
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy)
    const ux = dx / d, uy = dy / d
    const wa = extent(A, -uy, ux), wb = extent(B, -uy, ux)       // across the axis
    const la = extent(A, ux, uy), lb = extent(B, ux, uy)          // along the axis
    if (d < 4 * Math.max(wa, wb)) continue                         // stickers sit far apart on a pen
    if (Math.max(wa, wb) > 2.6 * Math.min(wa, wb)) continue        // same pen, similar width
    if (A.n > 4 * B.n || B.n > 4 * A.n) continue
    let score = Math.log(A.n + B.n) + d / 400 - Math.abs(Math.log(wa / wb))
    if (prev) score -= (Math.min(Math.hypot(A.x - prev.a.x, A.y - prev.a.y) + Math.hypot(B.x - prev.b.x, B.y - prev.b.y),
      Math.hypot(A.x - prev.b.x, A.y - prev.b.y) + Math.hypot(B.x - prev.a.x, B.y - prev.a.y))) / 200
    if (!best || score > best.score) best = {a: A, b: B, wa, wb, la, lb, score}
  }
  if (!best) return null
  // keep the same sticker as "a" as in the previous frame (the two stickers look alike)
  if (prev && Math.hypot(best.a.x - prev.a.x, best.a.y - prev.a.y) > Math.hypot(best.b.x - prev.a.x, best.b.y - prev.a.y)) {
    best = {...best, a: best.b, b: best.a, wa: best.wb, wb: best.wa, la: best.lb, lb: best.la}
  }
  return best
}

/**
 * 3D endpoints of the sticker centers (camera frame, cm).
 *   cfg.spacing  distance between the two sticker centers (cm)
 *   cfg.diameter pen diameter under the stickers (cm), used when the pen points at the camera
 */
export function penPose(pair, K, cfg) {
  const ray = p => [(p.x - K.cx) / K.fx, (p.y - K.cy) / K.fy, 1]
  const da = ray(pair.a), db = ray(pair.b)
  // depth from width alone (absolute, noisier)
  const za = K.fx * cfg.diameter / pair.wa, zb = K.fx * cfg.diameter / pair.wb
  // depth ratio from the two widths, absolute scale from the known spacing
  const ratio = pair.wa / pair.wb                                  // zb / za
  const diff = [da[0] - ratio * db[0], da[1] - ratio * db[1], da[2] - ratio * db[2]]
  const dn = Math.hypot(...diff)
  let z1 = za, z2 = zb
  if (dn > 0.02) { z1 = cfg.spacing / dn; z2 = z1 * ratio }
  const A = da.map(v => v * z1), B = db.map(v => v * z2)
  const axis = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...axis)
  return {A, B, center: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], dir: axis.map(v => v / L),
    measured: L, widthDepth: (za + zb) / 2}
}

export function trackPen(rgba, w, h, K, cfg, prev) {
  const blobs = findStickerBlobs(rgba, w, h, cfg)
  const pair = blobs.length >= 2 ? pickPair(blobs, prev) : null
  if (!pair) return {found: false, blobs}
  return {found: true, blobs, pair, ...penPose(pair, K, cfg)}
}

// ---------------------------------------------------------------- several pens at once

/**
 * Pair sticker blobs into pens. Two stickers belong to the same pen when they have similar
 * widths and their distance on screen fits the pen's proportions: distance / width is at most
 * spacing / diameter (pen seen side-on) and shrinks when the pen tilts toward the camera.
 * Greedy: best pair first, each blob used once.
 */
/**
 * Is there a pen body between two stickers? Walk along the segment and look for the pen's two
 * side edges at +-width/2 (brightness steps across the silhouette). Background between two
 * stickers of DIFFERENT pens has no such parallel edges. Fingers may hide part of the body.
 */
function bodyScore(rgba, w, h, A, B, wa, wb) {
  const L = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) return -1; const p = (yi * w + xi) * 4; return 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2] }
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d
  let good = 0, n = 0
  for (let k = 0; k < 16; k++) {
    const t = 0.18 + 0.64 * k / 15
    const cx = A.x + dx * t, cy = A.y + dy * t, half = (wa + (wb - wa) * t) / 2
    let sides = 0
    for (const s of [-1, 1]) {
      const inn = L(cx + s * nx * half * 0.6, cy + s * ny * half * 0.6), out = L(cx + s * nx * (half * 1.5 + 2), cy + s * ny * (half * 1.5 + 2))
      if (inn >= 0 && out >= 0 && Math.abs(inn - out) > 14) sides++
    }
    n++
    if (sides === 2) good++
  }
  return good / n
}

export function pairPens(blobs, cfg, maxPens = 6, img = null) {
  const bs = blobs.slice().sort((p, q) => q.n - p.n).slice(0, 2 * maxPens + 4)
  const ratioMax = (cfg.spacing / cfg.diameter) * 1.45, ratioMin = (cfg.spacing / cfg.diameter) * 0.22
  const cands = []
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A = bs[i], B = bs[j]
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d
    const wa = extent(A, -uy, ux), wb = extent(B, -uy, ux), la = extent(A, ux, uy), lb = extent(B, ux, uy)
    const wm = (wa + wb) / 2
    if (Math.max(wa, wb) > 2.2 * Math.min(wa, wb)) continue
    if (A.n > 4 * B.n || B.n > 4 * A.n) continue
    const ratio = d / wm
    if (ratio > ratioMax || ratio < ratioMin) continue
    // a sticker wrapped on a pen is no wider across the axis than about 2.2x its length along it
    if (wa > 3 * la + 4 || wb > 3 * lb + 4) continue
    const fit = Math.abs(Math.log(ratio / (cfg.spacing / cfg.diameter)))
    const body = img ? bodyScore(img.rgba, img.w, img.h, A, B, wa, wb) : 0.5
    if (body < 0.3) continue                                       // no pen body between them
    cands.push({a: A, b: B, wa, wb, la, lb, body, score: Math.log(A.n + B.n) - Math.abs(Math.log(wa / wb)) * 2 - fit * 0.6 + body * 2.5})
  }
  cands.sort((p, q) => q.score - p.score)
  const used = new Set(), pens = []
  for (const c of cands) {
    if (used.has(c.a) || used.has(c.b)) continue
    used.add(c.a); used.add(c.b); pens.push(c)
    if (pens.length >= maxPens) break
  }
  return pens
}

/**
 * All pens in the frame.
 * @returns {blobs, pens: [{pair, A, B, center, dir, diameter}]}  (diameter measured per pen, cm)
 */
export function trackPens(rgba, w, h, K, cfg) {
  const blobs = findStickerBlobs(rgba, w, h, cfg)
  const pens = pairPens(blobs, cfg, 6, {rgba, w, h}).map((pair) => {
    const pose = penPose(pair, K, cfg)
    // this pen's own thickness: its width in px at the depth given by the sticker spacing
    const za = pose.A[2], zb = pose.B[2]
    const diameter = ((pair.wa * za + pair.wb * zb) / 2) / K.fx
    return {pair, ...pose, diameter}
  })
  return {blobs, pens}
}
