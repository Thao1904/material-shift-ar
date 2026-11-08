// 3D model of the SONGMICS small storage ottoman (ULSF012 series) and its fabrics.
// Stool coordinates: cm, origin at the center of the seat top, Y up, X along the 40 cm side.
import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'

export const FABRIC_COLORS = [
  {key: 'charcoal', label: 'Charcoal', hex: 0x262628},
  {key: 'stone', label: 'Stone', hex: 0x9b9a95},
  {key: 'oatmeal', label: 'Oatmeal', hex: 0xd9ccb3},
  {key: 'navy', label: 'Navy', hex: 0x23314f},
  {key: 'emerald', label: 'Emerald', hex: 0x1e5a49},
  {key: 'terracotta', label: 'Terracotta', hex: 0xb4573a},
  {key: 'mustard', label: 'Mustard', hex: 0xc8992d},
  {key: 'blush', label: 'Blush', hex: 0xd8a29f},
]
export const FABRIC_TYPES = [{key: 'linen', label: 'Linen'}, {key: 'velvet', label: 'Velvet'}, {key: 'leather', label: 'Leather'}]

// ---------- procedural fabric textures ----------
function canvasTex(draw, color = false) {
  const c = document.createElement('canvas'); c.width = c.height = 256
  draw(c.getContext('2d'), 256)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}
let seed = 9
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
// woven linen: alternating over/under threads with slubs
const weave = canvasTex((g, S) => {
  const img = g.createImageData(S, S), d = img.data
  const slubX = Array.from({length: S}, () => (rnd() - 0.5) * 30), slubY = Array.from({length: S}, () => (rnd() - 0.5) * 30)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x % 8) / 8, cy = (y % 8) / 8, over = ((x >> 3) + (y >> 3)) & 1
    const thread = over ? Math.sin(cx * Math.PI) : Math.sin(cy * Math.PI)
    const v = 150 + thread * 80 + (over ? slubY[y] : slubX[x]) + (rnd() - 0.5) * 18
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v)); d[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
})
// leather grain: soft cellular noise
const grain = canvasTex((g, S) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 3.5, v = 110 + rnd() * 90
    g.fillStyle = `rgba(${v},${v},${v},.55)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
})
// the same weave as a color texture (0.72..1.0), so the threads show in the fabric's color
const weaveColor = canvasTex((g, S) => {
  g.drawImage(weave.image, 0, 0)
  const img = g.getImageData(0, 0, S, S), d = img.data
  for (let i = 0; i < d.length; i += 4) { const v = 184 + (d[i] / 255) * 71; d[i] = d[i + 1] = d[i + 2] = v }
  g.putImageData(img, 0, 0)
}, true)
weave.repeat.set(9, 9); weaveColor.repeat.set(9, 9); grain.repeat.set(5, 5)

export function makeFabric(colorHex, type) {
  const color = new THREE.Color(colorHex)
  // sheen is the soft light fabric fibers catch at grazing angles; keep it subtle on dark colors
  const lum = color.r * 0.3 + color.g * 0.59 + color.b * 0.11
  const sheenColor = color.clone().lerp(new THREE.Color(0xffffff), 0.25 + 0.3 * lum)
  if (type === 'velvet') return new THREE.MeshPhysicalMaterial({color, map: weaveColor, roughness: 0.88, sheen: 1, sheenRoughness: 0.35, sheenColor, bumpMap: weave, bumpScale: 0.12, envMapIntensity: 0.45})
  if (type === 'leather') return new THREE.MeshPhysicalMaterial({color, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.5, bumpMap: grain, bumpScale: 0.35, envMapIntensity: 0.8})
  return new THREE.MeshPhysicalMaterial({color, map: weaveColor, roughness: 0.97, sheen: 0.3, sheenRoughness: 0.9, sheenColor, bumpMap: weave, bumpScale: 0.7, envMapIntensity: 0.35})
}

export function swatchCanvas(colorHex) {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), col = new THREE.Color(colorHex)
  const gr = g.createRadialGradient(24, 22, 4, 32, 32, 44)
  gr.addColorStop(0, `#${col.clone().lerp(new THREE.Color(0xffffff), 0.3).getHexString()}`); gr.addColorStop(1, `#${col.getHexString()}`)
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return c
}

// ---------- geometry ----------
/** Tufted seat top: 3 x 3 puffed squares, seams and button dimples, flat near the rim. */
function tuftedTop(W, D, puff) {
  const g = new THREE.PlaneGeometry(W, D, 96, 78)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const u = (x / W + 0.5) * 3, v = (z / D + 0.5) * 3
    const fu = u - Math.floor(u), fv = v - Math.floor(v)
    const cell = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, fu))), 0.55) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, fv))), 0.55)
    const edge = Math.min(x + W / 2, W / 2 - x, z + D / 2, D / 2 - z)
    const rim = THREE.MathUtils.smoothstep(edge, 0, 3.2)
    p.setY(i, cell * puff * rim)
  }
  g.computeVertexNormals()
  return g
}

/**
 * The whole stool as a Group. Fabric meshes are tagged userData.fabric = true.
 */
export function makeStool(cfg, fabric, legMat) {
  const g = new THREE.Group()
  const bodyW = cfg.W - 2 * cfg.overhang, bodyD = cfg.D - 2 * cfg.overhang
  const bodyH = cfg.H - cfg.lidT - cfg.legH
  const top = new THREE.Mesh(tuftedTop(cfg.W - 0.6, cfg.D - 0.6, 1.4), fabric)
  top.position.y = -0.35
  const lid = new THREE.Mesh(new RoundedBoxGeometry(cfg.W, cfg.lidT, cfg.D, 4, 1.4), fabric)
  lid.position.y = -cfg.lidT / 2 - 0.05
  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyW, bodyH, bodyD, 3, 0.6), fabric)
  body.position.y = -cfg.lidT - bodyH / 2
  for (const m of [top, lid, body]) { m.userData.fabric = true; m.castShadow = true; m.receiveShadow = true; g.add(m) }
  const legGeo = new THREE.BoxGeometry(3, cfg.legH, 3)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat)
    leg.position.set(sx * (bodyW / 2 - 2), -cfg.H + cfg.legH / 2, sz * (bodyD / 2 - 2))
    leg.castShadow = true
    leg.userData.leg = true
    g.add(leg)
  }
  return g
}
