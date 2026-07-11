"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateCommunityMe, uploadCommunityImage } from "@/lib/community";
import type { CommunityMe } from "@/types/community";

export function JoinCard({
  me,
  onDone,
}: {
  me: CommunityMe;
  onDone: (updated: CommunityMe) => void;
}) {
  const [name, setName] = useState(me.display_name);
  const [avatarKey, setAvatarKey] = useState(me.avatar_key);
  const [preview, setPreview] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (file: File) => {
    setBusy(true);
    try {
      const key = await uploadCommunityImage(file);
      setAvatarKey(key);
      setPreview(URL.createObjectURL(file));
    } catch {
      toast.error("Photo upload failed — try a smaller image.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateCommunityMe({
        display_name: name.trim() || me.display_name,
        avatar_key: avatarKey,
      });
      localStorage.setItem("community_joined", "1");
      toast.success("Welcome to the community!");
      onDone(updated);
    } catch {
      toast.error("Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <h2 className="text-lg font-semibold">Introduce yourself</h2>
        <p className="text-sm text-muted-foreground">
          Pick the name and photo other members will see.
        </p>
        <button
          type="button"
          className="relative"
          onClick={() => fileRef.current?.click()}
          aria-label="Choose profile photo"
        >
          <Avatar className="h-20 w-20">
            <AvatarImage src={preview} alt="" />
            <AvatarFallback>
              {(name || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
          }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          className="max-w-xs text-center"
          aria-label="Display name"
        />
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Join the community
        </Button>
      </CardContent>
    </Card>
  );
}
