// Backend Layer
// This layer contains domain logic, repositories, and infrastructure
// Pure business logic, data access, external integrations
// No UI dependencies, no frontend coupling

export * from "./domain/interfaces";
export type { AuthUserEntity } from "./domain/entities";
export type { DareEntity } from "./domain/entities";
export type { UserProfileEntity } from "./domain/entities";
export * from "./repositories";
export * from "./lib";
export * from "./utils";
