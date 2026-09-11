# Vendored readlog beacon

`inject-beacon.sh` and `b.js` are copies. The source of truth is
`~/Documents/personal/readlog` (`tools/inject-beacon.sh` and `beacon/b.js`).

Resync with:

    cp ~/Documents/personal/readlog/tools/inject-beacon.sh _beacon/inject-beacon.sh
    cp ~/Documents/personal/readlog/beacon/b.js _beacon/b.js

They are vendored rather than referenced so a publish never depends on a
sibling checkout being present. They live above `site/`, so `taliesin build
site` structurally cannot see them, the same way `_infra/` is invisible.

Site and endpoint are not baked into the script: `publish.sh` passes them,
so this copy stays byte-identical to the source and cannot drift.
