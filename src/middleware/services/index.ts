// Central service exports for easy importing
export { default as authService } from "./auth.service.new";
export type {
  AuthState,
  SignUpRequest,
  AuthResponse,
} from "./auth.service.new";
export { default as userService } from "./user.service.new";
export { default as friendsService } from "./friends.service.new";
export { default as feedService } from "./feed.service.new";
export { default as dareService } from "./dare.service.new";
export { default as messagingService } from "./messaging.service.new";
export { default as presenceService } from "./presence.service.new";
export { default as moderationService } from "./moderation.service.new";
