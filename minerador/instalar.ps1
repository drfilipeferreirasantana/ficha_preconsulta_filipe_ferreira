# Baixa ou atualiza todos os arquivos do minerador em C:\solo-miner.
#
# Resolve de uma vez os tropecos de instalar baixando arquivo por arquivo:
# nada fica na pasta errada, nada ganha .txt no fim do nome, nada chega pela
# metade. Pode rodar quantas vezes quiser - sempre traz a versao mais recente.
#
# Uso, no PowerShell:
#     cd C:\solo-miner
#     .\instalar.ps1

$pasta = "C:\solo-miner"
$base  = "https://raw.githubusercontent.com/drfilipeferreirasantana/" +
         "ficha_preconsulta_filipe_ferreira/claude/mobile-mining-system-d07btq/minerador/"

$arquivos = @(
  "minerar-tudo.js", "minerar-tudo.bat", "LEIA-ME-minerar-tudo.txt",
  "stratum-ws-proxy.js", "miner.html", "miner-pc.js",
  "monitorar-bloco.bat", "alerta-bloco.ps1", "iniciar-proxy.bat"
)

if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
Set-Location $pasta

Write-Host ""
Write-Host "Baixando para $pasta" -ForegroundColor Cyan
Write-Host ("-" * 52)

$erros = 0
foreach ($a in $arquivos) {
  try {
    Invoke-WebRequest -Uri ($base + $a) -OutFile $a -UseBasicParsing -ErrorAction Stop
    $t = (Get-Item $a).Length
    Write-Host ("  ok     {0,-26} {1,8:N0} bytes" -f $a, $t) -ForegroundColor Green
  } catch {
    Write-Host ("  FALHOU {0,-26} {1}" -f $a, $_.Exception.Message) -ForegroundColor Red
    $erros++
  }
}

Write-Host ("-" * 52)

# a biblioteca ws e necessaria ao proxy do celular
if (-not (Test-Path "$pasta\node_modules\ws")) {
  Write-Host "  Instalando a biblioteca ws..." -ForegroundColor Yellow
  npm install ws --silent
}

if ($erros -eq 0) {
  Write-Host ""
  Write-Host "  Tudo pronto." -ForegroundColor Green
  Write-Host "  Abra minerar-tudo.bat, confira a linha do BTC_USER, e de dois cliques."
} else {
  Write-Host ""
  Write-Host "  $erros arquivo(s) falharam. Confira a conexao e rode de novo." -ForegroundColor Red
}
Write-Host ""
