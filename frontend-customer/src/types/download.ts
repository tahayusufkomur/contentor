import type { AccessInfo } from "./billing";
import type { Tag } from "./course";
import type { CoverDesign } from "./design";

export interface DownloadFile {
  id: number;
  title: string;
  description: string;
  /** False: a draft focus mode is still making, hidden from students. */
  is_published: boolean;
  thumbnail_id?: number | null;
  file_url: string;
  file_size: number;
  download_count: number;
  pricing_type: "free" | "paid" | "subscription";
  price: string;
  /** The picture it wears (a signed link), or "" for none. */
  thumbnail_signed_url?: string;
  /** Its kept cover design, null when it wears a plain photo or none. */
  cover_design?: CoverDesign | null;
  tags?: Tag[];
  tag_ids?: number[];
  created_at: string;
  access_info?: AccessInfo;
  /** Why a draft cannot be published yet ("Add the file first"), "" when it can. */
  not_ready?: string;
}
