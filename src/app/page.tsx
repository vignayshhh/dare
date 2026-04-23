"use client";

import { useState, useEffect, useRef } from "react";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { MainScreen } from "../components/screens/MainScreen";
import { FeedScreen } from "../components/screens/FeedScreen";
import { DaresReceivedScreen } from "../components/screens/DaresReceivedScreen";
import { ProfileScreen } from "../components/screens/ProfileScreen";
import { CreateDareScreen } from "../components/screens/CreateDareScreen";
import { CreateFeedPostScreen } from "../components/screens/CreateFeedPostScreen";
import { BottomNavigation } from "../components/navigation/BottomNavigation";
import { AuthScreen } from "../components/screens/AuthScreen";
import { ChatListScreen } from "../components/screens/ChatListScreen";
import MessagingScreen from "../components/screens/MessagingScreen";
import { LaunchGate } from "../components/LaunchScreen";
import { ActionPickerScreen } from "../components/screens/ActionPickerScreen";
import { CreateInteractionScreen } from "../components/screens/CreateInteractionScreen";
import { ProfileCreationScreen } from "../components/screens/ProfileCreationScreen";
import { AlertsScreen } from "../components/screens/AlertsScreen";
import { UserSearchScreen } from "../components/screens/UserSearchScreen";
import { UserProfileScreen } from "../components/screens/UserProfileScreen";
import { ProfileEditScreen } from "../components/screens/ProfileEditScreen";
import { ActivityScreen } from "../components/screens/ActivityScreen";
import { ConsentScreen } from "../components/screens/ConsentScreen";
import { useAuthStore } from "../stores/useAuthStore-v2";
import { useMessagingStore } from "../stores/useMessagingStore";
import { messagingService } from "../middleware/services/messaging.service";
import { startAvatarSync } from "../utils/avatarSync";
import { avatarSyncService } from "../services/avatarSyncService";
import { profileSyncService } from "../services/profileSyncService";
import { useProfileDataStore } from "../stores/profileDataStore";
import { surveillanceService } from "../middleware/services/surveillance.service";
import { backgroundPreCache } from "../utils/backgroundPreCache";
import type { TruthPost, DarePost } from "../middleware/adapters/data-adapters";

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

