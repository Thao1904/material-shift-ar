// Material Shift for the white wooden block: 4 red dots on each big face, 2 on each side face.
// Camera (getUserMedia) -> red-dot tracker (dots-core.js) -> three.js materials.
import * as THREE from 'three'
import {createMaterialShift} from '../material-shift.js'
import {trackFrame, makeModels, intrinsics, fovFromSquare} from './dots-core.js'
import {DEFAULT_BLOCK} from './config.js'
import {createRoom, randomCode, DEFAULT_BROKER} from './room.js'
import {createCommonLayer} from './common-layer.js'
import {layersFromWeights} from '../mix-noise.js'

const $ = id => document.getElementById(id)
const STORE = 'material-shift-block-v2'
let PROC_LONG = 720            // processing resolution (longer side, px); drops to 560 on slow phones

// ---------- block measurements (saved on this phone) ----------
function loadCfg() {
  try { return {...DEFAULT_BLOCK, ...JSON.parse(localStorage.getItem(STORE) || '{}')} } catch (e) { return {...DEFAULT_BLOCK} }
}
function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)) } catch (e) { /* storage blocked */ } }
let cfg = loadCfg()
let models = makeModels(cfg)

// ---------- three.js ----------
const video = $('video'), gl = $('gl'), dbg = $('dbg'), dctx = dbg.getContext('2d')
const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true, alpha: true})
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()        // stays at the origin; projection comes from the camera intrinsics
// My own material choice (the chips) is separate from what is displayed (mine / partner's / mix).
let myMat = 0, viewMode = 'mine', mixRatio = 0.5
// Rating: my votes {materialIndex: 1 like | -1 nope}; rate mode shows one candidate material at a time.
let rateMode = false, rateIdx = 0, anim = false
const ctrl = createMaterialShift({scene, camera, renderer, canvas: gl, box: {w: cfg.W, h: cfg.T, d: cfg.D}, sweepAxis: 'x', cover: 1.012,
  onChip: (i) => {
    myMat = i
    ctrl.setSelected(i)
    if (room.code) room.setMaterial(i)
    refreshDisplay(true)
    renderViews()
  }})
ctrl.setStatus('Tap Start camera')

// ---------- shared room ----------
const params = new URLSearchParams(location.search)
const room = createRoom({
  broker: params.get('broker') || DEFAULT_BROKER,
  onPeers: (map, poseOnly) => {
    layer.setPeers(map, ctrl.labels)
    if (!poseOnly) { refreshDisplay(false); renderRoomInfo(); renderViews(); if (rateMode && !anim) showCandidate() }
  },
  onStatus: (s, code, msg) => { roomStatus = s; renderRoomInfo(msg) },
})
let roomStatus = 'idle'
const layer = createCommonLayer({scene, camera, ctrl})
window.__room = room; window.__ms = ctrl

/** Everyone in the room, me included, ordered by id (the same order on every phone). */
function people() {
  const me = {...room.me, material: myMat}
  return [me, ...room.peers.values()].sort((x, y) => (x.id < y.id ? -1 : 1))
}
/** The first other phone (the mix slider is for rooms of two). */
function partner() {
  const ids = [...room.peers.keys()].sort()
  return ids.length ? room.peers.get(ids[0]) : null
}
function iAmFirst() { const p = partner(); return !p || room.me.id < p.id }

/**
 * The mixed common layer must look the same on every phone, so it never depends on who is
 * looking. Two people: the shared ratio (latest slider change wins) is the share of the
 * second person (by id). More people: everyone's material gets an equal share.
 */
function mixSetup() {
  const all = people()
  if (all.length < 2) return {base: myMat, bands: []}
  const w = new Map(), add = (m, v) => w.set(m, (w.get(m) || 0) + v)
  if (all.length === 2) {
    const latest = all.reduce((a, b) => ((b.mixAt || 0) > (a.mixAt || 0) ? b : a))
    const r = latest.mixAt ? latest.mix ?? 0.5 : 0.5
    add(all[0].material, 1 - r); add(all[1].material, r)
  } else for (const u of all) add(u.material, 1)
  return layersFromWeights(w, myMat)
}

