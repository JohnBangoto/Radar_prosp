/* Client de l'analyse de site web : appelle /api/check (server.js) et traduit le résultat en constats lisibles
 * et en « manques » de la check-list (https, mobile, down). Nécessite de lancer l'application avec lancer.bat (node server.js). */
window.SITECHECK = {
  IDS: ["https", "mobile", "down"],

  async check(url) {
    let r;
    try { r = await fetch("/api/check?url=" + encodeURIComponent(url)); }
    catch (e) { throw new Error("serveur d'analyse injoignable — lancez lancer.bat (node server.js)"); }
    if (r.status === 404 || r.status === 501) throw new Error("analyse indisponible : arrêtez « py -m http.server » et lancez lancer.bat (node server.js)");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "erreur HTTP " + r.status);
    return j;
  },

  // Manques de la check-list déduits de l'analyse
  gaps(a) {
    if (!a.ok) return ["down"];
    const g = [];
    if (!a.https) g.push("https");
    if (!a.viewport || (a.year && a.year <= new Date().getFullYear() - 5)) g.push("mobile");
    return g;
  },

  // Liste de constats : [état (true = bon, false = problème, null = neutre), texte]
  items(a) {
    if (!a.ok) return [[false, "Site injoignable (" + (a.error || "erreur") + ")"]];
    const now = new Date().getFullYear(), L = [];
    L.push(a.https ? [true, "HTTPS"] : [false, a.certError ? "Certificat invalide" : "Pas de HTTPS"]);
    L.push(a.viewport ? [true, "Adapté mobile"] : [false, "Non adapté mobile"]);
    if (a.ms) L.push([a.ms < 3000 ? true : a.ms > 6000 ? false : null, (a.ms / 1000).toFixed(1) + " s de chargement"]);
    if (a.year) L.push([a.year > now - 5, (a.yearSrc === "©" ? "© " : "modifié en ") + a.year]);
    if (a.cms) L.push([null, a.cms]);
    L.push(a.payment ? [true, "Paiement en ligne visible"] : a.shop ? [false, "Boutique sans paiement mobile visible"] : [null, "Pas de paiement en ligne visible"]);
    if (a.whatsapp) L.push([true, "WhatsApp présent"]);
    return L;
  },
  html(a) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return this.items(a).map(([ok, t]) => `<span class="ck ${ok === true ? "ok" : ok === false ? "ko" : "nt"}">${ok === true ? "✓" : ok === false ? "✗" : "•"} ${esc(t)}</span>`).join("");
  },
  text(a) { return this.items(a).map(([ok, t]) => (ok === false ? "✗ " : ok === true ? "✓ " : "") + t).join(" ; "); },

  // Coordonnées trouvées sur le site
  contacts(a) { return { phones: a.phones || [], emails: a.emails || [], fb: a.fb || "", ig: a.ig || "" }; }
};
