"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, MessageCircle, Play, Send, Share2, X } from "lucide-react";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  guestDareCards,
  guestFeedPosts,
  guestTruthCards,
  guestUsers,
  type GuestUserProfile,
} from "../../mock/guestModeData";
import "@/styles/design-system.css";

type TruthPost = {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string };
  receiver: { nickname: string; avatar: string };
  question: string;
  state: "APPROVED";
  createdAt: string;
  answer?: string;
  poll?: {
    question: string;
    options: string[];
    votes: Record<string, number>;
    totalVotes: number;
  };
};

type DarePost = {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string };
  receiver: { nickname: string; avatar: string };
  description: string;
  proof?: { type: "image" | "video"; url: string; thumbnail?: string };
  state: "FRIENDS_VALIDATION";
  createdAt: string;
  votes?: {
    real: number;
    fake: number;
    userVote?: "real" | "fake";
    total?: number;
  };
};

type MockComment = {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
  likes: number;
};

function getProfile(userId?: string): GuestUserProfile {
  return guestUsers.find((user) => user.id === userId) ?? guestUsers[0];
}

function getPostCreatedAtMs(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function rankDeckByVoteState<T extends { id: string; createdAt: string }>(
  posts: T[],
  hasUserVote: (postId: string) => boolean,
): T[] {
  const newestFirst = [...posts].sort(
    (a, b) => getPostCreatedAtMs(b.createdAt) - getPostCreatedAtMs(a.createdAt),
  );
  const unvotedPosts = newestFirst.filter((post) => !hasUserVote(post.id));
  if (unvotedPosts.length === 0) return newestFirst;
  const votedPosts = newestFirst.filter((post) => hasUserVote(post.id));
  return [...unvotedPosts, ...votedPosts];
}

function buildTruthPosts(): TruthPost[] {
  return guestTruthCards
    .filter((card) => card.answer?.trim())
    .map((card) => {
      const challenger = getProfile(card.challengerId);
      const receiver = getProfile(card.receiverId);
      return {
        id: card.id,
        challengerId: card.challengerId,
        receiverId: card.receiverId,
        challenger: {
          nickname: challenger.name,
          avatar: challenger.avatarUrl,
        },
        receiver: {
          nickname: receiver.name,
          avatar: receiver.avatarUrl,
        },
        question: card.question,
        state: "APPROVED",
        createdAt: card.createdAt,
        answer: card.answer,
        poll: {
          question: "What do you think?",
          options: ["Truth", "Lie"],
          votes: {
            Truth: card.truthVotes,
            Lie: card.lieVotes,
          },
          totalVotes: card.truthVotes + card.lieVotes,
        },
      };
    });
}

function buildDarePosts(): DarePost[] {
  return guestDareCards.map((card, index) => {
    const challenger = getProfile(card.challengerId);
    const receiver = getProfile(card.receiverId);
    const proofUrl = guestFeedPosts[index % guestFeedPosts.length]?.imageUrl;
    return {
      id: card.id,
      challengerId: card.challengerId,
      receiverId: card.receiverId,
      challenger: {
        nickname: challenger.name,
        avatar: challenger.avatarUrl,
      },
      receiver: {
        nickname: receiver.name,
        avatar: receiver.avatarUrl,
      },
      description: card.description,
      proof: proofUrl
        ? {
            type: "image",
            url: proofUrl,
            thumbnail: proofUrl,
          }
        : undefined,
      state: "FRIENDS_VALIDATION",
      createdAt: card.createdAt,
      votes: {
        real: card.realVotes ?? 0,
        fake: card.fakeVotes ?? 0,
        total: (card.realVotes ?? 0) + (card.fakeVotes ?? 0),
      },
    };
  });
}

function getStoredVote(
  key: string,
): "real" | "fake" | "truth" | "lie" | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  return value === "real" || value === "fake" || value === "truth" || value === "lie"
    ? value
    : null;
}

function setStoredVote(key: string, value: "real" | "fake" | "truth" | "lie") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function PostAvatar({
  src,
  name,
  size,
  style,
}: {
  src?: string;
  name?: string;
  size: number;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={src || ""}
      alt={name || ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        display: "block",
        ...style,
      }}
    />
  );
}

function buildMockComments(seedId: string): MockComment[] {
  const baseProfiles = guestUsers.filter((user) => user.id !== guestUsers[0]?.id);
  return baseProfiles.slice(0, 3).map((user, index) => ({
    id: `${seedId}-comment-${index}`,
    userId: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    text:
      index === 0
        ? "This feels exactly like the kind of chaos Dare would start."
        : index === 1
          ? "Mock UI only, but the presentation looks clean already."
          : "Would vote again just for the reactions alone.",
    createdAt: guestFeedPosts[index % guestFeedPosts.length]?.createdAt ?? new Date().toISOString(),
    likes: 4 + index * 3,
  }));
}

function buildMockVoters(seedId: string) {
  return guestUsers
    .filter((user) => user.id !== guestUsers[0]?.id)
    .slice(0, 5)
    .map((user, index) => ({
      id: `${seedId}-vote-${index}`,
      userId: user.id,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      count: 6 - index,
    }));
}

