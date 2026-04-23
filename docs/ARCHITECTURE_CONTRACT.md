# Architecture Contract

## Permanent Binding Agreement

This document defines the permanent architectural separation between UI and backend layers. **This contract is binding and must never be violated.**

## Layer Separation

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                            │
│  React Components, Hooks, Stores, Styles                    │
│  - No Firebase calls                                        │
│  - No Firestore queries                                     │
│  - No business logic                                        │
│  - Only middleware service calls                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Middleware Layer                             │
│  Services, DTOs, Business Workflows                         │
│  - Service interfaces                                       │
│  - DTOs and response types                                  │
│  - Business rule enforcement                               │
│  - No infrastructure dependencies                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend Layer                             │
│  Domain, Repositories, Infrastructure                        │
│  - Domain entities with behavior                            │
│  - Repository interfaces                                   │
│  - Business rules and validation                            │
│  - Firebase and external services                          │
└─────────────────────────────────────────────────────────────┘
```

## Strict Rules (Never Violate)

### Frontend Layer Rules

1. **NO FIREBASE CALLS** - UI components must never import or use Firebase
2. **NO FIRESTORE QUERIES** - All database access must go through middleware services
3. **NO BUSINESS LOGIC** - UI must only handle presentation and user interaction
4. **NO DATABASE SCHEMA KNOWLEDGE** - UI must not know collection names or field names
5. **NO STORAGE PATHS** - UI must not know Firebase Storage paths
6. **ONLY MIDDLEWARE CALLS** - UI may only call middleware service methods with typed DTOs

### Middleware Layer Rules

1. **NO UI DEPENDENCIES** - Services must never import UI components
2. **NO UI-DRIVEN CONDITIONALS** - Backend logic must not depend on UI structure
3. **CLEAN DTOS ONLY** - Service responses must use typed DTOs, not raw database objects
4. **BACKEND INTERFACES ONLY** - Services must depend on backend interfaces, not implementations
5. **BUSINESS LOGIC ONLY** - Services contain orchestration and validation, not infrastructure

### Backend Layer Rules

1. **PURE BUSINESS LOGIC** - Domain layer has no external dependencies
2. **ENTITY BEHAVIOR** - Domain entities contain business rules and validation
3. **INTERFACE CONTRACTS** - Repository interfaces define data access contracts
4. **INFRASTRUCTURE SEPARATION** - Repositories handle Firebase operations only
5. **NO UI COUPLING** - Backend must never import frontend modules

## Throwaway UI Principle

### Critical Test

If the entire `/src/frontend` folder is deleted and rebuilt from scratch, **the backend must continue working without any modifications.**

### Requirements

- Backend must not depend on component names
- Backend must not depend on UI structure
- Backend must not depend on state management approach
- Backend must not depend on routing structure
- Backend must not depend on styling approach

## Data Access Rules

### Rule 1: Service Interface Only

```typescript
// ✅ CORRECT - UI calls service
const response = await userService.getProfile(userId);

// ❌ FORBIDDEN - UI directly accesses database
const userDoc = await getDoc(doc(db, "users", userId));
```

### Rule 2: DTOs Only

```typescript
// ✅ CORRECT - Service returns typed DTO
interface UserProfileResponse {
  success: boolean;
  profile?: UserProfileDTO;
  error?: string;
}

// ❌ FORBIDDEN - Service returns raw database object
return userDoc.data(); // Exposes database schema
```

### Rule 3: No Database Knowledge

```typescript
// ✅ CORRECT - UI uses service method
const dare = await dareService.createDare(request);

// ❌ FORBIDDEN - UI knows collection names
const dareRef = doc(db, "dares", dareId);
```

## Enforcement Requirements

### Before Any Backend Code Modification

1. Check if change violates this contract
2. Ensure UI layer separation is maintained
3. Verify no UI dependencies are introduced
4. Confirm DTOs are used, not raw database objects
5. Test throwaway UI principle

### Code Review Checklist

- [ ] No Firebase imports in UI components
- [ ] No Firestore queries in React components
- [ ] No business logic in UI layer
- [ ] Services use repository interfaces only
- [ ] DTOs are used for all service responses
- [ ] Domain layer has no external dependencies
- [ ] Infrastructure layer has no business logic

## Contract Violations

### Examples of Violations

1. **UI importing Firebase**: `import { db } from '@/lib/firebase'` in component
2. **Service importing UI**: `import { ProfileScreen } from '@/components'` in service
3. **Raw database objects**: Service returning `userDoc.data()` directly
4. **Database knowledge**: UI knowing collection names like "users" or "dares"
5. **UI-driven logic**: Backend conditional based on component names

### Consequences

- Immediate revert of violating code
- Architecture review required
- Contract re-education for team
- Potential impact on project timeline

## Permanent Status

This contract is **permanent and binding**:

- Cannot be modified without architecture review
- Cannot be bypassed for "quick fixes"
- Cannot be ignored for convenience
- Applies to all future development

## Implementation Status

### ✅ Completed

- Domain layer with clean interfaces
- Repository layer with Firebase implementations
- Service layer with DTOs and orchestration
- Complete UI-agnostic separation

### ✅ Verified

- No Firebase calls in UI components
- No business logic in React components
- Clean service interfaces
- Typed DTOs for all responses
- Throwaway UI principle compliance

## Future Development Rules

1. **New Features**: Must follow this contract
2. **Bug Fixes**: Must not violate separation
3. **Refactoring**: Must maintain layer boundaries
4. **Testing**: Must test layers independently
5. **Documentation**: Must reflect this architecture

---

**This contract is binding and permanent. Any violation must be immediately corrected.**

The backend operates as a standalone engine. The UI is a completely replaceable client.
