import { useState, useEffect, useRef, useCallback } from "react";
import {
  useMessagingStore,
  type MessageEvent,
} from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useGhostModeStore } from "../../stores/useGhostModeStore";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  messagingService,
  type ChatSwitchSignal,
} from "../../middleware/services/messaging.service";
import {
  parseSharedPostPayload,
  type SharedPostPayload,
} from "../../utils/sharedPostMessage";

type From = "me" | "them";
type Status = "seen" | "delivered" | "screenshot";
type EvType =
  | "screenshot"
  | "chat_switch"
  | "opened_noreply"
  | "long_unsent"
  | "mention"
  | "ignored";

interface Msg {
  id: string;
  kind: "msg";
  from: From;
  text: string;
  sharedPost: SharedPostPayload | null;
}
interface Evt {
  id: string;
  kind: "evt";
  type: EvType;
  text: string;
  targetUserId?: string;
}
type TimelineItem = Msg | Evt;

const FRIEND = {
  name: "Nina Creates",
  avatar: "https://picsum.photos/seed/nina/100/100",
};

// ─── Event label helpers ─────────────────────────────────────────────────────

const getScreenshotLabel = () => (
  <span>
    <span style={{ color: "#888" }}>You took a </span>
    <span style={{ color: "#3df57f", fontWeight: 700 }}>screenshot</span>
    <span style={{ color: "#888" }}> of this chat</span>
  </span>
);

const getChatSwitchLabel = (text: string) => {
  const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
  if (mine) {
    return (
      <span>
        <span style={{ color: "#888" }}>You went to chat with </span>
        <span style={{ color: "#3df57f", fontWeight: 700 }}>{mine[1]}</span>
      </span>
    );
  }

  const m = text.match(
    /^(.+?)\s+is\s+(?:chatting|talking)\s+with\s+(.+?)(?:,\s*not\s+you|(?:\s+instead\s+of\s+you)!?)?$/i,
  );
  if (m) {
    return (
      <span>
        <span style={{ color: "#888" }}>Wait! </span>
        <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[1]}</span>
        <span style={{ color: "#888" }}> is now talking with </span>
        <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[2]}</span>
        <span style={{ color: "#888" }}> instead of you!</span>
      </span>
    );
  }
  return <span style={{ color: "#888" }}>{text}</span>;
};

const getOpenedNoReplyLabel = (text: string) => {
  const m = text.match(/^(.*?)\s+opened\s+(.*)$/i);
  return m ? (
    <span>
      <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}> opened the chat but </span>
      <span style={{ color: "#3df57f", fontWeight: 700 }}>didn't reply</span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const getLongUnsentLabel = () => (
  <span>
    <span style={{ color: "#888" }}>You typed a </span>
    <span style={{ color: "#3df57f", fontWeight: 700 }}>long message</span>
    <span style={{ color: "#888" }}> but </span>
    <span style={{ color: "#3df57f", fontWeight: 700 }}>didn't send it</span>
  </span>
);

