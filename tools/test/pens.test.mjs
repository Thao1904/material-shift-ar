// node tools/test/pens.test.mjs [outdir] : one real pen, then two and three pens in one frame
// (the extra pens are mirrored / shifted copies of the real photo, pasted side by side)
import sharp from 'sharp'
import {trackPens} from '../../src/pen/pen-core.js'
import {intrinsics} from '../../src/block/dots-core.js'
import {DEFAULT_PEN as cfg} from '../../src/pen/config.js'
const out = process.argv[2]
const base = await sharp('tools/test/photos/pen/pen1.jpg').rotate().resize({width: 540, height: 720, fit: 'inside'}).png().toBuffer()
const mirrored = await sharp(base).flop().toBuffer()
const small = await sharp(base).resize({width: 360}).toBuffer()
async function scene(parts, W) {
  return sharp({create: {width: W, height: 720, channels: 3, background: '#c9c2b8'}}).composite(parts).png().toBuffer()
}
const cases = [
  ['one pen', base, 1],
  ['two pens', await scene([{input: base, left: 0, top: 0}, {input: mirrored, left: 540, top: 0}], 1080), 2],
  ['three pens (one smaller = farther)', await scene([{input: base, left: 0, top: 0}, {input: mirrored, left: 540, top: 0}, {input: small, left: 1080, top: 180}], 1440), 3],
]
let ok = true
for (const [name, img, want] of cases) {
  const {data, info} = await sharp(img).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  const K = intrinsics(info.width, info.height, cfg.fov)
  const t0 = performance.now()
  const r = trackPens(data, info.width, info.height, K, cfg)
  const ms = (performance.now() - t0).toFixed(1)
  const pass = r.pens.length === want
  ok = ok && pass
  console.log(`${name}: ${r.blobs.length} stickers -> ${r.pens.length} pens (${ms} ms)  ${pass ? 'PASS' : 'FAIL'}`)
  r.pens.forEach((p, i) => console.log(`   pen ${i + 1}: ${Math.hypot(...p.center).toFixed(1)} cm away, measured diameter ${p.diameter.toFixed(2)} cm`))
  if (out) {
    const proj = c => [K.fx * c[0] / c[2] + K.cx, K.fy * c[1] / c[2] + K.cy]
    const ext = (cfg.length - cfg.spacing) / 2
    const lines = r.pens.map(p => {
      const e1 = proj(p.A.map((v, i) => v - ext * p.dir[i])), e2 = proj(p.B.map((v, i) => v + ext * p.dir[i]))
      const wpx = K.fx * p.diameter / ((p.A[2] + p.B[2]) / 2)
      return `<line x1="${e1[0]}" y1="${e1[1]}" x2="${e2[0]}" y2="${e2[1]}" stroke="rgba(255,90,60,.6)" stroke-width="${wpx}" stroke-linecap="round"/>`
    }).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${lines}</svg>`
    await sharp(img).composite([{input: Buffer.from(svg)}]).png().toFile(`${out}/pens-${want}.png`)
  }
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED')
