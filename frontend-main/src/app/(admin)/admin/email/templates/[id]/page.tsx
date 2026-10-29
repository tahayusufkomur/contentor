"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PlatformEmailEditor } from "@/components/admin/email/platform-email-editor";
import { Input } from "@/components/ui/input";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import {
  getTemplate,
  updateTemplate,
  type PlatformTemplate,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

/** A platform template in the editor: saved as you go. */
export default function PlatformTemplateEditPage() {
  const id = Number(useParams().id);
  const [template, setTemplate] = useState<PlatformTemplate | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getTemplate(id)
      .then((t) => {
        setTemplate(t);
        setName(t.name);
      })
      .catch(setError);
  }, [id]);

  return (
    <div className="space-y-5">
      <NavLink
        href="/admin/email/templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Templates
      </NavLink>
      <PageState
        loading={!template && !error}
        error={error}
        skeleton={<SkeletonForm />}
      >
        {template && (
          <PlatformEmailEditor
            initial={{
              subject: template.subject,
              preheader: template.preheader,
              design: template.design!,
            }}
            save={(fields) => updateTemplate(id, fields)}
            extraFields={
              <label className="block max-w-md space-y-1 text-sm">
                <span className="font-medium">Template name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() =>
                    name.trim() && updateTemplate(id, { name: name.trim() })
                  }
                />
              </label>
            }
          />
        )}
      </PageState>
    </div>
  );
}
