"use client";

import { useEffect, useState } from "react";
import {
  OwnCapability,
  useCall,
  useCallStateHooks,
  useRequestPermission,
  type PermissionRequestEvent,
  type StreamVideoEvent,
} from "@stream-io/video-react-sdk";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  Users,
  Circle,
  Maximize,
  Minimize,
  PhoneOff,
  LogOut,
  Hand,
  ShrinkIcon,
  Expand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";

interface ControlBarProps {
  isHost: boolean;
  liveClassId: string;
  isParticipantsPanelOpen: boolean;
  fitScreen: boolean;
  onToggleParticipantsPanel: () => void;
  onToggleFitScreen: () => void;
  onCallEnded: () => void;
}

function ControlButton({
  icon: Icon,
  label,
  active = false,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg transition-colors ${
        danger
          ? "bg-red-600 hover:bg-red-700 text-white"
          : active
            ? "bg-zinc-600 text-white"
            : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      <span className="text-[9px] sm:text-[10px] font-medium hidden sm:block">{label}</span>
    </button>
  );
}

export default function ControlBar({
  isHost,
  liveClassId,
  isParticipantsPanelOpen,
  fitScreen,
  onToggleParticipantsPanel,
  onToggleFitScreen,
  onCallEnded,
}: ControlBarProps) {
  const call = useCall();
  const {
    useLocalParticipant,
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
    useIsCallRecordingInProgress,
    useHasPermissions,
    useParticipants,
  } = useCallStateHooks();

  const localParticipant = useLocalParticipant();
  const { microphone, isMute: isMicMuted } = useMicrophoneState();
  const { camera, isMute: isCamMuted } = useCameraState();
  const { screenShare, isMute: isScreenShareOff } = useScreenShareState();
  const isRecording = useIsCallRecordingInProgress();
  const canSendAudio = useHasPermissions(OwnCapability.SEND_AUDIO);
  const canSendVideo = useHasPermissions(OwnCapability.SEND_VIDEO);
  const participants = useParticipants();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [permissionRequests, setPermissionRequests] = useState<
    PermissionRequestEvent[]
  >([]);

  // Permission request listener for host
  useEffect(() => {
    if (!call || !isHost) return;
    const unsubscribe = call.on(
      "call.permission_request",
      (event: StreamVideoEvent) => {
        if (event.type === "call.permission_request") {
          const permEvent = event as PermissionRequestEvent;
          if (permEvent.user.id !== localParticipant?.userId) {
            setPermissionRequests((prev) => [...prev, permEvent]);
          }
        }
      },
    );
    return () => unsubscribe();
  }, [call, isHost, localParticipant?.userId]);

  // Fullscreen change listener
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Student raise hand
  const {
    requestPermission: requestAudio,
    isAwaitingPermission: awaitingAudio,
    canRequestPermission: canRequestAudio,
  } = useRequestPermission(OwnCapability.SEND_AUDIO);

  async function toggleMic() {
    if (isMicMuted) {
      await microphone.enable();
    } else {
      await microphone.disable();
    }
  }

  async function toggleCam() {
    if (isCamMuted) {
      await camera.enable();
    } else {
      await camera.disable();
    }
  }

  async function toggleScreenShare() {
    if (isScreenShareOff) {
      await screenShare.enable();
    } else {
      await screenShare.disable();
    }
  }

  async function toggleRecording() {
    if (!call) return;
    if (isRecording) {
      await call.stopRecording();
    } else {
      await call.startRecording();
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  async function handleEndCall() {
    setEnding(true);
    try {
      await clientFetch(`/api/v1/live/${liveClassId}/stop/`, {
        method: "POST",
      });
    } catch {
      // may already be ended
    }
    onCallEnded();
  }

  function handleLeave() {
    call?.leave();
    onCallEnded();
  }

  async function handleRaiseHand() {
    if (canRequestAudio) {
      await requestAudio();
    }
  }

  async function handleGrantPermission(request: PermissionRequestEvent) {
    if (!call) return;
    await call.grantPermissions(request.user.id, request.permissions);
    setPermissionRequests((prev) => prev.filter((r) => r !== request));
  }

  async function handleRejectPermission(request: PermissionRequestEvent) {
    setPermissionRequests((prev) => prev.filter((r) => r !== request));
  }

  const showRaiseHand = !isHost && !canSendAudio && canRequestAudio;

  return (
    <>
      {/* Permission request toasts */}
      {permissionRequests.length > 0 && (
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
          {permissionRequests.map((request, i) => (
            <div
              key={i}
              className="rounded-lg bg-zinc-800 border border-zinc-600 p-3 shadow-lg text-white"
            >
              <p className="text-sm">
                <span className="font-medium">
                  {request.user.name || request.user.id}
                </span>{" "}
                wants to speak
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleGrantPermission(request)}
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-300"
                  onClick={() => handleRejectPermission(request)}
                >
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Control bar */}
      <div className="flex items-center justify-center gap-0.5 sm:gap-1 bg-zinc-900 rounded-xl px-2 py-1.5 sm:px-4 sm:py-2">
        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-1.5 mr-3 px-2 py-1 rounded-full bg-red-900/50">
            <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500 animate-pulse" />
            <span className="text-red-400 text-[10px] font-medium">REC</span>
          </div>
        )}

        {/* Mic */}
        {(isHost || canSendAudio) && (
          <ControlButton
            icon={isMicMuted ? MicOff : Mic}
            label={isMicMuted ? "Unmute" : "Mute"}
            active={!isMicMuted}
            onClick={toggleMic}
          />
        )}

        {/* Camera */}
        {(isHost || canSendVideo) && (
          <ControlButton
            icon={isCamMuted ? VideoOff : Video}
            label={isCamMuted ? "Start Video" : "Stop Video"}
            active={!isCamMuted}
            onClick={toggleCam}
          />
        )}

        {/* Screen Share — host only */}
        {isHost && (
          <ControlButton
            icon={isScreenShareOff ? MonitorUp : MonitorOff}
            label={isScreenShareOff ? "Share" : "Stop Share"}
            active={!isScreenShareOff}
            onClick={toggleScreenShare}
          />
        )}

        {/* Participants */}
        <div className="relative">
          <ControlButton
            icon={Users}
            label={`People (${participants.length})`}
            active={isParticipantsPanelOpen}
            onClick={onToggleParticipantsPanel}
          />
        </div>

        {/* Record — host only */}
        {isHost && (
          <ControlButton
            icon={Circle}
            label={isRecording ? "Stop Rec" : "Record"}
            active={isRecording}
            onClick={toggleRecording}
          />
        )}

        {/* Fit Screen toggle — mobile only */}
        <div className="sm:hidden">
          <ControlButton
            icon={fitScreen ? ShrinkIcon : Expand}
            label={fitScreen ? "Original" : "Fit"}
            active={!fitScreen}
            onClick={onToggleFitScreen}
          />
        </div>

        {/* Fullscreen */}
        <ControlButton
          icon={isFullscreen ? Minimize : Maximize}
          label={isFullscreen ? "Exit" : "Fullscreen"}
          onClick={toggleFullscreen}
        />

        {/* Raise Hand — student only */}
        {showRaiseHand && (
          <ControlButton
            icon={Hand}
            label={awaitingAudio ? "Waiting..." : "Raise Hand"}
            disabled={awaitingAudio}
            onClick={handleRaiseHand}
          />
        )}

        {/* Separator */}
        <div className="w-px h-6 sm:h-8 bg-zinc-700 mx-1 sm:mx-2" />

        {/* End / Leave */}
        {isHost ? (
          <ControlButton
            icon={PhoneOff}
            label={ending ? "Ending..." : "End Class"}
            danger
            disabled={ending}
            onClick={handleEndCall}
          />
        ) : (
          <ControlButton
            icon={LogOut}
            label="Leave"
            danger
            onClick={handleLeave}
          />
        )}
      </div>
    </>
  );
}
