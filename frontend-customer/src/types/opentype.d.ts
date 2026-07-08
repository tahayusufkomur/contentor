// Minimal ambient types for opentype.js 2.x (ships no .d.ts). Only the
// surface lib/logo/brand-kit.ts uses.
declare module "opentype.js" {
  export interface OpenTypePath {
    toPathData(decimalPlaces?: number): string;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    getAdvanceWidth(text: string, fontSize: number): number;
    getPath(text: string, x: number, y: number, fontSize: number): OpenTypePath;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
