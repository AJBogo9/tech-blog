"""Fetch the data behind the Finnish job market page into data/*.json.

Run from this folder with `python3 _fetch.py`. Standard library only.

Sources (all open, no key):
  Statistics Finland, Labour Force Survey, table tyti/135z (CC BY 4.0)
  KEHA Centre via Statistics Finland, employment service statistics, tables
    tyonv/12r5 (regions) and tyonv/12ti (occupations)
  Eurostat, une_rt_m (monthly unemployment rates)
"""
import itertools
import json
import time
import urllib.request
from pathlib import Path

PX = "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
OUT = Path(__file__).parent / "data"
UA = {"User-Agent": "andreasbogossian.com job-market page", "Content-Type": "application/json"}

REGIONS = ["SSS"] + [f"MK{n:02d}" for n in (1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21)]
REGION_MEASURES = {
    "TYOTTOMATLOPUSSA": "Unemployed jobseekers",
    "TYOTOSUUS": "Unemployed jobseekers, % of workforce",
    "TYOTTOMAT25": "Unemployed jobseekers under 25",
    "PITKAAIKAISTYOTTOMAT": "Long-term unemployed (over a year)",
    "LOMAUTETTU": "Fully laid off",
    "AVPAIKATLOPUSSA": "Open vacancies, end of month",
    "UUDETAVP": "New vacancies during the month",
}
OCC_AREAS = ["SSS", "MK01"]
OCC_MEASURES = {"TYOTTOMATLOPUSSA": "Unemployed jobseekers", "AVPAIKATLOPUSSA": "Open vacancies, end of month"}
LFS_SERIES = {
    "tyottaste_trendi": "Unemployment rate, %, trend",
    "Tyottaste_kausi": "Unemployment rate, %, seasonally adjusted",
    "Tyottaste_15_24_trendi": "Unemployment rate, ages 15 to 24, %, trend",
    "Tyollaste_20_64_trendi": "Employment rate, ages 20 to 64, %, trend",
    "tyolliset_trendi": "Employed, thousands, trend",
    "tyottomat_trendi": "Unemployed, thousands, trend",
}

_last_call = [0.0]


def request(url, query=None):
    """GET or POST with a pause that keeps us under 40 calls a minute."""
    wait = 1.6 - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    data = json.dumps(query).encode() if query else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=120) as r:
        _last_call[0] = time.time()
        return json.load(r)


def px(table, selection):
    """Query a StatFin table; return (dimension -> ordered codes, labels, flat values, sizes, ids)."""
    query = {"query": [{"code": k, "selection": {"filter": "all" if v == ["*"] else "item", "values": v}} for k, v in selection.items()],
             "response": {"format": "json-stat2"}}
    d = request(f"{PX}/{table}.px", query)
    codes = {k: sorted(d["dimension"][k]["category"]["index"], key=d["dimension"][k]["category"]["index"].get) for k in d["id"]}
    labels = {k: d["dimension"][k]["category"]["label"] for k in d["id"]}
    return codes, labels, d["value"], d["size"], d["id"], d.get("source", "")


def cube(codes, values, size, ids, keep):
    """Turn a flat json-stat2 value list into nested dicts over `keep`, with the time series as the leaves."""
    strides = [1] * len(ids)
    for i in range(len(ids) - 2, -1, -1):
        strides[i] = strides[i + 1] * size[i + 1]
    tdim = next(k for k in ids if k.startswith("timeperiod"))
    others = [k for k in keep if k != tdim]
    out = {}
    for combo in itertools.product(*(range(len(codes[k])) for k in others)):
        base = sum(i * strides[ids.index(k)] for i, k in zip(combo, others))
        series = [values[base + j * strides[ids.index(tdim)]] for j in range(len(codes[tdim]))]
        node = out
        for i, k in zip(combo[:-1], others[:-1]):
            node = node.setdefault(codes[k][i], {})
        node[codes[others[-1]][combo[-1]]] = series
    return out


def month(code):
    return code[:4] + "-" + code[5:7]


def lfs():
    codes, _, values, size, ids, _ = px("tyti/135z", {"contentscode": list(LFS_SERIES)})
    series = cube(codes, values, size, ids, ["contentscode", "timeperiod_m"])
    return {"source": "Statistics Finland, Labour Force Survey (tyti/135z), CC BY 4.0",
            "months": [month(m) for m in codes["timeperiod_m"]],
            "series": {k: {"label": LFS_SERIES[k], "values": v} for k, v in series.items()}}


def regions():
    codes, labels, values, size, ids, source = px("tyonv/12r5", {"Alue": REGIONS, "contentscode": list(REGION_MEASURES)})
    data = cube(codes, values, size, ids, ["Alue", "contentscode", "timeperiod_m"])
    names = {c: labels["Alue"][c].removeprefix(c).strip().title() if c == "SSS" else labels["Alue"][c][5:] for c in codes["Alue"]}
    names["SSS"] = "Whole country"
    return {"source": source or "KEHA Centre / Statistics Finland, employment service statistics (tyonv/12r5)",
            "months": [month(m) for m in codes["timeperiod_m"]],
            "areas": names, "measures": REGION_MEASURES, "values": data}


def occupations():
    out = {"areas": {"SSS": "Whole country", "MK01": "Uusimaa"}, "measures": OCC_MEASURES, "values": {}}
    for area in OCC_AREAS:
        for measure in OCC_MEASURES:
            codes, labels, values, size, ids, source = px("tyonv/12ti", {"Alue": [area], "Ammattiryhmä": ["*"], "contentscode": [measure]})
            data = cube(codes, values, size, ids, ["Ammattiryhmä", "timeperiod_m"])
            out["values"].setdefault(area, {})[measure] = data
            out["months"] = [month(m) for m in codes["timeperiod_m"]]
            out["occupations"] = {c: labels["Ammattiryhmä"][c].removeprefix(c).strip() for c in codes["Ammattiryhmä"]}
            out["occupations"]["SSS"] = "All occupations"
            out["source"] = source or "KEHA Centre / Statistics Finland, employment service statistics (tyonv/12ti)"
    return out


def eu():
    out = {"source": "Eurostat, une_rt_m (seasonally adjusted, % of labour force)", "series": {}}
    for age in ("TOTAL", "Y_LT25"):
        d = request(f"{EUROSTAT}/une_rt_m?s_adj=SA&sex=T&unit=PC_ACT&age={age}&sinceTimePeriod=2009-01")
        geo = d["dimension"]["geo"]["category"]
        t = d["dimension"]["time"]["category"]["index"]
        months = sorted(t, key=t.get)
        out["months"] = months
        out["names"] = geo["label"]
        for g, gi in geo["index"].items():
            vals = [d["value"].get(str(gi * len(months) + t[m])) for m in months]
            if any(v is not None for v in vals):
                out["series"].setdefault(age, {})[g] = vals
    return out


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn in [("lfs", lfs), ("regions", regions), ("occupations", occupations), ("eu", eu)]:
        data = fn()
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        print(f"{name:12} {path.stat().st_size / 1e3:8.0f} kB")
    (Path(__file__).parent / "_fetched.txt").write_text(time.strftime("%Y-%m-%d %H:%M") + "\n")
