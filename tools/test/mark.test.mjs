// node tools/test/mark.test.mjs : the black origin mark must fix the block's orientation
// Draws a synthetic mark on the real top photo, then rotates the photo 0/90/180/270°.
// In every rotation the solved block frame must put the mark at the same block corner.
import sharp from 'sharp'
import path from 'path'
import {fileURLToPath} from 'url'
import {trackFrame, makeModels, intrinsics, projectBlockPoint, markPoint} from '../../src/block/dots-core.js'
import {DEFAULT_BLOCK as cfg} from './legacy-cfg.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const models = makeModels(cfg)
const load = async (input, rot = 0) => {
  const {data, info} = await sharp(input).rotate(rot).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  return {data, w: info.width, h: info.height}
}
const base = await sharp(path.join(here, 'photos', 'top.jpg')).rotate().resize({width: 640, height: 640, fit: 'inside'}).png().toBuffer()
let img = await load(base)
let K = intrinsics(img.w, img.h, cfg.fov)
const r0 = trackFrame(img.data, img.w, img.h, K, models, null, 0.15, cfg)
console.log('unmarked photo: markScore', r0.markScore.toFixed(2), r0.markScore === 0 ? 'PASS' : 'FAIL')

// draw the mark where hypothesis #1 (an arbitrary corner) expects it
const sol = r0.alts[1]
const [mx, my] = projectBlockPoint(sol, K, markPoint(cfg))
const e = projectBlockPoint(sol, K, [markPoint(cfg)[0] + 0.25, markPoint(cfg)[1], markPoint(cfg)[2]])
const rad = Math.hypot(e[0] - mx, e[1] - my)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.w}" height="${img.h}"><circle cx="${mx}" cy="${my}" r="${rad}" fill="#141414"/></svg>`
const marked = await sharp(base).composite([{input: Buffer.from(svg)}]).png().toBuffer()
await sharp(marked).toFile(path.join(process.argv[2] || here, 'mark-test.png'))

let pass = true
for (const rot of [0, 90, 180, 270]) {
  img = await load(marked, rot)
  K = intrinsics(img.w, img.h, cfg.fov)
  const r = trackFrame(img.data, img.w, img.h, K, models, null, 0.15, cfg)
  // where the drawn mark is after rotating the image
  const W0 = 480, H0 = 640
  const [ex, ey] = rot === 0 ? [mx, my] : rot === 90 ? [H0 - my, mx] : rot === 180 ? [W0 - mx, H0 - my] : [my, W0 - mx]
  const got = projectBlockPoint(r, K, markPoint(cfg))
  const d = Math.hypot(got[0] - ex, got[1] - ey)
  const ok = r.found && r.markScore > 0.3 && d < 4
  pass = pass && ok
  console.log(`rotate ${String(rot).padStart(3)}°: markScore ${r.markScore.toFixed(2)}, mark reprojects ${d.toFixed(1)} px from the drawn dot  ${ok ? 'PASS' : 'FAIL'}`)
}
console.log(pass ? 'ALL PASS' : 'SOME FAILED')
