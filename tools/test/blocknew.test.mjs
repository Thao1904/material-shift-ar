// node tools/test/blocknew.test.mjs [outdir] : the CURRENT dot layout (photos/v3)
// q1: oblique, big face + two side faces -> top; q3: big face straight on -> top;
// q4: big face + side -> top; q2: only a thin side face (2 dots) -> nothing (cannot be solved)
import sharp from 'sharp'
import {trackFrame, makeModels, intrinsics} from '../../src/block/dots-core.js'
import {DEFAULT_BLOCK} from '../../src/block/config.js'
const cfg = {...DEFAULT_BLOCK, fov: 70}       // these are 4:3 photos; the live video uses its own calibrated FOV
const out = process.argv[2]
const rot = ([qx, qy, qz, qw], [x, y, z]) => { const ix = qw*x+qy*z-qz*y, iy = qw*y+qz*x-qx*z, iz = qw*z+qx*y-qy*x, iw = -qx*x-qy*y-qz*z
  return [ix*qw+iw*-qx+iy*-qz-iz*-qy, iy*qw+iw*-qy+iz*-qx-ix*-qz, iz*qw+iw*-qz+ix*-qy-iy*-qx] }
let ok = true
for (const [name, want] of [['q1', 'top'], ['q2', null], ['q3', 'top'], ['q4', 'top']]) {
  const src = `tools/test/photos/v3/${name}.jpg`
  const {data, info} = await sharp(src).rotate().resize({width: 720, height: 720, fit: 'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  const K = intrinsics(info.width, info.height, cfg.fov)
  const r = trackFrame(data, info.width, info.height, K, makeModels(cfg), null, 0.15, cfg)
  const got = r.found ? r.model.name : null, pass = got === want
  ok = ok && pass
  console.log(`${name}: ${r.blobs.length} red blobs -> ${got || 'not found'}${r.found ? ` (${r.matched} dots used, rms ${(r.rms || 0).toFixed(2)} px, ${Math.hypot(...r.center).toFixed(1)} cm)` : ''}  ${pass ? 'PASS' : 'FAIL'}`)
  if (out && r.found) {
    const P = (sx, sy, sz) => { const v = rot(r.quat, [sx * cfg.W / 2, sy * cfg.T / 2, sz * cfg.D / 2]); const c = [v[0] + r.center[0], v[1] + r.center[1], v[2] + r.center[2]]; return [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy] }
    const L = []; for (const a of [-1, 1]) for (const b of [-1, 1]) L.push([P(-1, a, b), P(1, a, b)], [P(a, -1, b), P(a, 1, b)], [P(a, b, -1), P(a, b, 1)])
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">
      ${r.blobs.map(b => `<circle cx="${b.x}" cy="${b.y}" r="8" fill="none" stroke="#00e5ff" stroke-width="2"/>`).join('')}
      ${L.map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ffd166" stroke-width="2.5"/>`).join('')}</svg>`
    await sharp(src).rotate().resize({width: 720, height: 720, fit: 'inside'}).composite([{input: Buffer.from(svg)}]).png().toFile(`${out}/new-${name}.png`)
  }
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED')
