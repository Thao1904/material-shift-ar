// Material Shift for pens: every pen with two neon stickers in view gets a virtual skin.
// Camera -> pen tracker (pen-core.js) -> one 3D pen per pair of stickers (pens.js).
import * as THREE from 'three'
import {intrinsics} from '../block/dots-core.js'
import {trackPens} from './pen-core.js'
import {createPenLayer} from './pens.js'
import {DEFAULT_PEN} from './config.js'

const $ = id => document.getElementById(id)
const STORE = 'material-shift-pen-v1'
let PROC_LONG = 720

// ---------- settings (saved on this phone); reuse the camera FOV measured on the block page ----------
function loadCfg() {
  let c = {...DEFAULT_PEN}
  try {
    const block = JSON.parse(localStorage.getItem('material-shift-block-v2') || '{}')
    if (block.fovCalibrated && block.fov) c.fov = block.fov
    c = {...c, ...JSON.parse(localStorage.getItem(STORE) || '{}')}
  } catch (e) { /* storage blocked */ }
  return c
}
function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)) } catch (e) { /* storage blocked */ } }
let cfg = loadCfg()

// ---------- three.js ----------
const video = $('video'), gl = $('gl'), dbg = $('dbg'), dctx = dbg.getContext('2d'), bg = $('bg'), bgctx = bg.getContext('2d')
const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true, alpha: true})
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const layer = createPenLayer({scene, camera, renderer, canvas: gl})
window.__pens = layer

function setStatus(text, ok) { const el = $('status'); el.querySelector('span').textContent = text; el.classList.toggle('ok', !!ok) }
let toastT
function toast(t) { const el = $('matname'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 900) }

// ---------- processing + projection ----------
const proc = document.createElement('canvas'), pctx = proc.getContext('2d', {willReadFrequently: true})
let pw = 0, ph = 0, K = null, view = {sc: 1, ox: 0, oy: 0}
function layout() {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw) return
  const s = PROC_LONG / Math.max(vw, vh)
  pw = Math.round(vw * s); ph = Math.round(vh * s)
  proc.width = pw; proc.height = ph
  K = intrinsics(pw, ph, cfg.fov)
  const sw = innerWidth, sh = innerHeight
  renderer.setSize(sw, sh, false)
  bg.width = Math.round(sw * devicePixelRatio); bg.height = Math.round(sh * devicePixelRatio)
  dbg.width = sw * devicePixelRatio; dbg.height = sh * devicePixelRatio
  const sc = Math.max(sw / pw, sh / ph), visW = sw / sc, visH = sh / sc, ox = (pw - visW) / 2, oy = (ph - visH) / 2
  view = {sc, ox, oy}
  const n = 0.5, f = 1000
  camera.projectionMatrix.makePerspective(-(K.cx - ox) / K.fx * n, (ox + visW - K.cx) / K.fx * n, (K.cy - oy) / K.fy * n, -(oy + visH - K.cy) / K.fy * n, n, f)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
addEventListener('resize', layout)
function drawBackground() {
  const vw = video.videoWidth, vh = video.videoHeight, W = bg.width, H = bg.height
  const s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s
  bgctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
}

// ---------- loop ----------
let last = null, frames = 0, fps = 0, fpsT = performance.now(), cost = 15, lastCount = -1
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  if (video.readyState >= 2 && K) {
    pctx.drawImage(video, 0, 0, pw, ph)
    drawBackground()
    const img = pctx.getImageData(0, 0, pw, ph)
    const t0 = performance.now()
    const r = trackPens(img.data, pw, ph, K, cfg)
    cost = cost * 0.9 + (performance.now() - t0) * 0.1
    if (cost > 30 && PROC_LONG > 560) { PROC_LONG = 560; layout() } else if (cost < 12 && PROC_LONG < 720) { PROC_LONG = 720; layout() }
    last = r
    layer.update(r.pens, cfg, now)
    let sum = 0, n = 0
    for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++ }
    layer.tick({exposure: Math.max(-1, Math.min(1, (sum / n / 255 - 0.5) * 2))})
    const c = layer.count
    if (c !== lastCount) {
      lastCount = c
      setStatus(c ? `Tracking ${c} pen${c > 1 ? 's' : ''}` : 'Show a pen with 2 neon stickers', c > 0)
    }
    frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now }
  } else layer.tick()
  renderer.render(scene, camera)
  drawDebug()
}