export default function Home() {
  const { user, loading, isAuthenticated, signOut, initializeAuth } =
    useAuthStore();
  const [currentScreen, setCurrentScreen] = useState<Screen>("feed");
  const [isChatActive, setIsChatActive] = useState(false);
  const [chatUserId, setChatUserId] = useState<string>("");
  const [chatUsername, setChatUsername] = useState<string>("");
  const [chatConversationId, setChatConversationId] = useState<string>("");
  const [lastActiveConversationId, setLastActiveConversationId] =
    useState<string>("");
  const [lastActiveChatUserId, setLastActiveChatUserId] = useState<string>("");
  const chatConversationIdRef = useRef<string>("");
  const lastActiveConversationIdRef = useRef<string>("");
  const lastActiveChatUserIdRef = useRef<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserPostId, setSelectedUserPostId] = useState<string>("");
  const [previousScreen, setPreviousScreen] = useState<Screen>("feed");
  const [mainFocusRequest, setMainFocusRequest] = useState<{
    view: "truth" | "dares";
    post: TruthPost | DarePost;
    nonce: number;
  } | null>(null);
  const [daresNavigationRequest, setDaresNavigationRequest] =
    useState<DaresNavigationRequest | null>(null);
  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Background pre-cache during idle time (non-blocking)
  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    // Trigger background pre-cache during browser idle time
    // This spreads reads across idle periods and makes the app feel faster
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

  // Initialize avatar + profile data sync when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // Legacy avatar sync (keep for compatibility)
      startAvatarSync();

      // Set current user profile data in store
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
  }, [isAuthenticated, user?.id]);

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

  // Handle auth state changes - only redirect to feed if profile creation is completed
  useEffect(() => {
    if (isAuthenticated && currentScreen === "auth") {
      // Check if user needs to complete profile creation first
      if (
        user?.hasCompletedProfileCreation === false ||
        user?.hasCompletedProfileCreation === undefined
      ) {
        setCurrentScreen("profile-creation");
      } else {
        setCurrentScreen("feed");
      }
    }
  }, [isAuthenticated, currentScreen, user?.hasCompletedProfileCreation]);

  // Handle profile creation redirect for any authenticated user
  useEffect(() => {
    // Small delay to ensure user state is properly loaded
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

  const handleProfileCreationComplete = (profileData: any) => {
    setCurrentScreen("feed");
  };

  const handleBackToMain = () => {
    setCurrentScreen("feed");
  };

  const handleSwitchToRegister = () => {
    setCurrentScreen("profile-creation");
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

    const state = useMessagingStore.getState();
    const previousChatUserId = lastActiveChatUserIdRef.current;

    if (previousChatUserId && previousChatUserId === nextUserId) {
      return;
    }

    const nextConversation = state.conversations.find(
      (c: any) => c.id === nextConversationId,
    );
    const targetUserName =
      nextUsername ||
      nextConversation?.other_user?.display_name ||
      nextConversation?.other_user?.username ||
      "someone";

    void messagingService.emitOptimisticChatSwitchSignal(
      fromConversationId,
      user?.id || "",
      targetUserName,
      nextUserId,
      previousChatUserId || undefined,
    );

    void state.trackChatSwitch(
      fromConversationId,
      targetUserName,
      nextUserId,
      previousChatUserId || undefined,
    );
  };

  const handleChatSelect = async (
    userId: string,
    username: string,
    conversationId?: string,
  ) => {
    const nextConversationId = conversationId || "";
    emitChatSwitchForPreviousConversation(nextConversationId, userId, username);
    updateCurrentChatPresence(userId, username);
    setChatUserId(userId);
    setChatUsername(username);
    setChatConversationId(nextConversationId); // use provided conversationId or let MessagingScreen pick from conversations list
    setCurrentScreen("chat");
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedUserPostId("");
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  const handleOpenSharedPost = (userId: string, postId: string) => {
    setSelectedUserId(userId);
    setSelectedUserPostId(postId);
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  // Navigate from UserProfileScreen → MessagingScreen with a real conversation
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
      setChatUserId(targetUserId);
      setChatUsername(targetUsername);
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
    setCurrentScreen("activity");
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

  // Screens that live in the bottom nav — kept always mounted to avoid remount delay
  const TAB_SCREENS = ["feed", "dares", "profile", "main", "chat-list"];
  const isTabScreen = TAB_SCREENS.includes(currentScreen);

  // Render overlay screens (not in the bottom nav) only when active
  const renderOverlayScreen = () => {
    switch (currentScreen) {
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
                // Navigate to activity screen with the specific user's ID
                // We'll need to modify ActivityScreen to accept userId
                setSelectedUserId(userId);
                setCurrentScreen("activity");
              }}
              initialPostId={selectedUserPostId || undefined}
            />
          </div>
        );
      case "activity":
        return (
          <div className="full-height-scroll">
            <ActivityScreen
              userId={selectedUserId || undefined}
              onBack={() => setCurrentScreen(previousScreen)}
              onNavigateToPost={(postId: string) => {
                // Navigate to the post screen with the specific post
                setSelectedUserPostId(postId);
                setCurrentScreen("user-profile");
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // Don't show bottom navigation on overlay screens or when chat is active
  const showBottomNav = isTabScreen && !isChatActive;

  // Show auth screen if not authenticated
  if (!isAuthenticated && !loading) {
    return (
      <div className="full-height-scroll">
        <AuthScreen
          onLogin={() => {
            // Let the useEffect handle routing based on hasCompletedProfileCreation
          }}
        />
      </div>
    );
  }

  // SECURITY FIX: Show consent screen if user hasn't accepted consent yet
  // This prevents silent consent bypass and ensures explicit user agreement
  if (isAuthenticated && user && (!user.is_18_plus || !user.consent_accepted)) {
    return <ConsentScreen />;
  }

  return (
    <LaunchGate>
      <div className="bg-[#0a0f0a] h-screen relative">
        {/* ── Always-mounted tab screens ── each has its own scroll context */}
        <div
          className={currentScreen === "feed" ? "full-height-scroll" : "hidden"}
        >
          <FeedScreen
            isActive={currentScreen === "feed"}
            onBack={handleBackToMain}
            onCreatePost={() => setCurrentScreen("create-feed")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToAlerts={() => setCurrentScreen("alerts")}
            onNavigateToSearch={handleNavigateToSearch}
            onNavigateToProfile={handleUserSelect}
          />
        </div>
        <div
          className={
            currentScreen === "dares" ? "full-height-scroll" : "hidden"
          }
        >
          <DaresReceivedScreen navigationRequest={daresNavigationRequest} />
        </div>
        <div
          className={
            currentScreen === "profile" ? "full-height-scroll" : "hidden"
          }
        >
          <ProfileScreen
            isActive={currentScreen === "profile"}
            onNavigateToProfile={handleUserSelect}
            onNavigateToActivity={handleNavigateToActivity}
            onNavigateToTruthPost={handleOpenTruthPost}
            onNavigateToDarePost={handleOpenDarePost}
          />
        </div>
        <div
          className={currentScreen === "main" ? "full-height-scroll" : "hidden"}
        >
          <MainScreen
            onDaresClick={() => setCurrentScreen("dares")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToProfile={handleUserSelect}
            focusRequest={mainFocusRequest}
          />
        </div>
        <div
          className={
            currentScreen === "chat-list" ? "full-height-scroll" : "hidden"
          }
        >
          <ChatListScreen
            isActive={currentScreen === "chat-list"}
            onBack={handleBackToMain}
            onChatSelect={handleChatSelect}
            currentScreen="main"
            onScreenChange={(screen) => setCurrentScreen(screen as Screen)}
            onCreateClick={handleCreateClick}
          />
        </div>

        {/* ── Overlay screens ── rendered only when active */}
        {!isTabScreen && renderOverlayScreen()}

        {showBottomNav && (
          <BottomNavigation
            currentScreen={
              currentScreen as "main" | "dares" | "profile" | "feed"
            }
            onScreenChange={(screen) => setCurrentScreen(screen as Screen)}
            onCreateClick={handleCreateClick}
          />
        )}
      </div>
    </LaunchGate>
  );
}
