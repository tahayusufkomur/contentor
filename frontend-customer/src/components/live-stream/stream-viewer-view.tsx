"use client";

import { useEffect, useState } from "react";
import {
  ParticipantView,
  useCallStateHooks,
  useParticipantViewContext,
} from "@stream-io/video-react-sdk";
import { Users, Eye, EyeOff, Maximize, Minimize } from "lucide-react";

function ViewerOverlay() {
  const { participant } = useParticipantViewContext();
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <span className="text-white text-xs font-medium truncate">
          {participant.name || participant.userId}
        </span>
      </div>
    </div>
  );
}

export default function StreamViewerView() {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const [showPip, setShowPip] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Find the host (broadcaster)
  const host = participants.find((p) => p.roles?.includes("host"));
  const isScreenSharing = host?.publishedTracks.includes(3) ?? false;
  const hostHasVideo = host?.publishedTracks.includes(2) ?? false;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 bg-zinc-900 relative">
        {host ? (
          <div className="w-full h-full">
            <ParticipantView
              participant={host}
              trackType={isScreenSharing ? "screenShareTrack" : undefined}
              ParticipantViewUI={<ViewerOverlay />}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-400">Waiting for host to start...</p>
          </div>
        )}

        {/* PiP camera during screen share */}
        {isScreenSharing && hostHasVideo && host && showPip && (
          <div className="absolute top-3 right-3 z-20 w-36 sm:w-44 aspect-video rounded-lg overflow-hidden border-2 border-zinc-700 shadow-lg">
            <ParticipantView
              participant={host}
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
        {isScreenSharing && hostHasVideo && !showPip && (
          <button
            onClick={() => setShowPip(true)}
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-white hover:bg-black/80"
            title="Show camera"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs">Show cam</span>
          </button>
        )}

        {/* Viewer count badge */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">LIVE</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1">
            <Users className="h-3 w-3 text-white" />
            <span className="text-white text-xs">{participants.length}</span>
          </div>
        </div>

        {/* Fullscreen button */}
        <button
          onClick={() =>
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen()
          }
          className="absolute bottom-3 right-3 z-20 p-2 rounded-lg bg-black/60 text-white hover:bg-black/80"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
