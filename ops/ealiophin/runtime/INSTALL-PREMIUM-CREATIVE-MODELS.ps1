[CmdletBinding()]
param(
    [string]$OpenNovaRuntime = 'C:\Users\Ashley\Resonance\OpenNova\runtime',
    [switch]$SkipStoryboardModel,
    [switch]$SkipLoraFallback
)
$ErrorActionPreference = 'Stop'
$mediaPython = Join-Path $OpenNovaRuntime 'python-envs\musetalk-0a89dec45a01\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $mediaPython -PathType Leaf)) { throw "Media Python not found: $mediaPython" }
if (-not $SkipStoryboardModel) {
    $ollama = (Get-Command ollama.exe -ErrorAction Stop).Source
    Write-Host 'Installing Qwen3 8B storyboard model...'
    & $ollama pull qwen3:8b
    if ($LASTEXITCODE -ne 0) { throw 'Ollama failed to pull qwen3:8b' }
} else {
    Write-Host 'Skipping Qwen3 storyboard model for image-only premium model deployment.'
}
$modelsRoot = Join-Path $OpenNovaRuntime 'models'
$downloadScript = Join-Path $env:TEMP 'ronsas-premium-model-download.py'
$skipLoraPy = if ($SkipLoraFallback) { 'True' } else { 'False' }
$py = @"
from huggingface_hub import hf_hub_download
from pathlib import Path
root = Path(r'$modelsRoot')
items = [
    ('stabilityai/stable-diffusion-xl-base-1.0', 'sd_xl_base_1.0.safetensors', root / 'sdxl-base'),
    ('ByteDance/SDXL-Lightning', 'sdxl_lightning_4step_unet.safetensors', root / 'sdxl-lightning'),
]
if not $skipLoraPy:
    items.append(('ByteDance/SDXL-Lightning', 'sdxl_lightning_4step_lora.safetensors', root / 'sdxl-lightning'))
for repo, filename, dest in items:
    dest.mkdir(parents=True, exist_ok=True)
    print(f'Downloading {repo}/{filename}', flush=True)
    print(hf_hub_download(repo_id=repo, filename=filename, local_dir=str(dest)), flush=True)
"@
[IO.File]::WriteAllText($downloadScript, $py, (New-Object Text.UTF8Encoding($false)))
try {
    & $mediaPython $downloadScript
    if ($LASTEXITCODE -ne 0) { throw 'Premium image model download failed' }
} finally { Remove-Item $downloadScript -Force -ErrorAction SilentlyContinue }
$base = Join-Path $modelsRoot 'sdxl-base\sd_xl_base_1.0.safetensors'
$unet = Join-Path $modelsRoot 'sdxl-lightning\sdxl_lightning_4step_unet.safetensors'
$lora = Join-Path $modelsRoot 'sdxl-lightning\sdxl_lightning_4step_lora.safetensors'
if ((Get-Item $base).Length -lt 5GB) { throw 'SDXL base model is incomplete' }
if ((Get-Item $unet).Length -lt 4500MB) { throw 'SDXL-Lightning 4-step UNet checkpoint is incomplete' }
if (-not $SkipLoraFallback) {
    if ((Get-Item $lora).Length -lt 250MB) { throw 'SDXL-Lightning LoRA fallback is incomplete' }
} else {
    Write-Host 'Skipping Lightning LoRA fallback validation for UNet-only premium deployment.'
}
Write-Host 'Premium creative models are ready.'
