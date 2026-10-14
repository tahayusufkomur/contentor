import type { Tag } from "./course";

export interface Photo {
  id: string;
  s3_key: string;
  alt_text: string;
  title: string;
  content_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  signed_url: string | null;
  /** A photo she uploaded herself, on its way into her search index:
   * "pending" (being optimized), "indexing", "ready" or "failed"; "" for
   * anything else (a catalog copy, a logo). */
  index_status?: string;
  tags?: Tag[];
  tag_ids?: number[];
  created_at: string;
}
