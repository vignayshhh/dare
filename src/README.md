# Project Structure

This project follows strict clean architecture with complete layer separation.

## Directory Structure

```
src/
├── frontend/           # UI Layer - React components only
│   ├── components/     # React components, screens
│   ├── app/           # Next.js app router
│   ├── hooks/         # Custom React hooks
│   ├── stores/        # State management (Zustand)
│   └── styles/        # CSS, styling
├── middleware/         # Application Layer - Services
│   └── services/       # Business workflows, DTOs
├── backend/           # Backend Layer - Domain & Infrastructure
│   ├── domain/        # Business entities, interfaces
│   ├── repositories/  # Data access implementations
│   ├── lib/           # Firebase, infrastructure
│   ├── types/         # Database types
│   └── utils/         # Backend utilities
└── __tests__/         # Tests for all layers
```

## Layer Responsibilities

### Frontend Layer
- React components and screens
- User interaction handling
- Presentation logic only
- **NO**: Firebase calls, business logic, database access

### Middleware Layer  
- Service orchestration
- Business workflows
- DTOs and validation
- **NO**: UI dependencies, infrastructure code

### Backend Layer
- Domain entities and business rules
- Repository implementations
- Firebase operations
- **NO**: UI coupling, frontend dependencies

## Architecture Contract

See `/docs/ARCHITECTURE_CONTRACT.md` for the permanent binding agreement that enforces this separation.

## Import Rules

### Frontend can import:
- Other frontend modules
- Middleware services (through clean interfaces)

### Middleware can import:
- Backend domain interfaces
- Backend repository interfaces

### Backend can import:
- Other backend modules
- Infrastructure (Firebase)

### Forbidden Imports:
- Frontend → Backend (direct)
- Backend → Frontend (any)
- Frontend → Infrastructure (direct)

This structure ensures complete UI-agnostic backend that can operate independently.
