#!/usr/bin/env python3
"""Writes the design system's tokens as CSS custom properties, from tokens.json.

- design/maskinrepubliken/tokens.css: the system's own names (--paper, --ink),
  for the specimen and anything built with the system's bundle.css.
- extension/content/tokens.css: the same values prefixed --pioneertv-, because
  the extension's styles run inside every website the box opens and must not
  overwrite a site's own --ink or --paper.

One block per colour theme (the first, "paper", is also :root), plus the type
families, spacing, radius and perforation tokens. Run it after pulling a new
tokens.json from the design system."""
import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
HERE = REPO / "design" / "maskinrepubliken"
EXT = REPO / "extension" / "content" / "tokens.css"


def build(tokens: dict, prefix: str = "", theme_attr: str = "data-theme") -> str:
    themes = [t["id"] for t in tokens["color"]["themes"]]

    def value(tok, theme):
        v = tok["value"]
        return v if isinstance(v, str) else v.get(theme, v[themes[0]])

    out = ["/* Generated from tokens.json by dev/tokens-css.py — do not edit by hand. */"]
    for i, theme in enumerate(themes):
        out.append(f':root, [{theme_attr}="{theme}"] {{' if i == 0 else f'[{theme_attr}="{theme}"] {{')
        out += [f"  --{prefix}{t['name']}: {value(t, theme)};" for t in tokens["color"]["tokens"]]
        if i == 0:
            out += [f"  --{prefix}font-{k}: {v};" for k, v in tokens["type"]["families"].items()]
            for family in ("spacing", "radius", "perforering"):
                out += [f"  --{prefix}{t['name']}: {t['value']};" for t in tokens.get(family, {}).get("tokens", [])]
        out.append("}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    tokens = json.loads((HERE / "tokens.json").read_text())
    (HERE / "tokens.css").write_text(build(tokens))
    EXT.write_text(build(tokens, prefix="pioneertv-", theme_attr="data-pioneertv-theme"))
    print(f"wrote {HERE / 'tokens.css'} and {EXT}")
