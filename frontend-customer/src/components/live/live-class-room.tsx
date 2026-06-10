"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Call,
  CallingState,
  StreamCall,
  useCallStateHooks,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";

import StreamVideoProvider from "./stream-video-provider";
import { acquireCall, releaseCall } from "./call-session";
import SpeakerView from "./speaker-view";
import ControlBar from "./control-bar";
import ParticipantsPanel from "./participants-panel";
import { clientFetch } from "@/lib/api-client";

interface TokenResponse {
  token: string;
  api_key: string;
  call_id: string;
  role: "host" | "viewer";
}

interface LiveClassRoomProps {
  liveClassId: string;
  userId: string;
  userName: string;
  userImage?: string;
}

export default function LiveClassRoom({
  liveClassId,
  userId,
  userName,
  userImage,
}: LiveClassRoomProps) {
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchToken() {
      try {
        const data = await clientFetch<TokenResponse>(
          `/api/v1/live/${liveClassId}/token/`,
          { method: "POST" },
        );
        setTokenData(data);
      } catch {
        setError("Failed to connect to the live class.");
      } finally {
        setLoading(false);
      }
    }
    fetchToken();
  }, [liveClassId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto" />
          <p className="mt-4 text-zinc-400">Connecting to live class...</p>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <p className="text-red-400">{error || "Connection failed."}</p>
      </div>
    );
  }

  return (
    <StreamVideoProvider
      apiKey={tokenData.api_key}
      token={tokenData.token}
      user={{ id: `u${userId}`, name: userName, image: userImage }}
    >
      <CallJoiner
        callId={tokenData.call_id}
        role={tokenData.role}
        liveClassId={liveClassId}
      />
    </StreamVideoProvider>
  );
}

interface CallJoinerProps {
  callId: string;
  role: "host" | "viewer";
  liveClassId: string;
}

function CallJoiner({ callId, role, liveClassId }: CallJoinerProps) {
  const client = useStreamVideoClient();
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    if (!client) return;

    let cancelled = false;
    const session = acquireCall(client, "default", callId);
    session.joinPromise
      .then(() => {
        if (!cancelled) setCall(session.call);
      })
      .catch(() => {
        if (!cancelled) setJoinError("Failed to join the live class.");
      });

    return () => {
      cancelled = true;
      setCall(null);
      releaseCall("default", callId);
    };
  }, [client, callId]);

  if (joinError) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400">{joinError}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-blue-400 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto" />
          <p className="mt-4 text-zinc-400">Joining call...</p>
        </div>
      </div>
    );
  }

  return (
    <StreamCall call={call}>
      <MeetingRoom role={role} liveClassId={liveClassId} />
    </StreamCall>
  );
}

interface MeetingRoomProps {
  role: "host" | "viewer";
  liveClassId: string;
}

function MeetingRoom({ role, liveClassId }: MeetingRoomProps) {
  const router = useRouter();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const [ended, setEnded] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [fitScreen, setFitScreen] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHost = role === "host";

  // Track fullscreen changes
  useEffect(() => {
    function onFsChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        setShowOverlay(true);
        startHideTimer();
      } else {
        setShowOverlay(true);
        clearHideTimer();
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      if (document.fullscreenElement) {
        setShowOverlay(false);
      }
    }, 3000);
  }, []);

  function handleMouseMove() {
    if (!isFullscreen) return;
    setShowOverlay(true);
    startHideTimer();
  }

  function handleCallEnded() {
    setEnded(true);
  }

  if (callingState === CallingState.LEFT || ended) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Class Ended</h2>
          <p className="mt-2 text-zinc-400">The live class has ended.</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-blue-400 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col h-screen bg-zinc-950 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Video area */}
      <div
        className={`flex flex-1 min-h-0 ${isFullscreen ? "p-0 gap-0" : "p-1.5 gap-1.5 sm:p-3 sm:gap-3"}`}
      >
        <div className="flex-1 min-w-0 min-h-0">
          <SpeakerView
            isHost={isHost}
            isFullscreen={isFullscreen}
            fitScreen={fitScreen}
            hideFilmstrip={isFullscreen && !showOverlay}
          />
        </div>
        {/* Participants panel — full overlay on mobile, sidebar on desktop */}
        {showParticipants && (
          <div
            className={`transition-opacity duration-300 ${
              isFullscreen && !showOverlay
                ? "opacity-0 pointer-events-none"
                : "opacity-100"
            } ${
              isFullscreen
                ? "absolute right-3 top-3 bottom-16 w-72 z-40"
                : "absolute inset-0 z-40 sm:relative sm:inset-auto sm:w-72 sm:shrink-0"
            }`}
          >
            <ParticipantsPanel
              isHost={isHost}
              onClose={() => setShowParticipants(false)}
            />
          </div>
        )}
      </div>

      {/* Control bar */}
      <div
        className={`flex justify-center pb-2 px-2 sm:pb-4 sm:px-4 shrink-0 transition-opacity duration-300 ${
          isFullscreen && !showOverlay
            ? "opacity-0 pointer-events-none"
            : "opacity-100"
        } ${isFullscreen ? "absolute bottom-0 left-0 right-0 z-40" : ""}`}
      >
        <ControlBar
          isHost={isHost}
          liveClassId={liveClassId}
          isParticipantsPanelOpen={showParticipants}
          fitScreen={fitScreen}
          onToggleParticipantsPanel={() => setShowParticipants((v) => !v)}
          onToggleFitScreen={() => setFitScreen((v) => !v)}
          onCallEnded={handleCallEnded}
        />
      </div>
    </div>
  );
}
