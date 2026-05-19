import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { onAuthStateChanged } from "firebase/auth";
import { auth as firebaseAuth } from "../../backend/lib/firebase";
import {
  messagingService,
  type ChatSwitchSignal,
} from "../../middleware/services/messaging.service";
import {
  chatInviteService,
  type ChatInvite,
} from "../../middleware/services/chat-invite.service";
import { friendsService } from "../../middleware/services/service-factory";
import {
  isSharedStoryPreviewActive,
  parseSharedPostPayload,
  parseSharedStoryPayload,
  type SharedPostPayload,
  type SharedStoryPayload,
} from "../../utils/sharedPostMessage";
import { uploadOptimizedMedia } from "../../utils/mediaUpload";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Reply,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";

type From = "me" | "them";
type Status = "seen" | "delivered" | "screenshot";
type EvType =
  | "screenshot"
  | "chat_switch"
  | "opened_noreply"
  | "long_unsent"
  | "mention"
  | "ignored"
  | "invite";

interface Msg {
  id: string;
  kind: "msg";
  from: From;
  text: string;
  senderId: string;
  senderName: string;
  sharedPost: SharedPostPayload | null;
  sharedStory: SharedStoryPayload | null;
  mediaUrl: string | null;
  mediaType: string | null;
  photoUrls: string[];
  sourceIds: string[];
  replyTo: ReplyTarget | null;
  createdAt?: string | number;
  optimistic?: boolean;
  failed?: boolean;
}
interface Evt {
  id: string;
  kind: "evt";
  type: EvType;
  text: string;
  targetUserId?: string;
}
type TimelineItem = Msg | Evt;
interface ChatPhoto {
  key: string;
  url: string;
}

interface ReplyTarget {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaType?: string | null;
}

interface OptimisticPhotoMessage {
  id: string;
  conversationId: string;
  localUrl: string;
  uploadedUrl?: string;
  file: File;
  createdAt: number;
  failed?: boolean;
}

interface OptimisticTextMessage {
  id: string;
  conversationId: string;
  text: string;
  replyTo: ReplyTarget | null;
  createdAt: number;
  failed?: boolean;
}

const FRIEND = {
  name: "Nina Creates",
  avatar: "https://picsum.photos/seed/nina/100/100",
};

const MESSAGING_SCREEN_DEBUG = false;

function summarizeMessageForReply(msg: Msg): string {
  const trimmed = msg.text.trim();
  if (
    trimmed &&
    !/^photo$/i.test(trimmed) &&
    !/^\d+\s+photos$/i.test(trimmed)
  ) {
    return trimmed.length > 96 ? `${trimmed.slice(0, 96)}...` : trimmed;
  }
  if (msg.photoUrls.length > 1) return `${msg.photoUrls.length} photos`;
  if (msg.photoUrls.length === 1 || msg.mediaType === "PHOTO") return "Photo";
  if (msg.sharedStory) return "Story reply";
  if (msg.sharedPost) return "Shared post";
  return "Message";
}

function replyPreviewLabel(replyTo: ReplyTarget): string {
  if (replyTo.mediaType === "PHOTO") return replyTo.content || "Photo";
  return replyTo.content || "Message";
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parsePresenceTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") {
    const time = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "object") {
    const timestamp = value as {
      seconds?: number;
      nanoseconds?: number;
      toDate?: () => Date;
    };
    if (typeof timestamp.toDate === "function") {
      const time = timestamp.toDate().getTime();
      return Number.isFinite(time) ? time : null;
    }
    if (typeof timestamp.seconds === "number") {
      const time =
        timestamp.seconds * 1000 +
        Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
      return Number.isFinite(time) ? time : null;
    }
  }
  return null;
}

function getDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

function formatLastSeenLabel(
  timestamp: number | null,
  timeZone: string,
): string {
  if (!timestamp) return "OFFLINE";
  const safeTimeZone = timeZone || getBrowserTimeZone();
  const lastSeenDate = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const timeFormatterOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const dateFormatterOptions: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  };
  const time = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...timeFormatterOptions,
        timeZone: safeTimeZone,
      }).format(lastSeenDate);
    } catch {
      return new Intl.DateTimeFormat("en-US", timeFormatterOptions).format(
        lastSeenDate,
      );
    }
  })();

  const seenKey = getDateKey(lastSeenDate, safeTimeZone);
  const todayKey = getDateKey(now, safeTimeZone);
  const yesterdayKey = getDateKey(yesterday, safeTimeZone);

  if (seenKey === todayKey) return `last seen today at ${time}`;
  if (seenKey === yesterdayKey) return `last seen yesterday at ${time}`;

  const date = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...dateFormatterOptions,
        timeZone: safeTimeZone,
      }).format(lastSeenDate);
    } catch {
      return new Intl.DateTimeFormat("en-US", dateFormatterOptions).format(
        lastSeenDate,
      );
    }
  })();
  return `last seen ${date} at ${time}`;
}

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

const getInviteLabel = (text: string) => {
  const m = text.match(
    /^(.+?)\s+(was invited|has joined this conversation|was removed|left)$/i,
  );
  return m ? (
    <span>
      <span style={{ color: "#3df57f", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}> {m[2]}</span>
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
  invite: {
    icon: "+",
    accent: "#3df57f",
    label: getInviteLabel,
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
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [type, text, collapsed, targetUserId]);

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
    if (type === "invite") return getInviteLabel(text);
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
        transition:
          "padding 0.28s ease, opacity 0.24s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: entered ? 1 : 0,
        transform: entered
          ? "translateY(0) scale(1)"
          : "translateY(8px) scale(0.985)",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(22,26,22,0.98), rgba(13,16,13,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
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
            "border-radius 0.28s ease, padding 0.28s ease, width 0.28s ease, max-width 0.28s ease, box-shadow 0.28s ease",
          boxShadow: entered
            ? collapsed
              ? "0 10px 24px rgba(0,0,0,0.18)"
              : "0 14px 30px rgba(0,0,0,0.22)"
            : "0 0 0 rgba(0,0,0,0)",
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
              background: "rgba(255,255,255,0.045)",
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

// ─── Shared Post Card (Instagram-DM style) ───────────────────────────────────

function SharedPostCard({
  msg,
  variant,
  onOpenSharedPost,
}: {
  msg: Msg;
  variant: "own" | "them";
  onOpenSharedPost?: (userId: string, postId: string) => void;
}) {
  if (!msg.sharedPost) return null;
  const sp = msg.sharedPost;
  const isOwn = variant === "own";

  const palette = isOwn
    ? {
        cardBg: "#0d0d0d",
        cardBorder: "rgba(61,245,127,0.18)",
        mediaBg: "#000",
        primaryText: "#ffffff",
        secondaryText: "rgba(255,255,255,0.55)",
        captionText: "#d7ffe6",
        avatarBg: "rgba(61,245,127,0.15)",
        avatarBorder: "rgba(61,245,127,0.35)",
        footerBorder: "rgba(255,255,255,0.06)",
        footerText: "#3df57f",
      }
    : {
        cardBg: "#0d0d0d",
        cardBorder: "rgba(255,255,255,0.1)",
        mediaBg: "#000",
        primaryText: "#ffffff",
        secondaryText: "rgba(255,255,255,0.55)",
        captionText: "#e5e7eb",
        avatarBg: "rgba(255,255,255,0.08)",
        avatarBorder: "rgba(255,255,255,0.18)",
        footerBorder: "rgba(255,255,255,0.06)",
        footerText: "#ffffff",
      };

  const usernameClean = sp.authorUsername.replace(/^@/, "");
  const initial = (sp.authorName || usernameClean || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <button
      onClick={() => onOpenSharedPost?.(sp.authorId, sp.postId)}
      style={{
        background: palette.cardBg,
        border: `1px solid ${palette.cardBorder}`,
        borderRadius: 20,
        padding: 0,
        margin: 0,
        width: 320,
        maxWidth: "100%",
        textAlign: "left",
        cursor: "pointer",
        color: palette.primaryText,
        overflow: "hidden",
        display: "block",
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header: avatar + username */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
        }}
      >
        {sp.authorAvatar ? (
          <img
            src={sp.authorAvatar}
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              objectFit: "cover",
              border: `1px solid ${palette.avatarBorder}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: palette.avatarBg,
              border: `1px solid ${palette.avatarBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: palette.primaryText,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: palette.primaryText,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {usernameClean}
          </div>
        </div>
      </div>

      {/* Media (square, Instagram-like) */}
      {sp.media?.url ? (
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            background: palette.mediaBg,
            overflow: "hidden",
          }}
        >
          <img
            src={sp.media.thumbnail || sp.media.url}
            alt="Shared post"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      ) : null}

      {/* Caption */}
      {sp.content ? (
        <div style={{ padding: "12px 16px 6px" }}>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.45,
              color: palette.captionText,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            <span style={{ fontWeight: 600, color: palette.primaryText }}>
              {usernameClean}
            </span>{" "}
            {sp.content}
          </div>
        </div>
      ) : null}

      {/* Footer: View post */}
      <div
        style={{
          borderTop: `1px solid ${palette.footerBorder}`,
          marginTop: sp.content ? 8 : 0,
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 600,
          color: palette.footerText,
          letterSpacing: "0.01em",
        }}
      >
        View post
      </div>
    </button>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

// Story replies carry their preview payload in the message itself, so rendering
// the 24-hour card does not need an extra story document read.
function StoryReplyCard({
  msg,
  variant,
}: {
  msg: Msg;
  variant: "own" | "them";
}) {
  const story = msg.sharedStory;
  const isOwn = variant === "own";
  const [previewActive, setPreviewActive] = useState(() =>
    story ? isSharedStoryPreviewActive(story) : false,
  );
  const [storyDeleted, setStoryDeleted] = useState(false);
  const [liveStoryMedia, setLiveStoryMedia] = useState<{
    url?: string;
    thumbnail?: string;
  } | null>(null);
  const [sharpPreviewLoaded, setSharpPreviewLoaded] = useState(false);

  useEffect(() => {
    if (!story) return;
    const expiresAtMs = new Date(story.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      setPreviewActive(false);
      return;
    }

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      setPreviewActive(false);
      return;
    }

    setPreviewActive(true);
    const timeout = window.setTimeout(
      () => setPreviewActive(false),
      Math.min(remainingMs, 2147483647),
    );
    return () => window.clearTimeout(timeout);
  }, [story?.expiresAt, story?.storyId]);

  useEffect(() => {
    setStoryDeleted(false);
    setLiveStoryMedia(null);
    if (!story || !previewActive) return;

    const db = getFirestore();
    return onSnapshot(
      doc(db, "stories", story.storyId),
      (snapshot) => {
        const exists = snapshot.exists();
        setStoryDeleted(!exists);
        if (!exists) {
          setLiveStoryMedia(null);
          return;
        }

        const data = snapshot.data() as {
          media?: { url?: string; thumbnail?: string };
          mediaUrl?: string;
          thumbnail?: string;
        };
        setLiveStoryMedia({
          url: data.media?.url || data.mediaUrl || "",
          thumbnail: data.media?.thumbnail || data.thumbnail || "",
        });
      },
      () => {
        setStoryDeleted(false);
        setLiveStoryMedia(null);
      },
    );
  }, [previewActive, story?.storyId]);

  const previewUrl =
    liveStoryMedia?.url || story?.media.url || story?.media.thumbnail || "";
  const previewPoster =
    liveStoryMedia?.thumbnail || story?.media.thumbnail || previewUrl;
  const hasSeparatePoster = Boolean(
    previewPoster && previewPoster !== previewUrl,
  );
  const hasPreview = previewActive && !storyDeleted && Boolean(previewUrl);
  const isVideo = story?.media.type === "video";
  const replyText = story?.replyText || msg.text;
  const collapsedStoryLabel = storyDeleted
    ? "Story deleted"
    : previewActive
      ? "Story unavailable"
      : "Story expired";
  const replyBubbleStyle: React.CSSProperties = isOwn
    ? {
        alignSelf: "flex-end",
        background: "rgba(61,245,127,0.08)",
        color: "#3df57f",
        boxShadow: "0 2px 8px rgba(61,245,127,0.08)",
        borderTopRightRadius: 4,
      }
    : {
        alignSelf: "flex-start",
        background: "#191919",
        color: "#fff",
        borderTopLeftRadius: 4,
      };

  useEffect(() => {
    setSharpPreviewLoaded(false);
  }, [previewUrl]);

  if (!story) return null;

  return (
    <div
      style={{
        width: 224,
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: isOwn ? "flex-end" : "flex-start",
        gap: 8,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 190,
          height: hasPreview ? 304 : 64,
          borderRadius: hasPreview ? 20 : 18,
          overflow: "hidden",
          background: hasPreview
            ? "linear-gradient(180deg, #050505, #0c0c0c)"
            : "rgba(255,255,255,0.045)",
          border: isOwn
            ? "1px solid rgba(61,245,127,0.2)"
            : "1px solid rgba(255,255,255,0.1)",
          boxShadow: hasPreview
            ? "0 10px 26px rgba(0,0,0,0.34)"
            : "0 6px 16px rgba(0,0,0,0.22)",
        }}
      >
        {hasPreview ? (
          isVideo ? (
            <video
              src={previewUrl}
              poster={previewPoster}
              muted
              playsInline
              preload="metadata"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <>
              {hasSeparatePoster && (
                <img
                  src={previewPoster}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding="async"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "blur(14px)",
                    transform: "scale(1.08)",
                    opacity: sharpPreviewLoaded ? 0 : 0.72,
                    transition: "opacity 0.22s ease",
                  }}
                />
              )}
              <img
                src={previewUrl}
                alt="Story preview"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onLoad={() => setSharpPreviewLoaded(true)}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: sharpPreviewLoaded || !hasSeparatePoster ? 1 : 0,
                  transform: "translateZ(0)",
                  transition: "opacity 0.18s ease",
                  background: "#050505",
                }}
              />
            </>
          )
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              color: storyDeleted
                ? "rgba(255,255,255,0.58)"
                : "rgba(255,255,255,0.46)",
              fontSize: 13,
              fontWeight: 800,
              textAlign: "center",
              padding: "10px 14px",
              lineHeight: 1.25,
            }}
          >
            {collapsedStoryLabel}
            <span
              style={{
                color: "rgba(255,255,255,0.28)",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Preview hidden
            </span>
          </div>
        )}

        {hasPreview && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.28), transparent 38%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 9,
                bottom: 9,
                borderRadius: 999,
                background: "rgba(0,0,0,0.58)",
                color: "rgba(255,255,255,0.86)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 10,
                fontWeight: 800,
                padding: "5px 8px",
                backdropFilter: "blur(8px)",
              }}
            >
              {isVideo ? "Video story" : "Story"}
            </div>
          </>
        )}
      </div>

      {replyText && (
        <div
          style={{
            maxWidth: "100%",
            padding: "12px 16px",
            fontSize: 17,
            lineHeight: 1.5,
            wordBreak: "break-word",
            borderRadius: 18,
            ...replyBubbleStyle,
          }}
        >
          {replyText}
        </div>
      )}
    </div>
  );
}

