// Feature flags for gradual migration from development to production services
// This allows us to wire backend gradually without breaking existing functionality

export const FEATURE_FLAGS = {
  // Authentication system
  USE_PRODUCTION_AUTH: true, // 🎯 ENABLED - Full production auth

  // Content services
  USE_PRODUCTION_FEED: true, // 🎯 ENABLED - Full feed backend integration
  USE_PRODUCTION_DARES: true, // 🎯 ENABLED - Full dare backend integration
  USE_PRODUCTION_TRUTH: true, // 🎯 ENABLED - Full truth backend integration

  // User services
  USE_PRODUCTION_USERS: true, // 🎯 ENABLED - Full user backend integration
  USE_PRODUCTION_FRIENDS: true, // 🎯 ENABLED - Full friends backend integration

  // Real-time features
  USE_PRODUCTION_MESSAGING: true, // 🎯 ENABLED - Full messaging backend integration
  USE_PRODUCTION_PRESENCE: true, // 🎯 ENABLED - Full presence backend integration

  // Content moderation
  USE_PRODUCTION_MODERATION: true, // 🎯 ENABLED - Full moderation backend integration

  // Alert system
  USE_PRODUCTION_ALERTS: true, // 🎯 ENABLED - Full alert backend integration
} as const;

// Helper function to check if feature is enabled
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature];
}

// Environment-based overrides (for production)
if (process.env.NODE_ENV === "production") {
  // In production, all features should use production services
  Object.assign(FEATURE_FLAGS, {
    USE_PRODUCTION_AUTH: true,
    USE_PRODUCTION_FEED: true,
    USE_PRODUCTION_DARES: true,
    USE_PRODUCTION_TRUTH: true,
    USE_PRODUCTION_USERS: true,
    USE_PRODUCTION_FRIENDS: true,
    USE_PRODUCTION_MESSAGING: true,
    USE_PRODUCTION_PRESENCE: true,
    USE_PRODUCTION_MODERATION: true,
  });
}
