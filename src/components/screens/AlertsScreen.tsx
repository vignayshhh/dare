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
}: {
  onBack: () => void;
  onNavigateToDares: (request?: {
    tab?: "received" | "sent";
    highlightDareId?: string;
    highlightTruthId?: string;
  }) => void;
  onNavigateToFeed: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"social" | "sus">("social");
  const [friendshipStatuses, setFriendshipStatuses] = useState<
    Map<string, "accepted" | "rejected">
  >(new Map());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const { alerts, subscribeToAlerts, markAsRead } = useAlertStore();
  const { user: currentUser } = useAuthStore();
  const checkedFriendshipActorsRef = useRef<Set<string>>(new Set());
  const inFlightFriendshipActorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    checkedFriendshipActorsRef.current.clear();
    inFlightFriendshipActorsRef.current.clear();
  }, [currentUser?.id]);

  // Handle navigation to dares screen
  const handleAlertClick = async (alert: AlertEntity) => {
    // Mark as read first
    await markAsRead(alert.id);

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

  // Group alerts by time
  const groupAlertsByTime = (alerts: AlertEntity[]) => {
    const today: AlertEntity[] = [];
    const yesterday: AlertEntity[] = [];

    alerts.forEach((alert) => {
      const alertTime = new Date(alert.createdAt);
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

  // Filter alerts by type
  const socialAlerts = alerts.filter((alert) => alert.isSocialAlert());
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
      const primaryUsername = primary.metadata?.actorUsername || "someone";

      // Build aggregated message
      let message: string;
      if (othersCount === 0) {
        message = `@${primaryUsername} liked your post`;
      } else if (othersCount === 1) {
        const secondUsername = sorted[1]?.metadata?.actorUsername || "someone";
        message = `@${primaryUsername} and @${secondUsername} liked your post`;
      } else {
        message = `@${primaryUsername} and ${othersCount} others liked your post`;
      }

      // Create a new AlertEntity with aggregated info
      const aggregated = AlertEntity.create({
        id: primary.id,
        userId: primary.userId,
        type: primary.type,
        entityId: primary.entityId,
        actorId: primary.actorId,
        message,
        metadata: {
          ...primary.metadata,
          othersCount,
          allLikers: sorted.map((a) => ({
            username: a.metadata?.actorUsername,
            avatar: a.metadata?.actorAvatar,
            userId: a.actorId,
          })),
        },
        isRead: sorted.every((a) => a.isRead),
        createdAt: primary.createdAt,
        updatedAt: primary.updatedAt,
      });
      aggregatedLikes.push(aggregated);
    }

    // Merge and sort by createdAt descending
    return [...nonLikeAlerts, ...aggregatedLikes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  };

  const aggregatedSocialAlerts = aggregateLikeAlerts(socialAlerts);

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

    const metadataSaysLive = !!alert.metadata?.isLive;
    const hasLiveViewer = liveViewerMap.has(alert.actorId);

    if (!hasLiveViewer && !metadataSaysLive) {
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
          getProfileViewStatusMessage(alert.createdAt, inactiveUsername),
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
        viewerUsername: liveUsername.replace(/^@/, ""),
        actorUsername: liveUsername.replace(/^@/, ""),
      })
      .updateMessage(
        `@${liveUsername.replace(/^@/, "")} is viewing your profile right now`,
      );
  });

  const mergedSusAlerts = deduplicateAlerts(
    liveAwareSusAlerts.filter((alert) => {
      if (alert.type !== "SUS_PROFILE_VIEWING" || !alert.actorId) {
        return true;
      }

      const latestForActor = liveAwareSusAlerts
        .filter(
          (candidate) =>
            candidate.type === "SUS_PROFILE_VIEWING" &&
            candidate.actorId === alert.actorId,
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const { today: susToday, yesterday: susYesterday } =
    groupAlertsByTime(susAlertsForDisplay);

  const currentAlerts =
    activeTab === "social"
      ? deduplicateAlerts(aggregatedSocialAlerts)
      : susAlertsForDisplay;
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

  const renderAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const isDareOrTruth =
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_COMPLETED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED";

    const isClickable =
      isDareOrTruth ||
      alert.type === "COMMENT_RECEIVED" ||
      alert.type === "COMMENT_REPLY";

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`bg-[#1a1a1a] rounded-2xl p-4 shadow-lg ${isClickable ? "cursor-pointer hover:bg-[#2a2a2a] transition-colors" : ""}`}
        onClick={() => isClickable && handleAlertClick(alert)}
      >
        <div className="flex items-start space-x-3">
          <div className="relative">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="md"
              userId={actorInfo.userId}
              username={actorInfo.username}
            />
            {alert.metadata.isLive && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#4ade80] rounded-full border-2 border-black animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-semibold text-base">
                {actorInfo.name}
              </span>
              <span className="text-[#64748b] text-xs">
                {getTimeAgo(alert.createdAt)}
              </span>
            </div>

            <p className="text-[#e2e8f0] text-sm leading-relaxed mb-2">
              {alert.message}
            </p>

            {false && isClickable && (
              <div className="flex items-center text-[#4ade80] text-xs font-medium mb-2">
                <span></span>
              </div>
            )}

            {/* Add icons for dare/truth alerts */}
            {alert.type === "DARE_RECEIVED" && (
              <div className="flex items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Received</span>
              </div>
            )}

            {alert.type === "DARE_ACCEPTED" && (
              <div className="flex items-center space-x-2 text-green-400 text-xs font-medium mb-2">
                <CheckCircle size={12} />
                <span>Dare Accepted</span>
              </div>
            )}

            {alert.type === "DARE_REFUSED" && (
              <div className="flex items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <XCircle size={12} />
                <span>Dare Refused</span>
              </div>
            )}

            {alert.type === "DARE_COMPLETED" && (
              <div className="flex items-center space-x-2 text-[#f59e0b] text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Completed</span>
              </div>
            )}

            {alert.type === "TRUTH_RECEIVED" && (
              <div className="flex items-center space-x-2 text-blue-400 text-xs font-medium mb-2">
                <MessageCircle size={12} />
                <span>Truth Question</span>
              </div>
            )}

            {alert.type === "TRUTH_ANSWERED" && (
              <div className="flex items-center space-x-2 text-green-400 text-xs font-medium mb-2">
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
                <div className="mt-2 p-3 bg-[#1e1e1e] rounded-xl border border-[#2a2a2a]">
                  <p className="text-[#e2e8f0] text-sm leading-relaxed">
                    {alert.metadata.commentText}
                  </p>
                </div>
              )}

            {/* Clickable indicator for comment alerts */}
            {(alert.type === "COMMENT_RECEIVED" ||
              alert.type === "COMMENT_REPLY") && (
              <div className="flex items-center text-[#4ade80] text-xs font-medium mb-2 mt-2">
                <span></span>
              </div>
            )}
            {alert.type === "POST_LIKED" && (
              <div className="flex items-center space-x-3 mt-2">
                {/* Stacked avatars of likers */}
                {alert.metadata.allLikers &&
                  alert.metadata.allLikers.length > 1 && (
                    <div className="flex -space-x-2">
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
                          />
                        ))}
                      {alert.metadata.allLikers.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-[#2a2a2a] border border-[#333] flex items-center justify-center text-[10px] text-[#94a3b8] font-bold">
                          +{alert.metadata.allLikers.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                {/* Post thumbnail */}
                {alert.metadata.postThumbnail && (
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#2a2a2a] shrink-0 border border-[#333] ml-auto">
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
              <p className="text-[#4ade80] text-xs font-medium mb-2">
                {alert.metadata.liveDuration}
              </p>
            )}

            {alert.type === "FRIEND_REQUEST" && (
              <div className="flex space-x-2 mt-3">
                {friendshipStatuses.get(alert.id) === "accepted" ? (
                  <div className="flex-1 bg-[#2a2a2a] text-[#4ade80] font-semibold text-sm py-2 px-4 rounded-full text-center">
                    ✓ Friend Request Accepted
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        handleAcceptFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 bg-[#4ade80] text-black font-semibold text-sm py-2 px-4 rounded-full hover:bg-[#22c55e] transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        handleRejectFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 bg-[#2a2a2a] text-red-400 font-semibold text-sm py-2 px-4 rounded-full hover:bg-[#3a3a3a] transition-colors border border-red-900/30"
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

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`relative overflow-hidden rounded-2xl p-4 shadow-lg border-l-2 ${bgAccent} ${isLiveProfileView ? "bg-[linear-gradient(135deg,rgba(127,29,29,0.24),rgba(26,26,26,0.96)_45%,rgba(26,26,26,1))] ring-1 ring-red-500/30" : "bg-[#1a1a1a]"} ${!alert.isRead ? "ring-1 ring-red-500/20" : ""}`}
        onClick={() => {
          if (!alert.id.startsWith("live-profile-")) {
            void handleAlertClick(alert);
          }
        }}
      >
        {isLiveProfileView && (
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-red-300">
              Live Now
            </span>
          </div>
        )}
        <div className="flex items-start space-x-3">
          {/* Avatar with sus type icon overlay */}
          <div className="relative shrink-0">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="md"
              userId={actorInfo.userId}
              username={actorInfo.username}
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#111] rounded-full flex items-center justify-center border border-[#2a2a2a]">
              {icon}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className={`font-semibold text-sm ${accentColor}`}>
                @{actorInfo.username}
              </span>
              <span className="text-[#64748b] text-xs">
                {getTimeAgo(alert.createdAt)}
              </span>
            </div>

            {/* Message */}
            <p className="text-[#e2e8f0] text-sm leading-relaxed mb-2">
              {alert.message}
            </p>

            {isLiveProfileView && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1">
                <Eye size={12} className="text-red-300" />
                <span className="text-xs font-semibold text-red-200">
                  Watching right now
                </span>
              </div>
            )}

            {/* Post thumbnail for repeated likes & photo views */}
            {(alert.type === "SUS_REPEATED_LIKES" ||
              alert.type === "SUS_PHOTO_VIEWS" ||
              alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") &&
              meta.postThumbnail && (
                <div className="mt-2 flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#2a2a2a] shrink-0 border border-[#333]">
                    <img
                      src={meta.postThumbnail}
                      alt="Post"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  {meta.postContent && (
                    <p className="text-[#64748b] text-xs truncate flex-1">
                      {meta.postContent.slice(0, 60)}
                      {meta.postContent.length > 60 ? "..." : ""}
                    </p>
                  )}
                </div>
              )}

            {/* Tap count badge for repeated likes */}
            {alert.type === "SUS_REPEATED_LIKES" && meta.tapCount && (
              <div className="mt-2 flex items-center space-x-2">
                <div className="bg-pink-500/10 border border-pink-500/20 rounded-full px-3 py-1 flex items-center space-x-1.5">
                  <Heart size={12} className="text-pink-400" fill="#f472b6" />
                  <span className="text-pink-400 text-xs font-bold">
                    {meta.tapCount}x
                  </span>
                </div>
              </div>
            )}

            {/* View count for photo views */}
            {alert.type === "SUS_PHOTO_VIEWS" && meta.viewCount && (
              <div className="mt-2 flex items-center space-x-2">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 flex items-center space-x-1.5">
                  <Eye size={12} className="text-amber-400" />
                  <span className="text-amber-400 text-xs font-bold">
                    {meta.viewCount} views
                  </span>
                </div>
              </div>
            )}

            {/* @mention talking — show both usernames who were chatting */}
            {alert.type === "SUS_MENTION_TALKING" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {meta.actorUsername && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 flex items-center space-x-1.5">
                    <span className="text-purple-300 text-xs font-bold">
                      @{meta.actorUsername}
                    </span>
                  </div>
                )}
                {meta.otherUsername && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 flex items-center space-x-1.5">
                    <span className="text-purple-300 text-xs font-bold">
                      @{meta.otherUsername}
                    </span>
                  </div>
                )}
                {meta.time && (
                  <div className="bg-[#1e1e1e] border border-[#333] rounded-full px-3 py-1 flex items-center space-x-1.5">
                    <MessageSquare size={12} className="text-purple-400" />
                    <span className="text-[#94a3b8] text-xs">{meta.time}</span>
                  </div>
                )}
              </div>
            )}

            {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {meta.interactionType && (
                  <div className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1">
                    <span className="text-xs font-bold text-yellow-200">
                      {meta.interactionType === "commented"
                        ? "Comment"
                        : meta.interactionType === "repeated_like"
                          ? `${meta.tapCount || 0}x likes`
                          : `${meta.distinctLikedPosts || 0} posts liked`}
                    </span>
                  </div>
                )}
                {meta.commentText && (
                  <div className="w-full rounded-xl border border-[#2a2a2a] bg-[#151515] p-3">
                    <p className="text-sm leading-relaxed text-[#e2e8f0]">
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
    <div className="screen-container">
      {/* Header */}
      <div className="bg-black border-b border-gray-800 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center justify-between relative">
            <button
              onClick={onBack}
              className="text-[#94a3b8] hover:text-white transition-colors z-10"
            >
              ×
            </button>
            <h1 className="text-xl font-bold text-white absolute left-1/2 transform -translate-x-1/2">
              Alerts
            </h1>
            <div className="w-6" />
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="px-4 pb-4">
          <div className="bg-[#1a1a1a] rounded-full p-1 flex">
            <button
              onClick={() => setActiveTab("social")}
              className={`flex-1 rounded-full py-2 px-4 font-semibold text-sm transition-all duration-200 ${
                activeTab === "social"
                  ? "bg-[#4ade80] text-black shadow-lg shadow-[#4ade80]/30"
                  : "text-[#64748b] hover:text-white"
              }`}
            >
              Social
            </button>
            <button
              onClick={() => setActiveTab("sus")}
              className={`flex-1 rounded-full py-2 px-4 font-semibold text-sm transition-all duration-200 relative ${
                activeTab === "sus"
                  ? "bg-[#4ade80] text-black shadow-lg shadow-[#4ade80]/30"
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
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === "social" ? (
          <>
            {socialToday.length > 0 && (
              <div>
                <h3 className="text-[#4ade80] font-semibold text-sm uppercase tracking-wider mb-3">
                  Today
                </h3>
                <div className="space-y-3">
                  {socialToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {socialYesterday.length > 0 && (
              <div>
                <h3 className="text-[#64748b] font-semibold text-sm uppercase tracking-wider mb-3">
                  Yesterday
                </h3>
                <div className="space-y-3">
                  {socialYesterday.map(renderAlertItem)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Live Surveillance Banner ── */}
            {susToday.length > 0 && (
              <div>
                <h3 className="text-red-400 font-semibold text-sm uppercase tracking-wider mb-3 flex items-center space-x-2">
                  <AlertTriangle size={14} />
                  <span>Today</span>
                </h3>
                <div className="space-y-3">
                  {susToday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
            {susYesterday.length > 0 && (
              <div>
                <h3 className="text-[#64748b] font-semibold text-sm uppercase tracking-wider mb-3">
                  Yesterday
                </h3>
                <div className="space-y-3">
                  {susYesterday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
          </>
        )}

        {currentAlerts.length === 0 &&
          !(activeTab === "sus" && susAlertsForDisplay.length > 0) && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto mb-4">
                {activeTab === "social" ? (
                  <Heart size={24} className="text-[#64748b]" />
                ) : (
                  <Eye size={24} className="text-[#64748b]" />
                )}
              </div>
              <p className="text-[#64748b] text-sm">
                {activeTab === "social"
                  ? "No alerts yet"
                  : "No suspicious activity detected"}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
