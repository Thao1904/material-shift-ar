// Shared room between phones over MQTT (WebSocket).
// Each phone publishes WHO it is and WHICH material it picked, plus its camera pose
// expressed in BLOCK coordinates (cm, origin = block center, axes fixed by the black mark).
//
// Topics (prefix materialshift/v2/<ROOM>/):
//   user/<id>   retained  {id, name, color, material}      cleared by last-will when the phone leaves
//   pose/<id>   live      {id, p:[x,y,z], q:[x,y,z,w], t}  camera in block frame, ~5 Hz while aligned
// The default broker is public: anyone who knows the room code can join.
import mqtt from 'mqtt/dist/mqtt.esm'

export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt'
const PREFIX = 'materialshift/v2/'
const COLORS = ['#ff8a3d', '#4fb3ff', '#7fe0a8', '#c9a2ff', '#ffd166', '#ff6f91']

export function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({length: 4}, () => A[Math.floor(Math.random() * A.length)]).join('')
}

export function createRoom({broker = DEFAULT_BROKER, onPeers, onStatus}) {
  const id = Math.random().toString(36).slice(2, 8)
  const me = {id, name: `Phone ${id.slice(0, 2).toUpperCase()}`, color: COLORS[parseInt(id, 36) % COLORS.length], material: 0, mix: 0.5, mixAt: 0}
  let client = null, code = null
  const peers = new Map()        // id -> {name, color, material, p, q, poseAt}
  const stats = {posesSent: 0, posesGot: 0, log: []}
  const topic = t => `${PREFIX}${code}/${t}`

  function publishMe() {
    if (client && client.connected) client.publish(topic(`user/${id}`), JSON.stringify(me), {qos: 1, retain: true})
  }

  function join(roomCode, material) {
    leave()
    code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (!code) return
    me.material = material
    onStatus?.('connecting', code)
    const t0 = Date.now(), note = (m) => { stats.log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`); if (stats.log.length > 30) stats.log.shift() }
    client = mqtt.connect(broker, {
      clientId: `ms-${id}-${Date.now().toString(36)}`,
      clean: true, reconnectPeriod: 2000, connectTimeout: 10000, keepalive: 30,
      will: {topic: topic(`user/${id}`), payload: '', qos: 1, retain: true},
    })
    client.on('connect', () => {
      note('connect')
      onStatus?.('connected', code)
      client.subscribe([topic('user/+'), topic('pose/+')], {qos: 0})
      publishMe()
    })
    client.on('close', () => note('close'))
    client.on('reconnect', () => { note('reconnect'); onStatus?.('connecting', code) })
    client.on('offline', () => { note('offline'); onStatus?.('offline', code) })
    client.on('error', (e) => { note('error ' + (e && e.message)); onStatus?.('error', code, e && e.message) })
    client.on('message', (t, buf) => {
      const parts = t.split('/'), kind = parts[parts.length - 2], pid = parts[parts.length - 1]
      if (pid === id) return
      const txt = buf.toString()
      if (kind === 'user') {
        if (!txt) { peers.delete(pid); onPeers?.(peers); return }
        try {
          const u = JSON.parse(txt)
          peers.set(pid, {...(peers.get(pid) || {}), id: pid, name: u.name, color: u.color, material: u.material, mix: u.mix ?? 0.5, mixAt: u.mixAt || 0})
          onPeers?.(peers)
        } catch (e) { /* ignore malformed */ }
      } else if (kind === 'pose') {
        const peer = peers.get(pid)
        if (!peer || !txt) return
        try {
          const p = JSON.parse(txt)
          stats.posesGot++
          peer.p = p.p; peer.q = p.q; peer.poseAt = Date.now()
          onPeers?.(peers, true)
        } catch (e) { /* ignore */ }
      }
    })
  }

  function leave() {
    if (client) {
      try { client.publish(topic(`user/${id}`), '', {qos: 1, retain: true}) } catch (e) { /* closing */ }
      client.end(false)
    }
    client = null; code = null
    peers.clear(); onPeers?.(peers)
    onStatus?.('idle', null)
  }

  function setMaterial(i) { me.material = i; publishMe() }
  /** Shared mix ratio: the most recent change from any phone wins. */
  function setMix(r) { me.mix = r; me.mixAt = Date.now(); publishMe() }

  let lastPose = 0
  function publishPose(p, q) {
    const now = Date.now()
    if (!client || !client.connected || now - lastPose < 200) return
    lastPose = now
    stats.posesSent++
    client.publish(topic(`pose/${id}`), JSON.stringify({id, p: p.map(v => +v.toFixed(2)), q: q.map(v => +v.toFixed(4)), t: now}), {qos: 0})
  }

  return {me, join, leave, setMaterial, setMix, publishPose, stats,
    get code() { return code }, get peers() { return peers }, get connected() { return !!(client && client.connected) }}
}
