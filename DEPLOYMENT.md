# Production Deployment Guide

## Overview
This guide covers deploying the DARE app to production with all mock data removed and full Firebase integration.

## Prerequisites

1. **Firebase Project Setup**
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Authentication, Firestore, Storage, and Hosting
   - Configure security rules for production

2. **Environment Configuration**
   - Copy `.env.production.example` to `.env.local`
   - Fill in your actual Firebase configuration values
   - Never commit `.env.local` to version control

## Production Setup Steps

### 1. Firebase Configuration

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init
```

### 2. Environment Variables

Create `.env.local` with your production values:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Security Rules

#### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Dares and truths with proper access control
    match /dares/{dareId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
    
    match /truths/{truthId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
  }
}
```

#### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /user-uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 4. Build and Deploy

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Lint
npm run lint:fix

# Build for production
npm run build:production

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Or deploy to Vercel/Netlify
vercel --prod
```

## Production Features Enabled

All feature flags are now enabled in production mode:

- ✅ USE_PRODUCTION_AUTH - Full Firebase Authentication
- ✅ USE_PRODUCTION_FEED - Real feed data from Firestore
- ✅ USE_PRODUCTION_DARES - Complete dare system
- ✅ USE_PRODUCTION_TRUTH - Complete truth system
- ✅ USE_PRODUCTION_USERS - User profiles and management
- ✅ USE_PRODUCTION_FRIENDS - Friend system
- ✅ USE_PRODUCTION_MESSAGING - Real-time messaging
- ✅ USE_PRODUCTION_PRESENCE - Online status
- ✅ USE_PRODUCTION_MODERATION - Content moderation
- ✅ USE_PRODUCTION_ALERTS - Alert system

## Architecture Compliance

The production setup maintains strict adherence to the architecture contract:

- **No Firebase calls in UI components** - All database access goes through services
- **Clean service interfaces** - DTOs and proper error handling
- **Backend independence** - Backend operates as standalone engine
- **Throwaway UI principle** - UI can be completely replaced without affecting backend

## Monitoring and Analytics

Production deployment includes:

- Firebase Analytics for user behavior tracking
- Performance monitoring
- Error reporting
- Custom event tracking for dare/truth interactions

## Security Considerations

1. **Authentication**: All endpoints require authenticated users
2. **Data Validation**: Input validation at service layer
3. **Rate Limiting**: Built-in rate limiting for API calls
4. **Content Security**: File upload restrictions and validation
5. **Privacy Settings**: User-controlled visibility settings

## Testing Production

```bash
# Run production build locally
npm run build:production
npm run start:production

# Test with production data
# Verify all features work with real Firebase data
```

## Rollback Plan

If issues occur:

1. Revert to previous deployment
2. Check Firebase console for issues
3. Review error logs
4. Disable problematic features via environment variables

## Performance Optimization

- Next.js production optimizations enabled
- Firebase caching configured
- Image optimization active
- Code splitting implemented
- Service worker for offline support

## Support

For production issues:
1. Check Firebase console logs
2. Review browser console errors
3. Verify environment variables
4. Test with different user roles
5. Monitor Firebase usage quotas
