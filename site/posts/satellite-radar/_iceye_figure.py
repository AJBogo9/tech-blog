# /// script
# requires-python = ">=3.11"
# dependencies = ["rasterio", "numpy", "pillow"]
# ///
"""crop an ICEYE GRD COG around a pixel centre and save a display image.

The post's figure came from:
  uv run _iceye_figure.py https://iceye-open-data-catalog.s3.amazonaws.com/stac-items/2026/08/ICEYE_W283CG_20260828T154757Z_10404509_X50_SLEDP.json 16700 20416 900 iceye-kuala-lumpur 1200 db
It writes iceye-kuala-lumpur.webp next to this script, plus a .png and _<name>.json kept out of the site.

usage: make_figure.py ITEM_JSON COL ROW SIZE_M NAME [WIDTH_PX] [STRETCH]
  ITEM_JSON  stac item URL, or a file name in ./dl
  COL ROW    crop centre in full-resolution GRD pixels
  SIZE_M     crop side in metres (square)
  STRETCH    db (default) or sqrt
writes out/NAME.png, out/NAME.webp and out/NAME.json (metadata for the caption).
"""
import json, os, sys
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.transform import rowcol, xy
from PIL import Image

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
here = os.path.dirname(os.path.abspath(__file__))
item_fn, col, row, size_m, name = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
width = int(sys.argv[6]) if len(sys.argv) > 6 else 1200
stretch = sys.argv[7] if len(sys.argv) > 7 else "db"

if item_fn.startswith("http"):
    import urllib.request
    item = json.load(urllib.request.urlopen(item_fn))
else:
    item = json.load(open(os.path.join(here, "dl", item_fn)))
url = item["assets"]["grd-cog"]["href"]

with rasterio.open("/vsicurl/" + url) as ds:
    p = json.loads(ds.tags()["ICEYE_PROPERTIES"])
    sp = p["sar:pixel_spacing_range"]
    assert abs(sp - p["sar:pixel_spacing_azimuth"]) < 1e-9, "non-square pixels"
    n = int(round(size_m / sp))
    # block factor: full-res pixels per output pixel (integer, so the box average is exact)
    f = max(1, n // width)
    n = f * width
    print(f"spacing {sp} m, window {n} px = {n*sp:.0f} m, factor {f}, read bytes {n*n*2/1e6:.0f} MB, float {n*n*4/1e6:.0f} MB")
    win = Window(col - n // 2, row - n // 2, n, n)
    a = ds.read(1, window=win).astype(np.float32)
    rpcs = ds.rpcs
    h_ref = p["iceye:average_scene_height"]
    # crop centre and corners to lat/lon via the product RPCs at the scene's average height
    def ll(c, r):
        lon, lat = xy(rpcs, [r], [c], zs=[h_ref])
        return float(lat[0]), float(lon[0])
    centre = ll(col, row)
    corners = {k: ll(c, r) for k, (c, r) in {
        "top_left": (col - n // 2, row - n // 2), "top_right": (col + n // 2, row - n // 2),
        "bottom_left": (col - n // 2, row + n // 2), "bottom_right": (col + n // 2, row + n // 2)}.items()}
    # image-up and image-right directions as compass bearings, from small steps at the centre
    def bearing(dc, dr):
        la0, lo0 = centre
        la1, lo1 = ll(col + dc, row + dr)
        de = (lo1 - lo0) * np.cos(np.radians(la0))
        dn = la1 - la0
        return float(np.degrees(np.arctan2(de, dn)) % 360)
    up_bearing = bearing(0, -200)
    right_bearing = bearing(200, 0)

# multilook: box-average intensity over f x f blocks (reduces speckle), then back to display
inten = a * a
del a
inten = inten.reshape(width, f, width, f).mean(axis=(1, 3))
valid = inten > 0
if stretch == "db":
    v = 10 * np.log10(np.where(valid, inten, np.nan))
    lo, hi = np.nanpercentile(v, [2, 99.5])
    img = np.clip((v - lo) / (hi - lo), 0, 1)
else:
    amp = np.sqrt(inten)
    lo, hi = np.percentile(amp[valid], [2, 99.5])
    img = np.sqrt(np.clip((amp - lo) / (hi - lo), 0, 1))
img = np.nan_to_num(img, nan=0.0)
u8 = (img * 255 + 0.5).astype(np.uint8)
im = Image.fromarray(u8, mode="L")
png = os.path.join(here, "_" + name + ".png")
webp = os.path.join(here, name + ".webp")
im.save(png, optimize=True)
q = 85
while True:
    im.save(webp, "WEBP", quality=q, method=6)
    if os.path.getsize(webp) <= 290_000 or q <= 40:
        break
    q -= 5
print(f"stretch {stretch} lo {lo:.2f} hi {hi:.2f}; webp q={q} {os.path.getsize(webp)/1e3:.0f} kB; png {os.path.getsize(png)/1e3:.0f} kB")

meta = {
    "scene_id": item["id"],
    "stac_item": next(l["href"] for l in item["links"] if l["rel"] == "self"),
    "grd_cog": url,
    "datetime_utc": p["datetime"],
    "start_end_utc": [p["start_datetime"], p["end_datetime"]],
    "platform": p["platform"],
    "instrument_mode": p["sar:instrument_mode"],
    "processing_mode": p.get("iceye:processing_mode"),
    "polarization": p["sar:polarizations"],
    "band_ghz": p["sar:center_frequency"] / 1e9,
    "resolution_range_m": p["sar:resolution_range"],
    "resolution_azimuth_m": p["sar:resolution_azimuth"],
    "pixel_spacing_m": [p["sar:pixel_spacing_range"], p["sar:pixel_spacing_azimuth"]],
    "looks_range_azimuth": [p["sar:looks_range"], p["sar:looks_azimuth"]],
    "incidence_deg": p["view:incidence_angle"],
    "incidence_near_far_deg": [p.get("iceye:incidence_angle_near"), p.get("iceye:incidence_angle_far")],
    "look_side": p["sar:observation_direction"],
    "orbit": p["sat:orbit_state"],
    "view_azimuth_deg": p.get("view:azimuth"),
    "shadow_angle_deg": p.get("iceye:shadow_angle"),
    "orientation": p.get("iceye:orientation"),
    "crop_centre_px": [col, row],
    "crop_centre_latlon": centre,
    "crop_corners_latlon": corners,
    "crop_size_m": n * sp,
    "output_px": width,
    "metres_per_output_px": f * sp,
    "image_up_bearing_deg": up_bearing,
    "image_right_bearing_deg": right_bearing,
}
json.dump(meta, open(os.path.join(here, "_" + name + ".json"), "w"), indent=1)
print(json.dumps({k: meta[k] for k in ["crop_centre_latlon", "crop_size_m", "image_up_bearing_deg", "image_right_bearing_deg"]}))
