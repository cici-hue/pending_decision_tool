# 安装 Node.js 和 Git 的 PowerShell 脚本
Write-Host "正在检查系统环境..." -ForegroundColor Green

# 检查 winget 是否可用
$wingetExists = Get-Command winget -ErrorAction SilentlyContinue

if ($wingetExists) {
    Write-Host "✓ 找到 winget，开始安装..." -ForegroundColor Green
    
    Write-Host "`n正在安装 Node.js LTS..." -ForegroundColor Cyan
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    
    Write-Host "`n正在安装 Git..." -ForegroundColor Cyan
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    
    Write-Host "`n✓ 安装完成！请重新打开终端验证。" -ForegroundColor Green
    Write-Host "验证命令：" -ForegroundColor Yellow
    Write-Host "  node --version" -ForegroundColor Gray
    Write-Host "  npm --version" -ForegroundColor Gray
    Write-Host "  git --version" -ForegroundColor Gray
} else {
    Write-Host "✗ 未找到 winget" -ForegroundColor Red
    Write-Host "请手动从以下链接下载安装：" -ForegroundColor Yellow
    Write-Host "Node.js: https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" -ForegroundColor Cyan
    Write-Host "Git: https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe" -ForegroundColor Cyan
}

Write-Host "`n按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
