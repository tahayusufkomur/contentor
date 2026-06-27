// Field-schema for the website builder. Generalized from the FieldConfig in
// admin/inline-edit-panel.tsx, with `image`/`video` storing structured values
// ({url, photo_id} / {url, video_id}) and a `repeater` type for item arrays.

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "select"
  | "toggle"
  | "link"
  | "image"
  | "video"
  | "repeater"
  | "filterGroups";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  /** Options for `select`. */
  options?: { label: string; value: string }[];
  /** `select` only: how to render the options. `icons` = icon-tile picker (icon
   *  resolved by value in the renderer); `slider` = labelled snap-slider for
   *  ordered "how much" settings. Omitted = one-click buttons (no dropdown). */
  display?: "icons" | "slider";
  /** `filterGroups` only: which filters to offer (courses vs events). */
  filterScope?: "course" | "event";
  /** Conditional visibility based on the current block data. */
  showWhen?: (data: Data) => boolean;
  /** `repeater` only: sub-field schema for each row. */
  itemFields?: FieldSchema[];
  /** `repeater` only: singular label for a row, e.g. "Testimonial". */
  itemLabel?: string;
  /** `repeater` only: cap the number of rows. */
  maxItems?: number;
}