/** Likes and nopes per material, over everyone in the room. */
function tally() {
  const n = ctrl.labels.length, t = Array.from({length: n}, () => ({like: 0, nope: 0}))
  for (const u of people()) for (const [k, v] of Object.entries(u.votes || {})) {
    const i = +k; if (!t[i]) continue
    if (v > 0) t[i].like++; else if (v < 0) t[i].nope++
  }
  return t
}
function anyVotes() { return tally().some(x => x.like || x.nope) }
/** Votes layer: a material's share of the block grows with its likes (a nope counts half against). */
function voteShares() {
  const t = tally(), score = t.map(x => Math.max(0, x.like - 0.5 * x.nope))
  const total = score.reduce((a, b) => a + b, 0)
  return score.map(v => (total ? v / total : 0))
}
function votesSetup() {
  const sh = voteShares(), w = new Map()
  sh.forEach((v, i) => { if (v > 0) w.set(i, v) })
  return layersFromWeights(w, myMat)
}

/** The views one can swipe through, in order. */
function availableViews() {
  const v = ['mine']
  if (room.peers.size) { v.push('mix'); for (const id of [...room.peers.keys()].sort()) v.push(`peer:${id}`) }
  if (anyVotes()) v.push('votes')
  return v
}
function peerOf(mode) { return mode.startsWith('peer:') ? room.peers.get(mode.slice(5)) : null }

/** What a view looks like: {base, bands}. */
function viewState(mode) {
  if (mode === 'mix') return mixSetup()
  if (mode === 'votes') return votesSetup()
  const p = peerOf(mode)
  if (p) return {base: p.material, bands: []}
  return {base: myMat, bands: []}
}
const pct = v => `${Math.round(v * 100)}%`
function describe(st) {
  const L = ctrl.labels
  if (!st.bands.length) return L[st.base]
  const parts = st.bands.map(b => [b.m, b.hi - b.lo])
  parts.push([st.base, 1 - st.bands.reduce((a, b) => a + b.hi - b.lo, 0)])
  return parts.sort((a, b) => b[1] - a[1]).map(([m, v]) => `${L[m]} ${pct(v)}`).join(' · ')
}
function viewLabel(mode) {
  const st = viewState(mode)
  if (mode === 'mix') return `Mix · ${describe(st)}`
  if (mode === 'votes') return `Votes · ${describe(st)}`
  const p = peerOf(mode)
  if (p) return `${p.name} · ${ctrl.labels[p.material]}`
  return `Mine · ${ctrl.labels[myMat]}`
}

/** Decide what the block shows. */
let shown = '', pendingRefresh = false
function refreshDisplay(byMe) {
  if (ctrl.scrubbing || anim) { pendingRefresh = true; return }      // a swipe is in progress: apply afterwards
  if (!availableViews().includes(viewMode)) viewMode = 'mine'
  const st = rateMode ? {base: rateIdx, bands: []} : viewState(viewMode)
  ctrl.setMaterial(st.base, true)
  ctrl.setBands(st.bands)
  const key = JSON.stringify(st)
  if (key !== shown) {
    const structural = shown.split('"bands"')[0] !== key.split('"bands"')[0] || !shown
    shown = key
    if (!rateMode && (structural || byMe)) ctrl.toast(describe(st))
    if (!byMe && room.peers.size) try { navigator.vibrate && navigator.vibrate(12) } catch (e) { /* not supported */ }
  }
}
// alignment: the block frame is only trusted after the black origin mark has been seen
let aligned = false, lastFound = -1e9, accepted = null, jumpCount = 0

// ---------- processing canvas ----------
const proc = document.createElement('canvas')
const pctx = proc.getContext('2d', {willReadFrequently: true})
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
  // the <video> uses object-fit: cover; mirror that crop in the 3D projection
  const sc = Math.max(sw / pw, sh / ph), visW = sw / sc, visH = sh / sc
  const ox = (pw - visW) / 2, oy = (ph - visH) / 2
  view = {sc, ox, oy}
  const n = 0.5, f = 1000
  camera.projectionMatrix.makePerspective(
    -(K.cx - ox) / K.fx * n, (ox + visW - K.cx) / K.fx * n,
    (K.cy - oy) / K.fy * n, -(oy + visH - K.cy) / K.fy * n, n, f)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
