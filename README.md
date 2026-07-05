# qrgen

Render a styled QR code from a named JSON style profile. SVG is the default and
needs nothing native; a PNG is available on request. Styling is powered by
[qr-code-styling](https://github.com/kozakdenys/qr-code-styling), so you get
smooth rounded finder patterns, gradients, and logos — not blocky modules.

## Requirements

- Node.js ≥ 23.6 (runs the TypeScript sources directly via native type
  stripping — no build step).
- SVG output: pure JavaScript.
- PNG output (`--png`): the native [`canvas`](https://www.npmjs.com/package/canvas)
  package (ships prebuilt binaries). See [PNG output](#png-output).

## Install

    npm install -g .

This puts a `qrgen` command on your PATH. Or run without installing:

    node src/cli.ts <profile> <url>

On first run, if `~/.qrgen/profiles/` does not exist, `qrgen` offers to create
it and install the bundled starter profiles (and the schema) — answer the prompt:

    qrgen black https://youtube.com
    # No profiles directory at ~/.qrgen/profiles. Create it and install the
    # starter profiles? [Y/n] y
    # → ./output/youtube-black-1467931a0e8c-qr.svg

In a non-interactive context (piped/scripted) it will not prompt; create the
directory and add a `<profile>.json` yourself.

## Usage

    qrgen <profile> <url> [--output DIR] [--png] [--size PX]

    qrgen black https://youtube.com            # SVG into ./output/
    qrgen white https://bbc.co.uk --png        # also write a PNG
    qrgen ocean https://x.com -o ~/Desktop     # override output directory

- `profile` — profile name; loads `~/.qrgen/profiles/<profile>.json`.
- `url` — the URL to encode.
- `-o, --output DIR` — output directory (overrides the profile's `output`).
- `--png` — also write a PNG next to the SVG.
- `--size PX` — image size in pixels (overrides the profile's `size`; default 300).
- `--label TEXT` — width-constrained caption below the QR, on both the SVG and
  PNG. Its color is the profile's `labelColor` (each bundled profile sets one,
  defaulting to the dots color).

A profile's `labelFont` picks a Google font for the label — `"Open Sans"`,
`"Roboto"`, or `"Montserrat"`. The TTF is downloaded once to `~/.qrgen/fonts/`,
then **subset to just the label's characters and embedded** in the SVG as a
base64 `@font-face` (a few KB) so the SVG is fully standalone/offline; the PNG
bakes the same font in. Without `labelFont`, the SVG uses a generic font stack
and the PNG a registered system font.

Output filename: `<label>-<profile>-<hash>-qr.svg`, where `<label>` is the
registrable domain (`www.youtube.com` → `youtube`, `bbc.co.uk` → `bbc`) or the
host IP, `<profile>` is the profile name, and `<hash>` is the first 12 hex chars
of `sha256(url)`. Same URL + profile is stable; different URLs or profiles never
collide.

Output directory precedence: `--output` flag > profile `output` key >
`./output/`.

## Profiles

Profiles live under `~/.qrgen/profiles/` in two layers:

- `default/` — the ship-managed starters. Re-seeded from the package; don't edit
  these (edits get replaced on reinstall).
- `user/` — your profiles. A `user/<name>.json` **overrides** a `default/<name>.json`
  of the same name, so put your own profiles and any edited copies of a default
  here.

The basename is the name you pass on the command line; lookup checks `user/`
first, then `default/`. (Upgrading from a flat `~/.qrgen/profiles/*.json` layout
is automatic: unedited default copies are dropped, your own profiles move to
`user/`.) A profile is the styling subset of qr-code-styling's options plus
qrgen's `output` — never the data.

    {
      "$schema": "../profile.schema.json",
      "dots":          { "type": "rounded", "color": "#FFFFFF" },
      "cornersSquare": { "type": "extra-rounded", "color": "#FFFFFF" },
      "cornersDot":    { "type": "dot", "color": "#FFFFFF" },
      "background":    { "color": "#000000" },
      "errorCorrectionLevel": "H",
      "output": "./output/"
    }

Keys:

- `dots` (required) — data module style. `type` is one of `square`, `rounded`,
  `dots`, `classy`, `classy-rounded`, `extra-rounded`; plus `color` (hex) or
  `gradient`.
- `cornersSquare` — outer finder ring. `type`: `square`, `dot`, `extra-rounded`.
- `cornersDot` — inner finder dot. `type`: `square`, `dot`.
- `background` — `{ "color": "#RRGGBB" }`, or `{ "color": "transparent" }`.
  Omitting it defaults to white.
- `image` + `imageOptions` — center logo (file path or data URI).
- `errorCorrectionLevel` — `L` | `M` | `Q` | `H`.
- `margin`, `shape` (`square`/`circle`), `size` (px), `output`.

Gradients (on `dots`, `cornersSquare`, `cornersDot`, or `background`):

    "gradient": {
      "type": "linear", "rotation": 0.79,
      "colorStops": [ { "offset": 0, "color": "#1E6FD9" },
                      { "offset": 1, "color": "#0A2A5E" } ]
    }

Profiles are validated against `data/profile.schema.json` (JSON Schema, draft
2020-12) at load time via [ajv](https://ajv.js.org), and the `$schema` reference
gives editors autocomplete and inline validation. A profile whose background
color equals a foreground color is rejected as unreadable.

### Bundled profiles

First run installs the starter set below — covering every dot and finder style,
linear/radial gradients, corner and background gradients, a circular code, and
transparency:

| name            | look                                             |
|-----------------|--------------------------------------------------|
| black           | white rounded modules, rounded finders, on black |
| white           | black rounded modules on white                   |
| square          | classic black squares on white                   |
| dots            | circular dots on white                           |
| classy          | classy modules on white                          |
| classy-rounded  | classy-rounded modules on white                  |
| extra-rounded   | extra-rounded modules on white                   |
| ocean           | blue linear gradient, rounded finders, on white  |
| forest          | pale green modules on deep green                 |
| ghost           | black rounded modules, transparent background    |
| linear          | red linear gradient on the dots                  |
| radial          | purple→red radial gradient on the dots           |
| corner-gradient | green gradient finders, dark square dots         |
| bg-gradient     | white modules on a dark gradient background       |
| circle          | circular code outline, black rounded modules      |
| sample          | centered logo fetched from a URL (a bash icon)    |
| auto-white      | auto-detected brand icon, dark modules on white   |
| auto-black      | auto-detected brand icon, light modules on black  |

### Auto icons

Set `"autoIcon": true` and qrgen picks a logo from the encoded URL's domain —
`qrgen auto-white https://youtube.com/…` centers the YouTube icon, no config.
Detection matches the host (most specific first: `docs.google.com` before
`google.com`) against `data/icon-map.json`; no match → no logo. Icons are
plain image URLs (SVG from Simple Icons / developer-icons — canvas-free; raster
from iOS Icon Gallery — needs `canvas`), so the map is easy to extend.

A profile's `recolorIcon: true` paints the logo the QR's **foreground color**
(the dots color) — Simple Icons via the CDN's color param, other SVGs via a
fill/stroke filter, so a colored brand logo prints as one flat color (e.g. white
on a dark code). `auto-black` ships with it on. Icons that rely on knockout /
negative space (a filled badge with a cut-out glyph) flatten to a solid shape —
pick a solid-glyph icon for those.

List every supported selection:

    qrgen icons

### Logos

Set `image` (a file path, `data:` URI, or `http(s)` URL) plus optional
`imageOptions` to place a centered logo:

    "image": "~/logos/seal.png",
    "imageOptions": { "imageSize": 0.3, "margin": 6, "hideBackgroundDots": true }

qrgen resolves every image to a self-contained `data:` URI — local files are
read, remote URLs are fetched — because qr-code-styling can load neither
directly in Node. SVG icons that ship only a `viewBox` get width/height injected
so they size correctly. **An SVG logo needs nothing native.** A **raster** logo
(PNG/JPG/WebP/GIF) needs the `canvas` package (to size it) — the same dependency
as `--png` — and errors clearly if it is missing. Keep the logo small and use
`errorCorrectionLevel: "H"` so the code still scans.

The bundled `sample` profile fetches a remote SVG icon. Bundled sample images
live in `~/.qrgen/assets/default/` for your own profiles to reference.

## PNG output

The `--png` flag renders a PNG through qr-code-styling's canvas backend, which
needs the native `canvas` package. It ships prebuilt binaries, so
`npm install canvas` normally just works; if your setup blocks install scripts,
approve it (`npm approve-scripts canvas`). If `canvas` is unavailable, `--png`
exits with a clear message and the SVG is still written. SVG output never needs
`canvas`.

## Tests

    npm test        # node:test, runs the TypeScript sources directly
    npm run typecheck

PNG tests skip automatically when `canvas` is not installed.

## Credits

Styling and rendering are provided by
[qr-code-styling](https://github.com/kozakdenys/qr-code-styling) by Denys Kozak.

Bundled sample assets:

- `assets/default/qrgen-sample.jpeg` — a 16th-century ornamental letter Q from
  Delamotte's *Ornamental Alphabets*, via
  [fromoldbooks.org](https://www.fromoldbooks.org/Comment/unwatermarked.cgi?source=DelamotteOrnamentalAlphabets;item=051-16th-Century-letter-q-q85-468x500.jpg).
- The `sample` profile's logo is the bash icon from
  [xandemon/developer-icons](https://github.com/xandemon/developer-icons).

Auto-icon sources (`data/icon-map.json`):

- [Simple Icons](https://simpleicons.org) — most brand SVGs.
- [xandemon/developer-icons](https://github.com/xandemon/developer-icons).
- [uxwing](https://uxwing.com), [Icons8](https://icons8.com), and
  [Wikimedia Commons](https://commons.wikimedia.org) — brand/app SVGs.
- App URL scheme reference: **app-urls** by Bhagya Nirmaan Silva
  ([bhagyas/app-urls](https://github.com/bhagyas/app-urls)).

Label fonts (`labelFont`): **Open Sans**, **Roboto**, **Montserrat** from
[Google Fonts](https://fonts.google.com) (OFL).

## License

MIT — see [LICENSE](LICENSE).
