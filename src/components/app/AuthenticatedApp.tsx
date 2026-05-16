"use client";

import { useEffect, useRef, useState } from "react";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { MainScreen } from "../screens/MainScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { DaresReceivedScreen } from "../screens/DaresReceivedScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { CreateDareScreen } from "../screens/CreateDareScreen";
import { CreateFeedPostScreen } from "../screens/CreateFeedPostScreen";
import { BottomNavigation } from "../navigation/BottomNavigation";
import { ChatListScreen } from "../screens/ChatListScreen";
import MessagingScreen from "../screens/MessagingScreen";
import { LaunchGate } from "../LaunchScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { GuestApp } from "./GuestApp";
import { ActionPickerScreen } from "../screens/ActionPickerScreen";
import { CreateInteractionScreen } from "../screens/CreateInteractionScreen";
import { ProfileCreationScreen } from "../screens/ProfileCreationScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { ChallengeFriendTimelineScreen } from "../screens/ChallengeFriendTimelineScreen";
import { FriendsInviteAlertsScreen } from "../screens/FriendsInviteAlertsScreen";
import { UserSearchScreen } from "../screens/UserSearchScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { ProfileEditScreen } from "../screens/ProfileEditScreen";
import { ActivityScreen } from "../screens/ActivityScreen";
import {
  DailyChallengeScreen,
  type DailyChallengeDraft,
} from "../screens/DailyChallengeScreen";
import { DailyChallengeRevealScreen } from "../screens/DailyChallengeRevealScreen";
import { DareCenterScreen } from "../screens/DareCenterScreen";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useGhostModeStore } from "../../stores/useGhostModeStore";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { messagingService } from "../../middleware/services/messaging.service";
import { auth as firebaseAuth } from "../../backend/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { startAvatarSync } from "../../utils/avatarSync";
import { avatarSyncService } from "../../services/avatarSyncService";
import { profileSyncService } from "../../services/profileSyncService";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { surveillanceService } from "../../middleware/services/surveillance.service";
import { backgroundPreCache } from "../../utils/backgroundPreCache";
import { resolveUserProfile } from "../../utils/profileResolver";
import {
  isFirestoreOfflineError,
  logFirestoreError,
} from "@/utils/firestoreErrors";
import { usePwaScreenHistory } from "../../hooks/usePwaScreenHistory";
import { dareService } from "../../middleware/services/service-factory";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";
import type { DareEntity } from "../../backend/domain/entities/Dare";
import type { AlertEntity } from "../../backend/domain/entities/Alert";

type Screen =
  | "truth"
  | "main"
  | "dares"
  | "profile"
  | "profile-edit"
  | "create-dare"
  | "create-feed"
  | "feed"
  | "auth"
  | "chat-list"
  | "chat"
  | "action-picker"
  | "create-truth"
  | "create-dare-interaction"
  | "alerts"
  | "chat-invites"
  | "profile-creation"
  | "user-search"
  | "user-profile"
  | "activity"
  | "daily"
  | "daily-reveal"
  | "dare-center"
  | "challenge-timeline";

type DaresNavigationRequest = {
  tab?: "received" | "sent";
  highlightDareId?: string;
  highlightTruthId?: string;
  nonce: number;
};

type AppHistorySnapshot = {
  chatConversationId: string;
  daresNavigationRequest: DaresNavigationRequest | null;
  dailyChallengeSkipWait: boolean;
  lastActiveChatUserId: string;
  lastActiveConversationId: string;
  previousScreen: Screen;
  selectedUserCommentId: string;
  selectedUserDareId: string;
  selectedUserId: string;
  selectedUserPostId: string;
  selectedUserTruthId: string;
  selectedChallengeFriendAlert: AlertEntity | null;
};

function getScreenLayerClassName(
  isActive: boolean,
  className = "full-height-scroll tab-screen-bottom-pad",
) {
  return `app-screen-layer ${isActive ? "is-active" : ""} ${className}`;
}

