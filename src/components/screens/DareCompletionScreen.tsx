"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Camera,
  Image,
  Mic,
  Camera as CameraIcon,
  ShieldCheck,
  Sparkles,
  Zap,
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

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

      const actionType =
        previewType === "video"
          ? "video"
          : previewType === "audio"
            ? "voice"
            : "photo";
      setSubmittedAction(actionType);

      await onSubmit({ type: previewType, url: uploadedProof.url });
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
      accent: "from-[#4ade80]/30 via-[#4ade80]/5 to-transparent",
      border: "border-[#4ade80]/25",
      glow: "shadow-[0_0_30px_rgba(74,222,128,0.15)]",
      iconBg: "bg-[#4ade80]/15",
    },
    {
      id: "photo",
      icon: CameraIcon,
      label: isCapturing ? "Capturing..." : "Take Photo",
      hint: "Snap proof right now",
      onClick: handleTakePhoto,
      accent: "from-[#4ade80]/30 via-[#4ade80]/5 to-transparent",
      border: "border-[#4ade80]/25",
      glow: "shadow-[0_0_30px_rgba(74,222,128,0.15)]",
      iconBg: "bg-[#4ade80]/15",
    },
    {
      id: "voice",
      icon: Mic,
      label: isRecording ? "Recording..." : "Record Voice",
      hint: "Short audio proof",
      onClick: handleRecordVoice,
      accent: "from-[#4ade80]/30 via-[#4ade80]/5 to-transparent",
      border: "border-[#4ade80]/25",
      glow: "shadow-[0_0_30px_rgba(74,222,128,0.15)]",
      iconBg: "bg-[#4ade80]/15",
    },
    {
      id: "gallery",
      icon: Image,
      label: "Choose from Gallery",
      hint: "Upload saved media",
      onClick: handleChooseFromGallery,
      accent: "from-[#4ade80]/30 via-[#4ade80]/5 to-transparent",
      border: "border-[#4ade80]/25",
      glow: "shadow-[0_0_30px_rgba(74,222,128,0.15)]",
      iconBg: "bg-[#4ade80]/15",
    },
  ];

  if (!isValidState || isExpired) {
    return (
      <div className="screen-container flex items-center justify-center">
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
    <div className="screen-container bg-[radial-gradient(circle_at_top,#16291d_0%,#0c120d_38%,#070907_100%)]">
      <div className="nav-header">
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all hover:border-[#4ade80]/30 hover:bg-white/10"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7dd3a7]">
              Dare Proof
            </p>
            <h1 className="text-lg font-bold text-white">Complete the Dare</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2 text-[#86efac] shadow-[0_0_24px_rgba(74,222,128,0.12)]">
            <Clock size={16} />
            <span className="text-sm font-semibold">
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-20 pt-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,21,0.98),rgba(12,15,13,0.98))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.45),transparent)]" />
            <div className="pointer-events-none absolute -right-6 top-0 h-28 w-28 rounded-full bg-[#4ade80]/10 blur-3xl" />

            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Avatar
                    src={resolvedChallenger.avatar}
                    alt={resolvedChallenger.name}
                    size="md"
                    userId={challenge.challengerId}
                    username={resolvedChallenger.username}
                  />
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#0d1510] bg-[#4ade80] text-black shadow-[0_0_18px_rgba(74,222,128,0.45)]">
                    <Zap size={9} />
                  </div>
                </div>
                <div>
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7dd3a7]">
                    Dare from
                  </p>
                  <h3 className="text-sm font-semibold text-white">
                    {resolvedChallenger.name}
                  </h3>
                  <p className="text-xs text-[#91a091]">
                    {resolvedChallenger.username}
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#86efac]">
                Accepted
              </div>
            </div>

            <div className="rounded-[20px] border border-[#4ade80]/14 bg-[linear-gradient(180deg,rgba(26,31,28,0.98),rgba(18,21,19,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2.5 flex items-center gap-2 text-[#86efac]">
                <div className="h-1 w-8 rounded-full bg-[#4ade80]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                  Mission
                </span>
              </div>
              <p className="text-base font-semibold leading-relaxed text-white">
                {challenge.action}
              </p>
            </div>
          </div>

          {!isSubmitted ? (
            !isPreviewMode ? (
              <div className="grid gap-2.5 grid-cols-2">
                {actionCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={item.onClick}
                      disabled={isRecording || isCapturing}
                      className={`group relative overflow-hidden rounded-[24px] border ${item.border} bg-[linear-gradient(145deg,rgba(25,26,24,0.98),rgba(15,16,14,0.98))] p-5 text-left ${item.glow} transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.02] hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100`}
                    >
                      <div
                        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accent} opacity-100 transition-opacity duration-300 group-hover:opacity-100`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                      <div className="relative">
                        <div
                          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${item.iconBg} border border-white/20 text-white shadow-[0_8px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-sm`}
                        >
                          <Icon size={20} />
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          {item.label}
                        </h3>
                        <p className="mt-1 text-xs text-white/70 font-medium">
                          {item.hint}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,21,19,0.98),rgba(11,14,12,0.98))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.34),transparent)]" />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white">Preview</h3>
                    <p className="mt-0.5 text-xs text-[#8f968f]">
                      Review your proof before you send it.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86efac]">
                    {previewType}
                  </div>
                </div>

                <div className="mb-4 overflow-hidden rounded-[20px] border border-white/8 bg-black/30">
                  {previewType === "image" && (
                    <img
                      src={previewUrl || ""}
                      alt="Preview"
                      className="w-full rounded-[20px]"
                    />
                  )}
                  {previewType === "video" && (
                    <video
                      src={previewUrl || ""}
                      controls
                      className="w-full rounded-[20px]"
                    />
                  )}
                  {previewType === "audio" && (
                    <div className="bg-[linear-gradient(180deg,rgba(20,24,21,0.98),rgba(12,15,13,0.98))] p-4 text-center">
                      <Mic size={36} className="mx-auto mb-3 text-[#86efac]" />
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

                <div className="flex gap-2.5">
                  <button
                    onClick={clearPreview}
                    className="flex-1 rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-white/[0.08]"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleSubmitProof}
                    disabled={isSubmitted || isUploadingProof}
                    className="flex-1 rounded-[18px] bg-[linear-gradient(135deg,#4ade80_0%,#22c55e_100%)] px-4 py-3 text-sm font-bold text-black shadow-[0_12px_24px_rgba(74,222,128,0.2)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_28px_rgba(74,222,128,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingProof || isSubmitted
                      ? "Submitting..."
                      : "Submit"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="relative overflow-hidden rounded-[24px] border border-[#4ade80]/16 bg-[linear-gradient(180deg,rgba(18,24,19,0.98),rgba(11,15,11,0.98))] p-5 text-center shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
              <div className="pointer-events-none absolute left-1/2 top-5 h-28 w-28 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />

              <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#4ade80]/25 bg-[#4ade80]/12 shadow-[0_0_28px_rgba(74,222,128,0.16)]">
                {submittedAction === "video" && (
                  <Camera size={26} className="text-[#86efac]" />
                )}
                {submittedAction === "photo" && (
                  <CameraIcon size={26} className="text-[#86efac]" />
                )}
                {submittedAction === "voice" && (
                  <Mic size={26} className="text-[#86efac]" />
                )}
                {submittedAction === "gallery" && (
                  <Image size={26} className="text-[#86efac]" />
                )}
                {!submittedAction && (
                  <Camera size={26} className="text-[#86efac]" />
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
