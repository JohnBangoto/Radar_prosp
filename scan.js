/* Scan de commerces locaux (OpenStreetMap) + qualification par un modèle local (Qwen via Ollama).
 * Flux : pays cliqué sur la carte -> ville + types de commerces -> Nominatim (zone) -> Overpass (commerces)
 *        -> (option) Qwen déduit les manques probables et rédige le message -> ajout aux prospects.
 * Les données OSM sont publiques ; seules celles renseignées par les contributeurs apparaissent (tél., site...).
 */
(function () {
  const R = () => window.RADAR;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Catégories ciblées : filtres OSM + secteur correspondant dans data.js (SECTEURS)
  const CATS = [
    { id: "garage",  nom: "Garages & mécanique",   osm: ['shop"="car_repair', 'shop"="tyres', 'shop"="car_parts'], secteur: "Transport & logistique" },
    { id: "coiff",   nom: "Salons de coiffure & beauté", osm: ['shop"="hairdresser', 'shop"="beauty'], secteur: "Commerce & distribution" },
    { id: "resto",   nom: "Restaurants & cafés",   osm: ['amenity"="restaurant', 'amenity"="fast_food', 'amenity"="cafe', 'amenity"="bar', 'shop"="bakery'], secteur: "Hôtellerie, restauration & tourisme" },
    { id: "hotel",   nom: "Hôtels & hébergement",  osm: ['tourism"="hotel', 'tourism"="guest_house'], secteur: "Hôtellerie, restauration & tourisme" },
    { id: "commerce",nom: "Boutiques & commerces", osm: ['shop"="clothes', 'shop"="convenience', 'shop"="supermarket', 'shop"="electronics'], secteur: "Commerce & distribution" },
    { id: "sante",   nom: "Pharmacies & cliniques",osm: ['amenity"="pharmacy', 'amenity"="clinic', 'amenity"="dentist'], secteur: "Santé (cliniques, pharmacies)" },
    { id: "immo",    nom: "Agences immobilières",  osm: ['office"="estate_agent'], secteur: "Immobilier" },
    { id: "cabinet", nom: "Cabinets (compta, droit)", osm: ['office"="accountant', 'office"="lawyer'], secteur: "Cabinets (comptables, juridiques, conseil)" }
  ];
  // Manques que l'IA a le droit de suggérer, selon le type de commerce (le reste serait hors-sujet)
  const CAT_Q = {
    garage: ["wa", "pay", "excel", "crm", "support"], coiff: ["wa", "pay", "crm", "support"], resto: ["wa", "pay", "support", "crm"],
    hotel: ["pay", "support", "crm", "wa"], commerce: ["pay", "wa", "excel", "crm", "support"], sante: ["wa", "support", "excel", "rgpd", "backup"],
    immo: ["wa", "crm", "support", "pay"], cabinet: ["excel", "crm", "forma", "backup", "rgpd"]
  };
  const LANG = { fr: "français", en: "anglais", ar: "arabe", pt: "portugais", es: "espagnol" };

  // Grandes villes par pays (voir cities.js)
  const CITIES = Object.fromEntries(Object.entries(window.VILLES).map(([k, v]) => [k, v.map((x) => x[0])]));
  const cfg = (() => {
    let c = {}; try { c = JSON.parse(localStorage.getItem("radar.qwen") || "{}"); } catch (e) {}
    return { url: c.url || "http://localhost:11434", model: c.model || "", ville: c.ville || "", contactOnly: c.contactOnly !== false, cats: c.cats || ["garage", "coiff", "resto"],
      src: c.src || "osm", gkey: c.gkey || "", gmax: c.gmax || 30 };
  })();
  const save = () => { try { localStorage.setItem("radar.qwen", JSON.stringify(cfg)); } catch (e) {} };
  const S = { results: [], busy: false, status: "", onlyNoSite: true, onlyContact: true, ollama: "", city: "__all__" };

  // ---------- Zone + commerces
  async function geocode(ville, pays) {
    const u = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr&q=" + encodeURIComponent(ville + ", " + pays);
    const r = await fetch(u); if (!r.ok) throw new Error("Nominatim " + r.status);
    const j = await r.json(); if (!j.length) throw new Error("Ville introuvable : " + ville);
    const [s, n, w, e] = j[0].boundingbox.map(Number);
    return { bbox: [s, w, n, e], label: j[0].display_name };
  }
  const CONTACT_KEYS = "^(phone|contact:phone|mobile|contact:mobile|phone:mobile|contact:whatsapp|whatsapp|email|contact:email|website|contact:website|url|contact:facebook|facebook|contact:instagram|instagram)$";
  async function overpass(bbox, catIds, contactOnly) {
    const b = bbox.join(",");
    const parts = [];
    CATS.filter((c) => catIds.includes(c.id)).forEach((c) => c.osm.forEach((f) => parts.push(`nwr["${f}"]["name"]${contactOnly ? `[~"${CONTACT_KEYS}"~"."]` : ""}(${b});`)));
    const q = `[out:json][timeout:40];(${parts.join("")});out center tags 1000;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (!r.ok) throw new Error("Overpass " + r.status + " (réessayez dans un instant)");
    return (await r.json()).elements;
  }
  const DIAL = { DZA: 213, EGY: 20, LBY: 218, MAR: 212, TUN: 216, ESH: 212, MRT: 222, SDN: 249, SEN: 221, CIV: 225, GHA: 233, NGA: 234, BEN: 229, TGO: 228, BFA: 226, MLI: 223, NER: 227, GIN: 224, GNB: 245, GMB: 220, LBR: 231, SLE: 232, CMR: 237, GAB: 241, COG: 242, COD: 243, TCD: 235, CAF: 236, GNQ: 240, KEN: 254, ETH: 251, UGA: 256, TZA: 255, RWA: 250, BDI: 257, SOM: 252, DJI: 253, ERI: 291, SSD: 211, ZAF: 27, AGO: 244, MOZ: 258, ZMB: 260, ZWE: 263, BWA: 267, NAM: 264, MWI: 265, MDG: 261, LSO: 266, SWZ: 268 };
  function normPhone(raw, iso) {
    let d = String(raw).replace(/[^\d+]/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = "+" + d.slice(2);
    if (d.startsWith("+")) return d.length >= 9 ? d : "";
    const dial = String(DIAL[iso] || "");
    if (!dial) return d.length >= 8 ? d : "";
    if (d.startsWith(dial) && d.length >= dial.length + 7) return "+" + d;
    d = d.replace(/^0+/, "");
    return d.length >= 7 ? "+" + dial + d : "";
  }
  const safeUrl = (u) => { u = String(u || "").trim(); if (/^https?:\/\//i.test(u)) return u; if (/^www\./i.test(u)) return "https://" + u; return ""; };
  const social = (v, base) => { v = String(v || "").trim(); if (!v) return ""; return safeUrl(v) || base + v.replace(/^@/, "").replace(/[^\w.\-]/g, ""); };
  function toResult(el, paysId) {
    const t = el.tags || {};
    const cat = CATS.find((c) => c.osm.some((f) => { const [k, v] = f.split('"="'); return t[k] === v; }));
    const site = safeUrl(t.website || t["contact:website"] || t.url || t["contact:url"]);
    const fb = social(t["contact:facebook"] || t.facebook, "https://www.facebook.com/");
    const ig = social(t["contact:instagram"] || t.instagram, "https://www.instagram.com/");
    const tw = social(t["contact:twitter"] || t.twitter, "https://x.com/");
    const tk = social(t["contact:tiktok"], "https://www.tiktok.com/@");
    const wa = normPhone(t["contact:whatsapp"] || t.whatsapp || "", paysId);
    const raw = [t.phone, t["contact:phone"], t.mobile, t["contact:mobile"], t["phone:mobile"], t["contact:whatsapp"], t.whatsapp].filter(Boolean).join(";");
    const phones = [...new Set(raw.split(/[;,\/]/).map((x) => normPhone(x, paysId)).filter(Boolean))];
    const mail = (t.email || t["contact:email"] || "").split(";")[0].trim();
    const adr = [t["addr:full"] || [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ");
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    const yes = (k) => t[k] === "yes";
    const pay = Object.keys(t).filter((k) => /^payment:/.test(k) && t[k] === "yes").map((k) => k.slice(8).replace(/_/g, " ")).slice(0, 5);
    const infos = [t.cuisine && "cuisine : " + t.cuisine.replace(/;/g, ", ").replace(/_/g, " "), yes("delivery") && "livraison", yes("takeaway") && "à emporter", yes("outdoor_seating") && "terrasse",
      /^(wlan|wifi|yes)$/.test(t.internet_access || "") && "wifi", t.capacity && t.capacity + " places", t.stars && t.stars + "★", (t.brand || t.operator) && "enseigne : " + (t.brand || t.operator),
      pay.length && "paiement : " + pay.join(", ")].filter(Boolean);
    const gaps = [];
    if (!site) gaps.push("nosite");
    if (mail && /@(gmail|yahoo|hotmail|outlook)\./i.test(mail)) gaps.push("mailpro");
    return { id: el.type + el.id, src: "osm", osm: el.type + "/" + el.id, nom: t.name, cat: cat?.nom || "Autre", cid: cat?.id, secteur: cat?.secteur,
      site, fb, ig, tw, tk, wa, phones, tel: phones.join(", "), mail, adr, hours: t.opening_hours || "", infos, desc: String(t.description || "").slice(0, 200), lat, lng, pays: paysId,
      facts: gaps.slice(), hyp: [], gaps, msg: "", ia: "",
      q: (site ? 0 : 3) + (phones.length ? 3 : 0) + (mail ? 1 : 0) + (fb || ig ? 1 : 0) + (wa ? 1 : 0) + Math.min(infos.length, 3) * 0.2 };
  }
  const hasContact = (r) => r.phones.length || r.mail || r.fb || r.ig || r.wa;
  function searchLinks(r) {
    const pa = R().P[r.pays]?.nom || "", q = [r.nom, r.ville, pa].filter(Boolean).join(" ");
    return [[r.gmaps ? "Fiche Google" : "Google Maps", r.gmaps || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q)],
      ["Google (téléphone)", "https://www.google.com/search?q=" + encodeURIComponent(q + " téléphone contact")],
      ["Facebook", "https://www.facebook.com/search/top?q=" + encodeURIComponent(r.nom + " " + (r.ville || ""))],
      ["Instagram", "https://www.google.com/search?q=" + encodeURIComponent(q + " instagram")],
      ...(r.osm ? [["OSM", "https://www.openstreetmap.org/" + r.osm]] : [])];
  }
  const A = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  function contactCell(r) {
    const L = r.phones.map((p) => `<div>📞 <a href="tel:${esc(p)}">${esc(p)}</a> ${A("https://wa.me/" + p.replace(/\D/g, ""), "WhatsApp")}</div>`);
    if (r.mail) L.push(`<div>✉ <a href="mailto:${esc(r.mail)}">${esc(r.mail)}</a></div>`);
    if (r.site) L.push(`<div>🌐 ${A(r.site, "site web")}</div>`);
    const so = [r.fb && A(r.fb, "Facebook"), r.ig && A(r.ig, "Instagram"), r.tw && A(r.tw, "X"), r.tk && A(r.tk, "TikTok")].filter(Boolean);
    if (so.length) L.push("<div>" + so.join(" · ") + "</div>");
    if (!L.length) L.push('<div class="warn">Aucun contact publié</div>');
    L.push(`<div class="srch">Chercher : ${searchLinks(r).map(([t, u]) => A(u, t)).join(" · ")}</div>`);
    return L.join("");
  }

  // ---------- Ollama / Qwen
  const base = () => cfg.url.replace(/\/+$/, "");
  async function loadModels() {
    try {
      const r = await fetch(base() + "/api/tags"); const j = await r.json();
      const names = (j.models || []).map((m) => m.name);
      S.models = names; S.ollama = names.length ? "ok" : "vide";
      if (names.length && !names.includes(cfg.model)) cfg.model = names.find((n) => /qwen/i.test(n)) || names[0];
    } catch (e) { S.models = []; S.ollama = "ko"; }
    save();
  }
  // Le modèle local CHOISIT les pistes les plus plausibles (réponse courte, rapide). Le message est ensuite assemblé par le code
  // (RADAR.message) : un petit modèle inventerait des affirmations sur le commerce.
  async function askQwen(item) {
    const pa = R().P[item.pays];
    const allowed = CAT_Q[item.cid] || ["wa", "support", "excel", "crm"];
    const opts = R().MANQUES.filter((m) => allowed.includes(m.id));   // numérotées pour le modèle : il ne voit jamais d'identifiant technique
    const list = opts.map((m, k) => `${k + 1}. ${m.t}`).join("\n");
    const prompt = `Commerce local : « ${item.nom} » (${item.cat}), pays : ${pa?.nom || ""}.
Site web : ${item.site || "aucun connu"}. Téléphone : ${item.tel ? "oui" : "inconnu"}.
${item.audit ? "Constats vérifiés sur son site : " + SITECHECK.text(item.audit) + ".\n" : ""}Pour un commerce de ce type en Afrique, quelles sont les 1 à 3 pistes d'amélioration numérique les plus plausibles parmi cette liste ?
${list}
Réponds UNIQUEMENT en JSON : {"gaps":[numéros]}`;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 180000);
    try {
      const r = await fetch(base() + "/api/chat", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, stream: false, think: false, format: "json", options: { temperature: 0.2, num_predict: 60 }, messages: [{ role: "user", content: prompt }] }) });
      if (!r.ok) throw new Error("Ollama " + r.status);
      const txt = (await r.json()).message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      item.hyp = [...new Set((Array.isArray(j.gaps) ? j.gaps : []).map((n) => opts[Number(n) - 1]?.id).filter(Boolean))].slice(0, 3);
      item.gaps = [...new Set([...item.facts, ...item.hyp])];
      item.msg = R().message({ nom: item.nom, pays: item.pays, gaps: item.gaps }); item.ia = "ok";
    } finally { clearTimeout(to); }
  }

  // ---------- Actions
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function citiesToScan(paysId) {
    const custom = cfg.ville.trim();
    if (custom) return [custom];
    const list = CITIES[paysId] || [];
    return S.city === "__all__" || !S.city ? list : [S.city];
  }
  async function scan() {
    const paysId = R().state.sel, pa = R().P[paysId];
    if (!pa) return setStatus("Cliquez d'abord sur un pays de la carte (onglet Marchés).");
    const cities = citiesToScan(paysId);
    if (!cities.length) return setStatus("Aucune ville connue pour ce pays : saisissez-en une dans « Autre ville ».");
    if (!cfg.cats.length) return setStatus("Choisissez au moins un type de commerce.");
    const useG = cfg.src !== "osm";
    const gp = PLACES.make({ cfg, CATS, R, safeUrl, normPhone });
    const budget = { left: cfg.gmax, used: 0 };
    if (useG) {
      if (!cfg.gkey.trim()) return setStatus("Source Google : saisissez d'abord votre clé API (section « Source des données »).");
      const n = Math.min(cfg.gmax, cities.length * cfg.cats.length * 3);
      if (!confirm(`Google Places : ce scan enverra jusqu'à ${n} requêtes facturables par Google selon votre compte (plafond réglé à ${cfg.gmax}). Vérifiez votre quota et vos tarifs dans Google Cloud. Continuer ?`)) return;
    }
    S.busy = true; S.results = []; render();
    const seen = new Set(), errors = [];
    for (let k = 0; k < cities.length; k++) {
      const v = cities[k];
      try {
        setStatus(`Scan de ${v} (${k + 1}/${cities.length})…`);
        const z = await geocode(v, pa.nom);
        await sleep(1100); // politique d'usage de Nominatim : 1 requête/seconde
        const cityRes = [];
        if (cfg.src !== "google") {
          const els = await overpass(z.bbox, cfg.cats, cfg.contactOnly);
          els.map((e) => toResult(e, paysId)).filter((r) => r.nom && !seen.has(r.id)).forEach((r) => { seen.add(r.id); r.ville = v; cityRes.push(r); S.results.push(r); });
          render();
        }
        if (useG) {
          setStatus(`Google Places : ${v} (${budget.used} requêtes utilisées)…`);
          const gs = await gp.scan(z.bbox, v, paysId, budget);
          gs.forEach((g) => { g.ville = v; const m = cityRes.find((o) => gp.sameShop(o, g)); if (m) gp.mergeInto(m, g); else if (g.nom && !seen.has(g.id)) { seen.add(g.id); S.results.push(g); } });
          render();
        }
      } catch (e) { errors.push(v + " : " + e.message); }
    }
    S.results.sort(byScore);
    const sans = S.results.filter((r) => !r.site).length;
    S.status = `${S.results.length} commerces trouvés (${cities.length} ville${cities.length > 1 ? "s" : ""}) dont ${sans} sans site web renseigné. ${useG ? `${budget.used} requêtes Google utilisées. ` : ""}Un site absent des sources n'est pas forcément inexistant : vérifiez avant de contacter.` +
      (errors.length ? "<br>Erreurs : " + esc(errors.join(" ; ")) : "");
    S.busy = false; render();
  }
  async function analyse(items) {
    if (!cfg.model) return setStatus("Aucun modèle Ollama détecté. Lancez ollama et téléchargez un modèle Qwen (voir ci-dessus).");
    S.busy = true;
    for (let i = 0; i < items.length; i++) {
      S.status = `Qwen analyse ${i + 1}/${items.length} : ${esc(items[i].nom)}…`; render();
      try { await askQwen(items[i]); } catch (e) { items[i].ia = "err"; S.status = "Erreur Qwen : " + esc(e.message); }
    }
    S.results.sort(byScore);
    S.busy = false; S.status = "Analyse terminée."; render();
  }
  // ---------- Vérification des sites web (via server.js)
  function applyAudit(r) {
    const a = r.audit;
    r.facts = [...r.facts.filter((g) => !SITECHECK.IDS.includes(g)), ...SITECHECK.gaps(a)];
    const c = SITECHECK.contacts(a);
    c.phones.map((p) => normPhone(p, r.pays)).filter(Boolean).forEach((p) => { if (!r.phones.includes(p)) r.phones.push(p); });
    r.tel = r.phones.join(", ");
    if (!r.mail && c.emails[0]) r.mail = c.emails[0];
    if (!r.fb && c.fb) r.fb = safeUrl(c.fb);
    if (!r.ig && c.ig) r.ig = safeUrl(c.ig);
    if (r.mail && /@(gmail|yahoo|hotmail|outlook)\./i.test(r.mail) && !r.facts.includes("mailpro")) r.facts.push("mailpro");
    r.gaps = [...new Set([...r.facts, ...r.hyp])];
  }
  async function verifyAll(items) {
    const queue = items.filter((r) => r && r.site), total = queue.length; let done = 0, fatal = "";
    S.busy = true; render();
    const worker = async () => {
      while (queue.length && !fatal) {
        const r = queue.shift();
        try { r.audit = await SITECHECK.check(r.site); r.auditErr = ""; applyAudit(r); }
        catch (e) { r.auditErr = e.message; if (/serveur|indisponible/.test(e.message)) fatal = e.message; }
        done++; S.status = `Vérification des sites : ${done}/${total}…`; render();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    S.results.sort(byScore);
    S.busy = false; S.status = fatal ? "Erreur : " + esc(fatal) : `${done} site${done > 1 ? "s" : ""} vérifié${done > 1 ? "s" : ""}. Les constats ✓/✗ sont affichés sous chaque commerce.`; render();
  }
  function addAll(items) {
    const n0 = R().state.leads.length;
    items.forEach(addLead);
    S.status = (R().state.leads.length - n0) + " prospects ajoutés (doublons ignorés). Consultez l'onglet Prospects."; render();
  }
  // Score de priorité (même calcul que dans les prospects) pour trier les résultats
  const scoreOf = (r) => R().leadScore({ pays: r.pays, contact: [...r.phones, r.mail].filter(Boolean).join(" "), site: r.site || r.fb || r.ig, gaps: r.gaps });
  const byScore = (a, b) => scoreOf(b).total - scoreOf(a).total;
  // Commerce déjà marqué « Ne pas contacter » dans les prospects (même nom + pays, ou même téléphone)
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const isOptOut = (r) => R().state.leads.some((l) => l.stop && ((l.nom === r.nom && l.pays === r.pays) || r.phones.some((p) => p && digits(l.contact).includes(digits(p)))));
  function addLead(item) {
    const st = R().state;
    if (isOptOut(item)) return;
    if (st.leads.some((l) => l.nom === item.nom && l.pays === item.pays)) return;
    st.leads.push({ nom: item.nom, pays: item.pays, secteur: item.secteur || "Commerce & distribution", site: item.site || item.fb || item.ig,
      contact: [...item.phones, item.mail].filter(Boolean).join(" · "), statut: "À contacter", maj: Date.now(), gaps: item.gaps, msg: item.msg || "",
      notes: [item.adr && "Adresse : " + item.adr, item.hours && "Horaires : " + item.hours, item.infos.length && "Infos : " + item.infos.join(" · "), item.lat != null && "GPS : " + item.lat + ", " + item.lng,
        item.audit && "Audit du site (" + new Date().toLocaleDateString("fr-FR") + ") : " + SITECHECK.text(item.audit), item.fb && "Facebook : " + item.fb, item.ig && "Instagram : " + item.ig, item.tw && "X : " + item.tw, item.tk && "TikTok : " + item.tk,
        "Google Maps : " + searchLinks(item)[0][1], item.osm && "OSM : https://www.openstreetmap.org/" + item.osm,        "Source : " + ({ google: "Google Places", "osm+google": "OpenStreetMap + Google Places" }[item.src] || "OpenStreetMap")].filter(Boolean).join("\n") });
    R().store.set(st.leads); $("#count").textContent = st.leads.length;
  }
  function setStatus(t) { S.status = esc(t); render(); }

  const gt = (g) => R().MANQUES.find((m) => m.id === g)?.t.split(/[(/]/)[0].trim();
  const tags = (r) => (r.facts.length ? `<div><span class="mut">Constaté :</span> ${r.facts.map((g) => `<span class="tag fact">${esc(gt(g))}</span>`).join("")}</div>` : "") +
    (r.hyp.length ? `<div><span class="mut">Hypothèse IA :</span> ${r.hyp.map((g) => `<span class="tag hyp">${esc(gt(g))}</span>`).join("")}</div>` : "");

  // ---------- Rendu
  function render() {
    const el = $("#tab-scan"); if (!el) return;
    const pa = R().P[R().state.sel];
    if (S.cityFor !== R().state.sel) { S.cityFor = R().state.sel; S.city = "__all__"; }
    const o = S.ollama;
    const ostate = o === "ok" ? `<span class="ok">● Ollama connecté</span>` : o === "vide" ? `<span class="warn">● Ollama connecté, aucun modèle</span>` : o === "ko" ? `<span class="warn">● Ollama injoignable</span>` : `<span class="mut">● Ollama non testé</span>`;
    const shown = S.results.filter((r) => (!S.onlyNoSite || !r.site) && (!S.onlyContact || hasContact(r)));
    const noContact = S.results.filter((r) => !hasContact(r)).length;
    const toCheck = shown.filter((r) => r.site && !r.audit && !r.auditErr);
    el.innerHTML = `
      <div class="row2" style="align-items:flex-end">
        <label style="flex:1;min-width:180px">Pays <span class="mut">(choisi sur la carte)</span>
          <select id="sc-pays"><option value="">— choisir —</option>${Object.values(R().P).sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((p) => `<option value="${p.id}" ${p.id === R().state.sel ? "selected" : ""}>${esc(p.nom)}</option>`).join("")}</select></label>
        <label style="flex:1;min-width:180px">Zone à scanner
          <select id="sc-city" ${pa ? "" : "disabled"}>${pa ? `<option value="__all__" ${S.city === "__all__" ? "selected" : ""}>Grandes villes (${(CITIES[pa.id] || []).length})</option>` + (CITIES[pa.id] || []).map((c) => `<option ${c === S.city ? "selected" : ""}>${esc(c)}</option>`).join("") : ""}</select></label>
        <label style="flex:1;min-width:150px">Autre ville <span class="mut">(optionnel)</span><input id="sc-ville" placeholder="ex. Thiès" value="${esc(cfg.ville)}"></label>
        <button class="map-pick" id="sc-map">🗺 Choisir sur la carte</button>
      </div>
      ${pa ? "" : `<p class="mut">Choisissez un pays dans la liste ou cliquez-le sur la carte.</p>`}
      <label class="chk" style="margin:8px 0"><input type="checkbox" id="sc-conly" ${cfg.contactOnly ? "checked" : ""}>Chercher uniquement les commerces avec un contact publié (téléphone, email, site ou réseau) — recommandé</label>
      <div class="catgrid">${CATS.map((c) => `<label class="chk"><input type="checkbox" data-c="${c.id}" ${cfg.cats.includes(c.id) ? "checked" : ""}>${esc(c.nom)}</label>`).join("")}</div>
      <details class="sect" ${cfg.src !== "osm" && !cfg.gkey ? "open" : ""}><summary>Source des données : ${{ osm: "OpenStreetMap", google: "Google Places", both: "OpenStreetMap + Google" }[cfg.src]}</summary>
        <label style="margin-top:6px">Source<select id="sc-src">${[["osm", "OpenStreetMap (gratuit, incomplet)"], ["google", "Google Places (clé API, plus complet)"], ["both", "Les deux (fusionnés)"]].map(([v, t]) => `<option value="${v}" ${cfg.src === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Clé API Google Places <input id="sc-gkey" type="password" autocomplete="off" placeholder="AIza…" value="${esc(cfg.gkey)}"></label>
        <label>Plafond de requêtes Google par scan <input id="sc-gmax" type="number" min="1" max="500" value="${cfg.gmax}"></label>
        <div class="note">Dans Google Cloud Console : activez <b>Places API (New)</b>, créez une clé API, puis restreignez-la (référents HTTP <b>http://localhost:8080/*</b> et API Places uniquement). La clé reste dans ce navigateur. Chaque requête (20 résultats max, 3 pages par type de commerce) est facturée selon votre compte : surveillez le quota et fixez un budget d'alerte dans Google Cloud.</div>
      </details>
      <details class="sect" ${S.ollama === "ok" ? "" : "open"}><summary>Modèle local (Qwen / Ollama) ${ostate}</summary>
        <label style="margin-top:6px">URL Ollama<input id="sc-url" value="${esc(cfg.url)}"></label>
        <label>Modèle<select id="sc-model">${(S.models || []).map((m) => `<option ${m === cfg.model ? "selected" : ""}>${esc(m)}</option>`).join("") || "<option value=''>— aucun —</option>"}</select></label>
        <div class="row2"><button id="sc-test">Tester la connexion</button></div>
        <div class="note">Ollama doit autoriser cette page : lancez-le avec la variable <b>OLLAMA_ORIGINS=*</b>. Modèle conseillé : <b>ollama pull qwen2.5:3b</b> (rapide sur CPU) ou <b>qwen2.5:7b</b> (plus précis). Servez le projet via <b>http://localhost</b> (ex. <b>py -m http.server 8080</b>) plutôt que par double-clic.</div>
      </details>
      <div class="row2"><button class="primary" id="sc-go" ${S.busy ? "disabled" : ""}>Lancer le scan</button>
        ${S.results.length ? `<button id="sc-all" ${S.busy ? "disabled" : ""}>Qwen : analyser ${shown.length} résultats</button><button id="sc-addall" ${S.busy ? "disabled" : ""}>+ Tout ajouter aux prospects (${shown.length})</button>` : ""}
        ${toCheck.length ? `<button id="sc-chkall" ${S.busy ? "disabled" : ""}>🔍 Vérifier les sites web (${toCheck.length})</button>` : ""}</div>
      <div class="note" id="sc-status">${S.status || "Choisissez un pays, une ville et des types de commerce."}</div>
      ${S.results.length ? `<div class="row2"><label class="chk"><input type="checkbox" id="sc-nosite" ${S.onlyNoSite ? "checked" : ""}>Sans site web renseigné</label>
      <label class="chk"><input type="checkbox" id="sc-contact" ${S.onlyContact ? "checked" : ""}>Avec au moins un contact (${S.results.length - noContact} sur ${S.results.length})</label></div>
      <p class="mut" style="margin:4px 0 8px">Triés par <b>score de priorité</b> (0-100 : marché du pays, joignabilité, besoin identifié, constats vérifiés). <b>Constaté</b> = donnée publique ; <b>Hypothèse IA</b> = à vérifier avec le commerçant.</p>
      <table><tr><th>Commerce</th><th>Contact</th><th></th></tr>${shown.map((r) => {
        const i = S.results.indexOf(r);
        return `<tr><td><span class="sc ${scoreOf(r).level}" title="Score de priorité (0-100)">${scoreOf(r).total}</span> <b>${esc(r.nom)}</b>${isOptOut(r) ? ' <span class="warn">🚫 Ne pas contacter (déjà dans vos prospects)</span>' : ""}<div class="mut">${esc(r.cat)}${r.ville ? " · " + esc(r.ville) : ""}${r.adr ? " · " + esc(r.adr) : ""}</div>
          ${r.hours ? `<div class="mut">🕒 ${esc(r.hours)}</div>` : ""}${r.infos.length ? `<div class="mut">ℹ ${esc(r.infos.join(" · "))}</div>` : ""}${r.desc ? `<div class="mut">${esc(r.desc)}</div>` : ""}
          ${tags(r)}${r.audit ? `<div class="chks">${SITECHECK.html(r.audit)}</div>` : ""}${r.auditErr ? `<div class="warn">analyse du site impossible : ${esc(r.auditErr)}</div>` : ""}
          ${r.msg ? `<details><summary class="mut">Message Qwen</summary><pre>${esc(r.msg)}</pre></details>` : ""}${r.ia === "err" ? `<div class="warn">analyse échouée</div>` : ""}</td>
          <td class="contact">${contactCell(r)}</td>
          <td><button data-ia="${i}" ${S.busy ? "disabled" : ""} title="Analyser avec Qwen">IA</button> ${r.site ? `<button data-chk="${i}" ${S.busy ? "disabled" : ""} title="Vérifier le site web">🔍</button> ` : ""}<button data-add="${i}" title="Ajouter aux prospects" ${isOptOut(r) ? "disabled" : ""}>+</button></td></tr>`;
      }).join("")}</table>` : ""}`;
    $("#sc-ville").oninput = (e) => { cfg.ville = e.target.value; save(); };
    $("#sc-pays").onchange = (e) => { S.city = "__all__"; if (e.target.value) R().select(e.target.value, true); else { R().state.sel = null; render(); } };
    $("#sc-conly").onchange = (e) => { cfg.contactOnly = e.target.checked; save(); };
    $("#sc-src").onchange = (e) => { cfg.src = e.target.value; save(); render(); };
    $("#sc-gkey").onchange = (e) => { cfg.gkey = e.target.value.trim(); save(); };
    $("#sc-gmax").onchange = (e) => { cfg.gmax = Math.max(1, Math.min(500, +e.target.value || 30)); save(); };
    $("#sc-city").onchange = (e) => { S.city = e.target.value; };
    $("#sc-map").onclick = () => R().show("carte");
    el.querySelectorAll("[data-c]").forEach((c) => (c.onchange = () => { cfg.cats = [...el.querySelectorAll("[data-c]:checked")].map((x) => x.dataset.c); save(); }));
    $("#sc-url").onchange = (e) => { cfg.url = e.target.value.trim() || "http://localhost:11434"; save(); };
    $("#sc-model").onchange = (e) => { cfg.model = e.target.value; save(); };
    $("#sc-test").onclick = async () => { await loadModels(); render(); };
    $("#sc-go").onclick = scan;
    if ($("#sc-all")) $("#sc-all").onclick = () => analyse(shown);
    if ($("#sc-addall")) $("#sc-addall").onclick = () => addAll(shown);
    if ($("#sc-chkall")) $("#sc-chkall").onclick = () => verifyAll(toCheck);
    el.querySelectorAll("[data-chk]").forEach((b) => (b.onclick = () => verifyAll([S.results[+b.dataset.chk]])));
    if ($("#sc-contact")) $("#sc-contact").onchange = (e) => { S.onlyContact = e.target.checked; render(); };
    if ($("#sc-nosite")) $("#sc-nosite").onchange = (e) => { S.onlyNoSite = e.target.checked; render(); };
    el.querySelectorAll("[data-ia]").forEach((b) => (b.onclick = () => analyse([S.results[+b.dataset.ia]])));
    el.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { addLead(S.results[+b.dataset.add]); b.textContent = "✓"; b.disabled = true; }));
  }

  // Lancer un scan sur une ville précise depuis la carte
  window.scanCity = function (paysId, ville) {
    R().select(paysId, true); S.cityFor = paysId; S.city = ville; cfg.ville = ""; save();
    R().show("scan");
  };
  // Rédige le message d'approche d'une fiche prospect avec le modèle local (utilisé par l'onglet Prospects)
  window.qwenMessage = async function (l) {
    if (S.ollama === "") await loadModels();
    if (!cfg.model) throw new Error("aucun modèle Ollama détecté (voir l'onglet Scan)");
    const item = { nom: l.nom, cat: l.secteur, cid: CATS.find((c) => c.secteur === l.secteur)?.id, pays: l.pays, site: l.site || "", fb: "", tel: l.contact || "", mail: "", facts: (l.gaps || []).slice(), hyp: [], gaps: (l.gaps || []).slice() };
    await askQwen(item);
    return item.msg;
  };
  window.radarNormPhone = normPhone; // utilisé par la fiche prospect pour les numéros trouvés sur un site
  window.renderScan = async function () { if (S.ollama === "") { await loadModels(); } render(); };
})();