addEventListener('resize', layout)

// ---------- camera background: the very frame that was analysed ----------
const bg = $('bg'), bgctx = bg.getContext('2d')
function drawBackground() {
  const vw = video.videoWidth, vh = video.videoHeight, W = bg.width, H = bg.height
  const s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s
  bgctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
}

// ---------- camera FOV self-calibration ----------
// The 4 dots of a big face form a known square; seen at an angle, its perspective gives the
// camera's focal length. We collect estimates from tilted views and keep a weighted median.
const FOV_NEEDED = 40
let fovSamples = []
function feedFov(r) {
  if (cfg.fovManual || r.model.name !== 'top' || r.err > 0.08) return
  for (const e of fovFromSquare(r.quad, pw, ph, models[0].pts)) if (e.w > 0.1) fovSamples.push(e)
  if (fovSamples.length > 160) fovSamples.splice(0, fovSamples.length - 160)
  if (fovSamples.length < FOV_NEEDED) return
  const sorted = fovSamples.slice().sort((a, b) => a.fov - b.fov)
  const total = sorted.reduce((a, e) => a + e.w, 0)
  let acc = 0, med = sorted[0].fov
  for (const e of sorted) { acc += e.w; if (acc >= total / 2) { med = e.fov; break } }
  if (!cfg.fovCalibrated || Math.abs(med - cfg.fov) > 0.6) {
    const first = !cfg.fovCalibrated
    cfg.fov = Math.round(med * 10) / 10; cfg.fovCalibrated = true; saveCfg(); layout()
    const inp = $('cal-fov'); if (inp) inp.value = cfg.fov
    if (first) ctrl.toast(`Camera calibrated · ${cfg.fov.toFixed(1)}°`)
  }
}

// ---------- frame loop ----------
const FLIP = new THREE.Quaternion(1, 0, 0, 0)      // OpenCV camera (y down, z forward) -> three.js camera
const pos = new THREE.Vector3(), quat = new THREE.Quaternion()
let prevQuat = null, last = null, frames = 0, fps = 0, fpsT = performance.now(), cost = 15

function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  if (video.readyState >= 2 && K) {
    pctx.drawImage(video, 0, 0, pw, ph)
    drawBackground()                                         // show exactly the frame we analyse: no swimming
    const img = pctx.getImageData(0, 0, pw, ph)
    const t0 = performance.now()
    const r = trackFrame(img.data, pw, ph, K, models, prevQuat, 0.15, cfg)
    cost = cost * 0.9 + (performance.now() - t0) * 0.1
    if (cost > 30 && PROC_LONG > 560) { PROC_LONG = 560; layout() }
    else if (cost < 12 && PROC_LONG < 720) { PROC_LONG = 720; layout() }
    last = r
    // stability: a pose that jumps far from the last accepted one must repeat for 3 frames first
    if (r.found && accepted && now - lastFound < 500) {
      const dq = Math.abs(r.quat[0] * accepted.quat[0] + r.quat[1] * accepted.quat[1] + r.quat[2] * accepted.quat[2] + r.quat[3] * accepted.quat[3])
      const dp = Math.hypot(r.center[0] - accepted.center[0], r.center[1] - accepted.center[1], r.center[2] - accepted.center[2])
      if (dq < Math.cos(35 * Math.PI / 360) || dp > 4) {
        jumpCount = (jumpCount || 0) + 1
        if (jumpCount < 3) r.found = false
      } else jumpCount = 0
    }
    if (r.found) accepted = {quat: r.quat, center: r.center}
    if (r.found) {
      if (now - lastFound > 1500) aligned = false          // lost for a while: orientation must be re-confirmed
      if (r.markScore > 0.3) aligned = true
      lastFound = now
      prevQuat = r.quat
      pos.set(r.center[0], -r.center[1], -r.center[2])
      quat.set(...r.quat)
      quat.premultiply(FLIP)
      feedFov(r)
      let label = r.model.label
      if (!cfg.fovCalibrated) label += ` · calibrating camera ${Math.min(99, Math.round(fovSamples.length / FOV_NEEDED * 100))}%, tilt slowly`
      ctrl.updateDirect(true, pos, quat, label, now)
    } else {
      ctrl.updateDirect(false, null, null, '', now)
    }
    // simple exposure estimate from the frame brightness, -1..1
    let sum = 0, n = 0
    for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++ }
    ctrl.tick({exposure: Math.max(-1, Math.min(1, (sum / n / 255 - 0.5) * 2))})
    frames++
    if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now }
  } else {
    ctrl.tick()
  }
  layer.update(aligned)
  if (room.code && aligned && ctrl.tracking) { const c = layer.cameraInBlock(); room.publishPose(c.p, c.q) }
  renderer.render(scene, camera)
  drawDebug()
}