function drawDebug() {
  dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dbg.width, dbg.height)
  if ($('debugBtn').getAttribute('aria-pressed') !== 'true' || !last) return
  const d = devicePixelRatio, S = (x, y) => [((x - view.ox) * view.sc) * d, ((y - view.oy) * view.sc) * d]
  dctx.lineWidth = 2 * d; dctx.strokeStyle = '#00e5ff'
  for (const b of last.blobs) { const [x, y] = S(b.x, b.y); dctx.beginPath(); dctx.arc(x, y, 10 * d, 0, 7); dctx.stroke() }
  dctx.strokeStyle = '#00ff78'; dctx.lineWidth = 3 * d
  for (const p of last.pens) { const [x1, y1] = S(p.pair.a.x, p.pair.a.y), [x2, y2] = S(p.pair.b.x, p.pair.b.y); dctx.beginPath(); dctx.moveTo(x1, y1); dctx.lineTo(x2, y2); dctx.stroke() }
  dctx.fillStyle = '#fff'; dctx.font = `${13 * d}px ui-monospace, monospace`
  const info = last.pens.map(p => `${Math.hypot(...p.center).toFixed(0)}cm ⌀${p.diameter.toFixed(2)}`).join('  ')
  dctx.fillText(`stickers ${last.blobs.length} · pens ${last.pens.length} ${info} · ${fps} fps`, 12 * d, (innerHeight - 150) * d)
}

// ---------- start ----------
$('startBtn').onclick = async () => {
  $('startErr').textContent = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}})
    video.srcObject = stream
    await video.play()
    await new Promise(res => (video.videoWidth ? res() : video.addEventListener('loadedmetadata', res, {once: true})))
    layout()
    $('start').hidden = true; $('hud').hidden = false
    setStatus('Show a pen with 2 neon stickers')
  } catch (e) {
    $('startErr').textContent = e && e.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access for this site in Settings, then reload.'
      : `Could not open the camera (${(e && e.name) || e}). This page needs HTTPS and a phone camera.`
  }
}

// ---------- material chips ----------
function syncChips() { layer.lib.forEach((m, i) => $(`mat-${m.key}`)?.setAttribute('aria-pressed', i === layer.global)) }
layer.lib.forEach((m, i) => {
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'chip'; b.id = `mat-${m.key}`
  const sw = document.createElement('canvas'); sw.width = sw.height = 64
  sw.getContext('2d').drawImage(m.swatch, 0, 0, 512, 512, 0, 0, 64, 64)
  b.append(sw, document.createTextNode(m.label))
  b.onclick = () => { layer.setGlobal(i); syncChips(); toast(m.label) }
  $('chips').appendChild(b)
})
syncChips()

