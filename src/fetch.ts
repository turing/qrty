import { QrgenError } from "./errors.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const WARN_BYTES = 5 * 1024 * 1024; // warn above 5 MiB, but never reject on size

export interface FetchOptions {
  timeoutMs?: number;
  /**
   * Emit a one-time stderr warning once the body passes this many bytes
   * (default 5 MiB). The download is NEVER rejected on size — it always
   * completes.
   */
  warnBytes?: number;
}

export interface FetchedBody {
  bytes: Buffer;
  /** Raw `content-type` header, or "" if absent. */
  contentType: string;
}

/**
 * Fetch a URL and return its body, or throw a QrgenError. The single network
 * chokepoint: http/https only, and one AbortController bounds the whole request
 * (timeout). Body size is not limited — a body over `warnBytes` logs a one-time
 * stderr warning but still downloads in full. `label` is the full error
 * descriptor (`logo <url>` / `font <name>`), preserving the network/HTTP message
 * shapes.
 */
export async function fetchOrThrow(
  url: string,
  label: string,
  opts: FetchOptions = {},
): Promise<FetchedBody> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new QrgenError(`Could not fetch ${label}: invalid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new QrgenError(`Could not fetch ${label}: unsupported URL scheme (only http/https).`);
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnBytes = opts.warnBytes ?? WARN_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw controller.signal.aborted
        ? new QrgenError(`Could not fetch ${label}: timed out after ${timeoutMs}ms.`)
        : new QrgenError(`Could not fetch ${label}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new QrgenError(`Could not fetch ${label}: HTTP ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = await readBody(res, label, timeoutMs, controller, warnBytes);
    return { bytes, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** Read the full response body into a Buffer; warn once past `warnBytes`, never reject on size. */
async function readBody(
  res: Response,
  label: string,
  timeoutMs: number,
  controller: AbortController,
  warnBytes: number,
): Promise<Buffer> {
  const body = res.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let warned = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      total += buf.length;
      if (!warned && total > warnBytes) {
        warned = true;
        process.stderr.write(
          `warning: ${label} exceeds ${Math.round(warnBytes / (1024 * 1024))} MB ` +
            `— downloading anyway.\n`,
        );
      }
      chunks.push(buf);
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new QrgenError(`Could not fetch ${label}: timed out after ${timeoutMs}ms.`);
    }
    throw new QrgenError(`Could not fetch ${label}: ${(err as Error).message}`);
  }
  return Buffer.concat(chunks);
}