function DoubleTapLike({ trigger }: { trigger: number }) {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>(
    [],
  );
  useEffect(() => {
    if (trigger === 0) return;
    const id = Date.now();
    setHearts((items) => [
      ...items,
      { id, x: 40 + Math.random() * 20, y: 40 + Math.random() * 20 },
    ]);
    const timer = window.setTimeout(
      () => setHearts((items) => items.filter((item) => item.id !== id)),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [trigger]);

  return (
    <>
      <style>{`@keyframes heartPop { 0%{transform:translate(-50%,-50%) scale(0);opacity:0} 20%{transform:translate(-50%,-50%) scale(1.4);opacity:1} 60%{transform:translate(-50%,-50%) scale(1.1);opacity:1} 100%{transform:translate(-50%,-50%) scale(1.3);opacity:0} }`}</style>
      {hearts.map((heart) => (
        <div
          key={heart.id}
          style={{
            position: "absolute",
            left: `${heart.x}%`,
            top: `${heart.y}%`,
            zIndex: 50,
            animation: "heartPop 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          <Heart
            size={80}
            fill="#ff4d6d"
            color="#ff4d6d"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,77,109,0.6))" }}
          />
        </div>
      ))}
    </>
  );
}

const AnimatedDareCapsule = React.memo(function AnimatedDareCapsule({
  cardId,
  challenger,
  receiver,
  description,
  isActive,
  onNavigateToProfile,
  challengerId,
  receiverId,
}: {
  cardId: string;
  challenger: DarePost["challenger"];
  receiver: DarePost["receiver"];
  description: string;
  isActive: boolean;
  onNavigateToProfile?: (userId: string) => void;
  challengerId?: string;
  receiverId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showChallengerName, setShowChallengerName] = useState(false);
  const [showReceiver, setShowReceiver] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [fading, setFading] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!isActive) {
      setShowAll(false);
      setExpanded(false);
      setShowChallengerName(false);
      setShowReceiver(false);
      setFading(false);
      setShowDescription(false);
      return;
    }

    setShowAll(false);
    setExpanded(false);
    setShowChallengerName(false);
    setShowReceiver(false);
    setFading(false);
    setShowDescription(false);

    const t0 = setTimeout(() => setShowAll(true), 200);
    const t1 = setTimeout(() => setExpanded(true), 500);
    const t2 = setTimeout(() => setShowChallengerName(true), 200);
    const t3 = setTimeout(() => setShowReceiver(true), 1500);
    const t4 = setTimeout(() => setShowDescription(true), 3500);
    const t5 = setTimeout(() => setFading(true), 12000);
    const t6 = setTimeout(() => setShowAll(false), 12500);
    timers.current.push(t0, t1, t2, t3, t4, t5, t6);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [cardId, isActive]);

  const collapsedWidth = 64;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: showAll && !fading ? 1 : 0,
        transition: fading ? "opacity 1.4s ease" : "opacity 0.6s ease",
        willChange: "opacity, transform",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.10))",
          borderRadius: "999px",
          height: "64px",
          padding: expanded ? "0 18px 0 8px" : "0 8px",
          backdropFilter: "blur(24px)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.20), 0 0 0 1px rgba(255,255,255,0.08)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          maxWidth: expanded ? "420px" : `${collapsedWidth}px`,
          width: expanded ? "max-content" : `${collapsedWidth}px`,
          transition:
            "max-width 2s cubic-bezier(0.4, 0, 0.2, 1), width 2s cubic-bezier(0.4, 0, 0.2, 1), padding 2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <PostAvatar
          src={challenger.avatar}
          name={challenger.nickname}
          size={48}
          style={{
            minWidth: 48,
            border: "2px solid rgba(255,255,255,0.3)",
            opacity: showChallengerName ? 1 : 0,
            transition: "opacity 1.2s ease",
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateToProfile && challengerId) {
              onNavigateToProfile(challengerId);
            }
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            opacity: showChallengerName ? 1 : 0,
            transition: "opacity 1.2s ease",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
            cursor: onNavigateToProfile ? "pointer" : "default",
          }}
        >
          {challenger.nickname.split(" ")[0]}
        </button>
        <span
          style={{
            color: "#4ade80",
            fontWeight: 900,
            fontSize: 16,
            flexShrink: 0,
            opacity: showReceiver ? 1 : 0,
            transition: "opacity 1.2s ease",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1,
            textShadow:
              "0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(74,222,128,0.5)",
          }}
        >
          DARED
        </span>
        <PostAvatar
          src={receiver.avatar}
          name={receiver.nickname}
          size={48}
          style={{
            minWidth: 48,
            border: "2px solid rgba(255,255,255,0.3)",
            opacity: showReceiver ? 1 : 0,
            transition: "opacity 1.2s ease 0.3s",
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateToProfile && receiverId) {
              onNavigateToProfile(receiverId);
            }
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            opacity: showReceiver ? 1 : 0,
            transition: "opacity 1.2s ease 0.5s",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
            cursor: onNavigateToProfile ? "pointer" : "default",
          }}
        >
          {receiver.nickname.split(" ")[0]}
        </button>
      </div>
      <p
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
          textAlign: "center",
          textShadow: "0 2px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
          margin: "12px 0 0",
          padding: "0 32px",
          opacity: showDescription ? 1 : 0,
          transform: showDescription ? "translateY(0)" : "translateY(18px)",
          transition:
            "opacity 1.4s cubic-bezier(0.25,0.46,0.45,0.94), transform 1.4s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      >
        {description}
      </p>
    </div>
  );
});

