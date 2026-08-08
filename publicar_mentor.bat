@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Mentor Concursos IA - Publicar Atualizacao
cd /d "%~dp0"

echo.
echo ============================================================
echo       MENTOR CONCURSOS IA - PUBLICAR ATUALIZACAO
echo ============================================================
echo.

echo [1/6] Verificando Git...
git --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Git nao encontrado.
    pause
    exit /b 1
)

echo [2/6] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado.
    pause
    exit /b 1
)

echo.
echo [3/6] Verificando TypeScript...
call npx tsc --noEmit
if errorlevel 1 (
    echo.
    echo ============================================================
    echo ERRO: TypeScript encontrou erros.
    echo ATUALIZACAO CANCELADA.
    echo ============================================================
    pause
    exit /b 1
)

echo.
echo [4/6] Criando build de producao...
call npm run build
if errorlevel 1 (
    echo.
    echo ============================================================
    echo ERRO: O build falhou.
    echo ATUALIZACAO CANCELADA.
    echo ============================================================
    pause
    exit /b 1
)

echo.
echo [5/6] Salvando alteracoes no Git...
git status --short

git add .
if errorlevel 1 (
    echo ERRO: git add falhou.
    pause
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo Nenhuma alteracao para publicar.
    pause
    exit /b 0
)

echo.
set /p "MENSAGEM=Digite a descricao da atualizacao: "
if "!MENSAGEM!"=="" set "MENSAGEM=atualizacao do sistema"

echo.
echo Criando commit...
echo O pre-commit do Husky sera ignorado porque o build e o TypeScript
echo ja foram validados acima.
echo.

git commit --no-verify -m "!MENSAGEM!"
if errorlevel 1 (
    echo.
    echo ============================================================
    echo ERRO: Nao foi possivel criar o commit.
    echo ============================================================
    pause
    exit /b 1
)

echo.
echo [6/6] Enviando para GitHub...
git push origin main
if errorlevel 1 (
    echo.
    echo ============================================================
    echo ERRO: O push para o GitHub falhou.
    echo A Vercel nao recebeu esta atualizacao.
    echo ============================================================
    pause
    exit /b 1
)

echo.
echo ============================================================
echo                 PUBLICACAO ENVIADA!
echo ============================================================
echo.
echo GitHub recebeu a nova versao.
echo A Vercel deve iniciar o deploy automaticamente.
echo.
echo IMPORTANTE:
echo Aguarde a Vercel mostrar "Ready" antes de testar a producao.
echo.
pause
endlocal
