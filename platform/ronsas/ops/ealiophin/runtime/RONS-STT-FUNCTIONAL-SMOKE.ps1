param([switch]$RequireCuda,[string]$ExpectedModel='')
$ErrorActionPreference='Stop'
$Health=Invoke-RestMethod -Uri 'http://127.0.0.1:7864/health' -TimeoutSec 10
if(-not [bool]$Health.ok){throw 'STT health is not ready.'}
Add-Type -AssemblyName System.Speech
$Wav=Join-Path $env:TEMP ('rons-stt-smoke-'+[guid]::NewGuid().ToString('N')+'.wav')
try {
  $Synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
  $Synth.SetOutputToWaveFile($Wav)
  $Synth.Speak('Resonance Sovereign Speech Transcription Functional Test')
  $Synth.Dispose()
  $Bytes=[IO.File]::ReadAllBytes($Wav)
  $Headers=@{'X-Filename'='rons-smoke.wav';'X-Mode'='best';'X-Profile'='production';'Content-Type'='audio/wav'}
  $Result=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:7864/transcribe' -Headers $Headers -Body $Bytes -TimeoutSec 180
  $Text=[string]$Result.text
  if($Text -notmatch '(?i)resonance' -or $Text -notmatch '(?i)transcription'){throw 'STT transcript content check failed.'}
  if([string]$Result.quality.provider -ne 'rons-local-faster-whisper'){throw 'Unexpected STT provider.'}
  if($RequireCuda -and [string]$Result.quality.device -ne 'cuda'){throw 'CUDA was required but was not used.'}
  if($ExpectedModel -and [string]$Result.quality.resolvedModel -ne $ExpectedModel){throw ('Expected model '+$ExpectedModel+' but got '+[string]$Result.quality.resolvedModel)}
  Write-Host ('[PASS] STT text="'+$Text+'" model='+[string]$Result.quality.resolvedModel+' device='+[string]$Result.quality.device+' compute='+[string]$Result.quality.computeType)
  exit 0
} finally {
  Remove-Item -LiteralPath $Wav -Force -ErrorAction SilentlyContinue
}