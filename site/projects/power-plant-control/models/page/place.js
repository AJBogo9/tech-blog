// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// a place in the page as a link (viewing design V11): `#/s/<system>?sel=<SIDs>`, each part
// URI-encoded and the SIDs joined by commas; a page showing a model other than its server's own
// names it first, `#/m/<path below the server's folder>/s/...` (a link written by hand may leave
// the path's slashes raw)

const PLACE = /^#(?:\/m\/(.+))?\/s\/([^?]+)(?:\?sel=([^&]*))?$/;

// the place a link names; null for any other fragment, the token's included
export function parsePlace(hash) {
  const found = PLACE.exec(hash ?? '');
  if (!found) return null;
  try {
    const sel = found[3] ? [...new Set(found[3].split(',').filter(Boolean).map(decodeURIComponent))] : [];
    const place = { system: decodeURIComponent(found[2]), sel };
    return found[1] ? { model: decodeURIComponent(found[1]), ...place } : place;
  } catch {
    return null;
  }
}

export function placeHash({ model, system, sel = [] }) {
  const base = `${model ? `#/m/${encodeURIComponent(model)}` : '#'}/s/${encodeURIComponent(system)}`;
  return sel.length > 0 ? `${base}?sel=${sel.map(encodeURIComponent).join(',')}` : base;
}

// the token `slxkit view` puts in the fragment, `#t=<hex>`, and the place that may follow it
// (`#t=<hex>/s/...` from the VS Code extension); `rest` is the fragment without the token
export function splitToken(hash) {
  const found = /^#t=([0-9a-f]+)(\/[sm]\/.*)?$/.exec(hash ?? '');
  if (!found) return { token: null, rest: hash ?? '' };
  return { token: found[1], rest: found[2] ? `#${found[2]}` : '' };
}

// the address that shows the picker
export const PICK = '#/pick';
export const isPick = (hash) => hash === PICK;

// where a place lands in a model that may have lost its system: that system, else its nearest
// parent the model still has (by `parents`, every system's parent seen this session), else the
// root; blocks are kept only in the system itself
export function landing(place, systems, parents) {
  const now = new Set(systems.map((s) => s.id));
  if (now.has(place.system)) return place;
  const seen = new Set();
  for (let at = parents.get(place.system); at != null && !seen.has(at); at = parents.get(at)) {
    seen.add(at);
    if (now.has(at)) return { system: at, sel: [] };
  }
  return { system: 'root', sel: [] };
}
