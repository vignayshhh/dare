// Service factory that returns appropriate service based on feature flags
// This is the ONLY place where we decide which service implementation to use
// UI components will always import from here, ensuring no direct service dependencies

import { isFeatureEnabled } from "@/config/features";
import { SimpleAuthService } from "./simple-auth.service";
import productionAuthService from "./auth.service.new";
import productionFeedService from "./feed.service.new";
import productionDareService from "./dare.service.new";
import productionUserService from "./user.service.new";
import productionFriendsService from "./friends.service.new";
import productionMessagingService from "./messaging.service.new";
import productionPresenceService from "./presence.service.new";
import productionModerationService from "./moderation.service.new";
import productionAlertService from "./alert.service.new";
import productionTruthService from "./truth.service.new";
import { surveillanceService as surveillanceServiceInstance } from "./surveillance.service";
import { closeFriendsService as closeFriendsServiceInstance } from "./close-friends.service";

// Direct production exports - all services now in production mode
export const authService = productionAuthService;
export const feedService = productionFeedService;
export const dareService = productionDareService;
export const truthService = productionTruthService;
export const userService = productionUserService;
export const friendsService = productionFriendsService;
export const messagingService = productionMessagingService;
export const presenceService = productionPresenceService;
export const moderationService = productionModerationService;
export const alertService = productionAlertService;
export const surveillanceService = surveillanceServiceInstance;
export const closeFriendsService = closeFriendsServiceInstance;
