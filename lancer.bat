@echo off
rem Lance Radar Afrique (serveur local + analyse des sites web) puis ouvre le navigateur.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080
start "" http://localhost:%PORT%
node server.js
pause
