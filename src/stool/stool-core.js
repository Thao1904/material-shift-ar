// Stool tracker: 8 lime stickers on the seat (4 corners + 4 edge middles) -> stool pose.
//   1. find sticker blobs (same detector as the pens),
//   2. try every convex 4-blob quad as the 4 CORNER stickers; fit the seat rectangle with a
//      homography (wrong combos such as the 4 middles form a rhombus and fail the fit),
//   3. keep the quad whose pose also explains the other stickers (the edge middles),
//   4. refine the pose with every matched sticker.
import {findStickerBlobs} from '../pen/pen-core.js'
import {orderQuad, solveQuad, projectBlockPoint, refinePose} from '../block/dots-core.js'
import {seatStickers} from './config.js'

function convex(q) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (!cr) return false
    if (sign && Math.sign(cr) !== sign) return false
    sign = Math.sign(cr)
  }
  return true
}
const area = q => Math.abs(q.reduce((s, p, i) => { const r = q[(i + 1) % 4]; return s + p.x * r.y - r.x * p.y }, 0)) / 2

function matches(sol, blobs, K, dots) {
  let hit = 0, pred = 0
  for (const d of dots) {
    const c = projectBlockPoint(sol, K, d.p)
    if (!c) continue
    const e = projectBlockPoint(sol, K, [d.p[0] + 2, d.p[1], d.p[2]])
    const r = Math.max(6, e ? Math.hypot(e[0] - c[0], e[1] - c[1]) : 6)
    pred++
    if (blobs.some(b => Math.hypot(b.x - c[0], b.y - c[1]) < r)) hit++
  }
  return {hit, pred}
}

export function trackStool(rgba, w, h, K, cfg, prevQuat) {
  const blobs = findStickerBlobs(rgba, w, h, cfg)
  if (blobs.length < 4) return {found: false, blobs}
  const a = cfg.W / 2 - cfg.inset, b = cfg.D / 2 - cfg.inset
  // seat model: (u, v) on the seat plane -> stool X = u, Z = -v, Y = normal (up); depth 0 = seat center
  const model = [{name: 'seat', label: 'Seat', pts: [[-a, -b], [a, -b], [a, b], [-a, b]], depth: 0, sym: 2,
    axes: (u, v, n) => ({X: u, Y: n, Z: [-v[0], -v[1], -v[2]]})}]
  const dots = seatStickers(cfg)
  const bs = blobs.slice().sort((p, q) => q.n - p.n).slice(0, 14)
  let best = null
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++)
    for (let k = j + 1; k < bs.length; k++) for (let l = k + 1; l < bs.length; l++) {
      const q = orderQuad([bs[i], bs[j], bs[k], bs[l]])
      if (!convex(q)) continue
      const A = area(q)
      if (A < w * h * 0.01) continue
      const s = solveQuad(q, K, model, prevQuat)
      if (!s || s.err > 0.12) continue
      const m = matches(s, blobs, K, dots)
      if (m.hit < 6) continue                              // corners + at least 2 edge middles
      const score = m.hit * 1.2 + Math.log(A) * 0.3 - s.err * 6
      if (!best || score > best.score) best = {...s, quad: q, hits: m.hit, score}
    }
  if (!best) return {found: false, blobs}
  const refined = refinePose(best, blobs, K, cfg, dots, 2)
  return {found: true, blobs, ...best, ...refined}
}
