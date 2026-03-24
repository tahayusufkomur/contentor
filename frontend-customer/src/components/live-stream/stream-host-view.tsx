"use client";

import { useEffect, useState } from "react";
import {
  useCall,
  useCallStateHooks,
  useParticipantViewContext,
  ParticipantView,
} from "@stream-io/video-react-sdk";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  Circle,
  PhoneOff,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
} from "lucide-react";
import { clientFetch } from "@/lib/api-client";

interface StreamHostViewProps {
  streamId: string;
  onEnded: () => void;
}

function HostOverlay() {
  const { participant } = useParticipantViewContext();
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <span className="text-white text-xs font-medium truncate">
          {participant.name || participant.userId}
        </span>
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white">
          HOST
        </span>
      </div>
    </div>
  );
}

export default function StreamHostView({
  streamId,
  onEnded,
}: StreamHostViewProps) {
  const call = useCall();
  const {
    useLocalParticipant,
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
    useIsCallRecordingInProgress,
    useParticipants,
  } = useCallStateHooks();

  const localParticipant = useLocalParticipant();
  const { microphone, isMute: isMicMuted } = useMicrophoneState();
  const { camera, isMute: isCamMuted } = useCameraState();
  const { screenShare, isMute: isScreenShareOff } = useScreenShareState();
  const isRecording = useIsCallRecordingInProgress();
  const participants = useParticipants();
  const [ending, setEnding] = useState(false);
  const [showPip, setShowPip] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSharing = !isScreenShareOff;

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function handleEndStream() {
    setEnding(true);
    try {
      await clientFetch(`/api/v1/live-streams/${streamId}/stop/`, {
        method: "POST",
      });
    } catch {
      // may already be ended
    }
    onEnded();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Video */}
      <div className="flex-1 min-h-0 bg-zinc-900 relative">
        {localParticipant ? (
          <div className="w-full h-full">
            <ParticipantView
              participant={localParticipant}
              trackType={isScreenShareOff ? undefined : "screenShareTrack"}
              ParticipantViewUI={<HostOverlay />}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-400">Starting stream...</p>
          </div>
        )}

        {/* PiP camera during screen share */}
        {isSharing && showPip && localParticipant && (
          <div className="absolute top-3 right-3 z-20 w-40 sm:w-48 aspect-video rounded-lg overflow-hidden border-2 border-zinc-700 shadow-lg">
            <ParticipantView
              participant={localParticipant}
              trackType="videoTrack"
              ParticipantViewUI={null}
            />
            <button
              onClick={() => setShowPip(false)}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-black/80 z-10"
              title="Hide camera"
            >
              <EyeOff className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Show PiP button when hidden */}
        {isSharing && !showPip && (
          <button
            onClick={() => setShowPip(true)}
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-white hover:bg-black/80"
            title="Show camera"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs">Show cam</span>
          </button>
        )}

        {/* Viewer count */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">LIVE</span>
          </div>
          <div className="rounded-full bg-black/60 px-3 py-1">
            <span className="text-white text-xs">
              {participants.length} watching
            </span>
          </div>
          {isRecording && (
            <div className="flex items-center gap-1 rounded-full bg-red-900/60 px-2 py-1">
              <Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />
              <span className="text-red-400 text-[10px] font-medium">REC</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 bg-zinc-900 px-3 py-2 shrink-0">
        <HostButton
          icon={isMicMuted ? MicOff : Mic}
          label={isMicMuted ? "Unmute" : "Mute"}
          active={!isMicMuted}
          onClick={() =>
            isMicMuted ? microphone.enable() : microphone.disable()
          }
        />
        <HostButton
          icon={isCamMuted ? VideoOff : Video}
          label={isCamMuted ? "Start Video" : "Stop Video"}
          active={!isCamMuted}
          onClick={() => (isCamMuted ? camera.enable() : camera.disable())}
        />
        <HostButton
          icon={isScreenShareOff ? MonitorUp : MonitorOff}
          label={isScreenShareOff ? "Share" : "Stop Share"}
          active={!isScreenShareOff}
          onClick={() =>
            isScreenShareOff ? screenShare.enable() : screenShare.disable()
          }
        />
        <HostButton
          icon={Circle}
          label={isRecording ? "Stop Rec" : "Record"}
          active={isRecording}
          onClick={() =>
            call &&
            (isRecording ? call.stopRecording() : call.startRecording())
          }
        />
        <HostButton
          icon={isFullscreen ? Minimize : Maximize}
          label={isFullscreen ? "Exit" : "Fullscreen"}
          onClick={() =>
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen()
          }
        />
        <div className="w-px h-6 bg-zinc-700 mx-1" />
        <HostButton
          icon={PhoneOff}
          label={ending ? "Ending..." : "End Stream"}
          danger
          disabled={ending}
          onClick={handleEndStream}
        />
      </div>
    </div>
  );
}

function HostButton({
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
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg transition-colors ${
        danger
          ? "bg-red-600 hover:bg-red-700 text-white"
          : active
            ? "bg-zinc-600 text-white"
            : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      <span className="text-[9px] sm:text-[10px] font-medium hidden sm:block">
        {label}
      </span>
    </button>
  );
}
