import { QrgenError } from "./errors.ts";

/**
 * Fetch a URL, resolving the 2xx Response or throwing a QrgenError. `label` is
 * the full descriptor for the error (e.g. `logo <url>` or `font <name>`), so the
 * asset and font callers keep their existing message shapes. Single network
 * chokepoint — request hardening (timeout/abort/size cap) lands here (item 3.1).
 */
export async function fetchOrThrow(url: string, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new QrgenError(`Could not fetch ${label}: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new QrgenError(`Could not fetch ${label}: HTTP ${res.status}`);
  }
  return res;
}
