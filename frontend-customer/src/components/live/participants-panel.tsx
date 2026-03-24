"use client";

import { useEffect, useRef, useState } from "react";
import {
  OwnCapability,
  useCall,
  useCallStateHooks,
  type StreamVideoParticipant,
} from "@stream-io/video-react-sdk";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  X,
  VolumeX,
  UserX,
  Ban,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ParticipantsPanelProps {
  isHost: boolean;
  onClose: () => void;
}

export default function ParticipantsPanel({
  isHost,
  onClose,
}: ParticipantsPanelProps) {
  const call = useCall();
  const { useParticipants, useLocalParticipant } = useCallStateHooks();
  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "kick" | "block";
    userId: string;
    name: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpen]);

  async function toggleAudio(userId: string, hasAudio: boolean) {
    if (!call) return;
    try {
      if (hasAudio) {
        // Revoke permission — mutes and prevents re-unmuting
        await call.revokePermissions(userId, [OwnCapability.SEND_AUDIO]);
      } else {
        // Grant permission — allows user to unmute
        await call.grantPermissions(userId, [OwnCapability.SEND_AUDIO]);
      }
    } catch (e) {
      console.error("Failed to toggle audio:", e);
    }
  }

  async function toggleVideo(userId: string, hasVideo: boolean) {
    if (!call) return;
    try {
      if (hasVideo) {
        await call.revokePermissions(userId, [OwnCapability.SEND_VIDEO]);
      } else {
        await call.grantPermissions(userId, [OwnCapability.SEND_VIDEO]);
      }
    } catch (e) {
      console.error("Failed to toggle video:", e);
    }
  }

  async function muteAllAudio() {
    if (!call) return;
    try {
      await call.muteAllUsers("audio");
    } catch (e) {
      console.error("Failed to mute all audio:", e);
    }
  }

  async function muteAllVideo() {
    if (!call) return;
    try {
      await call.muteAllUsers("video");
    } catch (e) {
      console.error("Failed to mute all video:", e);
    }
  }

  async function kickUser(userId: string) {
    if (!call) return;
    try {
      await call.kickUser({ user_id: userId });
    } catch (e) {
      console.error("Failed to kick user:", e);
    }
    setConfirmAction(null);
  }

  async function blockUser(userId: string) {
    if (!call) return;
    try {
      await call.kickUser({ user_id: userId, block: true });
    } catch (e) {
      console.error("Failed to block user:", e);
    }
    setConfirmAction(null);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <h3 className="text-white text-sm font-semibold">
          Participants ({participants.length})
        </h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Host bulk actions */}
      {isHost && participants.length > 1 && (
        <div className="flex gap-1.5 px-3 py-2 border-b border-zinc-700">
          <button
            onClick={muteAllAudio}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700"
          >
            <VolumeX className="h-3 w-3" />
            Mute All
          </button>
          <button
            onClick={muteAllVideo}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700"
          >
            <VideoOff className="h-3 w-3" />
            Stop All Video
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-800">
          <p className="text-xs text-white mb-2">
            {confirmAction.type === "block" ? "Block" : "Remove"}{" "}
            <span className="font-medium">{confirmAction.name}</span>
            {confirmAction.type === "block"
              ? "? They won't be able to rejoin."
              : " from the call?"}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={
                confirmAction.type === "block" ? "destructive" : "default"
              }
              className="h-6 text-xs"
              onClick={() =>
                confirmAction.type === "block"
                  ? blockUser(confirmAction.userId)
                  : kickUser(confirmAction.userId)
              }
            >
              {confirmAction.type === "block" ? "Block" : "Remove"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-zinc-300"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {participants.map((p) => {
          const isLocal = p.sessionId === localParticipant?.sessionId;
          const hasAudio = p.publishedTracks.includes(1);
          const hasVideo = p.publishedTracks.includes(2);

          return (
            <div
              key={p.sessionId}
              className="flex items-center justify-between px-2 py-2 rounded hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-zinc-700 text-white text-xs font-medium shrink-0">
                  {(p.name || p.userId || "?").charAt(0).toUpperCase()}
                </div>
                <span className="text-white text-sm truncate">
                  {p.name || p.userId}
                  {isLocal && (
                    <span className="text-zinc-400 ml-1">(You)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Audio toggle / status */}
                {isHost && !isLocal ? (
                  <button
                    onClick={() => toggleAudio(p.userId, hasAudio)}
                    className={`p-1 rounded ${
                      hasAudio
                        ? "text-green-400 border border-green-500/50 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50"
                        : "text-red-400 border border-red-500/50 hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/50"
                    }`}
                    title={
                      hasAudio
                        ? "Mute — will mute and prevent unmuting"
                        : "Allow audio — grants permission to unmute"
                    }
                  >
                    {hasAudio ? (
                      <Mic className="h-4 w-4" />
                    ) : (
                      <MicOff className="h-4 w-4" />
                    )}
                  </button>
                ) : hasAudio ? (
                  <Mic className="h-4 w-4 text-zinc-400" />
                ) : (
                  <MicOff className="h-4 w-4 text-red-400" />
                )}

                {/* Video toggle / status */}
                {isHost && !isLocal ? (
                  <button
                    onClick={() => toggleVideo(p.userId, hasVideo)}
                    className={`p-1 rounded ${
                      hasVideo
                        ? "text-green-400 border border-green-500/50 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50"
                        : "text-red-400 border border-red-500/50 hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/50"
                    }`}
                    title={
                      hasVideo
                        ? "Stop video — will disable and prevent re-enabling"
                        : "Allow video — grants permission to enable camera"
                    }
                  >
                    {hasVideo ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <VideoOff className="h-4 w-4" />
                    )}
                  </button>
                ) : hasVideo ? (
                  <Video className="h-4 w-4 text-zinc-400" />
                ) : (
                  <VideoOff className="h-4 w-4 text-red-400" />
                )}

                {/* 3-dot menu for kick/block */}
                {isHost && !isLocal && (
                  <div className="relative" ref={menuOpen === p.sessionId ? menuRef : undefined}>
                    <button
                      onClick={() =>
                        setMenuOpen((prev) =>
                          prev === p.sessionId ? null : p.sessionId,
                        )
                      }
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpen === p.sessionId && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            setConfirmAction({
                              type: "kick",
                              userId: p.userId,
                              name: p.name || p.userId,
                            });
                          }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-orange-400"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Remove
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            setConfirmAction({
                              type: "block",
                              userId: p.userId,
                              name: p.name || p.userId,
                            });
                          }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-red-400"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Block
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
