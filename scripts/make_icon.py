"""Gera o ícone do Claude Office (static/icon.ico e static/icon.png) sem dependências.

O desenho é o rosto do gerente, com os mesmos mapas de caracteres de static/sprites.js.
Uso: python scripts/make_icon.py
"""
import struct
import zlib
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"

HEAD = [
    "....oooooooo....", "...ohhhhhhhho...", "..ohhhhhhhhhho..", ".ohhhhhhhhhhhho.", ".ohhhhhhhhhhhho.",
    ".ohHssssssssHho.", ".oHssssssssssHo.", ".osbbbssbbbssSo.", ".osswessswessSo.", ".osswessswessSo.",
    ".osssssssssssSo.", ".osssssssssssSo.", ".osssssmmmssSSo.", "..oSssssssssSo..", "...oSSssssSSo...",
    "....oooooooo....",
]
PARTED = ["", "...ohhhhHhhho...", "..ohhhhhHhhhho..", ".ohhhhhhHhhhhho.", ".ohhhhhhHhhhhho.", ".ohhhhhHssssHho."]
GLASSES = ["", "", "", "", "", "", "", "...gggg.gggg....", "...g..ggg..g....", "...g..g.g..g....", "...gggg.gggg...."]
# terno preto, camisa branca e gravata vermelha (como o gerente da cena)
BODY = ["......osSo......", "..oooocnncoooo..", ".ojjjjcnncjjjjo.", ".ojjjjjnnjjjjjo.", ".ojjjjjnnjjjjjo."]


def shade(hex_color, k):
    n = int(hex_color[1:], 16)
    return tuple(max(0, min(255, round(((n >> s) & 255) * k))) for s in (16, 8, 0))


def rgb(hex_color):
    return shade(hex_color, 1.0)


SKIN, HAIR = "#f5cba7", "#2d1b0e"
PAL = {
    "o": rgb("#1a1a1a"), "s": rgb(SKIN), "S": shade(SKIN, 0.82), "h": rgb(HAIR), "H": shade(HAIR, 0.7), "b": shade(HAIR, 0.8),
    "w": rgb("#ffffff"), "e": rgb("#2b1d14"), "m": shade(SKIN, 0.55), "g": rgb("#2b2b2b"), "c": rgb("#f4f4f4"),
    "n": rgb("#c0392b"), "j": rgb("#1a1a1a"),
}
BG, BG_EDGE, BG_HI = rgb("#2e86de"), rgb("#1b4f8a"), rgb("#4aa3f0")


def sprite():
    rows = [list(r) for r in HEAD + BODY]
    for layer in (PARTED, GLASSES):
        for r, row in enumerate(layer):
            for c, ch in enumerate(row):
                if ch != ".":
                    rows[r][c] = ch
    return rows


def render(size):
    """Fundo azul arredondado (estilo botão do Habbo) com o rosto centralizado, em pixel-art nítida."""
    grid = sprite()
    gh, gw = len(grid), len(grid[0])
    cell = max(1, (size * 13 // 16) // max(gw, gh))
    ox, oy = (size - gw * cell) // 2, size - gh * cell - max(1, size // 16)
    radius = max(2, size // 6)
    px = []
    for y in range(size):
        row = []
        for x in range(size):
            dx = max(radius - x, 0, x - (size - 1 - radius))
            dy = max(radius - y, 0, y - (size - 1 - radius))
            if dx * dx + dy * dy > radius * radius:
                row.append((0, 0, 0, 0))
                continue
            edge = dx * dx + dy * dy > (radius - max(1, size // 32)) ** 2 or x < max(1, size // 32) or y < max(1, size // 32) \
                or x >= size - max(1, size // 32) or y >= size - max(1, size // 32)
            col = BG_EDGE if edge else (BG_HI if y < size // 2 else BG)
            gx, gy = (x - ox) // cell if x >= ox else -1, (y - oy) // cell if y >= oy else -1
            if 0 <= gx < gw and 0 <= gy < gh and grid[gy][gx] != ".":
                col = PAL.get(grid[gy][gx], col)
            row.append((*col, 255))
        px.append(row)
    return px


def png(px):
    h, w = len(px), len(px[0])
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in px)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def ico(images):
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return head + entries + blobs


def main():
    sizes = [256, 64, 48, 32, 16]
    images = [(s, png(render(s))) for s in sizes]
    (STATIC / "icon.ico").write_bytes(ico(images))
    (STATIC / "icon.png").write_bytes(images[1][1])
    print(f"ícones gravados em {STATIC}")


if __name__ == "__main__":
    main()
