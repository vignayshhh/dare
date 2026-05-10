"use client";

import { useState, useEffect } from "react";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { MessageCircle, Search, Plus, X, User } from "lucide-react";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { BottomNavigation } from "../../components/navigation/BottomNavigation";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { friendsService } from "../../middleware/services/service-factory";
import { primeResolvedUserProfile } from "../../utils/profileResolver";
import { useUserGhostModes } from "../../hooks/useUserGhostModes";

function formatConversationTime(timestamp: unknown): string {
  if (!timestamp) return "";

  let date: Date | null = null;

  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string" || typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "toDate" in timestamp &&
    typeof (timestamp as { toDate?: () => Date }).toDate === "function"
  ) {
    date = (timestamp as { toDate: () => Date }).toDate();
  } else if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "seconds" in timestamp &&
    typeof (timestamp as { seconds?: number }).seconds === "number"
  ) {
    date = new Date((timestamp as { seconds: number }).seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatListScreen({
  isActive = true,
  onBack,
  onChatSelect,
  currentScreen = "main",
  onScreenChange,
  onCreateClick,
}: {
  isActive?: boolean;
  onBack: () => void;
  onChatSelect: (
    userId: string,
    username: string,
    conversationId?: string,
  ) => void;
  currentScreen?: "main" | "dares" | "profile" | "feed";
  onScreenChange?: (screen: "main" | "dares" | "profile" | "feed") => void;
  onCreateClick?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, { isOnline: boolean; isGhostMode: boolean }>
  >({});
  const [typingByConversationId, setTypingByConversationId] = useState<
    Record<string, boolean>
  >({});
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const {
    conversations,
    loading,
    error,
    getOrCreateConversation,
    onlineFriends,
    typingUsers,
    loadConversations,
    subscribeToRealTimeConversations,
    unsubscribeFromRealTimeConversations,
  } = useMessagingStore();

  const { user } = useAuthStore();
  const userProfiles = useProfileDataStore((s) => s.userProfiles);

  const { setOnlineStatus } = useMessagingStore();

  // Sync online status via RTDB (same path the store reads from)
  useEffect(() => {
    if (!isActive || !user?.id) return;

    setOnlineStatus(true);
    subscribeToRealTimeConversations(user.id);
    loadConversations(user.id);

    const onVisibility = () =>
      setOnlineStatus(document.visibilityState !== "hidden");
    const onBeforeUnload = () => setOnlineStatus(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      setOnlineStatus(false);
      unsubscribeFromRealTimeConversations();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    isActive,
    user?.id,
    setOnlineStatus,
    subscribeToRealTimeConversations,
    unsubscribeFromRealTimeConversations,
    loadConversations,
  ]);

  useEffect(() => {
    if (!isActive || conversations.length === 0) {
      setPresenceByUserId({});
      setTypingByConversationId({});
      return;
    }

    const db = getFirestore();
    const unsubscribes: Array<() => void> = [];

    conversations.forEach((conversation) => {
      const otherUserId =
        conversation.other_user?.user_id || conversation.other_user?.id;

      if (otherUserId) {
        const presenceUnsub = onSnapshot(
          doc(db, "presence", otherUserId),
          (snapshot) => {
            const data = snapshot.data();
            const isOnline =
              data?.online === true ||
              data?.is_online === true ||
              data?.status === "online";
            const ghostExpiryRaw =
              data?.ghost_mode_expires_at?.toDate?.()?.toISOString?.() ||
              data?.ghost_mode_expires_at ||
              null;
            const ghostExpiryMs = ghostExpiryRaw
              ? new Date(ghostExpiryRaw).getTime()
              : 0;
            const isGhostMode =
              data?.ghost_mode === true &&
              Number.isFinite(ghostExpiryMs) &&
              ghostExpiryMs > Date.now();

            setPresenceByUserId((prev) => {
              const previous = prev[otherUserId];
              if (
                previous?.isOnline === isOnline &&
                previous?.isGhostMode === isGhostMode
              ) {
                return prev;
              }
              return { ...prev, [otherUserId]: { isOnline, isGhostMode } };
            });
          },
        );
        unsubscribes.push(presenceUnsub);
      }

      if (conversation.id && otherUserId) {
        const typingUnsub = onSnapshot(
          doc(db, "conversations", conversation.id, "typing", otherUserId),
          (snapshot) => {
            const isTyping =
              snapshot.exists() && snapshot.data()?.is_typing === true;

            setTypingByConversationId((prev) => {
              if (prev[conversation.id] === isTyping) return prev;
              return { ...prev, [conversation.id]: isTyping };
            });
          },
        );
        unsubscribes.push(typingUnsub);
      }
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [isActive, conversations]);

  const filteredConversations = conversations
    .filter(
      (conv) =>
        conv.other_user?.display_name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        conv.other_user?.username
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const getTimestamp = (conv: any) => {
        const timestamp =
          conv.last_message?.created_at ||
          conv.last_message_at ||
          conv.created_at;
        if (!timestamp) return 0;

        let date: Date | null = null;
        if (timestamp instanceof Date) {
          date = timestamp;
        } else if (
          typeof timestamp === "string" ||
          typeof timestamp === "number"
        ) {
          date = new Date(timestamp);
        } else if (
          typeof timestamp === "object" &&
          timestamp !== null &&
          "toDate" in timestamp &&
          typeof (timestamp as { toDate?: () => Date }).toDate === "function"
        ) {
          date = (timestamp as { toDate: () => Date }).toDate();
        } else if (
          typeof timestamp === "object" &&
          timestamp !== null &&
          "seconds" in timestamp &&
          typeof (timestamp as { seconds?: number }).seconds === "number"
        ) {
          date = new Date((timestamp as { seconds: number }).seconds * 1000);
        }

        return date ? date.getTime() : 0;
      };

      const timeA = getTimestamp(a);
      const timeB = getTimestamp(b);

      return timeB - timeA;
    });
  const ghostModesByUserId = useUserGhostModes([
    ...filteredConversations.map(
      (conversation) =>
        conversation.other_user?.user_id || conversation.other_user?.id,
    ),
    ...friendsList.map((friend) => friend.userId || friend.id),
  ]);

  const handleChatSelect = async (conversation: any) => {
    if (!user?.id) return;

    const conversationId =
      conversation.id ||
      (await getOrCreateConversation(
        user.id,
        conversation.other_user.user_id || conversation.other_user.id,
      ));

    onChatSelect(
      conversation.other_user.user_id || conversation.other_user.id,
      conversation.other_user.display_name || conversation.other_user.username,
      conversationId,
    );
  };

  const handleNewChat = () => {
    setShowFriendsModal(true);
  };

  const loadFriends = async () => {
    if (!user?.id) return;
    setLoadingFriends(true);
    try {
      const response = await friendsService.getFriends(user.id);
      console.log("[ChatList] Friends response:", response);
      if (response.success && response.friends) {
        console.log("[ChatList] Friends data:", response.friends);
        // Get existing conversation user IDs
        const existingConversationUserIds = new Set(
          conversations.map(
            (conv) => conv.other_user?.user_id || conv.other_user?.id,
          ),
        );

        // Filter friends who don't have existing conversations
        const availableFriends = response.friends.filter(
          (friend: any) =>
            !existingConversationUserIds.has(friend.userId || friend.id),
        );

        console.log("[ChatList] Available friends:", availableFriends);
        setFriendsList(availableFriends);
      } else {
        setFriendsList([]);
      }
    } catch (error) {
      console.error("Error loading friends:", error);
      setFriendsList([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleFriendSelect = async (friend: any) => {
    if (!user?.id) return;
    const friendUserId = friend.userId || friend.id;
    const friendName =
      friend.displayName ||
      friend.nickname ||
      friend.display_name ||
      friend.username;

    try {
      console.log("[ChatList] Friend selected:", friend);

      // Prime the friend's profile in the cache with ALL possible field names
      // This ensures the messaging service can find the correct username
      const profileData = {
        displayName:
          friend.displayName ||
          friend.display_name ||
          friend.nickname ||
          friend.username,
        username: friend.username,
        avatarUrl: friend.avatarUrl || friend.avatar_url || friend.avatar,
        display_name:
          friend.display_name ||
          friend.displayName ||
          friend.nickname ||
          friend.username,
        avatar_url: friend.avatarUrl || friend.avatar_url || friend.avatar,
        avatar: friend.avatar || friend.avatarUrl || friend.avatar_url,
        nickname:
          friend.nickname ||
          friend.displayName ||
          friend.display_name ||
          friend.username,
      };

      console.log("[ChatList] Priming profile for:", friendUserId, profileData);
      primeResolvedUserProfile(friendUserId, profileData);

      // Wait a moment for the profile cache to be set
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reload conversations to ensure the new conversation is in the list
      await loadConversations(user.id);
      const conversationId = await getOrCreateConversation(
        user.id,
        friendUserId,
      );

      console.log("[ChatList] Conversation created/loaded:", conversationId);

      // Small delay to ensure Firestore has propagated the new conversation
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Reload conversations again after creating to ensure it's in the store with user data
      await loadConversations(user.id);

      // Check if the conversation is in the list and has the correct user data
      const updatedConversation = useMessagingStore
        .getState()
        .conversations.find((c) => c.id === conversationId);
      console.log("[ChatList] Updated conversation:", updatedConversation);

      const resolvedFriendName =
        updatedConversation?.other_user?.display_name ||
        updatedConversation?.other_user?.username ||
        friendName;

      onChatSelect(friendUserId, resolvedFriendName, conversationId);
      setShowFriendsModal(false);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  // Load friends when modal opens
  useEffect(() => {
    if (showFriendsModal) {
      loadFriends();
    }
  }, [showFriendsModal, conversations]);

  const showSpinner = loading && conversations.length === 0;

  return (
    <div
      style={{
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        height: "100dvh",
        paddingBottom: "calc(var(--bottom-nav-total-height) + 16px)",
      }}
      className="flex flex-col bg-black"
    >
      <div className="safe-area-top px-4 pt-6 pb-0">
        <div
          style={{
            background: "linear-gradient(160deg, #1a2a1a 0%, #111811 100%)",
            borderRadius: "9999px",
            padding: "16px 24px",
            boxShadow:
              "0 8px 32px 0 rgba(74, 222, 128, 0.18), 0 2px 8px 0 rgba(0,0,0,0.7), 0 0 0 1px rgba(74,222,128,0.07)",
          }}
        >
          <div className="flex items-center justify-between">
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1,
              }}
            >
              Messages
            </h1>
            <button
              onClick={handleNewChat}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(34,197,94,0.45)",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Plus size={22} color="#000" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            background: "#161616",
            borderRadius: "18px",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            height: "52px",
            border: "1px solid #222",
          }}
        >
          <Search size={18} color="#555" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: "16px",
              marginLeft: "10px",
              width: "100%",
            }}
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pt-4 pb-8"
        style={{ gap: "10px", display: "flex", flexDirection: "column" }}
      >
        {showSpinner ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4ade80]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-red-500">{error}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageCircle size={48} className="text-[#64748b] mb-4" />
            <p className="text-[#94a3b8] mb-2">No conversations yet</p>
            <p className="text-[#64748b] text-sm">
              Start a new chat to get messaging!
            </p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const otherUserId =
              conversation.other_user?.user_id || conversation.other_user?.id;
            const unreadCount = conversation.unread_count ?? 0;
            const isRead = unreadCount === 0;
            const livePresence = presenceByUserId[otherUserId || ""];
            const isOnline =
              !!conversation.is_online ||
              !!livePresence?.isOnline ||
              (!!otherUserId && onlineFriends.includes(otherUserId));
            const isTyping =
              !!conversation.is_typing ||
              !!typingByConversationId[conversation.id] ||
              typingUsers.some(
                (typingUser) =>
                  typingUser.conversation_id === conversation.id &&
                  typingUser.user_id === otherUserId &&
                  typingUser.is_typing,
              );
            const latestMessageContent =
              conversation.last_message_content ||
              conversation.last_message?.content ||
              "No messages yet";
            const latestMessageAt =
              conversation.last_message?.created_at ||
              conversation.last_message_at ||
              conversation.created_at;
            const latestMessageTime = formatConversationTime(latestMessageAt);

            return (
              <div
                key={conversation.id}
                onClick={() => handleChatSelect(conversation)}
                style={{
                  background: "#111",
                  borderRadius: "20px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginBottom: "2px",
                  border: "1px solid #1e1e1e",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#181818")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#111")
                }
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar
                    src={conversation.other_user.avatar_url || ""}
                    alt={
                      (conversation.other_user.user_id &&
                        userProfiles[conversation.other_user.user_id]
                          ?.displayName) ||
                      conversation.other_user.display_name ||
                      conversation.other_user.username
                    }
                    size="lg"
                    userId={otherUserId}
                    forceGhostMode={
                      otherUserId
                        ? livePresence?.isGhostMode ??
                          ghostModesByUserId[otherUserId]
                        : undefined
                    }
                    showStatus={false}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: "2px",
                      bottom: "2px",
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: isOnline ? "#22c55e" : "#2a2a2a",
                      border: "2px solid #111",
                      boxShadow: isOnline
                        ? "0 0 0 2px rgba(34,197,94,0.18)"
                        : "none",
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0, marginLeft: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "3px",
                    }}
                  >
                    <span
                      style={{
                        color: isRead ? "#aaa" : "#fff",
                        fontWeight: isRead ? 500 : 700,
                        fontSize: "16px",
                        letterSpacing: "-0.2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "160px",
                      }}
                    >
                      {(conversation.other_user.user_id &&
                        userProfiles[conversation.other_user.user_id]
                          ?.displayName) ||
                        conversation.other_user.display_name ||
                        conversation.other_user.username}
                    </span>
                    <span
                      style={{
                        color: "#555",
                        fontSize: "12px",
                        flexShrink: 0,
                        marginLeft: "8px",
                        visibility:
                          isTyping || !latestMessageTime ? "hidden" : "visible",
                      }}
                    >
                      {latestMessageTime}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <p
                      style={{
                        color: isTyping ? "#4ade80" : isRead ? "#444" : "#888",
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        fontStyle: isTyping
                          ? "normal"
                          : isRead
                            ? "italic"
                            : "normal",
                        fontWeight: isTyping ? 600 : 400,
                      }}
                    >
                      {isTyping ? "typing..." : latestMessageContent}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginLeft: "8px",
                      }}
                    >
                      {isTyping && (
                        <div
                          style={{
                            display: "flex",
                            gap: "2px",
                            alignItems: "center",
                          }}
                        >
                          {[0, 0.1, 0.2].map((delay, i) => (
                            <div
                              key={i}
                              style={{
                                width: "4px",
                                height: "4px",
                                background: "#4ade80",
                                borderRadius: "50%",
                                animation: "bounce 0.8s infinite",
                                animationDelay: `${delay}s`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {!isTyping && unreadCount > 0 ? (
                        <span
                          style={{
                            background: "#22c55e",
                            color: "#000",
                            fontSize: "11px",
                            fontWeight: 700,
                            minWidth: "20px",
                            height: "20px",
                            borderRadius: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 6px",
                          }}
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : !isTyping ? (
                        <svg
                          width="20"
                          height="14"
                          viewBox="0 0 20 14"
                          fill="none"
                        >
                          <path
                            d="M1 7L5.5 11.5L14 3"
                            stroke="#22c55e"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 7L11.5 11.5L20 3"
                            stroke="#22c55e"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {onScreenChange && onCreateClick && (
        <BottomNavigation
          currentScreen={currentScreen}
          onScreenChange={onScreenChange}
          onCreateClick={onCreateClick}
        />
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes chatDialogEnter {
          from {
            opacity: 0;
            transform: translate(-50%, calc(-50% + 12px)) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>

      {/* Friends Modal */}
      {showFriendsModal && (
        <>
          <div
            className="app-modal-backdrop"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              backdropFilter: "blur(20px)",
              zIndex: 200,
            }}
            onClick={() => setShowFriendsModal(false)}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#111",
              borderRadius: "24px",
              width: "90%",
              maxWidth: "400px",
              maxHeight: "70vh",
              zIndex: 201,
              border: "1px solid #222",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
              animation: "chatDialogEnter 240ms var(--motion-ease-out) both",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid #222",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  color: "#fff",
                  fontSize: "18px",
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                Start New Chat
              </h2>
              <button
                onClick={() => setShowFriendsModal(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                padding: "16px",
                overflowY: "auto",
                maxHeight: "calc(70vh - 80px)",
              }}
            >
              {loadingFriends ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 20px",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                  }}
                >
                  Loading friends...
                </div>
              ) : friendsList.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 20px",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  <User size={48} style={{ marginBottom: "12px" }} />
                  <p>No friends available</p>
                  <p style={{ fontSize: 12, marginTop: "4px" }}>
                    All your friends already have conversations
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {friendsList.map((friend, i) => (
                    <div
                      key={`friend-${friend.id || friend.userId}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onClick={() => handleFriendSelect(friend)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.06)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.03)")
                      }
                    >
                      <div style={{ flexShrink: 0 }}>
                        <Avatar
                          src={friend.avatarUrl || friend.avatar_url || ""}
                          alt={
                            friend.displayName ||
                            friend.nickname ||
                            friend.display_name ||
                            friend.username
                          }
                          size="md"
                          userId={friend.userId || friend.id}
                          forceGhostMode={
                            (friend.userId || friend.id)
                              ? ghostModesByUserId[friend.userId || friend.id]
                              : undefined
                          }
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 15,
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {friend.displayName ||
                            friend.nickname ||
                            friend.display_name ||
                            friend.username}
                        </p>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.4)",
                            fontSize: 13,
                            margin: "2px 0 0",
                          }}
                        >
                          @
                          {String(friend.username || "unknown").replace(
                            /^@/,
                            "",
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
