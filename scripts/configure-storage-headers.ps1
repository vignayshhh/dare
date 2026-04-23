# Firebase Storage Security Headers Configuration Script (PowerShell)
# This script configures security headers for Firebase Storage buckets
# Run this script after deploying to production to ensure static assets have proper security headers

# Color codes for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"

Write-Host "=== Firebase Storage Security Headers Configuration ===" -ForegroundColor $Green

# Check if gsutil is installed
$gsutilInstalled = Get-Command gsutil -ErrorAction SilentlyContinue
if (-not $gsutilInstalled) {
    Write-Host "Error: gsutil is not installed." -ForegroundColor $Red
    Write-Host "Please install gsutil from: https://cloud.google.com/storage/docs/gsutil_install"
    exit 1
}

# Check if user is authenticated
$authCheck = gsutil ls 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Not authenticated with gsutil." -ForegroundColor $Red
    Write-Host "Please run: gcloud auth login"
    exit 1
}

# Get the Firebase Storage bucket name from environment or prompt
$bucket = $env:FIREBASE_STORAGE_BUCKET
if ([string]::IsNullOrEmpty($bucket)) {
    Write-Host "Enter your Firebase Storage bucket name (e.g., gs://your-project.appspot.com):" -ForegroundColor $Yellow
    $bucket = Read-Host
}

Write-Host "Configuring security headers for: $bucket" -ForegroundColor $Green

# Configure security headers for all objects in the bucket
# These headers help protect against XSS, MIME-sniffing, and other attacks
$command = "gsutil -m setmeta -h `"Cache-Control:public,max-age=31536000,immutable`" -h `"X-Content-Type-Options:nosniff`" -h `"X-Frame-Options:DENY`" -h `"X-XSS-Protection:1; mode=block`" -r `"$bucket`""

Invoke-Expression $command

if ($LASTEXITCODE -eq 0) {
    Write-Host "Security headers configured successfully!" -ForegroundColor $Green
    Write-Host ""
    Write-Host "Applied headers:"
    Write-Host "  - Cache-Control: public,max-age=31536000,immutable"
    Write-Host "  - X-Content-Type-Options: nosniff"
    Write-Host "  - X-Frame-Options: DENY"
    Write-Host "  - X-XSS-Protection: 1; mode=block"
} else {
    Write-Host "Failed to configure security headers" -ForegroundColor $Red
    exit 1
}

# Configure CORS for Firebase Storage if cors.json exists
if (Test-Path "cors.json") {
    Write-Host "Configuring CORS from cors.json..." -ForegroundColor $Yellow
    gsutil cors set cors.json "$bucket"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "CORS configured successfully!" -ForegroundColor $Green
    } else {
        Write-Host "Failed to configure CORS" -ForegroundColor $Red
    }
}

Write-Host "=== Configuration Complete ===" -ForegroundColor $Green
