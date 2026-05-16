"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Camera,
  Image,
  Mic,
  Camera as CameraIcon,
  Zap,
  CheckCircle,
  X,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useProfileDataStore } from "@/stores/profileDataStore";
import { dareService } from "@/middleware/services/service-factory";
import {
  uploadOptimizedMedia,
  validateMediaSelection,
} from "@/utils/mediaUpload";
import "@/styles/design-system.css";

interface DareCompletionScreenProps {
  challenge: {
    id: string;
    challengerId?: string;
    challenger: {
      name: string;
      avatar: string;
      username: string;
    };
    action: string;
  };
  onBack: () => void;
  onSubmit: (proof: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  }) => void | Promise<void>;
  skipValidation?: boolean;
  initialTimeRemaining?: number;
}

export function DareCompletionScreen({
  challenge,
  onBack,
  onSubmit,
  skipValidation = false,
  initialTimeRemaining = 15 * 60,
}: DareCompletionScreenProps) {
  const { user } = useAuthStore();
  const onBackRef = useRef(onBack);
  const isSubmittingProofRef = useRef(false);

  const [dareState, setDareState] = useState<string | null>(null);
  const [isValidState, setIsValidState] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [submittedAction, setSubmittedAction] = useState<
    "video" | "photo" | "voice" | "gallery" | null
  >(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewType, setPreviewType] = useState<
    "image" | "video" | "audio" | null
  >(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(
    null,
  );
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (skipValidation) {
      setIsValidState(true);
      return;
    }

    const validateDareState = async () => {
      try {
        const dareResponse = await dareService.getDareById(challenge.id);

        if (!dareResponse.success || !dareResponse.dare) {
          setIsValidState(false);
          setTimeout(() => {
            onBackRef.current();
          }, 1000);
          return;
        }

        const currentState = dareResponse.dare.state || "";
        setDareState(currentState);

        if (currentState !== "ACCEPTED") {
          setIsValidState(false);
          setTimeout(() => {
            onBackRef.current();
          }, 1000);
        } else {
          setIsValidState(true);
        }
      } catch (error) {
        console.error("Error validating dare state:", error);
        setIsValidState(false);
        setTimeout(() => {
          onBackRef.current();
        }, 1000);
      }
    };

    validateDareState();
  }, [challenge.id, skipValidation]);

  const dareProfiles = useProfileDataStore((s) => s.userProfiles);
  const dareChallengerCached = challenge.challengerId
    ? dareProfiles[challenge.challengerId]
    : null;
  const resolvedChallenger = {
    ...challenge.challenger,
    name: dareChallengerCached?.displayName || challenge.challenger.name,
    username: dareChallengerCached?.username || challenge.challenger.username,
  };

  const clearPreview = useCallback(() => {
    setPreviewUrl((currentUrl) => {
      if (currentUrl && currentUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrl);
      }
      return null;
    });
    setPreviewBlob(null);
    setPreviewType(null);
    setIsPreviewMode(false);
  }, []);

  const clearThumbnail = useCallback(() => {
    setThumbnailPreviewUrl((currentUrl) => {
      if (currentUrl && currentUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrl);
      }
      return null;
    });
    setThumbnailBlob(null);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      if (thumbnailPreviewUrl && thumbnailPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailPreviewUrl);
      }
    };
  }, [previewUrl, thumbnailPreviewUrl]);

  useEffect(() => {
    // Check if dare is already expired from localStorage
    const expiredKey = `dare_expired_${challenge.id}`;
    const isAlreadyExpired = localStorage.getItem(expiredKey);
    if (isAlreadyExpired) {
      setIsExpired(true);
      onBack();
      return;
    }

    // Get initial time from localStorage if available
    const timerKey = `dare_timer_${challenge.id}`;
    const savedTime = localStorage.getItem(timerKey);
    if (savedTime) {
      const parsedTime = parseInt(savedTime, 10);
      if (!isNaN(parsedTime) && parsedTime > 0) {
        setTimeRemaining(parsedTime);
      }
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev <= 1 ? 0 : prev - 1;
        // Save to localStorage for sync
        localStorage.setItem(timerKey, newTime.toString());

        if (newTime === 0 && !isExpired) {
          // Mark as expired in localStorage
          localStorage.setItem(expiredKey, "true");
          setIsExpired(true);
          // Clear timer from localStorage
          localStorage.removeItem(timerKey);
          // Go back after a short delay
          setTimeout(() => {
            onBack();
          }, 500);
        }

        return newTime;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      // Clean up localStorage when unmounting (if not expired)
      if (!isExpired) {
        localStorage.removeItem(timerKey);
      }
    };
  }, [challenge.id, onBack, isExpired]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRecordVideo = async () => {
    try {
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const validation = await validateMediaSelection(
          blob,
          "dare-proof",
          "video",
        );
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);

        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        clearPreview();
        setPreviewUrl(URL.createObjectURL(blob));
        setPreviewType("video");
        setPreviewBlob(blob);
        setIsPreviewMode(true);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") mediaRecorder.stop();
      }, 10000);
    } catch (error) {
      console.error("Error accessing camera:", error);
      setIsRecording(false);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.play();

      video.onloadedmetadata = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");

        if (!context) {
          stream.getTracks().forEach((track) => track.stop());
          setIsCapturing(false);
          alert("Unable to capture photo.");
          return;
        }

        context.drawImage(video, 0, 0);
        canvas.toBlob(
          async (blob) => {
            stream.getTracks().forEach((track) => track.stop());
            setIsCapturing(false);

            if (!blob) {
              alert("Unable to capture photo.");
              return;
            }

            const validation = await validateMediaSelection(
              blob,
              "dare-proof",
              "image",
            );
            if (!validation.valid) {
              alert(validation.error);
              return;
            }

            clearPreview();
            setPreviewUrl(URL.createObjectURL(blob));
            setPreviewType("image");
            setPreviewBlob(blob);
            setIsPreviewMode(true);
          },
          "image/jpeg",
          0.92,
        );
      };
    } catch (error) {
      console.error("Error accessing camera:", error);
      setIsCapturing(false);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const handleRecordVoice = async () => {
    try {
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const validation = await validateMediaSelection(
          blob,
          "dare-proof",
          "audio",
        );
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);

        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        clearPreview();
        setPreviewUrl(URL.createObjectURL(blob));
        setPreviewType("audio");
        setPreviewBlob(blob);
        setIsPreviewMode(true);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") mediaRecorder.stop();
      }, 5000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setIsRecording(false);
      alert("Unable to access microphone. Please check permissions.");
    }
  };

  const handleChooseFromGallery = () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.multiple = false;

      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const validation = await validateMediaSelection(file, "dare-proof");
        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        clearPreview();
        const fileType = file.type.startsWith("video/") ? "video" : "image";
        setPreviewUrl(URL.createObjectURL(file));
        setPreviewType(fileType as "image" | "video");
        setPreviewBlob(file);
        setIsPreviewMode(true);
      };

      input.click();
    } catch (error) {
      console.error("Error opening gallery:", error);
      alert("Unable to open gallery picker.");
    }
  };

  const handleSelectThumbnail = () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = false;

      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const validation = await validateMediaSelection(
          file,
          "dare-proof",
          "image",
        );
        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        clearThumbnail();
        setThumbnailPreviewUrl(URL.createObjectURL(file));
        setThumbnailBlob(file);
      };

      input.click();
    } catch (error) {
      console.error("Error opening thumbnail picker:", error);
      alert("Unable to open thumbnail picker.");
    }
  };

  const handleSubmitProof = async () => {
    if (
      !previewUrl ||
      !previewType ||
      !user ||
      !previewBlob ||
      isSubmittingProofRef.current
    ) {
      return;
    }

    try {
      isSubmittingProofRef.current = true;
      setIsSubmitted(true);
      setIsUploadingProof(true);

      console.log("[DareCompletion] Starting upload:", {
        previewType,
        blobSize: previewBlob.size,
        userId: user.id,
      });

      const uploadedProof = await uploadOptimizedMedia({
        source: previewBlob,
        userId: user.id,
        context: "dare-proof",
        mediaKind: previewType,
        fileName: `dare-proof-${challenge.id}.${previewType === "image" ? "jpg" : "webm"}`,
      });

      console.log("[DareCompletion] Upload successful:", uploadedProof);

      let uploadedThumbnailUrl: string | undefined;
      if (thumbnailBlob) {
        const uploadedThumbnail = await uploadOptimizedMedia({
          source: thumbnailBlob,
          userId: user.id,
          context: "dare-proof",
          mediaKind: "image",
          fileName: `dare-thumbnail-${challenge.id}.jpg`,
        });
        uploadedThumbnailUrl = uploadedThumbnail.url;
      } else if (previewType === "image") {
        uploadedThumbnailUrl = uploadedProof.url;
      }

      const actionType =
        previewType === "video"
          ? "video"
          : previewType === "audio"
            ? "voice"
            : "photo";
      setSubmittedAction(actionType);

      await onSubmit({
        type: previewType,
        url: uploadedProof.url,
        thumbnail: uploadedThumbnailUrl,
      });
    } catch (error) {
      console.error("[DareCompletion] Failed to submit dare:", error);
      setIsSubmitted(false);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Could not submit proof: ${errorMessage}. Please try again.`);
    } finally {
      isSubmittingProofRef.current = false;
      setIsUploadingProof(false);
    }
  };

  const actionCards = [
    {
      id: "video",
      icon: Camera,
      label: isRecording ? "Recording..." : "Record Video",
      hint: "10 second one-take capture",
      onClick: handleRecordVideo,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.16), rgba(255,255,255,0.035))",
    },
    {
      id: "photo",
      icon: CameraIcon,
      label: isCapturing ? "Capturing..." : "Take Photo",
      hint: "Snap proof right now",
      onClick: handleTakePhoto,
      accent: "#4ade80",
      background:
        "linear-gradient(135deg, rgba(74,222,128,0.16), rgba(255,255,255,0.035))",
    },
    {
      id: "voice",
      icon: Mic,
      label: isRecording ? "Recording..." : "Record Voice",
      hint: "Short audio proof",
      onClick: handleRecordVoice,
      accent: "#60a5fa",
      background:
        "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(255,255,255,0.035))",
    },
    {
      id: "thumbnail",
      icon: Image,
      label: thumbnailBlob ? "Thumbnail Selected" : "Select Thumbnail",
      hint: thumbnailBlob ? "Cover image ready for Pic Mode" : "Choose the cover image",
      onClick: handleSelectThumbnail,
      accent: "#38bdf8",
      background:
        "linear-gradient(135deg, rgba(56,189,248,0.14), rgba(255,255,255,0.035))",
    },
    {
      id: "gallery",
      icon: Image,
      label: "Choose from Gallery",
      hint: "Upload saved media",
      onClick: handleChooseFromGallery,
      accent: "#c084fc",
      background:
        "linear-gradient(135deg, rgba(192,132,252,0.14), rgba(255,255,255,0.035))",
    },
  ];

  if (!isValidState || isExpired) {
    return (
      <div className="screen-container flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.18),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]">
        <div className="text-center">
          <div className="mb-2 text-lg font-semibold text-red-500">
            Dare Expired
          </div>
          <div className="mb-4 text-sm text-text-secondary">
            The time to complete this dare has run out.
          </div>
          <button
            onClick={onBack}
            className="btn btn-primary px-6 py-2 text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen-container flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.14), transparent 30%), radial-gradient(circle at 90% 72%, rgba(20,184,166,0.1), transparent 28%), linear-gradient(180deg, #060806 0%, #08110e 46%, #030403 100%)",
      }}
    >
      <div
        className="px-4"
        style={{ paddingTop: "calc(var(--safe-area-top) + 10px)" }}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition-colors hover:border-[#79d99a]/30 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#79d99a]/20 bg-[#79d99a]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#a8f0bf]">
                <Zap size={13} />
                Dare Proof
              </div>
              <h1 className="text-[26px] font-black leading-none tracking-tight text-white">
                Complete the Dare
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-[18px] border border-[#79d99a]/22 bg-[#79d99a]/10 px-3 py-2.5 text-[#a8f0bf] shadow-[0_16px_38px_rgba(0,0,0,0.3)]">
            <Clock size={16} />
            <span className="text-sm font-black">
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-[calc(var(--safe-area-bottom)+10px)] pt-2">
        <div className="mx-auto flex h-full max-w-2xl flex-col gap-3">
          <div className="relative isolate shrink-0 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,39,39,0.96)_0%,rgba(8,27,29,0.99)_48%,rgba(4,14,16,0.99)_100%)] p-3.5 shadow-[0_24px_64px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.055)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(121,217,154,0.62),transparent)]" />
            <div className="pointer-events-none absolute -right-6 top-0 h-28 w-28 rounded-full bg-[#79d99a]/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(121,217,154,0.08),transparent_70%)] opacity-80" />

            <div className="relative mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative">
                  <Avatar
                    src={resolvedChallenger.avatar}
                    alt={resolvedChallenger.name}
                    size="md"
                    userId={challenge.challengerId}
                    username={resolvedChallenger.username}
                    className="ring-1 ring-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
                  />
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#06100a] bg-[#79d99a] text-[#041006] shadow-[0_0_18px_rgba(121,217,154,0.28)]">
                    <Zap size={9} />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                    Challenger
                  </p>
                  <h3 className="truncate text-[15px] font-bold leading-tight text-white">
                    {resolvedChallenger.name}
                  </h3>
                  <p className="truncate text-xs font-semibold text-[#94a3b8]">
                    @{resolvedChallenger.username.replace(/^@/, "")}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-[#79d99a]/22 bg-[#79d99a]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#a8f0bf]">
                Accepted
              </div>
            </div>

            <div className="relative rounded-[22px] border border-white/8 bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 flex items-center gap-2 text-[#a8f0bf]">
                <div className="h-1 w-14 rounded-full bg-[#79d99a]/85" />
                <span className="text-[10px] font-black uppercase tracking-[0.14em]">
                  Dared you to
                </span>
              </div>
              <p className="line-clamp-3 text-[14px] font-bold leading-snug text-white">
                {challenge.action}
              </p>
            </div>
          </div>

          {!isSubmitted ? (
            !isPreviewMode ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5">
                  {actionCards.map((item) => {
                    const Icon = item.icon;
                    const isThumbnailCard = item.id === "thumbnail";
                    return (
                      <button
                        key={item.id}
                        onClick={item.onClick}
                        disabled={isRecording || isCapturing}
                        className="group relative overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#79d99a]/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        {isThumbnailCard && thumbnailBlob && (
                          <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#38bdf8] text-[#031018] shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                            <CheckCircle size={14} />
                          </div>
                        )}
                        <div className="relative flex h-full min-h-[92px] flex-col justify-between">
                          <div
                            className="mb-3 flex h-10 w-10 items-center justify-center rounded-[16px] border transition-transform duration-200 group-hover:scale-105"
                            style={{
                              color: item.accent,
                              background: `${item.accent}14`,
                              borderColor: `${item.accent}28`,
                              boxShadow: `0 0 24px ${item.accent}18`,
                            }}
                          >
                            <Icon size={21} strokeWidth={2.4} />
                          </div>
                          <div>
                            <h3 className="text-[13px] font-extrabold leading-tight tracking-tight text-white">
                              {item.label}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-[#94a3b8]">
                              {item.hint}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {thumbnailPreviewUrl && (
                  <div className="relative shrink-0 overflow-hidden rounded-[20px] border border-[#38bdf8]/18 bg-[#06121a]/80 p-2.5 shadow-[0_14px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={thumbnailPreviewUrl}
                        alt="Selected thumbnail"
                        className="h-14 w-14 shrink-0 rounded-[16px] object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 inline-flex rounded-full border border-[#38bdf8]/20 bg-[#38bdf8]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#7dd3fc]">
                          Pic Mode Cover
                        </div>
                        <p className="line-clamp-1 text-xs font-bold leading-snug text-white">
                          This image will lead the dare card carousel.
                        </p>
                      </div>
                      <button
                        onClick={clearThumbnail}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-colors hover:text-white"
                        aria-label="Remove selected thumbnail"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,39,39,0.96)_0%,rgba(8,27,29,0.99)_48%,rgba(4,14,16,0.99)_100%)] p-3.5 shadow-[0_24px_64px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(121,217,154,0.48),transparent)]" />
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black tracking-tight text-white">
                      Preview
                    </h3>
                    <p className="mt-0.5 text-xs font-semibold text-[#94a3b8]">
                      Review your proof before you send it.
                    </p>
                  </div>
                  <div className="rounded-full border border-[#79d99a]/22 bg-[#79d99a]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8f0bf]">
                    {previewType}
                  </div>
                </div>

                <div className="mb-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/8 bg-black/35">
                  {previewType === "image" && (
                    <img
                      src={previewUrl || ""}
                      alt="Preview"
                      className="h-full w-full object-contain"
                    />
                  )}
                  {previewType === "video" && (
                    <video
                      src={previewUrl || ""}
                      controls
                      className="h-full w-full object-contain"
                    />
                  )}
                  {previewType === "audio" && (
                    <div className="flex h-full flex-col justify-center bg-[linear-gradient(180deg,rgba(23,24,22,0.98),rgba(16,18,16,0.98))] p-5 text-center">
                      <Mic size={34} className="mx-auto mb-3 text-[#a8f0bf]" />
                      <audio
                        src={previewUrl || ""}
                        controls
                        className="w-full"
                      />
                      <p className="mt-2 text-xs text-[#a7ada7]">
                        Voice Recording
                      </p>
                    </div>
                  )}
                </div>

                <div className="mb-3 shrink-0 rounded-[22px] border border-white/8 bg-white/[0.035] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7dd3fc]">
                        Select a Thumbnail
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                        Sets the first carousel image in Pic Mode.
                      </p>
                    </div>
                    <button
                      onClick={handleSelectThumbnail}
                      className="shrink-0 rounded-full border border-[#38bdf8]/20 bg-[#38bdf8]/10 px-3 py-2 text-xs font-black text-[#7dd3fc] transition-colors hover:bg-[#38bdf8]/15"
                    >
                      {thumbnailBlob ? "Change" : "Select"}
                    </button>
                  </div>
                  {thumbnailPreviewUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={thumbnailPreviewUrl}
                        alt="Selected thumbnail"
                        className="h-14 w-14 rounded-[16px] object-cover"
                      />
                      <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-white">
                        Thumbnail selected for the cover card.
                      </p>
                      <button
                        onClick={clearThumbnail}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-colors hover:text-white"
                        aria-label="Remove selected thumbnail"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-black/20 px-3 py-3 text-center text-[11px] font-semibold text-white/45">
                      No custom thumbnail selected. Photo proof will use itself as the cover.
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-2.5">
                  <button
                    onClick={clearPreview}
                    className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/[0.08]"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleSubmitProof}
                    disabled={isSubmitted || isUploadingProof}
                    className="flex-1 rounded-full bg-[linear-gradient(135deg,#79d99a_0%,#35b96f_100%)] px-4 py-3 text-sm font-black text-[#041006] shadow-[0_14px_30px_rgba(53,185,111,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(53,185,111,0.26)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingProof || isSubmitted
                      ? "Submitting..."
                      : "Submit"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[28px] border border-[#79d99a]/16 bg-[linear-gradient(180deg,rgba(13,39,39,0.96)_0%,rgba(8,27,29,0.99)_48%,rgba(4,14,16,0.99)_100%)] p-5 text-center shadow-[0_24px_64px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(121,217,154,0.52),transparent)]" />
              <div className="pointer-events-none absolute left-1/2 top-5 h-28 w-28 -translate-x-1/2 rounded-full bg-[#79d99a]/10 blur-3xl" />

              <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#79d99a]/25 bg-[#79d99a]/12 shadow-[0_0_28px_rgba(121,217,154,0.16)]">
                {submittedAction === "video" && (
                  <Camera size={26} className="text-[#a8f0bf]" />
                )}
                {submittedAction === "photo" && (
                  <CameraIcon size={26} className="text-[#a8f0bf]" />
                )}
                {submittedAction === "voice" && (
                  <Mic size={26} className="text-[#a8f0bf]" />
                )}
                {submittedAction === "gallery" && (
                  <Image size={26} className="text-[#a8f0bf]" />
                )}
                {!submittedAction && (
                  <Camera size={26} className="text-[#a8f0bf]" />
                )}
              </div>
              <h3 className="mb-1.5 text-lg font-bold text-white">
                {submittedAction === "video" && "Video Recorded - Under review"}
                {submittedAction === "photo" && "Photo Taken - Under review"}
                {submittedAction === "voice" && "Voice Recorded - Under review"}
                {submittedAction === "gallery" &&
                  "Image Selected - Under review"}
                {!submittedAction && "Submitted - Under review"}
              </h3>
              <p className="mx-auto max-w-md text-xs text-[#b8c4b8]">
                {submittedAction === "video" &&
                  "Your video is being reviewed by friends"}
                {submittedAction === "photo" &&
                  "Your photo is being reviewed by friends"}
                {submittedAction === "voice" &&
                  "Your voice note is being reviewed by friends"}
                {submittedAction === "gallery" &&
                  "Your image is being reviewed by friends"}
                {!submittedAction && "Your proof is being reviewed by friends"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