function normalizeTimestampInput(value: unknown): string | null {
  if (!value) return null;

  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: number }).seconds === "number"
  ) {
    date = new Date((value as { seconds: number }).seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function buildDareFocusPost(dare: DareEntity): Promise<DarePost> {
  const [challengerProfile, receiverProfile] = await Promise.all([
    resolveUserProfile(dare.challengerId).catch(() => null),
    resolveUserProfile(dare.receiverId).catch(() => null),
  ]);

  const getName = (profile: any, fallback: string) =>
    profile?.displayName ||
    profile?.display_name ||
    profile?.nickname ||
    profile?.username ||
    fallback;
  const getAvatar = (profile: any) =>
    profile?.avatarUrl || profile?.avatar_url || profile?.avatar || "";

  return {
    id: dare.id,
    challengerId: dare.challengerId,
    receiverId: dare.receiverId,
    challenger: {
      nickname: getName(challengerProfile, dare.challengerId),
      avatar: getAvatar(challengerProfile),
      verified: false,
    },
    receiver: {
      nickname: getName(receiverProfile, dare.receiverId),
      avatar: getAvatar(receiverProfile),
      verified: false,
    },
    description: dare.description,
    proof: dare.proofMediaUrl
      ? {
          type: dare.proofMediaType === "VIDEO" ? "video" : "image",
          url: dare.proofMediaUrl,
          thumbnail: dare.proofThumbnailUrl || dare.proofMediaUrl,
        }
      : undefined,
    state: dare.state as DarePost["state"],
    createdAt: dare.createdAt,
  };
}

export default function AuthenticatedApp() {
  const { user, isAuthenticated, signIn, signUp, initializeAuth } =
    useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const {
    checkGhostModeStatus,
    subscribeToGhostMode,
    applyOptimisticGhostMode,
    reconcileGhostModeBackend,
  } = useGhostModeStore();
  const alerts = useAlertStore((s) => s.alerts);
  const subscribeToAlerts = useAlertStore((s) => s.subscribeToAlerts);
  const [currentScreen, setCurrentScreen] = useState<Screen>("feed");
  const [dailyChallengeSkipWait, setDailyChallengeSkipWait] = useState(false);
  const [dailyChallengeDraft, setDailyChallengeDraft] =
    useState<DailyChallengeDraft | null>(null);
  const [mainDareAudience, setMainDareAudience] = useState<
    "friends" | "community"
  >("friends");
  const handledGhostApprovalAlertIdsRef = useRef<Set<string>>(new Set());
  const handledGhostCompletionKeysRef = useRef<Set<string>>(new Set());

  // Mark as mounted after first client render to avoid SSR/client hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Check localStorage for guest mode on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      const guestModeFromStorage =
        window.localStorage.getItem("dare_guest_mode") === "true";
      setIsGuestMode(guestModeFromStorage);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isGuestMode) {
      window.localStorage.setItem("dare_guest_mode", "true");
    } else {
      window.localStorage.removeItem("dare_guest_mode");
    }
  }, [isGuestMode]);

  // Handle login/signup from AuthScreen
  const handleAuth = async (
    action:
      | { type: "signin"; email: string; password: string }
      | {
          type: "signup";
          email: string;
          password: string;
          username: string;
          displayName: string;
        },
  ) => {
    setIsGuestMode(false);

    if (action.type === "signin") {
      const response = await signIn(action.email, action.password);
      if (!response.success) {
        throw new Error(response.error || "Unable to sign in.");
      }
    } else {
      const response = await signUp({
        email: action.email,
        password: action.password,
        username: action.username,
        displayName: action.displayName,
      });
      if (!response.success) {
        throw new Error(response.error || "Unable to create your account.");
      }
    }
  };

  const [chatConversationId, setChatConversationId] = useState<string>("");
  const [lastActiveConversationId, setLastActiveConversationId] =
    useState<string>("");
  const [lastActiveChatUserId, setLastActiveChatUserId] = useState<string>("");
  const chatConversationIdRef = useRef<string>("");
  const lastActiveConversationIdRef = useRef<string>("");
  const lastActiveChatUserIdRef = useRef<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserPostId, setSelectedUserPostId] = useState<string>("");
  const [selectedUserCommentId, setSelectedUserCommentId] =
    useState<string>("");
  const [selectedUserTruthId, setSelectedUserTruthId] = useState<string>("");
  const [selectedUserDareId, setSelectedUserDareId] = useState<string>("");
  const [previousScreen, setPreviousScreen] = useState<Screen>("feed");
  const [mainFocusRequest, setMainFocusRequest] = useState<{
    view: "truth" | "dares";
    post: TruthPost | DarePost;
    nonce: number;
  } | null>(null);
  const [mainScreenResetKey, setMainScreenResetKey] = useState(0);
  const [daresScreenResetKey, setDaresScreenResetKey] = useState(0);
  const [daresNavigationRequest, setDaresNavigationRequest] =
    useState<DaresNavigationRequest | null>(null);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [isStoryComposerOpen, setIsStoryComposerOpen] = useState(false);
  const [selectedChallengeFriendAlert, setSelectedChallengeFriendAlert] =
    useState<AlertEntity | null>(null);
  const goBackInApp = usePwaScreenHistory<Screen, AppHistorySnapshot>(
    currentScreen,
    setCurrentScreen,
    {
      enabled: mounted && isAuthenticated && !!user,
      snapshot: {
        chatConversationId,
        daresNavigationRequest,
        dailyChallengeSkipWait,
        lastActiveChatUserId,
        lastActiveConversationId,
        previousScreen,
        selectedUserCommentId,
        selectedUserDareId,
        selectedUserId,
        selectedUserPostId,
        selectedUserTruthId,
        selectedChallengeFriendAlert,
      },
      restoreSnapshot: (snapshot) => {
        setChatConversationId(snapshot.chatConversationId);
        setDaresNavigationRequest(snapshot.daresNavigationRequest);
        setDailyChallengeSkipWait(snapshot.dailyChallengeSkipWait);
        setLastActiveChatUserId(snapshot.lastActiveChatUserId);
        setLastActiveConversationId(snapshot.lastActiveConversationId);
        setPreviousScreen(snapshot.previousScreen);
        setSelectedUserCommentId(snapshot.selectedUserCommentId);
        setSelectedUserDareId(snapshot.selectedUserDareId);
        setSelectedUserId(snapshot.selectedUserId);
        setSelectedUserPostId(snapshot.selectedUserPostId);
        setSelectedUserTruthId(snapshot.selectedUserTruthId);
        setSelectedChallengeFriendAlert(
          snapshot.selectedChallengeFriendAlert,
        );
      },
    },
  );

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    backgroundPreCache.preCache(user.id).catch(() => {
      // Non-fatal - pre-cache failures should not break the app
    });
  }, [user?.id, isAuthenticated]);

  useEffect(() => {
    chatConversationIdRef.current = chatConversationId;
  }, [chatConversationId]);

  useEffect(() => {
    lastActiveConversationIdRef.current = lastActiveConversationId;
  }, [lastActiveConversationId]);

  useEffect(() => {
    lastActiveChatUserIdRef.current = lastActiveChatUserId;
  }, [lastActiveChatUserId]);

  useEffect(() => {
    if (
      currentScreen !== "user-profile" ||
      !user?.id ||
      !selectedUserId ||
      user.id === selectedUserId
    ) {
      return;
    }

    const viewerUsername = user.username || "someone";
    const viewerDisplayName = user.displayName || user.username || "Someone";
    const viewerAvatar = user.avatar || "";

    void surveillanceService.startViewingProfile(
      user.id,
      selectedUserId,
      viewerUsername,
      viewerDisplayName,
      viewerAvatar,
    );

    return () => {
      void surveillanceService.stopViewingProfile(
        user.id,
        selectedUserId,
        viewerUsername,
        viewerDisplayName,
        viewerAvatar,
      );
    };
  }, [
    currentScreen,
    selectedUserId,
    user?.avatar,
    user?.displayName,
    user?.id,
    user?.username,
  ]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      startAvatarSync();

      const { setCurrentUserProfile } = useProfileDataStore.getState();
      setCurrentUserProfile(
        user.id,
        user.displayName || "",
        user.username || "",
        user.avatar || "",
      );
      const unsubAvatarUser = avatarSyncService.subscribeToUserAvatar(user.id);
      const unsubProfileUser = profileSyncService.subscribeToUserProfile(
        user.id,
      );

      return () => {
        unsubAvatarUser();
        unsubProfileUser();
      };
    }
  }, [
    isAuthenticated,
    user?.id,
    user?.displayName,
    user?.username,
    user?.avatar,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const messagingStore = useMessagingStore.getState();
    const targetUserId = user.id;
    let cancelled = false;
    let started = false;
    let unsubAuth: (() => void) | null = null;

    const start = () => {
      if (cancelled || started) return;
      started = true;
      console.log(
        "🔍 [AuthenticatedApp DEBUG] Starting RTDB subscriptions for user:",
        targetUserId,
      );
      messagingStore.subscribeToRealTimeConversations(targetUserId);
      messagingStore.setOnlineStatus(true);
    };

    // Wait until Firebase Auth has actually restored the session for THIS
    // user before subscribing to RTDB-backed presence/typing. On a page
    // reload the auth store hydrates synchronously from localStorage but
    // Firebase Auth's currentUser is still null for a brief moment — if we
    // attach RTDB onValue listeners during that window the rules deny the
    // read and the listeners are stuck reporting "offline" forever, which
    // is why the chat list and messaging header never showed active /
    // typing status.
    if (firebaseAuth?.currentUser?.uid === targetUserId) {
      start();
    } else if (firebaseAuth) {
      unsubAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
        if (firebaseUser?.uid === targetUserId) start();
      });
    }

    const onVisibility = () => {
      if (!started) return;
      messagingStore.setOnlineStatus(document.visibilityState !== "hidden");
    };
    const onFocus = () => {
      if (!started) return;
      messagingStore.setOnlineStatus(true);
    };
    const onBeforeUnload = () => {
      if (!started) return;
      messagingStore.setOnlineStatus(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
    const onlineHeartbeat = window.setInterval(() => {
      if (!started || document.visibilityState === "hidden") return;
      messagingStore.setOnlineStatus(true);
    }, 30000);

    return () => {
      cancelled = true;
      if (unsubAuth) unsubAuth();
      window.clearInterval(onlineHeartbeat);
      if (started) {
        messagingStore.unsubscribeFromRealTimeConversations();
        messagingStore.setOnlineStatus(false);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    void checkGhostModeStatus(user.id);
    const unsubscribe = subscribeToGhostMode(user.id);

    return () => {
      unsubscribe?.();
    };
  }, [checkGhostModeStatus, isAuthenticated, subscribeToGhostMode, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    return subscribeToAlerts(user.id);
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!user?.id || alerts.length === 0) return;

    const pendingGhostModeAlerts = alerts.filter(
      (alert) =>
        alert.userId === user.id &&
        alert.type === "DARE_APPROVED" &&
        !!alert.entityId &&
        !handledGhostApprovalAlertIdsRef.current.has(alert.id),
    );

    if (pendingGhostModeAlerts.length === 0) return;

    pendingGhostModeAlerts.forEach((alert) =>
      handledGhostApprovalAlertIdsRef.current.add(alert.id),
    );

    void (async () => {
      for (const alert of pendingGhostModeAlerts) {
        try {
          applyOptimisticGhostMode(alert.entityId, alert.createdAt, 15);
          void reconcileGhostModeBackend(
            user.id,
            alert.entityId,
            alert.createdAt,
            15,
          );
        } catch (error) {
          console.error(
            "Error activating ghost mode from DARE_APPROVED alert:",
            error,
          );
        }
      }
    })();
  }, [alerts, applyOptimisticGhostMode, reconcileGhostModeBackend, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    return dareService.subscribeToUserDares(
      user.id,
      "received",
      (receivedDares: DareEntity[]) => {
        const latestApprovedCompletion = [...receivedDares]
          .filter(
            (dare) =>
              dare.receiverId === user.id && dare.state === "ACCEPTED_REAL",
          )
          .map((dare) => {
            const completedAt =
              normalizeTimestampInput(dare.completedAt) ||
              normalizeTimestampInput(dare.updatedAt);

            return {
              dare,
              completedAt,
            };
          })
          .filter(
            (
              entry,
            ): entry is {
              dare: DareEntity;
              completedAt: string;
            } => {
              if (!entry.completedAt) return false;

              const completedMs = new Date(entry.completedAt).getTime();
              return (
                Number.isFinite(completedMs) &&
                Date.now() - completedMs < 15 * 60 * 1000
              );
            },
          )
          .sort(
            (a, b) =>
              new Date(b.completedAt).getTime() -
              new Date(a.completedAt).getTime(),
          )[0];

        if (!latestApprovedCompletion) {
          return;
        }

        const completionKey = `${latestApprovedCompletion.dare.id}:${latestApprovedCompletion.completedAt}`;
        const ghostModeState = useGhostModeStore.getState();
        const shouldApply =
          !handledGhostCompletionKeysRef.current.has(completionKey) ||
          !ghostModeState.isActive;

        if (!shouldApply) {
          return;
        }

        handledGhostCompletionKeysRef.current.add(completionKey);
        applyOptimisticGhostMode(
          latestApprovedCompletion.dare.id,
          latestApprovedCompletion.completedAt,
          15,
        );
        void reconcileGhostModeBackend(
          user.id,
          latestApprovedCompletion.dare.id,
          latestApprovedCompletion.completedAt,
          15,
        );
      },
    );
  }, [
    applyOptimisticGhostMode,
    isAuthenticated,
    reconcileGhostModeBackend,
    user?.id,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        user &&
        isAuthenticated &&
        (user.hasCompletedProfileCreation === false ||
          user.hasCompletedProfileCreation === undefined) &&
        currentScreen !== "profile-creation"
      ) {
        setCurrentScreen("profile-creation");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [user, isAuthenticated, currentScreen, user?.hasCompletedProfileCreation]);

  const handleProfileCreationComplete = () => {
    setCurrentScreen("feed");
  };

  const handleBackToMain = () => {
    goBackInApp("feed");
  };

  const updateCurrentChatPresence = (
    nextUserId: string,
    nextUsername: string,
  ) => {
    if (!user?.id || !nextUserId) return;

    const db = getFirestore();
    const presenceRef = doc(db, "presence", user.id);
    void setDoc(
      presenceRef,
      {
        current_chat_user_id: nextUserId,
        current_chat_user_name: nextUsername || "someone",
        is_online: true,
        last_seen: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true },
    ).catch((error) => {
      logFirestoreError("Error updating current chat presence:", error);
    });
  };

  const emitChatSwitchForPreviousConversation = (
    nextConversationId: string,
    nextUserId: string,
    nextUsername: string,
  ) => {
    const fromConversationId =
      lastActiveConversationIdRef.current || chatConversationIdRef.current;

    if (
      !fromConversationId ||
      !nextConversationId ||
      fromConversationId === nextConversationId
    ) {
      return;
    }

    const previousChatUserId = lastActiveChatUserIdRef.current;

    if (!user?.id || !previousChatUserId || previousChatUserId === nextUserId) {
      return;
    }

    void (async () => {
      try {
        const db = getFirestore();
        const previousUserPresence = await getDoc(
          doc(db, "presence", previousChatUserId),
        );
        const previousPresenceData = previousUserPresence.exists()
          ? previousUserPresence.data()
          : null;
        const previousUserWasActivelyChattingWithMe =
          String(previousPresenceData?.current_chat_user_id || "") === user.id;

        if (!previousUserWasActivelyChattingWithMe) {
          return;
        }

        const state = useMessagingStore.getState();
        const nextConversation = state.conversations.find(
          (c: any) => c.id === nextConversationId,
        );
        const targetUserName =
          nextUsername ||
          nextConversation?.other_user?.display_name ||
          nextConversation?.other_user?.username ||
          "someone";

        await messagingService.emitOptimisticChatSwitchSignal(
          fromConversationId,
          user.id,
          targetUserName,
          nextUserId,
          previousChatUserId,
        );

        await state.trackChatSwitch(
          fromConversationId,
          targetUserName,
          nextUserId,
          previousChatUserId,
        );
      } catch (error) {
        if (isFirestoreOfflineError(error)) {
          return;
        }
        console.error("Error emitting chat switch:", error);
      }
    })();
  };

  const handleChatSelect = async (
    userId: string,
    username: string,
    conversationId?: string,
  ) => {
    const nextConversationId = conversationId || "";
    emitChatSwitchForPreviousConversation(nextConversationId, userId, username);
    updateCurrentChatPresence(userId, username);
    setChatConversationId(nextConversationId);
    setCurrentScreen("chat");
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedUserPostId("");
    setSelectedUserCommentId("");
    setSelectedUserTruthId("");
    setSelectedUserDareId("");
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  const handleOpenSharedPost = (userId: string, postId: string) => {
    setSelectedUserId(userId);
    setSelectedUserPostId(postId);
    setSelectedUserCommentId("");
    setSelectedUserTruthId("");
    setSelectedUserDareId("");
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  const handleMessageUser = async (
    targetUserId: string,
    targetUsername: string,
  ) => {
    if (!user?.id) return;
    try {
      const convId = await useMessagingStore
        .getState()
        .getOrCreateConversation(user.id, targetUserId);

      emitChatSwitchForPreviousConversation(
        convId,
        targetUserId,
        targetUsername,
      );
      updateCurrentChatPresence(targetUserId, targetUsername);
      setChatConversationId(convId);
      setCurrentScreen("chat");
    } catch (error) {
      console.error("Error starting conversation:", error);
    }
  };

  const handleNavigateToSearch = () => {
    setCurrentScreen("user-search");
  };

  const handleNavigateToActivity = () => {
    setPreviousScreen("profile");
    setCurrentScreen("activity");
  };

  const handleActivityBack = () => {
    if (previousScreen && previousScreen !== "activity") {
      setCurrentScreen(previousScreen);
      return;
    }

    if (selectedUserId && selectedUserId !== user?.id) {
      setCurrentScreen("user-profile");
      return;
    }

    setCurrentScreen("profile");
  };

  const handleOpenTruthPost = (truth: TruthPost) => {
    setMainFocusRequest({
      view: "truth",
      post: truth,
      nonce: Date.now(),
    });
    setCurrentScreen("truth");
  };

  const handleOpenDarePost = (dare: DarePost) => {
    setMainFocusRequest({
      view: "dares",
      post: dare,
      nonce: Date.now(),
    });
    setCurrentScreen("main");
  };

  const handleOpenFriendCompletedDareAlert = async (alert: AlertEntity) => {
    try {
      const response = await dareService.getDareById(alert.entityId);
      if (!response.success || !response.dare) {
        throw new Error(response.error || "Dare not found");
      }

      const darePost = await buildDareFocusPost(response.dare);
      setMainFocusRequest({
        view: "dares",
        post: darePost,
        nonce: Date.now(),
      });
      setCurrentScreen("main");
    } catch (error) {
      console.error("Error opening completed friend dare alert:", error);
      setSelectedChallengeFriendAlert(alert);
      setCurrentScreen("challenge-timeline");
    }
  };

  const handleCreateClick = () => {
    setCurrentScreen("action-picker");
  };

  const handleActionSelect = (action: "truth" | "dare" | "feed") => {
    switch (action) {
      case "truth":
        setCurrentScreen("create-truth");
        break;
      case "dare":
        setCurrentScreen("create-dare-interaction");
        break;
      case "feed":
        setCurrentScreen("create-feed");
        break;
    }
  };

  const handleTabScreenChange = (screen: "truth" | "main" | "dares" | "profile" | "feed") => {
    if (screen === "truth" || screen === "main") {
      setMainFocusRequest(null);
      if (screen === "main") {
        setMainDareAudience("friends");
      }
      setMainScreenResetKey((key) => key + 1);
    }

    if (screen === "dares") {
      setDaresNavigationRequest(null);
      setDaresScreenResetKey((key) => key + 1);
    }

    setCurrentScreen(screen);
  };

  const TAB_SCREENS = [
    "feed",
    "dares",
    "profile",
    "truth",
    "main",
    "chat-list",
    "daily",
  ];
  const effectiveScreen =
    isAuthenticated &&
    (user?.hasCompletedProfileCreation === false ||
      user?.hasCompletedProfileCreation === undefined) &&
    currentScreen !== "profile-edit"
      ? "profile-creation"
      : currentScreen;
  const isTabScreen = TAB_SCREENS.includes(effectiveScreen);

  const renderOverlayScreen = () => {
    switch (effectiveScreen) {
      case "profile-edit":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ProfileEditScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-dare":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <CreateDareScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-feed":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <CreateFeedPostScreen onBack={handleBackToMain} />
          </div>
        );
      case "chat":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <MessagingScreen
              onBack={() => goBackInApp("chat-list")}
              conversationId={chatConversationId || undefined}
              onConversationActiveChange={(id, otherUserId) => {
                lastActiveConversationIdRef.current = id;
                setLastActiveConversationId(id);
                lastActiveChatUserIdRef.current = otherUserId || "";
                setLastActiveChatUserId(otherUserId || "");
              }}
              onOpenSharedPost={handleOpenSharedPost}
              onOpenUserProfile={handleUserSelect}
            />
          </div>
        );
      case "action-picker":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ActionPickerScreen
              onClose={handleBackToMain}
              onSelectAction={handleActionSelect}
            />
          </div>
        );
      case "create-truth":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <CreateInteractionScreen mode="truth" onBack={handleBackToMain} />
          </div>
        );
      case "create-dare-interaction":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <CreateInteractionScreen mode="dare" onBack={handleBackToMain} />
          </div>
        );
      case "alerts":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <AlertsScreen
              onBack={handleBackToMain}
              onNavigateToDares={(request) => {
                setDaresNavigationRequest({
                  ...request,
                  nonce: Date.now(),
                });
                setCurrentScreen("dares");
              }}
              onNavigateToFeed={() => setCurrentScreen("feed")}
              onNavigateToChallengeTimeline={(alert) => {
                setSelectedChallengeFriendAlert(alert);
                setCurrentScreen("challenge-timeline");
              }}
              onNavigateToFriendCompletedDare={
                handleOpenFriendCompletedDareAlert
              }
            />
          </div>
        );
      case "challenge-timeline":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ChallengeFriendTimelineScreen
              alert={selectedChallengeFriendAlert}
              onBack={() => goBackInApp("alerts")}
            />
          </div>
        );
      case "chat-invites":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <FriendsInviteAlertsScreen
              onBack={() => goBackInApp("chat-list")}
              onOpenConversation={(conversationId) => {
                setChatConversationId(conversationId);
                setCurrentScreen("chat");
              }}
            />
          </div>
        );
      case "profile-creation":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ProfileCreationScreen
              onComplete={handleProfileCreationComplete}
              onBack={handleBackToMain}
            />
          </div>
        );
      case "user-search":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <UserSearchScreen
              onBack={handleBackToMain}
              onUserSelect={handleUserSelect}
            />
          </div>
        );
      case "user-profile":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <UserProfileScreen
              onBack={() => goBackInApp(previousScreen)}
              userId={selectedUserId}
              onMessage={handleMessageUser}
              onNavigateToProfile={handleUserSelect}
              onNavigateToTruthPost={handleOpenTruthPost}
              onNavigateToDarePost={handleOpenDarePost}
              onNavigateToActivity={(userId: string) => {
                setSelectedUserId(userId);
                setPreviousScreen("user-profile");
                setCurrentScreen("activity");
              }}
              initialPostId={selectedUserPostId || undefined}
              initialCommentId={selectedUserCommentId || undefined}
              initialTruthId={selectedUserTruthId || undefined}
              initialDareId={selectedUserDareId || undefined}
            />
          </div>
        );
      case "activity":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ActivityScreen
              userId={selectedUserId || undefined}
              onBack={handleActivityBack}
              onNavigateToPost={(postId: string) => {
                setSelectedUserPostId(postId);
                setSelectedUserCommentId("");
                setSelectedUserTruthId("");
                setSelectedUserDareId("");
                setPreviousScreen("activity");
                setCurrentScreen("user-profile");
              }}
              onNavigateToComment={(postId: string, commentId: string) => {
                setSelectedUserPostId(postId);
                setSelectedUserCommentId(commentId);
                setSelectedUserTruthId("");
                setSelectedUserDareId("");
                setPreviousScreen("activity");
                setCurrentScreen("user-profile");
              }}
              onNavigateToTruth={(truthId: string) => {
                setSelectedUserPostId("");
                setSelectedUserCommentId("");
                setSelectedUserTruthId(truthId);
                setSelectedUserDareId("");
                setPreviousScreen("activity");
                setCurrentScreen("user-profile");
              }}
              onNavigateToDare={(dareId: string) => {
                setSelectedUserPostId("");
                setSelectedUserCommentId("");
                setSelectedUserTruthId("");
                setSelectedUserDareId(dareId);
                setPreviousScreen("activity");
                setCurrentScreen("user-profile");
              }}
            />
          </div>
        );
      case "daily-reveal":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <DailyChallengeRevealScreen
              isActive={effectiveScreen === "daily-reveal"}
              initialChallenge={dailyChallengeDraft}
              onBack={() => goBackInApp("daily")}
              onOpenConversation={handleChatSelect}
            />
          </div>
        );
      case "dare-center":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <DareCenterScreen
              onBack={() => goBackInApp("feed")}
              onOpenCreate={() => setCurrentScreen("action-picker")}
              onOpenDares={() => setCurrentScreen("dares")}
              onOpenDaily={() => setCurrentScreen("daily")}
              onOpenFeed={() => setCurrentScreen("feed")}
              onOpenMain={() => setCurrentScreen("main")}
              onOpenAlerts={() => setCurrentScreen("alerts")}
              onOpenChat={() => setCurrentScreen("chat-list")}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const showBottomNav =
    isTabScreen && !isStoryViewerOpen && !isStoryComposerOpen;

  // Render a neutral shell during SSR and first client paint to avoid hydration mismatch.
  // Auth state from the persisted Zustand store is only safe to consume after mount.
  if (!mounted) {
    return <div className="app-fixed-viewport bg-[#0a0f0a]" />;
  }

  if (isGuestMode && !isAuthenticated) {
    return <GuestApp onExitGuestMode={() => setIsGuestMode(false)} />;
  }

  // Show AuthScreen when not authenticated (after all hooks have been called)
  if (!isAuthenticated || !user) {
    return (
      <AuthScreen
        onLogin={handleAuth}
        onContinueAsGuest={() => setIsGuestMode(true)}
      />
    );
  }

  return (
    <LaunchGate>
      <div className="app-fixed-viewport relative overflow-hidden bg-[#0a0f0a]">
        <div className={getScreenLayerClassName(effectiveScreen === "truth")}>
          <MainScreen
            isActive={effectiveScreen === "truth"}
            onDaresClick={() => setCurrentScreen("dares")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToProfile={handleUserSelect}
            focusRequest={mainFocusRequest}
            activeView="truth"
            showViewToggle={false}
            resetKey={mainScreenResetKey}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "main")}>
          <MainScreen
            isActive={effectiveScreen === "main"}
            onDaresClick={() => setCurrentScreen("dares")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToProfile={handleUserSelect}
            focusRequest={mainFocusRequest}
            activeView="dares"
            initialDareAudience={mainDareAudience}
            showViewToggle={false}
            resetKey={mainScreenResetKey}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "dares")}>
          <DaresReceivedScreen
            navigationRequest={daresNavigationRequest}
            resetKey={daresScreenResetKey}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "profile")}>
          <ProfileScreen
            isActive={effectiveScreen === "profile"}
            onNavigateToProfile={handleUserSelect}
            onNavigateToActivity={handleNavigateToActivity}
            onNavigateToTruthPost={handleOpenTruthPost}
            onNavigateToDarePost={handleOpenDarePost}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "feed")}>
          <FeedScreen
            isActive={effectiveScreen === "feed"}
            onBack={handleBackToMain}
            onCreatePost={() => setCurrentScreen("create-feed")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToAlerts={() => setCurrentScreen("alerts")}
            onNavigateToSearch={handleNavigateToSearch}
            onNavigateToDares={() => handleTabScreenChange("dares")}
            onNavigateToSocialDares={() => {
              setMainFocusRequest(null);
              setMainDareAudience("friends");
              setMainScreenResetKey((key) => key + 1);
              setCurrentScreen("main");
            }}
            onNavigateToTruths={() => handleTabScreenChange("truth")}
            onNavigateToCommunityDares={() => {
              setMainFocusRequest(null);
              setMainDareAudience("community");
              setMainScreenResetKey((key) => key + 1);
              setCurrentScreen("main");
            }}
            onNavigateToDareCenter={() => setCurrentScreen("dare-center")}
            onNavigateToProfile={handleUserSelect}
            onStoryComposerOpenChange={setIsStoryComposerOpen}
            onStoryViewerOpenChange={setIsStoryViewerOpen}
          />
        </div>
        <div
          className={getScreenLayerClassName(
            effectiveScreen === "daily",
            "h-full overflow-hidden",
          )}
        >
          <DailyChallengeScreen
            isActive={effectiveScreen === "daily"}
            skipWaitEnabled={dailyChallengeSkipWait}
            onBack={() => goBackInApp("feed")}
            onSkipWait={() => setDailyChallengeSkipWait(true)}
            onStartMatch={(challenge) => {
              setDailyChallengeDraft(challenge);
              setCurrentScreen("daily-reveal");
            }}
          />
        </div>
        <div
          className={getScreenLayerClassName(effectiveScreen === "chat-list")}
        >
          <ChatListScreen
            isActive={effectiveScreen === "chat-list"}
            onBack={handleBackToMain}
            onChatSelect={handleChatSelect}
            onInviteAlertsClick={() => setCurrentScreen("chat-invites")}
            onDailyChallengeClick={() => setCurrentScreen("daily")}
          />
        </div>

        {!isTabScreen && renderOverlayScreen()}

        {showBottomNav && (
          <BottomNavigation
            currentScreen={
              effectiveScreen as
                | "truth"
                | "main"
                | "dares"
                | "profile"
                | "feed"
            }
            onScreenChange={handleTabScreenChange}
            onCreateClick={handleCreateClick}
          />
        )}
      </div>
    </LaunchGate>
  );
}
