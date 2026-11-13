// node tools/test/dots.test.mjs : run the red-dot tracker on the real block photos
import sharp from 'sharp'
import path from 'path'
import {fileURLToPath} from 'url'
import {trackFrame, makeModels, intrinsics, findRedBlobs} from '../../src/block/dots-core.js'
import {DEFAULT_BLOCK} from './legacy-cfg.mjs'

// project the 12 edges of the block (W x T x D) with the solved pose
function boxLines(r, K) {
  const [qx, qy, qz, qw] = r.quat, {W, T, D} = DEFAULT_BLOCK
  const rot = ([x, y, z]) => {            // rotate vector by quaternion
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]
  }
  const P = (sx, sy, sz) => { const v = rot([sx * W / 2, sy * T / 2, sz * D / 2]); const c = [v[0] + r.center[0], v[1] + r.center[1], v[2] + r.center[2]]; return [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy] }
  const L = []
  for (const a of [-1, 1]) for (const b of [-1, 1]) { L.push([P(-1, a, b), P(1, a, b)], [P(a, -1, b), P(a, 1, b)], [P(a, b, -1), P(a, b, 1)]) }
  return L
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'photos')
const models = makeModels(DEFAULT_BLOCK)
const out = process.argv[2]
for (const [file, expect] of [['top.jpg', 'top'], ['side.jpg', 'side']]) {
  const img = sharp(path.join(dir, file)).rotate().resize({width: 640, height: 640, fit: 'inside'}).ensureAlpha()
  const {data, info} = await img.raw().toBuffer({resolveWithObject: true})
  const K = intrinsics(info.width, info.height, DEFAULT_BLOCK.fov)
  const t0 = performance.now()
  const r = trackFrame(data, info.width, info.height, K, models, null)
  const ms = (performance.now() - t0).toFixed(1)
  const blobs = findRedBlobs(data, info.width, info.height)
  console.log(`${file} ${info.width}x${info.height}: ${blobs.length} red blobs, ${ms} ms`)
  if (!r.found) { console.log('  NOT FOUND  FAIL'); continue }
  const dist = Math.hypot(...r.center).toFixed(1)
  console.log(`  face=${r.model.name} err=${r.err.toFixed(3)} distance=${dist} cm  ${r.model.name === expect ? 'PASS' : 'FAIL'}`)
  console.log('  quad', r.quad.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' '))
  if (out) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">
      ${blobs.map(b => `<circle cx="${b.x}" cy="${b.y}" r="7" fill="none" stroke="#00e5ff" stroke-width="2"/>`).join('')}
      <polygon points="${r.quad.map(p => `${p.x},${p.y}`).join(' ')}" fill="rgba(0,255,120,.18)" stroke="#00ff78" stroke-width="3"/>
      ${boxLines(r, K).map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ffd166" stroke-width="2.5"/>`).join('')}
      <text x="12" y="30" font-size="22" font-family="sans-serif" fill="#00ff78" stroke="#000" stroke-width="0.6">${r.model.name} · ${dist} cm</text></svg>`
    await sharp(path.join(dir, file)).rotate().resize({width: 640, height: 640, fit: 'inside'})
      .composite([{input: Buffer.from(svg)}]).png().toFile(path.join(out, `dots-${expect}.png`))
  }
}