function drawDebug() {
  const on = $('debugBtn').getAttribute('aria-pressed') === 'true'
  dctx.setTransform(1, 0, 0, 1, 0, 0)
  dctx.clearRect(0, 0, dbg.width, dbg.height)
  if (!on || !last) return
  const d = devicePixelRatio, S = (x, y) => [((x - view.ox) * view.sc) * d, ((y - view.oy) * view.sc) * d]
  dctx.lineWidth = 2 * d
  dctx.strokeStyle = '#00e5ff'
  for (const b of last.blobs || []) { const [x, y] = S(b.x, b.y); dctx.beginPath(); dctx.arc(x, y, 9 * d, 0, 7); dctx.stroke() }
  if (last.found) {
    dctx.strokeStyle = '#00ff78'; dctx.lineWidth = 3 * d; dctx.beginPath()
    last.quad.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y) })
    dctx.closePath(); dctx.stroke()
  }
  dctx.fillStyle = '#fff'; dctx.font = `${13 * d}px ui-monospace, monospace`
  if (last.found && last.model.name === 'top') {            // where the origin mark is expected
    const a = cfg.W / 2 - cfg.topInset, b = cfg.D / 2 - cfg.topInset
    const v = new THREE.Vector3(-a + cfg.markOffset, cfg.T / 2, -b + cfg.markOffset)
    v.applyQuaternion(quat).add(pos).project(camera)
    const x = (v.x + 1) / 2 * innerWidth * d, y = (1 - v.y) / 2 * innerHeight * d
    dctx.strokeStyle = last.markScore > 0.3 ? '#ffd166' : 'rgba(255,209,102,.45)'; dctx.lineWidth = 2 * d
    dctx.beginPath(); dctx.arc(x, y, 11 * d, 0, 7); dctx.stroke()
  }
  const info = last.found ? `${last.model.name}  err ${last.err.toFixed(3)}  mark ${last.markScore.toFixed(2)}  ${Math.hypot(...last.center).toFixed(1)} cm` : 'no face'
  dctx.fillText(`${info}  ·  red blobs ${(last.blobs || []).length}  ·  ${fps} fps  ·  ${pw}x${ph}`, 12 * d, (innerHeight - 150) * d)
}

// ---------- start camera ----------
$('startBtn').onclick = async () => {
  $('startErr').textContent = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}},
    })
    video.srcObject = stream
    await video.play()
    await new Promise(res => (video.videoWidth ? res() : video.addEventListener('loadedmetadata', res, {once: true})))
    layout()
    $('start').hidden = true
    $('hud').hidden = false
    ctrl.setStatus('Show the block: all 4 red dots of one face')
    if (params.get('room')) joinRoom(params.get('room'))
  } catch (e) {
    $('startErr').textContent = e && e.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access for this site in Settings, then reload.'
      : `Could not open the camera (${(e && e.name) || e}). This page needs HTTPS and a phone camera.`
  }
}

