# the listing thumbnail: the evening hour of @fig-pooling, dark like the other thumbnails
# run: ../../../.venv/bin/python _thumbnail.py  (files starting with _ never ship)
import io
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

# the evening hour, in MWh, as in the post's first figure
A = {"charge": 0.9, "space": 0.1}
B = {"charge": 0.2, "space": 0.8}
blue, orange, ink, bg = "#4e79a7", "#f28e2b", "#d7dce5", "#111727"

fig, ax = plt.subplots(figsize=(12, 6.75), dpi=100)
fig.patch.set_facecolor(bg)
ax.set_facecolor(bg)

w = 0.8
groups = [  # (label, x of the charge bar, [(owner colour, charge, space)])
    ("Battery A", 0.0, [(blue, A["charge"], A["space"])]),
    ("Battery B", 3.0, [(orange, B["charge"], B["space"])]),
    ("Fleet (A + B)", 6.4, [(blue, A["charge"], A["space"]), (orange, B["charge"], B["space"])]),
]
for label, x0, parts in groups:
    base_c = base_s = 0.0
    for colour, charge, space in parts:
        ax.bar(x0, charge, w, bottom=base_c, color=colour)
        ax.bar(x0 + 1, space, w, bottom=base_s, color=colour, alpha=0.6)
        base_c += charge
        base_s += space
    sells = min(base_c, base_s)  # a battery or the fleet sells the smaller of its two bars
    ax.plot([x0 - 0.55, x0 + 1.55], [sells, sells], color=ink, lw=3.5)
    ax.text(x0 + 0.5, -0.08, label, color=ink, ha="center", va="top", fontsize=22)
    ax.text(x0 + 0.5, -0.2, f"sells {sells:.1f} MW", color=ink, ha="center", va="top", fontsize=22, fontweight="bold")

apart = min(A["charge"], A["space"]) + min(B["charge"], B["space"])
ax.plot([6.4 - 0.55, 7.4 + 0.55], [apart, apart], color=ink, lw=2.5, ls=(0, (5, 4)))
ax.text(7.4 + 0.65, apart, f"apart {apart:.1f}", color=ink, va="center", fontsize=19)

ax.set_xlim(-0.9, 9.4)
ax.set_ylim(-0.36, 1.18)
ax.axis("off")
fig.subplots_adjust(left=0.02, right=0.98, top=0.98, bottom=0.02)

buf = io.BytesIO()
fig.savefig(buf, format="png", facecolor=bg)
img = Image.open(buf).convert("RGB")
img.save(Path(__file__).with_name("thumbnail.webp"), "WEBP", quality=82, method=6)
print("thumbnail.webp", img.size)
