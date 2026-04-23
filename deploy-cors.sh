#!/bin/bash

# Deploy CORS configuration to Firebase Storage
echo "Deploying CORS configuration to Firebase Storage..."

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo "Error: gsutil is not installed or not in PATH"
    echo "Please install Google Cloud SDK:"
    echo "1. Visit: https://cloud.google.com/sdk/docs/install"
    echo "2. Follow installation instructions for your platform"
    echo "3. Run: gcloud init"
    echo "4. Authenticate with your Google account"
    exit 1
fi

# Deploy CORS configuration
echo "Setting CORS rules for Firebase Storage bucket..."
gsutil cors set cors.json gs://dare-web-app-61360.firebasestorage.app

if [ $? -eq 0 ]; then
    echo "✅ CORS configuration deployed successfully!"
    echo "You can now try uploading files again."
else
    echo "❌ Failed to deploy CORS configuration"
    echo "Please check your authentication and bucket name"
    exit 1
fi

# Verify CORS configuration
echo "Verifying CORS configuration..."
gsutil cors get gs://dare-web-app-61360.firebasestorage.app