// ---------- calibration panel ----------
const FIELDS = [
  ['W', 'Width (cm)', 'long edge of the side faces'],
  ['D', 'Depth (cm)', 'other edge of the big face'],
  ['T', 'Thickness (cm)', ''],
  ['topInset', 'Big face: dot to edge (cm)', 'center of a dot to the nearest edge'],
  ['sideEnd', 'Side face: dot to the end (cm)', '2 dots per side face, centered across the thickness'],
  ['markOffset', 'Black mark: offset (cm)', 'from its red dot toward the center, along each edge'],
  ['fov', 'Camera FOV (°)', 'raise if the overlay looks too big, lower if too small'],
]
function buildCalib() {
  const box = $('calibFields')
  box.innerHTML = ''
  for (const [k, label, hint] of FIELDS) {
    const row = document.createElement('label'); row.className = 'field'; row.htmlFor = `cal-${k}`
    row.innerHTML = `<span>${label}${hint ? `<small>${hint}</small>` : ''}</span>`
    const inp = document.createElement('input')
    inp.type = 'number'; inp.id = `cal-${k}`; inp.step = k === 'fov' ? '1' : '0.1'; inp.inputMode = 'decimal'; inp.value = cfg[k]
    inp.oninput = () => {
      const v = parseFloat(inp.value)
      if (!isFinite(v) || v <= 0) return
      cfg[k] = v
      if (k === 'fov') { cfg.fovCalibrated = true; cfg.fovManual = true }   // a typed FOV wins over auto-calibration
      saveCfg()
      models = makeModels(cfg)
      ctrl.setBox({w: cfg.W, h: cfg.T, d: cfg.D})
      layout()
    }
    row.appendChild(inp); box.appendChild(row)
  }
}
$('calibBtn').onclick = () => { $('calib').hidden = !$('calib').hidden }
$('calibClose').onclick = () => { $('calib').hidden = true }
$('calibReset').onclick = () => {
  cfg = {...DEFAULT_BLOCK}; saveCfg(); models = makeModels(cfg); fovSamples = []
  ctrl.setBox({w: cfg.W, h: cfg.T, d: cfg.D}); layout(); buildCalib()
}
$('calibCamera').onclick = () => {
  fovSamples = []; cfg.fovCalibrated = false; cfg.fovManual = false; saveCfg()
  $('calib').hidden = true
  ctrl.toast('Tilt the block slowly')
}
buildCalib()

