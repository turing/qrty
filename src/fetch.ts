import { QrgenError } from "./errors.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024; // 16 MiB — above any icon/font, bounds abuse

// Cloud instance-metadata endpoints (AWS/Azure/GCP). Blocked to stop the worst
// SSRF outcome — credential theft — if a profile from an untrusted source names
// one. `URL` lowercases hostnames, so these compare case-insensitively.
const BLOCKED_HOSTS = new Set(["169.254.169.254", "fd00:ec2::254", "metadata.google.internal"]);

/** Bare hostname for comparison: `URL` keeps IPv6 brackets (`[fd00:ec2::254]`). */
function bareHostname(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

export interface FetchedBody {
  bytes: Buffer;
  /** Raw `content-type` header, or "" if absent. */
  contentType: string;
}

/**
 * Fetch a URL and return its body, or throw a QrgenError. The single network
 * chokepoint: http/https only, cloud-metadata hosts blocked (input and final
 * URL), one AbortController bounds the whole request (timeout), and the body is
 * streamed under a byte cap. `label` is the full error descriptor
 * (`logo <url>` / `font <name>`), preserving the network/HTTP message shapes.
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
  if (BLOCKED_HOSTS.has(bareHostname(parsed.hostname))) {
    throw new QrgenError(`Could not fetch ${label}: blocked host ${bareHostname(parsed.hostname)}.`);
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
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
    // A same-scheme redirect to a different host is followed by fetch, so the
    // input-URL block above is not enough — re-check the resolved host.
    if (res.url) {
      const finalHost = bareHostname(new URL(res.url).hostname);
      if (BLOCKED_HOSTS.has(finalHost)) {
        throw new QrgenError(`Could not fetch ${label}: blocked host ${finalHost} (redirect).`);
      }
    }
    if (!res.ok) {
      throw new QrgenError(`Could not fetch ${label}: HTTP ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = await readCapped(res, maxBytes, label, timeoutMs, controller);
    return { bytes, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body into a Buffer, aborting past `maxBytes`. */
async function readCapped(
  res: Response,
  maxBytes: number,
  label: string,
  timeoutMs: number,
  controller: AbortController,
): Promise<Buffer> {
  const body = res.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      total += buf.length;
      if (total > maxBytes) {
        controller.abort();
        throw new QrgenError(`Could not fetch ${label}: response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(buf);
    }
  } catch (err) {
    if (err instanceof QrgenError) throw err;
    if (controller.signal.aborted) {
      throw new QrgenError(`Could not fetch ${label}: timed out after ${timeoutMs}ms.`);
    }
    throw new QrgenError(`Could not fetch ${label}: ${(err as Error).message}`);
  }
  return Buffer.concat(chunks);
}
