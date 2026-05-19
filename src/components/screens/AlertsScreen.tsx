"use client";

import { useState, useEffect, useRef } from "react";
import {
  Heart,
  Eye,
  MessageCircle,
  Camera,
  CheckCircle,
  XCircle,
  Target,
  AlertTriangle,
  MessageSquare,
  Star,
  ArrowLeft,
  BellRing,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAlertStore } from "../../stores/useAlertStore";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAvatarStore } from "../../stores/avatarStore";
import { surveillanceService } from "../../middleware/services/surveillance.service";
import { resolveUserProfile } from "../../utils/profileResolver";

// Helper function to fetch user profile if not cached — also stores avatar
// Uses getProfileByUserIdForContent to bypass privacy checks (avatars should
// always be visible in alerts regardless of profile visibility settings)
const isGoodValue = (v?: string) =>
  !!v && v !== "Unknown User" && v !== "unknown" && v !== "dare";

const inFlightProfileFetches = new Map<string, Promise<void>>();

const fetchUserProfileIfNeeded = async (userId: string) => {
  if (!userId) return;

  const cachedProfile = useProfileDataStore.getState().userProfiles[userId];
  const hasAvatar = !!useAvatarStore.getState().userAvatars[userId];
  const hasGoodName = isGoodValue(cachedProfile?.displayName);

  // Only fetch from Firestore when we're actually missing data
  if (!hasAvatar || !hasGoodName) {
    try {
      const p = await resolveUserProfile(userId);
      if (p) {
        const newDisplayName = p.displayName || p.username || "";
        const newUsername = p.username || "";
        const avatarUrl = p.avatarUrl || "";

        // Only write to profileDataStore if the NEW data is actually better
        // than what's already cached — never overwrite good data with worse data
        const existingName = cachedProfile?.displayName || "";
        const existingUsername = cachedProfile?.username || "";
        const shouldUpdateName =
          isGoodValue(newDisplayName) && !isGoodValue(existingName);
        const shouldUpdateUsername =
          isGoodValue(newUsername) && !isGoodValue(existingUsername);
        const noCacheYet = !cachedProfile;

        if (noCacheYet || shouldUpdateName || shouldUpdateUsername) {
          useProfileDataStore
            .getState()
            .setUserProfile(
              userId,
              isGoodValue(newDisplayName) ? newDisplayName : existingName,
              isGoodValue(newUsername) ? newUsername : existingUsername,
            );
        }

        if (avatarUrl) {
          useAvatarStore.getState().setUserAvatar(userId, avatarUrl);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }
};

const fetchUserProfileIfNeededDedup = async (userId: string) => {
  if (!userId) return;

  const existingFetch = inFlightProfileFetches.get(userId);
  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = fetchUserProfileIfNeeded(userId).finally(() => {
    inFlightProfileFetches.delete(userId);
  });

  inFlightProfileFetches.set(userId, fetchPromise);
  return fetchPromise;
};

export function AlertsScreen({
  onBack,
  onNavigateToDares,
  onNavigateToFeed,
  onNavigateToChallengeTimeline,
  onNavigateToFriendCompletedDare,
}: {
  onBack: () => void;
  onNavigateToDares: (request?: {
    tab?: "received" | "sent";
    highlightDareId?: string;
    highlightTruthId?: string;
  }) => void;
  onNavigateToFeed: () => void;
  onNavigateToChallengeTimeline: (alert: AlertEntity) => void;
  onNavigateToFriendCompletedDare: (alert: AlertEntity) => void;
}) {
  const [activeTab, setActiveTab] = useState<"social" | "sus">("social");
  const [alertMode, setAlertMode] = useState<"main" | "dare">("main");
  const [dareAlertTab, setDareAlertTab] = useState<"personal" | "friends">(
    "personal",
  );
  const [friendshipStatuses, setFriendshipStatuses] = useState<
    Map<string, "accepted" | "rejected">
  >(new Map());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const { alerts, subscribeToAlerts, markAsRead } = useAlertStore();
  const { user: currentUser } = useAuthStore();
  const checkedFriendshipActorsRef = useRef<Set<string>>(new Set());
  const inFlightFriendshipActorsRef = useRef<Set<string>>(new Set());
  const knownAlertIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedAlertsRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    checkedFriendshipActorsRef.current.clear();
    inFlightFriendshipActorsRef.current.clear();
  }, [currentUser?.id, subscribeToAlerts]);

  // Handle navigation to dares screen
  const handleAlertClick = async (alert: AlertEntity) => {
    // Mark as read first. Temporary mock entries are display-only.
    if (!alert.id.startsWith("mock-")) {
      const alertIds = Array.isArray(alert.metadata?.aggregatedAlertIds)
        ? alert.metadata.aggregatedAlertIds
        : [alert.id];

      await Promise.all(
        alertIds
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .map((id) => markAsRead(id)),
      );
    }

    if (
      alert.type === "DARE_FRIEND_ACTIVITY" ||
      alert.type === "TRUTH_FRIEND_ACTIVITY"
    ) {
      if (
        alert.type === "DARE_FRIEND_ACTIVITY" &&
        alert.metadata?.activityType === "completed"
      ) {
        onNavigateToFriendCompletedDare(alert);
        return;
      }

      onNavigateToChallengeTimeline(alert);
      return;
    }

    // Navigate based on alert type
    if (alert.type === "DARE_COMPLETED") {
      console.log(
        "🔄 Navigating to dares sent tab for DARE_COMPLETED alert:",
        alert.entityId,
      );
      sessionStorage.setItem("highlightDareId", alert.entityId);
      sessionStorage.setItem("openDaresTab", "sent");
      onNavigateToDares({
        tab: "sent",
        highlightDareId: alert.entityId,
      });
      return;
    }

    // Handle comment alerts - navigate to post and open comments
    if (alert.type === "COMMENT_RECEIVED" || alert.type === "COMMENT_REPLY") {
      const truthId = alert.metadata?.truthId;
      const dareId = alert.metadata?.dareId;

      if (truthId || dareId) {
        sessionStorage.setItem("openDaresTab", "received");

        if (truthId) {
          sessionStorage.setItem("highlightTruthId", truthId);
        }

        if (dareId) {
          sessionStorage.setItem("highlightDareId", dareId);
        }

        onNavigateToDares({
          tab: "received",
          highlightDareId: dareId || undefined,
          highlightTruthId: truthId || undefined,
        });
        return;
      }

      console.log(
        "🔄 Navigating to post and opening comments for comment alert:",
        alert.type,
        alert.entityId,
      );

      // Store the post ID to highlight and open comments
      sessionStorage.setItem("highlightPostId", alert.entityId);
      sessionStorage.setItem("openCommentsForPost", alert.entityId);

      // Navigate to feed
      onNavigateToFeed();
      return;
    }

    if (alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") {
      const postId = alert.metadata?.postId || alert.entityId;
      const commentId = alert.metadata?.commentId;

      if (postId) {
        sessionStorage.setItem("highlightPostId", postId);
        if (commentId) {
          sessionStorage.setItem("openCommentsForPost", postId);
        }
        onNavigateToFeed();
      }
      return;
    }

    if (
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED"
    ) {
      console.log(
        "🔄 Navigating to dares received tab for alert:",
        alert.type,
        alert.entityId,
      );

      // Set the correct highlight ID based on alert type
      if (alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED") {
        sessionStorage.setItem("highlightTruthId", alert.entityId);
        console.log("🎯 Stored truth ID to highlight:", alert.entityId);
      } else {
        sessionStorage.setItem("highlightDareId", alert.entityId);
        console.log("🎯 Stored dare ID to highlight:", alert.entityId);
      }

      // Ensure we open the received tab (not sent tab)
      sessionStorage.setItem("openDaresTab", "received");

      // Navigate to dares screen
      onNavigateToDares({
        tab: "received",
        highlightDareId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? undefined
            : alert.entityId,
        highlightTruthId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? alert.entityId
            : undefined,
      });
    }
  };

  // Load alerts on component mount with real-time listener
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = subscribeToAlerts(currentUser.id);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.id, subscribeToAlerts]);

  // Check friendship status for friend request alerts to ensure persistence
  useEffect(() => {
    if (!currentUser?.id) return;

    const checkFriendshipStatuses = async () => {
      const actorIds = [
        ...new Set(
          alerts
            .filter((alert) => alert.type === "FRIEND_REQUEST" && alert.actorId)
            .map((alert) => alert.actorId as string),
        ),
      ];

      for (const actorId of actorIds) {
        const cacheKey = `${currentUser.id}:${actorId}`;
        if (
          checkedFriendshipActorsRef.current.has(cacheKey) ||
          inFlightFriendshipActorsRef.current.has(cacheKey)
        ) {
          continue;
        }

        inFlightFriendshipActorsRef.current.add(cacheKey);

        try {
          const { friendsService } =
            await import("@/middleware/services/service-factory");
          const statusResponse = await friendsService.getFriendshipStatus(
            currentUser.id,
            actorId,
          );

          if (statusResponse.success && statusResponse.friendship) {
            const status = statusResponse.friendship.status;
            if (status === "accepted" || status === "rejected") {
              setFriendshipStatuses((prev) => {
                const next = new Map(prev);
                alerts
                  .filter(
                    (alert) =>
                      alert.type === "FRIEND_REQUEST" &&
                      alert.actorId === actorId,
                  )
                  .forEach((alert) => {
                    next.set(alert.id, status);
                  });
                return next;
              });
            }
          }

          checkedFriendshipActorsRef.current.add(cacheKey);
        } catch (error) {
          console.error("Error checking friendship status:", error);
        } finally {
          inFlightFriendshipActorsRef.current.delete(cacheKey);
        }
      }
    };

    checkFriendshipStatuses();
  }, [alerts, currentUser?.id]);

  // Fetch user profiles when alerts change
  useEffect(() => {
    const actorIds = [
      ...new Set(alerts.map((alert) => alert.actorId).filter(Boolean)),
    ] as string[];

    actorIds.forEach((actorId) => {
      fetchUserProfileIfNeededDedup(actorId);
    });
  }, [alerts]);

  // Live profile viewers (real-time surveillance)
  const [liveViewers, setLiveViewers] = useState<
    Array<{ userId: string; username: string }>
  >([]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = surveillanceService.subscribeToProfileViewers(
      currentUser.id,
      (viewers) => setLiveViewers(viewers),
    );
    return () => unsub();
  }, [currentUser?.id]);

  const getAlertActivityTime = (alert: AlertEntity) => {
    const latestAggregatedAt =
      alert.metadata?.lastActivityAt ||
      alert.metadata?.lastReactionAt ||
      alert.metadata?.lastInteractionAt;

    if (latestAggregatedAt) {
      return typeof latestAggregatedAt === "number"
        ? new Date(latestAggregatedAt).toISOString()
        : latestAggregatedAt;
    }

    if (alert.type !== "SUS_PROFILE_VIEWING") {
      return alert.createdAt;
    }

    const profileViewTime = alert.metadata?.isLive
      ? alert.metadata?.viewingStartTime
      : alert.metadata?.viewingEndTime || alert.metadata?.viewingStartTime;

    if (profileViewTime) {
      return typeof profileViewTime === "number"
        ? new Date(profileViewTime).toISOString()
        : profileViewTime;
    }

    return alert.updatedAt || alert.createdAt;
  };

  // Group alerts by time
  const groupAlertsByTime = (alerts: AlertEntity[]) => {
    const today: AlertEntity[] = [];
    const yesterday: AlertEntity[] = [];

    alerts.forEach((alert) => {
      const alertTime = new Date(getAlertActivityTime(alert));
      const now = new Date();
      const diffInHours =
        (now.getTime() - alertTime.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        today.push(alert);
      } else {
        yesterday.push(alert);
      }
    });

    return { today, yesterday };
  };

  const isFriendChallengeAlert = (alert: AlertEntity) =>
    alert.type === "DARE_FRIEND_ACTIVITY" ||
    alert.type === "TRUTH_FRIEND_ACTIVITY";

  const isPersonalDareAlert = (alert: AlertEntity) =>
    !isFriendChallengeAlert(alert) &&
    (alert.type.startsWith("DARE_") || alert.type.startsWith("TRUTH_"));

  // Filter alerts by type. Personal dare/truth workflow cards are displayed
  // under the D organizer only; alert creation and click behavior stay unchanged.
  const personalDareAlerts = alerts.filter(
    (alert) => alert.isSocialAlert() && isPersonalDareAlert(alert),
  );
  const friendChallengeAlerts = alerts.filter(
    (alert) => alert.isSocialAlert() && isFriendChallengeAlert(alert),
  );
  const mockFriendChallengeAlerts = [
    AlertEntity.create({
      id: "mock-friend-dare-activity-1",
      userId: currentUser?.id || "mock-current-user",
      type: "DARE_FRIEND_ACTIVITY",
      entityId: "mock-friend-dare-1",
      actorId: "mock-ria",
      message: "Ria dared Kabir to send a voice note without deleting it",
      metadata: {
        mock: true,
        challengeKind: "dare",
        challengerId: "mock-ria",
        challengerName: "Ria",
        challengerUsername: "ria",
        receiverId: "mock-kabir",
        receiverName: "Kabir",
        receiverUsername: "kabir",
        prompt: "Send a voice note saying the thing you have been avoiding.",
        mockState: "PROOF_SUBMITTED",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 42).toISOString(),
        mockAcceptedAt: new Date(clockTick - 1000 * 60 * 31).toISOString(),
        mockProofSubmittedAt: new Date(clockTick - 1000 * 60 * 8).toISOString(),
      },
      isRead: false,
      createdAt: new Date(clockTick - 1000 * 60 * 42).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 8).toISOString(),
    }),
    AlertEntity.create({
      id: "mock-friend-truth-activity-1",
      userId: currentUser?.id || "mock-current-user",
      type: "TRUTH_FRIEND_ACTIVITY",
      entityId: "mock-friend-truth-1",
      actorId: "mock-meera",
      message: "Meera asked Aarav a truth about who knows them best",
      metadata: {
        mock: true,
        challengeKind: "truth",
        challengerId: "mock-meera",
        challengerName: "Meera",
        challengerUsername: "meera",
        receiverId: "mock-aarav",
        receiverName: "Aarav",
        receiverUsername: "aarav",
        prompt: "Who in your life understands the version of you nobody else sees?",
        mockState: "ANSWERED",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 78).toISOString(),
        mockAnsweredAt: new Date(clockTick - 1000 * 60 * 19).toISOString(),
      },
      isRead: true,
      createdAt: new Date(clockTick - 1000 * 60 * 78).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 19).toISOString(),
    }),
    AlertEntity.create({
      id: "mock-friend-dare-activity-2",
      userId: currentUser?.id || "mock-current-user",
      type: "DARE_FRIEND_ACTIVITY",
      entityId: "mock-friend-dare-2",
      actorId: "mock-isha",
      message: "Isha dared Dev to post an unfiltered throwback",
      metadata: {
        mock: true,
        challengeKind: "dare",
        challengerId: "mock-isha",
        challengerName: "Isha",
        challengerUsername: "isha",
        receiverId: "mock-dev",
        receiverName: "Dev",
        receiverUsername: "dev",
        prompt: "Post an old photo and tell the real story behind it.",
        mockState: "SENT",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
      },
      isRead: false,
      createdAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
    }),
  ];
  const friendChallengeAlertsForDisplay =
    friendChallengeAlerts.length > 0
      ? friendChallengeAlerts
      : mockFriendChallengeAlerts;
  const socialAlerts = alerts.filter(
    (alert) =>
      alert.isSocialAlert() &&
      alert.type !== "STORY_REPLY" &&
      !isPersonalDareAlert(alert) &&
      !isFriendChallengeAlert(alert),
  );
  const susAlerts = alerts.filter((alert) => alert.isSusAlert());

  // ── Aggregate POST_LIKED alerts by postId (Instagram-style) ──
  // Groups multiple likes on the same post into one entry:
  //   "@user1 and 3 others liked your post"
  const aggregateLikeAlerts = (alertsList: AlertEntity[]) => {
    const likeAlerts = alertsList.filter((a) => a.type === "POST_LIKED");
    const nonLikeAlerts = alertsList.filter((a) => a.type !== "POST_LIKED");

    // Group likes by postId
    const likesByPost = new Map<string, AlertEntity[]>();
    for (const alert of likeAlerts) {
      const postId = alert.metadata?.postId || alert.entityId;
      if (!likesByPost.has(postId)) {
        likesByPost.set(postId, []);
      }
      likesByPost.get(postId)!.push(alert);
    }

    // Convert grouped likes into aggregated alert entries
    // Use the most recent like alert as the "primary" and attach others count
    const aggregatedLikes: AlertEntity[] = [];
    for (const [, postLikes] of likesByPost) {
      // Sort by createdAt descending — most recent first
      const sorted = [...postLikes].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        // Create aggregated alert with updated metadata
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
            })),
          },
          message: `${primary.metadata?.actorName || "Someone"} and ${othersCount} ${othersCount === 1 ? "other" : "others"} liked your post`,
        });
        aggregatedLikes.push(aggregatedAlert);
      } else {
        aggregatedLikes.push(primary);
      }
    }

    return [...aggregatedLikes, ...nonLikeAlerts];
  };

  // ── Aggregate STORY_REACTION alerts by storyId (Instagram-style) ──
  const aggregateStoryReactionAlerts = (alertsList: AlertEntity[]) => {
    const storyReactionAlerts = alertsList.filter(
      (a) => a.type === "STORY_REACTION",
    );
    const nonStoryReactionAlerts = alertsList.filter(
      (a) => a.type !== "STORY_REACTION",
    );

    const buildStoryReactionMessage = (
      reactionType: "like" | "hate",
      primaryAlert: AlertEntity,
      count: number,
    ) => {
      const username =
        primaryAlert.metadata?.actorUsername ||
        primaryAlert.metadata?.actorName ||
        "someone";
      const actorLabel = username.startsWith("@") ? username : `@${username}`;

      if (count <= 1) {
        return reactionType === "hate"
          ? `${actorLabel} hated your story`
          : `${actorLabel} liked your story`;
      }

      return reactionType === "hate"
        ? `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} hated your story`
        : `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} liked your story`;
    };

    // Group reactions by storyId + reactionType
    const reactionsByStory = new Map<string, AlertEntity[]>();
    for (const alert of storyReactionAlerts) {
      const reactionType =
        alert.metadata?.reactionType === "hate" ? "hate" : "like";
      const storyReactionKey = `${alert.entityId}:${reactionType}`;
      if (!reactionsByStory.has(storyReactionKey)) {
        reactionsByStory.set(storyReactionKey, []);
      }
      reactionsByStory.get(storyReactionKey)!.push(alert);
    }

    // Convert grouped reactions into aggregated alert entries
    const aggregatedReactions: AlertEntity[] = [];
    for (const [, storyReactions] of reactionsByStory) {
      const sorted = [...storyReactions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            reactionType:
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
              reactionType: a.metadata?.reactionType || "like",
            })),
          },
          message: buildStoryReactionMessage(
            primary.metadata?.reactionType === "hate" ? "hate" : "like",
            primary,
            sorted.length,
          ),
        });
        aggregatedReactions.push(aggregatedAlert);
      } else {
        aggregatedReactions.push(
          AlertEntity.create({
            ...primary,
            metadata: {
              ...primary.metadata,
              reactionType:
                primary.metadata?.reactionType === "hate" ? "hate" : "like",
            },
            message: buildStoryReactionMessage(
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
              primary,
              1,
            ),
          }),
        );
      }
    }

    return [...aggregatedReactions, ...nonStoryReactionAlerts];
  };

  const legacyAlertAggregators = [
    aggregateLikeAlerts,
    aggregateStoryReactionAlerts,
  ];
  void legacyAlertAggregators;

  const aggregationTargetForAlert = (alert: AlertEntity) => {
    switch (alert.type) {
      case "POST_LIKED":
        return `post-like:${alert.metadata?.postId || alert.entityId}`;
      case "STORY_REACTION":
        return `story-reaction:${alert.entityId}`;
      case "COMMENT_RECEIVED":
        return `post-comment:${alert.metadata?.postId || alert.entityId}`;
      case "COMMENT_REPLY":
        return `comment-reply:${
          alert.metadata?.parentCommentId ||
          alert.metadata?.commentId ||
          alert.metadata?.postId ||
          alert.entityId
        }`;
      case "STORY_REPLY":
        return `story-reply:${alert.entityId}`;
      default:
        return null;
    }
  };

  const getAggregatedActor = (alert: AlertEntity) => ({
    id: alert.actorId || alert.metadata?.actorId || alert.id,
    name: alert.metadata?.actorName || "Someone",
    username: String(alert.metadata?.actorUsername || "someone").replace(
      /^@/,
      "",
    ),
    avatar: alert.metadata?.actorAvatar || "",
    reactionType: alert.metadata?.reactionType || undefined,
    reactionTypes: alert.metadata?.reactionType
      ? [alert.metadata.reactionType === "hate" ? "hate" : "like"]
      : [],
    lastActivityAt: getAlertActivityTime(alert),
  });

  const getUniqueAggregatedActors = (sortedAlerts: AlertEntity[]) => {
    const uniqueActors = new Map<string, ReturnType<typeof getAggregatedActor>>();

    for (const alert of sortedAlerts) {
      const metadataActors = Array.isArray(alert.metadata?.actors)
        ? [...alert.metadata.actors].reverse()
        : [];

      for (const metadataActor of metadataActors) {
        const actor = {
          id: metadataActor.id || metadataActor.userId || alert.actorId,
          name: metadataActor.name || metadataActor.displayName || "Someone",
          username: String(metadataActor.username || "someone").replace(
            /^@/,
            "",
          ),
          avatar: metadataActor.avatar || metadataActor.actorAvatar || "",
          reactionType: metadataActor.reactionType || alert.metadata?.reactionType,
          reactionTypes: [
            ...new Set([
              ...(Array.isArray(metadataActor.reactionTypes)
                ? metadataActor.reactionTypes
                : []),
              ...(metadataActor.reactionType
                ? [metadataActor.reactionType]
                : []),
              ...(alert.metadata?.reactionType
                ? [alert.metadata.reactionType]
                : []),
            ]),
          ].map((type) => (type === "hate" ? "hate" : "like")),
          lastActivityAt: getAlertActivityTime(alert),
        };

        const existingActor = uniqueActors.get(actor.id);
        if (existingActor) {
          uniqueActors.set(actor.id, {
            ...existingActor,
            reactionTypes: [
              ...new Set([
                ...(existingActor.reactionTypes || []),
                ...actor.reactionTypes,
              ]),
            ],
          });
        } else {
          uniqueActors.set(actor.id, actor);
        }
      }

      if (metadataActors.length === 0) {
        const actor = getAggregatedActor(alert);
        const existingActor = uniqueActors.get(actor.id);
        if (existingActor) {
          uniqueActors.set(actor.id, {
            ...existingActor,
            reactionTypes: [
              ...new Set([
                ...(existingActor.reactionTypes || []),
                ...actor.reactionTypes,
              ]),
            ],
          });
        } else {
          uniqueActors.set(actor.id, actor);
        }
      }
    }

    return [...uniqueActors.values()];
  };

  const formatActorName = (actor: ReturnType<typeof getAggregatedActor>) => {
    const username = actor.username || actor.name || "someone";
    return username.startsWith("@") ? username : `@${username}`;
  };

  const formatAggregatedActorLine = (
    actors: ReturnType<typeof getAggregatedActor>[],
  ) => {
    const names = actors.slice(0, 3).map(formatActorName);

    if (actors.length <= 1) return names[0] || "@someone";
    if (actors.length === 2) return `${names[0]} and ${names[1]}`;
    if (actors.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;

    return `${names[0]}, ${names[1]} and ${actors.length - 2} others`;
  };

  const getAggregatedActionPhrase = (
    alert: AlertEntity,
    actors: ReturnType<typeof getAggregatedActor>[] = [],
  ) => {
    switch (alert.type) {
      case "POST_LIKED":
        return "liked your post";
      case "STORY_REACTION": {
        const allReactionTypes = new Set(
          actors.flatMap((actor) => actor.reactionTypes || []),
        );

        if (allReactionTypes.has("like") && allReactionTypes.has("hate")) {
          return actors.length === 1
            ? "liked and hated your story"
            : "reacted to your story";
        }

        return allReactionTypes.has("hate")
          ? "hated your story"
          : "liked your story";
      }
      case "COMMENT_RECEIVED":
        return "commented on your post";
      case "COMMENT_REPLY":
        return "replied to your comment";
      case "STORY_REPLY":
        return "replied to your story";
      default:
        return alert.message || "sent you an alert";
    }
  };

  const aggregateAllSocialAlerts = (alertsList: AlertEntity[]) => {
    const groupedAlerts = new Map<string, AlertEntity[]>();
    const passthroughAlerts: AlertEntity[] = [];

    for (const alert of alertsList) {
      const aggregationTarget = aggregationTargetForAlert(alert);

      if (!aggregationTarget) {
        passthroughAlerts.push(alert);
        continue;
      }

      const groupKey = `${alert.type}:${aggregationTarget}`;
      groupedAlerts.set(groupKey, [
        ...(groupedAlerts.get(groupKey) || []),
        alert,
      ]);
    }

    const aggregatedAlerts = [...groupedAlerts.values()].map((group) => {
      const sorted = [...group].sort(
        (a, b) =>
          new Date(getAlertActivityTime(b)).getTime() -
          new Date(getAlertActivityTime(a)).getTime(),
      );
      const latestAlert = sorted[0];
      const actors = getUniqueAggregatedActors(sorted);
      const latestActor = actors[0] || getAggregatedActor(latestAlert);
      const lastActivityAt = getAlertActivityTime(latestAlert);

      return AlertEntity.create({
        id: latestAlert.id,
        userId: latestAlert.userId,
        type: latestAlert.type,
        entityId: latestAlert.entityId,
        actorId: latestActor.id || latestAlert.actorId,
        message:
          actors.length > 1
            ? `${formatAggregatedActorLine(actors)} ${getAggregatedActionPhrase(latestAlert, actors)}`
            : `${formatActorName(latestActor)} ${getAggregatedActionPhrase(latestAlert, actors)}`,
        metadata: {
          ...latestAlert.metadata,
          actorName: latestActor.name,
          actorUsername: latestActor.username,
          actorAvatar: latestActor.avatar,
          actors,
          aggregatedCount: actors.length,
          aggregatedAlertIds: sorted.map((alert) => alert.id),
          lastActivityAt,
          commentText: latestAlert.metadata?.commentText,
          reactionType:
            latestAlert.type === "STORY_REACTION"
              ? actors.some((actor) => actor.reactionTypes?.includes("like")) &&
                actors.some((actor) => actor.reactionTypes?.includes("hate"))
                ? "mixed"
                : latestAlert.metadata?.reactionType === "hate"
                  ? "hate"
                  : "like"
              : latestAlert.metadata?.reactionType,
        },
        isRead: sorted.every((alert) => alert.isRead),
        createdAt: lastActivityAt,
        updatedAt: lastActivityAt,
      });
    });

    return [...aggregatedAlerts, ...passthroughAlerts].sort(
      (a, b) =>
        new Date(getAlertActivityTime(b)).getTime() -
        new Date(getAlertActivityTime(a)).getTime(),
    );
  };

  const aggregatedSocialAlerts = aggregateAllSocialAlerts(socialAlerts);

  // Deduplicate alerts by ID to prevent key conflicts
  const deduplicateAlerts = (alerts: any[]) => {
    const seen = new Set();
    return alerts.filter((alert) => {
      if (seen.has(alert.id)) {
        return false;
      }
      seen.add(alert.id);
      return true;
    });
  };

  const { today: socialToday, yesterday: socialYesterday } = groupAlertsByTime(
    deduplicateAlerts(aggregatedSocialAlerts),
  );
  const { today: personalDareToday, yesterday: personalDareYesterday } =
    groupAlertsByTime(deduplicateAlerts(personalDareAlerts));
  const { today: friendChallengeToday, yesterday: friendChallengeYesterday } =
    groupAlertsByTime(deduplicateAlerts(friendChallengeAlertsForDisplay));
  const liveViewerMap = new Map(
    liveViewers.map((viewer) => [viewer.userId, viewer.username]),
  );
  const getProfileViewStatusMessage = (
    createdAt: string,
    username?: string,
  ) => {
    const alertTime = new Date(createdAt);
    const now = new Date(clockTick);
    const diffInMs = now.getTime() - alertTime.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    let relativeTime = "Just now";
    if (diffInMins >= 1 && diffInMins < 60) {
      relativeTime = `${diffInMins}m ago`;
    } else if (diffInHours < 24) {
      relativeTime = `${diffInHours}h ago`;
    } else if (diffInDays >= 1) {
      relativeTime = `${diffInDays}d ago`;
    }

    return `@${(username || "someone").replace(/^@/, "")} was viewing your profile ${relativeTime}`;
  };

  const liveAwareSusAlerts = susAlerts.map((alert) => {
    if (alert.type !== "SUS_PROFILE_VIEWING" || !alert.actorId) {
      return alert;
    }

    const hasLiveViewer = liveViewerMap.has(alert.actorId);

    if (!hasLiveViewer) {
      const inactiveUsername =
        alert.metadata?.viewerUsername ||
        alert.metadata?.actorUsername ||
        "someone";

      return alert
        .updateMetadata({
          ...alert.metadata,
          isLive: false,
          viewerUsername: inactiveUsername.replace(/^@/, ""),
          actorUsername: inactiveUsername.replace(/^@/, ""),
        })
        .updateMessage(
          getProfileViewStatusMessage(
            getAlertActivityTime(alert),
            inactiveUsername,
          ),
        );
    }

    const liveUsername =
      liveViewerMap.get(alert.actorId) ||
      alert.metadata?.viewerUsername ||
      alert.metadata?.actorUsername ||
      "someone";

    return alert
      .updateMetadata({
        ...alert.metadata,
        isLive: true,
        lastActivityAt: new Date(clockTick).toISOString(),
        viewingStartTime:
          alert.metadata?.viewingStartTime || new Date(clockTick).toISOString(),
        viewerUsername: liveUsername.replace(/^@/, ""),
        actorUsername: liveUsername.replace(/^@/, ""),
      })
      .updateMessage(
        `@${liveUsername.replace(/^@/, "")} is viewing your profile right now`,
      );
  });

  const getRepeatedLikeActorKey = (alert: AlertEntity) => {
    if (alert.type !== "SUS_REPEATED_LIKES" || !alert.actorId) {
      return null;
    }

    const username = String(alert.metadata?.actorUsername || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

    if (!username) return null;

    return `${alert.actorId}:${username}`;
  };

  const mergeRepeatedLikeSusAlerts = (alertsList: AlertEntity[]) => {
    const mergedByActor = new Map<string, AlertEntity[]>();
    const passthroughAlerts: AlertEntity[] = [];

    alertsList.forEach((alert) => {
      const mergeKey = getRepeatedLikeActorKey(alert);
      if (!mergeKey) {
        passthroughAlerts.push(alert);
        return;
      }

      const existing = mergedByActor.get(mergeKey) ?? [];
      existing.push(alert);
      mergedByActor.set(mergeKey, existing);
    });

    const mergedRepeatedLikeAlerts = [...mergedByActor.values()].map(
      (group) => {
        const sortedGroup = [...group].sort(
          (a, b) =>
            new Date(getAlertActivityTime(b)).getTime() -
            new Date(getAlertActivityTime(a)).getTime(),
        );
        const highestTapAlert = [...group].sort(
          (a, b) =>
            Number(b.metadata?.tapCount || 0) -
              Number(a.metadata?.tapCount || 0) ||
            new Date(getAlertActivityTime(b)).getTime() -
              new Date(getAlertActivityTime(a)).getTime(),
        )[0];
        const latestAlert = sortedGroup[0] ?? highestTapAlert;

        if (!latestAlert || !highestTapAlert) {
          return group[0];
        }

        const tapCount = Math.max(
          ...group.map((item) => Number(item.metadata?.tapCount || 0)),
        );
        const actorUsername = String(
          latestAlert.metadata?.actorUsername ||
            highestTapAlert.metadata?.actorUsername ||
            "someone",
        ).replace(/^@/, "");

        return AlertEntity.create({
          id: latestAlert.id,
          userId: latestAlert.userId,
          type: latestAlert.type,
          entityId: latestAlert.entityId,
          actorId: latestAlert.actorId,
          message: `@${actorUsername} liked your post ${tapCount} times`,
          metadata: {
            ...latestAlert.metadata,
            tapCount,
          },
          isRead: group.every((item) => item.isRead),
          createdAt: getAlertActivityTime(latestAlert),
          updatedAt: latestAlert.updatedAt,
        });
      },
    );

    return [...passthroughAlerts, ...mergedRepeatedLikeAlerts];
  };

  const repeatedLikeMergedSusAlerts =
    mergeRepeatedLikeSusAlerts(liveAwareSusAlerts);

  const mergedSusAlerts = deduplicateAlerts(
    repeatedLikeMergedSusAlerts.filter((alert) => {
      if (alert.type !== "SUS_PROFILE_VIEWING" || !alert.actorId) {
        return true;
      }

      const latestForActor = repeatedLikeMergedSusAlerts
        .filter(
          (candidate) =>
            candidate.type === "SUS_PROFILE_VIEWING" &&
            candidate.actorId === alert.actorId,
        )
        .sort(
          (a, b) =>
            new Date(getAlertActivityTime(b)).getTime() -
            new Date(getAlertActivityTime(a)).getTime(),
        )[0];

      return latestForActor?.id === alert.id;
    }),
  );

  const liveAlertActorIds = new Set(
    mergedSusAlerts
      .filter((alert) => alert.type === "SUS_PROFILE_VIEWING" && alert.actorId)
      .map((alert) => alert.actorId),
  );

  const syntheticLiveAlerts = liveViewers
    .filter((viewer) => !liveAlertActorIds.has(viewer.userId))
    .map((viewer) =>
      AlertEntity.create({
        id: `live-profile-${viewer.userId}`,
        userId: currentUser?.id || "",
        type: "SUS_PROFILE_VIEWING",
        entityId: viewer.userId,
        actorId: viewer.userId,
        message: `@${viewer.username.replace(/^@/, "")} is viewing your profile right now`,
        metadata: {
          actorUsername: viewer.username.replace(/^@/, ""),
          viewerUsername: viewer.username.replace(/^@/, ""),
          isLive: true,
        },
        isRead: false,
        createdAt: new Date(clockTick).toISOString(),
        updatedAt: new Date(clockTick).toISOString(),
      }),
    );

  const susAlertsForDisplay = [...syntheticLiveAlerts, ...mergedSusAlerts].sort(
    (a, b) =>
      new Date(getAlertActivityTime(b)).getTime() -
      new Date(getAlertActivityTime(a)).getTime(),
  );

  const { today: susToday, yesterday: susYesterday } =
    groupAlertsByTime(susAlertsForDisplay);

  const currentAlerts =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? deduplicateAlerts(personalDareAlerts)
        : deduplicateAlerts(friendChallengeAlertsForDisplay)
      : activeTab === "social"
        ? deduplicateAlerts(aggregatedSocialAlerts)
        : susAlertsForDisplay;

  const isRealUnreadAlert = (alert: AlertEntity) =>
    !alert.id.startsWith("mock-") && !alert.isRead;
  const dareUnreadCount = [...personalDareAlerts, ...friendChallengeAlerts].filter(
    isRealUnreadAlert,
  ).length;
  const mainUnreadCount = deduplicateAlerts([
    ...aggregatedSocialAlerts,
    ...susAlerts,
  ]).filter(isRealUnreadAlert).length;
  const currentUnreadCount = currentAlerts.filter(isRealUnreadAlert).length;
  const currentLaneLabel =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? "Dare queue"
        : "Friends queue"
      : activeTab === "sus"
        ? "Sus watch"
        : "Social notifications";
  const currentLaneCaption =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? "Dares and truth updates"
        : "Friend challenge updates"
      : activeTab === "sus"
        ? "Private activity signals"
        : "Posts, comments, and requests";
  const isSusLane = alertMode === "main" && activeTab === "sus";

  // Helper method to get time ago
  const getTimeAgo = (createdAt: string): string => {
    const alertTime = new Date(createdAt);
    const now = new Date(clockTick);
    const diffInMs = now.getTime() - alertTime.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return "Just now";
    if (diffInMins < 60) return `${diffInMins}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  };

  useEffect(() => {
    const realAlerts = alerts.filter((alert) => !alert.id.startsWith("mock-"));
    const currentIds = new Set(realAlerts.map((alert) => alert.id));

    if (!hasHydratedAlertsRef.current) {
      knownAlertIdsRef.current = currentIds;
      hasHydratedAlertsRef.current = true;
      return;
    }

    const newlyArrivedAlerts = realAlerts.filter(
      (alert) => !knownAlertIdsRef.current.has(alert.id),
    );
    knownAlertIdsRef.current = currentIds;

    if (newlyArrivedAlerts.length === 0) return;

    const latestAlert = [...newlyArrivedAlerts].sort(
      (a, b) =>
        new Date(b.createdAt || b.updatedAt).getTime() -
        new Date(a.createdAt || a.updatedAt).getTime(),
    )[0];

    if (!latestAlert) return;

    if (isPersonalDareAlert(latestAlert)) {
      setAlertMode("dare");
      setDareAlertTab("personal");
      return;
    }

    if (isFriendChallengeAlert(latestAlert)) {
      setAlertMode("dare");
      setDareAlertTab("friends");
      return;
    }

    if (latestAlert.isSusAlert()) {
      setAlertMode("main");
      setActiveTab("sus");
      return;
    }

    if (latestAlert.isSocialAlert()) {
      setAlertMode("main");
      setActiveTab("social");
    }
  }, [alerts]);

  // Get actor info from metadata (resolve from profileDataStore + avatarStore)
  const alertUserProfiles = useProfileDataStore((s) => s.userProfiles);
  const userAvatars = useAvatarStore((s) => s.userAvatars);
  const getActorInfo = (alert: AlertEntity) => {
    const cachedProfile = alert.actorId
      ? alertUserProfiles[alert.actorId]
      : null;

    // Resolve username: cached profile > metadata > fallback
    let username = "unknown";
    if (cachedProfile?.username) {
      username = cachedProfile.username;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      username = alert.metadata.actorUsername;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      username = alert.metadata.actorName.toLowerCase().replace(/\s+/g, "_");
    }

    // Resolve display name: cached profile > metadata > fallback
    let displayName = "Unknown User";
    const cachedName = cachedProfile?.displayName;
    if (
      cachedName &&
      cachedName !== "Unknown User" &&
      cachedName !== "unknown"
    ) {
      displayName = cachedName;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      displayName = alert.metadata.actorName;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      displayName = alert.metadata.actorUsername;
    } else if (
      cachedProfile?.username &&
      cachedProfile.username !== "unknown"
    ) {
      displayName = cachedProfile.username;
    }

    // Resolve avatar: avatarStore (freshest) > metadata > empty
    let avatar = "";
    if (alert.actorId && userAvatars[alert.actorId]) {
      avatar = userAvatars[alert.actorId];
    } else if (alert.metadata.actorAvatar) {
      avatar = alert.metadata.actorAvatar;
    }

    return {
      name: displayName,
      avatar,
      username,
      userId: alert.actorId,
    };
  };

  const getActorHandle = (actorInfo: ReturnType<typeof getActorInfo>) => {
    return actorInfo.username && actorInfo.username !== "unknown"
      ? `@${actorInfo.username.replace(/^@/, "")}`
      : actorInfo.name;
  };

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const getAlertActionMessage = (
    alert: AlertEntity,
    actorInfo: ReturnType<typeof getActorInfo>,
  ) => {
    let message = String(alert.message || "").trim();
    const actorVariants = [
      actorInfo.name,
      actorInfo.username,
      actorInfo.username ? `@${actorInfo.username.replace(/^@/, "")}` : "",
      alert.metadata?.actorName,
      alert.metadata?.actorUsername,
      alert.metadata?.actorUsername
        ? `@${String(alert.metadata.actorUsername).replace(/^@/, "")}`
        : "",
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter(
        (value, index, values) =>
          value.length > 0 &&
          value.toLowerCase() !== "unknown" &&
          value.toLowerCase() !== "unknown user" &&
          values.findIndex(
            (candidate) => candidate.toLowerCase() === value.toLowerCase(),
          ) === index,
      )
      .sort((a, b) => b.length - a.length);

    for (const variant of actorVariants) {
      const pattern = new RegExp(
        `^\\s*${escapeRegex(variant)}\\s*(?:[-:•]|\\s+)\\s*`,
        "i",
      );
      if (pattern.test(message)) {
        message = message.replace(pattern, "").trim();
        break;
      }
    }

    return message || alert.message;
  };

  const handleAcceptFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const alertData = alerts.find((a: any) => a.id === alertId);
      if (!alertData) {
        throw new Error("Alert not found");
      }

      // Special handling for legacy alerts with "pending" entityId or invalid values
      if (
        friendshipId === "pending" ||
        friendshipId === "friendships" ||
        !friendshipId ||
        friendshipId.length < 10
      ) {
        const { friendsService } =
          await import("@/middleware/services/service-factory");
        const friendshipResponse = await friendsService.getFriendshipStatus(
          currentUser.id,
          alertData.actorId,
        );

        if (friendshipResponse.success && friendshipResponse.friendship) {
          friendshipId = friendshipResponse.friendship.id;
        } else {
          throw new Error(
            "Friend request not found - unable to locate friendship",
          );
        }
      }

      const { friendsService } =
        await import("@/middleware/services/service-factory");

      const result = await friendsService.acceptFriendRequest(
        friendshipId,
        currentUser.id,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to accept friend request");
      }

      // Mark this alert as accepted in local state
      setFriendshipStatuses((prev: Map<string, "accepted" | "rejected">) =>
        new Map(prev).set(alertId, "accepted"),
      );

      // Update the existing alert to show friendship established
      const { alertService } =
        await import("@/middleware/services/service-factory");
      const alertResponse = await alertService.getAlerts({
        userId: currentUser.id,
        limit: 1,
      });
      const originalAlert = alertResponse.alerts?.find(
        (a: any) => a.id === alertId,
      );

      if (originalAlert) {
        const actorName = originalAlert.metadata.actorName || "Someone";
        const actorUsername = originalAlert.metadata.actorUsername || "someone";

        await alertService.updateAlert(alertId, currentUser.id, {
          type: "FRIENDSHIP_ESTABLISHED" as any,
          message: `You and ${actorName} (@${actorUsername}) are now friends!`,
          metadata: {
            ...originalAlert.metadata,
            status: "accepted",
          },
        });
      }

      await markAsRead(alertId);
      subscribeToAlerts(currentUser.id);

      // Trigger feed refresh to include friend's posts
      const { usePostsStore } = await import("../../stores/usePostsStore");
      usePostsStore.getState().clearPersistedData();
      await usePostsStore.getState().loadPosts(currentUser.id);

      // Increment friends count for both users
      const { useUserProfileStore } =
        await import("../../stores/useUserProfileStore");
      useUserProfileStore.getState().incrementFriendsCount(currentUser.id);

      if (originalAlert?.actorId) {
        useUserProfileStore
          .getState()
          .incrementFriendsCount(originalAlert.actorId);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
    }
  };

  const handleRejectFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      await friendsService.rejectFriendRequest(friendshipId, currentUser.id);
      await markAsRead(alertId);
      subscribeToAlerts(currentUser.id); // Refresh alerts
    } catch (error) {
      console.error("Error rejecting friend request:", error);
    }
  };

  const getSocialAlertMeta = (alert: AlertEntity) => {
    switch (alert.type) {
      case "DARE_RECEIVED":
        return {
          label: "Dare Received",
          accentBarClass: "bg-[#f59e0b]",
          pillClass: "border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]",
          iconWrapClass: "border-[#f59e0b]/24 bg-[#f59e0b]/12 text-[#fbbf24]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "DARE_ACCEPTED":
        return {
          label: "Dare Accepted",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "DARE_REFUSED":
        return {
          label: "Dare Refused",
          accentBarClass: "bg-red-400",
          pillClass: "border-red-500/25 bg-red-500/12 text-red-300",
          iconWrapClass: "border-red-500/24 bg-red-500/12 text-red-300",
          glowClass: "bg-red-500/14",
          railClass: "from-red-500/0 via-red-500/80 to-red-500/0",
          icon: <XCircle size={12} />,
        };
      case "DARE_COMPLETED":
        return {
          label: "Dare Completed",
          accentBarClass: "bg-[#fcd34d]",
          pillClass: "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fcd34d]",
          iconWrapClass: "border-[#f59e0b]/24 bg-[#f59e0b]/12 text-[#fcd34d]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "DARE_FRIEND_ACTIVITY":
        return {
          label:
            alert.metadata?.activityType === "completed"
              ? "Friend Completed"
              : "Friends Dare",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Users size={12} />,
        };
      case "TRUTH_RECEIVED":
        return {
          label: "Truth Question",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageCircle size={12} />,
        };
      case "TRUTH_ANSWERED":
        return {
          label: "Truth Answered",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "TRUTH_FRIEND_ACTIVITY":
        return {
          label: "Friends Truth",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <Users size={12} />,
        };
      case "COMMENT_RECEIVED":
        return {
          label: "New Comment",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageCircle size={12} />,
        };
      case "COMMENT_REPLY":
        return {
          label: "Comment Reply",
          accentBarClass: "bg-violet-400",
          pillClass: "border-violet-500/25 bg-violet-500/10 text-violet-300",
          iconWrapClass: "border-violet-500/24 bg-violet-500/12 text-violet-300",
          glowClass: "bg-violet-500/14",
          railClass: "from-violet-500/0 via-violet-500/80 to-violet-500/0",
          icon: <MessageSquare size={12} />,
        };
      case "STORY_REACTION": {
        const isMixedReaction = alert.metadata?.reactionType === "mixed";
        const isHateReaction =
          alert.metadata?.reactionType === "hate" ||
          String(alert.message || "").toLowerCase().includes("hated your story");

        return {
          label: isMixedReaction
            ? "Story Reacted"
            : isHateReaction
              ? "Story Hated"
              : "Story Liked",
          accentBarClass: isMixedReaction
            ? "bg-fuchsia-400"
            : isHateReaction
              ? "bg-red-400"
              : "bg-[#4ade80]",
          pillClass: isMixedReaction
            ? "border-fuchsia-500/25 bg-fuchsia-500/12 text-fuchsia-300"
            : isHateReaction
            ? "border-red-500/25 bg-red-500/12 text-red-300"
            : "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: isMixedReaction
            ? "border-fuchsia-500/24 bg-fuchsia-500/12 text-fuchsia-300"
            : isHateReaction
            ? "border-red-500/24 bg-red-500/12 text-red-300"
            : "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: isMixedReaction
            ? "bg-fuchsia-500/14"
            : isHateReaction
              ? "bg-red-500/14"
              : "bg-[#4ade80]/14",
          railClass: isMixedReaction
            ? "from-fuchsia-500/0 via-fuchsia-500/80 to-fuchsia-500/0"
            : isHateReaction
            ? "from-red-500/0 via-red-500/80 to-red-500/0"
            : "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: isMixedReaction ? (
            <Sparkles size={12} />
          ) : isHateReaction ? (
            <XCircle size={12} />
          ) : (
            <Heart size={12} fill="currentColor" />
          ),
        };
      }
      case "POST_LIKED":
        return {
          label: "Post Liked",
          accentBarClass: "bg-pink-400",
          pillClass: "border-pink-500/25 bg-pink-500/10 text-pink-300",
          iconWrapClass: "border-pink-500/24 bg-pink-500/12 text-pink-300",
          glowClass: "bg-pink-500/14",
          railClass: "from-pink-500/0 via-pink-500/80 to-pink-500/0",
          icon: <Heart size={12} fill="currentColor" />,
        };
      case "FRIEND_REQUEST":
        return {
          label: "Friend Request",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Users size={12} />,
        };
      default:
        return {
          label: "Alert",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-white/10 bg-white/[0.05] text-white",
          iconWrapClass: "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]",
          glowClass: "bg-[#4ade80]/10",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/60 to-[#4ade80]/0",
          icon: <BellRing size={12} />,
        };
    }
  };

  const renderSectionHeader = (
    title: string,
    tone: "primary" | "muted" | "danger" = "primary",
  ) => {
    const toneClasses =
      tone === "danger"
        ? {
            text: "text-red-300",
            line: "from-red-500/0 via-red-500/70 to-red-500/0",
            iconWrap: "border-red-500/20 bg-red-500/10 text-red-300",
          }
        : tone === "muted"
          ? {
              text: "text-[#94a3b8]",
              line: "from-white/0 via-white/14 to-white/0",
              iconWrap: "border-white/10 bg-white/[0.04] text-[#94a3b8]",
            }
          : {
              text: "text-[#86efac]",
              line: "from-[#4ade80]/0 via-[#4ade80]/70 to-[#4ade80]/0",
              iconWrap: "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]",
            };

    return (
      <div className="alerts-section-header mb-3 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[16px] border shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClasses.iconWrap}`}
        >
          {tone === "danger" ? (
            <AlertTriangle size={14} />
          ) : tone === "primary" ? (
            <Sparkles size={14} />
          ) : (
            <BellRing size={14} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.24em] ${toneClasses.text}`}
          >
            {title}
          </p>
          <div
            className={`mt-2 h-px w-full bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${toneClasses.line}`}
          />
        </div>
      </div>
    );
  };

  const renderSocialAlertMessage = (
    alert: AlertEntity,
    message = alert.message,
  ) => message;

  const renderAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const meta = getSocialAlertMeta(alert);
    const actorHandle = getActorHandle(actorInfo);
    const actionMessage = getAlertActionMessage(alert, actorInfo);
    const isAggregatedAlert = Number(alert.metadata?.aggregatedCount || 0) > 1;
    const isDareOrTruth =
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_COMPLETED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED" ||
      alert.type === "DARE_FRIEND_ACTIVITY" ||
      alert.type === "TRUTH_FRIEND_ACTIVITY";

    const isClickable =
      isDareOrTruth ||
      alert.type === "COMMENT_RECEIVED" ||
      alert.type === "COMMENT_REPLY";
    const isCompactAlertCapsule =
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_COMPLETED" ||
      alert.type === "STORY_REACTION" ||
      alert.type === "POST_LIKED" ||
      alert.type === "FRIEND_REQUEST";

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`alerts-card group relative isolate overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-300 ${isClickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#4ade80]/24 hover:shadow-[0_28px_76px_rgba(0,0,0,0.54),0_0_28px_rgba(74,222,128,0.1)]" : ""}`}
        onClick={() => isClickable && handleAlertClick(alert)}
      >
        <div
          className={`pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${meta.railClass}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_70%)] opacity-60" />
        <div className="flex items-start space-x-3">
          <div className="relative shrink-0">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="sm"
              userId={actorInfo.userId}
              username={actorInfo.username}
              disableGhostMode
            />
            <div
              className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full shadow-[0_8px_22px_rgba(0,0,0,0.34)] [&_svg]:h-3 [&_svg]:w-3 ${meta.iconWrapClass}`}
            >
              {meta.icon}
            </div>
            {alert.metadata.isLive && (
              <div className="absolute -top-1 -right-1 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-black bg-[#4ade80]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                <div
                  className={`inline-flex items-center rounded-full border font-bold uppercase tracking-[0.16em] ${
                    isCompactAlertCapsule
                      ? "gap-1 px-2.5 py-0.5 text-[10px]"
                      : "gap-1.5 px-3 py-1 text-[11px]"
                  } ${meta.pillClass}`}
                >
                  {meta.icon}
                  <span>{meta.label}</span>
                </div>
                {alert.metadata.isLive && alert.metadata.liveDuration && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1 text-[11px] font-semibold text-[#86efac]">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" />
                    <span>{alert.metadata.liveDuration}</span>
                  </div>
                )}
              </div>
              <span className="shrink-0 pt-0.5 text-[10px] font-medium text-[#64748b]">
                {getTimeAgo(getAlertActivityTime(alert))}
              </span>
            </div>

            <p className="mb-2.5 min-w-0 text-[13px] leading-snug text-[#e2e8f0]">
              {isAggregatedAlert ? (
                <span>{renderSocialAlertMessage(alert, alert.message)}</span>
              ) : (
                <>
                  <span className="font-bold tracking-tight text-[#6ee7b7]">
                    {actorHandle}
                  </span>
                  <span className="mx-1.5 font-semibold text-[#64748b]">-</span>
                  <span>{renderSocialAlertMessage(alert, actionMessage)}</span>
                </>
              )}
            </p>

            {false && isClickable && (
              <div className="hidden items-center text-[#4ade80] text-xs font-medium mb-2">
                <span></span>
              </div>
            )}

            {/* Add icons for dare/truth alerts */}
            {alert.type === "DARE_RECEIVED" && (
              <div className="hidden items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Received</span>
              </div>
            )}

            {alert.type === "DARE_ACCEPTED" && (
              <div className="hidden items-center space-x-2 text-green-400 text-xs font-medium mb-2">
                <CheckCircle size={12} />
                <span>Dare Accepted</span>
              </div>
            )}

            {alert.type === "DARE_REFUSED" && (
              <div className="hidden items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <XCircle size={12} />
                <span>Dare Refused</span>
              </div>
            )}

            {alert.type === "DARE_COMPLETED" && (
              <div className="hidden items-center space-x-2 text-[#f59e0b] text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Completed</span>
              </div>
            )}

            {alert.type === "TRUTH_RECEIVED" && (
              <div className="hidden items-center space-x-2 text-blue-400 text-xs font-medium mb-2">
                <MessageCircle size={12} />
                <span>Truth Question</span>
              </div>
            )}

            {alert.type === "TRUTH_ANSWERED" && (
              <div className="hidden items-center space-x-2 text-green-400 text-xs font-medium mb-2">
                <CheckCircle size={12} />
                <span>Truth Answered</span>
              </div>
            )}

            {/* COMMENT_RECEIVED and COMMENT_REPLY alerts */}
            {false &&
              (alert.type === "COMMENT_RECEIVED" ||
                alert.type === "COMMENT_REPLY") && (
                <div className="flex items-center space-x-2 text-blue-400 text-xs font-medium mb-2">
                  <MessageSquare size={12} />
                  <span>
                    {alert.type === "COMMENT_REPLY"
                      ? "Comment Reply"
                      : "New Comment"}
                  </span>
                </div>
              )}

            {/* Show comment text for comment alerts */}
            {(alert.type === "COMMENT_RECEIVED" ||
              alert.type === "COMMENT_REPLY") &&
              alert.metadata.commentText && (
                <div className="mt-2 rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div
                    className={`mb-2 h-1 w-12 rounded-full ${meta.accentBarClass}`}
                  />
                  <p className="text-[13px] leading-snug text-[#e2e8f0]">
                    {alert.metadata.commentText}
                  </p>
                </div>
              )}

            {/* Clickable indicator for comment alerts */}
            {(alert.type === "COMMENT_RECEIVED" ||
              alert.type === "COMMENT_REPLY") && (
              <div className="hidden items-center text-[#4ade80] text-xs font-medium mb-2 mt-2">
                <span></span>
              </div>
            )}
            {alert.type === "POST_LIKED" && (
              <div className="mt-2.5 flex items-center gap-2.5 rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-2.5">
                {/* Stacked avatars of likers */}
                {alert.metadata.allLikers &&
                  alert.metadata.allLikers.length > 1 && (
                    <div className="flex shrink-0 -space-x-2">
                      {alert.metadata.allLikers
                        .slice(0, 3)
                        .map((liker: any, i: number) => (
                          <Avatar
                            key={i}
                            src={liker.avatar}
                            alt={liker.username}
                            size="xs"
                            userId={liker.userId}
                            username={liker.username}
                            disableGhostMode
                          />
                        ))}
                      {alert.metadata.allLikers.length > 3 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#191d19] text-[10px] font-bold text-[#94a3b8]">
                          +{alert.metadata.allLikers.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-white">
                    {alert.metadata.allLikers?.length || 1} people reacted to
                    your post
                  </p>
                </div>
                {alert.metadata.postThumbnail && (
                  <div className="ml-auto h-10 w-10 shrink-0 overflow-hidden rounded-[14px] border border-white/10 bg-[#161a16] shadow-[0_10px_22px_rgba(0,0,0,0.22)]">
                    <img
                      src={alert.metadata.postThumbnail}
                      alt="Post"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {alert.metadata.isLive && alert.metadata.liveDuration && (
              <p className="hidden text-[#4ade80] text-xs font-medium mb-2">
                {alert.metadata.liveDuration}
              </p>
            )}

            {alert.type === "FRIEND_REQUEST" && (
              <div className="mt-3 flex gap-2">
                {friendshipStatuses.get(alert.id) === "accepted" ? (
                  <div className="flex-1 rounded-2xl border border-[#4ade80]/25 bg-[#4ade80]/10 py-2.5 text-center text-xs font-semibold text-[#86efac]">
                    Friend Request Accepted
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        handleAcceptFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-3 py-2.5 text-xs font-semibold text-black shadow-[0_12px_28px_rgba(74,222,128,0.22)] transition-all hover:brightness-105"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        handleRejectFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/14"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render sus activity alert item with specialized UI ──
  const renderSusAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const meta = alert.metadata || {};
    const actorHandle = getActorHandle(actorInfo);
    const actionMessage = getAlertActionMessage(alert, actorInfo);
    const isLiveProfileView =
      alert.type === "SUS_PROFILE_VIEWING" && !!meta.isLive;

    // Icon & accent color per sus type
    let icon = <Eye size={16} className="text-red-400" />;
    let accentColor = "text-red-400";
    let bgAccent = "border-red-500/10";

    if (alert.type === "SUS_REPEATED_LIKES") {
      icon = <Heart size={16} className="text-pink-400" fill="#f472b6" />;
      accentColor = "text-pink-400";
      bgAccent = "border-pink-500/10";
    } else if (alert.type === "SUS_PHOTO_VIEWS") {
      icon = <Camera size={16} className="text-amber-400" />;
      accentColor = "text-amber-400";
      bgAccent = "border-amber-500/10";
    } else if (alert.type === "SUS_MENTION_TALKING") {
      icon = <MessageSquare size={16} className="text-purple-400" />;
      accentColor = "text-purple-400";
      bgAccent = "border-purple-500/10";
    } else if (alert.type === "SUS_PROFILE_VIEWING") {
      icon = <Eye size={16} className="text-red-400" />;
      accentColor = "text-red-400";
      bgAccent = "border-red-500/10";
    } else if (alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") {
      icon = <Star size={16} className="text-yellow-300" fill="#fde047" />;
      accentColor = "text-yellow-300";
      bgAccent = "border-yellow-400/10";
    }

    const susLabel =
      alert.type === "SUS_REPEATED_LIKES"
        ? "Repeated Likes"
        : alert.type === "SUS_PHOTO_VIEWS"
          ? "Photo Views"
          : alert.type === "SUS_MENTION_TALKING"
            ? "Mention Talk"
            : alert.type === "SUS_CLOSE_FRIEND_ACTIVITY"
              ? "Close Friend"
              : isLiveProfileView
                ? "Live View"
                : "Profile View";
    const susPillClass =
      alert.type === "SUS_REPEATED_LIKES"
        ? "border-pink-500/20 bg-pink-500/10 text-pink-300"
        : alert.type === "SUS_PHOTO_VIEWS"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
          : alert.type === "SUS_MENTION_TALKING"
            ? "border-purple-500/20 bg-purple-500/10 text-purple-300"
            : alert.type === "SUS_CLOSE_FRIEND_ACTIVITY"
              ? "border-yellow-400/20 bg-yellow-400/10 text-yellow-200"
              : "border-red-500/25 bg-red-500/10 text-red-200";

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`alerts-card group relative isolate overflow-hidden rounded-[30px] border p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-300 ${bgAccent} ${isLiveProfileView ? "border-red-500/18 bg-[linear-gradient(135deg,rgba(127,29,29,0.2),rgba(18,24,18,0.98)_48%,rgba(7,10,8,0.98)_100%)] hover:shadow-[0_28px_76px_rgba(0,0,0,0.54),0_0_28px_rgba(239,68,68,0.1)] ring-1 ring-red-500/24" : "border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] hover:-translate-y-0.5 hover:shadow-[0_28px_76px_rgba(0,0,0,0.54)]"} ${!alert.isRead ? "ring-1 ring-[#4ade80]/18" : ""}`}
        onClick={() => {
          if (!alert.id.startsWith("live-profile-")) {
            void handleAlertClick(alert);
          }
        }}
      >
        <div
          className={`pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${accentColor === "text-pink-400" ? "from-pink-500/0 via-pink-500/75 to-pink-500/0" : accentColor === "text-amber-400" ? "from-amber-500/0 via-amber-500/75 to-amber-500/0" : accentColor === "text-purple-400" ? "from-purple-500/0 via-purple-500/75 to-purple-500/0" : accentColor === "text-yellow-300" ? "from-[#4ade80]/0 via-[#4ade80]/76 to-[#4ade80]/0" : "from-red-500/0 via-red-500/75 to-red-500/0"}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_70%)] opacity-60" />
        <div className="flex items-start space-x-3">
          {/* Avatar with sus type icon overlay */}
          <div className="relative shrink-0">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="sm"
              userId={actorInfo.userId}
              username={actorInfo.username}
              disableGhostMode
            />
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/8 bg-[#070907] shadow-[0_8px_22px_rgba(0,0,0,0.34)] [&_svg]:h-3 [&_svg]:w-3">
              {icon}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${susPillClass} [&_svg]:h-3 [&_svg]:w-3`}
                >
                  {icon}
                  <span>{susLabel}</span>
                </div>
                {isLiveProfileView && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1">
                    <Eye size={12} className="text-red-300" />
                    <span className="text-[11px] font-semibold text-red-200">
                      Watching right now
                    </span>
                  </div>
                )}
                {alert.type === "SUS_REPEATED_LIKES" && meta.tapCount && (
                  <div className="inline-flex items-center space-x-1.5 rounded-full border border-pink-500/20 bg-pink-500/10 px-2.5 py-1">
                    <Heart size={12} className="text-pink-400" fill="#f472b6" />
                    <span className="text-[11px] font-bold text-pink-400">
                      {meta.tapCount}x
                    </span>
                  </div>
                )}
                {alert.type === "SUS_PHOTO_VIEWS" && meta.viewCount && (
                  <div className="inline-flex items-center space-x-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1">
                    <Eye size={12} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-400">
                      {meta.viewCount} views
                    </span>
                  </div>
                )}
                {alert.type === "SUS_MENTION_TALKING" && meta.actorUsername && (
                  <div className="inline-flex items-center space-x-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-1">
                    <span className="text-[11px] font-bold text-purple-300">
                      @{meta.actorUsername}
                    </span>
                  </div>
                )}
                {alert.type === "SUS_MENTION_TALKING" && meta.otherUsername && (
                  <div className="inline-flex items-center space-x-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-1">
                    <span className="text-[11px] font-bold text-purple-300">
                      @{meta.otherUsername}
                    </span>
                  </div>
                )}
                {alert.type === "SUS_MENTION_TALKING" && meta.time && (
                  <div className="inline-flex items-center space-x-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                    <MessageSquare size={12} className="text-purple-400" />
                    <span className="text-[11px] text-[#94a3b8]">
                      {meta.time}
                    </span>
                  </div>
                )}
                {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" &&
                  meta.interactionType && (
                    <div className="inline-flex rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1">
                      <span className="text-[11px] font-bold text-yellow-200">
                        {meta.interactionType === "commented"
                          ? "Comment"
                          : meta.interactionType === "repeated_like"
                            ? `${meta.tapCount || 0}x likes`
                            : meta.interactionType === "dedicated_story"
                              ? "Story dedication"
                              : `${meta.distinctLikedPosts || 0} posts liked`}
                      </span>
                    </div>
                  )}
                {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" &&
                  meta.interactionType === "dedicated_story" && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2.5 py-1">
                      {meta.targetAvatar && (
                        <img
                          src={meta.targetAvatar}
                          alt={meta.targetName || meta.targetUsername || "Target"}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      )}
                      <span className="text-[11px] font-bold text-[#bbf7d0]">
                        To @{meta.targetUsername || "someone"}
                      </span>
                    </div>
                  )}
              </div>
              <span className="shrink-0 pt-0.5 text-[10px] font-medium text-[#64748b]">
                {getTimeAgo(getAlertActivityTime(alert))}
              </span>
            </div>

            <p className="mb-2.5 min-w-0 text-[13px] leading-snug text-[#e2e8f0]">
              <span className={`font-bold ${accentColor}`}>{actorHandle}</span>
              <span className="mx-1.5 font-semibold text-[#64748b]">-</span>
              <span>{actionMessage}</span>
            </p>

            {/* Post thumbnail for repeated likes & photo views */}
            {(alert.type === "SUS_REPEATED_LIKES" ||
              alert.type === "SUS_PHOTO_VIEWS" ||
              alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") &&
              (meta.postThumbnail || meta.storyThumbnail) && (
                <div className="mt-2.5 flex items-center space-x-2.5 rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-2.5">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[14px] border border-white/10 bg-[#181818]">
                    <img
                      src={meta.postThumbnail || meta.storyThumbnail}
                      alt={meta.storyThumbnail ? "Story" : "Post"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  {meta.postContent && (
                    <p className="flex-1 truncate text-[11px] text-[#94a3b8]">
                      {meta.postContent.slice(0, 60)}
                      {meta.postContent.length > 60 ? "..." : ""}
                    </p>
                  )}
                </div>
              )}

            {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {meta.commentText && (
                  <div className="w-full rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(27,24,18,0.94),rgba(19,16,12,0.98))] p-3">
                    <p className="text-[13px] leading-snug text-[#e2e8f0]">
                      {meta.commentText}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Unread dot */}
            {!alert.isRead && (
              <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-container alerts-screen flex flex-col bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.18),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]">
      <style>{`
        .alerts-screen {
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes alertsFloatIn {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes alertsSweep {
          from { transform: translateX(-120%); }
          to { transform: translateX(120%); }
        }
        @keyframes alertsSignalSweep {
          0% { transform: translateX(-125%); }
          42% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        @keyframes alertsSignalPulse {
          0%, 100% { opacity: 0.56; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .alerts-card {
          animation: alertsFloatIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .alerts-signal-card {
          animation: alertsFloatIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .alerts-signal-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.105), transparent);
          animation: alertsSignalSweep 6.8s ease-in-out infinite;
          pointer-events: none;
        }
        .alerts-signal-dot {
          animation: alertsSignalPulse 2.2s ease-in-out infinite;
        }
        .alerts-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent);
          opacity: 0;
          transform: translateX(-120%);
          pointer-events: none;
        }
        .alerts-card:hover::after {
          animation: alertsSweep 1.4s ease-in-out;
          opacity: 1;
        }
        .alerts-section-header {
          animation: alertsFloatIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
      {/* Header */}
      <div className="safe-area-top sticky top-0 z-10 overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_50%_-40%,rgba(74,222,128,0.18),transparent_58%),linear-gradient(180deg,rgba(10,15,11,0.98)_0%,rgba(4,7,5,0.94)_100%)] shadow-[0_20px_54px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
        <div className="px-4 pb-2 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="z-10 flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_16px_38px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#4ade80]/35 hover:bg-[#4ade80]/10 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-[30px] font-black leading-none tracking-tight text-white">
                  Alerts
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAlertMode("dare");
                  setDareAlertTab("personal");
                }}
                className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-[20px] border text-lg font-black shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition-colors ${
                  alertMode === "dare"
                    ? "border-[#4ade80]/28 bg-[#4ade80]/12 text-[#86efac]"
                    : "border-white/8 bg-white/[0.04] text-[#94a3b8] hover:border-[#4ade80]/24 hover:text-white"
                }`}
                aria-label="Open dare alert organizer"
              >
                D
                {dareUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-black bg-[#4ade80] px-1 text-[9px] font-black leading-none text-black shadow-[0_0_16px_rgba(74,222,128,0.42)]">
                    {dareUnreadCount > 9 ? "9+" : dareUnreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAlertMode("main")}
                className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-[20px] border shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition-colors ${
                  alertMode === "main"
                    ? "border-[#4ade80]/24 bg-white/[0.04] text-[#4ade80]"
                    : "border-white/8 bg-white/[0.04] text-[#94a3b8] hover:border-[#4ade80]/24 hover:text-white"
                }`}
                aria-label="Open main alerts"
              >
                <BellRing size={22} />
                {mainUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-black bg-[#4ade80] px-1 text-[9px] font-black leading-none text-black shadow-[0_0_16px_rgba(74,222,128,0.42)]">
                    {mainUnreadCount > 9 ? "9+" : mainUnreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="px-4 pb-3.5">
          <div className="flex rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]">
            {alertMode === "main" ? (
              <>
                <button
                  onClick={() => setActiveTab("social")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    activeTab === "social"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                >
                  Social
                </button>
                <button
                  onClick={() => setActiveTab("sus")}
                  className={`relative flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    activeTab === "sus"
                      ? "bg-[linear-gradient(135deg,#ef4444,#b91c1c)] text-white shadow-[0_10px_28px_rgba(239,68,68,0.26)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                >
                  Sus Activity
                  {susAlerts.filter((a) => !a.isRead).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border border-black">
                      {susAlerts.filter((a) => !a.isRead).length}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setDareAlertTab("personal")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    dareAlertTab === "personal"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                >
                  Personal
                </button>
                <button
                  onClick={() => setDareAlertTab("friends")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    dareAlertTab === "friends"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                >
                  Friends
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+2rem)] pt-4">
        <div
          className={`alerts-signal-card relative mb-4 overflow-hidden rounded-[28px] border px-4 py-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.34),0_0_28px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] ${
            isSusLane
              ? "border-red-500/18 bg-[radial-gradient(circle_at_18%_-18%,rgba(239,68,68,0.16),transparent_34%),radial-gradient(circle_at_92%_16%,rgba(74,222,128,0.1),transparent_32%),linear-gradient(180deg,rgba(28,18,18,0.98),rgba(9,8,8,0.98))]"
              : "border-[#4ade80]/22 bg-[radial-gradient(circle_at_18%_-18%,rgba(74,222,128,0.16),transparent_34%),radial-gradient(circle_at_92%_16%,rgba(14,165,233,0.12),transparent_32%),linear-gradient(180deg,rgba(22,28,23,0.98),rgba(8,12,9,0.98))]"
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-x-8 top-0 z-[1] h-px ${
              isSusLane
                ? "bg-[linear-gradient(90deg,rgba(239,68,68,0),rgba(239,68,68,0.72),rgba(74,222,128,0.4),rgba(239,68,68,0))]"
                : "bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.42),rgba(74,222,128,0))]"
            }`}
          />
          <div className="relative z-[1] flex items-center gap-3">
            <div
              className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[22px] border shadow-[0_14px_34px_rgba(74,222,128,0.1)] ${
                isSusLane
                  ? "border-red-500/20 bg-red-500/10 text-red-200"
                  : "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]"
              }`}
            >
              {alertMode === "dare" ? (
                <Target size={22} strokeWidth={2.5} />
              ) : isSusLane ? (
                <Eye size={22} strokeWidth={2.5} />
              ) : (
                <BellRing size={22} strokeWidth={2.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`alerts-signal-dot h-2 w-2 shrink-0 rounded-full ${
                    isSusLane
                      ? "bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.55)]"
                      : "bg-[#4ade80] shadow-[0_0_14px_rgba(74,222,128,0.55)]"
                  }`}
                />
                <p
                  className={`truncate text-[11px] font-black uppercase tracking-[0.16em] ${
                    isSusLane ? "text-red-200" : "text-[#86efac]"
                  }`}
                >
                  {currentLaneLabel}
                </p>
              </div>
              <p className="text-[15px] font-black leading-snug text-white">
                {currentLaneCaption}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`text-[22px] font-black leading-none ${
                  isSusLane ? "text-red-200" : "text-[#4ade80]"
                }`}
              >
                {currentUnreadCount}
              </div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#94a3b8]">
                unread
              </div>
            </div>
          </div>
        </div>
        {alertMode === "dare" ? (
          <>
            {dareAlertTab === "personal" && personalDareToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="space-y-2.5">
                  {personalDareToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {dareAlertTab === "personal" &&
              personalDareYesterday.length > 0 && (
                <div className="mb-6">
                  {renderSectionHeader("Yesterday", "muted")}
                  <div className="space-y-2.5">
                    {personalDareYesterday.map(renderAlertItem)}
                  </div>
                </div>
              )}
            {dareAlertTab === "friends" && friendChallengeToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="space-y-2.5">
                  {friendChallengeToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {dareAlertTab === "friends" &&
              friendChallengeYesterday.length > 0 && (
                <div className="mb-6">
                  {renderSectionHeader("Yesterday", "muted")}
                  <div className="space-y-2.5">
                    {friendChallengeYesterday.map(renderAlertItem)}
                  </div>
                </div>
              )}
          </>
        ) : activeTab === "social" ? (
          <>
            {socialToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="space-y-2.5">
                  {socialToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {socialYesterday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="space-y-2.5">
                  {socialYesterday.map(renderAlertItem)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Live Surveillance Banner ── */}
            {susToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "danger")}
                <div className="space-y-2.5">
                  {susToday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
            {susYesterday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="space-y-2.5">
                  {susYesterday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
          </>
        )}

        {currentAlerts.length === 0 &&
          !(
            alertMode === "main" &&
            activeTab === "sus" &&
            susAlertsForDisplay.length > 0
          ) && (
            <div className="alerts-card rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] px-6 py-12 text-center shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(74,222,128,0.12),rgba(255,255,255,0.03))] shadow-[0_18px_48px_rgba(74,222,128,0.1)]">
                {alertMode === "dare" ? (
                  <span className="text-[30px] font-black text-[#86efac]">
                    D
                  </span>
                ) : activeTab === "social" ? (
                  <Heart size={28} className="text-[#86efac]" />
                ) : (
                  <Eye size={28} className="text-red-300" />
                )}
              </div>
              <p className="mb-2 text-lg font-bold text-white">
                {alertMode === "dare"
                  ? dareAlertTab === "personal"
                    ? "No personal dare alerts"
                    : "No friends challenge alerts"
                  : activeTab === "social"
                    ? "No alerts yet"
                    : "No suspicious activity detected"}
              </p>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-[#94a3b8]">
                {alertMode === "dare"
                  ? dareAlertTab === "personal"
                    ? "Dare and truth workflow alerts will appear here."
                    : "Dares and truths between mutual friends will appear here."
                  : activeTab === "social"
                    ? "New reactions, comments, and requests will appear here."
                    : "Nothing suspicious has surfaced yet."}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
