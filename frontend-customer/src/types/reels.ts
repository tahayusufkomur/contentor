// The reels studio's records (backend/apps/reels/views.py). Times are in seconds: of the video, except where
// a field says the reel's own clock (after its pauses are cut).

/** [start, end, text], the text with its leading space, as Scribe writes them. */
export type Word = [number, number, string];

export type WordsState = "ready" | "working" | "failed" | "unavailable";
export type SearchStatus =
  | "idle"
  | "transcribing"
  | "picking"
  | "framing"
  | "covering"
  | "done"
  | "failed";
/** An idea is a moment found ahead of the coach; it becomes a draft when she picks it. */
export type ReelStatus = "idea" | "draft" | "rendering" | "ready" | "failed";
export type ReelStyle = "bold" | "clean" | "brand";
export type ReelLayout = "auto" | "center" | "fit";
/** Why a moment works (backend/apps/reels/moments.py KINDS); "" when picked by rule. */
export type ReelKind = "send" | "funny" | "hook" | "insight" | "";
export type CoverDesign = "editorial" | "bold" | "poster" | "series";

/** What a cover is drawn in besides the reel's own: the site's name, look and colours. */
export interface CoverBrand {
  name: string;
  look: string;
  colors: Record<string, string>;
  highlight: string;
}

/** A reel's cover: its first second, the hook (one *word* in stars lit up) over a frame of the video. */
export interface ReelCoverCard {
  design: CoverDesign;
  title: string;
  label: string;
  /** The frame, on a signed link; "" before the video service found any. */
  photo: string;
  /** The face on the frame [x, y, w, h], as shares of it. */
  face: number[] | null;
  /** The frame's width over its height. */
  aspect: number | null;
}

/** A still of the video the cover can be made of; `pick`: the model chose it. */
export interface ReelCoverFrame {
  at: number;
  key: string;
  url: string;
  face: number[] | null;
  aspect: number | null;
  pick: boolean;
}

export interface ReelSearch {
  status: SearchStatus;
  detail: string;
  reels: string[];
  count?: number;
}

export interface ReelVideo {
  id: number;
  title: string;
  duration: number;
  thumbnail: string | null;
  words: WordsState;
  search: ReelSearch;
  reels: number;
  ideas: number;
  created_at: string;
}

export interface ReelVideos {
  /** Whether the video service is on, so reels can be made into files. */
  render: boolean;
  brand: CoverBrand;
  videos: ReelVideo[];
}

export interface ReelSummary {
  id: string;
  video: number;
  video_title: string;
  start: number;
  end: number;
  title: string;
  caption: string;
  score: number;
  kind: ReelKind;
  /** Why the moment works, in a line, to the coach. */
  why: string;
  cover: ReelCoverCard;
  status: ReelStatus;
  error: string;
  /** Ready, but edited since its file was made. */
  stale: boolean;
  file: { size: number; duration: number } | null;
  made_by: string;
  created_at: string;
}

export interface ReelOptions {
  cuts: boolean;
  /** The reel opens on its cover. */
  cover: boolean;
  progress: boolean;
  end_card: boolean;
  clean_audio: boolean;
  cutaways: boolean;
  language: string;
  end_text: string;
}

export interface ReelFrame {
  /** crop: a 9:16 window of the frame, its centre (a share of the width) at each key; fit: all of it. */
  layout: "crop" | "fit";
  keys: [number, number][];
  /** The window's width as a share of the frame's. */
  share: number;
}

/** A line of translated captions, on the reel's clock. */
export interface Phrase {
  start: number;
  end: number;
  text: string;
}

export interface ReelEndCard {
  look: string;
  colors: Record<string, string>;
  name: string;
  site: string;
  host: string;
  logo: string;
  line: string;
}

export interface ReelFont {
  family: string;
  weight: number;
  /** The font's line over its em: libass sizes by the line, CSS by the em. */
  ratio: number;
}

export interface ReelDetail extends ReelSummary {
  cover: ReelCoverCard & CoverBrand & { frame: string };
  frames: ReelCoverFrame[];
  /** Whether the cover was made as its own picture with the video. */
  cover_file: boolean;
  style: ReelStyle;
  layout: ReelLayout;
  options: ReelOptions;
  /** The video the reel is cut from. */
  source: {
    id: number;
    url: string;
    duration: number;
    language: string;
    width: number | null;
    height: number | null;
  };
  /** The video's words around the reel's stretch, for trimming. */
  words: Word[];
  /** The stretches kept, from `start`. */
  keep: [number, number][];
  frame: ReelFrame;
  translation: Phrase[] | null;
  /** Photos over the clip, on the reel's clock. */
  cutaways: { start: number; end: number; url: string }[];
  ideas: { at: number; query: string }[];
  brand: {
    colors: Record<string, string>;
    highlight: string;
    /** The brand style's outline colour. */
    edge: string;
    look: string;
    fonts: { caption: ReelFont };
    /** The look's own families, whatever the style. */
    look_fonts: { display: string; body: string };
  };
  end_card: ReelEndCard;
  file_url: string | null;
  /** Whether the video service is on, so the reel can be made into a file. */
  render: boolean;
}

export type ReelPatch = Partial<
  Pick<ReelDetail, "title" | "caption" | "start" | "end" | "style" | "layout">
> & {
  options?: Partial<ReelOptions>;
  cover?: Partial<{ design: CoverDesign; frame: string; label: string }>;
};
