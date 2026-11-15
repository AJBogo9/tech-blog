# Vendored readlog beacon

`inject-beacon.sh`, `a.js` and `r.js` are copies, and so are
`../_edge/_worker.js` and `../_edge/_routes.json`. The source of truth is
`~/Documents/personal/readlog` (`tools/inject-beacon.sh`, `beacon/` and `edge/`).

Resync with:

    cp ~/Documents/personal/readlog/tools/inject-beacon.sh _beacon/inject-beacon.sh
    cp ~/Documents/personal/readlog/beacon/a.js _beacon/a.js
    cp ~/Documents/personal/readlog/beacon/r.js _beacon/r.js
    cp ~/Documents/personal/readlog/edge/_worker.js _edge/_worker.js
    cp ~/Documents/personal/readlog/edge/_routes.json _edge/_routes.json

They are vendored rather than referenced so a publish never depends on a
sibling checkout being present. They live above `site/`, so `taliesin build
site` cannot see them, the same way `_infra/` is invisible.

Site and endpoint are not baked into the page scripts (`a.js` and `r.js`):
`publish.sh` passes them to `inject-beacon.sh`, so these copies stay
byte-identical to the source and cannot drift. The Worker has defaults for
both, which `READLOG_URL` and `READLOG_SITE` in the Pages project's settings
override, and reads its key from the `READLOG_KEY` secret; see readlog's
`edge/README.md`.
