"use client";

import { useParams } from "next/navigation";

import { EmailWorkspace } from "@/components/admin/email/email-workspace";

/** A draft email in the editor. */
export default function EditEmailPage() {
  const { id } = useParams<{ id: string }>();
  return <EmailWorkspace target={{ kind: "campaign", id: Number(id) }} />;
}
