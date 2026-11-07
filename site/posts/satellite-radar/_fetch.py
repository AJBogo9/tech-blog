# /// script
# dependencies = ["pystac-client", "planetary-computer", "rasterio", "numpy", "pillow", "pyproj"]
# ///
"""Fetch the demo's scenes of the Thessaly flood (Storm Daniel, September 2023).

Run once with `uv run _fetch.py` from this folder. It reads a 6.4 km square of
Sentinel-1 radar (RTC, VV, relative orbit 102) and Sentinel-2 photos from the
Microsoft Planetary Computer and writes small files next to the post:

  s1-before.png, s1-after.png   radar backscatter in dB, 8 bit, -30 dB .. +10 dB
  s2-before.webp, s2-cloud.webp, s2-after.webp   true-colour photos
  dry-mask.png                  255 where the 10 September photo shows dry,
                                cloud-free land, 0 elsewhere
"""
import json
import numpy as np
import planetary_computer as pc
import pystac_client
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

CRS = "EPSG:32634"                     # UTM zone 34N, metres
RES = 10.0                             # metres per pixel
N = 640                                # pixels per side, 6.4 km
X0, Y1 = 603_620.0, 4_387_670.0        # top-left corner in UTM 34N
DB_LO, DB_HI = -30.0, 10.0             # dB range stored in the 8-bit PNGs

transform = from_origin(X0, Y1, RES, RES)
to_ll = Transformer.from_crs(CRS, 4326, always_xy=True)
lon0, lat0 = to_ll.transform(X0, Y1 - N * RES)
lon1, lat1 = to_ll.transform(X0 + N * RES, Y1)
bbox = [lon0, lat0, lon1, lat1]
cat = pystac_client.Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1", modifier=pc.sign_inplace)


def read(collection, date, asset, rel=None, resampling=Resampling.nearest):
    """Mosaic every scene of one day onto the demo grid; 0 means no data."""
    items = cat.search(collections=[collection], bbox=bbox, datetime=date).item_collection()
    if rel is not None:
        items = [i for i in items if i.properties.get("sat:relative_orbit") == rel]
    out = None
    for item in items:
        with rasterio.open(item.assets[asset].href) as src:
            with WarpedVRT(src, crs=CRS, transform=transform, width=N, height=N,
                           resampling=resampling) as vrt:
                a = vrt.read(out_dtype="float32")
        out = a if out is None else np.where(out == 0, a, out)
    return out, [i.id for i in items]


meta = {"crs": CRS, "res_m": RES, "size_px": N, "top_left": [X0, Y1],
        "bbox_lonlat": [round(b, 5) for b in bbox], "db_range": [DB_LO, DB_HI], "scenes": {}}

for name, date in [("s1-before", "2023-08-26"), ("s1-after", "2023-09-07")]:
    vv, ids = read("sentinel-1-rtc", date, "vv", rel=102)
    db = 10 * np.log10(np.maximum(vv[0], 1e-6))
    q = np.round((np.clip(db, DB_LO, DB_HI) - DB_LO) / (DB_HI - DB_LO) * 255).astype(np.uint8)
    Image.fromarray(q).save(f"{name}.png", optimize=True)
    meta["scenes"][name] = {"date": date, "ids": ids}

for name, date in [("s2-before", "2023-08-31"), ("s2-cloud", "2023-09-05"), ("s2-after", "2023-09-10")]:
    rgb, ids = read("sentinel-2-l2a", date, "visual")
    Image.fromarray(np.moveaxis(rgb, 0, -1).astype(np.uint8)).save(f"{name}.webp", quality=82)
    meta["scenes"][name] = {"date": date, "ids": ids}

# dry land on 10 September: modified normalised difference water index below 0
# (green band B03 against shortwave infrared B11), minus clouds and shadows from
# the scene classification layer
green, _ = read("sentinel-2-l2a", "2023-09-10", "B03")
swir, _ = read("sentinel-2-l2a", "2023-09-10", "B11", resampling=Resampling.bilinear)
scl, _ = read("sentinel-2-l2a", "2023-09-10", "SCL")
# Sentinel-2 values since processing baseline 04.00 carry an offset of +1000
g, s = np.maximum(green[0] - 1000, 0), np.maximum(swir[0] - 1000, 0)
mndwi = (g - s) / np.maximum(g + s, 1)
cloudy = np.isin(scl[0], [0, 1, 3, 8, 9, 10])   # no data, defective, shadow, cloud, cirrus
dry = (mndwi < 0) & ~cloudy
Image.fromarray((dry * 255).astype(np.uint8)).save("dry-mask.png", optimize=True)
meta["dry_share"] = round(float(dry.mean()), 4)
meta["cloud_share_10sep"] = round(float(cloudy.mean()), 4)
json.dump(meta, open("_scenes.json", "w"), indent=1)
print(json.dumps(meta, indent=1))
