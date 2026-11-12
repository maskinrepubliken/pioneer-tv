#!/usr/bin/env python3
"""The maze's stone textures (extension/overlay/maze/textures.png), from
Screaming Brain Studios' Tiny Texture Pack 1 (CC0), its 128x128 zip:

    python3 dev/maze-textures.py sbs_-_tiny_texture_pack_-_128x128.zip

https://opengameart.org/content/tiny-texture-pack-1. Each is made 64 px
smoothly (Lanczos, every colour kept: not pixelated), one under the other
in maze.js's order (T); the night's sky is drawn here. Needs Pillow."""
import io
import random
import sys
import zipfile

from PIL import Image, ImageDraw

TEX = 64
# maze.js T, in order: the pack's texture for each (group, number), or
# None for one drawn here.
CHOSEN = [
    ("stone", "Bricks", 24), ("moss", "Bricks", 3), ("dirt", "Bricks", 21), ("sand", "Bricks", 15),
    ("flags", "Tile", 10), ("blocks", "Bricks", 7), ("wood", "Wood", 14), ("slate", "Bricks", 23),
    ("brick", "Bricks", 6), ("tiles", "Tile", 6), ("planks", "Wood", 9), ("marble", "Tile", 13),
    ("grass", "Grass", 18), ("hedge", "Grass", 21), ("sky", None, None), ("beams", "Wood", 10),
    ("checker", "Tile", 19),
]
NAMES = {"Bricks": "Brick", "Tile": "Tile", "Wood": "Wood", "Grass": "Grass"}


def sky() -> Image.Image:
    """The night's sky: deep blue, a few stars."""
    im = Image.new("RGB", (TEX, TEX), (15, 23, 52))
    d = ImageDraw.Draw(im)
    rng = random.Random(7)
    for _ in range(7):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        d.point((x, y), fill=(232, 228, 216))
    return im


def main(path: str) -> None:
    pack = zipfile.ZipFile(path)
    out = Image.new("RGB", (TEX, TEX * len(CHOSEN)))
    for i, (_, group, n) in enumerate(CHOSEN):
        if group is None:
            im = sky()
        else:
            raw = pack.read(f"128x128/{group}/{NAMES[group]} {n} - 128x128.png")
            im = Image.open(io.BytesIO(raw)).convert("RGB").resize((TEX, TEX), Image.LANCZOS)
        out.paste(im, (0, i * TEX))
    out.save("extension/overlay/maze/textures.png", optimize=True)
    print(f"{len(CHOSEN)} textures")


if __name__ == "__main__":
    main(sys.argv[1])
