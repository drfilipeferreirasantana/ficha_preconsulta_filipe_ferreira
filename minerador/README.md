# Minerador Solo — PC + Celular

Sistema de mineração solo de Bitcoin que soma a força do computador e a do
celular, ambos para o mesmo endereço.

## Instalar ou atualizar

No PowerShell, um comando só:

```powershell
cd C:\solo-miner
irm "https://raw.githubusercontent.com/drfilipeferreirasantana/ficha_preconsulta_filipe_ferreira/claude/mobile-mining-system-d07btq/minerador/instalar.ps1" | iex
```

Baixa tudo direto para a pasta certa. Pode rodar quantas vezes quiser — sempre
traz a versão mais recente. Resolve de uma vez os tropeços de baixar arquivo
por arquivo: nada fica na pasta errada, nada ganha `.txt` no fim do nome.

## Usar

1. Abra `minerar-tudo.bat` e confira a linha do `BTC_USER` — o endereço vai
   **sem sufixo**, o programa acrescenta `.pc` e `.cel` sozinho.
2. Dois cliques em `minerar-tudo.bat`.
3. Anote o IP que aparecer na tela.
4. No celular, mesma rede Wi-Fi: `http://SEU_IP:8081/`
5. Na página: proxy `ws://SEU_IP:8081/ws`, endereço terminado em `.cel`.

## Os arquivos

| Arquivo | O que faz |
|---|---|
| `minerar-tudo.js` | Liga as duas frentes e soma no painel |
| `minerar-tudo.bat` | Atalho de clique duplo |
| `miner-pc.js` | Mina no computador (WASM SIMD, Stratum por TCP) |
| `stratum-ws-proxy.js` | Serve a página e faz a ponte para o celular; detecta bloco |
| `miner.html` | A página que o celular abre |
| `monitorar-bloco.bat` | Vigia o log e alerta com som se achar bloco |
| `alerta-bloco.ps1` | O alerta sonoro e visual |
| `iniciar-proxy.bat` | Só o proxy, sem o minerador do PC |
| `instalar.ps1` | Baixa ou atualiza tudo |

## Honestidade sobre as chances

Encontrar um bloco solo com esta potência é estatisticamente quase impossível.
O valor deste projeto está no que foi construído e aprendido, não no prêmio.

Há declaração datada e pública sobre isso em
[`declaracao/`](../declaracao/), registrada antes de qualquer resultado.
