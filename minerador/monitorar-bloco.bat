@echo off
title Monitor de Bloco - Solo Miner
cd /d C:\solo-miner

echo ================================================
echo  Monitor de Bloco - Solo Miner
echo ================================================
echo  Vigiando    : minerador_log.txt
echo  Procurando  : "BLOCO ENCONTRADO"
echo  Checando    : a cada 10 segundos
echo.
echo  NAO feche esta janela.
echo  Ela precisa do iniciar-proxy.bat rodando em outra janela.
echo ================================================
echo.

if exist minerador_log.txt goto loop
echo  [aviso] minerador_log.txt ainda nao existe.
echo  Isso e normal: o arquivo nasce quando o proxy sobe.
echo  Continuo esperando por ele...
echo.

:loop
if not exist minerador_log.txt goto espera
findstr /C:"BLOCO ENCONTRADO" minerador_log.txt >nul 2>&1
if %errorlevel%==0 goto achou

:espera
timeout /t 10 /nobreak >nul
goto loop

:achou
cls
echo ==================================================
echo     !!!  B L O C O   E N C O N T R A D O  !!!
echo ==================================================
echo.
echo  Linhas do log:
echo  ------------------------------------------------
findstr /C:"BLOCO ENCONTRADO" minerador_log.txt
findstr /C:"hash:" minerador_log.txt
echo  ------------------------------------------------
echo.
echo  Confira tambem a janela do proxy e seu painel no
echo  pool (solo.ckpool.org), pelo seu endereco Bitcoin.
echo ==================================================
echo.

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0alerta-bloco.ps1"

echo.
echo  Alerta concluido. Esta janela fica aberta para registro.
pause
exit /b
