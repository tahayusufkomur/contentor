import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  Presentation,
  File,
  type LucideIcon,
} from "lucide-react"

const EXT_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  // Documents
  pdf: { icon: FileText, color: "text-red-500" },
  doc: { icon: FileText, color: "text-blue-500" },
  docx: { icon: FileText, color: "text-blue-500" },
  txt: { icon: FileText, color: "text-gray-500" },
  rtf: { icon: FileText, color: "text-gray-500" },
  odt: { icon: FileText, color: "text-blue-400" },
  // Spreadsheets
  xls: { icon: FileSpreadsheet, color: "text-green-600" },
  xlsx: { icon: FileSpreadsheet, color: "text-green-600" },
  csv: { icon: FileSpreadsheet, color: "text-green-500" },
  ods: { icon: FileSpreadsheet, color: "text-green-400" },
  // Presentations
  ppt: { icon: Presentation, color: "text-orange-500" },
  pptx: { icon: Presentation, color: "text-orange-500" },
  odp: { icon: Presentation, color: "text-orange-400" },
  // Images
  png: { icon: FileImage, color: "text-purple-500" },
  jpg: { icon: FileImage, color: "text-purple-500" },
  jpeg: { icon: FileImage, color: "text-purple-500" },
  gif: { icon: FileImage, color: "text-purple-400" },
  svg: { icon: FileImage, color: "text-purple-400" },
  webp: { icon: FileImage, color: "text-purple-400" },
  // Video
  mp4: { icon: FileVideo, color: "text-pink-500" },
  mov: { icon: FileVideo, color: "text-pink-500" },
  avi: { icon: FileVideo, color: "text-pink-400" },
  mkv: { icon: FileVideo, color: "text-pink-400" },
  webm: { icon: FileVideo, color: "text-pink-400" },
  // Audio
  mp3: { icon: FileAudio, color: "text-cyan-500" },
  wav: { icon: FileAudio, color: "text-cyan-500" },
  ogg: { icon: FileAudio, color: "text-cyan-400" },
  flac: { icon: FileAudio, color: "text-cyan-400" },
  aac: { icon: FileAudio, color: "text-cyan-400" },
  // Archives
  zip: { icon: FileArchive, color: "text-amber-600" },
  rar: { icon: FileArchive, color: "text-amber-600" },
  "7z": { icon: FileArchive, color: "text-amber-600" },
  tar: { icon: FileArchive, color: "text-amber-500" },
  gz: { icon: FileArchive, color: "text-amber-500" },
  // Code
  html: { icon: FileCode, color: "text-orange-500" },
  css: { icon: FileCode, color: "text-blue-500" },
  js: { icon: FileCode, color: "text-yellow-500" },
  ts: { icon: FileCode, color: "text-blue-600" },
  json: { icon: FileCode, color: "text-gray-500" },
  xml: { icon: FileCode, color: "text-orange-400" },
}

const DEFAULT_ICON = { icon: File, color: "text-muted-foreground" }

export function getFileIcon(filename: string): {
  icon: LucideIcon
  color: string
} {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  return EXT_MAP[ext] ?? DEFAULT_ICON
}

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toUpperCase() ?? ""
}