const getMentionLabel = (text: string) => {
  const m = text.match(
    /^(@\S+) was notified that you two are talking about them(.*)$/i,
  );
  return m ? (
    <span>
      <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}>
        {" "}
        was notified that you two are talking about them{m[2]}
      </span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const getIgnoredLabel = (text: string) => {
  const currentUserIgnored = text.match(/^You\s+ignored\s+(.+?)'s\s+message$/i);
  if (currentUserIgnored) {
    return (
      <span>
        <span style={{ color: "#888" }}>You ignored </span>
        <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
          {currentUserIgnored[1]}
        </span>
        <span style={{ color: "#888" }}>'s message</span>
      </span>
    );
  }

  const otherUserIgnored = text.match(/^(.+?)\s+ignored\s+your\s+message$/i);
  return otherUserIgnored ? (
    <span>
      <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
        {otherUserIgnored[1]}
      </span>
      <span style={{ color: "#888" }}> ignored your message</span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const EV_CFG: Record<
  EvType,
  { icon: string; accent: string; label: (t: string) => React.ReactNode }
> = {
  screenshot: {
    icon: "📸",
    accent: "#3df57f",
    label: () => getScreenshotLabel(),
  },
  chat_switch: { icon: "💬", accent: "#3df57f", label: getChatSwitchLabel },
  opened_noreply: {
    icon: "👁",
    accent: "#3df57f",
    label: getOpenedNoReplyLabel,
  },
  long_unsent: {
    icon: "✍️",
    accent: "#3df57f",
    label: () => getLongUnsentLabel(),
  },
  mention: { icon: "🔔", accent: "#3df57f", label: getMentionLabel },
  ignored: {
    icon: "🫥",
    accent: "#ff6b6b",
    label: (text: string) => getIgnoredLabel(text),
  },
};

// ─── SysLine ──────────────────────────────────────────────────────────────────

function getMoodTheme(mood: string) {
  if (mood === "angry") {
    return {
      accent: "#ff6b5f",
      accentSoft: "rgba(255,107,95,0.24)",
      accentGlow: "rgba(255,107,95,0.42)",
      panel:
        "linear-gradient(180deg, rgba(58,18,18,0.96) 0%, rgba(18,10,10,0.98) 100%)",
      label: "Heat Rising",
    };
  }
  if (mood === "crying") {
    return {
      accent: "#69b7ff",
      accentSoft: "rgba(105,183,255,0.24)",
      accentGlow: "rgba(105,183,255,0.4)",
      panel:
        "linear-gradient(180deg, rgba(16,35,58,0.96) 0%, rgba(9,16,28,0.98) 100%)",
      label: "Soft Silence",
    };
  }
  if (mood === "irritated") {
    return {
      accent: "#ffb347",
      accentSoft: "rgba(255,179,71,0.24)",
      accentGlow: "rgba(255,179,71,0.4)",
      panel:
        "linear-gradient(180deg, rgba(56,34,10,0.96) 0%, rgba(22,15,9,0.98) 100%)",
      label: "Tension High",
    };
  }
  if (mood === "depressed") {
    return {
      accent: "#9aa4b8",
      accentSoft: "rgba(154,164,184,0.22)",
      accentGlow: "rgba(154,164,184,0.34)",
      panel:
        "linear-gradient(180deg, rgba(24,28,38,0.96) 0%, rgba(12,14,18,0.98) 100%)",
      label: "Low Tide",
    };
  }
  return {
    accent: "#3df57f",
    accentSoft: "rgba(61,245,127,0.18)",
    accentGlow: "rgba(61,245,127,0.3)",
    panel:
      "linear-gradient(180deg, rgba(22,30,26,0.96) 0%, rgba(12,16,14,0.98) 100%)",
    label: "Mood Active",
  };
}

function SysLine({
  type,
  text,
  collapsed,
  targetUserId,
  onOpenUserProfile,
}: {
  type: EvType;
  text: string;
  collapsed: boolean;
  targetUserId?: string;
  onOpenUserProfile?: (userId: string) => void;
}) {
  const cfg = EV_CFG[type];

  const openTargetProfile = () => {
    if (!targetUserId) return;
    onOpenUserProfile?.(targetUserId);
  };

  const renderTargetName = (label: string) =>
    targetUserId && onOpenUserProfile ? (
      <button
        onClick={openTargetProfile}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "#3df57f",
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        {label}
      </button>
    ) : (
      <span style={{ color: "#3df57f", fontWeight: 700 }}>{label}</span>
    );

  const shortNode = (() => {
    if (type === "chat_switch") {
      const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
      if (mine) {
        return (
          <span>
            <span style={{ color: "#3df57f", fontWeight: 700 }}>You</span>
            <span style={{ color: "#888" }}> → </span>
            <span style={{ color: "#3df57f", fontWeight: 700 }}>{mine[1]}</span>
          </span>
        );
      }
      const m = text.match(
        /(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
      );
      return (
        <span>
          <span style={{ color: "#888" }}>Was chatting with </span>
          {renderTargetName(m?.[1] ?? "someone")}
        </span>
      );
    }
    if (type === "opened_noreply") {
      const m = text.match(/^(.*?)\s+opened/i);
      return (
        <span>
          <span style={{ color: "#3df57f", fontWeight: 700 }}>
            {m?.[1] ?? "User"}
          </span>
          <span style={{ color: "#888" }}> opened • no reply</span>
        </span>
      );
    }
    if (type === "mention") {
      const m = text.match(/^(@\S+)/);
      return m ? (
        <span>
          <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[1]}</span>
          <span style={{ color: "#888" }}> notified</span>
        </span>
      ) : (
        <span style={{ color: "#777" }}>{text}</span>
      );
    }
    if (type === "screenshot")
      return (
        <span>
          <span style={{ color: "#888" }}>📸 </span>
          <span style={{ color: "#3df57f", fontWeight: 700 }}>screenshot</span>
        </span>
      );
    if (type === "long_unsent")
      return (
        <span>
          <span style={{ color: "#3df57f", fontWeight: 700 }}>Long msg</span>
          <span style={{ color: "#888" }}> unsent</span>
        </span>
      );
    if (type === "ignored") return getIgnoredLabel(text);
    return <span style={{ color: "#777" }}>{text}</span>;
  })();

  const contentNode =
    type === "chat_switch" && !collapsed
      ? (() => {
          const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
          if (mine) {
            return (
              <span>
                <span style={{ color: "#888" }}>You went to chat with </span>
                {renderTargetName(mine[1])}
              </span>
            );
          }
          const active = text.match(
            /^(.+?)\s+is\s+now\s+(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
          );
          if (active) {
            return (
              <span>
                <span style={{ color: "#888" }}>Wait! - </span>
                <span style={{ color: "#3df57f", fontWeight: 700 }}>
                  {active[1]}
                </span>
                <span style={{ color: "#888" }}> is now talking with </span>
                {renderTargetName(active[2])}
                <span style={{ color: "#888" }}> instead of you!</span>
              </span>
            );
          }
          const past = text.match(
            /^(.+?)\s+was\s+(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
          );
          if (past) {
            return (
              <span>
                <span style={{ color: "#888" }}>Wait! - </span>
                <span style={{ color: "#3df57f", fontWeight: 700 }}>
                  {past[1]}
                </span>
                <span style={{ color: "#888" }}> was chatting with </span>
                {renderTargetName(past[2])}
                <span style={{ color: "#888" }}> instead of you!</span>
              </span>
            );
          }
          return cfg.label(text);
        })()
      : collapsed
        ? shortNode
        : cfg.label(text);

  if (!cfg)
    return (
      <div
        style={{
          padding: "4px 14px 5px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#555", fontSize: 12 }}>{text}</span>
      </div>
    );
  return (
    <div
      style={{
        padding: collapsed ? "3px 14px 3px" : "6px 14px 10px",
        display: "flex",
        justifyContent: "center",
        transition: "padding 0.4s ease",
      }}
    >
      <div
        style={{
          background: "#111",
          borderRadius: collapsed ? 50 : 22,
          padding: collapsed ? "7px 16px" : "20px 24px 18px",
          display: "flex",
          flexDirection: collapsed ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: collapsed ? 6 : 12,
          overflow: "hidden",
          width: collapsed ? "fit-content" : "100%",
          maxWidth: collapsed ? 240 : "100%",
          transition:
            "border-radius 0.4s ease, padding 0.4s ease, width 0.4s ease, max-width 0.4s ease",
          animation: collapsed
            ? "none"
            : "capsuleReveal 0.55s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 12, lineHeight: 1 }}>{cfg.icon}</span>
        ) : (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#1a1a1a",
              border: `1.5px solid ${cfg.accent}55`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {cfg.icon}
          </div>
        )}
        <div
          style={{
            fontSize: collapsed ? 12 : 15,
            lineHeight: collapsed ? 1.2 : 1.6,
            textAlign: collapsed ? "left" : "center",
            letterSpacing: "0.01em",
            whiteSpace: collapsed ? "nowrap" : "normal",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "font-size 0.3s ease",
          }}
        >
          {contentNode}
        </div>
      </div>
    </div>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function Bubble({
  msg,
  showStatus,
  status,
  onOpenSharedPost,
}: {
  msg: Msg;
  showStatus: boolean;
  status: Status;
  onOpenSharedPost?: (userId: string, postId: string) => void;
}) {
  const own = msg.from === "me";
  return (
    <div style={{ padding: "4px 14px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: own ? "flex-end" : "flex-start",
          alignItems: "flex-start",
          gap: 0,
        }}
      >
        {own ? (
          <>
            <div
              style={{
                maxWidth: "82%",
                padding: "12px 16px",
                fontSize: 17,
                lineHeight: 1.5,
                wordBreak: "break-word",
                borderRadius: 18,
                borderTopRightRadius: 4,
                background: "rgba(61,245,127,0.08)",
                color: "#3df57f",
                border: "none",
                boxShadow: "0 2px 8px rgba(61,245,127,0.08)",
              }}
            >
              {msg.sharedPost ? (
                <button
                  onClick={() =>
                    onOpenSharedPost?.(
                      msg.sharedPost!.authorId,
                      msg.sharedPost!.postId,
                    )
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.75,
                      marginBottom: 10,
                    }}
                  >
                    {msg.text}
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      overflow: "hidden",
                      border: "1px solid rgba(61,245,127,0.2)",
                      background: "rgba(61,245,127,0.06)",
                    }}
                  >
                    {msg.sharedPost.media?.url ? (
                      <img
                        src={
                          msg.sharedPost.media.thumbnail ||
                          msg.sharedPost.media.url
                        }
                        alt="Shared post"
                        style={{
                          display: "block",
                          width: "100%",
                          height: 180,
                          objectFit: "cover",
                        }}
                      />
                    ) : null}
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {msg.sharedPost.authorName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginBottom: msg.sharedPost.content ? 8 : 0,
                        }}
                      >
                        @{msg.sharedPost.authorUsername.replace(/^@/, "")}
                      </div>
                      {msg.sharedPost.content ? (
                        <div
                          style={{
                            fontSize: 14,
                            lineHeight: 1.5,
                            color: "#d7ffe6",
                          }}
                        >
                          {msg.sharedPost.content}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ) : (
                msg.text
              )}
            </div>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{ flexShrink: 0, marginTop: 4 }}
            >
              <path d="M 0 0 L 12 0 L 0 10 Z" fill="rgba(61,245,127,0.08)" />
            </svg>
          </>
        ) : (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{ flexShrink: 0, marginTop: 4 }}
            >
              <path d="M 12 0 L 0 0 L 12 10 Z" fill="#191919" />
            </svg>
            <div
              style={{
                maxWidth: "82%",
                padding: "12px 16px",
                fontSize: 17,
                lineHeight: 1.5,
                wordBreak: "break-word",
                borderRadius: 18,
                borderTopLeftRadius: 4,
                background: "#191919",
                color: "#fff",
                border: "none",
              }}
            >
              {msg.sharedPost ? (
                <button
                  onClick={() =>
                    onOpenSharedPost?.(
                      msg.sharedPost!.authorId,
                      msg.sharedPost!.postId,
                    )
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.75,
                      marginBottom: 10,
                    }}
                  >
                    {msg.text}
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "#101010",
                    }}
                  >
                    {msg.sharedPost.media?.url ? (
                      <img
                        src={
                          msg.sharedPost.media.thumbnail ||
                          msg.sharedPost.media.url
                        }
                        alt="Shared post"
                        style={{
                          display: "block",
                          width: "100%",
                          height: 180,
                          objectFit: "cover",
                        }}
                      />
                    ) : null}
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {msg.sharedPost.authorName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginBottom: msg.sharedPost.content ? 8 : 0,
                        }}
                      >
                        @{msg.sharedPost.authorUsername.replace(/^@/, "")}
                      </div>
                      {msg.sharedPost.content ? (
                        <div
                          style={{
                            fontSize: 14,
                            lineHeight: 1.5,
                            color: "#d1d5db",
                          }}
                        >
                          {msg.sharedPost.content}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ) : (
                msg.text
              )}
            </div>
          </>
        )}
      </div>
      {showStatus && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "4px 4px 2px",
          }}
        >
          {status === "screenshot" ? (
            <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
              📸 Screenshot
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>
              {status === "seen" ? "Seen" : "Delivered"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MoodBlockTimer ───────────────────────────────────────────────────────────

function MoodBlockTimer({ endTime }: { endTime: number }) {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, Math.floor((endTime - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return (
    <>{`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`}</>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MessagingScreen({
  onBack,
  conversationId,
  onConversationActiveChange,
  onOpenSharedPost,
  onOpenUserProfile,
}: {
  onBack?: () => void;
  conversationId?: string;
  onConversationActiveChange?: (
    conversationId: string,
    otherUserId?: string,
  ) => void;
  onOpenSharedPost?: (userId: string, postId: string) => void;
  onOpenUserProfile?: (userId: string) => void;
}) {
  const { user } = useAuthStore();
  const {
    conversations,
    currentConversation,
    messages,
    messageEvents,
    loadingMessages,
    sendingMessage,
    typingUsers,
    onlineFriends,
    frozenBy,
    subscribeToRealTimeMessages,
    unsubscribeFromRealTimeMessages,
    subscribeToRealTimeEvents,
    unsubscribeFromRealTimeEvents,
    subscribeToTypingIndicators,
    unsubscribeFromTypingIndicators,
    subscribeToFreezeStatus,
    unsubscribeFromFreezeStatus,
    freezeChat,
    unfreezeChat,
    sendRealTimeMessage,
    setTypingIndicator,
    setOnlineStatus,
    setCurrentConversation,
    trackScreenshot,
    trackOpenedNoReply,
    trackLongUnsent,
    trackMention,
    trackIgnoredMessage,
    trackSeenMessage,
    clearIgnoredTracking,
    markMessageAsSeen,
    clearError,
    clearMessages,
  } = useMessagingStore();

  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("seen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [optimisticSwitchEvents, setOptimisticSwitchEvents] = useState<
    MessageEvent[]
  >([]);
  const [livePresenceSwitchTarget, setLivePresenceSwitchTarget] = useState<{
    userId: string;
    userName: string;
    isActive: boolean;
  } | null>(null);
  const [moodBlockModalOpen, setMoodBlockModalOpen] = useState(false);
  const [moodBlockModalVisible, setMoodBlockModalVisible] = useState(false);
  const [currentMoodBlock, setCurrentMoodBlock] = useState<{
    mood: "angry" | "crying" | "irritated" | "depressed";
    initiatedBy: string;
    initiatedByName: string;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [currentMoodBlockVisible, setCurrentMoodBlockVisible] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(100);
  const activeMoodTheme = getMoodTheme(currentMoodBlock?.mood ?? "");

  const [localFrozenBy, setLocalFrozenBy] = useState<string | null>(null);
  const [_firestoreOnline, setFirestoreOnline] = useState(false);
  const [_rtdbOnline, setRtdbOnline] = useState(false);
  const [friendGhostMode, setFriendGhostMode] = useState(false);
  const friendOnline = _firestoreOnline || _rtdbOnline;
  const [friendTyping, setFriendTyping] = useState(false);
  const [liveDraft, setLiveDraft] = useState<string | null>(null);

  const draftThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftRef = useRef<string>("");

  const frozen = !!localFrozenBy;
  const canUnfreeze = localFrozenBy === user?.id;

  const [vpHeight, setVpHeight] = useState(
    typeof window !== "undefined"
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 800,
  );
  const [vpOffsetTop, setVpOffsetTop] = useState(0);
  const ghost = useGhostModeStore((s) => s.isActive);

  const scrollRef = useRef<HTMLDivElement>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedMentions = useRef(new Set<string>());
  const subscribedConvId = useRef<string | null>(null);
  const pendingSeenMarksRef = useRef(new Set<string>());
  const ghostRef = useRef(false);
  const isTypingRef = useRef(false);
  const lastPresenceSwitchRef = useRef<string>("");
  const mutualChatEstablishedRef = useRef(false);
  const frozenRef = useRef(frozen);
  const convRef = useRef(currentConversation);
  const userIdRef = useRef(user?.id);

  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);
  useEffect(() => {
    convRef.current = currentConversation;
  }, [currentConversation]);
  useEffect(() => {
    ghostRef.current = ghost;
  }, [ghost]);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (!currentConversation?.id) return;
    onConversationActiveChange?.(
      currentConversation.id,
      currentConversation.other_user?.user_id ||
        currentConversation.other_user?.id,
    );
  }, [currentConversation?.id, onConversationActiveChange]);

  useEffect(() => {
    mutualChatEstablishedRef.current = false;
    lastPresenceSwitchRef.current = "";
    setLivePresenceSwitchTarget(null);
  }, [currentConversation?.id]);

  useEffect(() => {
    const uid = user?.id;
    const otherUserId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    const otherUserName =
      currentConversation?.other_user?.display_name ||
      currentConversation?.other_user?.username ||
      "";
    if (!uid) return;
    const db = getFirestore();
    const presenceRef = doc(db, "presence", uid);
    if (!otherUserId) {
      void setDoc(
        presenceRef,
        {
          current_chat_user_id: "",
          current_chat_user_name: "",
          last_seen: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {});
      return;
    }
    void setDoc(
      presenceRef,
      {
        current_chat_user_id: otherUserId,
        current_chat_user_name: otherUserName,
        last_seen: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {});
    return () => {
      void setDoc(
        presenceRef,
        {
          current_chat_user_id: "",
          current_chat_user_name: "",
          last_seen: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {});
    };
  }, [
    user?.id,
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    currentConversation?.other_user?.display_name,
    currentConversation?.other_user?.username,
  ]);

  useEffect(() => {
    setOptimisticSwitchEvents([]);
    if (!currentConversation?.id || !user?.id) return;
    return messagingService.subscribeToOptimisticChatSwitchSignals(
      currentConversation.id,
      user.id,
      (signal: ChatSwitchSignal) => {
        const optimisticEvent: MessageEvent = {
          id: `optimistic-switch-${signal.id}`,
          conversation_id: signal.conversation_id,
          user_id: signal.user_id,
          event_type: "chat_switch",
          data: {
            target_user_id: signal.target_user_id,
            target_user_name: signal.target_user_name,
            recipient_user_id: signal.recipient_user_id,
          },
          created_at: new Date(signal.created_at).toISOString(),
        };
        setOptimisticSwitchEvents((prev) => {
          if (prev.some((e) => e.id === optimisticEvent.id)) return prev;
          return [...prev, optimisticEvent];
        });
        setTimeout(() => {
          setOptimisticSwitchEvents((prev) =>
            prev.filter((e) => e.id !== optimisticEvent.id),
          );
        }, 12000);
      },
    );
  }, [currentConversation?.id, user?.id]);

  function writeTypingHelper(isTyping: boolean, convId?: string) {
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) return;
    const db = getFirestore();
    const typingRef = doc(db, "conversations", id, "typing", uid);
    if (isTyping) {
      setDoc(typingRef, {
        is_typing: true,
        updated_at: serverTimestamp(),
      }).catch((err) => console.error("[typing write]", id, uid, err));
    } else {
      deleteDoc(typingRef).catch((err) =>
        console.error("[typing delete]", id, uid, err),
      );
    }
  }

  function writeDraftHelper(text: string, convId?: string) {
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) return;
    const db = getFirestore();
    const draftRef = doc(db, "conversations", id, "drafts", uid);
    console.log("[draft write]", { convId: id, uid, textLen: text.length });
    if (text.length > 0) {
      setDoc(draftRef, { text, updated_at: serverTimestamp() }).catch((err) =>
        console.error("[draft write error]", id, uid, err),
      );
    } else {
      deleteDoc(draftRef).catch((err) =>
        console.error("[draft delete error]", id, uid, err),
      );
    }
  }

  const stopTyping = useCallback(() => {
    const conv = convRef.current;
    if (!conv || !isTypingRef.current) return;
    isTypingRef.current = false;
    writeTypingHelper(false, conv.id);
    setTypingIndicator(conv.id, false);
  }, [setTypingIndicator]); // eslint-disable-line

  const getDraftStorageKey = useCallback((cId: string) => {
    const uid = userIdRef.current ?? "anon";
    return `chat_draft:${uid}:${cId}`;
  }, []);

  // SECURITY: Using sessionStorage instead of localStorage to reduce XSS exposure
  const saveLocalDraft = useCallback(
    (text: string, cId?: string) => {
      const convId = cId ?? convRef.current?.id;
      if (!convId || typeof window === "undefined") return;
      try {
        const key = getDraftStorageKey(convId);
        if (text.trim().length === 0) {
          sessionStorage.removeItem(key);
          return;
        }
        sessionStorage.setItem(key, text);
      } catch {
        /* ignore */
      }
    },
    [getDraftStorageKey],
  );

  const loadLocalDraft = useCallback(
    (cId: string): string => {
      if (typeof window === "undefined") return "";
      try {
        return sessionStorage.getItem(getDraftStorageKey(cId)) ?? "";
      } catch {
        return "";
      }
    },
    [getDraftStorageKey],
  );

  const clearLocalDraft = useCallback(
    (cId: string) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.removeItem(getDraftStorageKey(cId));
      } catch {
        /* ignore */
      }
    },
    [getDraftStorageKey],
  );

  const clearRealtimeTypingSignals = useCallback(() => {
    const conv = convRef.current;
    if (!conv) return;
    if (draftThrottleRef.current) {
      clearTimeout(draftThrottleRef.current);
      draftThrottleRef.current = null;
    }
    writeDraftHelper("", conv.id);
    lastDraftRef.current = "";
    isTypingRef.current = false;
    writeTypingHelper(false, conv.id);
    setTypingIndicator(conv.id, false);
  }, [setTypingIndicator]); // eslint-disable-line

  function writeTyping(isTyping: boolean, convId?: string) {
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) return;
    const db = getFirestore();
    const typingRef = doc(db, "conversations", id, "typing", uid);
    if (isTyping) {
      setDoc(typingRef, {
        is_typing: true,
        updated_at: serverTimestamp(),
      }).catch((err) => console.error("[typing write 2]", id, uid, err));
    } else {
      deleteDoc(typingRef).catch((err) =>
        console.error("[typing delete 2]", id, uid, err),
      );
    }
  }

  function writeDraft(text: string, convId?: string) {
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) return;
    const db = getFirestore();
    const draftRef = doc(db, "conversations", id, "drafts", uid);
    console.log("[draft write 2]", { convId: id, uid, textLen: text.length });
    if (text.length > 0) {
      setDoc(draftRef, { text, updated_at: serverTimestamp() }).catch((err) =>
        console.error("[draft write 2 error]", id, uid, err),
      );
    } else {
      deleteDoc(draftRef).catch((err) =>
        console.error("[draft delete 2 error]", id, uid, err),
      );
    }
  }

  // ── Own presence ──────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const db = getFirestore();
    const presenceRef = doc(db, "presence", uid);
    const goOnline = () =>
      setDoc(presenceRef, { online: true, last_seen: serverTimestamp() }).catch(
        () => {},
      );
    const goOffline = () =>
      setDoc(presenceRef, {
        online: false,
        last_seen: serverTimestamp(),
      }).catch(() => {});
    goOnline();
    const onVisibility = () =>
      document.visibilityState === "hidden" ? goOffline() : goOnline();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", goOffline);
    return () => {
      goOffline();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [user?.id]);

  // ── Freeze listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const convId = currentConversation?.id;
    if (!convId) {
      setLocalFrozenBy(null);
      return;
    }
    const db = getFirestore();
    const unsub = onSnapshot(
      doc(db, "conversations", convId, "meta", "freeze"),
      (snap) => {
        setLocalFrozenBy(
          snap.exists() ? (snap.data()?.frozen_by ?? null) : null,
        );
      },
    );
    return () => unsub();
  }, [currentConversation?.id]);

  // ── Friend online listener ────────────────────────────────────────────────
  useEffect(() => {
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (!friendId) {
      setFirestoreOnline(false);
      setFriendGhostMode(false);
      setLivePresenceSwitchTarget(null);
      lastPresenceSwitchRef.current = "";
      return;
    }
    const db = getFirestore();
    const unsub = onSnapshot(doc(db, "presence", friendId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setFirestoreOnline(d?.online === true || d?.status === "online");
        const ghostExpiryRaw =
          d?.ghost_mode_expires_at?.toDate?.()?.toISOString?.() ||
          d?.ghost_mode_expires_at ||
          null;
        const ghostExpiryMs = ghostExpiryRaw
          ? new Date(ghostExpiryRaw).getTime()
          : 0;
        setFriendGhostMode(
          d?.ghost_mode === true &&
            Number.isFinite(ghostExpiryMs) &&
            ghostExpiryMs > Date.now(),
        );
        const targetUserId = String(d?.current_chat_user_id || "");
        const targetUserName = String(d?.current_chat_user_name || "");
        const currentUserId = String(user?.id || "");
        const friendIsActivelyInThisConversation =
          !!targetUserId && !!currentUserId && targetUserId === currentUserId;

        if (friendIsActivelyInThisConversation) {
          mutualChatEstablishedRef.current = true;
          lastPresenceSwitchRef.current = "";
          setLivePresenceSwitchTarget(null);
          return;
        }

        if (
          mutualChatEstablishedRef.current &&
          targetUserId &&
          currentUserId &&
          targetUserId !== currentUserId &&
          targetUserId !== friendId
        ) {
          const nextKey = `${friendId}:${targetUserId}:${targetUserName}`;
          if (lastPresenceSwitchRef.current !== nextKey) {
            lastPresenceSwitchRef.current = nextKey;
            setLivePresenceSwitchTarget({
              userId: targetUserId,
              userName: targetUserName || "someone",
              isActive: true,
            });
          }
        } else {
          lastPresenceSwitchRef.current = "";
          setLivePresenceSwitchTarget(null);
        }
      } else {
        setFirestoreOnline(false);
        setFriendGhostMode(false);
        setLivePresenceSwitchTarget(null);
        lastPresenceSwitchRef.current = "";
      }
    });
    return () => unsub();
  }, [
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    user?.id,
  ]);

  // ── Friend RTDB online status ────────────────────────────────────────────
  useEffect(() => {
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (!friendId) {
      setRtdbOnline(false);
      return;
    }
    const unsub = messagingService.subscribeToUsersOnlineStatus(
      [friendId],
      (onlineIds) => {
        setRtdbOnline(onlineIds.includes(friendId));
      },
    );
    return () => unsub();
  }, [
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
  ]);

  useEffect(() => {
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (!convId || !friendId) {
      setFriendTyping(false);
      return;
    }
    const db = getFirestore();
    const unsub = onSnapshot(
      doc(db, "conversations", convId, "typing", friendId),
      (snap) => {
        setFriendTyping(
          snap.exists() ? snap.data()?.is_typing === true : false,
        );
      },
    );
    return () => unsub();
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
  ]);

  useEffect(() => {
    const convId = currentConversation?.id;
    const friendId = currentConversation?.other_user?.user_id;
    if (!convId || !friendId) {
      setLiveDraft(null);
      return;
    }
    const db = getFirestore();
    const unsub = onSnapshot(
      doc(db, "conversations", convId, "drafts", friendId),
      (snap) => {
        setLiveDraft(
          snap.exists() && snap.data()?.text ? snap.data().text : null,
        );
      },
    );
    return () => unsub();
  }, [currentConversation?.id, currentConversation?.other_user?.user_id]);

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    setOnlineStatus(true);
    return () => {
      subscribedConvId.current = null;
      clearRealtimeTypingSignals();
      unsubscribeFromRealTimeMessages();
      unsubscribeFromRealTimeEvents();
      unsubscribeFromTypingIndicators();
      unsubscribeFromFreezeStatus();
      setOnlineStatus(false);
    };
  }, [user?.id, clearRealtimeTypingSignals]); // eslint-disable-line

  // ── Subscribe to conversation ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || conversations.length === 0) return;
    const targetId =
      conversationId ??
      currentConversation?.id ??
      subscribedConvId.current ??
      null;
    if (!targetId) return;
    const conversation = conversations.find((c) => c.id === targetId);
    if (!conversation) return;
    if (subscribedConvId.current === conversation.id) return;
    if (subscribedConvId.current) clearRealtimeTypingSignals();
    subscribedConvId.current = conversation.id;
    setCurrentConversation(conversation);
    subscribeToRealTimeMessages(conversation.id);
    subscribeToRealTimeEvents(conversation.id);
    subscribeToTypingIndicators(conversation.id);
    subscribeToFreezeStatus(conversation.id);
    trackedMentions.current.clear();
    setHasOpenedChat(false);
    setInput(loadLocalDraft(conversation.id));
    lastDraftRef.current = "";
  }, [user?.id, conversationId, conversations]); // eslint-disable-line

  // ── Viewport ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      setVpHeight(vv ? vv.height : window.innerHeight);
      setVpOffsetTop(vv ? vv.offsetTop : 0);
      requestAnimationFrame(() => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    };
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    } else {
      window.addEventListener("resize", update);
      window.addEventListener("orientationchange", update);
    }
    update();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      } else {
        window.removeEventListener("resize", update);
        window.removeEventListener("orientationchange", update);
      }
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, messageEvents, livePresenceSwitchTarget]);

  // ── Seen tracking (only the most recent incoming message) ────────────────
  useEffect(() => {
    if (!currentConversation || !user?.id) return;
    const otherUserId = currentConversation.other_user?.user_id;
    if (!otherUserId) return;
    const incoming = messages.filter(
      (msg) => msg.senderId === otherUserId && !msg.isOwn,
    );
    if (incoming.length === 0) return;
    const latest = incoming[incoming.length - 1];
    trackSeenMessage(
      latest.id,
      currentConversation.id,
      latest.senderId,
      latest.senderName,
    );
  }, [messages, currentConversation, user?.id, trackSeenMessage]);

  useEffect(() => {
    if (!currentConversation?.id || !user?.id) return;
    const unseenIncoming = messages.filter(
      (msg) => msg.senderId !== user.id && !msg.is_seen,
    );
    const unseenIds = new Set(unseenIncoming.map((msg) => msg.id));
    unseenIncoming.forEach((msg) => {
      if (pendingSeenMarksRef.current.has(msg.id)) return;
      pendingSeenMarksRef.current.add(msg.id);
      markMessageAsSeen(msg.id).finally(() => {});
    });
    for (const pendingId of pendingSeenMarksRef.current) {
      if (!unseenIds.has(pendingId))
        pendingSeenMarksRef.current.delete(pendingId);
    }
  }, [messages, currentConversation?.id, user?.id, markMessageAsSeen]);

  useEffect(() => {
    pendingSeenMarksRef.current.clear();
  }, [currentConversation?.id]);

  // ── Mood block ────────────────────────────────────────────────────────────
  const handleMoodBlock = async (
    mood: "angry" | "crying" | "irritated" | "depressed",
  ) => {
    if (!currentConversation || !user?.id) return;
    const now = Date.now();
    const endTime = now + 10 * 60 * 1000;
    const moodBlock = {
      mood,
      initiatedBy: user.id,
      initiatedByName: user.displayName || user.username || "You",
      startTime: now,
      endTime,
    };
    const db = getFirestore();
    await setDoc(
      doc(db, "conversations", currentConversation.id, "meta", "moodBlock"),
      moodBlock,
    );
    setCurrentMoodBlock(moodBlock);
  };

  useEffect(() => {
    if (!currentConversation?.id) return;
    const db = getFirestore();
    const moodBlockRef = doc(
      db,
      "conversations",
      currentConversation.id,
      "meta",
      "moodBlock",
    );
    const unsub = onSnapshot(moodBlockRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as {
          mood: "angry" | "crying" | "irritated" | "depressed";
          initiatedBy: string;
          initiatedByName: string;
          startTime: number;
          endTime: number;
        };
        if (data.endTime > Date.now()) {
          setCurrentMoodBlock(data);
          const timeUntilExpiry = data.endTime - Date.now();
          setTimeout(() => {
            setCurrentMoodBlock(null);
            deleteDoc(moodBlockRef).catch(() => {});
          }, timeUntilExpiry);
        } else {
          setCurrentMoodBlock(null);
          deleteDoc(moodBlockRef).catch(() => {});
        }
      } else {
        setCurrentMoodBlock(null);
      }
    });
    return () => unsub();
  }, [currentConversation?.id]);

  // ── Progress bar ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentMoodBlock) {
      setCurrentMoodBlockVisible(false);
      setProgressBarWidth(100);
      return;
    }

    setCurrentMoodBlockVisible(false);
    const frame = requestAnimationFrame(() => {
      setCurrentMoodBlockVisible(true);
    });

    const updateProgress = () => {
      const elapsed = Date.now() - currentMoodBlock.startTime;
      const total = currentMoodBlock.endTime - currentMoodBlock.startTime;
      const remaining = Math.max(0, total - elapsed);
      setProgressBarWidth(
        Math.max(0, Math.min(100, (remaining / total) * 100)),
      );
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [currentMoodBlock]);

  useEffect(() => {
    if (!moodBlockModalOpen) {
      setMoodBlockModalVisible(false);
      return;
    }

    setMoodBlockModalVisible(false);
    const frame = requestAnimationFrame(() => {
      setMoodBlockModalVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [moodBlockModalOpen]);

  // ── Freeze actions ────────────────────────────────────────────────────────
  const doFreeze = async () => {
    const conv = convRef.current;
    const uid = userIdRef.current;
    if (!conv || !uid) return;
    const db = getFirestore();
    await setDoc(doc(db, "conversations", conv.id, "meta", "freeze"), {
      frozen_by: uid,
      frozen_at: serverTimestamp(),
    });
    try {
      freezeChat(conv.id);
    } catch (_) {}
  };

  const doUnfreeze = async () => {
    const conv = convRef.current;
    if (!conv) return;
    const db = getFirestore();
    await deleteDoc(doc(db, "conversations", conv.id, "meta", "freeze"));
    try {
      unfreezeChat(conv.id);
    } catch (_) {}
  };

  // ── Event helpers ─────────────────────────────────────────────────────────
  const isValidEventType = (t: string): t is EvType =>
    [
      "screenshot",
      "chat_switch",
      "opened_noreply",
      "long_unsent",
      "mention",
      "ignored",
    ].includes(t);

  const getEventText = (event: MessageEvent): string => {
    switch (event.event_type) {
      case "screenshot":
        return "You took a screenshot of this chat";
      case "chat_switch":
        if (event.user_id === user?.id)
          return `You went to chat with ${event.data?.target_user_name || "someone"}`;
        return `${currentConversation?.other_user?.display_name || currentConversation?.other_user?.username || event.data?.user_name || "Someone"} is now talking with ${event.data?.target_user_name || "someone"} instead of you!`;
      case "opened_noreply":
        return `${event.data?.user_name || "Someone"} opened the chat but didn't reply`;
      case "long_unsent":
        return "You typed a long message but didn't send it";
      case "mention":
        return `@${event.data?.mentioned_username || "someone"} was notified that you two are talking about them`;
      case "ignored":
        if (event.user_id === user?.id) {
          // Current user did the ignoring â show whose message they ignored
          const ignoredName =
            event.data?.ignored_user_name ||
            event.data?.target_user_name ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "someone";
          return `You ignored ${ignoredName}'s message`;
        } else {
          // Someone else ignored the current user's message
          const ignorerName =
            event.data?.user_name ||
            event.data?.username ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "Someone";
          return `${ignorerName} ignored your message`;
        }
      default:
        return "Unknown event";
    }
  };

  const timelineEvents = [
    ...messageEvents,
    ...optimisticSwitchEvents.filter(
      (optimisticEvent) =>
        !messageEvents.some((persistedEvent) => {
          if (
            persistedEvent.event_type !== "chat_switch" ||
            optimisticEvent.event_type !== "chat_switch"
          )
            return false;
          const sameInitiator =
            persistedEvent.user_id === optimisticEvent.user_id;
          const sameTargetUser =
            String(persistedEvent.data?.target_user_id ?? "") ===
            String(optimisticEvent.data?.target_user_id ?? "");
          const sameRecipient =
            String(persistedEvent.data?.recipient_user_id ?? "") ===
            String(optimisticEvent.data?.recipient_user_id ?? "");
          const persistedAt = new Date(
            String(persistedEvent.created_at || ""),
          ).getTime();
          const optimisticAt = new Date(
            String(optimisticEvent.created_at || ""),
          ).getTime();
          return (
            sameInitiator &&
            sameTargetUser &&
            sameRecipient &&
            Math.abs(persistedAt - optimisticAt) < 15000
          );
        }),
    ),
  ];

  const timeline: TimelineItem[] = [
    ...messages.map((msg) => ({
      id: msg.id,
      kind: "msg" as const,
      from: (msg.senderId === user?.id ? "me" : "them") as From,
      text: msg.content,
      sharedPost: parseSharedPostPayload(msg.mediaUrl || msg.media_url),
    })),
    ...timelineEvents
      .filter((e) => {
        if (!e.event_type || !isValidEventType(e.event_type)) return false;
        if (e.event_type === "chat_switch") {
          if (e.user_id === user?.id) return false;
          const recipientUserId = String(e.data?.recipient_user_id ?? "");
          const currentUserId = String(user?.id ?? "");
          if (
            recipientUserId &&
            currentUserId &&
            recipientUserId !== currentUserId
          )
            return false;
          const destinationUserId = String(e.data?.target_user_id ?? "");
          const currentChatUserId = String(
            currentConversation?.other_user?.user_id ||
              currentConversation?.other_user?.id ||
              "",
          );
          if (
            destinationUserId &&
            currentChatUserId &&
            destinationUserId === currentChatUserId
          )
            return false;
          const destination = String(
            e.data?.target_user_name ?? "",
          ).toLowerCase();
          const currentChatUser = String(
            currentConversation?.other_user?.username ||
              currentConversation?.other_user?.display_name ||
              "",
          ).toLowerCase();
          if (destination && currentChatUser && destination === currentChatUser)
            return false;
        }
        if (e.event_type === "mention") {
          console.log("[@mention] Filtering mention event:", e);
        }
        return true;
      })
      .map((event: MessageEvent) => ({
        id: event.id,
        kind: "evt" as const,
        type: event.event_type as EvType,
        text: getEventText(event),
        targetUserId: String(event.data?.target_user_id ?? "") || undefined,
      })),
  ].sort((a, b) => {
    const getMs = (item: TimelineItem): number => {
      const src =
        item.kind === "msg"
          ? messages.find((m) => m.id === item.id)
          : timelineEvents.find((e) => e.id === item.id);
      const raw =
        item.kind === "msg"
          ? ((src as any)?.timestamp ?? (src as any)?.created_at)
          : (src as any)?.created_at;
      if (!raw) return Date.now();
      if (typeof raw === "object" && "toDate" in raw)
        return (raw as any).toDate().getTime();
      return new Date(String(raw)).getTime();
    };
    const tA = getMs(a),
      tB = getMs(b);
    if (tA === tB) return a.kind === "msg" ? -1 : 1;
    return tA - tB;
  });

  const getCollapsed = (eventIndex: number): boolean => {
    let count = 0;
    for (let i = eventIndex + 1; i < timeline.length; i++) {
      if (timeline[i].kind === "msg") {
        count++;
        if (count >= 2) return true;
      }
    }
    return false;
  };

  // ── Input handler ─────────────────────────────────────────────────────────
  function handleInput(val: string) {
    setInput(val);
    saveLocalDraft(val);
    if (!ghostRef.current) {
      const nowTyping = val.length > 0;
      if (nowTyping !== isTypingRef.current) {
        isTypingRef.current = nowTyping;
        writeTyping(nowTyping);
        const conv = convRef.current;
        if (conv) setTypingIndicator(conv.id, nowTyping);
      }
    } else if (isTypingRef.current) {
      isTypingRef.current = false;
      writeTyping(false);
    }
    if (!ghostRef.current) {
      const conv = convRef.current;
      if (conv) {
        if (val.length === 0) {
          if (draftThrottleRef.current) {
            clearTimeout(draftThrottleRef.current);
            draftThrottleRef.current = null;
          }
          lastDraftRef.current = "";
          writeDraft("");
        } else if (val !== lastDraftRef.current) {
          if (draftThrottleRef.current) clearTimeout(draftThrottleRef.current);
          draftThrottleRef.current = setTimeout(() => {
            lastDraftRef.current = val;
            writeDraft(val);
            draftThrottleRef.current = null;
          }, 100);
        }
      }
    }
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    if (val.length > 80) {
      longTimer.current = setTimeout(() => {
        const c = convRef.current;
        if (c) trackLongUnsent(c.id, val);
      }, 4000);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send() {
    if (!currentConversation && conversations.length > 0) {
      setCurrentConversation(conversations[0]);
      subscribeToRealTimeMessages(conversations[0].id);
      return;
    }
    if (
      !input.trim() ||
      frozenRef.current ||
      !currentConversation ||
      sendingMessage ||
      currentMoodBlock
    )
      return;
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    const text = input.trim();
    for (const m of [...text.matchAll(/@(\w+)/g)]) {
      const u = m[1];
      if (!trackedMentions.current.has(u)) {
        trackedMentions.current.add(u);
        setTimeout(() => {
          console.log("[@mention] Tracking after send:", u);
          trackMention(currentConversation.id, u);
        }, 500);
      }
    }
    try {
      console.log("[MessagingScreen] Sending message:", {
        conversationId: currentConversation.id,
        text: text,
        conversation: currentConversation,
      });
      setInput("");
      clearLocalDraft(currentConversation.id);
      writeDraft("");
      lastDraftRef.current = "";
      if (draftThrottleRef.current) {
        clearTimeout(draftThrottleRef.current);
        draftThrottleRef.current = null;
      }
      if (isTypingRef.current) {
        isTypingRef.current = false;
        writeTyping(false);
        setTypingIndicator(currentConversation.id, false);
      }
      setStatus("delivered");
      await sendRealTimeMessage(currentConversation.id, text);
      console.log("[MessagingScreen] Message sent successfully");
      clearIgnoredTracking(currentConversation.id);
      setTimeout(() => setStatus("seen"), 2200);
    } catch (err) {
      console.error("[MessagingScreen] Failed to send:", err);
      setInput(text);
      saveLocalDraft(text, currentConversation.id);
    }
  }

  const lastMineId = [...timeline]
    .reverse()
    .find((item): item is Msg => item.kind === "msg" && item.from === "me")?.id;

  const msgUserProfiles = useProfileDataStore((s) => s.userProfiles);
  const friendInfo = currentConversation?.other_user
    ? {
        name:
          (currentConversation.other_user.user_id &&
            msgUserProfiles[currentConversation.other_user.user_id]
              ?.displayName) ||
          currentConversation.other_user.display_name ||
          currentConversation.other_user.username ||
          "Unknown User",
        avatar:
          currentConversation.other_user.avatar_url ||
          "https://picsum.photos/seed/default/100/100",
      }
    : FRIEND;

  const menuActions: [string, string, () => void, boolean][] = [
    [
      "Mood Block",
      "",
      () => {
        setMenuOpen(false);
        setMoodBlockModalOpen(true);
      },
      false,
    ],
    [
      frozen ? (canUnfreeze ? "Unfreeze" : "Frozen by them") : "Freeze chat",
      "",
      () => {
        if (frozen && canUnfreeze) doUnfreeze();
        else if (!frozen) doFreeze();
        setMenuOpen(false);
      },
      frozen,
    ],
    [
      "Clear chat",
      "",
      () => {
        setMenuOpen(false);
        if (currentConversation?.id) {
          if (
            confirm("Are you sure you want to clear all messages in this chat?")
          ) {
            console.log(
              "Clearing chat for conversation:",
              currentConversation.id,
            );
            clearMessages(currentConversation.id)
              .then(() => console.log("Chat cleared successfully"))
              .catch((error) => console.error("Error clearing chat:", error));
          }
        }
      },
      false,
    ],
  ];

  const moodEmoji = (mood: string) => {
    if (mood === "angry") return "😠";
    if (mood === "crying") return "😢";
    if (mood === "irritated") return "😤";
    if (mood === "depressed") return "😔";
    return "😶";
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "relative",
        top: vpOffsetTop,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        background: "#000",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
        color: "#fff",
        overflow: "hidden",
        height: `${vpHeight}px`,
      }}
    >
      <style>{`
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes blink{50%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes capsuleIn{from{opacity:0;transform:translateX(12px) scale(0.92)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes capsuleReveal{
          0%{opacity:0;transform:scaleX(0.4) scaleY(0.6);filter:blur(8px)}
          40%{opacity:1;filter:blur(0px)}
          70%{transform:scaleX(1.03) scaleY(1.02)}
          100%{transform:scaleX(1) scaleY(1)}
        }
        @keyframes fadeInCrying{
          0%{opacity:0;transform:scale(0.8) translateY(20px)}
          100%{opacity:1;transform:scale(1) translateY(0)}
        }
        @keyframes fadeInCard{
          0%{opacity:0;transform:translateY(20px)}
          100%{opacity:1;transform:translateY(0)}
        }
        @keyframes moodBackdropIn{
          0%{opacity:0}
          100%{opacity:1}
        }
        @keyframes moodOrbPulse{
          0%,100%{transform:scale(1);opacity:0.9}
          50%{transform:scale(1.08);opacity:1}
        }
        @keyframes moodSheen{
          0%{transform:translateX(-120%) skewX(-18deg);opacity:0}
          20%{opacity:0.22}
          100%{transform:translateX(180%) skewX(-18deg);opacity:0}
        }
        @keyframes moodProgressGlow{
          0%,100%{filter:brightness(1)}
          50%{filter:brightness(1.18)}
        }
        *{box-sizing:border-box}
        input,textarea{outline:none;}
        input::placeholder,textarea::placeholder{color:#2a2a2a}
        ::-webkit-scrollbar{display:none}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          background: "#000",
          padding: "10px 10px 6px",
          borderRadius: "0 0 18px 18px",
        }}
      >
        <div style={{ padding: "4px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#131313",
              borderRadius: 50,
              padding: "10px 12px 10px 16px",
              boxShadow:
                "0 12px 40px rgba(80,80,80,0.25),0 4px 16px rgba(60,60,60,0.2),0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                onClick={() => {
                  clearRealtimeTypingSignals();
                  onBack?.();
                }}
                style={{
                  fontSize: 26,
                  color: "#666",
                  cursor: "pointer",
                  lineHeight: 1,
                  paddingRight: 2,
                  userSelect: "none",
                }}
              >
                {"<"}
              </span>
              <div style={{ position: "relative" }}>
                <Avatar
                  src={friendInfo.avatar}
                  alt={friendInfo.name}
                  size="lg"
                  userId={currentConversation?.other_user?.user_id}
                  username={currentConversation?.other_user?.username}
                  forceGhostMode={friendGhostMode}
                  showStatus={false}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: friendOnline ? "#3df57f" : "#333",
                    border: "2.5px solid #131313",
                    transition: "background 0.35s ease",
                    boxShadow: friendOnline
                      ? "0 0 6px rgba(61,245,127,0.6)"
                      : "none",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                  {friendInfo.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.09em",
                    color: friendTyping
                      ? "#3df57f"
                      : friendOnline
                        ? "#3df57f"
                        : "#444",
                    marginTop: 2,
                    transition: "color 0.3s ease",
                  }}
                >
                  {friendTyping
                    ? "TYPING..."
                    : friendOnline
                      ? "ACTIVE NOW"
                      : "OFFLINE"}
                </div>
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: "none",
                  background: "#1e1e1e",
                  color: "#fff",
                  fontSize: 18,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  letterSpacing: "0.05em",
                }}
              >
                •••
              </button>
              {messageEvents.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 8,
                    height: 8,
                    background: "#3df57f",
                    borderRadius: "50%",
                    border: "2px solid #000",
                    animation: "pulse 2s infinite",
                  }}
                />
              )}
              {menuOpen && (
                <>
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 99,
                    }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 52,
                      right: 0,
                      zIndex: 100,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                    }}
                  >
                    {menuActions.map(([label, icon, fn, active], i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          fn();
                        }}
                        disabled={label === "Frozen by them"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 16px",
                          border: active
                            ? "1px solid rgba(61,245,127,0.5)"
                            : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 50,
                          background: active
                            ? "rgba(61,245,127,0.14)"
                            : "rgba(18,18,18,0.97)",
                          backdropFilter: "blur(20px)",
                          color:
                            label === "Frozen by them"
                              ? "#444"
                              : active
                                ? "#3df57f"
                                : "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor:
                            label === "Frozen by them"
                              ? "not-allowed"
                              : "pointer",
                          fontFamily: "inherit",
                          letterSpacing: "0.01em",
                          whiteSpace: "nowrap",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
                          animation: `capsuleIn 0.18s ${i * 0.04}s ease both`,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status banners ─────────────────────────────────────────────────── */}
      {ghost && (
        <div
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background: "rgba(139,92,246,0.1)",
            border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: 14,
            padding: "9px",
            textAlign: "center",
            color: "#c4b5fd",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          👻 Ghost Mode — your typing is hidden
        </div>
      )}
      {frozen && (
        <div
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 14,
            padding: "10px",
            textAlign: "center",
            color: "#93c5fd",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ❄️{" "}
          {canUnfreeze
            ? "You froze this chat"
            : "Chat frozen by the other person"}
        </div>
      )}

      {/* ── TIMELINE ───────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          paddingTop: 24,
          paddingBottom: currentMoodBlock ? 172 : 12,
        }}
        onClick={() => setMenuOpen(false)}
      >
        {!currentConversation && !loadingMessages && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#666",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>
              No conversation selected
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Select a conversation to start messaging
            </div>
          </div>
        )}

        {currentConversation && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 22,
                padding: "0 14px",
              }}
            >
              <span
                style={{
                  color: "#333",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                }}
              >
                TODAY
              </span>
            </div>

            {loadingMessages && timeline.length === 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "40px 0",
                  color: "#444",
                  fontSize: 13,
                }}
              >
                ⏳ Loading messages...
              </div>
            )}

            {timeline.map((item, index) => {
              if (item.kind === "evt") {
                return (
                  <SysLine
                    key={item.id}
                    type={item.type}
                    text={item.text}
                    collapsed={getCollapsed(index)}
                    targetUserId={item.targetUserId}
                    onOpenUserProfile={onOpenUserProfile}
                  />
                );
              }
              return (
                <Bubble
                  key={item.id}
                  msg={item}
                  showStatus={item.from === "me" && item.id === lastMineId}
                  status={status}
                  onOpenSharedPost={onOpenSharedPost}
                />
              );
            })}

            {livePresenceSwitchTarget && (
              <SysLine
                type="chat_switch"
                text={
                  livePresenceSwitchTarget.isActive
                    ? `${friendInfo.name} is now talking with ${livePresenceSwitchTarget.userName} instead of you!`
                    : `${friendInfo.name} was chatting with ${livePresenceSwitchTarget.userName} instead of you!`
                }
                collapsed={!livePresenceSwitchTarget.isActive}
                targetUserId={livePresenceSwitchTarget.userId}
                onOpenUserProfile={onOpenUserProfile}
              />
            )}

            {liveDraft && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  padding: "4px 14px",
                  marginTop: 6,
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    minWidth: 80,
                    padding: "10px 14px",
                    borderRadius: "18px 18px 18px 4px",
                    background: "rgba(61,245,127,0.06)",
                    border: "1px solid rgba(61,245,127,0.15)",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 16,
                    lineHeight: 1.4,
                    fontStyle: "italic",
                    position: "relative",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    maxHeight: 170,
                    overflowY: "auto",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: -18,
                      left: 4,
                      fontSize: 10,
                      color: "#3df57f",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      fontStyle: "normal",
                    }}
                  >
                    TYPING
                  </span>
                  {liveDraft}
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 16,
                      background: "#3df57f",
                      marginLeft: 1,
                      verticalAlign: "middle",
                      animation: "blink 1s step-end infinite",
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── INPUT ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 14px 20px",
          background: "#000",
          boxShadow: "inset 0 -8px 0 #000",
        }}
      >
        {currentMoodBlock ? (
          <div style={{ height: 8 }} />
        ) : frozen ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 15,
              padding: "14px 0",
              letterSpacing: "0.04em",
            }}
          >
            {canUnfreeze ? (
              <span
                style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}
                onClick={doUnfreeze}
              >
                ❄️ Tap to unfreeze chat
              </span>
            ) : (
              <span style={{ color: "#2a4060" }}>Chat is frozen ❄️</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <label
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: "#222",
                color: "#fff",
                fontSize: 24,
                fontWeight: 300,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginBottom: 2,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              +
              <input
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && currentConversation) {
                    try {
                      await sendRealTimeMessage(
                        currentConversation.id,
                        `📎 ${file.name}`,
                      );
                      setStatus("delivered");
                      setTimeout(() => setStatus("seen"), 2200);
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  e.target.value = "";
                }}
              />
            </label>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                background: "#111",
                borderRadius: 24,
                padding: "11px 14px",
                gap: 8,
                border: "1px solid #1e1e1e",
                minHeight: 46,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onBlur={() => {
                  stopTyping();
                  writeDraft("");
                }}
                disabled={!!currentMoodBlock}
                placeholder={ghost ? "Ghost mode active..." : "Message..."}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  fontSize: 17,
                  lineHeight: 1.4,
                  caretColor: "#3df57f",
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  minHeight: 24,
                  maxHeight: 120,
                  paddingTop: 1,
                  opacity: 1,
                  cursor: "text",
                }}
                rows={1}
              />
            </div>

            <button
              onClick={send}
              disabled={!input.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                flexShrink: 0,
                cursor: input.trim() ? "pointer" : "default",
                background: input.trim() ? "#3df57f" : "#111",
                boxShadow: "none",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#000",
                marginBottom: 2,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── MOOD BLOCK MODAL — sibling of input, not nested inside it ─────── */}
      {moodBlockModalOpen && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              backdropFilter: "blur(20px)",
              zIndex: 200,
              opacity: moodBlockModalVisible ? 1 : 0,
              transition: "opacity 0.22s ease-out",
            }}
            onClick={() => setMoodBlockModalOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              background: "#1a1a1a",
              borderRadius: 24,
              padding: "28px 24px",
              zIndex: 201,
              width: "92vw",
              maxWidth: 380,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              transformOrigin: "center center",
              opacity: moodBlockModalVisible ? 1 : 0,
              transform: moodBlockModalVisible
                ? "translate(-50%, -50%) scale(1)"
                : "translate(-50%, calc(-50% + 18px)) scale(0.92)",
              transition:
                "opacity 0.24s ease-out, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#fff",
                textAlign: "center",
                marginBottom: 24,
                letterSpacing: "-0.5px",
              }}
            >
              Choose Your Mood
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {(
                [
                  {
                    mood: "angry" as const,
                    color: "255,59,48",
                    label: "Angry",
                  },
                  {
                    mood: "crying" as const,
                    color: "0,122,255",
                    label: "Crying",
                  },
                  {
                    mood: "irritated" as const,
                    color: "255,149,0",
                    label: "Irritated",
                  },
                  {
                    mood: "depressed" as const,
                    color: "142,142,147",
                    label: "Depressed",
                  },
                ] as const
              ).map(({ mood, color, label }) => (
                <button
                  key={mood}
                  onClick={() => {
                    handleMoodBlock(mood);
                    setMoodBlockModalOpen(false);
                  }}
                  style={{
                    background: `rgba(${color},0.08)`,
                    border: `1.5px solid rgba(${color},0.25)`,
                    borderRadius: 20,
                    padding: "20px 12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 110,
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.background = `rgba(${color},0.15)`;
                    e.currentTarget.style.transform = "scale(0.96)";
                  }}
                  onTouchEnd={(e) => {
                    e.currentTarget.style.background = `rgba(${color},0.08)`;
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <div style={{ fontSize: 44, lineHeight: 1 }}>
                    {moodEmoji(mood)}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: `rgb(${color})`,
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {label}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMoodBlockModalOpen(false)}
              style={{
                width: "100%",
                background: "rgba(51,51,51,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 16,
                padding: "18px",
                color: "#fff",
                fontSize: 17,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                minHeight: 56,
                WebkitTapHighlightColor: "transparent",
                letterSpacing: "0.3px",
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.background = "rgba(68,68,68,0.9)";
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.background = "rgba(51,51,51,0.8)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── MOOD BLOCK ACTIVE CARD — fixed to bottom, always visible ──────── */}
      {currentMoodBlock && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 12,
              right: 12,
              zIndex: 40,
              opacity: currentMoodBlockVisible ? 1 : 0,
              transform: currentMoodBlockVisible
                ? "translateY(0) scale(1)"
                : "translateY(36px) scale(0.96)",
              transition:
                "opacity 0.36s ease-out, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "-18px 10% 22px",
                borderRadius: 32,
                background: `radial-gradient(circle, ${activeMoodTheme.accentGlow} 0%, transparent 72%)`,
                filter: "blur(26px)",
                opacity: currentMoodBlockVisible ? 1 : 0,
                transition: "opacity 0.55s ease-out 0.08s",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                background: activeMoodTheme.panel,
                border: `1px solid ${activeMoodTheme.accentSoft}`,
                borderRadius: 28,
                padding: "18px 18px 16px",
                backdropFilter: "blur(22px)",
                boxShadow: `0 24px 60px rgba(0,0,0,0.46), 0 0 0 1px ${activeMoodTheme.accentSoft}, inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 36,
                    width: 68,
                    height: 68,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), ${activeMoodTheme.accentSoft} 45%, rgba(0,0,0,0.14) 100%)`,
                    borderRadius: 22,
                    flexShrink: 0,
                    color: "#fff",
                    boxShadow: `0 10px 30px ${activeMoodTheme.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                    animation: "moodOrbPulse 2.8s ease-in-out infinite",
                  }}
                >
                  {moodEmoji(currentMoodBlock.mood)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      marginBottom: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${activeMoodTheme.accentSoft}`,
                      color: activeMoodTheme.accent,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: activeMoodTheme.accent,
                        boxShadow: `0 0 12px ${activeMoodTheme.accentGlow}`,
                      }}
                    />
                    {activeMoodTheme.label}
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      color: "#fff",
                      marginBottom: 6,
                      textTransform: "capitalize",
                      letterSpacing: "-0.02em",
                      textShadow: "0 6px 22px rgba(0,0,0,0.34)",
                    }}
                  >
                    {currentMoodBlock.initiatedByName} is{" "}
                    {currentMoodBlock.mood}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.64)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>⏳ Please wait...</span>
                    <span style={{ color: "#666" }}>·</span>
                    <MoodBlockTimer endTime={currentMoodBlock.endTime} />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (currentConversation?.id) {
                      const db = getFirestore();
                      deleteDoc(
                        doc(
                          db,
                          "conversations",
                          currentConversation.id,
                          "meta",
                          "moodBlock",
                        ),
                      ).catch(() => {});
                    }
                    setCurrentMoodBlock(null);
                  }}
                  style={{
                    alignSelf: "flex-start",
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${activeMoodTheme.accentSoft}`,
                    borderRadius: 999,
                    padding: "10px 15px",
                    color: activeMoodTheme.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                    flexShrink: 0,
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.background =
                      activeMoodTheme.accentSoft;
                    e.currentTarget.style.transform = "scale(0.96)";
                  }}
                  onTouchEnd={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  Skip
                </button>
              </div>

              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  overflow: "hidden",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: `linear-gradient(90deg, ${activeMoodTheme.accent}, rgba(255,255,255,0.92))`,
                    borderRadius: 999,
                    transition: "width 1s linear",
                    width: `${progressBarWidth}%`,
                    animation: "moodProgressGlow 2.2s ease-in-out infinite",
                    boxShadow: `0 0 16px ${activeMoodTheme.accentGlow}`,
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
