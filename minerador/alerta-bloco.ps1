# Alerta sonoro + visual de bloco encontrado.
# Chamado pelo monitorar-bloco.bat. Nao usa msg.exe (ausente no Windows Home):
# usa MessageBox do .NET, que existe em toda edicao do Windows.

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Drawing          -ErrorAction SilentlyContinue

# --- a melodia -------------------------------------------------------------
# Pares (frequencia em Hz, duracao em ms). Fanfarra de vitoria estilo RPG,
# seguida do "1-up" do Mario: subida rapida que ninguem confunde com erro.
$fanfarra = @(
  @(523,130), @(523,130), @(523,130), @(523,400),
  @(415,400), @(466,400),
  @(523,190), @(466,190), @(523,800)
)
$umUp = @(
  @(659,130), @(784,130), @(1319,130),
  @(1047,130), @(1175,130), @(1568,420)
)

function Toca($notas) {
  foreach ($n in $notas) {
    try { [console]::Beep($n[0], $n[1]) }
    catch { Start-Sleep -Milliseconds $n[1] }   # sem alto-falante: só espera
  }
}

function Alerta {
  # som do sistema primeiro: se o Beep nao funcionar nesta maquina,
  # ao menos isso toca pela placa de som
  try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}
  Start-Sleep -Milliseconds 250
  Toca $fanfarra
  Start-Sleep -Milliseconds 200
  Toca $umUp
}

# Toca tres vezes antes de abrir a janela, para dar tempo de ouvir de longe.
1..3 | ForEach-Object {
  Alerta
  Start-Sleep -Milliseconds 400
}

# --- a janela --------------------------------------------------------------
$texto = @"
BLOCO ENCONTRADO!

O minerador submeteu um hash abaixo do alvo real da rede
Bitcoin, e nao apenas um share do pool.

O que fazer agora:
  1. NAO feche a janela do proxy.
  2. Confira o arquivo minerador_log.txt (linha "hash:").
  3. Confira seu painel no pool (solo.ckpool.org) pelo
     seu endereco Bitcoin.

A confirmacao definitiva e a do pool e da rede.
"@

try {
  [System.Windows.Forms.MessageBox]::Show(
    $texto, 'BLOCO ENCONTRADO - Solo Miner',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
} catch {
  Write-Host $texto
}

# Mais uma rodada depois de fechar a janela, caso tenha fechado sem ler.
Alerta
