$ErrorActionPreference = 'Stop'
$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$buildDir = Join-Path $desktopRoot 'build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$iconSource = Join-Path $repoRoot 'extension/icon128.png'
$iconTarget = Join-Path $buildDir 'app.ico'
if (-not (Test-Path $iconSource)) { throw "Ícone da extensão não encontrado: $iconSource" }
if (-not (Test-Path $iconTarget)) { throw "Ícone do aplicativo não encontrado: $iconTarget" }

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.Clear([System.Drawing.Color]::FromArgb(11, 15, 18))
$green = [System.Drawing.Color]::FromArgb(89, 211, 125)
$white = [System.Drawing.Color]::FromArgb(240, 246, 242)
$muted = [System.Drawing.Color]::FromArgb(164, 179, 169)
$logo = [System.Drawing.Image]::FromFile($iconSource)
$graphics.DrawImage($logo, 47, 34, 70, 70)
$logo.Dispose()
$titleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 12, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font('Segoe UI', 8.5, [System.Drawing.FontStyle]::Regular)
$smallFont = New-Object System.Drawing.Font('Segoe UI', 7.5, [System.Drawing.FontStyle]::Regular)
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$greenBrush = New-Object System.Drawing.SolidBrush($green)
$mutedBrush = New-Object System.Drawing.SolidBrush($muted)
$graphics.DrawString('LOVABLE CHAT', $titleFont, $whiteBrush, 17, 125)
$graphics.DrawString('ASSISTANT', $titleFont, $greenBrush, 32, 145)
$graphics.DrawLine((New-Object System.Drawing.Pen($green, 2)), 35, 178, 129, 178)
$graphics.DrawString('Seu projeto,', $bodyFont, $whiteBrush, 31, 200)
$graphics.DrawString('rodando localmente.', $bodyFont, $whiteBrush, 15, 219)
$graphics.DrawString('PREVIA rapida e segura', $smallFont, $mutedBrush, 19, 252)
$graphics.DrawString('no seu computador.', $smallFont, $mutedBrush, 30, 267)
$bitmap.Save((Join-Path $buildDir 'installerSidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$whiteBrush.Dispose(); $greenBrush.Dispose(); $mutedBrush.Dispose()
$titleFont.Dispose(); $bodyFont.Dispose(); $smallFont.Dispose()
$graphics.Dispose(); $bitmap.Dispose()
Write-Output "Recursos visuais gerados em $buildDir"
