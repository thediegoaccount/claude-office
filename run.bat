@echo off
title Claude Office
cd /d "%~dp0"
python server.py --abrir %*
