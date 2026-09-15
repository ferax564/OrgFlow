#!/usr/bin/env python3
"""Write a 512×512 PNG icon from the OrgFlow mark (no extra packages)."""
from __future__ import annotations
import struct
import zlib
from pathlib import Path

SIZE = 512
INDIGO = (79, 70, 229, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def set_px(px, x, y, color):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        px[y][x] = color


def fill_rect(px, x0, y0, x1, y1, color):
    for y in range(y0, y1):
        row = px[y]
        for x in range(x0, x1):
            row[x] = color


def fill_circle(px, cx, cy, r, color):
    r2 = r * r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2:
                set_px(px, x, y, color)


def stroke_line(px, x0, y0, x1, y1, w, color):
    dx, dy = x1 - x0, y1 - y0
    steps = max(abs(dx), abs(dy), 1)
    hw = max(1, w // 2)
    for i in range(steps + 1):
        x = x0 + dx * i // steps
        y = y0 + dy * i // steps
        fill_rect(px, x - hw, y - hw, x + hw + 1, y + hw + 1, color)


def rounded_rect(px, x0, y0, x1, y1, r, color):
    fill_rect(px, x0 + r, y0, x1 - r, y1, color)
    fill_rect(px, x0, y0 + r, x1, y1 - r, color)
    fill_circle(px, x0 + r, y0 + r, r, color)
    fill_circle(px, x1 - r - 1, y0 + r, r, color)
    fill_circle(px, x0 + r, y1 - r - 1, r, color)
    fill_circle(px, x1 - r - 1, y1 - r - 1, r, color)


def png_bytes(px):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in px)
    ihdr = struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    px = [[CLEAR] * SIZE for _ in range(SIZE)]
    rounded_rect(px, 24, 24, SIZE - 24, SIZE - 24, 96, INDIGO)
    # Org-chart mark scaled from the 32px SVG.
    stroke_line(px, 256, 96, 256, 176, 28, WHITE)
    stroke_line(px, 128, 176, 384, 176, 28, WHITE)
    stroke_line(px, 128, 176, 128, 256, 28, WHITE)
    stroke_line(px, 384, 176, 384, 256, 28, WHITE)
    stroke_line(px, 128, 256, 384, 256, 28, WHITE)
    stroke_line(px, 128, 256, 128, 416, 28, WHITE)
    stroke_line(px, 384, 256, 384, 416, 28, WHITE)
    stroke_line(px, 128, 416, 384, 416, 28, WHITE)
    out = Path(__file__).resolve().parents[1] / 'build' / 'icon.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png_bytes(px))
    print(out)


if __name__ == '__main__':
    main()
