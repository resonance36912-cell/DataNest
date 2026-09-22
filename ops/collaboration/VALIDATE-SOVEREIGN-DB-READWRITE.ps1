[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BackendSha,
  [Parameter(Mandatory=$true)][string]$HubSha,
  [Parameter(Mandatory=$true)][string]$HarnessPath
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ine 'Ealiophin'){throw 'Wrong host.'}
if((& gh api user --jq .login).Trim() -ne 'resonance36912-cell'){throw 'Unexpected GitHub identity.'}

$git=(Get-Command git.exe -ErrorAction Stop).Source
$bun=(Get-Command bun.exe -ErrorAction Stop).Source
$node=(Get-Command node.exe -ErrorAction Stop).Source
$py=(Get-Command py.exe -ErrorAction Stop).Source
$containerCli=$null
foreach($candidate in @('docker.exe','podman.exe')){
  $command=Get-Command $candidate -ErrorAction SilentlyContinue
  if($command){$containerCli=$command.Source;break}
}
if(-not $containerCli){throw 'Neither Docker nor Podman is available for an isolated Postgres acceptance database.'}

$root=Join-Path $env:RUNNER_TEMP "ronsas-sovereign-rw-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
$backend=Join-Path $root 'backend'
$hub=Join-Path $root 'hub'
$state=Join-Path $root 'state'
$venv=Join-Path $root 'venv'
if(Test-Path -LiteralPath $root){throw "Validation root already exists: $root"}
New-Item -ItemType Directory -Path $root,$state | Out-Null

$pgPort=55439
$authPort=58693
$gatewayPort=58694
$hubPort=4186
$containerName=("ronsas-accept-" + $env:GITHUB_RUN_ID + "-" + $env:GITHUB_RUN_ATTEMPT).ToLowerInvariant()
$dbPassword=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$procedureKey=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$authSigning=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$authExchange=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$dbPasswordFile=Join-Path $state 'postgres-password'
$procedureKeyFile=Join-Path $state 'gateway-procedure-key'
$authSigningFile=Join-Path $state 'auth-signing-key'
$authExchangeFile=Join-Path $state 'auth-exchange-key'
$authDb=Join-Path $state 'auth.db'
[IO.File]::WriteAllText($dbPasswordFile,$dbPassword)
[IO.File]::WriteAllText($procedureKeyFile,$procedureKey)
[IO.File]::WriteAllText($authSigningFile,$authSigning)
[IO.File]::WriteAllText($authExchangeFile,$authExchange)

$authProc=$null
$gatewayProc=$null
$hubProc=$null
$authOut=$null
$authErr=$null
$gatewayOut=$null
$gatewayErr=$null
$hubOut=$null
$hubErr=$null
$containerStarted=$false

function Curl-Code([string]$Url){
  $curl=(Get-Command curl.exe -ErrorAction Stop).Source
  $code=(& $curl --silent --show-error --max-time 5 --output NUL --write-out '%{http_code}' $Url)
  if($LASTEXITCODE -ne 0){return '000'}
  return [string]$code
}

function Wait-Http([string]$Url,[string]$Expected,[System.Diagnostics.Process]$Process){
  for($i=1;$i -le 60;$i++){
    Start-Sleep -Milliseconds 500
    if((Curl-Code $Url) -eq $Expected){return}
    if($Process.HasExited){throw "Process exited before $Url became ready."}
  }
  throw "Timed out waiting for $Url."
}

function Invoke-PsqlText([string]$Sql){
  $Sql | & $containerCli exec -i $containerName psql -v ON_ERROR_STOP=1 -U resonance -d resonance
  if($LASTEXITCODE -ne 0){throw 'Postgres SQL execution failed.'}
}

function Invoke-PsqlFile([string]$Path){
  if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw "SQL file missing: $Path"}
  Invoke-PsqlText ([IO.File]::ReadAllText($Path))
}

$old=@{}
foreach($name in @(
  'POSTGRES_PASSWORD','AUTH_DB','AUTH_SIGNING_KEY_FILE','AUTH_EXCHANGE_KEY_FILE','AUTH_URL',
  'DATABASE_URL','POSTGRES_PASSWORD_FILE','GATEWAY_PROCEDURE_KEY_FILE',
  'VITE_RONS_AUTH_MODE','RONS_SOVEREIGN_PROXY_ENABLED','RESONANCE_SOVEREIGN_GATEWAY_URL',
  'RESONANCE_SOVEREIGN_AUTH_URL','RONS_GATEWAY_PROCEDURE_KEY_FILE','RONS_PRODUCTION_AUTH_COOKIE',
  'RESONANCE_BACKEND_PROVIDER',
  'HOST','PORT','NODE_ENV','RONS_ACCEPTANCE_BASE','RONS_ACCEPTANCE_TOKEN','RONS_ACCEPTANCE_USER_ID'
)){
  $old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
}

