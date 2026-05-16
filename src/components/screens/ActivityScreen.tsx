"use client";

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Eye,
  Heart,
  HelpCircle,
  Lock,
  MessageSquare,
  RefreshCw,
  Share2,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import { useActivityStore } from "../../stores/useActivityStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useUserProfileStore } from "../../stores/useUserProfileStore";
import type {
  ActivityItem,
  ActivityType,
  GroupedActivity,
} from "../../middleware/services/activity.service";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function typeLabel(type: ActivityType, count: number): string {
  const plural = count > 1;
  switch (type) {
    case "liked_post":
      return plural ? `Liked ${count} posts` : "Liked a post";
    case "commented_post":
      return plural ? `Commented on ${count} posts` : "Left a comment";
    case "dare_sent":
      return plural ? `Sent ${count} dares` : "Sent a dare";
    case "dare_received":
      return plural ? `Received ${count} dares` : "Received a dare";
    case "shared_post":
      return plural ? `Shared ${count} posts` : "Shared a post";
    case "dedicated_story":
      return plural ? `Dedicated ${count} stories` : "Dedicated a story";
    case "truth_sent":
      return plural ? `Sent ${count} truths` : "Sent a truth";
    case "truth_received":
      return plural ? `Received ${count} truths` : "Received a truth";
    default:
      return "Activity";
  }
}

const TYPE_META: Record<
  ActivityType,
  { Icon: any; color: string; bg: string; glow: string }
> = {
  liked_post: {
    Icon: Heart,
    color: "#fb7185",
    bg: "linear-gradient(135deg, rgba(251,113,133,0.22), rgba(190,24,93,0.08))",
    glow: "rgba(251,113,133,0.34)",
  },
  commented_post: {
    Icon: MessageSquare,
    color: "#60a5fa",
    bg: "linear-gradient(135deg, rgba(96,165,250,0.22), rgba(37,99,235,0.08))",
    glow: "rgba(96,165,250,0.28)",
  },
  dare_sent: {
    Icon: Swords,
    color: "#f59e0b",
    bg: "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(180,83,9,0.08))",
    glow: "rgba(245,158,11,0.28)",
  },
  dare_received: {
    Icon: Shield,
    color: "#4ade80",
    bg: "linear-gradient(135deg, rgba(74,222,128,0.22), rgba(21,128,61,0.08))",
    glow: "rgba(74,222,128,0.28)",
  },
  shared_post: {
    Icon: Share2,
    color: "#c084fc",
    bg: "linear-gradient(135deg, rgba(192,132,252,0.22), rgba(126,34,206,0.08))",
    glow: "rgba(192,132,252,0.28)",
  },
  dedicated_story: {
    Icon: Sparkles,
    color: "#facc15",
    bg: "linear-gradient(135deg, rgba(250,204,21,0.24), rgba(74,222,128,0.08))",
    glow: "rgba(250,204,21,0.28)",
  },
  truth_sent: {
    Icon: HelpCircle,
    color: "#22d3ee",
    bg: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(8,145,178,0.08))",
    glow: "rgba(34,211,238,0.28)",
  },
  truth_received: {
    Icon: Eye,
    color: "#a78bfa",
    bg: "linear-gradient(135deg, rgba(167,139,250,0.22), rgba(109,40,217,0.08))",
    glow: "rgba(167,139,250,0.28)",
  },
};

function timeBucket(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3_600_000;
  if (h < 1) return "Last hour";
  if (h < 6) return "Last 6 hours";
  if (h < 12) return "This morning";
  return "Earlier today";
}

