// Shared admin-kit (schema-driven admin renderer).
// Canonical shared module — imported via @shared/admin-kit/* by both frontend-main and frontend-customer.
//
// These types mirror the JSON contract served by backend/apps/adminkit.

export type FieldType =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "boolean"
  | "choice"
  | "multichoice"
  | "date"
  | "datetime"
  | "email"
  | "url"
  | "json"
  | "fk"
  | "m2m"
  | "image"
  | "computed";

export interface ChoiceOption {
  value: string | number;
  label: string;
}

export interface FieldSchema {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  read_only: boolean;
  help_text: string;
  default?: string | number | boolean;
  choices?: ChoiceOption[];
  max_length?: number;
  min_value?: number;
  max_value?: number;
  decimal_places?: number;
  /** image fields: where the widget POSTs the multipart upload */
  upload_url?: string;
  /** image fields: storage sub-prefix sent with the upload */
  upload_prefix?: string;
}

export interface ColumnSchema {
  name: string;
  label: string;
  type: FieldType;
  sortable: boolean;
  choices?: ChoiceOption[];
}

export interface FilterSchema {
  name: string;
  label: string;
  type: "boolean" | "choice" | "fk" | "string";
  choices?: ChoiceOption[];
}

export interface ActionSchema {
  name: string;
  label: string;
  style: "default" | "primary" | "danger";
  confirm: string | null;
  /** Render as a per-row button (operates on one object) vs a bulk action. */
  row: boolean;
}

/** Action result: a message and/or a navigation the frontend should perform. */
export interface ActionResult {
  detail?: string;
  redirect?: string;
}

export interface ModelMeta {
  key: string;
  label: string;
  label_plural: string;
  icon: string;
  description: string;
  pk_field: string;
  list_display: ColumnSchema[];
  search_enabled: boolean;
  filters: FilterSchema[];
  form_fields: FieldSchema[];
  actions: ActionSchema[];
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  default_ordering: string;
  page_size: number;
  /** "table" (default) or "gallery" — gallery renders image cards plus the
   * drop-a-PNG → JSON-record flow instead of the table + slide-over form. */
  list_mode?: "table" | "gallery";
  /** Gallery mode: which image field the cards render. */
  gallery_image_field?: string;
}

export interface SiteModelEntry {
  key: string;
  label: string;
  label_plural: string;
  icon: string;
  description: string;
  can_create: boolean;
}

export interface SiteMeta {
  namespace: string;
  title: string;
  models: SiteModelEntry[];
}

/** A labeled FK value as serialized in rows: `{value, label}`. */
export interface FkValue {
  value: number | string;
  label: string;
}

/** An image-field value as serialized in rows: the storage key plus a
 * presigned, time-limited download URL. Null when the field is unset. */
export interface ImageValue {
  key: string;
  url: string;
}

export type RowValue =
  | string
  | number
  | boolean
  | null
  | FkValue
  | ImageValue
  | Record<string, unknown>
  | unknown[];
export type Row = Record<string, RowValue>;

export interface ListPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Row[];
}

export interface ListParams {
  page?: number;
  page_size?: number;
  q?: string;
  ordering?: string;
  filters?: Record<string, string>;
}
