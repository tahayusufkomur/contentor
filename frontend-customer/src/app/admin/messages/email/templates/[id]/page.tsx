"use client";

import { useParams } from "next/navigation";

import { EmailWorkspace } from "@/components/admin/email/email-workspace";

/** One of her email templates in the editor. */
export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  return <EmailWorkspace target={{ kind: "template", id: Number(id) }} />;
}
