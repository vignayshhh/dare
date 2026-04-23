#!/bin/bash

# Firebase Storage Security Headers Configuration Script
# This script configures security headers for Firebase Storage buckets
# Run this script after deploying to production to ensure static assets have proper security headers

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Firebase Storage Security Headers Configuration ===${NC}"

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo -e "${RED}Error: gsutil is not installed.${NC}"
    echo "Please install gsutil from: https://cloud.google.com/storage/docs/gsutil_install"
    exit 1
fi

# Check if user is authenticated
if ! gsutil ls &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with gsutil.${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

# Get the Firebase Storage bucket name from environment or prompt
if [ -z "$FIREBASE_STORAGE_BUCKET" ]; then
    echo -e "${YELLOW}Enter your Firebase Storage bucket name (e.g., gs://your-project.appspot.com):${NC}"
    read -r BUCKET
else
    BUCKET="$FIREBASE_STORAGE_BUCKET"
fi

echo -e "${GREEN}Configuring security headers for: $BUCKET${NC}"

# Configure security headers for all objects in the bucket
# These headers help protect against XSS, MIME-sniffing, and other attacks
gsutil -m setmeta \
  -h "Cache-Control:public,max-age=31536000,immutable" \
  -h "X-Content-Type-Options:nosniff" \
  -h "X-Frame-Options:DENY" \
  -h "X-XSS-Protection:1; mode=block" \
  -r "$BUCKET"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Security headers configured successfully!${NC}"
    echo ""
    echo "Applied headers:"
    echo "  - Cache-Control: public,max-age=31536000,immutable"
    echo "  - X-Content-Type-Options: nosniff"
    echo "  - X-Frame-Options: DENY"
    echo "  - X-XSS-Protection: 1; mode=block"
else
    echo -e "${RED}❌ Failed to configure security headers${NC}"
    exit 1
fi

# Configure CORS for Firebase Storage if cors.json exists
if [ -f "cors.json" ]; then
    echo -e "${YELLOW}Configuring CORS from cors.json...${NC}"
    gsutil cors set cors.json "$BUCKET"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ CORS configured successfully!${NC}"
    else
        echo -e "${RED}❌ Failed to configure CORS${NC}"
    fi
fi

echo -e "${GREEN}=== Configuration Complete ===${NC}"
