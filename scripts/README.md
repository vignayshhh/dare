# Scripts Directory

This directory is intentionally empty. All debug, test, and migration scripts have been removed as part of the security cleanup before launch.

## Security Requirements

If you need to add operational scripts to this directory in the future, they must:

1. **Never contain hardcoded credentials** - All scripts must use environment variables or the `GOOGLE_APPLICATION_CREDENTIALS` environment variable for Firebase authentication.

2. **Require GOOGLE_APPLICATION_CREDENTIALS** - Any script that interacts with Firebase should check for the `GOOGLE_APPLICATION_CREDENTIALS` environment variable before execution and fail gracefully if not present.

3. **Be production-safe** - Scripts should be idempotent and safe to run in production environments.

## Example Pattern

```javascript
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is required');
  process.exit(1);
}
```

## Current Operational Scripts

- `backfill-friendships.js`
  Backfills canonical friendship docs for legacy accepted friendships so
  Firestore rules that rely on deterministic friendship IDs can authorize
  story reads correctly. Defaults to dry-run; use `--apply` to write.

## Removed Files

The following files were removed during security cleanup:
- initialize-counters.js (and all other JS files)
- All debug/test scripts from project root
- All migration/fix scripts from project root

These files either contained hardcoded credentials or performed destructive operations that should not be shipped to production.
