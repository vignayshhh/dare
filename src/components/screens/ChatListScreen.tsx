"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  MessageCircle,
  Plus,
  Sparkles,
  X,
  User,
} from "lucide-react";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { friendsService } from "../../middleware/services/service-factory";
import { primeResolvedUserProfile } from "../../utils/profileResolver";
import { useUserGhostModes } from "../../hooks/useUserGhostModes";
import { chatInviteService } from "../../middleware/services/chat-invite.service";

const CHAT_LIST_DEBUG = false;

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

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
}

function DailyChallengeChatCard({ onClick }: { onClick: () => void }) {
  return (
    <>
      <style>{`
        @keyframes dailyChatSweep {
          0% { transform: translateX(-125%); }
          42% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        @keyframes dailyChatHalo {
          0% { transform: rotate(0deg); opacity: 0.5; }
          50% { opacity: 0.95; }
          100% { transform: rotate(360deg); opacity: 0.5; }
        }
        @keyframes dailyChatPulse {
          0%, 100% { opacity: 0.58; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .daily-chat-entry::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          animation: dailyChatSweep 6.8s ease-in-out infinite;
          pointer-events: none;
        }
        .daily-chat-orb::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 24px;
          background: conic-gradient(from 180deg, rgba(74,222,128,0), rgba(74,222,128,0.9), rgba(14,165,233,0.62), rgba(74,222,128,0));
          animation: dailyChatHalo 3.6s linear infinite;
        }
        .daily-chat-dot {
          animation: dailyChatPulse 2.2s ease-in-out infinite;
        }
      `}</style>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        aria-label="Daily Challenge"
        className="daily-chat-entry group relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 18% -18%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 92% 16%, rgba(14,165,233,0.12), transparent 32%), linear-gradient(180deg, rgba(22,28,23,0.98), rgba(8,12,9,0.98))",
          borderRadius: "28px",
          padding: "14px 16px",
          minHeight: "90px",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          marginBottom: "2px",
          flexShrink: 0,
          border: "1px solid rgba(74,222,128,0.28)",
          boxShadow:
            "0 18px 44px rgba(0,0,0,0.34), 0 0 28px rgba(74,222,128,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
          transition:
            "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = "translateY(-1px)";
          event.currentTarget.style.borderColor = "rgba(74,222,128,0.42)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.borderColor = "rgba(74,222,128,0.28)";
        }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
        <div className="daily-chat-orb relative z-[1] flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] p-[2px] shadow-[0_14px_34px_rgba(74,222,128,0.12)]">
          <div className="relative z-[1] flex h-full w-full items-center justify-center overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] text-[#86efac] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-14px_28px_rgba(74,222,128,0.06)]">
            <span className="absolute left-3 right-3 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,0.72),rgba(14,165,233,0.52),transparent)] shadow-[0_0_14px_rgba(74,222,128,0.18)]" />
            <Sparkles size={24} strokeWidth={2.5} />
          </div>
        </div>
        <div className="relative z-[1] min-w-0 flex-1">
          <div className="mb-[3px] flex items-center justify-between gap-2">
            <span className="truncate text-[16px] font-extrabold text-white">
              Daily Challenge
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-[#86efac]">
              Today
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#94a3b8]">
              Match Hour is waiting
            </p>
            <span className="daily-chat-dot h-2 w-2 shrink-0 rounded-full bg-[#4ade80] shadow-[0_0_14px_rgba(74,222,128,0.55)]" />
          </div>
        </div>
        <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.055] text-[#cbd5e1] transition-colors group-hover:border-[#4ade80]/30 group-hover:text-white">
          <ArrowRight size={18} strokeWidth={2.6} />
        </div>
      </div>
    </>
  );
}

