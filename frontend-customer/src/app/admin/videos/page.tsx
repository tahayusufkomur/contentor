import { redirect } from "next/navigation";

/** Videos are one half of Media; this address is kept for old links. */
export default function VideosRedirect() {
  redirect("/admin/media?type=videos");
}
