import { createRequire } from "node:module";

import { JSDOM } from "jsdom";
import type { Options } from "qr-code-styling";

import { QrgenError } from "./errors.ts";
import type { Profile } from "./profiles.ts";

// qr-code-styling is CJS with an ESM .d.ts whose default export TypeScript
// mis-resolves under NodeNext. Load the class via require and describe the
// slice of its surface we use.
type FileExt = "svg" | "png" | "jpeg" | "webp";
interface QRInstance {
  getRawData(ext: FileExt): Promise<Buffer | Blob | null>;
}
interface QRCtor {
  new (options: Partial<Options>): QRInstance;
}
const require = createRequire(import.meta.url);
const QRCodeStyling = require("qr-code-styling") as QRCtor;

const DEFAULT_SIZE = 300;

type Backend = "svg" | "canvas";

function toOptions(
  profile: Profile,
  url: string,
  size: number,
  type: Backend,
  extra: Record<string, unknown> = {},
): Partial<Options> {
  const px = profile.size ?? size;
  const options: Record<string, unknown> = {
    jsdom: JSDOM,
    type,
    data: url,
    width: px,
    height: px,
    margin: profile.margin ?? 0,
    shape: profile.shape ?? "square",
    qrOptions: { errorCorrectionLevel: profile.errorCorrectionLevel ?? "Q" },
    dotsOptions: profile.dots,
    ...extra,
  };
  // Include optional blocks only when present — qr-code-styling reads into
  // them, so passing `undefined` overrides its defaults and crashes.
  if (profile.cornersSquare) options.cornersSquareOptions = profile.cornersSquare;
  if (profile.cornersDot) options.cornersDotOptions = profile.cornersDot;
  if (profile.background) options.backgroundOptions = profile.background;
  if (profile.image) {
    options.image = profile.image;
    if (profile.imageOptions) options.imageOptions = profile.imageOptions;
  }
  return options as unknown as Partial<Options>;
}

export async function renderSvg(
  profile: Profile,
  url: string,
  size: number = DEFAULT_SIZE,
): Promise<Buffer> {
  const qr = new QRCodeStyling(toOptions(profile, url, size, "svg"));
  return (await qr.getRawData("svg")) as Buffer;
}

export async function renderPng(
  profile: Profile,
  url: string,
  size: number = DEFAULT_SIZE,
): Promise<Buffer> {
  let nodeCanvas: unknown;
  try {
    nodeCanvas = (await import("canvas")).default;
  } catch {
    throw new QrgenError(
      "PNG output needs the 'canvas' package. Install it (npm install canvas) " +
        "and approve its build script.",
    );
  }
  const qr = new QRCodeStyling(
    toOptions(profile, url, size, "canvas", { nodeCanvas }),
  );
  return (await qr.getRawData("png")) as Buffer;
}
