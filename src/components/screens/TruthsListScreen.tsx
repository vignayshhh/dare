import React, { useEffect, useRef } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import type { TruthPost } from "../../middleware/adapters/data-adapters";
import { SwipeableTruthCard } from "./MainScreen";
import { useContentStore } from "../../stores/useContentStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";

interface TruthsListScreenProps {
  userId?: string;
  onBack: () => void;
  truthPosts?: TruthPost[];
  loading?: boolean;
  onSelectTruth?: (truth: TruthPost) => void;
  initialTruthId?: string;
}

function isUserInvolved(truth: TruthPost, userId?: string) {
  if (!userId) return true;
  if (!truth.challengerId && !truth.receiverId) return true;
  return truth.challengerId === userId || truth.receiverId === userId;
}

// Each card gets a fixed height so multiple fit in a vertical scroll list.
const CARD_HEIGHT = "78dvh";

export function TruthsListScreen({
  userId,
  onBack,
  truthPosts = [],
  loading = false,
  onSelectTruth,
  initialTruthId,
}: TruthsListScreenProps) {
  const voteOnTruth = useContentStore((s) => s.voteOnTruth);
  const recordVote = useTruthInteractionStore((s) => s.recordVote);

  const filteredTruths = [...truthPosts]
    .filter((truth) => isUserInvolved(truth, userId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to initial card on mount
  useEffect(() => {
    if (!initialTruthId || loading) return;
    const target = cardRefs.current[initialTruthId];
    const container = scrollRef.current;
    if (!target || !container) return;
    // Calculate center position to scroll card to center of viewport
    const targetTop = target.offsetTop;
    const containerHeight = container.clientHeight;
    const cardHeight = target.offsetHeight;
    const centerPosition = targetTop - (containerHeight - cardHeight) / 2;
    container.scrollTo({ top: centerPosition, behavior: "auto" });
  }, [initialTruthId, loading, filteredTruths.length]);

  const handleVoteClick = (post: TruthPost, choice: "truth" | "lie") => {
    if (userId) {
      recordVote(post.id, userId, choice.toUpperCase() as "TRUTH" | "LIE");
    }
    void voteOnTruth(post.id, choice);
  };

  const handleOpenVoteModal = (post: TruthPost) => {
    onSelectTruth?.(post);
  };

  return (
    <div
      style={{
        height: "100dvh",
        background: "#000",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 14px",
          flexShrink: 0,
          zIndex: 20,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          background: "rgba(0,0,0,0.88)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: 0,
          }}
        >
          <ArrowLeft size={20} />
          <span style={{ fontSize: "16px", fontWeight: 600 }}>Back</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={18} color="#4ade80" />
          <h1
            style={{
              color: "#fff",
              fontSize: "18px",
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Truths
          </h1>
        </div>
        <div style={{ width: "80px", textAlign: "right" }}>
          {filteredTruths.length > 0 && (
            <span
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {filteredTruths.length}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid rgba(74,222,128,0.15)",
              borderTopColor: "#4ade80",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Loading truths...
          </span>
        </div>
      ) : filteredTruths.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <MessageSquare
            size={36}
            color="rgba(255,255,255,0.12)"
            style={{ margin: "0 auto 14px" }}
          />
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "15px",
              fontWeight: 600,
              margin: "0 0 4px",
            }}
          >
            No truths yet
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.2)",
              fontSize: "13px",
              margin: 0,
            }}
          >
            Truths you take part in will appear here
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "12px 0 24px",
          }}
        >
          {filteredTruths.map((truth) => (
            <div
              key={truth.id}
              ref={(el) => {
                cardRefs.current[truth.id] = el;
              }}
              style={{
                position: "relative",
                height: CARD_HEIGHT,
                marginBottom: "16px",
              }}
            >
              {/*
                SwipeableTruthCard renders with position:absolute,inset:0.
                Wrapped here with fixed height + position:relative so it sizes
                to the wrapper and multiple cards stack vertically.
                Forcing cardIndex === currentIndex ensures the card is active
                (visible, interactive) in list mode.
              */}
              <SwipeableTruthCard
                post={truth}
                onVoteClick={handleVoteClick}
                onOpenVoteModal={handleOpenVoteModal}
                cardIndex={0}
                currentIndex={0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
