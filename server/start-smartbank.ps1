
$ErrorActionPreference = "Stop"

$serverDir = $PSScriptRoot
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$target = "http://localhost:4000"
$envPath = Join-Path $serverDir ".env"
$logDir = Join-Path $serverDir "tunnel-logs"
$urlFile = Join-Path $serverDir "current-tunnel-url.txt"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (!(Test-Path $cloudflared)) {
    throw "cloudflared.exe nahi mila: $cloudflared"
}

if (!(Test-Path $envPath)) {
    throw ".env file nahi mili: $envPath"
}

function Update-FrontendOrigin($url) {
    $content = [System.IO.File]::ReadAllText($envPath)

    if ($content -match '(?m)^FRONTEND_ORIGINS=.*$') {
        $content = [regex]::Replace(
            $content,
            '(?m)^FRONTEND_ORIGINS=.*$',
            "FRONTEND_ORIGINS=$url"
        )
    }
    else {
        $content = $content.TrimEnd() + "`r`nFRONTEND_ORIGINS=$url`r`n"
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envPath, $content, $encoding)
    [System.IO.File]::WriteAllText($urlFile, $url, $encoding)

    Write-Host "Updated .env: $url" -ForegroundColor Green
}

function Start-Backend {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $logDir "$stamp-backend-out.log"
    $errLog = Join-Path $logDir "$stamp-backend-error.log"

    Write-Host "Starting Node.js backend..." -ForegroundColor Cyan

    return Start-Process `
        -FilePath $env:ComSpec `
        -ArgumentList "/c npm start" `
        -WorkingDirectory $serverDir `
        -PassThru `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog
}

while ($true) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $logDir "$stamp-out.log"
    $errLog = Join-Path $logDir "$stamp-error.log"

    Write-Host "`nStarting Cloudflare Tunnel (HTTP/2)..." -ForegroundColor Cyan

    $tunnel = Start-Process `
        -FilePath $cloudflared `
        -ArgumentList "tunnel --protocol http2 --url $target" `
        -PassThru `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog

    $url = $null
    $deadline = (Get-Date).AddSeconds(90)

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $tunnel.Refresh()

        if ($tunnel.HasExited) {
            break
        }

        $logs = ""
        if (Test-Path $outLog) {
            $logs += Get-Content $outLog -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path $errLog) {
            $logs += Get-Content $errLog -Raw -ErrorAction SilentlyContinue
        }

        if ($logs -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $url = $Matches[0]
            break
        }
    }

    if (!$url) {
        Write-Host "Tunnel URL nahi mila. Restarting..." -ForegroundColor Yellow

        if (!$tunnel.HasExited) {
            Stop-Process -Id $tunnel.Id -Force
        }

        Start-Sleep -Seconds 5
        continue
    }

    Update-FrontendOrigin $url

    Write-Host "`nYour Smart Bank URL:" -ForegroundColor Green
    Write-Host $url -ForegroundColor Yellow

    $backend = Start-Backend

    while ($true) {
        Start-Sleep -Seconds 5
        $tunnel.Refresh()
        $backend.Refresh()

        if ($tunnel.HasExited) {
            Write-Host "Tunnel stopped. Restarting..." -ForegroundColor Yellow
            break
        }

        if ($backend.HasExited) {
            Write-Host "Backend stopped. Restarting backend..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
            $backend = Start-Backend
        }
    }

    if (!$backend.HasExited) {
        & taskkill.exe /PID $backend.Id /T /F | Out-Null
    }

    Start-Sleep -Seconds 5
}
