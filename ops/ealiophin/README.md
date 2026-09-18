# Ealiophin Runtime Operations

This directory captures the governed, non-secret runtime sources used to keep the RONSAS public stack available on Ealiophin.

## Authority

- Hub source: `C:\Resonance\Sources\ronsas-hub-canonical`
- Runtime root: `C:\Users\Ashley\Resonance\OpenNova`
- Control Center: `C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter`
- Public edge: Cloudflare tunnel -> Caddy -> loopback services
- Production branch: `ronsas/ealiophin-production`

## Included

- Supervisor and governed recovery scripts
- Bounded cross-session recovery lock that prevents hung or duplicate recovery workers
- Pre-login public runtime bootstrap plus one-time elevated SYSTEM startup-task installer
- Public edge recovery and endpoint verification
- Semantic 13-service acceptance test
- Sovereign suite and canonical cluster launchers
- Local STT service with venv-local cuBLAS/cuDNN GPU activation and governed CPU fallback
- Reproducible STT GPU package pins and a real functional CUDA smoke test
- Caddy edge configuration
- SHA-256 manifest mapping repo snapshots to live source paths

## Excluded

No `.env` files, API keys, tunnel credentials, auth exchange keys, device credentials, database secrets, model weights, or other runtime secret material belong in this directory.

Large model weights are installed under the live runtime model directory and are verified separately by hash.

Windows requires administrator elevation to register the SYSTEM startup task. The bootstrap itself is non-secret and can be validated without elevation.

## Unified RONSAS runtime contract

The module registry in `cluster\RONSAS-MODULES.json` is the single Ealiophin composition contract. Hub and the four application surfaces are RONSAS modules; launch broker, local AI/media services, Foundry/backend, and Ollama are governed RONSAS services. The canonical supervisor starts/reuses them, status evaluates them, and final acceptance consumes the same contract. Legacy suite launchers are aliases only.
