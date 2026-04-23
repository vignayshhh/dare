# Backend Architecture Implementation

## Overview

This directory contains the complete backend implementation following clean architecture principles with strict UI-agnostic separation.

## Architecture Layers

### 1. Domain Layer (`/domain`)
- **Interfaces**: Clean contracts for repositories and business logic
- **Entities**: Core business objects with validation and behavior
- **Purpose**: Pure business logic, no external dependencies

### 2. Repository Layer (`/repositories`)
- **Implementation**: Firebase-specific data access
- **Mapping**: Converts between domain entities and database models
- **Purpose**: Infrastructure layer, handles all Firebase operations

### 3. Service Layer (`/services`)
- **Orchestration**: Business workflow coordination
- **DTOs**: Clean request/response interfaces
- **Validation**: Business rule enforcement
- **Purpose**: Application layer, coordinates between domain and infrastructure

### 4. Infrastructure Layer (`/lib`)
- **Firebase Config**: Database connection and setup
- **External Services**: Third-party integrations
- **Purpose**: Low-level infrastructure concerns

## Key Principles

### UI-Agnostic Design
- **No Firebase calls in UI components**
- **No business logic in React components**
- **Clean service interfaces**
- **Typed DTOs for all data flow**

### Dependency Injection
- All services accept repository interfaces
- Easy testing with mock implementations
- Flexible infrastructure swapping

### Error Handling
- Consistent error response format
- Proper error propagation
- User-friendly error messages

## Service Structure

### Auth Service (`auth.service.new.ts`)
- User authentication and profile management
- Email and Google sign-in flows
- Profile updates and state management

### User Service (`user.service.new.ts`)
- Profile management and search
- Privacy controls and visibility
- Online status and presence

### Dare Service (`dare.service.new.ts`)
- Dare creation and lifecycle management
- Proof submission and validation
- Voting and completion logic

### Friends Service (`friends.service.new.ts`)
- Friend request management
- Relationship status tracking
- User discovery and search

### Messaging Service (`messaging.service.new.ts`)
- Conversation management
- Message delivery and status
- Typing indicators and events

### Feed Service (`feed.service.new.ts`)
- Activity feed generation
- Event creation and enrichment
- Social content aggregation

### Presence Service (`presence.service.new.ts`)
- Real-time online status
- Profile viewing tracking
- Ghost mode management

### Moderation Service (`moderation.service.new.ts`)
- Content reporting
- User moderation
- Policy enforcement

## Usage Examples

### Using Services in UI

```typescript
import { authService, dareService } from '@/services';

// Authentication
const authResponse = await authService.signIn(email);
if (authResponse.success) {
  // Handle successful sign in
}

// Dare Management
const dareResponse = await dareService.createDare({
  challengerId: currentUser.id,
  receiverId: targetUser.id,
  description: "Complete this challenge!"
});
```

### Testing with Mocks

```typescript
import { DareService } from '@/services/dare.service.new';
import { MockDareRepository } from '../mocks/MockDareRepository';

const mockRepo = new MockDareRepository();
const dareService = new DareService(mockRepo);
```

## Migration Guide

The new services are suffixed with `.new.ts` to avoid conflicts with existing implementations. To migrate:

1. Update imports to use `.new` versions
2. Test functionality thoroughly
3. Replace old services once verified
4. Remove `.new` suffix

## Benefits

1. **Testability**: Easy unit testing with mocks
2. **Maintainability**: Clear separation of concerns
3. **Scalability**: Independent layer evolution
4. **Flexibility**: Infrastructure can be swapped
5. **Type Safety**: Full TypeScript coverage

## Compliance

This implementation strictly follows the architectural requirements:

- ✅ No backend logic in UI components
- ✅ No direct Firebase calls in screens
- ✅ No Firestore queries in UI
- ✅ No business logic in React components
- ✅ No coupling between component structure and data shape
- ✅ UI is fully replaceable without touching backend

The backend operates as a completely independent engine that can serve any frontend implementation.
