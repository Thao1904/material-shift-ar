// node tools/test/handheld.test.mjs : real handheld photos of the 8 x 8 x 2 cm block
// p1, p2: a big face fully visible -> must be found as "top"
// p3, p5: fingers cover dots of every face -> must report nothing rather than a wrong pose
// p4: a thumb covers one corner; a single-frame false pose is still possible here (the live
//     app rejects poses that jump unless they persist for 3 frames), so it is only reported
import sharp from 'sharp'
import {trackFrame, makeModels, intrinsics} from '../../src/block/dots-core.js'
import {DEFAULT_BLOCK as cfg} from '../../src/block/config.js'
const expect = {p1: 'top', p2: 'top', p3: null, p4: undefined, p5: null}
let ok = true
for (const [name, want] of Object.entries(expect)) {
  const {data, info} = await sharp(`tools/test/photos/v2/${name}.jpg`).rotate().resize({width: 720, height: 720, fit: 'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  const r = trackFrame(data, info.width, info.height, intrinsics(info.width, info.height, cfg.fov), makeModels(cfg), null, 0.15, cfg)
  const got = r.found ? r.model.name : null
  const pass = want === undefined || got === want
  ok = ok && pass
  console.log(`${name}: ${got || 'not found'}${r.found ? ` (err ${r.err.toFixed(3)}, ${Math.hypot(...r.center).toFixed(1)} cm)` : ''}  ${want === undefined ? 'INFO' : pass ? 'PASS' : 'FAIL'}`)
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED')