export function ChatListScreen({
  isActive = true,
  onBack,
  onChatSelect,
  onInviteAlertsClick,
  onDailyChallengeClick,
}: {
  isActive?: boolean;
  onBack: () => void;
  onChatSelect: (
    userId: string,
    username: string,
    conversationId?: string,
  ) => void;
  onInviteAlertsClick?: () => void;
  onDailyChallengeClick?: () => void;
}) {
  const searchQuery = "";
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [inviteAlertCount, setInviteAlertCount] = useState(0);
  const {
    conversations,
    loading,
    error,
    getOrCreateConversation,
    loadConversations,
    onlineFriends,
    typingUsers,
  } = useMessagingStore();

  const { user } = useAuthStore();

  const userProfiles = useProfileDataStore((s) => s.userProfiles);

  useEffect(() => {
    if (!isActive || !CHAT_LIST_DEBUG) return;
    console.log("[ChatList DEBUG] indicator inputs:", {
      userId: user?.id ?? null,
      conversationCount: conversations.length,
      onlineFriends,
      typingUsers,
      conversations: conversations.map((conversation) => {
        const otherUserId =
          conversation.other_user?.user_id || conversation.other_user?.id;
        return {
          conversationId: conversation.id,
          otherUserId,
          otherUsername: conversation.other_user?.username,
          conversationIsOnline: conversation.is_online,
          storeIncludesOnlineFriend:
            !!otherUserId && onlineFriends.includes(otherUserId),
          finalIsOnline:
            !!otherUserId && onlineFriends.includes(otherUserId),
          conversationIsTyping: conversation.is_typing,
          matchingTypingUsers: typingUsers.filter(
            (typingUser) =>
              typingUser.conversation_id === conversation.id &&
              typingUser.user_id !== user?.id,
          ),
          finalIsTyping:
            !!conversation.is_typing ||
            typingUsers.some(
              (typingUser) =>
                typingUser.conversation_id === conversation.id &&
                typingUser.user_id !== user?.id &&
                typingUser.is_typing,
            ),
        };
      }),
    });
  }, [isActive, user?.id, conversations, onlineFriends, typingUsers]);

  useEffect(() => {
    if (!isActive || !user?.id) {
      setInviteAlertCount(0);
      return;
    }
    return chatInviteService.subscribeReceivedInvites(user.id, (invites) => {
      setInviteAlertCount(
        invites.filter((invite) =>
          ["pending", "accepted"].includes(invite.status),
        ).length,
      );
    });
  }, [isActive, user?.id]);

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
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)",
      }}
      className="flex flex-col"
    >
      <div
        className="flex-1 overflow-y-auto px-4 pb-8"
        style={{
          gap: "10px",
          display: "flex",
          flexDirection: "column",
          paddingTop: "calc(var(--safe-area-top) + 14px)",
        }}
      >
        <div
          className="relative z-10 mb-5 shrink-0 overflow-hidden rounded-[34px] border border-white/8 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl"
          style={{
            background:
              "radial-gradient(ellipse at 24% -45%, rgba(74,222,128,0.15), transparent 64%), radial-gradient(ellipse at 82% -40%, rgba(14,165,233,0.1), transparent 62%), linear-gradient(180deg, rgba(13,19,14,0.92), rgba(8,13,9,0.96))",
          }}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={onBack}
              aria-label="Back"
              className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.045] text-[#94a3b8] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#4ade80]/35 hover:bg-[#4ade80]/10 hover:text-white"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: "34px",
                  fontWeight: 900,
                  color: "#ffffff",
                  letterSpacing: 0,
                  lineHeight: 1,
                }}
              >
                Messages
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={onInviteAlertsClick}
                aria-label="Invite alerts"
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "22px",
                  background: "rgba(255,255,255,0.045)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 14px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                <Bell size={23} color="#4ade80" strokeWidth={2.5} />
                {inviteAlertCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 3,
                      minWidth: 20,
                      height: 20,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: "#22c55e",
                      color: "#000",
                      border: "2px solid #111811",
                      fontSize: 11,
                      fontWeight: 900,
                      lineHeight: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {inviteAlertCount > 9 ? "9+" : inviteAlertCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleNewChat}
                aria-label="Start new chat"
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "22px",
                  background: "linear-gradient(135deg,#4ade80,#22c55e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 14px 34px rgba(74,222,128,0.24)",
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Plus size={25} color="#000" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {onDailyChallengeClick ? (
          <DailyChallengeChatCard onClick={onDailyChallengeClick} />
        ) : null}

        {showSpinner ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4ade80]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-red-500">{error}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(14,16,14,0.98))] px-6 py-10 text-center shadow-[0_20px_56px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.12),rgba(255,255,255,0.03)_55%,transparent_75%)]">
              <MessageCircle size={28} className="text-[#86efac]" />
            </div>
            <p className="mb-2 text-lg font-bold text-white">
              No conversations yet
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-[#94a3b8]">
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
              !!otherUserId && onlineFriends.includes(otherUserId);
            const isTyping =
              !!conversation.is_typing ||
              typingUsers.some(
                (typingUser) =>
                  typingUser.conversation_id === conversation.id &&
                  typingUser.user_id !== user?.id &&
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
                  background:
                    "linear-gradient(180deg, rgba(22,26,22,0.98), rgba(13,16,13,0.98))",
                  borderRadius: "28px",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
          marginBottom: "2px",
                  border: isRead
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(74,222,128,0.28)",
                  boxShadow: isRead
                    ? "0 18px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)"
                    : "0 20px 50px rgba(0,0,0,0.38), 0 0 28px rgba(74,222,128,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                  transition:
                    "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(180deg, rgba(28,34,28,0.98), rgba(15,19,15,0.98))";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(180deg, rgba(22,26,22,0.98), rgba(13,16,13,0.98))";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
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
                      otherUserId ? ghostModesByUserId[otherUserId] : undefined
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
                      border: "2px solid #0d100d",
                      boxShadow: isOnline
                        ? "0 0 0 2px rgba(34,197,94,0.18)"
                        : "none",
                    }}
                    // DEBUG: Log when presence indicator is rendered
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log(
                        "🔍 [ChatList DEBUG] Presence indicator clicked:",
                        {
                          conversationId: conversation.id,
                          otherUserId,
                          isOnline,
                          isTyping,
                          onlineFriends,
                          typingUsers,
                        },
                      );
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
                        color: isRead ? "#e2e8f0" : "#fff",
                        fontWeight: isRead ? 650 : 800,
                        fontSize: "16px",
                        letterSpacing: 0,
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
                        color: "#64748b",
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
                        color: isTyping
                          ? "#86efac"
                          : isRead
                            ? "#64748b"
                            : "#cbd5e1",
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        fontStyle: isTyping ? "normal" : "normal",
                        fontWeight: isTyping || !isRead ? 600 : 450,
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
              background: "rgba(0,0,0,0.78)",
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
              background:
                "radial-gradient(circle at 50% -18%, rgba(74,222,128,0.16), transparent 42%), linear-gradient(180deg, rgba(19,23,19,0.98), rgba(9,11,9,0.99))",
              borderRadius: "30px",
              width: "90%",
              maxWidth: "400px",
              maxHeight: "70vh",
              zIndex: 201,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 28px 80px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.05)",
              animation: "chatDialogEnter 240ms var(--motion-ease-out) both",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  color: "#fff",
                  fontSize: "18px",
                  fontWeight: 850,
                  margin: 0,
                  letterSpacing: 0,
                }}
              >
                Start New Chat
              </h2>
              <button
                onClick={() => setShowFriendsModal(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
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
                    color: "#94a3b8",
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
                    color: "#94a3b8",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 22,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background:
                        "radial-gradient(circle at top, rgba(74,222,128,0.12), rgba(255,255,255,0.03) 60%, transparent 80%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <User size={28} color="#86efac" />
                  </div>
                  <p style={{ color: "#fff", fontWeight: 750 }}>
                    No friends available
                  </p>
                  <p style={{ fontSize: 12, marginTop: "4px" }}>
                    All your friends already have conversations
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
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
                        borderRadius: "22px",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
                        border: "1px solid rgba(255,255,255,0.07)",
                        cursor: "pointer",
                        transition:
                          "background 0.15s ease, border-color 0.15s ease",
                      }}
                      onClick={() => handleFriendSelect(friend)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(180deg, rgba(74,222,128,0.1), rgba(255,255,255,0.035))";
                        e.currentTarget.style.borderColor =
                          "rgba(74,222,128,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))";
                        e.currentTarget.style.borderColor =
                          "rgba(255,255,255,0.07)";
                      }}
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
                            friend.userId || friend.id
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
