"use client";

import { forwardRef } from "react";
import {
  ParticipantView,
  type StreamVideoParticipant,
  type VideoPlaceholderProps,
  useParticipantViewContext,
} from "@stream-io/video-react-sdk";
import { Mic, MicOff, Pin } from "lucide-react";

interface VideoTileProps {
  participant: StreamVideoParticipant;
  className?: string;
  trackType?: "videoTrack" | "screenShareTrack";
  fitScreen?: boolean;
  isSpeaker?: boolean;
  isLocal?: boolean;
  onPin?: (sessionId: string) => void;
  showPinButton?: boolean;
}

function TileOverlay() {
  const { participant } = useParticipantViewContext();
  const isMuted = !participant.publishedTracks.includes(1);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* Name + mic indicator at bottom */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 sm:gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 sm:px-3 sm:py-2">
        {isMuted ? (
          <MicOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-400 shrink-0" />
        ) : (
          <Mic className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white shrink-0" />
        )}
        <span className="text-white text-[10px] sm:text-xs font-medium truncate">
          {participant.name || participant.userId}
        </span>
      </div>
    </div>
  );
}

const Placeholder = forwardRef<HTMLDivElement, VideoPlaceholderProps>(
  function Placeholder({ style }, ref) {
    const { participant } = useParticipantViewContext();
    const initials = (participant.name || participant.userId || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return (
      <div
        ref={ref}
        className="flex items-center justify-center bg-zinc-800 w-full h-full"
        style={style}
      >
        <div className="flex items-center justify-center rounded-full bg-zinc-600 h-12 w-12 sm:h-20 sm:w-20 text-white text-lg sm:text-2xl font-semibold">
          {initials}
        </div>
      </div>
    );
  },
);

export default function VideoTile({
  participant,
  className = "",
  trackType,
  fitScreen,
  isSpeaker = false,
  isLocal = false,
  onPin,
  showPinButton = false,
}: VideoTileProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-zinc-900 group ${
        isLocal
          ? "border-2 border-green-500"
          : isSpeaker
            ? "border-2 border-green-500"
            : "border-2 border-transparent"
      } ${fitScreen === false ? "video-contain" : ""} ${className}`}
    >
      <ParticipantView
        participant={participant}
        trackType={trackType}
        ParticipantViewUI={<TileOverlay />}
        VideoPlaceholder={Placeholder}
      />
      {showPinButton && onPin && (
        <button
          onClick={() => onPin(participant.sessionId)}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto hover:bg-black/70"
          title="Spotlight"
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
