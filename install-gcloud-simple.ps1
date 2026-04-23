# Simple Google Cloud SDK Installer
Write-Host "Firebase Storage CORS Fix - Installing Google Cloud SDK" -ForegroundColor Green

# Download installer
$installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
$installerPath = "$env:TEMP\GoogleCloudSDKInstaller.exe"

Write-Host "Downloading Google Cloud SDK..." -ForegroundColor Blue
try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "Download completed" -ForegroundColor Green
} catch {
    Write-Host "Download failed: $_" -ForegroundColor Red
    Write-Host "Please download manually from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    pause
    exit 1
}

# Install silently
Write-Host "Installing..." -ForegroundColor Blue
try {
    Start-Process -FilePath $installerPath -ArgumentList "/S", "/allusers" -Wait
    Write-Host "Installation completed" -ForegroundColor Green
} catch {
    Write-Host "Installation failed: $_" -ForegroundColor Red
    pause
    exit 1
}

# Clean up
Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Close this PowerShell window"
Write-Host "2. Open a NEW PowerShell window as Administrator"
Write-Host "3. Run: cd 'c:\Users\Admin\windsurf dare\dare-app'"
Write-Host "4. Run: .\deploy-cors.bat"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
