@echo off
title Solo Miner - PC + Celular
cd /d C:\solo-miner

REM ====== CONFIGURACAO ======
REM Endereco Bitcoin SEM sufixo. O programa acrescenta .pc e .cel sozinho.
set BTC_USER=bc1qsynd3t4h72wfk9xyspr78cuekevfggf7c9sc5d

set POOL_HOST=solo.ckpool.org
set POOL_PORT=3333
set LISTEN_PORT=8081

REM Deixe em branco para usar (nucleos - 1). Baixe se o PC ficar lento.
set THREADS=

REM Ponha 1 para esconder as mensagens detalhadas e ver so o painel.
set SILENCIOSO=
REM ==========================

cls
node minerar-tudo.js

echo.
echo ================================================
echo  Encerrado. Esta janela fica aberta para leitura.
echo ================================================
pause
