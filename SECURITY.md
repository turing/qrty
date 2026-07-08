# Security Policy

## Supported versions

qrty is developed against `main`; security fixes land there and in the latest
`2.x` release. Older versions are not maintained.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub's
[Report a vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
flow (the repository's **Security** tab → *Report a vulnerability*), or email
**[INSERT SECURITY CONTACT]**.

Please include reproduction steps and the affected version. Expect an initial
response within a few days.

## Known surface

qrty fetches remote assets when a style profile's `image` (or a `fontFamily`
that resolves to a Google Fonts download) is an `http(s)` URL. This is an
inherent SSRF surface: qrty will issue a GET to whatever URL a profile names.
Mitigations already in place: non-`http(s)` schemes are rejected, cloud-metadata
hosts (e.g. `169.254.169.254`) are blocked on both the input and any redirect
target, and every fetch has a timeout and a byte cap. General private/link-local
IP blocking is intentionally out of scope — profiles are author-supplied input.
Treat untrusted profile files with the same caution as any config you would run.
