// Local MQTT broker over WebSocket for testing rooms without the internet.
//   npm run broker      -> ws://localhost:8888
// Then open block.html?broker=ws://<your-computer-ip>:8888 on both phones (same Wi-Fi).
import {createRequire} from 'module'
const require = createRequire(import.meta.url)
const aedes = require('aedes')()
const {createServer} = require('aedes-server-factory')
const port = +(process.env.PORT || 8888)
createServer(aedes, {ws: true}).listen(port, () => console.log(`MQTT over WebSocket on ws://localhost:${port}`))
aedes.on('client', c => console.log('+', c.id))
aedes.on('clientDisconnect', c => console.log('-', c.id))
