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
import { UserSearchScreen } from "../screens/UserSearchScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { ProfileEditScreen } from "../screens/ProfileEditScreen";
import { ActivityScreen } from "../screens/ActivityScreen";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useGhostModeStore } from "../../stores/useGhostModeStore";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { messagingService } from "../../middleware/services/messaging.service";
import { startAvatarSync } from "../../utils/avatarSync";
import { avatarSyncService } from "../../services/avatarSyncService";
import { profileSyncService } from "../../services/profileSyncService";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { surveillanceService } from "../../middleware/services/surveillance.service";
import { backgroundPreCache } from "../../utils/backgroundPreCache";
import { dareService } from "../../middleware/services/service-factory";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";
import type { DareEntity } from "../../backend/domain/entities/Dare";

type Screen =
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
  | "profile-creation"
  | "user-search"
  | "user-profile"
  | "activity";

type DaresNavigationRequest = {
  tab?: "received" | "sent";
  highlightDareId?: string;
  highlightTruthId?: string;
  nonce: number;
};

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
      await signIn(action.email, action.password);
    } else {
      await signUp({
        email: action.email,
        password: action.password,
        username: action.username,
        displayName: action.displayName,
      });
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
  const [daresNavigationRequest, setDaresNavigationRequest] =
    useState<DaresNavigationRequest | null>(null);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);

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
    messagingStore.subscribeToRealTimeConversations(user.id);
    messagingStore.subscribeToOnlineStatus(user.id);
    messagingStore.setOnlineStatus(true);

    return () => {
      messagingStore.unsubscribeFromRealTimeConversations();
      messagingStore.unsubscribeFromOnlineStatus();
      messagingStore.setOnlineStatus(false);
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
    setCurrentScreen("feed");
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
        last_seen: serverTimestamp(),
      },
      { merge: true },
    ).catch((error) => {
      console.error("Error updating current chat presence:", error);
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
    setCurrentScreen("main");
  };

  const handleOpenDarePost = (dare: DarePost) => {
    setMainFocusRequest({
      view: "dares",
      post: dare,
      nonce: Date.now(),
    });
    setCurrentScreen("main");
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

  const TAB_SCREENS = ["feed", "dares", "profile", "main", "chat-list"];
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
          <div className="full-height-scroll">
            <ProfileEditScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-dare":
        return (
          <div className="full-height-scroll">
            <CreateDareScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-feed":
        return (
          <div className="full-height-scroll">
            <CreateFeedPostScreen onBack={handleBackToMain} />
          </div>
        );
      case "chat":
        return (
          <div className="full-height-scroll">
            <MessagingScreen
              onBack={() => setCurrentScreen("chat-list")}
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
          <div className="full-height-scroll">
            <ActionPickerScreen
              onClose={handleBackToMain}
              onSelectAction={handleActionSelect}
            />
          </div>
        );
      case "create-truth":
        return (
          <div className="full-height-scroll">
            <CreateInteractionScreen mode="truth" onBack={handleBackToMain} />
          </div>
        );
      case "create-dare-interaction":
        return (
          <div className="full-height-scroll">
            <CreateInteractionScreen mode="dare" onBack={handleBackToMain} />
          </div>
        );
      case "alerts":
        return (
          <div className="full-height-scroll">
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
            />
          </div>
        );
      case "profile-creation":
        return (
          <div className="full-height-scroll">
            <ProfileCreationScreen
              onComplete={handleProfileCreationComplete}
              onBack={handleBackToMain}
            />
          </div>
        );
      case "user-search":
        return (
          <div className="full-height-scroll">
            <UserSearchScreen
              onBack={handleBackToMain}
              onUserSelect={handleUserSelect}
            />
          </div>
        );
      case "user-profile":
        return (
          <div className="full-height-scroll">
            <UserProfileScreen
              onBack={() => setCurrentScreen(previousScreen)}
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
          <div className="full-height-scroll">
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
      default:
        return null;
    }
  };

  const showBottomNav = isTabScreen && !isStoryViewerOpen;

  // Render a neutral shell during SSR and first client paint to avoid hydration mismatch.
  // Auth state from the persisted Zustand store is only safe to consume after mount.
  if (!mounted) {
    return <div className="bg-[#0a0f0a] h-screen" />;
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
    <div className="bg-[#0a0f0a] h-screen relative">
      <div
        className={effectiveScreen === "feed" ? "full-height-scroll" : "hidden"}
      >
        <FeedScreen
          isActive={effectiveScreen === "feed"}
          onBack={handleBackToMain}
          onCreatePost={() => setCurrentScreen("create-feed")}
          onNavigateToChat={() => setCurrentScreen("chat-list")}
          onNavigateToAlerts={() => setCurrentScreen("alerts")}
          onNavigateToSearch={handleNavigateToSearch}
          onNavigateToProfile={handleUserSelect}
          onStoryViewerOpenChange={setIsStoryViewerOpen}
        />
      </div>
      <div
        className={
          effectiveScreen === "dares" ? "full-height-scroll" : "hidden"
        }
      >
        <DaresReceivedScreen navigationRequest={daresNavigationRequest} />
      </div>
      <div
        className={
          effectiveScreen === "profile" ? "full-height-scroll" : "hidden"
        }
      >
        <ProfileScreen
          isActive={effectiveScreen === "profile"}
          onNavigateToProfile={handleUserSelect}
          onNavigateToActivity={handleNavigateToActivity}
          onNavigateToTruthPost={handleOpenTruthPost}
          onNavigateToDarePost={handleOpenDarePost}
        />
      </div>
      <div
        className={effectiveScreen === "main" ? "full-height-scroll" : "hidden"}
      >
        <MainScreen
          isActive={effectiveScreen === "main"}
          onDaresClick={() => setCurrentScreen("dares")}
          onNavigateToChat={() => setCurrentScreen("chat-list")}
          onNavigateToProfile={handleUserSelect}
          focusRequest={mainFocusRequest}
        />
      </div>
      <div
        className={
          effectiveScreen === "chat-list" ? "full-height-scroll" : "hidden"
        }
      >
        <ChatListScreen
          isActive={effectiveScreen === "chat-list"}
          onBack={handleBackToMain}
          onChatSelect={handleChatSelect}
          currentScreen="main"
          onScreenChange={(screen) => setCurrentScreen(screen as Screen)}
          onCreateClick={handleCreateClick}
        />
      </div>

      {!isTabScreen && renderOverlayScreen()}

      {showBottomNav && (
        <BottomNavigation
          currentScreen={
            effectiveScreen as "main" | "dares" | "profile" | "feed"
          }
          onScreenChange={(screen) => setCurrentScreen(screen as Screen)}
          onCreateClick={handleCreateClick}
        />
      )}
    </div>
  );
}
