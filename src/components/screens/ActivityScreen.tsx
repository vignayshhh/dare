"use client";

import { useEffect, useCallback, useState } from "react";
import {
  Heart,
  MessageSquare,
  Swords,
  Shield,
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Share2,
} from "lucide-react";
import { useActivityStore } from "../../stores/useActivityStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import type {
  GroupedActivity,
  ActivityType,
} from "../../middleware/services/activity.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    default:
      return "Activity";
  }
}

const TYPE_META: Record<
  ActivityType,
  { Icon: any; color: string; bg: string; accent: string }
> = {
  liked_post: {
    Icon: Heart,
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.12)",
    accent: "#f43f5e",
  },
  commented_post: {
    Icon: MessageSquare,
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    accent: "#3b82f6",
  },
  dare_sent: {
    Icon: Swords,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    accent: "#f59e0b",
  },
  dare_received: {
    Icon: Shield,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    accent: "#22c55e",
  },
  shared_post: {
    Icon: Share2,
    color: "#a855f7",
    bg: "rgba(168,85,247,0.12)",
    accent: "#a855f7",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActivityCard({
  group,
  onNavigateToPost,
}: {
  group: GroupedActivity;
  onNavigateToPost?: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[group.type];
  const Icon = meta.Icon;
  const isGrouped = group.count > 1;

  const snippet = (() => {
    if (group.post) {
      const authorName =
        group.post.author?.display_name ||
        `@${group.post.author?.username || "unknown"}`;
      const postContent = group.post.content || "";
      const content =
        postContent.length > 40
          ? postContent.slice(0, 37) + "..."
          : postContent;
      return content ? `${authorName}: "${content}"` : `Post by ${authorName}`;
    }
    if (group.dare?.description) {
      return group.dare.description.length > 60
        ? group.dare.description.slice(0, 57) + "..."
        : group.dare.description;
    }
    if (group.comment_text) {
      return group.comment_text.length > 60
        ? group.comment_text.slice(0, 57) + "..."
        : group.comment_text;
    }
    return null;
  })();

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #1e1e1e",
        borderRadius: "18px",
        overflow: "hidden",
        marginBottom: "10px",
        transition: "border-color 0.2s",
        cursor: group.post && onNavigateToPost ? "pointer" : "default",
      }}
      onClick={() => {
        if (group.post && onNavigateToPost) {
          onNavigateToPost(group.post.id);
        }
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 16px",
          gap: "14px",
          cursor: isGrouped ? "pointer" : "default",
        }}
        onClick={() => isGrouped && setExpanded((v) => !v)}
      >
        {/* Icon bubble */}
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            background: meta.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: `1px solid ${meta.color}22`,
          }}
        >
          <Icon size={20} color={meta.color} strokeWidth={2.2} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "3px",
            }}
          >
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                letterSpacing: "-0.2px",
              }}
            >
              {typeLabel(group.type, group.count)}
            </span>
            {isGrouped && (
              <span
                style={{
                  background: meta.color,
                  color: "#000",
                  fontSize: "11px",
                  fontWeight: 800,
                  borderRadius: "999px",
                  padding: "1px 7px",
                  lineHeight: "18px",
                }}
              >
                {group.count}
              </span>
            )}
          </div>

          {/* Snippet or other user */}
          {snippet && !expanded && (
            <p
              style={{
                color: "#555",
                fontSize: "13px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {snippet}
            </p>
          )}
          {group.other_user && !expanded && (
            <p style={{ color: "#555", fontSize: "13px" }}>
              {group.other_user.display_name || `@${group.other_user.username}`}
            </p>
          )}
        </div>

        {/* Right side: time + expand toggle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "4px",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#444", fontSize: "12px" }}>
            {relativeTime(group.timestamp)}
          </span>
          {isGrouped &&
            (expanded ? (
              <ChevronUp size={14} color="#555" />
            ) : (
              <ChevronDown size={14} color="#555" />
            ))}
        </div>
      </div>

      {/* Expanded list */}
      {expanded && isGrouped && (
        <div
          style={{
            borderTop: "1px solid #1a1a1a",
            padding: "4px 16px 12px",
          }}
        >
          {group.items.map((item) => {
            const subSnippet =
              item.post?.content?.slice(0, 50) ||
              item.dare?.description?.slice(0, 50) ||
              item.comment_text?.slice(0, 50) ||
              (item.other_user ? `@${item.other_user.username}` : "");
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 0",
                  borderBottom: "1px solid #161616",
                }}
              >
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: meta.color,
                    flexShrink: 0,
                    marginLeft: "2px",
                  }}
                />
                <p
                  style={{
                    flex: 1,
                    color: "#666",
                    fontSize: "13px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {subSnippet || "—"}
                </p>
                <span
                  style={{ color: "#333", fontSize: "11px", flexShrink: 0 }}
                >
                  {relativeTime(item.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "24px",
          background: "rgba(74,222,128,0.08)",
          border: "1px solid rgba(74,222,128,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Zap size={32} color="#4ade80" />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: "18px" }}>
          No activity yet
        </p>
        <p style={{ color: "#444", fontSize: "14px", marginTop: "6px" }}>
          Your likes, comments, and dares from the last 24 hours will appear
          here.
        </p>
      </div>
    </div>
  );
}

// ─── Time section label ───────────────────────────────────────────────────────

function timeBucket(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3_600_000;
  if (h < 1) return "Last hour";
  if (h < 6) return "Last 6 hours";
  if (h < 12) return "This morning";
  return "Earlier today";
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface ActivityScreenProps {
  userId?: string;
  onBack: () => void;
  onNavigateToPost?: (postId: string) => void;
}

export function ActivityScreen({
  userId,
  onBack,
  onNavigateToPost,
}: ActivityScreenProps) {
  const { user } = useAuthStore();
  const targetUserId = userId || user?.id || "";
  const { items, loading, error, fetchActivity, refresh } = useActivityStore();
  const isOwnActivity = !userId || userId === user?.id;

  useEffect(() => {
    if (targetUserId) fetchActivity(targetUserId);
  }, [targetUserId, fetchActivity]);

  const handleRefresh = useCallback(() => {
    if (targetUserId) refresh(targetUserId);
  }, [targetUserId, refresh]);

  // Group by time bucket labels
  const sections: { label: string; groups: GroupedActivity[] }[] = [];
  const sectionMap = new Map<string, GroupedActivity[]>();
  for (const item of items) {
    const label = timeBucket(item.timestamp);
    if (!sectionMap.has(label)) sectionMap.set(label, []);
    sectionMap.get(label)!.push(item);
  }
  const ORDER = ["Last hour", "Last 6 hours", "This morning", "Earlier today"];
  for (const label of ORDER) {
    if (sectionMap.has(label))
      sections.push({ label, groups: sectionMap.get(label)! });
  }

  return (
    <div
      style={{
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "52px 20px 16px",
          background: "linear-gradient(180deg, #050f05 0%, #000 100%)",
          borderBottom: "1px solid #111",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={onBack}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "12px",
                background: "#111",
                border: "1px solid #222",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={18} color="#fff" />
            </button>
            <div>
              <h1
                style={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "26px",
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                }}
              >
                {isOwnActivity ? "My Activity" : "Activity"}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  marginTop: "4px",
                }}
              >
                <Clock size={11} color="#555" />
                <span style={{ color: "#555", fontSize: "12px" }}>
                  Last 24 hours
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              background: "#111",
              border: "1px solid #222",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={16}
              color="#4ade80"
              style={{
                animation: loading ? "spin 1s linear infinite" : "none",
              }}
            />
          </button>
        </div>

        {/* Summary pills */}
        {!loading && items.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "14px",
              flexWrap: "wrap",
            }}
          >
            {(
              [
                "liked_post",
                "commented_post",
                "shared_post",
                "dare_sent",
                "dare_received",
              ] as ActivityType[]
            ).map((type) => {
              const count = items
                .filter((g) => g.type === type)
                .reduce((s, g) => s + g.count, 0);
              if (count === 0) return null;
              const meta = TYPE_META[type];
              const Icon = meta.Icon;
              return (
                <div
                  key={type}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: meta.bg,
                    border: `1px solid ${meta.color}33`,
                    borderRadius: "999px",
                    padding: "4px 12px",
                  }}
                >
                  <Icon size={12} color={meta.color} />
                  <span
                    style={{
                      color: meta.color,
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
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {loading && items.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "8px 0",
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: "72px",
                  background: "#111",
                  borderRadius: "18px",
                  border: "1px solid #1a1a1a",
                  opacity: 1 - i * 0.15,
                  animation: "pulse 1.5s ease-in-out infinite",
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#f43f5e",
            }}
          >
            {error}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          sections.map(({ label, groups }) => (
            <div key={label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 4px 10px",
                }}
              >
                <span
                  style={{
                    color: "#333",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                  }}
                >
                  {label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    background: "#1a1a1a",
                  }}
                />
              </div>
              {groups.map((g) => (
                <ActivityCard
                  key={g.id}
                  group={g}
                  onNavigateToPost={onNavigateToPost}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