function truncate(value?: string, length = 80) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function extractSnippet(item: ActivityItem) {
  if (item.type === "liked_post") {
    const base = item.post?.content || item.post?.author?.display_name || "Post";
    const taps = item.like_tap_count || 1;
    return `${truncate(base, 54)}${taps > 1 ? ` • liked ${taps} times` : ""}`;
  }

  if (item.type === "commented_post") {
    return item.comment_text
      ? `"${truncate(item.comment_text, 72)}"`
      : truncate(item.post?.content || "Commented on a post", 72);
  }

  if (item.type === "dedicated_story") {
    const targetName =
      item.story?.dedicated_to?.display_name || item.other_user?.display_name;
    const targetUsername =
      item.story?.dedicated_to?.username || item.other_user?.username;
    return `Dedicated a story to ${targetName || (targetUsername ? `@${targetUsername.replace(/^@/, "")}` : "someone")}`;
  }

  if (item.truth?.question) return truncate(item.truth.question, 72);
  if (item.dare?.description) return truncate(item.dare.description, 72);
  if (item.post?.content) return truncate(item.post.content, 72);
  if (item.other_user) {
    return item.other_user.display_name || `@${item.other_user.username}`;
  }

  return "Open activity";
}

function postThumb(item: ActivityItem) {
  return item.post?.media_url || item.story?.media_url || "";
}

function itemTargetType(item: ActivityItem) {
  if (item.type === "commented_post" && item.post?.id && item.comment_id) {
    return "comment";
  }
  if (
    (item.type === "liked_post" || item.type === "shared_post") &&
    item.post?.id
  ) {
    return "post";
  }
  if (item.truth?.id) return "truth";
  if (item.dare?.id) return "dare";
  return null;
}

interface ActivityCardProps {
  group: GroupedActivity;
  index: number;
  canOpenTargets: boolean;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToComment?: (postId: string, commentId: string) => void;
  onNavigateToTruth?: (truthId: string) => void;
  onNavigateToDare?: (dareId: string) => void;
}