function GuestDareCard({
  dare,
  reelMode,
  isActive,
  onVoteClick,
  onFullscreenMedia,
  onOpenComments,
  onOpenShare,
  onNavigateToProfile,
}: {
  dare: DarePost;
  reelMode?: boolean;
  isActive?: boolean;
  onVoteClick: (dare: DarePost) => void;
  onFullscreenMedia: (media: {
    url: string;
    type: "image" | "video";
    thumbnail?: string;
  }) => void;
  onOpenComments?: (dare: DarePost) => void;
  onOpenShare?: (dare: DarePost) => void;
  onNavigateToProfile?: (userId: string) => void;
}) {
  const storageKey = `guest_main_dare_vote:${dare.id}`;
  const priorVote = getStoredVote(storageKey) as "real" | "fake" | null;
  const [vote, setVote] = useState<"real" | "fake" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const [likeTrigger, setLikeTrigger] = useState(0);
  const [buttonsVisible, setButtonsVisible] = useState(priorVote ? true : false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const btnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipVoteUntilRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);
  const realViewCount = dare.votes?.total ?? 0;
  const realCommentCount = 0;

  useEffect(() => {
    if (btnTimerRef.current) clearTimeout(btnTimerRef.current);
    if (priorVote) {
      setButtonsVisible(true);
      setTimerRunning(false);
      return;
    }
    if (isActive) {
      setButtonsVisible(false);
      setTimerRunning(false);
      setTimerKey((key) => key + 1);
      const tStart = setTimeout(() => setTimerRunning(true), 50);
      btnTimerRef.current = setTimeout(() => {
        setButtonsVisible(true);
        setTimerRunning(false);
      }, 10000);
      return () => clearTimeout(tStart);
    }
    setButtonsVisible(false);
    setTimerRunning(false);
  }, [isActive, priorVote]);

  const handleVote = (choice: "real" | "fake") => {
    if (phase !== "idle" || exiting || Date.now() < skipVoteUntilRef.current)
      return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (!vote) return;
    setStoredVote(storageKey, vote);
    setPhase("voted");
    onVoteClick(dare);
  };

  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300 && dare.proof) {
      setLikeTrigger((value) => value + 1);
      onFullscreenMedia({
        url: dare.proof.url,
        type: dare.proof.type,
        thumbnail: dare.proof.thumbnail,
      });
    }
    lastTapRef.current = now;
  };

  const hasVoted = phase === "voted" && vote !== null;
  if (!reelMode) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#0a0a0a",
      }}
    >
      <DoubleTapLike trigger={likeTrigger} />
      {dare.proof && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }} onClick={handleMediaTap}>
          <img
            src={dare.proof.url}
            alt="Dare proof"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "35%",
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "45%",
              background:
                "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)",
            }}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: "10px",
          left: 0,
          right: 0,
          zIndex: 1,
          padding: "14px 14px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <AnimatedDareCapsule
          cardId={dare.id}
          challenger={dare.challenger}
          receiver={dare.receiver}
          description={dare.description}
          isActive={!!isActive}
          onNavigateToProfile={onNavigateToProfile}
          challengerId={dare.challengerId}
          receiverId={dare.receiverId}
        />
      </div>

      <div
        style={{
          position: "absolute",
          right: 14,
          bottom: "calc(200px + var(--safe-area-bottom))",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
          <Eye
            size={28}
            color="rgba(255,255,255,0.55)"
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "12px",
              fontWeight: 700,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {realViewCount}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "5px",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments?.(dare);
          }}
        >
          <MessageCircle
            size={28}
            color="rgba(255,255,255,0.55)"
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "12px",
              fontWeight: 700,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {realCommentCount}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "5px",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenShare?.(dare);
          }}
        >
          <Share2
            size={28}
            color="rgba(255,255,255,0.55)"
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "12px",
              fontWeight: 700,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            Share
          </span>
        </div>
      </div>

      {!hasVoted && !buttonsVisible && phase === "idle" && (
        <div
          onClick={(e) => {
            skipVoteUntilRef.current = Date.now() + 400;
            const container = e.currentTarget as HTMLElement;
            const rect = container.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const remaining = Math.round((1 - pct) * 10);

            if (btnTimerRef.current) clearTimeout(btnTimerRef.current);
            if (remaining <= 0) {
              setButtonsVisible(true);
              setTimerRunning(false);
              return;
            }

            setTimerRunning(false);
            requestAnimationFrame(() => {
              const bar = container.querySelector("[data-progress-bar]") as HTMLElement | null;
              if (bar) {
                bar.style.transition = "none";
                bar.style.width = `${pct * 100}%`;
                bar.getBoundingClientRect();
                bar.style.transition = `width ${remaining}s linear`;
                bar.style.width = "100%";
              }
              setTimerRunning(true);
              btnTimerRef.current = setTimeout(() => {
                setButtonsVisible(true);
                setTimerRunning(false);
              }, remaining * 1000);
            });
          }}
          style={{
            position: "absolute",
            top: "calc(100% - 100px - var(--safe-area-bottom))",
            left: "14px",
            right: "14px",
            zIndex: 2,
            height: "5px",
            borderRadius: "99px",
            background: "rgba(255,255,255,0.10)",
            overflow: "hidden",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          <div
            data-progress-bar
            key={timerKey}
            style={{
              height: "100%",
              borderRadius: "99px",
              background: "linear-gradient(90deg, rgba(74,222,128,0.5), #4ade80)",
              width: timerRunning ? "100%" : "0%",
              transition: timerRunning ? "width 10s linear" : "none",
            }}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1,
          padding: "0 14px calc(95px + var(--safe-area-bottom))",
        }}
      >
        <div
          style={{
            opacity: buttonsVisible || hasVoted || phase === "confirming" ? 1 : 0,
            transform:
              buttonsVisible || hasVoted || phase === "confirming"
                ? "translateY(0)"
                : "translateY(16px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
            pointerEvents:
              buttonsVisible || hasVoted || phase === "confirming"
                ? "auto"
                : "none",
          }}
        >
          {hasVoted ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => onVoteClick(dare)}
                style={{
                  width: "80%",
                  padding: "16px",
                  borderRadius: "16px",
                  border: vote === "fake" ? "1px solid rgba(255,255,255,0.2)" : "none",
                  background: vote === "real" ? "#4ade80" : "rgba(255,255,255,0.1)",
                  color: vote === "real" ? "#000" : "rgba(255,255,255,0.9)",
                  fontWeight: 800,
                  fontSize: "18px",
                  cursor: "pointer",
                  textAlign: "center",
                  backdropFilter: "blur(8px)",
                }}
              >
                {vote === "real" ? "You think this is Real" : "You think this is Fake"}
              </button>
            </div>
          ) : phase === "idle" ? (
            <div
              style={{
                display: "flex",
                gap: "12px",
                opacity: exiting ? 0 : 1,
                transform: exiting ? "scale(0.93) translateY(5px)" : "scale(1) translateY(0)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
              }}
            >
              <button
                className="dare-real-btn"
                onClick={() => handleVote("real")}
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: "16px",
                  border: "none",
                  background: "#4ade80",
                  color: "#000",
                  fontWeight: 800,
                  fontSize: "18px",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: "btnPulseReal 6s ease-in-out infinite",
                }}
              >
                Real
              </button>
              <button
                className="dare-fake-btn"
                onClick={() => handleVote("fake")}
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 800,
                  fontSize: "18px",
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: "btnPulseFake 6s ease-in-out infinite",
                }}
              >
                Fake
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleConfirm}
                style={{
                  width: "80%",
                  padding: "16px",
                  borderRadius: "16px",
                  border: vote === "fake" ? "1px solid rgba(255,255,255,0.2)" : "none",
                  background: vote === "real" ? "#4ade80" : "rgba(255,255,255,0.1)",
                  color: vote === "real" ? "#000" : "rgba(255,255,255,0.9)",
                  fontWeight: 800,
                  fontSize: "18px",
                  cursor: "pointer",
                  textAlign: "center",
                  backdropFilter: "blur(8px)",
                  animation: "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                }}
              >
                {vote === "real" ? "You think this is Real" : "You think this is Fake"}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
        .dare-real-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .dare-real-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
        .dare-fake-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .dare-fake-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
        @keyframes btnPulseReal { 0%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 15%{box-shadow:0 0 22px 6px rgba(74,222,128,0.4);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} }
        @keyframes btnPulseFake { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
      `}</style>
    </div>
  );
}

function GuestSwipeableTruthCard({
  post,
  onVoteClick,
  onOpenVoteModal,
  cardIndex,
  currentIndex,
  isDragging = false,
  onNavigateToProfile,
}: {
  post: TruthPost;
  onVoteClick: (post: TruthPost, choice: "truth" | "lie") => void;
  onOpenVoteModal: (post: TruthPost, tab: "truth" | "lie" | "comments") => void;
  cardIndex: number;
  currentIndex: number;
  isDragging?: boolean;
  onNavigateToProfile?: (userId: string) => void;
}) {
  const storageKey = `guest_main_truth_vote:${post.id}`;
  const priorVote = getStoredVote(storageKey) as "truth" | "lie" | null;
  const [vote, setVote] = useState<"truth" | "lie" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const [exiting, setExiting] = useState(false);
  const isActive = cardIndex === currentIndex;

  const handleVote = (choice: "truth" | "lie") => {
    if (phase !== "idle" || exiting) return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (!vote) return;
    setStoredVote(storageKey, vote);
    onVoteClick(post, vote);
    setPhase("voted");
  };

  const handleOpenVotedStateModal = () => {
    if (vote) onOpenVoteModal(post, vote);
  };

  const offset = cardIndex - currentIndex;
  const translateY = offset === 0 ? "0%" : offset < 0 ? "-105%" : "105%";
  const isNearby = Math.abs(offset) <= 1;
  const opacity = isNearby ? 1 : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate3d(0, calc(${translateY} + var(--truth-drag-y, 0px)), 0)`,
        opacity,
        transition: isDragging
          ? "none"
          : "transform 0.34s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.2s ease-out",
        pointerEvents: isActive ? "auto" : "none",
        willChange: isNearby ? "transform, opacity" : "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        perspective: 1000,
        contain: "layout paint style",
        padding: "10px 16px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes truthGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.06); }
        }
        @keyframes expandBtn { from { width:50%;opacity:0.5;transform:scale(0.93);} to {width:80%;opacity:1;transform:scale(1);} }
        .truth-vote-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .truth-vote-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
        .lie-vote-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .lie-vote-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
        @keyframes btnPulseTruth {
          0%{box-shadow:0 6px 24px rgba(74,222,128,0.3);opacity:0.88}
          18%{box-shadow:0 6px 36px rgba(74,222,128,0.65);opacity:1}
          40%{box-shadow:0 6px 24px rgba(74,222,128,0.3);opacity:0.88}
          100%{box-shadow:0 6px 24px rgba(74,222,128,0.3);opacity:0.88}
        }
        @keyframes btnPulseLie {
          0%{opacity:0.72} 58%{opacity:0.72}
          74%{box-shadow:0 0 28px 8px rgba(255,100,100,0.22);opacity:1}
          90%{opacity:0.72} 100%{opacity:0.72}
        }
        @keyframes questionReveal {
          from { opacity:0; transform: translateY(10px); }
          to { opacity:1; transform: translateY(0); }
        }
        .truth-scroll::-webkit-scrollbar { display:none; }
      `}</style>
      <div
        style={{
          flex: 1,
          position: "relative",
          borderRadius: "32px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#111",
          boxShadow: isActive
            ? "0 0 0 1.5px rgba(74,222,128,0.35), 0 24px 64px rgba(0,0,0,0.9), 0 0 80px rgba(74,222,128,0.07) inset"
            : "0 8px 32px rgba(0,0,0,0.7)",
          transition: "box-shadow 0.5s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "70%",
            height: "2px",
            background: "linear-gradient(90deg, transparent, #4ade80, transparent)",
            opacity: isActive ? 0.7 : 0.2,
            transition: "opacity 0.5s ease",
            borderRadius: "99px",
            zIndex: 10,
          }}
        />
        <div
          className="truth-scroll"
          data-truth-scroll="true"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 22px 12px",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "22px",
            }}
          >
            <div style={{ height: "1px", flex: 1, background: "rgba(74,222,128,0.15)" }} />
            <span
              style={{
                color: "#4ade80",
                fontWeight: 900,
                fontSize: "11px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.75,
              }}
            >
              Truth or Lie
            </span>
            <div style={{ height: "1px", flex: 1, background: "rgba(74,222,128,0.15)" }} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0px",
              marginBottom: "26px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  padding: "3px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #16a34a)",
                  boxShadow: "0 0 16px rgba(74,222,128,0.3)",
                }}
              >
                <PostAvatar
                  src={post.challenger.avatar}
                  name={post.challenger.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.challengerId) {
                    onNavigateToProfile(post.challengerId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                }}
              >
                {post.challenger.nickname.split(" ")[0]}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "0 16px",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.25)",
                  borderRadius: "99px",
                  padding: "5px 14px",
                }}
              >
                <span
                  style={{
                    color: "#4ade80",
                    fontWeight: 800,
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    animation: "truthGlow 3s ease-in-out infinite",
                    display: "inline-block",
                  }}
                >
                  asked
                </span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>
                to say the truth
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  padding: "3px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))",
                }}
              >
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.receiverId) {
                    onNavigateToProfile(post.receiverId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                }}
              >
                {post.receiver.nickname.split(" ")[0]}
              </button>
            </div>
          </div>
          <div
            style={{
              position: "relative",
              borderRadius: "22px",
              padding: "22px 20px",
              marginBottom: "20px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              animation: isActive ? "questionReveal 0.6s ease 0.1s both" : "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "10px",
                left: "16px",
                fontSize: "40px",
                lineHeight: 1,
                color: "rgba(74,222,128,0.15)",
                fontWeight: 900,
                userSelect: "none",
              }}
            >
              "
            </span>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: "22px",
                lineHeight: 1.38,
                textAlign: "center",
                margin: 0,
                letterSpacing: "-0.01em",
                paddingTop: "6px",
              }}
            >
              {post.question}
            </p>
          </div>
          {post.poll ? (
            <div style={{ marginBottom: "8px" }}>
              {post.poll.options.map((option, index) => {
                const votes = post.poll?.votes[option] || 0;
                const percentage = Math.round((votes / post.poll!.totalVotes) * 100);
                const isLeading =
                  percentage ===
                  Math.max(
                    ...post.poll!.options.map((item) =>
                      Math.round(((post.poll!.votes[item] || 0) / post.poll!.totalVotes) * 100),
                    ),
                  );
                return (
                  <div key={`${post.id}-option-${index}`} style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "7px",
                      }}
                    >
                      <span
                        style={{
                          color: isLeading ? "#fff" : "rgba(255,255,255,0.6)",
                          fontSize: "14px",
                          fontWeight: isLeading ? 700 : 500,
                        }}
                      >
                        {option}
                      </span>
                      <span
                        style={{
                          color: isLeading ? "#4ade80" : "rgba(255,255,255,0.4)",
                          fontSize: "14px",
                          fontWeight: 800,
                        }}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "99px",
                        background: "rgba(255,255,255,0.07)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${percentage}%`,
                          background: isLeading
                            ? "linear-gradient(90deg, #4ade80, #22c55e)"
                            : "rgba(255,255,255,0.2)",
                          borderRadius: "99px",
                          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  textAlign: "center",
                  margin: "8px 0 0",
                }}
              >
                {post.poll.totalVotes.toLocaleString()} votes
              </p>
            </div>
          ) : post.answer ? (
            <div
              style={{
                borderRadius: "18px",
                padding: "16px",
                marginBottom: "8px",
                background: "rgba(74,222,128,0.05)",
                border: "1px solid rgba(74,222,128,0.14)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "#4ade80",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "#4ade80",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Answered · {post.receiver.nickname.split(" ")[0]}
                </span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "11px",
                    marginLeft: "auto",
                  }}
                >
                  {formatTimeAgo(post.createdAt)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={36}
                  style={{ flexShrink: 0 }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: "15px",
                    lineHeight: 1.55,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {post.answer}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div
          style={{
            padding: "14px 20px 22px",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          {phase === "idle" && (
            <p
              style={{
                color: "rgba(255,255,255,0.25)",
                fontSize: "11px",
                textAlign: "center",
                margin: "0 0 12px",
                letterSpacing: "0.04em",
              }}
            >
              What do you think?
            </p>
          )}
          {phase === "idle" ? (
            <div
              style={{
                display: "flex",
                gap: "10px",
                opacity: exiting ? 0 : 1,
                transform: exiting ? "scale(0.93) translateY(5px)" : "scale(1) translateY(0)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
              }}
            >
              <button
                className="truth-vote-btn"
                onClick={() => handleVote("truth")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(74,222,128,0.25)",
                  background: "rgba(74,222,128,0.08)",
                  color: "rgba(74,222,128,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: "btnPulseTruth 6s ease-in-out infinite",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>✓</span> Truth
              </button>
              <button
                className="lie-vote-btn"
                onClick={() => handleVote("lie")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,80,80,0.25)",
                  background: "rgba(255,80,80,0.08)",
                  color: "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: "btnPulseLie 6s ease-in-out infinite",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>✕</span> Lie
              </button>
            </div>
          ) : phase === "confirming" ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleConfirm}
                style={{
                  width: "80%",
                  padding: "17px",
                  borderRadius: "18px",
                  border: vote === "lie" ? "1px solid rgba(255,80,80,0.3)" : "none",
                  background: vote === "truth" ? "#4ade80" : "rgba(255,80,80,0.12)",
                  color: vote === "truth" ? "#000" : "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  textAlign: "center",
                  animation: "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                  boxShadow: vote === "truth" ? "0 6px 24px rgba(74,222,128,0.45)" : "none",
                  letterSpacing: "0.02em",
                }}
              >
                {vote === "truth" ? "✓ Confirm - It's the Truth" : "✕ Confirm - It's a Lie"}
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "17px",
                borderRadius: "18px",
                background:
                  vote === "truth" ? "rgba(74,222,128,0.1)" : "rgba(255,80,80,0.08)",
                border:
                  vote === "truth"
                    ? "1px solid rgba(74,222,128,0.3)"
                    : "1px solid rgba(255,80,80,0.2)",
              }}
            >
              <span style={{ fontSize: "20px" }}>{vote === "truth" ? "✓" : "✕"}</span>
              <button
                onClick={handleOpenVotedStateModal}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: vote === "truth" ? "#4ade80" : "rgba(255,160,160,0.85)",
                  fontWeight: 800,
                  fontSize: "16px",
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                }}
              >
                {vote === "truth" ? "You voted Truth" : "You voted Lie"}
              </button>
              <span
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  marginLeft: "auto",
                }}
              >
                tap to see results →
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GuestMainCommentsSheet({
  title = "Comments",
  previewTitle,
  previewBody,
  comments,
  onClose,
  currentUser,
}: {
  title?: string;
  previewTitle: string;
  previewBody: string;
  comments: MockComment[];
  onClose: () => void;
  currentUser: GuestUserProfile;
}) {
  const [comment, setComment] = useState("");

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-[120] flex items-end"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="app-modal-sheet w-full overflow-hidden rounded-t-3xl bg-[#111]"
        style={{ maxHeight: "96vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#2a2a2a] px-6 pb-3 pt-4">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#3a3a3a]" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <button onClick={onClose} className="text-[#64748b] hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col" style={{ maxHeight: "calc(96vh - 70px)" }}>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-4 rounded-2xl bg-[#1a1a1a] p-4">
              <p className="text-sm font-semibold text-white">{previewTitle}</p>
              <p className="mt-2 text-sm text-[#94a3b8]">{previewBody}</p>
            </div>

            <div className="space-y-4">
              {comments.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-2xl bg-[#151515] p-3">
                  <PostAvatar src={item.avatarUrl} name={item.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button className="truncate text-left text-sm font-semibold text-white">
                        {item.name}
                      </button>
                      <span className="truncate text-xs text-[#64748b]">
                        @{item.username}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#d9dde3]">
                      {item.text}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[#64748b]">
                      <span>{formatTimeAgo(item.createdAt)}</span>
                      <span>{item.likes} likes</span>
                      <span>Reply</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[#2a2a2a] px-4 pb-6 pt-3">
            <div className="flex items-center gap-3">
              <PostAvatar
                src={currentUser.avatarUrl}
                name={currentUser.name}
                size={36}
              />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-white outline-none placeholder:text-[#64748b]"
              />
              <button
                onClick={onClose}
                disabled={!comment.trim()}
                className="text-sm font-semibold text-[#4ade80] disabled:text-[#64748b]"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuestMainLikesSheet({
  title,
  subtitle,
  voters,
  onClose,
}: {
  title: string;
  subtitle: string;
  voters: ReturnType<typeof buildMockVoters>;
  onClose: () => void;
}) {
  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-[120] flex items-end"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="app-modal-sheet flex w-full flex-col rounded-t-3xl bg-[#111]"
        style={{ maxHeight: "96vh", minHeight: "58vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-3 pt-4">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#3a3a3a]" />
          <h3 className="mb-1 text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {voters.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-2xl bg-[#1a1a1a] p-3"
            >
              <PostAvatar src={entry.avatarUrl} name={entry.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">
                  {entry.name}
                </p>
                <p className="truncate text-sm text-[#94a3b8]">
                  @{entry.username}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#3a3a3a] bg-[#2a2a2a] px-4 py-2">
                <Heart size={14} fill="#ef4444" className="text-red-500" />
                <span className="text-sm font-semibold text-white">
                  voted {entry.count}x
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GuestMainShareSheet({
  previewImage,
  previewTitle,
  previewBody,
  onClose,
}: {
  previewImage?: string;
  previewTitle: string;
  previewBody: string;
  onClose: () => void;
}) {
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const recipients = guestUsers.filter((user) => user.id !== guestUsers[0]?.id).slice(0, 5);

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-[120] flex items-end"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="app-modal-sheet flex w-full flex-col rounded-t-3xl bg-[#111]"
        style={{ maxHeight: "96vh", minHeight: "60vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#2a2a2a] px-6 pb-3 pt-4">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#3a3a3a]" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Send to...</h3>
            <button onClick={onClose} className="text-[#64748b] hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="border-b border-[#2a2a2a] px-6 py-4">
          <div className="flex items-center gap-3">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Preview"
                className="h-14 w-14 rounded-xl object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {previewTitle}
              </p>
              <p className="line-clamp-2 text-xs text-[#94a3b8]">
                {previewBody}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {recipients.map((user) => {
            const sent = sentTo.has(user.id);
            return (
              <div
                key={user.id}
                className="flex items-center gap-4 rounded-2xl bg-[#1a1a1a] px-3 py-3"
              >
                <PostAvatar src={user.avatarUrl} name={user.name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white">
                    {user.name}
                  </p>
                  <p className="truncate text-sm text-[#94a3b8]">
                    @{user.username}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSentTo((previous) => new Set(previous).add(user.id))
                  }
                  disabled={sent}
                  className={`flex items-center gap-2 rounded-full px-5 py-2 text-base font-semibold transition-all ${
                    sent
                      ? "bg-[#2a2a2a] text-[#64748b]"
                      : "bg-[#4ade80] text-black"
                  }`}
                >
                  {sent ? (
                    <span>Sent</span>
                  ) : (
                    <>
                      <Send size={18} fill="currentColor" strokeWidth={0} />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GuestMainScreen({
  onNavigateToProfile,
}: {
  onNavigateToProfile?: (userId: string) => void;
}) {
  const currentGuestUser = guestUsers[0];
  const [activeView, setActiveView] = useState<"truth" | "dares">("dares");
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    url: string;
    type: "image" | "video";
    thumbnail?: string;
  } | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isTruthDragging, setIsTruthDragging] = useState(false);
  const [currentTruthIndex, setCurrentTruthIndex] = useState(0);
  const [truthResultModal, setTruthResultModal] = useState<{
    post: TruthPost;
    tab: "truth" | "lie";
  } | null>(null);
  const [truthCommentsPost, setTruthCommentsPost] = useState<TruthPost | null>(
    null,
  );
  const [dareCommentsPost, setDareCommentsPost] = useState<DarePost | null>(
    null,
  );
  const [shareDarePost, setShareDarePost] = useState<DarePost | null>(null);
  const minSwipeDistance = 20;
  const reelContainerRef = useRef<HTMLDivElement>(null);
  const truthDeckRef = useRef<HTMLDivElement>(null);
  const truthTouchStartY = useRef<number | null>(null);
  const truthTouchStartX = useRef<number | null>(null);
  const truthScrollableRef = useRef<HTMLElement | null>(null);
  const truthScrollTopAtStart = useRef(0);
  const truthScrollHeightAtStart = useRef(0);
  const truthClientHeightAtStart = useRef(0);
  const truthDragY = useRef(0);
  const truthLastTouchY = useRef(0);
  const truthLastTouchAt = useRef(0);
  const truthVelocityY = useRef(0);
  const truthDragFrame = useRef<number | null>(null);
  const truthCanDragDeck = useRef(false);

  const displayTruthPosts = useMemo(() => buildTruthPosts(), []);
  const displayDarePosts = useMemo(() => buildDarePosts(), []);

  const orderedTruthPosts = useMemo(
    () =>
      rankDeckByVoteState(displayTruthPosts, (postId) =>
        Boolean(getStoredVote(`guest_main_truth_vote:${postId}`)),
      ),
    [displayTruthPosts],
  );
  const sortedDarePosts = useMemo(
    () =>
      rankDeckByVoteState(displayDarePosts, (postId) =>
        Boolean(getStoredVote(`guest_main_dare_vote:${postId}`)),
      ),
    [displayDarePosts],
  );

  const effectiveTruthIndex = Math.min(
    currentTruthIndex,
    Math.max(orderedTruthPosts.length - 1, 0),
  );
  const visibleTruthPosts = useMemo(
    () =>
      orderedTruthPosts
        .map((post, index) => ({ post, index }))
        .filter(({ post, index }) => Boolean(post?.id) && Math.abs(index - effectiveTruthIndex) <= 1),
    [effectiveTruthIndex, orderedTruthPosts],
  );

  useEffect(() => {
    if (activeView !== "dares") return;
    const container = reelContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const viewportHeight = container.clientHeight || window.innerHeight || 1;
      const index = Math.round(container.scrollTop / viewportHeight);
      setActiveReelIndex(Math.max(0, Math.min(index, Math.max(sortedDarePosts.length - 1, 0))));
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeView, sortedDarePosts.length]);

  const setTruthDeckDrag = React.useCallback((dragY: number) => {
    truthDragY.current = dragY;
    if (truthDragFrame.current !== null) return;
    truthDragFrame.current = window.requestAnimationFrame(() => {
      truthDragFrame.current = null;
      truthDeckRef.current?.style.setProperty("--truth-drag-y", `${truthDragY.current}px`);
    });
  }, []);

  const handleTruthTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    truthTouchStartY.current = touch.clientY;
    truthTouchStartX.current = touch.clientX;
    truthLastTouchY.current = touch.clientY;
    truthLastTouchAt.current = performance.now();
    truthVelocityY.current = 0;
    truthCanDragDeck.current = false;
    setTruthDeckDrag(0);
    const scrollable = (e.currentTarget as HTMLElement).querySelector(
      '[data-truth-scroll="true"]',
    ) as HTMLElement | null;
    if (scrollable) {
      truthScrollableRef.current = scrollable;
      truthScrollTopAtStart.current = scrollable.scrollTop;
      truthScrollHeightAtStart.current = scrollable.scrollHeight;
      truthClientHeightAtStart.current = scrollable.clientHeight;
    } else {
      truthScrollableRef.current = null;
    }
  };

  const handleTruthTouchMove = (e: React.TouchEvent) => {
    if (truthTouchStartY.current === null || isTransitioning) return;
    const touch = e.targetTouches[0];
    const now = performance.now();
    const deltaSinceLast = touch.clientY - truthLastTouchY.current;
    const elapsed = Math.max(now - truthLastTouchAt.current, 1);
    truthVelocityY.current = deltaSinceLast / elapsed;
    truthLastTouchY.current = touch.clientY;
    truthLastTouchAt.current = now;

    const dragY = touch.clientY - truthTouchStartY.current;
    const dragX = Math.abs(touch.clientX - (truthTouchStartX.current ?? touch.clientX));
    const absDragY = Math.abs(dragY);

    if (absDragY < 4) return;
    if (dragX > absDragY * 0.6) {
      setTruthDeckDrag(0);
      return;
    }

    const scrollable = truthScrollableRef.current;
    if (scrollable && !truthCanDragDeck.current) {
      const atTop = truthScrollTopAtStart.current <= 0;
      const atBottom =
        truthScrollTopAtStart.current + truthClientHeightAtStart.current >=
        truthScrollHeightAtStart.current - 2;
      if (dragY < 0 && !atBottom) return;
      if (dragY > 0 && !atTop) return;
    }

    truthCanDragDeck.current = true;
    if (!isTruthDragging) setIsTruthDragging(true);

    const hasNext = effectiveTruthIndex < orderedTruthPosts.length - 1;
    const hasPrevious = effectiveTruthIndex > 0;
    const edgeResistance =
      (dragY < 0 && !hasNext) || (dragY > 0 && !hasPrevious) ? 0.35 : 1;

    setTruthDeckDrag(dragY * edgeResistance);
  };

  const finishTruthDrag = (cancel = false) => {
    const velocityThreshold = 0.45;
    const swipeThreshold = 90;
    const dragY = truthDragY.current;
    let nextIndex = effectiveTruthIndex;

    if (!cancel) {
      if (dragY <= -swipeThreshold || (dragY < -35 && truthVelocityY.current <= -velocityThreshold)) {
        nextIndex = Math.min(effectiveTruthIndex + 1, orderedTruthPosts.length - 1);
      } else if (
        dragY >= swipeThreshold ||
        (dragY > 35 && truthVelocityY.current >= velocityThreshold)
      ) {
        nextIndex = Math.max(effectiveTruthIndex - 1, 0);
      }
    }

    setCurrentTruthIndex(nextIndex);
    setTruthDeckDrag(0);
    setIsTruthDragging(false);
    truthTouchStartY.current = null;
    truthTouchStartX.current = null;
    truthScrollableRef.current = null;
    truthCanDragDeck.current = false;
    truthVelocityY.current = 0;
  };

  const handleTruthVoteClick = (_post: TruthPost, _choice: "truth" | "lie") => {};
  const handleOpenTruthModal = (
    post: TruthPost,
    tab: "truth" | "lie" | "comments",
  ) => {
    if (tab === "comments") {
      setTruthCommentsPost(post);
      return;
    }
    setTruthResultModal({ post, tab });
  };
  const handleDareVoteClick = (_dare: DarePost) => {};
  const handleOpenComments = (dare?: DarePost) => {
    if (dare) {
      setDareCommentsPost(dare);
    }
  };
  const handleOpenShare = (dare?: DarePost) => {
    if (dare) {
      setShareDarePost(dare);
    }
  };

  const NavHeader = () => (
    <div
      className="nav-header"
      style={{
        flexShrink: 0,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div style={{ padding: "8px 14px 10px" }}>
        <div className="nav-tabs">
          <button
            onClick={() => setActiveView("dares")}
            className={`nav-tab ${activeView === "dares" ? "active" : ""}`}
          >
            Dares
          </button>
          <button
            onClick={() => setActiveView("truth")}
            className={`nav-tab ${activeView === "truth" ? "active" : ""}`}
          >
            Truth
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="screen-container"
      style={{
        transition: isTransitioning ? "transform 0.3s ease-out" : "none",
        touchAction: activeView === "dares" ? "none" : "auto",
      }}
      onTouchStart={(e) => {
        setTouchStart(e.targetTouches[0].clientX);
        setTouchEnd(e.targetTouches[0].clientX);
        setTouchStartY(e.targetTouches[0].clientY);
        setTouchEndY(e.targetTouches[0].clientY);
      }}
      onTouchMove={(e) => {
        setTouchEnd(e.targetTouches[0].clientX);
        setTouchEndY(e.targetTouches[0].clientY);
      }}
      onTouchEnd={() => {
        if (touchStart === null || touchEnd === null || touchStartY === null || touchEndY === null) return;
        if (isTransitioning) return;
        const distanceX = touchStart - touchEnd;
        const distanceY = Math.abs(touchStartY - touchEndY);
        if (Math.abs(distanceX) > minSwipeDistance && distanceX > distanceY * 0.6) {
          setIsTransitioning(true);
          if (distanceX > 0) setActiveView("truth");
          else setActiveView("dares");
          setTimeout(() => setIsTransitioning(false), 300);
        }
      }}
    >
      {activeView === "dares" ? (
        <div
          ref={reelContainerRef}
          style={{
            height: "100dvh",
            overflowY: "scroll",
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
          }}
        >
          <div
            data-reel-index="0"
            style={{
              height: "100dvh",
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <NavHeader />
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              {sortedDarePosts[0] ? (
                <GuestDareCard
                  dare={sortedDarePosts[0]}
                  reelMode
                  isActive={activeReelIndex === 0}
                  onVoteClick={handleDareVoteClick}
                  onFullscreenMedia={setFullscreenMedia}
                  onOpenComments={handleOpenComments}
                  onOpenShare={handleOpenShare}
                  onNavigateToProfile={onNavigateToProfile}
                />
              ) : null}
            </div>
          </div>
          {sortedDarePosts
            .slice(1)
            .filter((dare) => dare && dare.id)
            .map((dare, index) => (
              <div
                key={dare.id}
                data-reel-index={String(index + 1)}
                style={{
                  height: "100dvh",
                  scrollSnapAlign: "start",
                  scrollSnapStop: "always",
                  overflow: "hidden",
                }}
              >
                <GuestDareCard
                  dare={dare}
                  reelMode
                  isActive={activeReelIndex === index + 1}
                  onVoteClick={handleDareVoteClick}
                  onFullscreenMedia={setFullscreenMedia}
                  onOpenComments={handleOpenComments}
                  onOpenShare={handleOpenShare}
                  onNavigateToProfile={onNavigateToProfile}
                />
              </div>
            ))}
        </div>
      ) : (
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#0a0a0a",
            paddingBottom: "calc(80px + var(--safe-area-bottom))",
          }}
        >
          <NavHeader />
          <div
            ref={truthDeckRef}
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              WebkitUserSelect: isTruthDragging ? "none" : undefined,
              userSelect: isTruthDragging ? "none" : undefined,
            }}
            onTouchStart={handleTruthTouchStart}
            onTouchMove={handleTruthTouchMove}
            onTouchEnd={() => finishTruthDrag(false)}
            onTouchCancel={() => finishTruthDrag(true)}
          >
            {orderedTruthPosts.length > 0 ? (
              visibleTruthPosts.map(({ post, index }) => (
                <GuestSwipeableTruthCard
                  key={`truth-card-${post.id}-${index}`}
                  post={post}
                  onVoteClick={handleTruthVoteClick}
                  onOpenVoteModal={handleOpenTruthModal}
                  cardIndex={index}
                  currentIndex={effectiveTruthIndex}
                  isDragging={isTruthDragging}
                  onNavigateToProfile={onNavigateToProfile}
                />
              ))
            ) : null}
          </div>
        </div>
      )}

      {fullscreenMedia && (
        <div
          onClick={() => setFullscreenMedia(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.97)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => setFullscreenMedia(null)}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              fontSize: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}
          >
            ×
          </button>
          {fullscreenMedia.type === "image" ? (
            <img
              src={fullscreenMedia.url}
              alt="Fullscreen"
              style={{ maxWidth: "100%", maxHeight: "100vh", objectFit: "contain" }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              style={{ position: "relative", width: "100%", maxHeight: "100vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={fullscreenMedia.thumbnail || fullscreenMedia.url}
                alt="Video fullscreen"
                style={{ width: "100%", maxHeight: "100vh", objectFit: "contain" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.2)",
                    backdropFilter: "blur(8px)",
                    border: "2px solid rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Play size={32} color="#fff" fill="#fff" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {truthResultModal ? (
        <GuestMainLikesSheet
          title={truthResultModal.tab === "truth" ? "Truth votes" : "Lie votes"}
          subtitle={`Mock voters reacting to "${truthResultModal.post.question}"`}
          voters={buildMockVoters(truthResultModal.post.id)}
          onClose={() => setTruthResultModal(null)}
        />
      ) : null}

      {truthCommentsPost ? (
        <GuestMainCommentsSheet
          previewTitle={truthCommentsPost.receiver.nickname}
          previewBody={truthCommentsPost.question}
          comments={buildMockComments(truthCommentsPost.id)}
          onClose={() => setTruthCommentsPost(null)}
          currentUser={currentGuestUser}
        />
      ) : null}

      {dareCommentsPost ? (
        <GuestMainCommentsSheet
          previewTitle={`${dareCommentsPost.receiver.nickname}'s dare`}
          previewBody={dareCommentsPost.description}
          comments={buildMockComments(dareCommentsPost.id)}
          onClose={() => setDareCommentsPost(null)}
          currentUser={currentGuestUser}
        />
      ) : null}

      {shareDarePost ? (
        <GuestMainShareSheet
          previewImage={shareDarePost.proof?.thumbnail || shareDarePost.proof?.url}
          previewTitle={`${shareDarePost.receiver.nickname}'s dare`}
          previewBody={shareDarePost.description}
          onClose={() => setShareDarePost(null)}
        />
      ) : null}
    </div>
  );
}
