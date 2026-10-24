<#
.SYNOPSIS
  Coleta os videos mais recentes de canais do YouTube sobre IA e tecnologia
  e gera um relatorio HTML (e um CSV) com as novidades.

.DESCRIPTION
  Usa o feed RSS publico de cada canal (youtube.com/feeds/videos.xml), entao
  nao precisa de API key. O ID de cada canal e descoberto a partir do @handle
  na primeira execucao e guardado em cache (youtube-canais-cache.json).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\coletar-youtube-noticias.ps1

.EXAMPLE
  # Ultimos 7 dias, so videos que citam esses termos, sem abrir o navegador
  .\coletar-youtube-noticias.ps1 -Dias 7 -Palavras "GPT","Claude","Gemini" -NaoAbrir
#>
[CmdletBinding()]
param(
    [int]$Dias = 3,
    [string[]]$Palavras = @(),
    [string]$PastaSaida = (Join-Path $PSScriptRoot "saida"),
    [string]$ArquivoCanais = (Join-Path $PSScriptRoot "canais-youtube.txt"),
    [switch]$NaoAbrir
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 ainda nasce sem TLS 1.2 habilitado
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Canais padrao: "Categoria|@handle". Para trocar, crie canais-youtube.txt
# ao lado do script com o mesmo formato (uma linha por canal, # comenta).
$CanaisPadrao = @(
    "IA|@aiexplained-official"
    "IA|@TwoMinutePapers"
    "IA|@matthew_berman"
    "IA|@mreflow"
    "IA|@WesRoth"
    "IA|@TheAIGRID"
    "IA|@YannicKilcher"
    "IA|@OpenAI"
    "IA|@GoogleDeepMind"
    "IA|@anthropic-ai"
    "Tech|@Fireship"
    "Tech|@TheVerge"
    "Tech|@mkbhd"
    "Tech|@LinusTechTips"
    "Tech|@CNET"
    "Tech BR|@canaltech"
    "Tech BR|@TecMundo"
    "Tech BR|@olhardigital"
)

$UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
$CacheFile = Join-Path $PSScriptRoot "youtube-canais-cache.json"

function Get-Utf8 {
    param([string]$Url)
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -UserAgent $UserAgent -TimeoutSec 30 `
        -Headers @{ "Accept-Language" = "pt-BR,pt;q=0.9,en;q=0.8"; "Cookie" = "CONSENT=YES+1" }
    # Decodifica manualmente: o 5.1 as vezes erra o charset e quebra os acentos
    [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
}

function Read-Canais {
    $linhas = if (Test-Path $ArquivoCanais) { Get-Content $ArquivoCanais -Encoding UTF8 } else { $CanaisPadrao }
    foreach ($l in $linhas) {
        $l = $l.Trim()
        if (-not $l -or $l.StartsWith("#")) { continue }
        $partes = $l -split "\|", 2
        if ($partes.Count -eq 2) { [pscustomobject]@{ Categoria = $partes[0].Trim(); Handle = $partes[1].Trim() } }
        else { [pscustomobject]@{ Categoria = "Geral"; Handle = $partes[0] } }
    }
}

function Resolve-ChannelId {
    param([string]$Handle, [hashtable]$Cache)
    if ($Handle -match '^UC[\w-]{22}$') { return $Handle }
    if ($Cache.ContainsKey($Handle)) { return $Cache[$Handle] }
    $h = if ($Handle.StartsWith("@")) { $Handle } else { "@$Handle" }
    $html = Get-Utf8 "https://www.youtube.com/$h"
    $m = [regex]::Match($html, '<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"')
    if (-not $m.Success) { $m = [regex]::Match($html, '"(?:externalId|channelId)":"(UC[\w-]{22})"') }
    if (-not $m.Success) { throw "nao achei o ID do canal $h" }
    $Cache[$Handle] = $m.Groups[1].Value
    return $m.Groups[1].Value
}

function HtmlEnc([string]$s) { [System.Net.WebUtility]::HtmlEncode($s) }

# --- cache de IDs ---
$cache = @{}
if (Test-Path $CacheFile) {
    (Get-Content $CacheFile -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
        ForEach-Object { $cache[$_.Name] = $_.Value }
}

$limite = (Get-Date).ToUniversalTime().AddDays(-$Dias)
$videos = New-Object System.Collections.Generic.List[object]
$falhas = @()

foreach ($canal in Read-Canais) {
    try {
        $id = Resolve-ChannelId -Handle $canal.Handle -Cache $cache
        [xml]$feed = Get-Utf8 "https://www.youtube.com/feeds/videos.xml?channel_id=$id"
        $nomeCanal = $feed.feed.title
        $novos = 0
        foreach ($e in @($feed.feed.entry)) {
            if (-not $e) { continue }
            $pub = [DateTime]::Parse($e.published, [Globalization.CultureInfo]::InvariantCulture,
                [Globalization.DateTimeStyles]::AdjustToUniversal)
            if ($pub -lt $limite) { continue }

            $titulo = [string]$e.title
            $descricao = [string]$e.group.description
            if ($Palavras.Count -gt 0) {
                $texto = "$titulo $descricao"
                if (-not ($Palavras | Where-Object { $texto -match [regex]::Escape($_) })) { continue }
            }

            $views = 0
            try { $views = [int64]$e.group.community.statistics.views } catch {}
            $videos.Add([pscustomobject]@{
                Publicado = $pub.ToLocalTime()
                Categoria = $canal.Categoria
                Canal     = $nomeCanal
                Titulo    = $titulo
                Url       = "https://www.youtube.com/watch?v=$($e.videoId)"
                Thumb     = "https://i.ytimg.com/vi/$($e.videoId)/mqdefault.jpg"
                Views     = $views
                Descricao = if ($descricao.Length -gt 280) { $descricao.Substring(0, 280) + "..." } else { $descricao }
            })
            $novos++
        }
        Write-Host ("[ok]    {0,-28} {1} video(s)" -f $canal.Handle, $novos) -ForegroundColor Green
    }
    catch {
        $falhas += $canal.Handle
        Write-Host ("[falha] {0,-28} {1}" -f $canal.Handle, $_.Exception.Message) -ForegroundColor Yellow
    }
}

$cache | ConvertTo-Json | Set-Content -Path $CacheFile -Encoding UTF8

# --- saida ---
New-Item -ItemType Directory -Force -Path $PastaSaida | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$csv = Join-Path $PastaSaida "youtube-noticias_$stamp.csv"
$html = Join-Path $PastaSaida "youtube-noticias_$stamp.html"

$ordenados = $videos | Sort-Object Publicado -Descending
$ordenados | Select-Object @{ n = "Publicado"; e = { $_.Publicado.ToString("yyyy-MM-dd HH:mm") } }, Categoria, Canal, Titulo, Url, Views |
    Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8 -Delimiter ";"

$cards = foreach ($v in $ordenados) {
    @"
<a class="card" href="$($v.Url)" target="_blank" data-cat="$(HtmlEnc $v.Categoria)">
  <img src="$($v.Thumb)" loading="lazy" alt="">
  <div class="info">
    <span class="tag">$(HtmlEnc $v.Categoria)</span>
    <h3>$(HtmlEnc $v.Titulo)</h3>
    <p class="meta">$(HtmlEnc $v.Canal) &middot; $($v.Publicado.ToString("dd/MM HH:mm")) &middot; $("{0:N0}" -f $v.Views) views</p>
    <p class="desc">$(HtmlEnc $v.Descricao)</p>
  </div>
</a>
"@
}

$categorias = $ordenados | Select-Object -ExpandProperty Categoria -Unique
$botoes = ($categorias | ForEach-Object { "<button onclick=""filtrar('$(HtmlEnc $_)')"">$(HtmlEnc $_)</button>" }) -join ""
$avisoFalhas = if ($falhas) { "<p class='falha'>Canais com falha: $(HtmlEnc ($falhas -join ', '))</p>" } else { "" }

@"
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar IA - YouTube</title>
<style>
  :root { --bg:#0f1115; --card:#181b22; --txt:#e8e8e8; --sub:#9aa0aa; --acc:#4f8cff; }
  body { margin:0; padding:16px; background:var(--bg); color:var(--txt); font-family:Segoe UI,system-ui,sans-serif; }
  h1 { margin:0 0 4px; } .sub { color:var(--sub); margin:0 0 16px; }
  .filtros button { background:var(--card); color:var(--txt); border:1px solid #2a2f3a; border-radius:16px; padding:6px 14px; margin:0 6px 12px 0; cursor:pointer; }
  .filtros button:hover { border-color:var(--acc); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; }
  .card { display:flex; flex-direction:column; background:var(--card); border-radius:10px; overflow:hidden; color:inherit; text-decoration:none; }
  .card:hover { outline:2px solid var(--acc); }
  .card img { width:100%; aspect-ratio:16/9; object-fit:cover; }
  .info { padding:10px 12px; } .info h3 { font-size:15px; margin:6px 0; }
  .tag { font-size:11px; background:var(--acc); color:#fff; padding:2px 8px; border-radius:10px; }
  .meta { color:var(--sub); font-size:12px; margin:0 0 6px; } .desc { color:var(--sub); font-size:12px; margin:0; }
  .falha { color:#f0b429; }
</style></head><body>
<h1>Radar IA &amp; Tech - YouTube</h1>
<p class="sub">$($ordenados.Count) videos dos ultimos $Dias dia(s) &middot; gerado em $(Get-Date -Format "dd/MM/yyyy HH:mm")</p>
$avisoFalhas
<div class="filtros"><button onclick="filtrar('')">Todos</button>$botoes</div>
<div class="grid">
$($cards -join "`n")
</div>
<script>
function filtrar(c){ document.querySelectorAll('.card').forEach(e => e.style.display = (!c || e.dataset.cat === c) ? '' : 'none'); }
</script>
</body></html>
"@ | Set-Content -Path $html -Encoding UTF8

Write-Host ""
Write-Host "$($ordenados.Count) video(s) encontrados nos ultimos $Dias dia(s)." -ForegroundColor Cyan
Write-Host "HTML: $html"
Write-Host "CSV : $csv"
if (-not $NaoAbrir -and $ordenados.Count -gt 0) { Start-Process $html }
