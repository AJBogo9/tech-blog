// readlog pages worker: serves the site, counts real html navigations
const enc = new TextEncoder();
const dec = new TextDecoder();

// truncate to a byte budget on a utf-8 character boundary
function clip(s, max) {
  if (s == null) return null;
  const b = enc.encode(s);
  if (b.length <= max) return s;
  let end = max;
  while (end > 0 && (b[end] & 0xc0) === 0x80) end--;
  return dec.decode(b.subarray(0, end));
}

const hdr = (request, name, max = 1024) => clip(request.headers.get(name), max);

// sec-purpose or legacy purpose, lowercased
const purposeOf = (request) =>
  ["sec-purpose", "purpose"].map((n) => request.headers.get(n) || "").join(" ").toLowerCase();

export function shouldCount(request, response) {
  if (request.method !== "GET") return false;
  const mode = request.headers.get("sec-fetch-mode");
  const dest = request.headers.get("sec-fetch-dest");
  const explicitNav = mode === "navigate" && dest === "document";
  if (response.status === 304) {
    // revalidation carries no content-type: count only explicit navigations
    if (!explicitNav) return false;
  } else {
    if (response.status !== 200) return false;
    const type = response.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("text/html")) return false;
  }
  if (request.headers.get("sec-gpc") === "1") return false;
  if (purposeOf(request).includes("prerender")) return false;
  if (mode === null && dest === null) return true;
  return explicitNav;
}

export function buildHit(request, site) {
  const url = new URL(request.url);
  const cf = request.cf || {};
  const str = (v) => (typeof v === "string" ? clip(v, 1024) : null);
  return {
    site: clip(site, 1024),
    path: clip(url.pathname, 2048),
    purpose: purposeOf(request).includes("prefetch") ? "prefetch" : null,
    query: url.search ? clip(url.search, 1024) : null,
    referrer: hdr(request, "referer"),
    ua: hdr(request, "user-agent"),
    sec_fetch: {
      mode: hdr(request, "sec-fetch-mode"),
      dest: hdr(request, "sec-fetch-dest"),
      site: hdr(request, "sec-fetch-site"),
      user: hdr(request, "sec-fetch-user"),
    },
    ch: {
      ua: hdr(request, "sec-ch-ua"),
      platform: hdr(request, "sec-ch-ua-platform"),
      mobile: hdr(request, "sec-ch-ua-mobile"),
    },
    cf: {
      country: str(cf.country),
      asn: Number.isInteger(cf.asn) ? cf.asn : null,
      colo: str(cf.colo),
    },
  };
}

async function send(request, env) {
  try {
    const base = (env.READLOG_URL || "https://t.andreasbogossian.com").replace(/\/+$/, "");
    const hit = buildHit(request, env.READLOG_SITE || "andreasbogossian.com");
    await fetch(`${base}/hit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-readlog-key": env.READLOG_KEY,
        "x-readlog-ip": request.headers.get("cf-connecting-ip"),
      },
      body: JSON.stringify(hit),
    });
  } catch (_) {
    // counting never breaks a page
  }
}

const COOKIE = "Max-Age=34560000; Path=/; Secure; HttpOnly; SameSite=Lax";
const control = {
  "/_readlog/ignore": {
    cookie: `rl_ignore=1; ${COOKIE}`,
    text: "This browser is no longer counted on this site.",
    link: ["/_readlog/count", "Count this browser again"],
  },
  "/_readlog/count": {
    cookie: "rl_ignore=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    text: "This browser is counted again.",
    link: ["/_readlog/ignore", "Stop counting this browser"],
  },
};

function controlPage(c) {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>readlog</title><p>${c.text}</p><p><a href="${c.link[0]}">${c.link[1]}</a></p>`;
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": c.cookie,
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

const ignored = (request) => /(?:^|;\s*)rl_ignore=1(?:;|$)/.test(request.headers.get("cookie") || "");

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      const c = control[new URL(request.url).pathname];
      if (c) return controlPage(c);
    }
    const response = await env.ASSETS.fetch(request);
    try {
      if (
        env.READLOG_KEY &&
        !ignored(request) &&
        request.headers.get("cf-connecting-ip") &&
        shouldCount(request, response)
      ) {
        ctx.waitUntil(send(request, env));
      }
    } catch (_) {
      // counting never breaks a page
    }
    return response;
  },
};
