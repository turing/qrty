import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";

import schema from "../data/profile.schema.json" with { type: "json" };
import { QrgenError } from "./errors.ts";
import type {
  CornerDotType,
  CornerSquareType,
  DotType,
  ErrorCorrectionLevel,
} from "./styles.ts";

export const PROFILES_DIR = join(homedir(), ".qrgen", "profiles");

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
  imageOptions?: {
    imageSize?: number;
    margin?: number;
    hideBackgroundDots?: boolean;
  };
  errorCorrectionLevel?: ErrorCorrectionLevel;
  margin?: number;
  shape?: "square" | "circle";
  size?: number;
  output?: string;
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

function assertReadableContrast(profile: Profile, where: string): void {
  const bg = profile.background?.color?.toLowerCase();
  if (!bg) return; // transparent or gradient background: skip
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

export function loadProfile(name: string, dir: string = PROFILES_DIR): Profile {
  const path = join(dir, `${name}.json`);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new QrgenError(`Profile not found: ${path}`);
  }

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
  assertReadableContrast(profile, `Profile ${path}`);
  return profile;
}
