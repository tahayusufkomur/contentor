"use client";

import { useRouter } from "next/navigation";

import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";

export default function SetupAssistantPage() {
  const router = useRouter();

  return (
    <SetupAssistantPanel
      open={true}
      onClose={() => router.push("/admin")}
      initialTab="checklist"
    />
  );
}
