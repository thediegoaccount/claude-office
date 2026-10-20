# Instala (ou remove com -Uninstall) o hook de permissão do Claude Office em ~/.claude.
# Copia hooks\office_permission.py para ~/.claude/hooks/ e registra em settings.json,
# preservando os outros hooks e gravando UTF-8 sem BOM.
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "hook_settings.py"
if ($Uninstall) { & python $helper --uninstall } else { & python $helper }
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao atualizar settings.json"; exit 1 }
