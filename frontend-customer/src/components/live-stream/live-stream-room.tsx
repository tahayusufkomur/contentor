"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Call,
  CallingState,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { acquireCall, releaseCall } from "@/components/live/call-session";
import { StreamChat, Channel as ChatChannel } from "stream-chat";
import { clientFetch } from "@/lib/api-client";
import StreamHostView from "./stream-host-view";
import StreamViewerView from "./stream-viewer-view";
import StreamChatPanel from "./stream-chat-panel";

interface TokenResponse {
  token: string;
  api_key: string;
  call_id: string;
  role: "host" | "viewer";
}

interface LiveStreamRoomProps {
  streamId: string;
  userId: string;
  userName: string;
  userImage?: string;
}

export default function LiveStreamRoom({
  streamId,
  userId,
  userName,
  userImage,
}: LiveStreamRoomProps) {
  const router = useRouter();
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(
    null,
  );
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [chatChannel, setChatChannel] = useState<ChatChannel | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [ended, setEnded] = useState(false);

  // Fetch token
  useEffect(() => {
    async function fetchToken() {
      try {
        const data = await clientFetch<TokenResponse>(
          `/api/v1/live-streams/${streamId}/token/`,
          { method: "POST" },
        );
        setTokenData(data);
      } catch {
        setError("Failed to connect to the live stream.");
      } finally {
        setLoading(false);
      }
    }
    fetchToken();
  }, [streamId]);

  // Initialize video + chat clients
  useEffect(() => {
    if (!tokenData) return;

    const streamUserId = `u${userId}`;

    // Video client — getOrCreateInstance is StrictMode-safe (a second `new`
    // client for the same user orphans the first call session).
    const vc = StreamVideoClient.getOrCreateInstance({
      apiKey: tokenData.api_key,
      user: { id: streamUserId, name: userName, image: userImage },
      token: tokenData.token,
    });
    setVideoClient(vc);

    // Chat client
    const cc = StreamChat.getInstance(tokenData.api_key);
    cc.connectUser(
      { id: streamUserId, name: userName, image: userImage },
      tokenData.token,
    ).then(() => {
      const channel = cc.channel("livestream", tokenData.call_id, {
        name: "Live Chat",
      });
      channel.watch().then(() => setChatChannel(channel));
    });
    setChatClient(cc);

    return () => {
      vc.disconnectUser();
      cc.disconnectUser();
      setVideoClient(null);
      setChatClient(null);
      setChatChannel(null);
    };
  }, [tokenData, userId, userName, userImage]);

  // Join call
  useEffect(() => {
    if (!videoClient || !tokenData) return;

    let cancelled = false;
    const session = acquireCall(videoClient, "livestream", tokenData.call_id);
    session.joinPromise
      .then(() => {
        if (!cancelled) setCall(session.call);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to join the live stream.");
      });

    return () => {
      cancelled = true;
      setCall(null);
      releaseCall("livestream", tokenData.call_id);
    };
  }, [videoClient, tokenData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto" />
          <p className="mt-4 text-zinc-400">Connecting to live stream...</p>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400">{error || "Connection failed."}</p>
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

  if (!videoClient || !call) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto" />
          <p className="mt-4 text-zinc-400">Joining stream...</p>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Stream Ended</h2>
          <p className="mt-2 text-zinc-400">The live stream has ended.</p>
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

  const isHost = tokenData.role === "host";

  return (
    <StreamVideo client={videoClient}>
      <StreamCall call={call}>
        <div className="flex flex-col sm:flex-row h-screen bg-zinc-950 overflow-hidden">
          {/* Video area */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            {isHost ? (
              <StreamHostView
                streamId={streamId}
                onEnded={() => setEnded(true)}
              />
            ) : (
              <StreamViewerView />
            )}
          </div>

          {/* Chat sidebar */}
          {chatClient && chatChannel && (
            <div className="h-64 sm:h-auto sm:w-80 shrink-0 border-t sm:border-t-0 sm:border-l border-zinc-800">
              <StreamChatPanel
                client={chatClient}
                channel={chatChannel}
                userId={`u${userId}`}
              />
            </div>
          )}
        </div>
      </StreamCall>
    </StreamVideo>
  );
}
