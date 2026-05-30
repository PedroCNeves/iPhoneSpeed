#!/usr/bin/env python3
"""Generate the app's PNG icons (stdlib only — no Pillow needed).

Run from the project root:   python3 tools/make_icons.py
Writes icons/icon-192.png, icon-512.png, icon-180.png
"""
import os, zlib, struct, math

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def png(size, path):
    cx = cy = (size - 1) / 2
    R = size * 0.40          # gauge ring radius
    W = size * 0.075         # ring thickness
    needle_len = size * 0.30
    ang = math.radians(-35)  # needle points up-right
    nx, ny = math.sin(ang), -math.cos(ang)
    bg = (0, 0, 0); green = (0, 230, 118); dim = (40, 40, 40)

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0 per scanline
        for x in range(size):
            r, g, b = bg
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            if abs(dist - R) < W / 2:                      # gauge ring
                a = math.degrees(math.atan2(dx, -dy)) % 360
                r, g, b = green if a < 200 else dim
            if dist < size * 0.045:                        # hub
                r, g, b = green
            t = dx * nx + dy * ny                          # needle
            if 0 <= t <= needle_len:
                perp = abs(dx * (-ny) + dy * nx)
                if perp < size * 0.022:
                    r, g, b = green
            rows.extend((r, g, b))

    comp = zlib.compress(bytes(rows), 9)

    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit truecolor RGB
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b""))
    print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    png(192, os.path.join(OUT, "icon-192.png"))
    png(512, os.path.join(OUT, "icon-512.png"))
    png(180, os.path.join(OUT, "icon-180.png"))
    print("done")
