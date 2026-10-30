import { Spinner } from "@/components/ui/spinner";
import { tEnglish } from "@/lib/english-copy";

export default function Loading() {
  return <Spinner center label={tEnglish("ui.loading")} />;
}
