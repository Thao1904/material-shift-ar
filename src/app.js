// Entry point. Same pipeline as 8thwall/threejs-world-effects-example, but with
// Image Targets (one per cube face) instead of SLAM.
//   https://<site>/            -> AR on a phone
//   https://<site>/?preview    -> desktop preview without a camera
import * as THREE from 'three'
import {FACES} from './faces.js'
import {materialShiftPipelineModule} from './xr-module.js'
import {startPreview} from './preview.js'

window.THREE = THREE

if (new URLSearchParams(location.search).has('preview')) {
  startPreview()
} else {
  const onxrloaded = async () => {
    // Target data made by @8thwall/image-target-cli lives in public/image-targets/.
    const imageTargetData = await Promise.all(
      FACES.map(f => fetch(`image-targets/${f.targetName}.json`).then(r => r.json()))
    )
    XR8.XrController.configure({
      imageTargetData,
      disableWorldTracking: true,   // the block moves, the room doesn't matter
    })
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),      // camera feed
      XR8.Threejs.pipelineModule(),                // three.js scene synced to the camera
      XR8.XrController.pipelineModule(),           // image target tracking
      LandingPage.pipelineModule(),                // QR code on desktop / unsupported browsers
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      materialShiftPipelineModule(),               // our cube + materials
    ])
    XR8.run({canvas: document.getElementById('camerafeed')})
  }
  window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
}
