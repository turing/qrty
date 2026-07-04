# qrgen

Render a styled SVG QR code from a named JSON style profile. SVG is the default
and needs nothing native; a PNG (rasterized from the same SVG) is available on
request.

## Requirements

- Python ≥ 3.11
- SVG output: pure Python (`qrcode`, `tldextract`) — installed automatically.
- PNG output (`--png`): `cairosvg` plus the native `libcairo`. See
  [PNG output](#png-output).

## Install

    pip install .

This puts a `qrgen` executable on your PATH (from `[project.scripts]` in
`pyproject.toml`) and pulls in `qrcode` and `tldextract`.

For development, install editable with the test dependency:

    pip install -e '.[dev]'

For PNG support, add the `png` extra (and see [PNG output](#png-output) for the
native library):

    pip install '.[png]'

On first run, if `~/.qrgen/profiles/` does not exist, `qrgen` offers to create
it and install the bundled starter profiles — just answer the prompt:

    qrgen black https://youtube.com
    # No profiles directory at ~/.qrgen/profiles. Create it and install the
    # starter profile(s)? [Y/n] y
    # → ./output/youtube-black-1467931a0e8c-qr.svg

In a non-interactive context (piped/scripted) it will not prompt; create the
directory yourself and add a `<style>.json`.

## Usage

    qrgen <style> <url> [--output DIR] [--png]

    qrgen black https://youtube.com            # SVG into ./output/
    qrgen white https://bbc.co.uk --png        # also write a PNG
    qrgen ocean https://x.com -o ~/Desktop     # override output directory

- `style` — profile name; loads `~/.qrgen/profiles/<style>.json`.
- `url` — the URL to encode.
- `-o, --output DIR` — output directory (overrides the profile's `output`).
- `--png` — additionally write a PNG alongside the SVG.

Output filename: `<domain-or-ip>-<profile>-<hash>-qr.svg`, where the label is the
registrable domain (`www.youtube.com` → `youtube`, `bbc.co.uk` → `bbc`) or the
host IP, `<profile>` is the profile name, and the hash is the first 12 hex
characters of `sha256(url)`. Repeated runs of the same URL and profile are
stable; different URLs or profiles never collide.

Output directory precedence: `--output` flag > profile `output` key >
`./output/`.

## Profiles

One JSON file per profile at `~/.qrgen/profiles/<name>.json`; the basename is the
name you pass on the command line. A profile holds styling and an optional
default output directory — never the data.

    {
      "style": "round",
      "style_inner": "circle",
      "style_outer": "circle",
      "base": "#FFFFFF",
      "color_inner": "#FFFFFF",
      "color_outer": "#FFFFFF",
      "background": "#000000",
      "output": "./output/"
    }

Required keys: `style`, `style_inner`, `style_outer` (each one of `square`,
`gapped-square`, `circle`, `round`, `vertical-bars`, `horizontal-bars`); `base`,
`color_inner`, `color_outer` (hex foreground colors for the modules, inner eyes,
and outer eyes).

Optional keys (applied only when present): `output`, `background` (hex
background color), `transparent` (`true` drops the background entirely,
overriding `background`), `version`, `box_size`, `border`, `error_correction`
(`L` | `M` | `Q` | `H`).

Background rules: no `background` and no `transparent` → white; `background`
set → that color; `transparent: true` → no background.

### Bundled profiles

First run installs ten starters (they cover all six module styles and the three
background modes):

| name   | look                                            |
|--------|-------------------------------------------------|
| black  | white rounded modules on a black background      |
| white  | black rounded modules on white                   |
| square | classic black squares on white                   |
| gapped | gapped squares on white                          |
| circle | circular modules on white                        |
| dots   | circular modules, square eyes, on white          |
| vbars  | vertical bars, square eyes, on white             |
| hbars  | horizontal bars, square eyes, on white           |
| ocean  | blue rounded modules on white                    |
| ghost  | black rounded modules, transparent background    |

## PNG output

The QR is drawn as SVG; `--png` rasterizes that SVG with
[`cairosvg`](https://cairosvg.org), so the PNG is pixel-identical to the SVG.
`cairosvg` binds the native `libcairo`, which the Python interpreter must be
able to load — the one native dependency in the project, and only for PNG.

macOS: `brew install cairo`. A Homebrew-built Python (or a venv created from
one) loads it automatically. A non-Homebrew interpreter (e.g. system or
miniconda Python) may not find `/opt/homebrew/lib`; the simplest fix is to run
qrgen from a venv built with Homebrew's Python:

    brew install python cairo
    /opt/homebrew/bin/python3 -m venv ~/.venvs/qrgen
    ~/.venvs/qrgen/bin/pip install '.[png]'

If `libcairo` cannot load, `--png` fails with a clear message and the SVG is
still written.

## Tests

    pip install -e '.[dev]'
    pytest

PNG tests skip automatically when `libcairo` is not loadable.

## Rendering credit

The SVG rendering code — the per-style module and eye drawing, and the SVG
assembly — is adapted (vendored and modified) from
[mrinfinidy/qrcode-pretty](https://github.com/mrinfinidy/qrcode-pretty). qrgen
no longer depends on that package at runtime, but the drawing logic originates
there. Thanks to its author.

## License

MIT — see [LICENSE](LICENSE).