// ---------- gestures: swipe = all pens, tap a pen = that pen, hold = real pens ----------
const line = $('swipeLine'), slabel = $('swipeLabel')
let g = null, anim = false, holdT = null
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
gl.addEventListener('pointerdown', (e) => {
  if (anim) return
  g = {x0: e.clientX, y0: e.clientY, t0: performance.now(), active: false, hist: [[e.clientX, performance.now()]]}
  clearTimeout(holdT)
  holdT = setTimeout(() => { if (g && !g.active) { layer.comparing = true; $('compare').classList.add('on') } }, 300)
})
gl.addEventListener('pointermove', (e) => {
  if (!g) return
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0
  g.hist.push([e.clientX, performance.now()]); if (g.hist.length > 6) g.hist.shift()
  if (Math.hypot(dx, dy) > 10) clearTimeout(holdT)
  if (!g.active) {
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2 || !layer.count) return
    const dir = dx < 0 ? 1 : -1, n = layer.lib.length, next = (layer.global + dir + n) % n
    g.active = true; g.dir = dir; g.next = next
    layer.comparing = false; $('compare').classList.remove('on')
    layer.scrubStart(next, dir === 1 ? 'right' : 'left')
    slabel.textContent = layer.lib[next].label; slabel.classList.add('on'); line.hidden = false
    try { gl.setPointerCapture(e.pointerId) } catch (err) { /* not supported */ }
  }
  const w = innerWidth
  g.x = g.dir === 1 ? clamp(w + dx, 0, w) : clamp(dx, 0, w)
  layer.scrubSet(g.x); line.style.transform = `translateX(${g.x}px)`
})
function end(e) {
  clearTimeout(holdT)
  layer.comparing = false; $('compare').classList.remove('on')
  if (!g) return
  const s0 = g; g = null
  if (!s0.active) {
    if (e && performance.now() - s0.t0 < 280) { const label = layer.tapAt(e.clientX, e.clientY); if (label) toast(`This pen · ${label}`) }
    return
  }
  const w = innerWidth, [x1, t1] = s0.hist[0], [x2, t2] = s0.hist[s0.hist.length - 1]
  const v = (x2 - x1) / Math.max(1, t2 - t1), progress = s0.dir === 1 ? (w - s0.x) / w : s0.x / w
  const commit = progress > 0.33 || v * -s0.dir > 0.5
  const from = s0.x, to = commit ? (s0.dir === 1 ? 0 : w) : (s0.dir === 1 ? w : 0), t0 = performance.now()
  anim = true
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 220), x = from + (to - from) * (1 - Math.pow(1 - k, 3))
    layer.scrubSet(x); line.style.transform = `translateX(${x}px)`
    if (k < 1) return requestAnimationFrame(step)
    layer.scrubEnd(commit); line.hidden = true; slabel.classList.remove('on'); anim = false
    if (commit) { syncChips(); toast(layer.lib[layer.global].label); try { navigator.vibrate && navigator.vibrate(15) } catch (err) { /* no vibration */ } }
  }
  requestAnimationFrame(step)
}
gl.addEventListener('pointerup', end)
gl.addEventListener('pointercancel', () => end(null))

// ---------- debug + calibration ----------
$('debugBtn').onclick = () => { const b = $('debugBtn'); b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true') }
const FIELDS = [
  ['spacing', 'Sticker spacing (cm)', 'center to center'],
  ['length', 'Pen length (cm)', 'tip to end'],
  ['diameter', 'Pen diameter (cm)', 'typical; each pen is measured live'],
  ['fov', 'Camera FOV (°)', 'measured on the block page if you calibrated there'],
  ['hueMin', 'Sticker color: hue from (°)', 'lime green ~70, yellow ~50, pink ~320'],
  ['hueMax', 'Sticker color: hue to (°)', ''],
]
function buildCalib() {
  const box = $('calibFields'); box.innerHTML = ''
  for (const [k, label, hint] of FIELDS) {
    const row = document.createElement('label'); row.className = 'field'; row.htmlFor = `cal-${k}`
    row.innerHTML = `<span>${label}${hint ? `<small>${hint}</small>` : ''}</span>`
    const inp = document.createElement('input')
    inp.type = 'number'; inp.id = `cal-${k}`; inp.step = ['fov', 'hueMin', 'hueMax'].includes(k) ? '1' : '0.1'; inp.inputMode = 'decimal'; inp.value = cfg[k]
    inp.oninput = () => { const v = parseFloat(inp.value); if (!isFinite(v) || v < 0) return; cfg[k] = v; saveCfg(); layout() }
    row.appendChild(inp); box.appendChild(row)
  }
}
$('calibBtn').onclick = () => { $('calib').hidden = !$('calib').hidden }
$('calibClose').onclick = () => { $('calib').hidden = true }
$('calibReset').onclick = () => { cfg = {...DEFAULT_PEN}; saveCfg(); layout(); buildCalib() }
buildCalib()
requestAnimationFrame(loop)