try {
  & gh repo clone resonance36912-cell/rons-sovereign-backend-source $backend -- --no-tags
  if($LASTEXITCODE -ne 0){throw 'Backend clone failed.'}
  & $git -C $backend checkout --detach $BackendSha
  if($LASTEXITCODE -ne 0){throw 'Backend exact-head checkout failed.'}
  if((& $git -C $backend rev-parse HEAD).Trim() -ne $BackendSha){throw 'Backend HEAD mismatch.'}
  Write-Host "EXACT_BACKEND_READWRITE_SOURCE=$BackendSha"

  & gh repo clone resonance36912-cell/resonance-hub $hub -- --no-tags
  if($LASTEXITCODE -ne 0){throw 'Hub clone failed.'}
  & $git -C $hub checkout --detach $HubSha
  if($LASTEXITCODE -ne 0){throw 'Hub exact-head checkout failed.'}
  if((& $git -C $hub rev-parse HEAD).Trim() -ne $HubSha){throw 'Hub HEAD mismatch.'}
  Write-Host "EXACT_HUB_READWRITE_SOURCE=$HubSha"

  $pythonVersion=$null
  foreach($candidate in @('3.13','3.12','3.11','3.10')){
    & $py "-$candidate" -c "import sys; assert sys.version_info[:2] == tuple(map(int, '$candidate'.split('.')))" 2>$null
    if($LASTEXITCODE -eq 0){$pythonVersion=$candidate;break}
  }
  if(-not $pythonVersion){throw 'No supported Python 3.10-3.13 installation available.'}
  & $py "-$pythonVersion" -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Python venv creation failed.'}
  $python=Join-Path $venv 'Scripts\python.exe'
  & $python -m pip install --disable-pip-version-check -r (Join-Path $backend 'requirements-dev.txt')
  if($LASTEXITCODE -ne 0){throw 'Backend dependency install failed.'}

  & $containerCli image inspect postgres:16.6-alpine *> $null
  if($LASTEXITCODE -ne 0){throw 'Local postgres:16.6-alpine image is unavailable; refusing to pull or touch the live database.'}
  $env:POSTGRES_PASSWORD=$dbPassword
  $portMap=("127.0.0.1:" + $pgPort + ":5432")
  $containerId=(& $containerCli run --rm -d --name $containerName -e POSTGRES_USER=resonance -e POSTGRES_PASSWORD -e POSTGRES_DB=resonance -p $portMap postgres:16.6-alpine).Trim()
  if($LASTEXITCODE -ne 0 -or -not $containerId){throw 'Disposable Postgres container failed to start.'}
  $containerStarted=$true

  for($i=1;$i -le 60;$i++){
    Start-Sleep -Milliseconds 500
    & $containerCli exec $containerName pg_isready -U resonance -d resonance *> $null
    if($LASTEXITCODE -eq 0){break}
    if($i -eq 60){throw 'Disposable Postgres did not become ready.'}
  }
  Write-Host 'RONSAS_DISPOSABLE_POSTGRES_READY=1'

  $bootstrap=@'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
'@
  Invoke-PsqlText $bootstrap
  Invoke-PsqlFile (Join-Path $backend 'apps\rons-hub-backend\003_user_roles.sql')
  Invoke-PsqlFile (Join-Path $hub 'supabase\migrations\20260919220000_nova_project_graph.sql')
  Invoke-PsqlFile (Join-Path $hub 'supabase\migrations\20260920230000_datanest_memory_foundation.sql')
  Write-Host 'RONSAS_ISOLATED_SCHEMA_READY=1'

  $env:AUTH_DB=$authDb
  $env:AUTH_SIGNING_KEY_FILE=$authSigningFile
  $env:AUTH_EXCHANGE_KEY_FILE=$authExchangeFile
  $authOut=Join-Path $root 'auth.out.log'
  $authErr=Join-Path $root 'auth.err.log'
  $authProc=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app:app','--host','127.0.0.1','--port',[string]$authPort) -WorkingDirectory (Join-Path $backend 'services\auth') -RedirectStandardOutput $authOut -RedirectStandardError $authErr -PassThru -WindowStyle Hidden
  Wait-Http "http://127.0.0.1:$authPort/health" '200' $authProc

  $env:DATABASE_URL="postgresql://resonance@127.0.0.1:$pgPort/resonance"
  $env:POSTGRES_PASSWORD_FILE=$dbPasswordFile
  $env:GATEWAY_PROCEDURE_KEY_FILE=$procedureKeyFile
  $env:AUTH_URL="http://127.0.0.1:$authPort"
  $gatewayOut=Join-Path $root 'gateway.out.log'
  $gatewayErr=Join-Path $root 'gateway.err.log'
  $gatewayProc=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app:app','--host','127.0.0.1','--port',[string]$gatewayPort) -WorkingDirectory (Join-Path $backend 'services\gateway') -RedirectStandardOutput $gatewayOut -RedirectStandardError $gatewayErr -PassThru -WindowStyle Hidden
  Wait-Http "http://127.0.0.1:$gatewayPort/health" '200' $gatewayProc

  $email=("ronsas-db-" + $env:GITHUB_RUN_ID + "-" + $env:GITHUB_RUN_ATTEMPT + "@example.invalid").ToLowerInvariant()
  $password=("Ronsas!" + [guid]::NewGuid().ToString('N'))
  $signupBody=@{email=$email;password=$password}|ConvertTo-Json -Compress
  $signup=Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$authPort/v1/auth/sign-up" -ContentType 'application/json' -Body $signupBody
  $userProperty=$signup.PSObject.Properties['user']
  $sessionProperty=$signup.PSObject.Properties['session']
  if(-not $userProperty -or -not $sessionProperty){
    $topLevel=($signup.PSObject.Properties.Name -join ',')
    throw "Ephemeral sovereign signup response is missing user/session. Top-level properties: $topLevel"
  }
  $idProperty=$userProperty.Value.PSObject.Properties['id']
  $tokenProperty=$sessionProperty.Value.PSObject.Properties['access_token']
  if(-not $idProperty -or -not $tokenProperty){throw 'Ephemeral sovereign signup response is missing user.id or session.access_token.'}
  $userId=[string]$idProperty.Value
  $accessToken=[string]$tokenProperty.Value
  if(-not $userId -or -not $accessToken){throw 'Ephemeral sovereign signup did not return an authenticated bearer.'}
  if($userId -notmatch '^[0-9a-fA-F-]{36}$'){throw 'Ephemeral user id is not a UUID.'}
  Invoke-PsqlText "INSERT INTO auth.users(id) VALUES ('$userId'::uuid);"
  Write-Host 'RONSAS_EPHEMERAL_DB_IDENTITY_READY=1'

  $env:VITE_RONS_AUTH_MODE='sovereign'
  $env:RONS_SOVEREIGN_PROXY_ENABLED='1'
  $env:RESONANCE_SOVEREIGN_GATEWAY_URL="http://127.0.0.1:$gatewayPort"
   $env:RESONANCE_SOVEREIGN_AUTH_URL="http://127.0.0.1:$authPort"
  $env:RONS_GATEWAY_PROCEDURE_KEY_FILE=$procedureKeyFile
  $env:RONS_PRODUCTION_AUTH_COOKIE='0'
  $env:RESONANCE_BACKEND_PROVIDER='sovereign'
  $env:HOST='127.0.0.1'
  $env:PORT=[string]$hubPort
  $env:NODE_ENV='production'

  $env:SUPABASE_URL='http://127.0.0.1:54321'
  $env:SUPABASE_PUBLISHABLE_KEY='acceptance-not-a-secret'
  $env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
  $env:VITE_SUPABASE_PUBLISHABLE_KEY='acceptance-not-a-secret'

  Push-Location $hub
  try {
    & $bun install --frozen-lockfile
    if($LASTEXITCODE -ne 0){throw 'Hub frozen install failed.'}
    & $bun run build
    if($LASTEXITCODE -ne 0){throw 'Hub production build failed.'}
    Copy-Item -LiteralPath $HarnessPath -Destination (Join-Path $hub 'sovereign-db-readwrite-acceptance.mjs')
  } finally {Pop-Location}

  $hubOut=Join-Path $root 'hub.out.log'
  $hubErr=Join-Path $root 'hub.err.log'
  $workerDir=Join-Path $hub '.output\server'


  # Wrangler/Cloudflare worker runtime receives configuration through bindings rather than Node process.env.
  # Inject the non-secret local acceptance variables into the generated worker config so the server middleware
  # observes sovereign mode and the exact ephemeral gateway/auth endpoints during the isolated acceptance run.
  $wranglerConfig=Join-Path $workerDir 'wrangler.json'
  $wrangler=(Get-Content -LiteralPath $wranglerConfig -Raw | ConvertFrom-Json)
  if(-not $wrangler.PSObject.Properties['vars']){$wrangler | Add-Member -NotePropertyName vars -NotePropertyValue ([pscustomobject]@{})}
  $wrangler.vars | Add-Member -NotePropertyName VITE_RONS_AUTH_MODE -NotePropertyValue 'sovereign' -Force
  $wrangler.vars | Add-Member -NotePropertyName RONS_SOVEREIGN_PROXY_ENABLED -NotePropertyValue '1' -Force
  $wrangler.vars | Add-Member -NotePropertyName RESONANCE_SOVEREIGN_GATEWAY_URL -NotePropertyValue "http://127.0.0.1:$gatewayPort" -Force
  $wrangler.vars | Add-Member -NotePropertyName RESONANCE_SOVEREIGN_AUTH_URL -NotePropertyValue "http://127.0.0.1:$authPort" -Force
  $wrangler.vars | Add-Member -NotePropertyName RONS_PRODUCTION_AUTH_COOKIE -NotePropertyValue '0' -Force
  $wrangler.vars | Add-Member -NotePropertyName RESONANCE_BACKEND_PROVIDER -NotePropertyValue 'sovereign' -Force
  $wrangler.vars | Add-Member -NotePropertyName HOST -NotePropertyValue '127.0.0.1' -Force
  $wrangler.vars | Add-Member -NotePropertyName PORT -NotePropertyValue ([string]$hubPort) -Force
  $wrangler.vars | Add-Member -NotePropertyName NODE_ENV -NotePropertyValue 'production' -Force
  $wrangler | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $wranglerConfig -Encoding UTF8
  if(-not (Test-Path -LiteralPath (Join-Path $workerDir 'wrangler.json'))){throw 'Generated Wrangler config is missing.'}
  $hubProc=Start-Process -FilePath $bun -ArgumentList @('x','wrangler','dev','--config','wrangler.json','--port',[string]$hubPort,'--ip','127.0.0.1') -WorkingDirectory $workerDir -RedirectStandardOutput $hubOut -RedirectStandardError $hubErr -PassThru -WindowStyle Hidden
  Wait-Http "http://127.0.0.1:$hubPort/" '200' $hubProc

  $env:RONS_ACCEPTANCE_BASE="http://127.0.0.1:$hubPort"
  $env:RONS_ACCEPTANCE_TOKEN=$accessToken
  $env:RONS_ACCEPTANCE_USER_ID=$userId
  Push-Location $hub
  try {
    & $bun (Join-Path $hub 'sovereign-db-readwrite-acceptance.mjs')
    if($LASTEXITCODE -ne 0){throw 'Authenticated sovereign DB harness failed.'}
  } finally {Pop-Location}

  $projectCount=((& $containerCli exec $containerName psql -t -A -U resonance -d resonance -c 'SELECT count(*) FROM nova_projects;') -join '').Trim()
  $artifactCount=((& $containerCli exec $containerName psql -t -A -U resonance -d resonance -c 'SELECT count(*) FROM datanest_artifacts;') -join '').Trim()
  if($projectCount -ne '1'){throw "Expected one isolated Nova project, found $projectCount."}
  if($artifactCount -ne '1'){throw "Expected one isolated DataNest artifact, found $artifactCount."}
  Write-Host 'RONSAS_ISOLATED_DB_COUNTS_PASS=1'
  Write-Host 'RONSAS_AUTHENTICATED_SOVEREIGN_DB_READWRITE_PASS=1'
} catch {
  Write-Host 'RONSAS_AUTHENTICATED_DB_DIAGNOSTICS_BEGIN=1'
  foreach($entry in @(
    @{Name='hub.out';Path=$hubOut},
    @{Name='hub.err';Path=$hubErr},
    @{Name='gateway.out';Path=$gatewayOut},
    @{Name='gateway.err';Path=$gatewayErr},
    @{Name='auth.out';Path=$authOut},
    @{Name='auth.err';Path=$authErr}
  )){
    $logPath=$entry.Path
    if($logPath -and (Test-Path -LiteralPath $logPath)){
      Write-Host "::group::$($entry.Name)"
      Get-Content -LiteralPath $logPath -Tail 200 -ErrorAction SilentlyContinue
      Write-Host '::endgroup::'
    }
  }
  Write-Host 'RONSAS_AUTHENTICATED_DB_DIAGNOSTICS_END=1'
  throw
} finally {
  foreach($proc in @($hubProc,$gatewayProc,$authProc)){
    if($proc -and -not $proc.HasExited){
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      $proc.WaitForExit(5000)|Out-Null
    }
  }
  if($containerStarted){
    & $containerCli rm -f $containerName *> $null
  }
  foreach($name in $old.Keys){[Environment]::SetEnvironmentVariable($name,$old[$name],'Process')}
  if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}
}
