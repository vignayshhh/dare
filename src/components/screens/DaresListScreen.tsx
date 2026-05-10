import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Target, X } from "lucide-react";
import type { DarePost } from "../../middleware/adapters/data-adapters";
import { DareCard } from "./MainScreen";
import { useContentStore } from "../../stores/useContentStore";

interface DaresListScreenProps {
  userId?: string;
  onBack: () => void;
  darePosts?: DarePost[];
  loading?: boolean;
  onSelectDare?: (dare: DarePost) => void;
  initialDareId?: string;
}

type FullscreenMedia = {
  url: string;
  type: "image" | "video";
  thumbnail?: string;
};

function isUserInvolved(dare: DarePost, userId?: string) {
  if (!userId) return true;
  if (!dare.challengerId && !dare.receiverId) return true;
  return dare.challengerId === userId || dare.receiverId === userId;
}

export function DaresListScreen({
  userId,
  onBack,
  darePosts = [],
  loading = false,
  onSelectDare,
  initialDareId,
}: DaresListScreenProps) {
  const voteOnDare = useContentStore((s) => s.voteOnDare);
  const [fullscreenMedia, setFullscreenMedia] =
    useState<FullscreenMedia | null>(null);
  const handleVoteClick = (dare: DarePost) => {
    onSelectDare?.(dare);
  };
  const handleVote = (dareId: string, vote: "real" | "fake") => {
    void voteOnDare(dareId, vote);
  };
  const filteredDares = [...darePosts]
    .filter((dare) => isUserInvolved(dare, userId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const reelContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);

  useEffect(() => {
    const container = reelContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const slideHeight = container.clientHeight;
      if (!slideHeight) return;
      const idx = Math.round(container.scrollTop / slideHeight);
      setActiveReelIndex(idx);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, [filteredDares.length]);

  // Scroll to the initially selected dare on mount
  useEffect(() => {
    if (loading || !initialDareId) return;
    const container = reelContainerRef.current;
    if (!container) return;
    const targetIndex = filteredDares.findIndex((d) => d.id === initialDareId);
    if (targetIndex < 0) return;
    const slideHeight = container.clientHeight;
    if (!slideHeight) return;
    container.scrollTo({ top: targetIndex * slideHeight, behavior: "auto" });
    setActiveReelIndex(targetIndex);
  }, [initialDareId, loading, filteredDares.length]);

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
          <Target size={18} color="#4ade80" />
          <h1
            style={{
              color: "#fff",
              fontSize: "18px",
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Dares
          </h1>
        </div>
        <div style={{ width: "80px", textAlign: "right" }}>
          {filteredDares.length > 0 && (
            <span
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {activeReelIndex + 1} / {filteredDares.length}
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
            Loading dares...
          </span>
        </div>
      ) : filteredDares.length === 0 ? (
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
          <Target
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
            No dares yet
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.2)",
              fontSize: "13px",
              margin: 0,
            }}
          >
            Dares you take part in will appear here
          </p>
        </div>
      ) : (
        <div
          ref={reelContainerRef}
          style={{
            flex: 1,
            overflowY: "scroll",
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
          }}
        >
          {filteredDares.map((dare, index) => (
            <div
              key={dare.id}
              data-reel-index={String(index)}
              style={{
                height: "100%",
                minHeight: "100%",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                overflow: "hidden",
              }}
            >
              <DareCard
                dare={dare}
                reelMode
                isActive={activeReelIndex === index}
                onVoteClick={handleVoteClick}
                onFullscreenMedia={setFullscreenMedia}
                onVote={handleVote}
              />
            </div>
          ))}
        </div>
      )}

      {fullscreenMedia && (
        <div
          className="app-modal-backdrop"
          onClick={() => setFullscreenMedia(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <button
            onClick={() => setFullscreenMedia(null)}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            <X size={20} />
          </button>
          {fullscreenMedia.type === "video" ? (
            <video
              src={fullscreenMedia.url}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "100%" }}
            />
          ) : (
            <img
              src={fullscreenMedia.url}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
