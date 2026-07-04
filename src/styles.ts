export const DOT_TYPES = [
  "square", "rounded", "dots", "classy", "classy-rounded", "extra-rounded",
] as const;

export const CORNER_SQUARE_TYPES = ["square", "dot", "extra-rounded"] as const;

export const CORNER_DOT_TYPES = ["square", "dot"] as const;

export const ERROR_CORRECTION_LEVELS = ["L", "M", "Q", "H"] as const;

export type DotType = (typeof DOT_TYPES)[number];
export type CornerSquareType = (typeof CORNER_SQUARE_TYPES)[number];
export type CornerDotType = (typeof CORNER_DOT_TYPES)[number];
export type ErrorCorrectionLevel = (typeof ERROR_CORRECTION_LEVELS)[number];
