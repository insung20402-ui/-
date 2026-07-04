# 최신 버전 마인크래프트 서버를 자동으로 받아서 실행합니다. (Windows PowerShell)
# 요구사항: Java 21 이상 (https://adoptium.net)

Set-Location $PSScriptRoot

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Host "Java가 설치되어 있지 않습니다. https://adoptium.net 에서 Java 21(LTS) 이상을 설치한 뒤 다시 실행하세요."
    exit 1
}

if (-not (Test-Path "server.jar")) {
    Write-Host "최신 버전 정보를 확인하는 중..."
    $manifest = Invoke-RestMethod -Uri "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
    $latestId = $manifest.latest.release
    $versionEntry = $manifest.versions | Where-Object { $_.id -eq $latestId } | Select-Object -First 1
    Write-Host "최신 버전: $latestId"

    $versionJson = Invoke-RestMethod -Uri $versionEntry.url
    $serverUrl = $versionJson.downloads.server.url

    Write-Host "서버 파일 다운로드 중..."
    Invoke-WebRequest -Uri $serverUrl -OutFile "server.jar"
}

Set-Content -Path "eula.txt" -Value "eula=true"

if (-not (Test-Path "server.properties")) {
    @"
motd=A Minecraft Server
difficulty=normal
gamemode=survival
max-players=20
online-mode=true
"@ | Set-Content -Path "server.properties"
}

Write-Host "서버를 시작합니다. (종료하려면 콘솔에 stop 입력)"
java -Xms1G -Xmx2G -jar server.jar nogui
