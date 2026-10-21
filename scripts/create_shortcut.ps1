# Cria (ou recria) o atalho "Claude Office" na área de trabalho, com o ícone do projeto.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\create_shortcut.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "Claude Office.lnk"
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = Join-Path $root "run.bat"
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root "static\icon.ico") + ",0"
$s.WindowStyle = 7
$s.Description = "Claude Office: escritório ao vivo das sessões do Claude Code"
$s.Save()
Write-Output "Atalho criado: $lnk"
