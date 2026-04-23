"use client";

import { useState, useEffect } from "react";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { MessageCircle, Search, Plus } from "lucide-react";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { BottomNavigation } from "../../components/navigation/BottomNavigation";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";

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
    Record<string, boolean>
  >({});
  const [typingByConversationId, setTypingByConversationId] = useState<
    Record<string, boolean>
  >({});

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
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", () => setOnlineStatus(false));

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

            setPresenceByUserId((prev) => {
              if (prev[otherUserId] === isOnline) return prev;
              return { ...prev, [otherUserId]: isOnline };
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

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.other_user?.display_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      conv.other_user?.username
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

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

  const handleNewChat = async () => {
    if (!user?.id) return;
    try {
      const sakthiiiId = "user_1772876886209_vlfcgglfn";
      const conversationId = await getOrCreateConversation(user.id, sakthiiiId);
      onChatSelect(sakthiiiId, "sakthiii", conversationId);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  const showSpinner = loading && conversations.length === 0;

  return (
    <div
      style={{
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
      className="flex flex-col h-screen bg-black pb-24"
    >
      <div className="px-4 pt-6 pb-0">
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
        className="flex-1 overflow-y-auto px-4 pt-4"
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
            const isOnline =
              !!conversation.is_online ||
              !!presenceByUserId[otherUserId || ""] ||
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
                        visibility: isTyping ? "hidden" : "visible",
                      }}
                    >
                      {new Date(latestMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
      `}</style>
    </div>
  );
}
