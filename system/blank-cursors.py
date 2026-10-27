#!/usr/bin/python3
"""Writes an invisible cursor theme: every cursor name of the installed
themes as one transparent 1x1 Xcursor image. labwc draws its own pointer
(Adwaita's arrow) in the middle of the screen although the box has no
mouse; with XCURSOR_THEME set to this theme (system/labwc/environment)
there is nothing to see. The extension draws its own pointer (cursor.js).

    blank-cursors.py /usr/share/icons/pioneer-tv-blank
"""
import os
import struct
import sys
from pathlib import Path

IMAGE = 0xFFFD0002
SIZE = 24                      # the nominal size asked for; one is enough


def xcursor() -> bytes:
    """An Xcursor file holding one transparent 1x1 image."""
    header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1)
    toc = struct.pack("<III", IMAGE, SIZE, 16 + 12)
    image = struct.pack("<IIIIIIIII", 36, IMAGE, SIZE, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
    return header + toc + image


def main(target: str) -> None:
    root = Path(target)
    cursors = root / "cursors"
    cursors.mkdir(parents=True, exist_ok=True)
    (root / "index.theme").write_text("[Icon Theme]\nName=Pioneer TV blank\nComment=No pointer at all\n")
    blank = cursors / "blank"
    blank.write_bytes(xcursor())
    # Every name any installed theme has, and the usual ones besides.
    names = {"default", "left_ptr", "arrow", "pointer", "hand2", "text", "xterm", "wait", "watch", "progress",
             "crosshair", "grab", "grabbing", "move", "not-allowed", "help"}
    for theme in Path("/usr/share/icons").glob("*/cursors"):
        names.update(p.name for p in theme.iterdir())
    for name in names - {"blank"}:
        link = cursors / name
        if link.is_symlink() or link.exists():
            link.unlink()
        os.symlink("blank", link)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/usr/share/icons/pioneer-tv-blank")
