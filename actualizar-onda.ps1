# Actualiza Onda en el teléfono con el último commit de main:
#   1) espera a que termine la compilación (flujo APK) de GitHub Actions para ese commit,
#   2) baja el artefacto Onda-apk (Onda.apk) a una carpeta temporal nueva,
#   3) lo instala con `adb install -r` (conserva los datos de la app).
# Si adb responde INSTALL_FAILED_UPDATE_INCOMPATIBLE se detiene SIN desinstalar nada.
# Requisitos: git, gh (GitHub CLI, ya autenticado con `gh auth login`) y adb, con el teléfono conectado y la depuración USB activada.
# Uso:  .\actualizar-onda.ps1            (no hace commit ni push: eso se hace antes)

param([string]$Repo = "camo043099-eng/reproductor", [int]$MinutosMax = 25, [string]$Rama = "main")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fallar($msg, $codigo = 1) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit $codigo }
foreach ($c in "git", "adb") { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Fallar "No encuentro '$c' en el PATH." } }
# gh: del PATH o, si no está, de su ruta de instalación habitual
$ghExe = "C:\Program Files\GitHub CLI\gh.exe"
if (Get-Command gh -ErrorAction SilentlyContinue) { $ghExe = (Get-Command gh).Source } elseif (-not (Test-Path $ghExe)) { Fallar "No encuentro gh (GitHub CLI)." }
function gh { & $ghExe @args }

# 1) commit de main que hay que instalar
git fetch -q origin $Rama
$sha = (git rev-parse origin/$Rama).Trim()
$corto = $sha.Substring(0, 7)
Write-Host "Commit de $Rama en GitHub: $corto"
if ((git rev-parse HEAD).Trim() -ne $sha) { Write-Host "AVISO: tu rama local no está en ese commit (hay algo sin subir o sin traer). Se instalará lo que hay en GitHub." -ForegroundColor Yellow }

# 2) esperar la compilación de ese commit
$limite = (Get-Date).AddMinutes($MinutosMax); $run = $null
while ((Get-Date) -lt $limite) {
    $lista = gh run list --repo $Repo --branch $Rama --commit $sha --limit 1 --json "databaseId,status,conclusion" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { Fallar "gh no pudo consultar las compilaciones (¿sesión iniciada con gh auth login?)." }
    if ($lista) { $run = $lista[0]; if ($run.status -eq "completed") { break } }
    Write-Host ("  esperando la compilación... " + $(if ($run) { $run.status } else { "aún no empieza" }))
    Start-Sleep -Seconds 20
}
if (-not $run -or $run.status -ne "completed") { Fallar "La compilación de $corto no terminó en $MinutosMax minutos." }
if ($run.conclusion -ne "success") { Fallar "La compilación de $corto terminó con '$($run.conclusion)'. Mira: gh run view $($run.databaseId) --repo $Repo --log-failed" }
Write-Host "Compilación correcta (run $($run.databaseId))."

# 3) bajar Onda.apk a una carpeta nueva y vacía
$dir = Join-Path $env:TEMP ("onda-apk-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $dir | Out-Null
gh run download $run.databaseId --repo $Repo --name Onda-apk --dir $dir
$apk = Join-Path $dir "Onda.apk"
if (-not (Test-Path $apk)) { Fallar "El artefacto no trae Onda.apk (carpeta: $dir)." }
Write-Host ("Descargado: {0} ({1:N1} MB)" -f $apk, ((Get-Item $apk).Length / 1MB))

# 4) teléfono conectado
$dispositivos = @(adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" })
if ($dispositivos.Count -ne 1) { Fallar "Debe haber exactamente un teléfono conectado y autorizado; adb ve $($dispositivos.Count)." }

# 5) instalar encima (-r conserva datos). Sin desinstalar nunca.
$salida = (adb install -r $apk 2>&1 | Out-String).Trim()
Write-Host $salida
if ($salida -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
    Write-Host "DETENIDO: la firma del APK no coincide con la de la app instalada. No se desinstaló nada." -ForegroundColor Yellow
    Write-Host "Para seguir habría que desinstalar Onda (se perderían sus datos): decídelo tú." -ForegroundColor Yellow
    exit 2
}
if ($salida -notmatch "Success") { Fallar "adb no confirmó la instalación." }
Write-Host "Onda $corto instalada en el teléfono." -ForegroundColor Green
