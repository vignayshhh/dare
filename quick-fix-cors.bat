@echo off
echo ========================================
echo Firebase Storage CORS Quick Fix
echo ========================================
echo.

echo Checking for gsutil...
where gsutil >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ gsutil found
    goto :deploy_cors
)

echo ❌ gsutil not found
echo.
echo Installing Google Cloud SDK...
echo.

REM Download and install Google Cloud SDK
powershell -Command "& {$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe' -OutFile '$env:TEMP\gcloud-installer.exe'; Start-Process -FilePath '$env:TEMP\gcloud-installer.exe' -ArgumentList '/S', '/allusers' -Wait}"

echo.
echo ✅ Google Cloud SDK installed
echo.

REM Add to PATH for current session
set PATH=%PATH%;C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin

:deploy_cors
echo.
echo Deploying CORS configuration...
echo.

gsutil cors set cors.json gs://dare-web-app-61360.firebasestorage.app

if %errorlevel% equ 0 (
    echo.
    echo ✅ CORS configuration deployed successfully!
    echo.
    echo Your Firebase Storage uploads should now work.
    echo Please restart your development server and try uploading again.
) else (
    echo.
    echo ❌ Failed to deploy CORS configuration
    echo.
    echo Please run these commands manually:
    echo 1. gcloud init
    echo 2. gcloud auth login
    echo 3. gsutil cors set cors.json gs://dare-web-app-61360.firebasestorage.app
)

echo.
pause
