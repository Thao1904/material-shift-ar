// Turn tools/markers/face-*.png into 8th Wall image target data in public/image-targets/.
// Uses the official @8thwall/image-target-cli (flat target, default centered 3:4 crop),
// exactly what `npx @8thwall/image-target-cli` does when you answer: flat, default crop.
//
// Run:  npm run targets
import path from 'path'
import {fileURLToPath} from 'url'
import sharp from 'sharp'
import {getDefaultCrop} from '@8thwall/image-target-cli/src/crop.js'
import {applyCrop} from '@8thwall/image-target-cli/src/apply.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FACES = ['front', 'right', 'back', 'left', 'top', 'bottom']
const out = path.join(root, 'public', 'image-targets')

for (const face of FACES) {
  const name = `face-${face}`
  const image = sharp(path.join(root, 'tools', 'markers', `${name}.png`))
  const meta = await image.metadata()
  const geometry = getDefaultCrop(meta, false)      // portrait 3:4, whole marker
  const {dataPath} = await applyCrop(image, {type: 'PLANAR', geometry}, out, name, true)
  console.log('wrote', path.relative(root, dataPath))
}
