/* Serveur local de Radar Afrique : sert les fichiers de l'application ET analyse les sites web des prospects.
 * Lancement : node server.js   (puis http://localhost:8080 ; autre port : PORT=8090 node server.js)
 * Sécurité : écoute uniquement sur 127.0.0.1, refuse les adresses privées/locales (anti-SSRF),
 *            ne sert qu'une liste fixe de fichiers, borne le temps et la taille des pages analysées.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const net = require("net");

const PORT = +process.env.PORT || 8080;
const TIMEOUT = 10000, MAX_BYTES = 800 * 1024, MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (compatible; RadarAfriqueBot/1.0; audit de site)";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const FILES = new Set(["index.html", "style.css", "app.js", "scan.js", "places.js", "sitecheck.js", "data.js", "cities.js", "africa-geo.js"]);
const CERT_ERRORS = new Set(["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_NOT_YET_VALID", "CERT_UNTRUSTED"]);

// ---------- Protection : jamais d'adresses privées / locales
function isPrivate(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivate(m[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function safeLookup(host, opts, cb) {
  dns.lookup(host, opts, (err, address, family) => {
    if (err) return cb(err);
    const list = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (list.some(isPrivate)) return cb(new Error("adresse privée ou locale refusée"));
    cb(null, address, family);
  });
}

// ---------- Téléchargement d'une page (une requête)
function request(urlStr, insecure) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(urlStr); } catch (e) { return reject(new Error("URL invalide")); }
    if (!/^https?:$/.test(u.protocol)) return reject(new Error("seuls http et https sont acceptés"));
    const host = u.hostname.replace(/^\[|\]$/g, ""); // une IP écrite en clair ne passe pas par le DNS : on la contrôle ici
    if (net.isIP(host) && isPrivate(host)) return reject(new Error("adresse privée ou locale refusée"));
    const lib = u.protocol === "https:" ? https : http;
    const t0 = Date.now(), chunks = []; let size = 0, done = false;
    const finish = (res) => { if (done) return; done = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), ms: Date.now() - t0, url: u.href }); };
    const req = lib.request(u, { method: "GET", lookup: safeLookup, rejectUnauthorized: !insecure, timeout: TIMEOUT,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "fr,en;q=0.8" } }, (res) => {
      res.on("data", (c) => { size += c.length; if (size <= MAX_BYTES) chunks.push(c); else { finish(res); res.destroy(); } });
      res.on("end", () => finish(res));
      res.on("error", (e) => { if (!done) { done = true; reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error("délai dépassé (10 s)")));
    req.on("error", (e) => { if (!done) { done = true; reject(e); } });
    req.end();
  });
}
// Suit les redirections ; en cas de certificat invalide, réessaie sans vérification pour pouvoir analyser quand même
async function fetchFollow(startUrl) {
  let url = startUrl, certError = "", insecure = false, ttfb = 0;
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    let res;
    try { res = await request(url, insecure); }
    catch (e) {
      // certificat invalide (ou coupure TLS) : on réessaie sans vérification pour pouvoir analyser quand même la page
      if (!insecure && url.startsWith("https:") && (CERT_ERRORS.has(e.code) || e.code === "ECONNRESET")) { certError = CERT_ERRORS.has(e.code) ? e.code : "TLS_ERROR"; insecure = true; n--; continue; }
      throw e;
    }
    ttfb += res.ms;
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) { url = new URL(res.headers.location, url).href; continue; }
    return { ...res, certError, totalMs: ttfb };
  }
  throw new Error("trop de redirections");
}

// ---------- Analyse du HTML
const uniq = (a) => [...new Set(a)];
function analyzeHtml(html, headers) {
  const h = html.slice(0, MAX_BYTES), low = h.toLowerCase();
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const gen = (h.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']{1,60})/i) || [])[1];
  const cms = gen ? gen.split(/[ ,]/)[0] : /wp-content|wp-includes/.test(low) ? "WordPress" : /wixstatic|wix\.com/.test(low) ? "Wix" : /cdn\.shopify|shopify/.test(low) ? "Shopify"
    : /squarespace/.test(low) ? "Squarespace" : /joomla/.test(low) ? "Joomla" : /weebly/.test(low) ? "Weebly" : /blogspot|blogger/.test(low) ? "Blogger" : "";
  const years = [];
  for (const m of h.matchAll(/(?:©|&copy;|&#169;|copyright)[^0-9<]{0,40}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)) years.push(+(m[2] || m[1]));
  const now = new Date().getFullYear();
  let year = years.filter((y) => y <= now + 1).sort((a, b) => b - a)[0] || 0, yearSrc = year ? "©" : "";
  if (!year && headers["last-modified"]) { const y = new Date(headers["last-modified"]).getFullYear(); if (y > 1995 && y <= now) { year = y; yearSrc = "dernière modification"; } }
  const emails = uniq((h.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase()).filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) && !/(example|domain|sentry|wixpress|yourdomain|email\.com$)/.test(e))).slice(0, 5);
  const phones = uniq([...h.matchAll(/href=["']tel:([^"']{6,30})["']/gi)].map((m) => decodeURIComponent(m[1]).replace(/[^\d+]/g, ""))
    .concat([...h.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=)\+?(\d{8,15})/gi)].map((m) => "+" + m[1]))).filter((p) => p.length >= 8).slice(0, 5);
  const social = (re) => (h.match(re) || [])[0] || "";
  const fb = social(/https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|plugins|tr\?|dialog)[A-Za-z0-9_.\-/]{3,80}/i);
  const ig = social(/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[A-Za-z0-9_.]{2,40}/i);
  return {
    title: title ? title.replace(/\s+/g, " ").trim().slice(0, 120) : "",
    viewport: /<meta[^>]+name=["']viewport["']/i.test(h), cms, year, yearSrc, emails, phones, fb, ig,
    whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(h),
    shop: /add[- ]to[- ]cart|ajouter au panier|panier|checkout|woocommerce|\/cart\b|commander en ligne/i.test(h),
    payment: /orange money|wave\b|mtn (?:momo|mobile money)|mobile money|paystack|flutterwave|cinetpay|paypal|stripe|paiement en ligne|online payment/i.test(h)
  };
}

async function check(input) {
  let url = String(input || "").trim();
  if (!url || url.length > 300) throw new Error("URL manquante ou trop longue");
  const noScheme = !/^https?:\/\//i.test(url);
  if (noScheme) url = "https://" + url;
  const out = { url, ok: false, status: 0, finalUrl: "", https: false, certError: "", ms: 0, bytes: 0, error: "" };
  let page;
  try { page = await fetchFollow(url); }
  catch (e) {
    if (noScheme && !CERT_ERRORS.has(e.code)) { try { page = await fetchFollow("http://" + url.slice(8)); } catch (e2) { e = e2; } }
    if (!page) {
      const friendly = { ENOTFOUND: "domaine introuvable", EAI_AGAIN: "domaine introuvable (DNS)", ECONNREFUSED: "connexion refusée", ECONNRESET: "connexion coupée par le serveur", ETIMEDOUT: "délai dépassé" };
      out.error = friendly[e.code] || e.message || "erreur réseau";
      return out;
    }
  }
  out.status = page.status; out.finalUrl = page.url; out.certError = page.certError; out.ms = page.totalMs; out.bytes = page.body.length;
  out.https = page.url.startsWith("https:") && !page.certError;
  out.ok = page.status >= 200 && page.status < 400;
  if (!out.ok) out.error = "HTTP " + page.status;
  if (page.body) Object.assign(out, analyzeHtml(page.body, page.headers));
  return out;
}

// ---------- Serveur
const localHost = (h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h || "");
function serve(req, res) {
  const send = (code, body, type) => { res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }); res.end(body); };
  if (!localHost(req.headers.host)) return send(403, "Forbidden");
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/api/check") {
    if (req.method !== "GET") return send(405, "Method Not Allowed");
    return check(u.searchParams.get("url")).then((r) => send(200, JSON.stringify(r), "application/json; charset=utf-8"))
      .catch((e) => send(400, JSON.stringify({ error: e.message }), "application/json; charset=utf-8"));
  }
  const name = u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname.slice(1));
  if (!FILES.has(name)) return send(404, "Not found");
  fs.readFile(path.join(__dirname, name), (err, data) => err ? send(404, "Not found") : send(200, data, TYPES[path.extname(name)]));
}

module.exports = { check, analyzeHtml, isPrivate, request, fetchFollow };
if (require.main === module) {
  http.createServer(serve).listen(PORT, "127.0.0.1", () => console.log(`Radar Afrique : http://localhost:${PORT}  (Ctrl+C pour arrêter)`))
    .on("error", (e) => { console.error(e.code === "EADDRINUSE" ? `Le port ${PORT} est occupé. Essayez : set PORT=8090 puis node server.js` : e.message); process.exit(1); });
}
