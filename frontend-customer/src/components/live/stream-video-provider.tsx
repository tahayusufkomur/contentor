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

export default function StreamVideoProvider({
  apiKey,
  token,
  user,
  children,
}: StreamVideoProviderProps) {
  const [client, setClient] = useState<StreamVideoClient>();

  useEffect(() => {
    const streamUser: User = {
      id: user.id,
      name: user.name,
      image: user.image,
    };

    const videoClient = new StreamVideoClient({
      apiKey,
      user: streamUser,
      token,
    });
    setClient(videoClient);

    return () => {
      videoClient.disconnectUser().catch(console.error);
      setClient(undefined);
    };
  }, [apiKey, token, user.id, user.name, user.image]);

  if (!client) return null;

  return <StreamVideo client={client}>{children}</StreamVideo>;
}
