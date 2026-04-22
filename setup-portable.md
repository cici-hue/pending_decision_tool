# 免管理员权限安装方案

## 方案：使用便携版（Portable）工具

### 1. 下载便携版 Node.js
**下载链接：**
- https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip

**安装步骤：**
1. 下载 ZIP 文件
2. 解压到 `C:\Users\%USERNAME%\tools\nodejs\`
3. 添加环境变量：
   ```powershell
   # 在 PowerShell 中运行
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\$env:USERNAME\tools\nodejs", "User")
   ```

### 2. 下载便携版 Git
**下载链接：**
- https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/PortableGit-2.43.0-64-bit.7z.exe

**安装步骤：**
1. 下载并运行自解压文件
2. 解压到 `C:\Users\%USERNAME%\tools\git\`
3. 添加环境变量：
   ```powershell
   # 在 PowerShell 中运行
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\$env:USERNAME\tools\git\bin", "User")
   ```

### 3. 使用 nvm-windows（Node 版本管理器）
**下载链接：**
- https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.exe

### 4. 验证安装
重新打开终端后运行：
```bash
node --version
npm --version
git --version
```

---

## 推荐：最简单的方法

如果上述方法太复杂，建议：

1. **下载并安装 VS Code**（自带 Git）：
   - https://code.visualstudio.com/docs/?dv=win64user

2. **使用 VS Code 的集成终端**运行 Git 命令

3. **Node.js 仍然需要单独安装**
