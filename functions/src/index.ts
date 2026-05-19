/**
 * Cloud Functions entry point. Each export becomes a deployable function.
 * Region: asia-south1 (matches firestore config).
 */
export {
  onPostLikeCreated,
  onPostLikeDeleted,
  onPostCommentCreated,
  onPostCommentDeleted,
  onPostViewCreated,
  onCommentLikeCreated,
  onCommentLikeDeleted,
} from "./triggers/counters";
export {
  onCommunityChallengeJoinCreated,
  onCommunityChallengeJoinDeleted,
  onChallengeRoomProofCreated,
  processCommunityChallengeDeadlines,
} from "./triggers/communityChallenges";

export { migrateEmailPrivate } from "./triggers/onUserCreated";
export { onReportCreated } from "./triggers/onReportCreated";

export { moderationAction, setAdminRole } from "./callable/moderation";

export { pruneRateLimits, pruneExpiredStories, pruneOldEvents } from "./scheduled/cleanup";