function parseDailyChallengeStarter(text: string): {
  askerName: string;
  question: string;
} | null {
  const marker = " asked you a question as part of their daily challenge.";
  const markerIndex = text.indexOf(marker);
  if (markerIndex <= 0) return null;

  const askerName = text.slice(0, markerIndex).trim();
  const question = text.slice(markerIndex + marker.length).trim();
  if (!askerName || !question) return null;

  return {
    askerName,
    question: question.replace(/^\n+/, "").trim(),
  };
}

function DailyChallengeStarterCard({
  starter,
  variant,
}: {
  starter: { askerName: string; question: string };
  variant: "own" | "them";
}) {
  const isOwn = variant === "own";

  return (
    <div
      style={{
        width: 326,
        maxWidth: "100%",
        overflow: "hidden",
        borderRadius: 26,
        border: isOwn
          ? "1px solid rgba(61,245,127,0.28)"
          : "1px solid rgba(255,255,255,0.1)",
        background:
          "linear-gradient(180deg, rgba(18,24,20,0.98), rgba(8,10,9,0.99))",
        boxShadow: isOwn
          ? "0 20px 52px rgba(0,0,0,0.42), 0 0 34px rgba(61,245,127,0.12), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 18px 46px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "16px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0 22px auto",
            height: 1,
            background:
              "linear-gradient(90deg, rgba(61,245,127,0), rgba(61,245,127,0.85), rgba(61,245,127,0))",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.28), rgba(61,245,127,0.18) 42%, rgba(6,8,7,0.9) 100%)",
              border: "1px solid rgba(61,245,127,0.3)",
              color: "#bbf7d0",
              fontSize: 22,
              fontWeight: 900,
              boxShadow: "0 14px 34px rgba(61,245,127,0.14)",
              flexShrink: 0,
            }}
          >
            ?
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 5,
                padding: "5px 8px",
                borderRadius: 999,
                border: "1px solid rgba(61,245,127,0.2)",
                background: "rgba(61,245,127,0.08)",
                color: "#86efac",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Daily Challenge
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isOwn
                ? "You started the challenge"
                : `${starter.askerName} picked you`}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "17px 17px 18px" }}>
        <p
          style={{
            margin: 0,
            color: "#f8fafc",
            fontSize: 17,
            lineHeight: 1.48,
            fontWeight: 750,
            letterSpacing: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {starter.question}
        </p>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.42)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Conversation starter
          </span>
          <span
            style={{
              borderRadius: 999,
              background: "rgba(61,245,127,0.12)",
              color: "#86efac",
              border: "1px solid rgba(61,245,127,0.2)",
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            Opened
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatPhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ChatPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const safeIndex = Math.min(
    Math.max(index, 0),
    Math.max(photos.length - 1, 0),
  );
  const activePhoto = photos[safeIndex];
  const hasMultiple = photos.length > 1;

  const getWrappedIndex = useCallback(
    (nextIndex: number) => {
      if (photos.length === 0) return 0;
      return (nextIndex + photos.length) % photos.length;
    },
    [photos.length],
  );

  const finishAnimatedNavigation = useCallback(
    (direction: 1 | -1) => {
      const viewportWidth =
        viewportRef.current?.clientWidth ||
        (typeof window !== "undefined" ? window.innerWidth : 360);
      const nextIndex = getWrappedIndex(safeIndex + direction);

      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }

      setIsDragging(false);
      setIsSettling(true);
      setDragOffset(direction === 1 ? -viewportWidth : viewportWidth);

      animationTimerRef.current = setTimeout(() => {
        onIndexChange(nextIndex);
        setIsSettling(false);
        setDragOffset(0);
        animationTimerRef.current = null;
      }, 280);
    },
    [getWrappedIndex, onIndexChange, safeIndex],
  );

  const goPrev = useCallback(() => {
    if (!hasMultiple || isSettling) return;
    finishAnimatedNavigation(-1);
  }, [finishAnimatedNavigation, hasMultiple, isSettling]);

  const goNext = useCallback(() => {
    if (!hasMultiple || isSettling) return;
    finishAnimatedNavigation(1);
  }, [finishAnimatedNavigation, hasMultiple, isSettling]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, [goNext, goPrev, onClose]);

  if (!activePhoto) return null;

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isSettling) return;
    const target = event.target;
    const touchedMedia =
      target instanceof HTMLElement
        ? target.closest('[data-photo-viewer-media="true"]')
        : null;
    if (!touchedMedia) {
      touchStartRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragOffset(dx * 0.72);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      setDragOffset(0);
      setIsDragging(false);
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const viewportWidth =
      viewportRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    const isSwipe =
      hasMultiple &&
      Math.abs(dx) > Math.min(118, viewportWidth * 0.28) &&
      Math.abs(dx) > Math.abs(dy) * 1.35;

    if (isSwipe) {
      finishAnimatedNavigation(dx < 0 ? 1 : -1);
      return;
    }

    setIsDragging(false);
    setDragOffset(0);
  };

  const iconButtonStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,12,12,0.58)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(14px)",
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.96)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        ref={viewportRef}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
          setIsDragging(false);
          setDragOffset(0);
        }}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding:
            "calc(58px + var(--safe-area-top)) 14px calc(58px + var(--safe-area-bottom))",
        }}
      >
        {(hasMultiple ? [-1, 0, 1] : [0]).map((slot) => {
          const photoIndex = getWrappedIndex(safeIndex + slot);
          const photo = photos[photoIndex] ?? activePhoto;
          return (
            <img
              key={`${photo.key}-${slot}`}
              data-photo-viewer-media="true"
              src={photo.url}
              alt={`Chat photo ${photoIndex + 1} of ${photos.length}`}
              draggable={false}
              style={{
                position: "absolute",
                maxWidth: "calc(100% - 28px)",
                maxHeight:
                  "calc(100% - 116px - var(--safe-area-top) - var(--safe-area-bottom))",
                objectFit: "contain",
                borderRadius: 6,
                transform: `translate3d(calc(${slot * 100}% + ${dragOffset}px), 0, 0)`,
                transition:
                  isDragging || (!isSettling && dragOffset !== 0)
                    ? "none"
                    : "transform 0.28s cubic-bezier(0.22, 0.78, 0.18, 1)",
                userSelect: "none",
                touchAction: "pan-y",
                willChange: "transform",
              }}
            />
          );
        })}
      </div>

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: "calc(14px + var(--safe-area-top))",
          left: 14,
          right: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            minWidth: 72,
            borderRadius: 999,
            padding: "8px 12px",
            color: "rgba(255,255,255,0.86)",
            background: "rgba(12,12,12,0.58)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
            fontSize: 13,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          {safeIndex + 1} / {photos.length}
        </div>
        <button
          type="button"
          aria-label="Close photo viewer"
          onClick={onClose}
          style={{ ...iconButtonStyle, pointerEvents: "auto" }}
        >
          <X size={20} />
        </button>
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            style={{
              ...iconButtonStyle,
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            style={{
              ...iconButtonStyle,
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>
  );
}

function MessageGestureFrame({
  msg,
  onReply,
  onLongPress,
  children,
}: {
  msg: Msg;
  onReply?: (msg: Msg) => void;
  onLongPress?: (msg: Msg) => void;
  children: React.ReactNode;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const setDragOnFrame = (nextDragX: number) => {
    pendingDragRef.current = nextDragX;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      setDragX(pendingDragRef.current);
      dragFrameRef.current = null;
    });
  };

  const resetDrag = () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragRef.current = 0;
    setIsPulling(false);
    setDragX(0);
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const replyProgress = Math.min(1, Math.abs(dragX) / 34);
  const showReplyCue = replyProgress > 0.04;
  const replyCueSide: React.CSSProperties =
    msg.from === "me" ? { right: 18 } : { left: 18 };

  return (
    <div
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        resetDrag();
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          onLongPress?.(msg);
          longPressTimerRef.current = null;
          setDragX(0);
        }, 520);
      }}
      onTouchMove={(event) => {
        const start = touchStartRef.current;
        if (!start) return;
        const touch = event.touches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPressTimer();
        if (Math.abs(dx) > Math.abs(dy) * 1.25) {
          const directionAllowed = msg.from === "me" ? dx < 0 : dx > 0;
          const sign = dx < 0 ? -1 : 1;
          const resistance = directionAllowed ? 0.46 : 0.14;
          const eased = Math.min(
            directionAllowed ? 84 : 20,
            Math.pow(Math.abs(dx), 0.92) * resistance,
          );
          setIsPulling(directionAllowed);
          setDragOnFrame(sign * eased);
        }
      }}
      onTouchEnd={(event) => {
        clearLongPressTimer();
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) {
          resetDrag();
          return;
        }

        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const directionAllowed = msg.from === "me" ? dx < 0 : dx > 0;
        if (
          directionAllowed &&
          Math.abs(dx) > 64 &&
          Math.abs(dx) > Math.abs(dy) * 1.35
        ) {
          onReply?.(msg);
        }
        resetDrag();
      }}
      onTouchCancel={() => {
        clearLongPressTimer();
        touchStartRef.current = null;
        resetDrag();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onLongPress?.(msg);
      }}
      style={{
        position: "relative",
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          ...replyCueSide,
          width: 34,
          height: 34,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#07130c",
          background:
            "linear-gradient(135deg, rgba(61,245,127,0.96), rgba(134,239,172,0.9))",
          boxShadow: "0 10px 28px rgba(61,245,127,0.22)",
          opacity: showReplyCue ? 0.35 + replyProgress * 0.65 : 0,
          transform: `translateY(-50%) scale(${0.72 + replyProgress * 0.28})`,
          transition: isPulling
            ? "none"
            : "opacity 0.16s ease, transform 0.2s ease",
          pointerEvents: "none",
        }}
      >
        <Reply
          size={17}
          strokeWidth={2.6}
          style={{
            transform: msg.from === "me" ? "scaleX(-1)" : "none",
          }}
        />
      </div>
      <div
        style={{
          transform: `translate3d(${dragX}px, 0, 0)`,
          transition:
            dragX === 0
              ? "transform 0.28s cubic-bezier(0.2, 0.84, 0.24, 1)"
              : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InlineReplyPreview({
  replyTo,
  own,
}: {
  replyTo: ReplyTarget | null;
  own: boolean;
}) {
  if (!replyTo) return null;

  return (
    <div
      style={{
        position: "relative",
        margin: "0 0 7px",
        padding: "7px 9px 7px 11px",
        borderRadius: 10,
        background: own
          ? "linear-gradient(135deg, rgba(3,18,10,0.46), rgba(61,245,127,0.09))"
          : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
        border: own
          ? "1px solid rgba(61,245,127,0.16)"
          : "1px solid rgba(255,255,255,0.08)",
        color: own ? "#d7ffe6" : "rgba(255,255,255,0.82)",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: own ? "#3df57f" : "#8b9aaf",
          opacity: own ? 0.95 : 0.82,
        }}
      />
      <div
        style={{
          color: own ? "#86efac" : "#d6dde8",
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 3,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {replyTo.senderName}
      </div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.32,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          opacity: 0.86,
        }}
      >
        {replyPreviewLabel(replyTo)}
      </div>
    </div>
  );
}

function Bubble({
  msg,
  showStatus,
  status,
  onOpenSharedPost,
  onOpenPhoto,
  onReply,
  onLongPress,
  showSenderName,
}: {
  msg: Msg;
  showStatus: boolean;
  status: Status;
  onOpenSharedPost?: (userId: string, postId: string) => void;
  onOpenPhoto?: (msg: Msg, photoIndex: number) => void;
  onReply?: (msg: Msg) => void;
  onLongPress?: (msg: Msg) => void;
  showSenderName?: boolean;
}) {
  const own = msg.from === "me";
  const dailyChallengeStarter = parseDailyChallengeStarter(msg.text);
  const senderLabel = (msg.senderName || (own ? "You" : "Guest")).trim();
  const wrapMessage = (node: React.ReactNode) => (
    <MessageGestureFrame msg={msg} onReply={onReply} onLongPress={onLongPress}>
      <div>
        {showSenderName && senderLabel && (
          <div
            style={{
              display: "flex",
              justifyContent: own ? "flex-end" : "flex-start",
              padding: own ? "0 30px 2px 14px" : "0 14px 2px 30px",
              marginTop: 4,
              color: own ? "rgba(134,239,172,0.78)" : "rgba(255,255,255,0.52)",
              fontSize: 11,
              fontWeight: 850,
              lineHeight: 1.2,
              letterSpacing: "0.02em",
              textTransform: "none",
            }}
          >
            {senderLabel}
          </div>
        )}
        {node}
      </div>
    </MessageGestureFrame>
  );

  if (msg.photoUrls.length > 0) {
    const visibleUrls = msg.photoUrls.slice(0, 4);
    const hiddenCount = Math.max(0, msg.photoUrls.length - visibleUrls.length);
    const isSinglePhoto = msg.photoUrls.length === 1;
    const isDisplayCaption =
      msg.text.trim().length > 0 &&
      !/^photo$/i.test(msg.text.trim()) &&
      !/^\d+\s+photos$/i.test(msg.text.trim());
    const showSendingOverlay = msg.optimistic && !msg.failed;
    const showFailedOverlay = msg.failed;
    const photoButtonStyle: React.CSSProperties = {
      display: "block",
      padding: 0,
      margin: 0,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      lineHeight: 0,
    };

    return wrapMessage(
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
                  padding: msg.replyTo ? 7 : isDisplayCaption ? 4 : 3,
                  borderRadius: 17,
                  borderTopRightRadius: 4,
                  background:
                    "linear-gradient(180deg, rgba(31,37,35,0.78) 0%, rgba(18,23,21,0.86) 62%, rgba(10,14,12,0.92) 100%)",
                  border: "1px solid rgba(148,163,184,0.1)",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow:
                    "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.045)",
                }}
              >
                <InlineReplyPreview replyTo={msg.replyTo} own={own} />
                {isSinglePhoto ? (
                  <button
                    type="button"
                    aria-label="Open sent photo fullscreen"
                    onClick={() => onOpenPhoto?.(msg, 0)}
                    style={photoButtonStyle}
                  >
                    <img
                      src={msg.photoUrls[0]}
                      alt="Sent photo"
                      style={{
                        display: "block",
                        width: "min(72vw, 270px)",
                        maxHeight: 360,
                        objectFit: "cover",
                        borderRadius: 15,
                        background: "#080808",
                      }}
                    />
                  </button>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 3,
                      width: "min(72vw, 280px)",
                    }}
                  >
                    {visibleUrls.map((url, index) => (
                      <button
                        type="button"
                        aria-label={`Open sent photo ${index + 1} fullscreen`}
                        onClick={() => onOpenPhoto?.(msg, index)}
                        key={`${url}-${index}`}
                        style={{
                          ...photoButtonStyle,
                          position: "relative",
                          aspectRatio: "1 / 1",
                          overflow: "hidden",
                          borderRadius:
                            index === 0
                              ? "14px 3px 3px 3px"
                              : index === 1
                                ? "3px 14px 3px 3px"
                                : index === 2
                                  ? "3px 3px 3px 14px"
                                  : "3px 3px 14px 3px",
                          background: "#080808",
                        }}
                      >
                        <img
                          src={url}
                          alt="Sent photo"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        {index === 3 && hiddenCount > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              fontSize: 28,
                              fontWeight: 800,
                            }}
                          >
                            +{hiddenCount}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(showSendingOverlay || showFailedOverlay) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 3,
                      borderRadius: 15,
                      background: showFailedOverlay
                        ? "rgba(80,0,0,0.48)"
                        : "rgba(0,0,0,0.32)",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-end",
                      padding: 8,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.58)",
                        color: showFailedOverlay ? "#fecaca" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "5px 8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {showFailedOverlay ? "Failed" : "Sending..."}
                    </span>
                  </div>
                )}
                {isDisplayCaption && (
                  <div
                    style={{
                      padding: "8px 9px 6px",
                      color: "#e5e7eb",
                      fontSize: 14,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0, marginTop: 4 }}
              >
                <path d="M 0 0 L 12 0 L 0 10 Z" fill="rgba(31,37,35,0.78)" />
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
                <path d="M 12 0 L 0 0 L 12 10 Z" fill="rgba(16,23,17,0.82)" />
              </svg>
              <div
                style={{
                  maxWidth: "82%",
                  padding: msg.replyTo ? 7 : isDisplayCaption ? 4 : 3,
                  borderRadius: 17,
                  borderTopLeftRadius: 4,
                  background:
                    "linear-gradient(180deg, rgba(16,23,17,0.82) 0%, rgba(10,15,11,0.9) 66%, rgba(5,8,6,0.94) 100%)",
                  border: "1px solid rgba(134,239,172,0.075)",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow:
                    "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.035)",
                }}
              >
                <InlineReplyPreview replyTo={msg.replyTo} own={own} />
                {isSinglePhoto ? (
                  <button
                    type="button"
                    aria-label="Open received photo fullscreen"
                    onClick={() => onOpenPhoto?.(msg, 0)}
                    style={photoButtonStyle}
                  >
                    <img
                      src={msg.photoUrls[0]}
                      alt="Received photo"
                      style={{
                        display: "block",
                        width: "min(72vw, 270px)",
                        maxHeight: 360,
                        objectFit: "cover",
                        borderRadius: 15,
                        background: "#080808",
                      }}
                    />
                  </button>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 3,
                      width: "min(72vw, 280px)",
                    }}
                  >
                    {visibleUrls.map((url, index) => (
                      <button
                        type="button"
                        aria-label={`Open received photo ${index + 1} fullscreen`}
                        onClick={() => onOpenPhoto?.(msg, index)}
                        key={`${url}-${index}`}
                        style={{
                          ...photoButtonStyle,
                          position: "relative",
                          aspectRatio: "1 / 1",
                          overflow: "hidden",
                          borderRadius:
                            index === 0
                              ? "14px 3px 3px 3px"
                              : index === 1
                                ? "3px 14px 3px 3px"
                                : index === 2
                                  ? "3px 3px 3px 14px"
                                  : "3px 3px 14px 3px",
                          background: "#080808",
                        }}
                      >
                        <img
                          src={url}
                          alt="Received photo"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        {index === 3 && hiddenCount > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              fontSize: 28,
                              fontWeight: 800,
                            }}
                          >
                            +{hiddenCount}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(showSendingOverlay || showFailedOverlay) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 3,
                      borderRadius: 15,
                      background: showFailedOverlay
                        ? "rgba(80,0,0,0.48)"
                        : "rgba(0,0,0,0.32)",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-end",
                      padding: 8,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.58)",
                        color: showFailedOverlay ? "#fecaca" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "5px 8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {showFailedOverlay ? "Failed" : "Sending..."}
                    </span>
                  </div>
                )}
                {isDisplayCaption && (
                  <div
                    style={{
                      padding: "8px 9px 6px",
                      color: "#fff",
                      fontSize: 14,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.text}
                  </div>
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
                Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  if (dailyChallengeStarter) {
    return wrapMessage(
      <div style={{ padding: "6px 14px 10px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "90%" }}>
            <DailyChallengeStarterCard
              starter={dailyChallengeStarter}
              variant={own ? "own" : "them"}
            />
          </div>
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
                Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  if (msg.sharedStory) {
    return wrapMessage(
      <div style={{ padding: "4px 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "86%" }}>
            <StoryReplyCard msg={msg} variant={own ? "own" : "them"} />
          </div>
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
                ðŸ“¸ Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  // Shared post messages render as standalone Instagram-style cards (no bubble).
  if (msg.sharedPost) {
    return wrapMessage(
      <div style={{ padding: "4px 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "86%" }}>
            <SharedPostCard
              msg={msg}
              variant={own ? "own" : "them"}
              onOpenSharedPost={onOpenSharedPost}
            />
          </div>
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
      </div>,
    );
  }

  return wrapMessage(
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
                padding: "10.5px 14px",
                fontSize: 16,
                lineHeight: 1.45,
                wordBreak: "break-word",
                borderRadius: 17,
                borderTopRightRadius: 4,
                background:
                  "linear-gradient(180deg, rgba(31,37,35,0.8) 0%, rgba(18,23,21,0.88) 62%, rgba(10,14,12,0.94) 100%)",
                color: "#e5e7eb",
                border: "1px solid rgba(148,163,184,0.11)",
                boxShadow:
                  "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.045)",
              }}
            >
              <InlineReplyPreview replyTo={msg.replyTo} own={own} />
              {msg.text}
            </div>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{ flexShrink: 0, marginTop: 4 }}
            >
              <path d="M 0 0 L 12 0 L 0 10 Z" fill="rgba(31,37,35,0.8)" />
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
              <path d="M 12 0 L 0 0 L 12 10 Z" fill="rgba(16,23,17,0.84)" />
            </svg>
            <div
              style={{
                maxWidth: "82%",
                padding: "10.5px 14px",
                fontSize: 16,
                lineHeight: 1.45,
                wordBreak: "break-word",
                borderRadius: 17,
                borderTopLeftRadius: 4,
                background:
                  "linear-gradient(180deg, rgba(16,23,17,0.84) 0%, rgba(10,15,11,0.9) 66%, rgba(5,8,6,0.94) 100%)",
                color: "#f1f5f9",
                border: "1px solid rgba(134,239,172,0.075)",
                boxShadow:
                  "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.035)",
              }}
            >
              <InlineReplyPreview replyTo={msg.replyTo} own={own} />
              {msg.text}
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
    </div>,
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
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(
    () => !user?.id || firebaseAuth?.currentUser?.uid === user.id,
  );
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
    setCurrentConversation,
    trackScreenshot,
    trackOpenedNoReply,
    trackLongUnsent,
    trackMention,
    trackSeenMessage,
    markMessageAsSeen,
    deleteMessage,
    clearError,
    clearMessages,
  } = useMessagingStore();

  useEffect(() => {
    if (!user?.id) {
      setFirebaseAuthReady(true);
      return;
    }

    if (firebaseAuth?.currentUser?.uid === user.id) {
      setFirebaseAuthReady(true);
      return;
    }

    setFirebaseAuthReady(false);
    if (!firebaseAuth) return;

    return onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setFirebaseAuthReady(firebaseUser?.uid === user.id);
    });
  }, [user?.id]);

  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("seen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteFriends, setInviteFriends] = useState<any[]>([]);
  const [loadingInviteFriends, setLoadingInviteFriends] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [conversationInvites, setConversationInvites] = useState<ChatInvite[]>(
    [],
  );
  const [conversationInvitesReady, setConversationInvitesReady] =
    useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [optimisticPhotoMessages, setOptimisticPhotoMessages] = useState<
    OptimisticPhotoMessage[]
  >([]);
  const [optimisticTextMessages, setOptimisticTextMessages] = useState<
    OptimisticTextMessage[]
  >([]);
  const [photoViewer, setPhotoViewer] = useState<{
    photos: ChatPhoto[];
    index: number;
  } | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<Msg | null>(
    null,
  );
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const activeConversationId = currentConversation?.id ?? null;
  const activeMessages = useMemo(
    () =>
      activeConversationId
        ? messages.filter((msg) => msg.conversation_id === activeConversationId)
        : [],
    [activeConversationId, messages],
  );
  const originalParticipantIds = useMemo(
    () =>
      [currentConversation?.user1_id, currentConversation?.user2_id].filter(
        Boolean,
      ) as string[],
    [currentConversation?.user1_id, currentConversation?.user2_id],
  );
  const isOriginalParticipant =
    !!user?.id && originalParticipantIds.includes(user.id);
  const acceptedTemporaryInvites = useMemo(
    () => conversationInvites.filter((invite) => invite.status === "accepted"),
    [conversationInvites],
  );
  const enteredTemporaryInvites = useMemo(
    () => acceptedTemporaryInvites.filter((invite) => invite.entered_at),
    [acceptedTemporaryInvites],
  );
  const temporaryGroupModeActive = enteredTemporaryInvites.length > 0;
  const currentUserTemporaryInvite = useMemo(
    () =>
      user?.id
        ? acceptedTemporaryInvites.find(
            (invite) => invite.invitee_id === user.id,
          )
        : undefined,
    [acceptedTemporaryInvites, user?.id],
  );
  const temporaryAccessEnded =
    !!user?.id &&
    !!currentConversation &&
    conversationInvitesReady &&
    !isOriginalParticipant &&
    !currentUserTemporaryInvite;

  useEffect(() => {
    if (!user?.id || !currentConversation?.id || !currentUserTemporaryInvite) {
      return;
    }

    const key = `${currentConversation.id}:${currentUserTemporaryInvite.id}`;
    if (enteredInviteEventIdsRef.current.has(key)) return;
    enteredInviteEventIdsRef.current.add(key);

    void chatInviteService
      .markInviteEntered(currentUserTemporaryInvite.id, user.id)
      .catch((error) => {
        enteredInviteEventIdsRef.current.delete(key);
        console.error("Unable to mark chat invite entered:", error);
      });
  }, [currentConversation?.id, currentUserTemporaryInvite, user?.id]);

  const [localFrozenBy, setLocalFrozenBy] = useState<string | null>(null);
  const [_rtdbOnline, setRtdbOnline] = useState(false);
  const [friendGhostMode, setFriendGhostMode] = useState(false);
  const friendOnline =
    _rtdbOnline ||
    onlineFriends.includes(
      currentConversation?.other_user?.user_id ||
        currentConversation?.other_user?.id ||
        "",
    );
  const [friendRealtimeLastSeenAt, setFriendRealtimeLastSeenAt] = useState<
    number | null
  >(null);
  const [friendRealtimeTimeZone, setFriendRealtimeTimeZone] =
    useState(getBrowserTimeZone);
  const [friendFirestoreLastSeenAt, setFriendFirestoreLastSeenAt] = useState<
    number | null
  >(null);
  const [friendFirestoreTimeZone, setFriendFirestoreTimeZone] =
    useState(getBrowserTimeZone);
  const friendLastSeenAt =
    friendRealtimeLastSeenAt ?? friendFirestoreLastSeenAt;
  const friendTimeZone = friendRealtimeLastSeenAt
    ? friendRealtimeTimeZone
    : friendFirestoreTimeZone;
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
  const enteredInviteEventIdsRef = useRef(new Set<string>());
  const pendingSeenMarksRef = useRef(new Set<string>());
  const ghostRef = useRef(false);
  const isTypingRef = useRef(false);
  const temporaryAccessEndedRef = useRef(false);
  const lastPresenceSwitchRef = useRef<string>("");
  const mutualChatEstablishedRef = useRef(false);
  const frozenRef = useRef(frozen);
  const convRef = useRef(currentConversation);
  const userIdRef = useRef(user?.id);
  const optimisticPhotoMessagesRef = useRef<OptimisticPhotoMessage[]>([]);
  const menuActionPointerHandledRef = useRef(0);

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
    temporaryAccessEndedRef.current = temporaryAccessEnded;
  }, [temporaryAccessEnded]);
  useEffect(() => {
    optimisticPhotoMessagesRef.current = optimisticPhotoMessages;
  }, [optimisticPhotoMessages]);
  useEffect(() => {
    if (!temporaryAccessEnded) return;
    if (draftThrottleRef.current) {
      clearTimeout(draftThrottleRef.current);
      draftThrottleRef.current = null;
    }
    longTimer.current && clearTimeout(longTimer.current);
    longTimer.current = null;
    lastDraftRef.current = "";
    isTypingRef.current = false;
    setInput("");
    setReplyTarget(null);
    setLiveDraft(null);
    setOptimisticSwitchEvents([]);
    unsubscribeFromRealTimeMessages();
    unsubscribeFromRealTimeEvents();
    unsubscribeFromTypingIndicators();
    unsubscribeFromFreezeStatus();
  }, [
    temporaryAccessEnded,
    unsubscribeFromRealTimeMessages,
    unsubscribeFromRealTimeEvents,
    unsubscribeFromTypingIndicators,
    unsubscribeFromFreezeStatus,
  ]);
  useEffect(() => {
    if (
      !currentConversation?.id ||
      !user?.id ||
      typeof window === "undefined"
    ) {
      setHiddenMessageIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(
        `chat_hidden_messages:${user.id}:${currentConversation.id}`,
      );
      setHiddenMessageIds(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setHiddenMessageIds(new Set());
    }
  }, [currentConversation?.id, user?.id]);
  useEffect(() => {
    return () => {
      optimisticPhotoMessagesRef.current.forEach((message) => {
        URL.revokeObjectURL(message.localUrl);
      });
    };
  }, []);
  useEffect(() => {
    const realPhotoUrls = new Set(
      activeMessages
        .filter((message) => {
          const mediaType = String(
            message.media_type || message.mediaType || "",
          ).toUpperCase();
          return mediaType === "PHOTO";
        })
        .map((message) => message.mediaUrl || message.media_url)
        .filter(Boolean),
    );

    if (realPhotoUrls.size === 0) return;

    setOptimisticPhotoMessages((current) => {
      let changed = false;
      const next = current.filter((message) => {
        const hasArrived =
          message.uploadedUrl && realPhotoUrls.has(message.uploadedUrl);
        if (hasArrived) {
          URL.revokeObjectURL(message.localUrl);
          changed = true;
          return false;
        }
        return true;
      });
      return changed ? next : current;
    });
  }, [activeMessages]);

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
    if (!uid || !firebaseAuthReady) return;
    const db = getFirestore();
    const presenceRef = doc(db, "presence", uid);
    if (!otherUserId) {
      void setDoc(
        presenceRef,
        {
          current_chat_user_id: "",
          current_chat_user_name: "",
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
        is_online: true,
        last_seen: serverTimestamp(),
        timezone: getBrowserTimeZone(),
        updated_at: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {});
    return () => {
      void setDoc(
        presenceRef,
        {
          current_chat_user_id: "",
          current_chat_user_name: "",
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
    firebaseAuthReady,
  ]);

  useEffect(() => {
    setOptimisticSwitchEvents([]);
    if (!currentConversation?.id || !user?.id || temporaryAccessEnded) return;
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
  }, [currentConversation?.id, user?.id, temporaryAccessEnded]);

  function writeDraftHelper(text: string, convId?: string) {
    if (temporaryAccessEndedRef.current) return;
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid || !firebaseAuthReady) return;
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
    if (temporaryAccessEndedRef.current) return;
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
    lastDraftRef.current = "";
    isTypingRef.current = false;
    if (temporaryAccessEndedRef.current) return;
    writeDraftHelper("", conv.id);
    setTypingIndicator(conv.id, false);
  }, [setTypingIndicator]); // eslint-disable-line

  function writeDraft(text: string, convId?: string) {
    if (temporaryAccessEndedRef.current) return;
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid || !firebaseAuthReady) return;
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
  // ── Freeze listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const convId = currentConversation?.id;
    if (!convId || temporaryAccessEnded || !firebaseAuthReady) {
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
      (error) => {
        if (error?.code !== "permission-denied") {
          console.error("Unable to subscribe to freeze status:", error);
        }
        setLocalFrozenBy(null);
      },
    );
    return () => unsub();
  }, [currentConversation?.id, temporaryAccessEnded, firebaseAuthReady]);

  // ── Friend online listener ────────────────────────────────────────────────
  useEffect(() => {
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (!friendId) {
      setFriendGhostMode(false);
      setFriendFirestoreLastSeenAt(null);
      setFriendFirestoreTimeZone(getBrowserTimeZone());
      setLivePresenceSwitchTarget(null);
      lastPresenceSwitchRef.current = "";
      return;
    }
    if (!firebaseAuthReady) return;
    setFriendFirestoreLastSeenAt(null);
    setFriendFirestoreTimeZone(getBrowserTimeZone());
    const db = getFirestore();
    const handlePresenceUnavailable = () => {
      setFriendGhostMode(false);
      setFriendFirestoreLastSeenAt(null);
      setFriendFirestoreTimeZone(getBrowserTimeZone());
      setLivePresenceSwitchTarget(null);
      lastPresenceSwitchRef.current = "";
    };

    const unsub = onSnapshot(
      doc(db, "presence", friendId),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setFriendFirestoreLastSeenAt(parsePresenceTimestamp(d?.last_seen));
          setFriendFirestoreTimeZone(
            typeof d?.timezone === "string" && d.timezone
              ? d.timezone
              : getBrowserTimeZone(),
          );
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
          handlePresenceUnavailable();
        }
      },
      (error) => {
        if (error?.code !== "permission-denied") {
          console.error("Unable to subscribe to friend presence:", error);
        }
        handlePresenceUnavailable();
      },
    );
    return () => unsub();
  }, [
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    user?.id,
    firebaseAuthReady,
  ]);

  // ── Friend RTDB online status ────────────────────────────────────────────
  useEffect(() => {
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (MESSAGING_SCREEN_DEBUG) {
      console.log("🔍 [MessagingScreen DEBUG] Presence subscription setup:", {
        friendId,
        conversationId: currentConversation?.id,
        hasFriend: !!friendId,
      });
    }

    if (!friendId) {
      if (MESSAGING_SCREEN_DEBUG) {
        console.log(
          "🔍 [MessagingScreen DEBUG] No friendId, clearing presence",
        );
      }
      setRtdbOnline(false);
      setFriendRealtimeLastSeenAt(null);
      setFriendRealtimeTimeZone(getBrowserTimeZone());
      return;
    }
    setFriendRealtimeLastSeenAt(null);
    setFriendRealtimeTimeZone(getBrowserTimeZone());

    const unsub = messagingService.subscribeToUsersLivePresenceStatus(
      [friendId],
      (statuses) => {
        if (MESSAGING_SCREEN_DEBUG) {
          console.log("🔍 [MessagingScreen DEBUG] Presence status callback:", {
            friendId,
            allStatuses: statuses,
            status: statuses.find((entry) => entry.userId === friendId),
          });
        }
        const status = statuses.find((entry) => entry.userId === friendId);
        const isOnline = status?.isOnline ?? false;
        const lastSeen = parsePresenceTimestamp(status?.lastSeen);
        const timezone = status?.timezone || getBrowserTimeZone();

        if (MESSAGING_SCREEN_DEBUG) {
          console.log("🔍 [MessagingScreen DEBUG] Updating presence state:", {
            friendId,
            isOnline,
            lastSeen,
            timezone,
          });
        }

        setRtdbOnline(isOnline);
        setFriendRealtimeLastSeenAt(lastSeen);
        setFriendRealtimeTimeZone(timezone);
      },
    );
    return () => {
      if (MESSAGING_SCREEN_DEBUG) {
        console.log(
          "🔍 [MessagingScreen DEBUG] Unsubscribing presence for:",
          friendId,
        );
      }
      unsub();
    };
  }, [
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
  ]);

  useEffect(() => {
    const convId = currentConversation?.id;
    const friendId = currentConversation?.other_user?.user_id;
    if (!convId || !friendId || temporaryAccessEnded || !firebaseAuthReady) {
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
      (error) => {
        if (error?.code !== "permission-denied") {
          console.error("Unable to subscribe to live draft:", error);
        }
        setLiveDraft(null);
      },
    );
    return () => unsub();
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    temporaryAccessEnded,
    firebaseAuthReady,
  ]);

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    return () => {
      subscribedConvId.current = null;
      clearRealtimeTypingSignals();
      unsubscribeFromRealTimeMessages();
      unsubscribeFromRealTimeEvents();
      unsubscribeFromTypingIndicators();
      unsubscribeFromFreezeStatus();
    };
  }, [user?.id, clearRealtimeTypingSignals]); // eslint-disable-line

  // ── Subscribe to conversation ─────────────────────────────────────────────
  useEffect(() => {
    if (temporaryAccessEnded) return;
    if (!user?.id || !firebaseAuthReady || conversations.length === 0) return;
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
    console.log(
      "🔍 [MessagingScreen DEBUG] Subscribing to RTDB for conversation:",
      conversation.id,
    );
    subscribeToRealTimeMessages(conversation.id);
    subscribeToRealTimeEvents(conversation.id);
    subscribeToTypingIndicators(conversation.id);
    subscribeToFreezeStatus(conversation.id);
    trackedMentions.current.clear();
    setHasOpenedChat(false);
    setInput(loadLocalDraft(conversation.id));
    lastDraftRef.current = "";
  }, [user?.id, firebaseAuthReady, conversationId, conversations, temporaryAccessEnded]); // eslint-disable-line

  useEffect(() => {
    if (
      temporaryAccessEnded ||
      !user?.id ||
      !firebaseAuthReady ||
      !conversationId ||
      currentConversation?.id === conversationId
    ) {
      return;
    }
    if (
      conversations.some((conversation) => conversation.id === conversationId)
    ) {
      return;
    }

    let cancelled = false;
    void chatInviteService
      .getConversationForUser(conversationId, user.id)
      .then((conversation) => {
        if (cancelled || !conversation) return;
        subscribedConvId.current = conversation.id;
        setCurrentConversation(conversation);
        subscribeToRealTimeMessages(conversation.id);
        subscribeToRealTimeEvents(conversation.id);
        subscribeToTypingIndicators(conversation.id);
        subscribeToFreezeStatus(conversation.id);
        setInput(loadLocalDraft(conversation.id));
      })
      .catch((error) => console.error("Unable to open temporary chat:", error));

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    firebaseAuthReady,
    conversationId,
    currentConversation?.id,
    conversations,
    setCurrentConversation,
    subscribeToRealTimeMessages,
    subscribeToRealTimeEvents,
    subscribeToTypingIndicators,
    subscribeToFreezeStatus,
    loadLocalDraft,
    temporaryAccessEnded,
  ]);

  useEffect(() => {
    if (!currentConversation?.id || !user?.id || !firebaseAuthReady) {
      setConversationInvites([]);
      setConversationInvitesReady(false);
      return;
    }
    const candidateInviteeIds = [
      ...(currentConversation.temporary_participant_ids || []),
      ...inviteFriends.map(
        (friend: any) => friend.userId || friend.user_id || friend.id,
      ),
    ].filter(
      (id, index, self): id is string =>
        !!id && id !== user.id && self.indexOf(id) === index,
    );
    return chatInviteService.subscribeConversationInvites(
      currentConversation.id,
      user.id,
      isOriginalParticipant,
      candidateInviteeIds,
      (invites) => {
        setConversationInvites(invites);
        setConversationInvitesReady(true);
      },
    );
  }, [
    currentConversation?.id,
    currentConversation?.temporary_participant_ids,
    inviteFriends,
    isOriginalParticipant,
    user?.id,
    firebaseAuthReady,
  ]);

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
  }, [activeMessages, messageEvents, livePresenceSwitchTarget]);

  // ── Seen tracking (only the most recent incoming message) ────────────────
  useEffect(() => {
    if (!currentConversation || !user?.id) return;
    const otherUserId = currentConversation.other_user?.user_id;
    if (!otherUserId) return;
    const seenOwnMessages = activeMessages.filter(
      (msg) => msg.senderId === user.id && msg.isOwn && msg.is_seen,
    );
    if (seenOwnMessages.length === 0) return;
    const latest = seenOwnMessages[seenOwnMessages.length - 1];
    trackSeenMessage(
      latest.id,
      currentConversation.id,
      otherUserId,
      currentConversation.other_user?.display_name ||
        currentConversation.other_user?.username ||
        "Someone",
    );
  }, [activeMessages, currentConversation, user?.id, trackSeenMessage]);

  useEffect(() => {
    if (!currentConversation?.id || !user?.id) return;
    const unseenIncoming = activeMessages.filter(
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
  }, [activeMessages, currentConversation?.id, user?.id, markMessageAsSeen]);

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
    if (!currentConversation?.id || temporaryAccessEnded || !firebaseAuthReady) {
      setCurrentMoodBlock(null);
      return;
    }
    const db = getFirestore();
    const moodBlockRef = doc(
      db,
      "conversations",
      currentConversation.id,
      "meta",
      "moodBlock",
    );
    const unsub = onSnapshot(
      moodBlockRef,
      (snap) => {
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
      },
      (error) => {
        if (error?.code !== "permission-denied") {
          console.error("Unable to subscribe to mood block:", error);
        }
        setCurrentMoodBlock(null);
      },
    );
    return () => unsub();
  }, [currentConversation?.id, temporaryAccessEnded, firebaseAuthReady]);

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
      "invite",
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
        if (event.data?.ignored_direction === "they_ignored_me") {
          const ignorerName =
            event.data?.user_name ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "Someone";
          const ignoredName =
            event.data?.ignored_user_name ||
            user?.displayName ||
            user?.username ||
            "your";
          return event.user_id === user?.id
            ? `${ignorerName} ignored your message`
            : `You ignored ${ignoredName}'s message`;
        }
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
      case "invite": {
        const invitedName = event.data?.user_name || "Someone";
        switch (event.data?.action) {
          case "invited":
            return `${invitedName} was invited`;
          case "joined":
            return `${invitedName} has joined this conversation`;
          case "removed":
            return `${invitedName} was removed`;
          case "left":
            return `${invitedName} left`;
          default:
            return `${invitedName} was invited`;
        }
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
  const friendTyping = useMemo(() => {
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    return (
      !!convId &&
      !!friendId &&
      typingUsers.some(
        (typingUser) =>
          typingUser.conversation_id === convId &&
          typingUser.user_id === friendId &&
          typingUser.is_typing,
      )
    );
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    typingUsers,
  ]);
  const friendStatusLabel = useMemo(() => {
    if (friendTyping) return "TYPING...";
    if (friendOnline) return "ACTIVE NOW";
    return formatLastSeenLabel(friendLastSeenAt, friendTimeZone);
  }, [friendTyping, friendOnline, friendLastSeenAt, friendTimeZone]);
  const friendStatusIsLive = friendTyping || friendOnline;

  useEffect(() => {
    if (!MESSAGING_SCREEN_DEBUG) return;
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    console.log("[MessagingScreen DEBUG] final header indicators:", {
      conversationId: convId,
      friendId,
      friendUsername: currentConversation?.other_user?.username,
      friendOnline,
      friendTyping,
      friendStatusLabel,
      friendStatusIsLive,
      friendLastSeenAt,
      friendTimeZone,
      onlineFriends,
      matchingTypingUsers: typingUsers.filter(
        (typingUser) =>
          typingUser.conversation_id === convId &&
          typingUser.user_id === friendId,
      ),
    });
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    currentConversation?.other_user?.username,
    friendOnline,
    friendTyping,
    friendStatusLabel,
    friendStatusIsLive,
    friendLastSeenAt,
    friendTimeZone,
    onlineFriends,
    typingUsers,
  ]);

  const arrivedPhotoUrls = new Set(
    activeMessages
      .filter((msg) => {
        const mediaType = String(
          msg.media_type || msg.mediaType || "",
        ).toUpperCase();
        return mediaType === "PHOTO";
      })
      .map((msg) => msg.mediaUrl || msg.media_url)
      .filter(Boolean),
  );
  const arrivedOwnTextMessages = activeMessages
    .filter((msg) => {
      const mediaType = String(
        msg.media_type || msg.mediaType || "TEXT",
      ).toUpperCase();
      return (
        (msg.senderId || msg.sender_id) === user?.id &&
        mediaType !== "PHOTO" &&
        mediaType !== "VIDEO"
      );
    })
    .map((msg) => {
      const rawTime = msg.timestamp ?? msg.created_at;
      const time =
        typeof rawTime === "object" && rawTime && "toDate" in rawTime
          ? (rawTime as any).toDate().getTime()
          : rawTime
            ? new Date(String(rawTime)).getTime()
            : 0;
      return {
        content: String(msg.content || ""),
        time: Number.isFinite(time) ? time : 0,
      };
    });

  const rawTimeline: TimelineItem[] = [
    ...activeMessages
      .filter((msg) => !hiddenMessageIds.has(msg.id))
      .map((msg) => {
        const mediaUrl = msg.mediaUrl || msg.media_url || null;
        const mediaType = String(
          msg.media_type || msg.mediaType || "",
        ).toUpperCase();
        const sharedPost = parseSharedPostPayload(mediaUrl);
        const sharedStory = parseSharedStoryPayload(mediaUrl);
        const replyToRaw = msg.reply_to || msg.replyTo || null;
        return {
          id: msg.id,
          kind: "msg" as const,
          from: (msg.senderId === user?.id ? "me" : "them") as From,
          text: msg.content,
          senderId: msg.senderId || msg.sender_id,
          senderName:
            msg.senderName ||
            ((msg.senderId || msg.sender_id) === user?.id
              ? user?.username || user?.displayName || "You"
              : friendInfo.name),
          sharedPost,
          sharedStory,
          mediaUrl,
          mediaType,
          sourceIds: [msg.id],
          replyTo: replyToRaw
            ? {
                id: String(replyToRaw.id || ""),
                senderId: String(
                  replyToRaw.sender_id || replyToRaw.senderId || "",
                ),
                senderName: String(
                  replyToRaw.sender_name || replyToRaw.senderName || "Message",
                ),
                content: String(replyToRaw.content || ""),
                mediaType:
                  replyToRaw.media_type || replyToRaw.mediaType || null,
              }
            : null,
          createdAt: msg.timestamp ?? msg.created_at,
          photoUrls:
            mediaUrl && mediaType === "PHOTO" && !sharedPost && !sharedStory
              ? [mediaUrl]
              : [],
        };
      }),
    ...optimisticTextMessages
      .filter(
        (message) =>
          message.conversationId === currentConversation?.id &&
          !arrivedOwnTextMessages.some(
            (arrived) =>
              arrived.content === message.text &&
              arrived.time >= message.createdAt - 5_000 &&
              arrived.time <= message.createdAt + 60_000,
          ),
      )
      .map(
        (message): Msg => ({
          id: message.id,
          kind: "msg",
          from: "me",
          text: message.text,
          senderId: user?.id ?? "",
          senderName: "You",
          sharedPost: null,
          sharedStory: null,
          mediaUrl: null,
          mediaType: "TEXT",
          photoUrls: [],
          sourceIds: [message.id],
          replyTo: message.replyTo,
          createdAt: message.createdAt,
          optimistic: !message.failed,
          failed: !!message.failed,
        }),
      ),
    ...optimisticPhotoMessages
      .filter(
        (message) =>
          message.conversationId === currentConversation?.id &&
          (!message.uploadedUrl || !arrivedPhotoUrls.has(message.uploadedUrl)),
      )
      .map(
        (message): Msg => ({
          id: message.id,
          kind: "msg",
          from: "me",
          text: "Photo",
          senderId: user?.id ?? "",
          senderName: "You",
          sharedPost: null,
          sharedStory: null,
          mediaUrl: message.uploadedUrl || message.localUrl,
          mediaType: "PHOTO",
          photoUrls: [message.localUrl],
          sourceIds: [message.id],
          replyTo: null,
          createdAt: message.createdAt,
          optimistic: !message.failed,
          failed: !!message.failed,
        }),
      ),
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
          ? activeMessages.find((m) => m.id === item.id)
          : timelineEvents.find((e) => e.id === item.id);
      const raw =
        item.kind === "msg"
          ? (item.createdAt ??
            (src as any)?.timestamp ??
            (src as any)?.created_at)
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

  const timeline: TimelineItem[] = rawTimeline.reduce<TimelineItem[]>(
    (items, item) => {
      const prev = items[items.length - 1];
      if (
        item.kind === "msg" &&
        prev?.kind === "msg" &&
        item.photoUrls.length > 0 &&
        prev.photoUrls.length > 0 &&
        item.from === prev.from
      ) {
        items[items.length - 1] = {
          ...prev,
          id: item.id,
          text: prev.text,
          photoUrls: [...prev.photoUrls, ...item.photoUrls],
          sourceIds: [...prev.sourceIds, ...item.sourceIds],
          createdAt: item.createdAt,
          optimistic: prev.optimistic || item.optimistic,
          failed: prev.failed || item.failed,
        };
        return items;
      }
      items.push(item);
      return items;
    },
    [],
  );

  const getChatPhotos = (): ChatPhoto[] =>
    timeline.flatMap((item) =>
      item.kind === "msg"
        ? item.photoUrls.map((url, index) => ({
            key: `${item.id}:${index}`,
            url,
          }))
        : [],
    );

  const openPhotoViewer = (msg: Msg, photoIndex: number) => {
    const photos = getChatPhotos();
    const requestedKey = `${msg.id}:${photoIndex}`;
    const requestedIndex = photos.findIndex(
      (photo) => photo.key === requestedKey,
    );

    setPhotoViewer({
      photos,
      index: requestedIndex >= 0 ? requestedIndex : 0,
    });
  };

  const setReplyFromMessage = (msg: Msg) => {
    setReplyTarget({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.from === "me" ? "You" : msg.senderName || friendInfo.name,
      content: summarizeMessageForReply(msg),
      mediaType: msg.mediaType,
    });
  };

  const persistHiddenMessageIds = (nextIds: Set<string>) => {
    if (!currentConversation?.id || !user?.id || typeof window === "undefined")
      return;
    localStorage.setItem(
      `chat_hidden_messages:${user.id}:${currentConversation.id}`,
      JSON.stringify([...nextIds]),
    );
  };

  const deleteMessageForMe = (msg: Msg) => {
    setHiddenMessageIds((current) => {
      const next = new Set(current);
      msg.sourceIds.forEach((id) => next.add(id));
      persistHiddenMessageIds(next);
      return next;
    });
    if (replyTarget && msg.sourceIds.includes(replyTarget.id)) {
      setReplyTarget(null);
    }
    setMessageActionTarget(null);
  };

  const deleteMessageForEveryone = async (msg: Msg) => {
    if (!user?.id || msg.from !== "me") return;
    setMessageActionTarget(null);
    try {
      await Promise.all(msg.sourceIds.map((id) => deleteMessage(id, user.id)));
      if (replyTarget && msg.sourceIds.includes(replyTarget.id)) {
        setReplyTarget(null);
      }
    } catch (error) {
      console.error("[MessagingScreen] Failed to delete message:", error);
      alert("Unable to delete this message for everyone.");
    }
  };

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
    if (temporaryAccessEndedRef.current) return;
    setInput(val);
    saveLocalDraft(val);
    if (!ghostRef.current) {
      const nowTyping = val.length > 0;
      if (nowTyping !== isTypingRef.current) {
        isTypingRef.current = nowTyping;
        const conv = convRef.current;
        if (conv) setTypingIndicator(conv.id, nowTyping);
      }
    } else if (isTypingRef.current) {
      isTypingRef.current = false;
      const conv = convRef.current;
      if (conv) setTypingIndicator(conv.id, false);
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
      currentMoodBlock ||
      temporaryAccessEnded
    )
      return;
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    const text = input.trim();
    const optimisticMessage: OptimisticTextMessage = {
      id: `optimistic-text-${Date.now()}`,
      conversationId: currentConversation.id,
      text,
      replyTo: replyTarget,
      createdAt: Date.now(),
    };
    const replyPayload = replyTarget
      ? {
          id: replyTarget.id,
          sender_id: replyTarget.senderId,
          sender_name: replyTarget.senderName,
          content: replyTarget.content,
          media_type: replyTarget.mediaType || "TEXT",
        }
      : undefined;
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
      setOptimisticTextMessages((current) => [...current, optimisticMessage]);
      setReplyTarget(null);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        setTypingIndicator(currentConversation.id, false);
      }
      setStatus("delivered");
      await sendRealTimeMessage(
        currentConversation.id,
        text,
        undefined,
        undefined,
        replyPayload,
      );
      setOptimisticTextMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
      console.log("[MessagingScreen] Message sent successfully");
      setTimeout(() => setStatus("seen"), 2200);
    } catch (err) {
      console.error("[MessagingScreen] Failed to send:", err);
      setOptimisticTextMessages((current) =>
        current.map((message) =>
          message.id === optimisticMessage.id
            ? { ...message, failed: true }
            : message,
        ),
      );
      setInput(text);
      saveLocalDraft(text, currentConversation.id);
    }
  }

  async function sendPhotoFiles(files: FileList | null) {
    if (!files?.length) return;
    if (
      !currentConversation ||
      !user?.id ||
      frozenRef.current ||
      currentMoodBlock ||
      temporaryAccessEnded
    )
      return;

    const photoFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (photoFiles.length === 0) return;

    const conversation = currentConversation;
    const optimisticMessages = photoFiles.map((file, index) => ({
      id: `optimistic-photo-${Date.now()}-${index}-${file.name}`,
      conversationId: conversation.id,
      localUrl: URL.createObjectURL(file),
      file,
      createdAt: Date.now() + index,
    }));

    setOptimisticPhotoMessages((current) => [
      ...current,
      ...optimisticMessages,
    ]);
    setSendingMedia(true);
    setStatus("delivered");

    void Promise.allSettled(
      optimisticMessages.map(async (message) => {
        try {
          const uploadedPhoto = await uploadOptimizedMedia({
            source: message.file,
            userId: user.id,
            context: "messages",
            fileName: message.file.name,
            mediaKind: "image",
          });

          setOptimisticPhotoMessages((current) =>
            current.map((item) =>
              item.id === message.id
                ? { ...item, uploadedUrl: uploadedPhoto.url }
                : item,
            ),
          );

          await sendRealTimeMessage(
            conversation.id,
            "Photo",
            uploadedPhoto.url,
            "PHOTO",
          );
        } catch (err) {
          console.error("[MessagingScreen] Failed to send photo:", err);
          setOptimisticPhotoMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, failed: true } : item,
            ),
          );
        }
      }),
    ).then(() => {
      setTimeout(() => setStatus("seen"), 2200);
      setSendingMedia(false);
    });
  }

  const loadInviteFriends = useCallback(async () => {
    if (!user?.id) return;
    setLoadingInviteFriends(true);
    try {
      const response = await friendsService.getFriends(user.id);
      const friends = Array.isArray(response)
        ? response
        : response.success
          ? response.friends || []
          : [];
      const unavailableIds = new Set([
        user.id,
        ...originalParticipantIds,
        ...acceptedTemporaryInvites.map((invite) => invite.invitee_id),
        ...conversationInvites
          .filter((invite) => invite.status === "pending")
          .map((invite) => invite.invitee_id),
      ]);
      setInviteFriends(
        friends.filter((friend: any) => {
          const friendId = friend.userId || friend.user_id || friend.id;
          return friendId && !unavailableIds.has(friendId);
        }),
      );
    } catch (error) {
      console.error("Unable to load friends for invite:", error);
      setInviteFriends([]);
    } finally {
      setLoadingInviteFriends(false);
    }
  }, [
    user?.id,
    originalParticipantIds,
    acceptedTemporaryInvites,
    conversationInvites,
  ]);

  const openInviteModal = () => {
    setMenuOpen(false);
    setInviteSearch("");
    window.setTimeout(() => {
      setInviteModalOpen(true);
      void loadInviteFriends();
    }, 0);
  };

  const filteredInviteFriends = inviteFriends.filter((friend: any) => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      friend.displayName,
      friend.display_name,
      friend.nickname,
      friend.username,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const sendInviteToFriend = async (friend: any) => {
    if (!currentConversation?.id || !user?.id || sendingInviteId) return;
    const friendId = friend.userId || friend.user_id || friend.id;
    if (!friendId) return;
    const friendName =
      friend.displayName ||
      friend.display_name ||
      friend.nickname ||
      friend.username ||
      "Someone";
    setSendingInviteId(friendId);
    try {
      await chatInviteService.sendInvite({
        conversationId: currentConversation.id,
        inviterId: user.id,
        inviterName: user.displayName || user.username || "Someone",
        inviteeId: friendId,
        inviteeName: friendName,
      });
      setInviteModalOpen(false);
    } catch (error) {
      console.error("Unable to send invite:", error);
      alert(error instanceof Error ? error.message : "Unable to send invite.");
    } finally {
      setSendingInviteId(null);
    }
  };

  const endTemporaryAccess = async (
    invite: ChatInvite,
    action: "removed" | "left",
  ) => {
    if (!user?.id) return;
    try {
      await chatInviteService.endTemporaryAccess({
        inviteId: invite.id,
        actorId: user.id,
        action,
      });
    } catch (error) {
      console.error("Unable to update temporary access:", error);
      alert("Unable to update temporary access.");
    }
  };

  const lastMineId = [...timeline]
    .reverse()
    .find((item): item is Msg => item.kind === "msg" && item.from === "me")?.id;

  const runMenuAction = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      console.error("Unable to run chat menu action:", error);
      alert("Unable to run this chat action.");
    }
  };

  const menuActions: [string, string, () => void, boolean][] = [
    ...(isOriginalParticipant
      ? ([
          [
            "Invite friend",
            "",
            () => {
              openInviteModal();
            },
            false,
          ],
        ] as [string, string, () => void, boolean][])
      : []),
    [
      "Mood Block",
      "",
      () => {
        setMenuOpen(false);
        window.setTimeout(() => setMoodBlockModalOpen(true), 0);
      },
      false,
    ],
    [
      frozen ? (canUnfreeze ? "Unfreeze" : "Frozen by them") : "Freeze chat",
      "",
      () => {
        setMenuOpen(false);
        if (frozen && canUnfreeze) {
          void doUnfreeze().catch((error) => {
            console.error("Unable to unfreeze chat:", error);
            alert("Unable to unfreeze this chat.");
          });
        } else if (!frozen) {
          void doFreeze().catch((error) => {
            console.error("Unable to freeze chat:", error);
            alert("Unable to freeze this chat.");
          });
        }
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
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)",
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
        @keyframes replyCardIn{
          0%{opacity:0;transform:translateY(10px) scale(0.985)}
          100%{opacity:1;transform:translateY(0) scale(1)}
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
        input::placeholder,textarea::placeholder{color:#64748b}
        ::-webkit-scrollbar{display:none}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 120,
          flexShrink: 0,
          background:
            "radial-gradient(ellipse at 24% -34%, rgba(74,222,128,0.2), transparent 62%), radial-gradient(ellipse at 78% -28%, rgba(14,165,233,0.14), transparent 60%), linear-gradient(180deg, rgba(6,8,6,0.98) 0%, rgba(10,15,10,0.97) 52%, rgba(3,4,3,0.96) 100%)",
          padding: "calc(14px + var(--safe-area-top)) 14px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 54px rgba(0,0,0,0.38)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div style={{ padding: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background:
                "radial-gradient(ellipse at 24% -45%, rgba(74,222,128,0.15), transparent 64%), radial-gradient(ellipse at 82% -40%, rgba(14,165,233,0.1), transparent 62%), linear-gradient(180deg, rgba(13,19,14,0.92), rgba(8,13,9,0.96))",
              borderRadius: 30,
              padding: "12px",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                onClick={() => {
                  clearRealtimeTypingSignals();
                  onBack?.();
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
                  cursor: "pointer",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                  boxShadow:
                    "0 14px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <ChevronLeft size={20} />
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
                    background: friendOnline ? "#22c55e" : "#334155",
                    border: "2.5px solid #0d100d",
                    transition: "background 0.35s ease",
                    boxShadow: friendOnline
                      ? "0 0 6px rgba(61,245,127,0.6)"
                      : "none",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 16, fontWeight: 850, color: "#fff" }}>
                  {friendInfo.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: friendStatusIsLive ? 700 : 500,
                    letterSpacing: friendStatusIsLive ? "0.09em" : 0,
                    color: friendStatusIsLive ? "#86efac" : "#94a3b8",
                    marginTop: 2,
                    transition: "color 0.3s ease",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 180,
                  }}
                >
                  {friendStatusLabel}
                </div>
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#e2e8f0",
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
                    background: "#22c55e",
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
                      top: "calc(78px + var(--safe-area-top))",
                      right: 14,
                      zIndex: 10000,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {menuActions.map(([label, icon, fn, active], i) => (
                      <button
                        key={i}
                        type="button"
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") return;
                          e.preventDefault();
                          e.stopPropagation();
                          menuActionPointerHandledRef.current = Date.now();
                          runMenuAction(fn);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            Date.now() - menuActionPointerHandledRef.current <
                            500
                          ) {
                            return;
                          }
                          runMenuAction(fn);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          runMenuAction(fn);
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
                            ? "rgba(74,222,128,0.14)"
                            : "rgba(12,16,12,0.97)",
                          backdropFilter: "blur(20px)",
                          color:
                            label === "Frozen by them"
                              ? "#444"
                              : active
                                ? "#86efac"
                                : "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor:
                            label === "Frozen by them"
                              ? "not-allowed"
                              : "pointer",
                          touchAction: "manipulation",
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
            background:
              "linear-gradient(180deg, rgba(139,92,246,0.14), rgba(17,13,24,0.92))",
            border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: 20,
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
            background:
              "linear-gradient(180deg, rgba(59,130,246,0.12), rgba(10,16,26,0.92))",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 20,
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
      {currentConversation && enteredTemporaryInvites.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "8px 14px 0",
          }}
        >
          {enteredTemporaryInvites.map((invite) => {
            const isMe = invite.invitee_id === user?.id;
            return (
              <div
                key={invite.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px 8px 12px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(180deg, rgba(74,222,128,0.14), rgba(12,18,13,0.92))",
                  border: "1px solid rgba(74,222,128,0.2)",
                  color: "#d8ffe6",
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                <span>
                  {isMe
                    ? "You joined temporarily"
                    : `${invite.invitee_name} joined`}
                </span>
                {(isOriginalParticipant || isMe) && (
                  <button
                    type="button"
                    aria-label={isMe ? "Leave chat" : "Remove friend"}
                    onClick={() =>
                      void endTemporaryAccess(invite, isMe ? "left" : "removed")
                    }
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isMe ? <LogOut size={13} /> : <UserMinus size={13} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {temporaryAccessEnded && (
        <div
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "10px",
            textAlign: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Temporary chat access ended
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          paddingTop: 22,
          paddingBottom: currentMoodBlock ? 172 : 12,
        }}
        onClick={() => setMenuOpen(false)}
      >
        {!currentConversation && !loadingMessages && (
          <div
            className="app-modal-backdrop"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#94a3b8",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 16 }}>💬</div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 850,
                color: "#fff",
                marginBottom: 8,
              }}
            >
              No conversation selected
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Select a conversation to start messaging
            </div>
          </div>
        )}

        {currentConversation && !temporaryAccessEnded && (
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
                  color: "#64748b",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.035)",
                  padding: "7px 12px",
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
                    collapsed={
                      item.type === "invite" ? true : getCollapsed(index)
                    }
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
                  onOpenPhoto={openPhotoViewer}
                  onReply={setReplyFromMessage}
                  onLongPress={setMessageActionTarget}
                  showSenderName={temporaryGroupModeActive}
                />
              );
            })}

            {livePresenceSwitchTarget && (
              <SysLine
                key={`live-switch-${livePresenceSwitchTarget.userId}-${livePresenceSwitchTarget.userName}-${livePresenceSwitchTarget.isActive ? "active" : "inactive"}`}
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
                    background:
                      "linear-gradient(180deg, rgba(74,222,128,0.1), rgba(12,18,13,0.9))",
                    border: "1px solid rgba(74,222,128,0.18)",
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
                      color: "#86efac",
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
                      background: "#4ade80",
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
        {currentConversation && temporaryAccessEnded && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "28px 18px",
              textAlign: "center",
              color: "rgba(255,255,255,0.42)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            This temporary conversation is no longer available.
          </div>
        )}
      </div>

      {/* ── INPUT ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 14px calc(20px + var(--safe-area-bottom))",
          background:
            "linear-gradient(180deg, rgba(5,7,5,0.82), rgba(5,7,5,0.98))",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -20px 54px rgba(0,0,0,0.36)",
          backdropFilter: "blur(20px)",
        }}
      >
        {replyTarget && !currentMoodBlock && !frozen && (
          <div
            style={{
              position: "relative",
              margin: "0 0 9px 54px",
              padding: "9px 42px 9px 12px",
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(13,22,17,0.94), rgba(16,16,16,0.96))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 14px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
              animation: "replyCardIn 0.2s cubic-bezier(0.2, 0.84, 0.24, 1)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                background:
                  "linear-gradient(180deg, #4ade80, rgba(134,239,172,0.74))",
                boxShadow: "0 0 22px rgba(74,222,128,0.46)",
              }}
            />
            <div
              style={{
                color: "#9af5b9",
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 3,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Replying to {replyTarget.senderName}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                lineHeight: 1.32,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {replyPreviewLabel(replyTarget)}
            </div>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={() => setReplyTarget(null)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(10px)",
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
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
        ) : temporaryAccessEnded ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 15,
              padding: "14px 0",
              color: "rgba(255,255,255,0.35)",
              fontWeight: 700,
            }}
          >
            Temporary chat ended
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <label
              style={{
                width: 44,
                height: 44,
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.08)",
                background: sendingMedia
                  ? "rgba(255,255,255,0.035)"
                  : "rgba(255,255,255,0.055)",
                color: sendingMedia ? "#94a3b8" : "#86efac",
                fontSize: sendingMedia ? 13 : 24,
                fontWeight: 300,
                cursor: sendingMedia ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginBottom: 2,
                boxShadow:
                  "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
                lineHeight: 1,
                userSelect: "none",
                opacity: sendingMedia ? 0.75 : 1,
              }}
            >
              {sendingMedia ? "..." : "+"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={
                  sendingMedia ||
                  sendingMessage ||
                  !!currentMoodBlock ||
                  frozenRef.current
                }
                style={{ display: "none" }}
                onChange={async (e) => {
                  await sendPhotoFiles(e.target.files);
                  e.target.value = "";
                  /*
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
                  */
                }}
              />
            </label>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                background:
                  "linear-gradient(180deg, rgba(22,26,22,0.98), rgba(13,16,13,0.98))",
                borderRadius: 24,
                padding: "11px 14px",
                gap: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                minHeight: 46,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
                  caretColor: "#4ade80",
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
                borderRadius: 20,
                border: input.trim()
                  ? "1px solid rgba(187,247,208,0.28)"
                  : "1px solid rgba(255,255,255,0.08)",
                flexShrink: 0,
                cursor: input.trim() ? "pointer" : "default",
                background: input.trim()
                  ? "linear-gradient(135deg,#4ade80,#22c55e)"
                  : "rgba(255,255,255,0.045)",
                boxShadow: input.trim()
                  ? "0 14px 34px rgba(74,222,128,0.22)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: input.trim() ? "#000" : "#64748b",
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

      {inviteModalOpen && (
        <>
          <div
            className="app-modal-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.72)",
              backdropFilter: "blur(14px)",
              zIndex: 210,
            }}
            onClick={() => setInviteModalOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              left: 12,
              right: 12,
              bottom: "calc(12px + var(--safe-area-bottom))",
              zIndex: 211,
              maxHeight: "min(76vh, 620px)",
              background:
                "radial-gradient(circle at 50% -18%, rgba(74,222,128,0.16), transparent 42%), linear-gradient(180deg, rgba(19,23,19,0.98), rgba(9,11,9,0.99))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 30,
              boxShadow:
                "0 -28px 80px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 16px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div>
                <div style={{ color: "#fff", fontSize: 18, fontWeight: 900 }}>
                  Invite friend
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 12,
                    fontWeight: 800,
                    marginTop: 3,
                    textTransform: "uppercase",
                  }}
                >
                  Temporary access
                </div>
              </div>
              <button
                type="button"
                aria-label="Close invite friend"
                onClick={() => setInviteModalOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 14 }}>
              <div
                style={{
                  height: 46,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 14px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(180deg, rgba(22,26,22,0.98), rgba(13,16,13,0.98))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Search size={17} color="#86efac" />
                <input
                  value={inviteSearch}
                  onChange={(event) => setInviteSearch(event.target.value)}
                  placeholder="Search friends"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontSize: 15,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: "0 14px 14px",
                overflowY: "auto",
                maxHeight: "calc(min(76vh, 620px) - 128px)",
              }}
            >
              {loadingInviteFriends ? (
                <div
                  style={{
                    padding: "34px 0",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 14,
                  }}
                >
                  Loading friends...
                </div>
              ) : filteredInviteFriends.length === 0 ? (
                <div
                  style={{
                    padding: "34px 0",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 14,
                  }}
                >
                  No friends available
                </div>
              ) : (
                filteredInviteFriends.map((friend: any) => {
                  const friendId = friend.userId || friend.user_id || friend.id;
                  const name =
                    friend.displayName ||
                    friend.display_name ||
                    friend.nickname ||
                    friend.username ||
                    "Someone";
                  return (
                    <button
                      key={friendId}
                      type="button"
                      onClick={() => void sendInviteToFriend(friend)}
                      disabled={sendingInviteId === friendId}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 22,
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
                        color: "#fff",
                        marginBottom: 6,
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <Avatar
                        src={friend.avatarUrl || friend.avatar_url || ""}
                        alt={name}
                        size="md"
                        userId={friendId}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </div>
                        <div
                          style={{
                            color: "rgba(255,255,255,0.42)",
                            fontSize: 13,
                            marginTop: 2,
                          }}
                        >
                          @
                          {String(friend.username || "unknown").replace(
                            /^@/,
                            "",
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg,#4ade80,#22c55e)",
                          color: "#000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <UserPlus size={17} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* ── MOOD BLOCK MODAL — sibling of input, not nested inside it ─────── */}
      {moodBlockModalOpen && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.58)",
              backdropFilter: "blur(12px)",
              zIndex: 200,
              opacity: moodBlockModalVisible ? 1 : 0,
              transition: "opacity 0.2s ease-out",
            }}
            onClick={() => setMoodBlockModalOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              bottom: "calc(10px + var(--safe-area-bottom))",
              background:
                "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(5,5,5,0.99))",
              borderRadius: 28,
              padding: "10px 12px 12px",
              zIndex: 201,
              maxHeight: "min(78vh, 620px)",
              overflowY: "auto",
              boxShadow:
                "0 -24px 80px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.09)",
              transformOrigin: "bottom center",
              opacity: moodBlockModalVisible ? 1 : 0,
              transform: moodBlockModalVisible
                ? "translateY(0) scale(1)"
                : "translateY(34px) scale(0.98)",
              transition:
                "opacity 0.2s ease-out, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.24)",
                margin: "0 auto 12px",
              }}
            />
            <div
              style={{
                padding: "0 4px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Mood Block
                </div>
                <div
                  style={{
                    marginTop: 3,
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Pick a mood
                </div>
              </div>
              <button
                type="button"
                aria-label="Close mood block"
                onClick={() => setMoodBlockModalOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.055)",
                  color: "rgba(255,255,255,0.86)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 10,
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
              ).map(({ mood, color, label }) => {
                const theme = getMoodTheme(mood);
                return (
                  <button
                    key={mood}
                    onClick={() => {
                      handleMoodBlock(mood);
                      setMoodBlockModalOpen(false);
                    }}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      background: `linear-gradient(145deg, rgba(${color},0.12), rgba(255,255,255,0.035))`,
                      border: `1px solid rgba(${color},0.28)`,
                      borderRadius: 20,
                      padding: "14px 13px",
                      cursor: "pointer",
                      transition:
                        "transform 0.18s ease, background 0.18s ease, border-color 0.18s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minHeight: 82,
                      textAlign: "left",
                      WebkitTapHighlightColor: "transparent",
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 28px rgba(${color},0.08)`,
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.background = `linear-gradient(145deg, rgba(${color},0.18), rgba(255,255,255,0.055))`;
                      e.currentTarget.style.transform = "scale(0.975)";
                    }}
                    onTouchEnd={(e) => {
                      e.currentTarget.style.background = `linear-gradient(145deg, rgba(${color},0.12), rgba(255,255,255,0.035))`;
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: "-22px -18px auto auto",
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${theme.accentGlow}, transparent 68%)`,
                        filter: "blur(5px)",
                        opacity: 0.55,
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 30,
                        lineHeight: 1,
                        background: `rgba(${color},0.16)`,
                        border: `1px solid rgba(${color},0.22)`,
                        flexShrink: 0,
                      }}
                    >
                      {moodEmoji(mood)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          color: "#fff",
                          fontWeight: 850,
                          letterSpacing: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          marginTop: 5,
                          color: `rgb(${color})`,
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {theme.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setMoodBlockModalOpen(false)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: "15px",
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all 0.15s ease",
                minHeight: 50,
                WebkitTapHighlightColor: "transparent",
                letterSpacing: 0,
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.085)";
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.055)";
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

      {messageActionTarget && (
        <div
          onClick={() => setMessageActionTarget(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.42)",
            display: "flex",
            alignItems: "flex-end",
            padding: "0 12px calc(14px + var(--safe-area-bottom))",
            backdropFilter: "blur(8px)",
            animation: "moodBackdropIn 0.18s ease-out",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              borderRadius: 26,
              border: "1px solid rgba(255,255,255,0.1)",
              background:
                "linear-gradient(180deg, rgba(24,24,24,0.96), rgba(8,8,8,0.98))",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
              overflow: "hidden",
              transform: "translateY(0)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.22)",
                margin: "10px auto 8px",
              }}
            />
            <div
              style={{
                padding: "8px 18px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 900,
                  marginBottom: 5,
                }}
              >
                Message options
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.48)",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {summarizeMessageForReply(messageActionTarget)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setReplyFromMessage(messageActionTarget);
                setMessageActionTarget(null);
              }}
              style={{
                width: "100%",
                minHeight: 54,
                padding: "0 18px",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "transparent",
                color: "#e5e7eb",
                fontSize: 16,
                fontWeight: 750,
                textAlign: "left",
              }}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => deleteMessageForMe(messageActionTarget)}
              style={{
                width: "100%",
                minHeight: 54,
                padding: "0 18px",
                border: "none",
                borderBottom:
                  messageActionTarget.from === "me" &&
                  !messageActionTarget.optimistic
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "none",
                background: "transparent",
                color: "#f8fafc",
                fontSize: 16,
                fontWeight: 750,
                textAlign: "left",
              }}
            >
              Delete for me
            </button>
            {messageActionTarget.from === "me" &&
              !messageActionTarget.optimistic && (
                <button
                  type="button"
                  onClick={() =>
                    void deleteMessageForEveryone(messageActionTarget)
                  }
                  style={{
                    width: "100%",
                    minHeight: 54,
                    padding: "0 18px",
                    border: "none",
                    background: "transparent",
                    color: "#ff8a8a",
                    fontSize: 16,
                    fontWeight: 800,
                    textAlign: "left",
                  }}
                >
                  Delete for everyone
                </button>
              )}
            <div style={{ padding: "8px" }}>
              <button
                type="button"
                onClick={() => setMessageActionTarget(null)}
                style={{
                  width: "100%",
                  minHeight: 50,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {photoViewer && (
        <ChatPhotoViewer
          photos={photoViewer.photos}
          index={photoViewer.index}
          onIndexChange={(index) =>
            setPhotoViewer((current) =>
              current ? { ...current, index } : current,
            )
          }
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}
