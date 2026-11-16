@echo off
chcp 65001 >nul
REM ============================================================================
REM  STL Party - demarrage du jeu (hors ligne)
REM ============================================================================
setlocal
pushd "%~dp0"

REM --- Environnement Conda (conda env create -f environment.yml, une fois) ---------
call conda activate stl-party

REM --- Hote et port sont lus dans STL_PARTY.toml (section application)
echo Demarrage de STL Party sur http://127.0.0.1:3510 ...
start "" http://localhost:3510
python -m app.main

popd
endlocal
pause
