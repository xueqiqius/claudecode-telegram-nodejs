@echo off
:: Claude Code Stop Hook Wrapper for Windows
:: This wrapper ensures node.js can be found when Claude Code runs the hook

node "%~dp0send-to-telegram.js"
