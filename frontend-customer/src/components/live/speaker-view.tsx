"use client";

import { useMemo, useState } from "react";
import {
  type StreamVideoParticipant,
  useCallStateHooks,
  useCall,
} from "@stream-io/video-react-sdk";
import { ChevronLeft, ChevronRight } from "lucide-react";
import VideoTile from "./video-tile";

interface SpeakerViewProps {
  isHost: boolean;
  isFullscreen?: boolean;
  fitScreen?: boolean;
  hideFilmstrip?: boolean;
}

const FILMSTRIP_PAGE_SIZE = 6;

export default function SpeakerView({ isHost, isFullscreen = false, fitScreen = true, hideFilmstrip = false }: SpeakerViewProps) {
  const call = useCall();
  const { useParticipants, useDominantSpeaker, useLocalParticipant } =
    useCallStateHooks();
  const participants = useParticipants();
  const dominantSpeaker = useDominantSpeaker();
  const localParticipant = useLocalParticipant();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [filmstripPage, setFilmstripPage] = useState(0);

  // Detect active screen share (track type 3 = SCREEN_SHARE)
  const screenSharer = useMemo(() => {
    return participants.find((p) => p.publishedTracks.includes(3)) || null;
  }, [participants]);

  const speaker = useMemo(() => {
    if (pinnedId) {
      return participants.find((p) => p.sessionId === pinnedId) || null;
    }
    // Screen share takes priority over everything
    if (screenSharer) return screenSharer;
    // Default: host video centered for everyone
    const host = participants.find((p) => p.roles?.includes("host"));
    if (host) return host;
    // Fallback
    return localParticipant || null;
  }, [pinnedId, participants, screenSharer, localParticipant]);

  const isShowingScreenShare = !pinnedId && !!screenSharer;

  const filmstripParticipants = useMemo(() => {
    // When showing screen share, keep the sharer's camera tile in filmstrip
    if (isShowingScreenShare) return participants;
    return participants.filter((p) => p.sessionId !== speaker?.sessionId);
  }, [participants, speaker, isShowingScreenShare]);

  const totalFilmstripPages = Math.max(
    1,
    Math.ceil(filmstripParticipants.length / FILMSTRIP_PAGE_SIZE),
  );
  const pagedFilmstrip = filmstripParticipants.slice(
    filmstripPage * FILMSTRIP_PAGE_SIZE,
    (filmstripPage + 1) * FILMSTRIP_PAGE_SIZE,
  );

  function handlePin(sessionId: string) {
    setPinnedId((prev) => (prev === sessionId ? null : sessionId));
  }

  if (!speaker) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900 rounded-lg">
        <p className="text-zinc-400">Waiting for participants...</p>
      </div>
    );
  }

  return (
    <div className={`flex h-full ${isFullscreen ? "gap-0" : "gap-1.5 sm:gap-2"} flex-col sm:flex-row`}>
      {/* Main speaker */}
      <div className="flex-1 min-w-0 min-h-0">
        <VideoTile
          participant={speaker}
          className={`w-full h-full ${isFullscreen ? "!rounded-none !border-0" : ""}`}
          trackType={isShowingScreenShare ? "screenShareTrack" : undefined}
          fitScreen={fitScreen}
          isLocal={!isShowingScreenShare && speaker.sessionId === localParticipant?.sessionId}
          isSpeaker={!pinnedId && dominantSpeaker?.sessionId === speaker.sessionId}
          showPinButton={isHost}
          onPin={handlePin}
        />
      </div>

      {/* Filmstrip — horizontal bottom on mobile, vertical right on desktop */}
      {filmstripParticipants.length > 0 && (
        <div
          className={`flex shrink-0 transition-all duration-300 ${
            hideFilmstrip
              ? "h-0 sm:h-auto sm:w-0 opacity-0 overflow-hidden pointer-events-none"
              : "h-20 sm:h-auto sm:w-44 opacity-100"
          } flex-row sm:flex-col gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto`}
        >
          {totalFilmstripPages > 1 && filmstripPage > 0 && (
            <button
              onClick={() => setFilmstripPage((p) => p - 1)}
              className="flex items-center justify-center py-1 px-2 sm:px-0 rounded bg-zinc-800 hover:bg-zinc-700 text-white shrink-0"
            >
              <ChevronLeft className="h-4 w-4 sm:rotate-90" />
            </button>
          )}

          {pagedFilmstrip.map((p) => (
            <VideoTile
              key={p.sessionId}
              participant={p}
              className="h-full sm:h-auto aspect-video sm:w-full shrink-0"
              isLocal={p.sessionId === localParticipant?.sessionId}
              showPinButton={isHost}
              onPin={handlePin}
            />
          ))}

          {totalFilmstripPages > 1 &&
            filmstripPage < totalFilmstripPages - 1 && (
              <button
                onClick={() => setFilmstripPage((p) => p + 1)}
                className="flex items-center justify-center py-1 px-2 sm:px-0 rounded bg-zinc-800 hover:bg-zinc-700 text-white shrink-0"
              >
                <ChevronRight className="h-4 w-4 sm:rotate-90" />
              </button>
            )}
        </div>
      )}
    </div>
  );
}
