# Security Policy

## Supported versions

qrty is developed against `main`; security fixes land there and in the latest
`2.x` release. Older versions are not maintained.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub's private
vulnerability reporting: the repository's **Security** tab → **Report a
vulnerability**.

Please include reproduction steps and the affected version.

## Known surface

qrty fetches a style profile's `image` when it is an `http(s)` URL, issuing a GET
to whatever host the profile names — an inherent SSRF surface. The only limits
are the scheme check (http/https only) and response/idle timeouts. There is **no**
host filtering — link-local, loopback, and cloud-metadata addresses (e.g.
`169.254.169.254`) are reachable if a profile names them — and **no** download
size cap. Treat a profile file as trusted input, like any config you would run.
