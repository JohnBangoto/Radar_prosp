/* Source de données optionnelle : Google Places API (New), "Text Search".
 * - La clé API est saisie par l'utilisateur et stockée uniquement dans son navigateur (localStorage), jamais dans le code.
 * - Chaque requête est facturée par Google (selon votre compte) : un plafond de requêtes par scan est appliqué.
 * Usage : const gp = PLACES.make({ cfg, CATS, R, safeUrl, normPhone }) puis gp.scan(...), gp.sameShop(...), gp.mergeInto(...).
 */
window.PLACES = {
  make({ cfg, CATS, R, safeUrl, normPhone }) {
    const FIELDS = "nextPageToken,places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.nationalPhoneNumber," +
      "places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.regularOpeningHours.weekdayDescriptions,places.location,places.businessStatus";
    // Termes de recherche par type de commerce (français / anglais)
    const GQ = {
      garage: { fr: "garage automobile mécanicien", en: "car repair garage" },
      coiff: { fr: "salon de coiffure", en: "hair salon" },
      resto: { fr: "restaurant", en: "restaurant" },
      hotel: { fr: "hôtel", en: "hotel" },
      commerce: { fr: "boutique magasin", en: "shop store" },
      sante: { fr: "pharmacie clinique", en: "pharmacy clinic" },
      immo: { fr: "agence immobilière", en: "real estate agency" },
      cabinet: { fr: "cabinet comptable avocat", en: "accounting law firm" }
    };

    async function search(body) {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cfg.gkey, "X-Goog-FieldMask": FIELDS },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        let msg = ""; try { msg = (await r.json()).error?.message || ""; } catch (e) {}
        const hint = r.status === 403 || r.status === 400 ? " — vérifiez que « Places API (New) » est activée, que la clé est valide et que sa restriction autorise http://localhost" : "";
        throw new Error("Google " + r.status + " : " + msg.slice(0, 160) + hint);
      }
      return r.json();
    }

    const quality = (r) => (r.site ? 0 : 3) + (r.phones.length ? 3 : 0) + (r.mail ? 1 : 0) + (r.fb || r.ig ? 1 : 0) + (r.wa ? 1 : 0) +
      Math.min(r.infos.length, 3) * 0.2 + (r.rating >= 4 ? 0.5 : 0);

    function fromGoogle(p, paysId, cat) {
      const web = p.websiteUri || "";
      const isFb = /facebook\.com|fb\.com/i.test(web), isIg = /instagram\.com/i.test(web);
      const site = isFb || isIg ? "" : safeUrl(web);
      const intl = normPhone(p.internationalPhoneNumber || "", paysId);
      const phones = intl ? [intl] : [normPhone(p.nationalPhoneNumber || "", paysId)].filter(Boolean);
      const infos = p.rating ? ["note Google : " + p.rating + "/5" + (p.userRatingCount ? " (" + p.userRatingCount + " avis)" : "")] : [];
      const r = {
        id: "g" + p.id, src: "google", osm: "", gmaps: safeUrl(p.googleMapsUri), nom: p.displayName?.text || "", cat: cat.nom, cid: cat.id, secteur: cat.secteur,
        site, fb: isFb ? safeUrl(web) : "", ig: isIg ? safeUrl(web) : "", tw: "", tk: "", wa: "", phones, tel: phones.join(", "), mail: "",
        adr: p.formattedAddress || "", hours: (p.regularOpeningHours?.weekdayDescriptions || []).join(" ; "), infos, desc: "",
        rating: p.rating || 0, lat: p.location?.latitude, lng: p.location?.longitude, pays: paysId, hyp: [], msg: "", ia: ""
      };
      r.facts = site ? [] : ["nosite"]; r.gaps = r.facts.slice(); r.q = quality(r);
      return r;
    }

    // Recherche Google pour une ville (bbox = [sud, ouest, nord, est]). budget = { left, used } partagé entre les villes.
    async function scan(bbox, ville, paysId, budget) {
      const l0 = (R().P[paysId].langs || "fr").split("/")[0];
      const lang = ["fr", "en", "ar", "pt"].includes(l0) ? l0 : "fr";
      const out = [];
      for (const c of CATS.filter((x) => cfg.cats.includes(x.id))) {
        const term = (GQ[c.id] || {})[l0 === "en" ? "en" : "fr"] || c.nom;
        let token = "";
        for (let page = 0; page < 3 && budget.left > 0; page++) {
          budget.left--; budget.used++;
          const body = { textQuery: term + " " + ville, languageCode: lang, pageSize: 20,
            locationRestriction: { rectangle: { low: { latitude: bbox[0], longitude: bbox[1] }, high: { latitude: bbox[2], longitude: bbox[3] } } } };
          if (token) body.pageToken = token;
          const j = await search(body);
          (j.places || []).filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY").forEach((p) => out.push(fromGoogle(p, paysId, c)));
          token = j.nextPageToken; if (!token) break;
        }
      }
      return out;
    }

    // Fusion avec un résultat OpenStreetMap du même commerce (même nom, moins de 300 m)
    const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    function dist(a, b) {
      const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.sqrt(x));
    }
    function sameShop(o, g) {
      const a = norm(o.nom), b = norm(g.nom);
      if (!a || !b || !(a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))))) return false;
      return o.lat == null || g.lat == null || dist(o, g) < 300;
    }
    function mergeInto(o, g) {
      o.phones = [...new Set([...o.phones, ...g.phones])]; o.tel = o.phones.join(", ");
      ["site", "fb", "ig", "hours", "adr", "gmaps"].forEach((k) => { if (!o[k] && g[k]) o[k] = g[k]; });
      o.infos = [...new Set([...o.infos, ...g.infos])]; o.rating = g.rating || o.rating; o.src = "osm+google";
      o.facts = []; if (!o.site) o.facts.push("nosite"); if (o.mail && /@(gmail|yahoo|hotmail|outlook)\./i.test(o.mail)) o.facts.push("mailpro");
      o.gaps = [...new Set([...o.facts, ...o.hyp])]; o.q = quality(o);
    }
    return { scan, sameShop, mergeInto };
  }
};
