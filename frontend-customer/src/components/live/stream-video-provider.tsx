"use client";

import { useEffect, useState } from "react";
import {
  StreamVideo,
  StreamVideoClient,
  User,
} from "@stream-io/video-react-sdk";

interface StreamVideoProviderProps {
  apiKey: string;
  token: string;
  user: { id: string; name: string; image?: string };
  children: React.ReactNode;
}

// Deferred disconnects, keyed by user — React StrictMode unmounts and
// immediately remounts in dev; disconnecting the websocket from the first
// mount's cleanup would kill the session the remount just joined. The remount
// cancels the pending disconnect; a real unmount lets it fire.
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();

export default function StreamVideoProvider({
  apiKey,
  token,
  user,
  children,
}: StreamVideoProviderProps) {
  const [client, setClient] = useState<StreamVideoClient>();

  useEffect(() => {
    const key = `${apiKey}:${user.id}`;
    const pending = pendingDisconnects.get(key);
    if (pending) {
      clearTimeout(pending);
      pendingDisconnects.delete(key);
    }

    const streamUser: User = {
      id: user.id,
      name: user.name,
      image: user.image,
    };

    // getOrCreateInstance (not `new`) — a second client for the same user
    // orphans the first call session (the SDK warns about it).
    const videoClient = StreamVideoClient.getOrCreateInstance({
      apiKey,
      user: streamUser,
      token,
    });
    setClient(videoClient);

    return () => {
      setClient(undefined);
      pendingDisconnects.set(
        key,
        setTimeout(() => {
          pendingDisconnects.delete(key);
          videoClient.disconnectUser().catch(console.error);
        }, 0),
      );
    };
  }, [apiKey, token, user.id, user.name, user.image]);

  if (!client) return null;

  return <StreamVideo client={client}>{children}</StreamVideo>;
}
