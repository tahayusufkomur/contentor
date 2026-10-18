import { StudioEditor } from "@/components/studio/studio-editor";

/** One design in the photo studio: a draft to edit, or a kept cover to look at. */
export default function StudioEditorPage({
  params,
}: {
  params: { id: string };
}) {
  return <StudioEditor designId={params.id} />;
}
