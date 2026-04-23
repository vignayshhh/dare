"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Camera,
  Image,
  Mic,
  Camera as CameraIcon,
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
}

export function DareCompletionScreen({
  challenge,
  onBack,
  onSubmit,
  skipValidation = false,
}: DareCompletionScreenProps) {
  const { user } = useAuthStore();
  const onBackRef = useRef(onBack);
  const isSubmittingProofRef = useRef(false);

  const [dareState, setDareState] = useState<string | null>(null);
  const [isValidState, setIsValidState] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(15 * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
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
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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

  if (!isValidState) {
    return (
      <div className="screen-container flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">
            Invalid Dare State
          </div>
          <div className="text-text-secondary text-sm mb-4">
            This dare cannot be completed because it&apos;s not in an accepted
            state.
          </div>
          <div className="text-text-secondary text-xs">
            Current state: {dareState || "Unknown"}
          </div>
          <div className="text-text-secondary text-xs mt-2">
            Redirecting back...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-container">
      <div className="nav-header">
        <div className="flex items-center justify-between p-4">
          <button onClick={onBack} className="btn-icon btn-ghost">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-white">Complete the Dare</h1>
          <div className="flex items-center space-x-2 text-[#4ade80]">
            <Clock size={16} />
            <span className="font-medium">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="card mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <Avatar
              src={resolvedChallenger.avatar}
              alt={resolvedChallenger.name}
              size="md"
              userId={challenge.challengerId}
              username={resolvedChallenger.username}
            />
            <div>
              <h3 className="font-semibold text-white">
                {resolvedChallenger.name}
              </h3>
              <p className="text-text-secondary text-sm">
                {resolvedChallenger.username}
              </p>
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-xl p-4 border-l-4 border-[#f59e0b]">
            <p className="text-white font-semibold text-lg leading-relaxed">
              {challenge.action}
            </p>
          </div>

          <div className="mt-4 flex items-center space-x-2 text-text-secondary">
            <div className="w-2 h-2 bg-[#f59e0b] rounded-full"></div>
            <span className="text-sm">One-take proof required</span>
          </div>
        </div>

        {!isSubmitted ? (
          !isPreviewMode ? (
            <div className="space-y-4">
              <button
                onClick={handleRecordVideo}
                disabled={isRecording || isCapturing}
                className="btn btn-primary w-full py-4 text-base font-semibold flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <Camera size={20} />
                <span>{isRecording ? "Recording..." : "Record Video"}</span>
              </button>

              <button
                onClick={handleTakePhoto}
                disabled={isRecording || isCapturing}
                className="btn btn-primary w-full py-4 text-base font-semibold flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <CameraIcon size={20} />
                <span>{isCapturing ? "Capturing..." : "Take Photo"}</span>
              </button>

              <button
                onClick={handleRecordVoice}
                disabled={isRecording || isCapturing}
                className="btn btn-primary w-full py-4 text-base font-semibold flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <Mic size={20} />
                <span>{isRecording ? "Recording..." : "Record Voice"}</span>
              </button>

              <button
                onClick={handleChooseFromGallery}
                disabled={isRecording || isCapturing}
                className="btn btn-primary w-full py-4 text-base font-semibold flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <Image size={20} />
                <span>Choose from Gallery</span>
              </button>

              <div className="text-center">
                <p className="text-text-secondary text-sm">
                  Once submitted, proof cannot be changed
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-white font-bold text-lg mb-4">Preview</h3>

                <div className="mb-6">
                  {previewType === "image" && (
                    <img
                      src={previewUrl || ""}
                      alt="Preview"
                      className="w-full rounded-lg"
                    />
                  )}
                  {previewType === "video" && (
                    <video
                      src={previewUrl || ""}
                      controls
                      className="w-full rounded-lg"
                    />
                  )}
                  {previewType === "audio" && (
                    <div className="bg-[#2a2a2a] rounded-lg p-6 text-center">
                      <Mic size={48} className="text-[#4ade80] mx-auto mb-4" />
                      <audio
                        src={previewUrl || ""}
                        controls
                        className="w-full"
                      />
                      <p className="text-text-secondary text-sm mt-2">
                        Voice Recording
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={clearPreview}
                    className="btn btn-secondary flex-1 py-3 text-base font-semibold"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleSubmitProof}
                    disabled={isSubmitted || isUploadingProof}
                    className="btn btn-primary flex-1 py-3 text-base font-semibold"
                  >
                    {isUploadingProof || isSubmitted
                      ? "Submitting..."
                      : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="text-center">
            <div className="card">
              <div className="w-16 h-16 bg-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-4">
                {submittedAction === "video" && (
                  <Camera size={32} className="text-black" />
                )}
                {submittedAction === "photo" && (
                  <CameraIcon size={32} className="text-black" />
                )}
                {submittedAction === "voice" && (
                  <Mic size={32} className="text-black" />
                )}
                {submittedAction === "gallery" && (
                  <Image size={32} className="text-black" />
                )}
                {!submittedAction && (
                  <Camera size={32} className="text-black" />
                )}
              </div>
              <h3 className="text-white font-bold text-xl mb-2">
                {submittedAction === "video" && "Video Recorded • Under review"}
                {submittedAction === "photo" && "Photo Taken • Under review"}
                {submittedAction === "voice" && "Voice Recorded • Under review"}
                {submittedAction === "gallery" &&
                  "Image Selected • Under review"}
                {!submittedAction && "Submitted • Under review"}
              </h3>
              <p className="text-text-secondary text-sm">
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
          </div>
        )}
      </div>
    </div>
  );
}
