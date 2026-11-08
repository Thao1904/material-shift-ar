// node tools/test/stool.test.mjs [outdir] : find the stool from the 8 seat stickers (photo s3)
import sharp from 'sharp'
import {trackStool} from '../../src/stool/stool-core.js'
import {intrinsics} from '../../src/block/dots-core.js'
import {DEFAULT_STOOL as cfg} from '../../src/stool/config.js'
const out = process.argv[2]
const rot = ([qx, qy, qz, qw], [x, y, z]) => { const ix = qw*x+qy*z-qz*y, iy = qw*y+qz*x-qx*z, iz = qw*z+qx*y-qy*x, iw = -qx*x-qy*y-qz*z
  return [ix*qw+iw*-qx+iy*-qz-iz*-qy, iy*qw+iw*-qy+iz*-qx-ix*-qz, iz*qw+iw*-qz+ix*-qy-iy*-qx] }
let ok = true
for (const [file, want] of [['s3.jpg', true], ['s1.jpg', false]]) {
  const src = `tools/test/photos/stool/${file}`
  const {data, info} = await sharp(src).rotate().resize({width: 720, height: 720, fit: 'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  const K = intrinsics(info.width, info.height, 60)   // photo FOV fitted from the seat rectangle
  const t0 = performance.now()
  const r = trackStool(data, info.width, info.height, K, cfg, null)
  const ms = (performance.now() - t0).toFixed(1)
  const pass = r.found === want
  ok = ok && pass
  console.log(`${file}: ${r.blobs.length} stickers -> ${r.found ? `stool found, ${r.hits}/8 seat stickers, err ${r.err.toFixed(3)}, rms ${r.rms?.toFixed(1)} px, ${Math.hypot(...r.center).toFixed(0)} cm away` : 'no stool'} (${ms} ms)  ${pass ? 'PASS' : 'FAIL'}`)
  if (out && r.found) {
    const P = (x, y, z) => { const v = rot(r.quat, [x, y, z]); const c = [v[0] + r.center[0], v[1] + r.center[1], v[2] + r.center[2]]; return [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy] }
    const L = []
    const box = (w2, d2, y0, y1) => { for (const y of [y0, y1]) { const c = [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]]; c.forEach((p, i) => L.push([P(p[0], y, p[1]), P(c[(i + 1) % 4][0], y, c[(i + 1) % 4][1])])) }
      for (const [x, z] of [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]]) L.push([P(x, y0, z), P(x, y1, z)]) }
    box(cfg.W / 2, cfg.D / 2, 0, -cfg.lidT)
    box(cfg.W / 2 - cfg.overhang, cfg.D / 2 - cfg.overhang, -cfg.lidT, -(cfg.H - cfg.legH))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">
      ${r.blobs.map(b => `<circle cx="${b.x}" cy="${b.y}" r="9" fill="none" stroke="#00e5ff" stroke-width="2"/>`).join('')}
      ${L.map(([p, q]) => `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#ff5a3c" stroke-width="2.5"/>`).join('')}</svg>`
    await sharp(src).rotate().resize({width: 720, height: 720, fit: 'inside'}).composite([{input: Buffer.from(svg)}]).png().toFile(`${out}/stool-${file}.png`)
  }
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED')
