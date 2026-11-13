// The photos in photos/ and photos/v2/ show the OLDER dot layout (4 dots on each side face,
// big-face dots 0.5 cm from the edges). Tests on those photos use this layout.
import {DEFAULT_BLOCK as current} from '../../src/block/config.js'
export const DEFAULT_BLOCK = {...current, topInset: 0.5, sideDots: 4, sideInsetX: 0.4, sideInsetY: 0.5, fov: 66}
