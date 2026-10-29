"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { PlatformEmailEditor } from "@/components/admin/email/platform-email-editor";
import { RecipientSelector } from "@/components/admin/email/recipient-selector";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import {
  createTemplate,
  getCampaign,
  sendDraft,
  sendTest,
  updateDraft,
  type EmailCampaign,
  type RecipientFilter,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

/** A platform email being written: the editor, a test to yourself, and the send. */
export default function PlatformDraftPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<RecipientFilter>({
    type: "all_coaches",
  });
  const [count, setCount] = useState<number | null>(null);
  const flush = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    getCampaign(id)
      .then((c) => {
        if (c.status !== "draft") navigate(`/admin/email/campaigns/${id}`);
        else setCampaign(c);
      })
      .catch(setError);
  }, [id, navigate]);

  const test = useAsyncAction(async () => {
    await flush.current?.();
    const { sent_to } = await sendTest(id);
    toast.success(`Test sent to ${sent_to}`);
  });
  const keep = useAsyncAction(async () => {
    await flush.current?.();
    const fresh = await getCampaign(id);
    await createTemplate({
      name: fresh.subject || "Untitled",
      subject: fresh.subject,
      preheader: fresh.preheader,
      design: fresh.design,
    });
    toast.success("Saved as a template");
  });
  const send = useAsyncAction(async () => {
    await flush.current?.();
    await sendDraft(id, filter);
    toast.success("Your email is on its way");
    navigate("/admin/email");
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavLink
          href="/admin/email"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Emails
        </NavLink>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => test.run()}
            loading={test.loading}
            loadingText="Sending…"
          >
            Send me a test
          </Button>
          <Button
            variant="outline"
            onClick={() => keep.run()}
            loading={keep.loading}
            loadingText="Saving…"
          >
            Save as template
          </Button>
          <Button onClick={() => setSending(true)}>Send…</Button>
        </div>
      </div>

      <PageState
        loading={!campaign && !error}
        error={error}
        skeleton={<SkeletonForm />}
      >
        {campaign && (
          <PlatformEmailEditor
            initial={{
              subject: campaign.subject,
              preheader: campaign.preheader,
              design: campaign.design!,
            }}
            save={(fields) => updateDraft(id, fields)}
            flushRef={flush}
          />
        )}
      </PageState>

      {sending && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          onClick={() => setSending(false)}
        >
          <aside
            className="h-full w-full max-w-md space-y-6 overflow-y-auto border-l bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold">Send to creators</h2>
              <p className="text-sm text-muted-foreground">
                It goes out as soon as you press send.
              </p>
            </div>
            <RecipientSelector
              value={filter}
              onChange={setFilter}
              recipientCount={count}
              onCountChange={setCount}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSending(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => send.run()}
                loading={send.loading}
                loadingText="Sending…"
              >
                Send now
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
