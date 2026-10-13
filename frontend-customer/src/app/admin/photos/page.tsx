import { redirect } from "next/navigation";

/** Photos are one half of Media; this address is kept for old links. */
export default function PhotosRedirect() {
  redirect("/admin/media");
}
