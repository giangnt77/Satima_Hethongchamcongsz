$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$defaultUrl = 'https://script.google.com/macros/s/AKfycbzxUGL7Dbv3UnVzeeMziD-D00GCkie_fcNRHerdwmI_IY4n7D4LEhh4X7t7j-CDYHa_/exec'
$licenseUrl = (Read-Host "URL License Server (bam Enter de dung URL mac dinh)").Trim()
if (-not $licenseUrl) { $licenseUrl = $defaultUrl }
if ($licenseUrl -notmatch '^https://script\.google\.com/macros/s/[\w-]+/exec$') {
  throw 'URL khong dung dinh dang. Phai la https://script.google.com/macros/s/.../exec'
}

$secure = Read-Host 'Dan SATIMA_LICENSE_SECRET (o nhap an, dan xong nhan Enter)' -AsSecureString
$secret = (New-Object System.Net.NetworkCredential('', $secure)).Password.Trim()
if ($secret.Length -lt 20) {
  throw "Khoa ky bi rong hoac qua ngan (do dai: $($secret.Length)). Hay copy lai tu menu 'Hien khoa ky' va dan lai."
}
Write-Host "Da nhan khoa ky (do dai $($secret.Length) ky tu)." -ForegroundColor Cyan

try {
  $env:SATIMA_LICENSE_URL = $licenseUrl
  $env:SATIMA_LICENSE_SECRET = $secret
  npm run release:gas
  if ($LASTEXITCODE -ne 0) { throw 'Build that bai.' }
  $manifest = Get-Content 'dist\satima-gas-release\appsscript.json' -Raw
  if ($manifest -notmatch 'external_request') { throw 'Goi build khong co kiem tra giay phep.' }
  Write-Host 'XONG: ban cong dong co kiem tra giay phep tai dist\satima-gas-release' -ForegroundColor Green
}
finally {
  Remove-Item Env:SATIMA_LICENSE_URL, Env:SATIMA_LICENSE_SECRET -ErrorAction SilentlyContinue
}
