param([string]$Destination = 'E:\Projetos\Barbearia Machado\backups-privados')
$ErrorActionPreference = 'Stop'
$sshKey = Join-Path $env:USERPROFILE '.ssh/machado_contabo_ed25519'
$knownHosts = Join-Path $env:USERPROFILE '.ssh/machado_contabo_known_hosts'
$options = @('-i', $sshKey, '-o', "UserKnownHostsFile=$knownHosts", '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes')
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$checksums = & ssh.exe @options root@45.140.203.243 'cd /opt/machado-app/backups/encrypted && sha256sum machado-*.tar.age'
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar os backups do servidor.' }
foreach ($entry in $checksums) {
    if ($entry -notmatch '^([a-f0-9]{64})  (machado-[0-9]{8}T[0-9]{6}Z\.tar\.age)$') { throw 'Nome de backup inesperado.' }
    $expected = $Matches[1]; $name = $Matches[2]; $target = Join-Path $Destination $name
    if (-not (Test-Path -LiteralPath $target)) {
        & scp.exe @options "root@45.140.203.243:/opt/machado-app/backups/encrypted/$name" "$target.partial"
        if ($LASTEXITCODE -ne 0) { throw 'Falha na transferencia do backup.' }
        Move-Item -LiteralPath "$target.partial" -Destination $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'A verificacao do backup falhou.' }
}
Write-Output 'Copias cifradas verificadas neste computador.'
