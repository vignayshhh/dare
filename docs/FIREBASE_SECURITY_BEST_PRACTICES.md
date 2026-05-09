# Firebase Admin SDK Security Best Practices

## Overview

This document outlines security best practices for using the Firebase Admin SDK in production environments. The Admin SDK has full administrative access to your Firebase project, so it must be protected with the highest security standards.

## Critical Security Requirements

### 1. Service Account Key Management

#### Current Implementation
- Service account credentials are stored in `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable
- Loaded in `src/app/api/_lib/admin.ts`
- Used for server-side operations only (marked with `server-only`)

#### Security Risks
- If the environment variable leaks, attackers have full admin access
- Service account keys never expire by default
- Keys provide unlimited permissions to all Firebase services

#### Best Practices

**For Production:**

1. **Use Workload Identity Federation (Recommended)**
   - Eliminates service account keys entirely
   - Uses short-lived tokens from your cloud provider
   - Automatically rotated by the cloud provider
   - Supported on: Google Cloud Run, Google Cloud Functions, AWS, Azure

   ```typescript
   // Example for Google Cloud Run
   const app = initializeApp({
     credential: applicationDefault(),
   });
   ```

2. **If Service Account Keys Must Be Used:**
   - **Never commit keys to version control** (already in .gitignore)
   - **Rotate keys regularly** (at least every 90 days)
   - **Use least-privilege service accounts** (create separate accounts for different services)
   - **Store keys in secret management systems**:
     - Google Secret Manager
     - AWS Secrets Manager
     - Azure Key Vault
     - HashiCorp Vault
   - **Use environment variables only in production deployments** (Vercel, Cloud Run, etc.)

3. **Key Rotation Process:**
   ```bash
   # 1. Create new key
   gcloud iam service-accounts keys create new-key.json \
     --iam-account=firebase-adminsdk@project.iam.gserviceaccount.com

   # 2. Update environment variable in production
   # 3. Test deployment with new key
   # 4. Delete old key
   gcloud iam service-accounts keys delete old-key-id \
     --iam-account=firebase-adminsdk@project.iam.gserviceaccount.com
   ```

### 2. Environment Variable Security

#### Current Implementation
```typescript
// src/app/api/_lib/admin.ts
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (raw) {
  const parsed = JSON.parse(raw);
  return initializeApp({ credential: cert(parsed) });
}
```

#### Security Requirements

1. **Production Environment Variables:**
   - Set via platform's secret management (Vercel Environment Variables, Cloud Run Secrets)
   - Never hardcode in source code
   - Never commit to version control
   - Encrypt at rest by the platform

2. **Development Environment:**
   - Use `.env.local` (already in .gitignore)
   - Never use production keys in development
   - Use emulator mode when possible

3. **Environment Variable Naming:**
   - Use clear, descriptive names
   - Prefix with service name if multiple services
   - Document required variables in `.env.production.example`

### 3. Server-Only Enforcement

#### Current Implementation
```typescript
// src/app/api/_lib/admin.ts
import "server-only";
```

#### Best Practices

1. **Always mark Admin SDK imports with `server-only`:**
   ```typescript
   import "server-only";
   import { getFirestore } from "firebase-admin/firestore";
   ```

2. **Never import Admin SDK in client-side code:**
   - Next.js will fail the build if you try
   - Admin SDK bundles are large and shouldn't go to the client
   - Client should use Firebase Client SDK only

3. **Use API routes as the only interface:**
   - Client → Next.js API Route → Admin SDK
   - Never expose Admin SDK directly to client

### 4. Permission Scoping

#### Current Implementation
- Single service account with full Firebase Admin privileges
- Used for all server-side operations

#### Best Practices

1. **Create Least-Privilege Service Accounts:**

   For different services, create separate service accounts with minimal permissions:

   ```bash
   # Service account for user management only
   gcloud iam service-accounts create user-management-sa \
     --display-name="User Management Service Account"
   
   # Grant minimal permissions
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:user-management-sa@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/firebaseauth.admin"
   ```

2. **Permission Categories:**
   - **Authentication Service:** Firebase Auth Admin only
   - **Database Service:** Firestore Admin only
   - **Storage Service:** Firebase Storage Admin only
   - **Full Admin:** Only for administrative endpoints

### 5. Audit Logging

#### Current Implementation
- Security events logged to Firestore via `securityLogger.ts`
- Admin actions logged in `moderation_actions` collection

#### Best Practices

1. **Log All Admin SDK Operations:**
   ```typescript
   import { logSecurityEventServer } from "@/security/securityLogger";

   await logSecurityEventServer({
     type: "admin_action",
     userId: adminUid,
     details: { action: "delete_user", targetUserId },
     severity: "high",
   });
   ```

2. **Include in Logs:**
   - Who performed the action (userId)
   - What action was performed
   - When it was performed
   - Why it was performed (context)
   - Result of the action

3. **Regular Audit Reviews:**
   - Review security logs weekly
   - Set up alerts for critical actions
   - Investigate suspicious patterns

### 6. Deployment Security

#### Best Practices

1. **Vercel Deployment:**
   ```bash
   # Add Firebase service account as environment variable
   vercel env add FIREBASE_SERVICE_ACCOUNT_JSON production
   
   # Use Vercel's secret management
   # Never commit to .env files
   ```

2. **Cloud Run Deployment:**
   ```bash
   # Use Google Secret Manager
   gcloud secrets create firebase-admin-key --data-file=key.json
   
   # Deploy with secret access
   gcloud run deploy --set-secrets=firebase-admin-key=firebase-admin-key:latest
   ```

3. **CI/CD Security:**
   - Never use production credentials in CI/CD
   - Use separate credentials for testing/staging
   - Rotate credentials after any CI/CD compromise

### 7. Monitoring and Alerting

#### Current Implementation
- Security events logged to Firestore
- Critical events trigger alerts via `security_alerts` collection

#### Best Practices

1. **Set Up Monitoring:**
   - Monitor Admin SDK usage patterns
   - Alert on unusual activity (e.g., bulk user deletion)
   - Track API error rates

2. **Google Cloud Monitoring:**
   ```bash
   # Set up log-based metrics
   gcloud logging metrics create admin_actions \
     --log-filter='resource.type="cloud_function" AND protoPayload.serviceName="firebase.googleapis.com"'
   ```

3. **Alert Rules:**
   - Multiple failed auth attempts
   - Bulk operations (deleting many users at once)
   - Unusual time patterns (admin actions at 3 AM)

### 8. Backup and Recovery

#### Best Practices

1. **Firestore Exports:**
   ```bash
   # Regular automated exports
   gcloud firestore export gs://backup-bucket --async
   ```

2. **Service Account Backup:**
   - Keep encrypted backup of service account keys offline
   - Store in secure location (not in code)
   - Access limited to senior engineers only

3. **Disaster Recovery:**
   - Document recovery procedures
   - Test recovery regularly
   - Have contact information for Google Cloud support

## Implementation Checklist

### Before Production Launch:

- [ ] Service account keys are stored in platform secret management
- [ ] Service account keys have been rotated in the last 90 days
- [ ] Workload identity federation is configured (if using GCP)
- [ ] All Admin SDK imports are marked with `server-only`
- [ ] Security logging is enabled and tested
- [ ] Audit log review process is established
- [ ] Monitoring and alerting are configured
- [ ] Backup and recovery procedures are documented
- [ ] Team is trained on security incident response

### Ongoing Maintenance:

- [ ] Rotate service account keys every 90 days
- [ ] Review security logs weekly
- [ ] Update this document with any changes
- [ ] Conduct quarterly security audits
- [ ] Review and update IAM permissions

## Incident Response

If Admin SDK credentials are compromised:

1. **Immediate Actions:**
   - Revoke/rotate the compromised service account key immediately
   - Disable the service account temporarily
   - Review audit logs for suspicious activity
   - Notify security team

2. **Investigation:**
   - Determine scope of compromise
   - Identify what data may have been accessed
   - Check for unauthorized changes to Firebase resources
   - Review user accounts for suspicious activity

3. **Recovery:**
   - Create new service account with fresh credentials
   - Update all deployments with new credentials
   - Monitor for continued suspicious activity
   - Document the incident and lessons learned

## References

- [Firebase Admin SDK Security](https://firebase.google.com/docs/admin/setup)
- [Google Cloud IAM Best Practices](https://cloud.google.com/iam/docs/best-practices)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Google Secret Manager](https://cloud.google.com/secret-manager)

---

**Last Updated:** April 2026
**Version:** 1.0
