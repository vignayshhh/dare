# PowerShell script to install Google Cloud SDK and configure CORS
Write-Host "🚀 Installing Google Cloud SDK for Firebase Storage CORS configuration..." -ForegroundColor Green

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "⚠️  This script requires administrator privileges. Please run as Administrator." -ForegroundColor Yellow
    $response = Read-Host "Continue anyway? (y/n)"
    if ($response -ne "y") {
        exit 1
    }
}

# Download and install Google Cloud SDK
$installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
$installerPath = "$env:TEMP\GoogleCloudSDKInstaller.exe"

Write-Host "📥 Downloading Google Cloud SDK..." -ForegroundColor Blue
try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "✅ Download completed" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to download Google Cloud SDK" -ForegroundColor Red
    Write-Host "Please download manually from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Run installer silently
Write-Host "🔧 Installing Google Cloud SDK..." -ForegroundColor Blue
try {
    Start-Process -FilePath $installerPath -ArgumentList "/S", "/allusers" -Wait
    Write-Host "✅ Installation completed" -ForegroundColor Green
} catch {
    Write-Host "❌ Installation failed. Please run the installer manually." -ForegroundColor Red
    exit 1
}

# Add to PATH
$gcloudPath = "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin"
if ($env:PATH -notlike "*$gcloudPath*") {
    [Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";$gcloudPath", "Machine")
    Write-Host "✅ Added to PATH" -ForegroundColor Green
}

# Clean up
Remove-Item $installerPath -Force

Write-Host ""
Write-Host "🎉 Google Cloud SDK installation completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart your terminal/PowerShell" -ForegroundColor White
Write-Host "2. Run: gcloud init" -ForegroundColor White
Write-Host "3. Run: gcloud auth login" -ForegroundColor White
Write-Host "4. Run: .\deploy-cors.bat" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