function ActivityCard({
  group,
  index,
  canOpenTargets,
  onNavigateToPost,
  onNavigateToComment,
  onNavigateToTruth,
  onNavigateToDare,
}: ActivityCardProps) {
  const meta = TYPE_META[group.type];
  const Icon = meta.Icon;

  const openItem = (item: ActivityItem) => {
    if (!canOpenTargets) return;
    if (item.type === "commented_post" && item.post?.id && item.comment_id) {
      onNavigateToComment?.(item.post.id, item.comment_id);
      return;
    }
    if ((item.type === "liked_post" || item.type === "shared_post") && item.post?.id) {
      onNavigateToPost?.(item.post.id);
      return;
    }
    if (item.truth?.id) {
      onNavigateToTruth?.(item.truth.id);
      return;
    }
    if (item.dare?.id) {
      onNavigateToDare?.(item.dare.id);
    }
  };

  const previewThumb = postThumb(group.items[0]);

  return (
    <div
      onClick={() => openItem(group.items[0])}
      style={{
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(17,17,17,0.98), rgba(8,8,8,0.98))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "28px",
        overflow: "hidden",
        marginBottom: "14px",
        boxShadow: `0 18px 40px ${meta.glow}10, inset 0 1px 0 rgba(255,255,255,0.05)`,
        cursor: canOpenTargets ? "pointer" : "default",
        transition:
          "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 220ms ease, box-shadow 220ms ease",
        animation: `cardRise 460ms cubic-bezier(0.22, 1, 0.36, 1) both`,
        animationDelay: `${index * 45}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px) scale(1.01)";
        e.currentTarget.style.borderColor = `${meta.color}30`;
        e.currentTarget.style.boxShadow = `0 24px 44px ${meta.glow}16, inset 0 1px 0 rgba(255,255,255,0.06)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow = `0 18px 40px ${meta.glow}10, inset 0 1px 0 rgba(255,255,255,0.05)`;
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 auto auto 0",
          width: "100%",
          height: "1px",
          background: `linear-gradient(90deg, ${meta.color}00, ${meta.color}aa, ${meta.color}00)`,
          opacity: 0.85,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "-22px",
          top: "-24px",
          width: "96px",
          height: "96px",
          borderRadius: "999px",
          background: meta.glow,
          opacity: 0.18,
          filter: "blur(28px)",
          animation: "blobDrift 7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-18%",
          bottom: "-30%",
          width: "46%",
          height: "66%",
          borderRadius: "999px",
          background: `${meta.color}14`,
          filter: "blur(34px)",
          animation: "ambientWave 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "-20%",
          width: "32%",
          background:
            "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.08), rgba(255,255,255,0))",
          transform: "skewX(-18deg)",
          pointerEvents: "none",
          animation: `sheenSweep 7.4s ease-in-out infinite`,
          animationDelay: `${index * 0.22}s`,
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "18px",
          display: "flex",
          gap: "14px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            borderRadius: "18px",
            background: meta.bg,
            border: `1px solid ${meta.color}2c`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 0 0 1px ${meta.glow}25 inset, 0 10px 24px ${meta.glow}12`,
            animation: "iconFloat 4.6s ease-in-out infinite",
          }}
        >
          <Icon size={24} color={meta.color} strokeWidth={2.25} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "6px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: "16px",
                letterSpacing: "-0.02em",
              }}
            >
              {typeLabel(group.type, group.count)}
            </span>
            <span
              style={{
                color: meta.color,
                background: `${meta.color}18`,
                border: `1px solid ${meta.color}2b`,
                borderRadius: "999px",
                padding: "3px 9px",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {relativeTime(group.timestamp)}
            </span>
          </div>

          <p
            style={{
              color: "rgba(255,255,255,0.74)",
              fontSize: "14px",
              lineHeight: 1.55,
              marginBottom: "10px",
            }}
          >
            {extractSnippet(group.items[0])}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {group.type === "liked_post" && (
              <span
                style={{
                  color: "#fecdd3",
                  background: "rgba(251,113,133,0.12)",
                  border: "1px solid rgba(251,113,133,0.18)",
                  borderRadius: "999px",
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {(group.items[0].like_tap_count || 1) > 1
                  ? `${group.items[0].like_tap_count} taps on one photo`
                  : "Liked once"}
              </span>
            )}
            {!canOpenTargets && itemTargetType(group.items[0]) && (
              <span
                style={{
                  color: "rgba(255,255,255,0.56)",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "999px",
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Lock size={12} />
                Friends can open
              </span>
            )}
          </div>
        </div>

        {previewThumb ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openItem(group.items[0]);
            }}
            disabled={!canOpenTargets}
            style={{
              width: "78px",
              height: "104px",
              flexShrink: 0,
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "#0b0b0b",
              padding: 0,
              cursor: canOpenTargets ? "pointer" : "default",
              position: "relative",
              opacity: canOpenTargets ? 1 : 0.72,
              boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
            }}
          >
            <img
              src={previewThumb}
              alt="Activity preview"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scale(1.04)",
                animation: "mediaFloat 6s ease-in-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.46) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "8px",
                bottom: "8px",
                borderRadius: "999px",
                padding: "4px 8px",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              View
            </div>
          </button>
        ) : (
          <div
            style={{
              width: "42px",
              height: "42px",
              flexShrink: 0,
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              color: "#a3a3a3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <ChevronRight
              size={18}
              style={{ animation: "nudgeArrow 1.8s ease-in-out infinite" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "78px 28px",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "84px",
          height: "84px",
          borderRadius: "28px",
          background:
            "linear-gradient(135deg, rgba(74,222,128,0.16), rgba(34,197,94,0.04))",
          border: "1px solid rgba(74,222,128,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 42px rgba(74,222,128,0.12)",
        }}
      >
        <Zap size={34} color="#4ade80" />
      </div>
      <div style={{ textAlign: "center", maxWidth: "340px" }}>
        <p style={{ color: "#fff", fontWeight: 800, fontSize: "20px" }}>
          No activity yet
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            marginTop: "8px",
            lineHeight: 1.6,
          }}
        >
          Likes, comments, shared posts, truths, and dares from the last 24
          hours will show up here.
        </p>
      </div>
    </div>
  );
}

interface ActivityScreenProps {
  userId?: string;
  onBack: () => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToComment?: (postId: string, commentId: string) => void;
  onNavigateToTruth?: (truthId: string) => void;
  onNavigateToDare?: (dareId: string) => void;
}

export function ActivityScreen({
  userId,
  onBack,
  onNavigateToPost,
  onNavigateToComment,
  onNavigateToTruth,
  onNavigateToDare,
}: ActivityScreenProps) {
  const { user } = useAuthStore();
  const { isFriend } = useUserProfileStore();
  const targetUserId = userId || user?.id || "";
  const { items, loading, error, fetchActivity, refresh } = useActivityStore();
  const isOwnActivity = !userId || userId === user?.id;
  const canOpenTargets = isOwnActivity || isFriend;

  useEffect(() => {
    if (targetUserId) void fetchActivity(targetUserId);
  }, [targetUserId, fetchActivity]);

  const sections = useMemo(() => {
    const next: { label: string; groups: GroupedActivity[] }[] = [];
    const sectionMap = new Map<string, GroupedActivity[]>();
    for (const item of items) {
      const label = timeBucket(item.timestamp);
      if (!sectionMap.has(label)) sectionMap.set(label, []);
      sectionMap.get(label)!.push(item);
    }
    const order = ["Last hour", "Last 6 hours", "This morning", "Earlier today"];
    for (const label of order) {
      if (sectionMap.has(label)) {
        next.push({ label, groups: sectionMap.get(label)! });
      }
    }
    return next;
  }, [items]);

  const totals = useMemo(() => {
    const base: Record<ActivityType, number> = {
      liked_post: 0,
      commented_post: 0,
      shared_post: 0,
      dedicated_story: 0,
      dare_sent: 0,
      dare_received: 0,
      truth_sent: 0,
      truth_received: 0,
    };

    items.forEach((group) => {
      base[group.type] += group.count;
    });

    const photoActions = items.reduce(
      (sum, group) =>
        sum +
        group.items.reduce((inner, item) => inner + (item.like_tap_count || 0), 0),
      0,
    );

    return {
      base,
      photoActions,
      highlights:
        base.liked_post +
        base.commented_post +
        base.shared_post +
        base.dedicated_story,
    };
  }, [items]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(74,222,128,0.14), transparent 24%), #030303",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "calc(18px + var(--safe-area-top)) 16px 16px",
          background:
            "linear-gradient(180deg, rgba(3,3,3,0.98) 0%, rgba(3,3,3,0.92) 78%, rgba(3,3,3,0.82) 100%)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
            paddingTop: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                onBack();
              }}
              style={{
                position: "relative",
                zIndex: 3,
                width: "42px",
                height: "42px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={18} color="#fff" />
            </button>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <h1
                  style={{
                    color: "#fff",
                    fontSize: "28px",
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {isOwnActivity ? "My Activity" : "User Activity"}
                </h1>
                <Sparkles
                  size={16}
                  color="#4ade80"
                  style={{ animation: "floatSpark 2.8s ease-in-out infinite" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock3 size={12} color="rgba(255,255,255,0.4)" />
                <span style={{ color: "rgba(255,255,255,0.48)", fontSize: "12px" }}>
                  Last 24 hours
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => targetUserId && void refresh(targetUserId)}
            disabled={loading}
            style={{
              position: "relative",
              zIndex: 3,
              width: "42px",
              height: "42px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw
              size={17}
              color="#4ade80"
              style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
            />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 96px" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "30px",
            padding: "20px",
            background:
              "linear-gradient(135deg, rgba(18,18,18,0.98), rgba(7,7,7,0.98))",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow:
              "0 22px 50px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05)",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: "1px",
              background:
                "linear-gradient(90deg, rgba(74,222,128,0), rgba(74,222,128,0.85), rgba(74,222,128,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "-14px",
              top: "-12px",
              width: "120px",
              height: "120px",
              borderRadius: "999px",
              background: "rgba(74,222,128,0.12)",
              filter: "blur(28px)",
              animation: "heroGlow 4.8s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "-10%",
              bottom: "-22%",
              width: "46%",
              height: "58%",
              borderRadius: "999px",
              background: "rgba(96,165,250,0.08)",
              filter: "blur(38px)",
              animation: "ambientWave 10s ease-in-out infinite reverse",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            <div
              style={{
                borderRadius: "20px",
                padding: "14px",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                animation: "statFloat 5.6s ease-in-out infinite",
              }}
            >
              <div style={{ color: "#fff", fontSize: "22px", fontWeight: 900 }}>
                {items.length}
              </div>
              <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "12px", marginTop: "4px" }}>
                Activity cards
              </div>
            </div>
            <div
              style={{
                borderRadius: "20px",
                padding: "14px",
                background:
                  "linear-gradient(180deg, rgba(74,222,128,0.12), rgba(74,222,128,0.05))",
                border: "1px solid rgba(74,222,128,0.16)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                animation: "statFloat 5.6s ease-in-out infinite",
                animationDelay: "0.45s",
              }}
            >
              <div style={{ color: "#4ade80", fontSize: "22px", fontWeight: 900 }}>
                {totals.photoActions}
              </div>
              <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "12px", marginTop: "4px" }}>
                Photo likes tapped
              </div>
            </div>
            <div
              style={{
                borderRadius: "20px",
                padding: "14px",
                background:
                  "linear-gradient(180deg, rgba(96,165,250,0.12), rgba(96,165,250,0.05))",
                border: "1px solid rgba(96,165,250,0.16)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                animation: "statFloat 5.6s ease-in-out infinite",
                animationDelay: "0.9s",
              }}
            >
              <div style={{ color: "#93c5fd", fontSize: "22px", fontWeight: 900 }}>
                {totals.highlights}
              </div>
              <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "12px", marginTop: "4px" }}>
                Post moments
              </div>
            </div>
          </div>

          {!isOwnActivity && !canOpenTargets && (
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "rgba(255,255,255,0.6)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <Lock size={14} />
              Open links unlock once you are friends.
            </div>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {(Object.keys(TYPE_META) as ActivityType[]).map((type) => {
              const count = totals.base[type];
              if (!count) return null;
              const meta = TYPE_META[type];
              const Icon = meta.Icon;
              return (
                <div
                  key={type}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "999px",
                    padding: "7px 11px",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <Icon size={12} color={meta.color} />
                  <span
                    style={{
                      color: "#f5f5f5",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                style={{
                  height: "144px",
                  borderRadius: "24px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animation: "pulse 1.4s ease-in-out infinite",
                  animationDelay: `${index * 0.12}s`,
                }}
              />
            ))}
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: "center",
              color: "#fb7185",
              padding: "48px 18px",
              borderRadius: "24px",
              border: "1px solid rgba(251,113,133,0.16)",
              background: "rgba(251,113,133,0.06)",
            }}
          >
            {error}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          sections.map(({ label, groups }) => (
            <div key={label} style={{ marginBottom: "18px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "6px 2px 10px",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "rgba(74,222,128,0.9)",
                    boxShadow: "0 0 12px rgba(74,222,128,0.7)",
                    animation: "sectionPulse 1.8s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.34)",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    background: "linear-gradient(90deg, rgba(255,255,255,0.08), transparent)",
                  }}
                />
              </div>

              {groups.map((group, index) => (
                <ActivityCard
                  key={group.id}
                  group={group}
                  index={index}
                  canOpenTargets={canOpenTargets}
                  onNavigateToPost={onNavigateToPost}
                  onNavigateToComment={onNavigateToComment}
                  onNavigateToTruth={onNavigateToTruth}
                  onNavigateToDare={onNavigateToDare}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.9; }
        }
        @keyframes heroGlow {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes floatSpark {
          0%, 100% { transform: translateY(0px); opacity: 0.8; }
          50% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes iconFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes nudgeArrow {
          0%, 100% { transform: translateX(0px); opacity: 0.72; }
          50% { transform: translateX(2px); opacity: 1; }
        }
        @keyframes blobDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-6px, 5px, 0) scale(1.08); }
        }
        @keyframes cardRise {
          from { opacity: 0; transform: translateY(16px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sheenSweep {
          0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
          16% { opacity: 0.18; }
          44% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
          100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
        }
        @keyframes statFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes sectionPulse {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes ambientWave {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.7; }
          50% { transform: translate3d(8px, -8px, 0) scale(1.08); opacity: 1; }
        }
        @keyframes mediaFloat {
          0%, 100% { transform: scale(1.04) translateY(0px); }
          50% { transform: scale(1.08) translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