// ---------- room panel ----------
function joinRoom(code) {
  room.join(code, myMat)
  const url = new URL(location.href); url.searchParams.set('room', room.code)
  history.replaceState(null, '', url)
  renderRoomInfo(); renderViews()
}
function renderRoomInfo(msg) {
  const peers = room.peers.size
  const pill = $('roomPill')
  if (!room.code) { pill.textContent = 'Room'; $('roomInfo').textContent = 'Not in a room. Create one, or type the code from the other phone.'; $('roomLive').hidden = true; return }
  const st = {connecting: 'connecting…', connected: `${peers + 1} phone${peers ? 's' : ''}`, offline: 'offline, retrying…', error: 'connection error'}[roomStatus] || roomStatus
  pill.textContent = `Room ${room.code} · ${st}`
  $('roomLive').hidden = false
  $('roomCode').textContent = room.code
  const link = new URL(location.href); link.searchParams.set('room', room.code); link.searchParams.delete('broker')
  if (params.get('broker')) link.searchParams.set('broker', params.get('broker'))
  $('roomLink').textContent = link.href
  const L = ctrl.labels
  $('roomInfo').textContent = msg ? `${st} (${msg})` : `You are ${room.me.name}. ${peers ? [...room.peers.values()].map(p => `${p.name} (${L[p.material]})`).join(', ') + ' connected.' : 'Waiting for the other phone…'}`
}
$('roomPill').onclick = () => { $('room').hidden = !$('room').hidden; renderRoomInfo() }
$('roomClose').onclick = () => { $('room').hidden = true }
$('roomCreate').onclick = () => joinRoom(randomCode())
$('roomJoin').onclick = () => { const c = $('roomInput').value.trim(); if (c) joinRoom(c) }
$('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('roomJoin').click() })
$('roomLeave').onclick = () => { room.leave(); viewMode = 'mine'; if (rateMode) setRateMode(false); refreshDisplay(true); renderRoomInfo(); renderViews() }
$('roomCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('roomLink').textContent); $('roomCopy').textContent = 'Copied' }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('roomLink')); getSelection().removeAllRanges(); getSelection().addRange(r) }
  setTimeout(() => { $('roomCopy').textContent = 'Copy link' }, 1500)
}
// ---------- view switch: Mine / Mix / each person / Votes ----------
function renderViews() {
  const L = ctrl.labels, views = availableViews()
  $('views').hidden = views.length < 2 || rateMode
  $('rateBtn').hidden = !room.code
  if (views.length < 2) return
  const seg = $('viewSeg')
  seg.innerHTML = ''
  for (const k of views) {
    const b = document.createElement('button'), p = peerOf(k)
    b.type = 'button'; b.id = `view-${k.replace(':', '-')}`
    b.textContent = k === 'mine' ? `Mine · ${L[myMat]}` : k === 'mix' ? 'Mix' : k === 'votes' ? 'Votes' : `${p.name} · ${L[p.material]}`
    if (p) { b.className = 'peer'; b.style.setProperty('--dot', p.color) }
    b.setAttribute('aria-pressed', viewMode === k)
    b.onclick = () => { viewMode = k; refreshDisplay(true); renderViews() }
    seg.appendChild(b)
  }
  // the slider (rooms of two) always reads "mine ← → partner"; the shared ratio is the share of
  // the second person by id, so the phone that is second sees it flipped
  const p = partner()
  $('mixRow').hidden = !(viewMode === 'mix' && room.peers.size === 1)
  if (p && room.peers.size === 1) {
    $('mixA').textContent = L[myMat]; $('mixB').textContent = L[p.material]
    const all = people(), latest = all.reduce((x, y) => ((y.mixAt || 0) > (x.mixAt || 0) ? y : x))
    const r = latest.mixAt ? latest.mix ?? 0.5 : 0.5
    if (document.activeElement !== $('mixRange')) $('mixRange').value = Math.round((iAmFirst() ? r : 1 - r) * 100)
  }
  renderBoard()
}
/** Leaderboard under the Votes view: share of the block, likes, nopes. */
function renderBoard() {
  const board = $('board')
  board.hidden = viewMode !== 'votes' || rateMode
  if (board.hidden) return
  const t = tally(), sh = voteShares(), L = ctrl.labels
  const rows = L.map((label, i) => ({i, label, s: sh[i], ...t[i]})).sort((a, b) => b.s - a.s || b.like - a.like)
  board.innerHTML = rows.map(r => `<div class="brow"><span class="bname">${r.label}</span><span class="bbar"><i style="width:${(r.s * 100).toFixed(1)}%"></i></span><span class="bpct">${pct(r.s)}</span><span class="bvotes">♥ ${r.like} · ✕ ${r.nope}</span></div>`).join('')
}
let mixSend = null
$('mixRange').addEventListener('input', () => {
  const v = $('mixRange').value / 100
  mixRatio = iAmFirst() ? v : 1 - v
  room.me.mix = mixRatio; room.me.mixAt = Date.now()
  ctrl.setBands(mixSetup().bands)
  clearTimeout(mixSend); mixSend = setTimeout(() => room.setMix(mixRatio), 120)    // throttle network updates
})

// ---------- rating (dating-app style): swipe up = like, swipe down = nope ----------
const swatchOf = i => $('chips').children[i]?.querySelector('canvas')
function nextUnrated(from) {
  const n = ctrl.labels.length, v = room.me.votes || {}
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!(i in v)) return i }
  return -1
}
function setRateMode(on) {
  rateMode = on
  $('rateBtn').setAttribute('aria-pressed', on)
  $('rate').hidden = !on
  $('chips').hidden = on
  if (on) {
    const v = room.me.votes || {}
    rateIdx = !(myMat in v) ? myMat : Math.max(0, nextUnrated(myMat))
    showCandidate()
  } else ctrl.setStatus('Tracking', ctrl.tracking)
  $('help').textContent = on ? 'Swipe up to like · down to pass · sideways to browse' : 'Swipe sideways to switch layers · hold to see the real block'
  refreshDisplay(true); renderViews()
}
function showCandidate() {
  const L = ctrl.labels, t = tally()[rateIdx], mine = (room.me.votes || {})[rateIdx]
  $('rateName').textContent = L[rateIdx]
  $('rateTally').textContent = `${mine > 0 ? 'You liked it · ' : mine < 0 ? 'You passed · ' : ''}♥ ${t.like} · ✕ ${t.nope} in the room`
  const c = $('rateSwatch').getContext('2d'), src = swatchOf(rateIdx)
  c.clearRect(0, 0, 96, 96); if (src) c.drawImage(src, 0, 0, 96, 96)
  const done = Object.keys(room.me.votes || {}).length
  $('rateCount').textContent = `${Math.min(done + 1, L.length)} / ${L.length}`
  cardTo(0, 0, false)
  refreshDisplay(true)
}
function cardTo(dy, dx, animate) {
  const card = $('rateCard')
  card.style.transition = animate ? 'transform .22s ease-out, opacity .22s' : 'none'
  card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04 - dy * 0.03}deg)`
  const k = Math.min(1, Math.abs(dy) / 110)
  $('stampLike').style.opacity = dy < 0 ? k : 0
  $('stampNope').style.opacity = dy > 0 ? k : 0
}
function vote(v) {
  const votes = {...(room.me.votes || {}), [rateIdx]: v}
  room.me.votes = votes
  if (room.code) room.setVotes(votes)
  try { navigator.vibrate && navigator.vibrate(v > 0 ? [12, 40, 12] : 20) } catch (e) { /* not supported */ }
  ctrl.toast(`${v > 0 ? '♥' : '✕'} ${ctrl.labels[rateIdx]}`)
  cardTo(v > 0 ? -innerHeight * 0.6 : innerHeight * 0.6, 0, true)
  $('rateCard').style.opacity = 0
  anim = true
  setTimeout(() => {
    anim = false
    $('rateCard').style.opacity = 1
    const nx = nextUnrated(rateIdx)
    if (nx < 0) {                                      // everything rated: show the room's verdict
      setRateMode(false)
      viewMode = 'votes'; refreshDisplay(true); renderViews()
      ctrl.toast(`Votes · ${describe(votesSetup())}`)
      return
    }
    rateIdx = nx; showCandidate()
  }, 230)
}
function browse(dir) {
  const n = ctrl.labels.length
  rateIdx = (rateIdx + dir + n) % n
  showCandidate()
  try { navigator.vibrate && navigator.vibrate(8) } catch (e) { /* not supported */ }
}
$('rateBtn').onclick = () => setRateMode(!rateMode)
$('rateLike').onclick = () => !anim && vote(1)
$('rateNope').onclick = () => !anim && vote(-1)
$('rateClose').onclick = () => setRateMode(false)

// ---------- swipe between layers ----------
// Views in order (Mine · Mix · each person · Votes; alone: my materials). A line follows the
// finger and the block shows the next layer on one side of it; release past 1/3 (or flick) to switch.
function swipeTarget(dir) {                    // dir +1 = finger moves left (next), -1 = right (previous)
  const views = availableViews(), n = ctrl.labels.length
  if (views.length < 2) {
    const mat = (myMat + dir + n) % n
    return {state: {base: mat, bands: []}, label: `Mine · ${ctrl.labels[mat]}`, apply: () => chooseMine(mat)}
  }
  const i = views.indexOf(viewMode) + dir
  if (i < 0 || i >= views.length) return null
  const mode = views[i]
  return {state: viewState(mode), label: viewLabel(mode), apply: () => { viewMode = mode; renderViews() }}
}
function chooseMine(mat) { myMat = mat; ctrl.setSelected(mat); if (room.code) room.setMaterial(mat) }

const line = $('swipeLine'), slabel = $('swipeLabel')
let g = null
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function down(e) {
  if (anim) return
  g = {x0: e.clientX, y0: e.clientY, active: false, hist: [[e.clientX, e.clientY, performance.now()]], el: e.currentTarget}
}
function move(e) {
  if (!g) return
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0
  g.hist.push([e.clientX, e.clientY, performance.now()]); if (g.hist.length > 6) g.hist.shift()
  if (!g.active) {
    if (rateMode) {
      if (Math.abs(dy) >= 14 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        g.active = true; g.kind = 'vote'
      } else if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        browse(dx < 0 ? 1 : -1); g = null; return
      } else return
      try { g.el.setPointerCapture(e.pointerId) } catch (err) { /* not supported */ }
    } else {
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2) return
      const dir = dx < 0 ? 1 : -1, target = swipeTarget(dir)
      if (!target || !ctrl.tracking) { g = null; return }
      g.active = true; g.kind = 'layer'; g.dir = dir; g.target = target
      ctrl.scrubStart(target.state, dir === 1 ? 'right' : 'left')
      slabel.textContent = target.label; slabel.classList.add('on')
      line.hidden = false
      try { g.el.setPointerCapture(e.pointerId) } catch (err) { /* not supported */ }
    }
  }
  if (g.kind === 'vote') { g.dy = dy; cardTo(dy, dx * 0.3, false); return }
  const w = innerWidth
  g.x = g.dir === 1 ? clamp(w + dx, 0, w) : clamp(dx, 0, w)
  ctrl.scrubSet(g.x)
  line.style.transform = `translateX(${g.x}px)`
}
function endSwipe() {
  if (!g) return
  const s0 = g; g = null
  if (!s0.active) return
  const [x1, y1, t1] = s0.hist[0], [x2, y2, t2] = s0.hist[s0.hist.length - 1]
  if (s0.kind === 'vote') {
    const vy = (y2 - y1) / Math.max(1, t2 - t1)                    // px per ms, negative = moving up
    const thr = Math.min(130, innerHeight * 0.16)
    if (s0.dy < -thr || (vy < -0.6 && s0.dy < -30)) vote(1)
    else if (s0.dy > thr || (vy > 0.6 && s0.dy > 30)) vote(-1)
    else cardTo(0, 0, true)
    return
  }
  const w = innerWidth
  const v = (x2 - x1) / Math.max(1, t2 - t1)                      // px per ms, negative = moving left
  const progress = s0.dir === 1 ? (w - s0.x) / w : s0.x / w
  const commit = progress > 0.33 || v * -s0.dir > 0.5
  const from = s0.x, to = commit ? (s0.dir === 1 ? 0 : w) : (s0.dir === 1 ? w : 0)
  const t0 = performance.now(), dur = 220
  anim = true
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3)
    const x = from + (to - from) * e
    ctrl.scrubSet(x); line.style.transform = `translateX(${x}px)`
    if (k < 1) return requestAnimationFrame(step)
    ctrl.scrubEnd(commit)
    line.hidden = true; slabel.classList.remove('on'); anim = false
    if (commit) {
      s0.target.apply()
      try { navigator.vibrate && navigator.vibrate(15) } catch (err) { /* not supported */ }
    }
    pendingRefresh = false
    refreshDisplay(true); renderViews()
  }
  requestAnimationFrame(step)
}
for (const el of [gl, $('rateCard')]) {
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', endSwipe)
  el.addEventListener('pointercancel', endSwipe)
}
window.__app = {get viewMode() { return viewMode }, set viewMode(v) { viewMode = v; refreshDisplay(true); renderViews() },
  viewState, availableViews, tally, voteShares, setRateMode, vote, get rateIdx() { return rateIdx }, get rateMode() { return rateMode }, describe}

renderRoomInfo()
setTimeout(() => ctrl.prewarm(), 1500)
requestAnimationFrame(loop)
