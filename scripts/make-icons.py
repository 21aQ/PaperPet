from PIL import Image, ImageDraw

INK = (34, 48, 58, 255)
CREAM = (247, 240, 223, 255)
CREAM_LIGHT = (255, 250, 240, 255)
BLUE = (47, 95, 138, 255)
CORAL = (221, 128, 101, 255)
GOLD = (197, 155, 74, 255)


def draw_pet(draw, cx, cy, s, with_book=True):
    # s is roughly the body width
    body = [
        (cx - s * 0.50, cy - s * 0.04),
        (cx + s * 0.50, cy - s * 0.04),
        (cx + s * 0.50, cy + s * 0.44),
        (cx - s * 0.50, cy + s * 0.44),
    ]
    draw.rounded_rectangle(
        (body[0][0], body[0][1], body[1][0], body[2][1]),
        radius=s * 0.34,
        fill=CREAM,
        outline=INK,
        width=max(2, int(s * 0.045)),
    )
    # ears
    draw.polygon(
        [
            (cx - s * 0.43, cy - s * 0.02),
            (cx - s * 0.48, cy - s * 0.39),
            (cx - s * 0.17, cy - s * 0.15),
        ],
        fill=CREAM,
        outline=INK,
        width=max(1, int(s * 0.025)),
    )
    draw.polygon(
        [
            (cx + s * 0.43, cy - s * 0.02),
            (cx + s * 0.48, cy - s * 0.39),
            (cx + s * 0.17, cy - s * 0.15),
        ],
        fill=CREAM,
        outline=INK,
        width=max(1, int(s * 0.025)),
    )
    # glasses
    eye_dx = s * 0.20
    eye_y = cy + s * 0.02
    r = s * 0.19
    line = max(2, int(s * 0.045))
    draw.ellipse(
        (cx - eye_dx - r, eye_y - r, cx - eye_dx + r, eye_y + r),
        outline=BLUE,
        width=line,
    )
    draw.ellipse(
        (cx + eye_dx - r, eye_y - r, cx + eye_dx + r, eye_y + r),
        outline=BLUE,
        width=line,
    )
    draw.line(
        (cx - eye_dx + r, eye_y, cx + eye_dx - r, eye_y),
        fill=BLUE,
        width=max(2, int(s * 0.03)),
    )
    # eyes
    er = max(2, s * 0.035)
    draw.ellipse((cx - eye_dx - er, eye_y - er * 1.2, cx - eye_dx + er, eye_y + er * 1.2), fill=INK)
    draw.ellipse((cx + eye_dx - er, eye_y - er * 1.2, cx + eye_dx + er, eye_y + er * 1.2), fill=INK)
    # cheeks / smile
    draw.ellipse(
        (cx - s * 0.39, cy + s * 0.19, cx - s * 0.29, cy + s * 0.26),
        fill=(234, 164, 140, 190),
    )
    draw.ellipse(
        (cx + s * 0.29, cy + s * 0.19, cx + s * 0.39, cy + s * 0.26),
        fill=(234, 164, 140, 190),
    )
    draw.arc(
        (cx - s * 0.08, cy + s * 0.13, cx + s * 0.08, cy + s * 0.25),
        start=15,
        end=165,
        fill=INK,
        width=max(2, int(s * 0.035)),
    )
    if with_book:
        bw, bh = s * 0.34, s * 0.15
        bx, by = cx - bw / 2, cy + s * 0.34
        draw.rounded_rectangle((bx, by, cx, by + bh), radius=s * 0.04, fill=CREAM_LIGHT, outline=INK, width=max(1, int(s * 0.022)))
        draw.rounded_rectangle((cx, by, bx + bw, by + bh), radius=s * 0.04, fill=CREAM_LIGHT, outline=INK, width=max(1, int(s * 0.022)))
        draw.line((cx, by + 2, cx, by + bh - 2), fill=INK, width=max(1, int(s * 0.018)))
    # sparkle
    sx, sy = cx + s * 0.52, cy - s * 0.30
    draw.polygon(
        [(sx, sy - s * 0.07), (sx + s * 0.025, sy - s * 0.015), (sx + s * 0.07, sy), (sx + s * 0.025, sy + s * 0.015), (sx, sy + s * 0.07), (sx - s * 0.025, sy + s * 0.015), (sx - s * 0.07, sy), (sx - s * 0.025, sy - s * 0.015)],
        fill=GOLD,
    )


# App icon: 1024 for crisp downscale
size = 1024
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((28, 28, size - 28, size - 28), radius=230, fill=CREAM, outline=(34, 48, 58, 70), width=6)
# subtle top gradient band
for i in range(240):
    alpha = int(26 * (1 - i / 240))
    d.rounded_rectangle((40, 40 + i, size - 40, 42 + i), radius=2, fill=(221, 128, 101, alpha))
draw_pet(d, size / 2, size / 2 - 10, size * 0.62, with_book=True)
img.resize((512, 512), Image.LANCZOS).save("assets/icon.png")
img.resize((256, 256), Image.LANCZOS).save("assets/icon-256.png")
img.resize((256, 256), Image.LANCZOS).save("assets/icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.resize((96, 96), Image.LANCZOS).save("zotero-plugin/icon.png")

# Tray: transparent, simple face
tray = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
td = ImageDraw.Draw(tray)
td.rounded_rectangle((7, 14, 57, 57), radius=18, fill=CREAM, outline=INK, width=3)
td.polygon([(12, 17), (11, 5), (24, 13)], fill=CREAM, outline=INK, width=2)
td.polygon([(52, 17), (53, 5), (40, 13)], fill=CREAM, outline=INK, width=2)
td.ellipse((16, 24, 30, 38), outline=BLUE, width=3)
td.ellipse((34, 24, 48, 38), outline=BLUE, width=3)
td.line((29, 31, 35, 31), fill=BLUE, width=2)
td.ellipse((21, 29, 24, 34), fill=INK)
td.ellipse((40, 29, 43, 34), fill=INK)
td.arc((25, 33, 39, 45), 20, 160, fill=INK, width=2)
tray.resize((32, 32), Image.LANCZOS).save("assets/tray.png")
print("icons written")
