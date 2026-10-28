"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateCommunityMe, uploadCommunityImage } from "@/lib/community";
import type { CommunityMe } from "@/types/community";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useLocale, useTranslations } from "next-intl";

export function JoinCard({
  me,
  onDone,
}: {
  me: CommunityMe;
  onDone: (updated: CommunityMe) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("student.communityPage");
  const [name, setName] = useState(me.display_name);
  const [avatarKey, setAvatarKey] = useState(me.avatar_key);
  const [preview, setPreview] = useState(me.avatar);
  const fileRef = useRef<HTMLInputElement>(null);

  const { run: pickPhoto, loading: uploadingPhoto } = useAsyncAction(
    async (file: File) => {
      const key = await uploadCommunityImage(file);
      setAvatarKey(key);
      setPreview(URL.createObjectURL(file));
    },
    { errorToast: t("photoError") },
  );

  const { run: save, loading: saving } = useAsyncAction(
    async () => {
      const updated = await updateCommunityMe({
        display_name: name.trim() || me.display_name,
        avatar_key: avatarKey,
      });
      localStorage.setItem("community_joined", "1");
      onDone(updated);
    },
    {
      successToast: t("welcome"),
      errorToast: t("saveError"),
    },
  );

  const busy = uploadingPhoto || saving;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <h2 className="text-lg font-semibold">{t("introTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("introText")}</p>
        <button
          type="button"
          className="relative"
          onClick={() => fileRef.current?.click()}
          aria-label={t("choosePhoto")}
        >
          <Avatar className="h-20 w-20">
            <AvatarImage src={preview} alt="" />
            <AvatarFallback>
              {(name || "?").slice(0, 2).toLocaleUpperCase(locale)}
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
          aria-label={t("displayName")}
        />
        <Button
          onClick={save}
          loading={saving}
          loadingText={t("joining")}
          disabled={busy || !name.trim()}
        >
          {t("join")}
        </Button>
      </CardContent>
    </Card>
  );
}
