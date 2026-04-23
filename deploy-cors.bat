@echo off
echo Deploying CORS configuration to Firebase Storage...

REM Check if gsutil is available
where gsutil >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: gsutil is not installed or not in PATH
    echo Please install Google Cloud SDK:
    echo 1. Visit: https://cloud.google.com/sdk/docs/install
    echo 2. Follow installation instructions for Windows
    echo 3. Run: gcloud init
    echo 4. Authenticate with your Google account
    pause
    exit /b 1
)

REM Deploy CORS configuration
echo Setting CORS rules for Firebase Storage bucket...
gsutil cors set cors.json gs://dare-web-app-61360.firebasestorage.app

if %errorlevel% equ 0 (
    echo ✅ CORS configuration deployed successfully!
    echo You can now try uploading files again.
) else (
    echo ❌ Failed to deploy CORS configuration
    echo Please check your authentication and bucket name
    pause
    exit /b 1
)

REM Verify CORS configuration
echo Verifying CORS configuration...
gsutil cors get gs://dare-web-app-61360.firebasestorage.app

pause
