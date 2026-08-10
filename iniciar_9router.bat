@echo off
title 9Router - Mentor IA
color 0A

echo ==========================================
echo          9ROUTER - MENTOR IA
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado.
    echo Instale o Node.js 20 ou superior e tente novamente.
    echo.
    pause
    exit /b 1
)

where 9router >nul 2>nul
if errorlevel 1 (
    echo [AVISO] 9Router nao esta instalado.
    echo Instalando 9Router...
    call npm install -g 9router
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao instalar o 9Router.
        pause
        exit /b 1
    )
)

echo [OK] Node.js encontrado.
echo [OK] 9Router encontrado.
echo.
echo Iniciando 9Router...
echo Dashboard: http://localhost:20128
echo.
echo NAO feche esta janela enquanto estiver usando o 9Router.
echo.

9router

echo.
echo ==========================================
echo 9Router foi encerrado.
echo ==========================================
pause
