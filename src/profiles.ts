import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";

import schema from "../data/profile.schema.json" with { type: "json" };
import { QrgenError } from "./errors.ts";
import { qrgenHome } from "./paths.ts";
import type {
  CornerDotType,
  CornerSquareType,
  DotType,
  ErrorCorrectionLevel,
} from "./styles.ts";

/** ~/.qrgen/profiles — holds `default/` (ship-managed) and `user/` (yours). */
export const PROFILES_ROOT = join(qrgenHome(), "profiles");
export const DEFAULT_DIR = join(PROFILES_ROOT, "default");
export const USER_DIR = join(PROFILES_ROOT, "user");
/** Search order: user profiles override defaults of the same name. */
export const SEARCH_DIRS: string[] = [USER_DIR, DEFAULT_DIR];

export interface Gradient {
  type?: "linear" | "radial";
  rotation?: number;
  colorStops: { offset: number; color: string }[];
}

export interface StyleBlock {
  color?: string;
  gradient?: Gradient;
}

export interface Profile {
  dots: StyleBlock & { type: DotType };
  cornersSquare?: StyleBlock & { type?: CornerSquareType };
  cornersDot?: StyleBlock & { type?: CornerDotType };
  background?: { color?: string; gradient?: Gradient };
  image?: string;
  /** Auto-select a logo from the encoded URL's domain (see data/icon-map.json). */
  autoIcon?: boolean;
  /** Recolor the logo (fills + strokes) to the QR's foreground color. */
  recolorIcon?: boolean;
  imageOptions?: {
    imageSize?: number;
    margin?: number;
    hideBackgroundDots?: boolean;
  };
  errorCorrectionLevel?: ErrorCorrectionLevel;
  margin?: number;
  shape?: "square" | "circle";
  size?: number;
  /** Default color for a `--label` caption (falls back to the dots color). */
  labelColor?: string;
  /** Google font for the label: "Open Sans" | "Roboto" | "Montserrat". */
  labelFont?: "Open Sans" | "Roboto" | "Montserrat";
  output?: string;
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

/**
 * Reject a profile whose background is an exact (case-insensitive) match for a
 * foreground (dots/corner) color — the common footgun of leaving both the same.
 * This is a string-equality guard, NOT a luminance/contrast computation:
 * near-identical colors (e.g. `#000001` on `#000000`) are not caught.
 */
function assertForegroundBackgroundDiffer(profile: Profile, where: string): void {
  // A gradient background has no single color to compare; skip it.
  if (profile.background && !profile.background.color) return;
  // qr-code-styling defaults an omitted background to white, so an omitted
  // background is treated as white for this comparison.
  const bg = (profile.background?.color ?? "#ffffff").toLowerCase();
  if (bg === "transparent") return;
  const foregrounds = [
    profile.dots?.color,
    profile.cornersSquare?.color,
    profile.cornersDot?.color,
  ].filter((c): c is string => typeof c === "string");
  if (foregrounds.some((c) => c.toLowerCase() === bg)) {
    throw new QrgenError(
      `${where}: background ${bg} matches a foreground color — ` +
        `the QR would be unreadable.`,
    );
  }
}

/**
 * Load `<name>.json`, searching `dirs` in order (first match wins, so a `user/`
 * profile overrides a `default/` one of the same name). Validates against the
 * schema and rejects profiles whose background equals a foreground color.
 */
export function loadProfile(
  name: string,
  dirs: string | string[] = SEARCH_DIRS,
): Profile {
  const searchDirs = Array.isArray(dirs) ? dirs : [dirs];
  const path = searchDirs
    .map((d) => join(d, `${name}.json`))
    .find((p) => existsSync(p));
  if (!path) {
    throw new QrgenError(
      `Profile not found: ${name} (searched ${searchDirs.join(", ")})`,
    );
  }

  const raw = readFileSync(path, "utf8");

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new QrgenError(`Malformed profile ${path}: ${(err as Error).message}`);
  }

  if (!validate(data)) {
    throw new QrgenError(
      `Invalid profile ${path}: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    );
  }

  const profile = data as unknown as Profile;
  assertForegroundBackgroundDiffer(profile, `Profile ${path}`);
  return profile;
}
