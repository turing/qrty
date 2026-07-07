import { QrtyError } from "./errors.ts";

const DEFAULT_TIMEOUT_MS = 10_000; // response timeout AND per-chunk idle timeout
const PROGRESS_BYTES = 5 * 1024 * 1024; // report progress past 5 MiB

export interface FetchOptions {
  /**
   * Timeout (ms) for the RESPONSE (time to headers) and for each idle gap while
   * streaming the body (a stalled server aborts). NOT a total-download limit — a
   * body of any size completes as long as data keeps arriving.
   */
  timeoutMs?: number;
  /** Report download progress to stderr once the body passes this many bytes (default 5 MiB). */
  progressBytes?: number;
}

export interface FetchedBody {
  bytes: Buffer;
  /** Raw `content-type` header, or "" if absent. */
  contentType: string;
}

/**
 * Fetch a URL and return its body, or throw a QrtyError. The single network
 * chokepoint: http/https only. The timeout bounds getting the response and each
 * idle gap during streaming — it does NOT cap total size or total time, so large
 * downloads complete (with stderr progress past `progressBytes`). `label` is the
 * full error descriptor (`logo <url>` / `font <name>`).
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
    throw new QrtyError(`Could not fetch ${label}: invalid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new QrtyError(`Could not fetch ${label}: unsupported URL scheme (only http/https).`);
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const progressBytes = opts.progressBytes ?? PROGRESS_BYTES;

  // Response timeout: bound the wait for headers, then let the body stream freely.
  const controller = new AbortController();
  const respTimer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(respTimer);
    throw controller.signal.aborted
      ? new QrtyError(`Could not fetch ${label}: no response within ${timeoutMs}ms.`)
      : new QrtyError(`Could not fetch ${label}: ${(err as Error).message}`);
  }
  clearTimeout(respTimer);
  if (!res.ok) {
    throw new QrtyError(`Could not fetch ${label}: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const bytes = await readBody(res, label, timeoutMs, controller, progressBytes);
  return { bytes, contentType };
}

/**
 * Read the whole body into a Buffer — no total size/time limit, so any size that
 * keeps arriving completes. A gap longer than `idleMs` between chunks (a stalled
 * server) aborts. Progress is reported to stderr past `progressBytes`.
 */
async function readBody(
  res: Response,
  label: string,
  idleMs: number,
  controller: AbortController,
  progressBytes: number,
): Promise<Buffer> {
  const body = res.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let nextReport = progressBytes;
  for (;;) {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const stall = new Promise<never>((_, reject) => {
      idle = setTimeout(() => {
        controller.abort(); // stop the underlying stream
        reject(
          new QrtyError(
            `Could not fetch ${label}: download stalled (no data for ${idleMs}ms).`,
          ),
        );
      }, idleMs);
    });
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await Promise.race([reader.read(), stall]));
    } catch (err) {
      if (err instanceof QrtyError) throw err;
      throw new QrtyError(`Could not fetch ${label}: ${(err as Error).message}`);
    } finally {
      if (idle) clearTimeout(idle);
    }
    if (done) break;
    const buf = Buffer.from(value as Uint8Array);
    total += buf.length;
    if (total >= nextReport) {
      process.stderr.write(
        `downloading ${label}: ${Math.round(total / (1024 * 1024))} MB…\n`,
      );
      nextReport = total + progressBytes;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
