@echo off
title Solo Miner Proxy
cd /d C:\solo-miner
set POOL_HOST=solo.ckpool.org
set POOL_PORT=3333
set LISTEN_PORT=8081

echo ================================================
echo  Iniciando proxy Solo Miner...
echo ================================================
echo.
echo  IPs deste PC - use o que comeca com 192.168
echo ------------------------------------------------
ipconfig | findstr /C:"IPv4"
echo ------------------------------------------------
echo.
echo  No celular, abra no Safari:  http://SEU_IP:8081/
echo  Campo "proxy" do app:        ws://SEU_IP:8081/ws
echo  (troque SEU_IP por um dos numeros acima, ex: 192.168.15.3)
echo.
echo  NAO FECHE esta janela enquanto estiver minerando
echo ================================================
echo.
node stratum-ws-proxy.js
pause
