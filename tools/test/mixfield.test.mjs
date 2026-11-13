// The shared mix field: symmetric under the block's 8 look-alike poses, and uniform over the surface.
import {symField, buildMixField, layersFromWeights} from '../../src/mix-noise.js'
let fail = 0
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++ }
const f = 2.8 / 8
const pts = [[3.1, 1, -2.2], [-0.4, -1, 3.9], [4, 0.3, 1.7]]
let maxd = 0
for (const [x, y, z] of pts) {
  const v = symField(x, y, z, f)
  for (const [a, b, c] of [[z, y, -x], [-x, y, -z], [-z, y, x], [x, -y, -z], [-x, -y, z]]) maxd = Math.max(maxd, Math.abs(symField(a, b, c, f) - v))
}
ok(maxd < 1e-9, `symmetric under quarter turns + flip (max diff ${maxd.toExponential(1)})`)
const t0 = performance.now()
const F = (globalThis.document = undefined, buildMixField({w: 8, h: 2, d: 8}))
const ms = performance.now() - t0
ok(ms < 1500, `field built in ${ms.toFixed(0)} ms, ${F.size.join('x')}`)
// share of the top face below 0.3 should be ~0.3
let n = 0, below = 0
for (let i = 0; i <= 80; i++) for (let k = 0; k <= 80; k++) { n++; if (F.sample(-4 + i * 0.1, 1.012, -4 + k * 0.1) < 0.3) below++ }
ok(Math.abs(below / n - 0.3) < 0.08, `30 % band covers ${(100 * below / n).toFixed(1)} % of the top face`)
const L = layersFromWeights(new Map([[2, 1], [0, 3]]))
ok(L.base === 2 && L.bands.length === 1 && L.bands[0].m === 0 && Math.abs(L.bands[0].hi - 0.75) < 1e-9, 'weights -> layers')
process.exit(fail ? 1 : 0)
