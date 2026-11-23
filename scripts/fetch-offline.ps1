# Downloads the MediaPipe pose files into vendor/mediapipe so the app works
# without internet (e.g. on presentation-room Wi-Fi). Run once from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-offline.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'vendor\mediapipe'
New-Item -ItemType Directory -Force (Join-Path $dest 'wasm') | Out-Null

$cdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
$files = @{
  "$cdn/vision_bundle.mjs"                         = 'vision_bundle.mjs'
  "$cdn/wasm/vision_wasm_internal.js"              = 'wasm\vision_wasm_internal.js'
  "$cdn/wasm/vision_wasm_internal.wasm"            = 'wasm\vision_wasm_internal.wasm'
  "$cdn/wasm/vision_wasm_nosimd_internal.js"       = 'wasm\vision_wasm_nosimd_internal.js'
  "$cdn/wasm/vision_wasm_nosimd_internal.wasm"     = 'wasm\vision_wasm_nosimd_internal.wasm'
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' = 'pose_landmarker_lite.task'
}

foreach ($url in $files.Keys) {
  $out = Join-Path $dest $files[$url]
  Write-Host "Downloading $($files[$url])..."
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
}
Write-Host "Done. Offline copies are in $dest"
