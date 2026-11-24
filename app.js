(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("radar.leads") || "[]"); } catch (e) { return []; } },
    set(v) { try { localStorage.setItem("radar.leads", JSON.stringify(v)); } catch (e) {} }
  };

  const P = {};
  PAYS.forEach(([id, nom, reg, langs, m, c, p, y, pay, loi]) => (P[id] = { id, nom, reg, langs, m, c, p, y, pay, loi }));

  const state = { service: "all", region: "", lang: "", sel: null, detail: false, leads: store.get() };

  function scoreService(pa, s) {
    const w = SERVICES[s].w;
    return w.m * pa.m + w.c * pa.c + w.p * pa.p + w.y * pa.y; // 1..5
  }
  function score(pa, svc = state.service) {
    if (svc !== "all") return scoreService(pa, svc);
    const k = Object.keys(SERVICES);
    return k.reduce((a, s) => a + scoreService(pa, s), 0) / k.length;
  }
  const matches = (pa) =>
    (!state.region || pa.reg === state.region) && (!state.lang || pa.langs.split("/").includes(state.lang));
  const color = (v) => {
    const i = v < 2 ? 1 : v < 2.7 ? 2 : v < 3.4 ? 3 : v < 4.1 ? 4 : 5;
    return getComputedStyle(document.documentElement).getPropertyValue("--s" + i).trim();
  };

  // ---- Carte
  const map = L.map("map", { zoomSnap: 0.25, attributionControl: false, minZoom: 2 }).setView([2, 20], 3.25);
  let layer;
  function styleFor(f) {
    const pa = P[f.id];
    if (!pa) return { fillColor: "#999", fillOpacity: 1, weight: 0.6, color: "#8a94a3" };
    const ok = matches(pa);
    return {
      fillColor: ok ? color(score(pa)) : getComputedStyle(document.documentElement).getPropertyValue("--none"),
      fillOpacity: state.detail ? (ok ? 0.35 : 0.15) : ok ? 0.95 : 0.5,
      weight: state.sel === f.id ? 2.5 : 0.7,
      color: state.sel === f.id ? "#e8590c" : "#7c8798"
    };
  }
  const geoById = {};
  function draw() {
    if (layer) layer.remove();
    layer = L.geoJSON(AFRICA_GEO, {
      style: styleFor,
      onEachFeature(f, l) {
        geoById[f.id] = l;
        const pa = P[f.id];
        l.bindTooltip(pa ? `${pa.nom} · ${score(pa).toFixed(1)}/5` : f.properties.name, { sticky: true });
        l.on("click", () => { if (pa) select(f.id); });
      }
    }).addTo(map);
    drawCities();
  }
  // ---- Villes sur la carte + fond détaillé
  const cityLayer = L.layerGroup().addTo(map);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" });
  function drawCities() {
    cityLayer.clearLayers();
    const z = map.getZoom();
    Object.entries(VILLES).forEach(([iso, list]) => {
      const pa = P[iso]; if (!pa || !matches(pa)) return;
      if (state.sel && state.sel !== iso && z < 5.5) return;
      list.forEach(([nom, lat, lng, cap]) => {
        const all = state.sel === iso || z >= 5.5;
        if (!cap && !all) return;
        const m = L.circleMarker([lat, lng], { radius: cap ? 5 : 4, weight: 1.5, color: "#fff", fillColor: state.sel === iso ? "#e8590c" : "#0b6b5c", fillOpacity: 1 });
        m.bindTooltip(nom, { permanent: state.sel === iso || z >= 4.75, direction: "right", offset: [6, 0], className: "city-lbl" });
        const box = document.createElement("div");
        box.innerHTML = `<b>${esc(nom)}</b>${cap ? " ★" : ""}<br><span class="mut">${esc(pa.nom)}</span><br>`;
        const btn = document.createElement("button"); btn.className = "primary"; btn.textContent = "⌖ Scanner cette ville"; btn.style.marginTop = "6px";
        btn.onclick = () => window.scanCity && window.scanCity(iso, nom);
        box.appendChild(btn); m.bindPopup(box);
        m.addTo(cityLayer);
      });
    });
  }
  map.on("zoomend", drawCities);
  function legend() {
    $("#legend").innerHTML = "Potentiel estimé<br>" + [1, 2, 3, 4, 5].map((i) => `<i style="background:var(--s${i})"></i>`).join("") + "<br><span class='mut'>faible → élevé</span>";
  }

  // ---- Panneau pays
  function bars(pa) {
    const best = Object.keys(SERVICES).sort((a, b) => scoreService(pa, b) - scoreService(pa, a))[0];
    return Object.entries(SERVICES).map(([k, s]) => {
      const v = scoreService(pa, k);
      return `<div class="bar ${k === best ? "top" : ""}"><span>${s.nom}${k === best ? " ★" : ""}</span><div><b style="width:${v * 20}%"></b></div><span>${v.toFixed(1)}</span></div>`;
    }).join("");
  }
  function angle(pa) {
    const out = [];
    if (pa.c <= 2) out.push("Connectivité limitée : privilégier des solutions légères, utilisables sur mobile et avec peu de débit (WhatsApp, USSD, pages simples).");
    if (pa.p >= 4) out.push(`Mobile money très ancré (${pa.pay}) : l'intégration du paiement à un site ou à un agent IA est un argument de vente fort.`);
    else if (pa.p <= 2) out.push("Paiement numérique peu développé : commencer par vitrine, prise de contact et automatisation interne.");
    if (pa.y >= 4) out.push(`Cadre de protection des données en place${pa.loi ? " (" + pa.loi + ")" : ""} : la conformité et la formation du personnel se vendent comme une obligation.`);
    else if (pa.y <= 2) out.push("Cadre cyber/données peu contraignant : le besoin est réel mais à vendre par le risque (fraude, perte d'argent, réputation).");
    if (pa.m >= 4) out.push("Marché PME large : viser un volume avec des offres packagées et un onboarding simple.");
    const l = pa.langs.split("/");
    out.push("Langue de prospection conseillée : " + (l[0] === "ar" ? "arabe + français/anglais" : { fr: "français", en: "anglais", pt: "portugais", es: "espagnol" }[l[0]] || l.join("/")) + ".");
    return out;
  }
  function select(id, stay) {
    state.sel = id; draw(); renderPays();
    if (stay) { if (window.renderScan) window.renderScan(); } else tab("pays");
    const gl = geoById[id];
    if (gl) setTimeout(() => { map.invalidateSize(); map.fitBounds(gl.getBounds(), { maxZoom: 6.5, padding: [30, 30] }); }, 60);
  }
  function renderPays() {
    const el = $("#tab-pays");
    const pa = P[state.sel];
    if (!pa) { el.innerHTML = `<p class="mut">Cliquez sur un pays de la carte pour obtenir son analyse : potentiel par offre, manques fréquents par secteur, angle d'approche et liens de recherche d'entreprises.</p><div class="note">Les indicateurs sont des estimations qualitatives à valider (voir data.js).</div>`; return; }
    const svc = state.service;
    const sect = SECTEURS.slice().sort((a, b) => (svc === "all" ? 0 : (b.offres.includes(svc) - a.offres.includes(svc))));
    el.innerHTML = `
      <h2>${esc(pa.nom)}</h2>
      <div class="mut">${REGIONS[pa.reg]} · langues : ${esc(pa.langs)}</div>
      <div class="chips" style="margin-top:8px"><span>Marché PME ${pa.m}/5</span><span>Connectivité ${pa.c}/5</span><span>Paiement num. ${pa.p}/5</span><span>Cadre cyber ${pa.y}/5</span></div>
      <h3>Villes</h3><div class="chips">${(VILLES[pa.id] || []).map(([n, , , cap]) => `<span class="city-chip" data-city="${esc(n)}" title="Scanner ${esc(n)}">${cap ? "★ " : ""}${esc(n)}</span>`).join("") || '<span class="mut">Aucune ville enregistrée (cities.js)</span>'}</div>
      <div class="row2"><button class="primary" id="scan-pays">⌖ Scanner les commerces de ce pays</button></div>
      <h3>Potentiel par offre</h3>${bars(pa)}
      <h3>Angle d'approche</h3><ul>${angle(pa).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <h3>Secteurs &amp; manques fréquents</h3>
      ${sect.map((s) => `<details class="sect"><summary>${esc(s.nom)}</summary>
        <div style="margin-top:4px">${s.offres.map((o) => `<span class="tag">${SERVICES[o].nom}</span>`).join("")}</div>
        <ul>${s.manques.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></details>`).join("")}
      <h3>Trouver des entreprises</h3>
      <div class="row2"><input id="ville" placeholder="Ville (ex. Dakar)" style="flex:1"><select id="sect">${SECTEURS.map((s, i) => `<option value="${i}">${esc(s.nom)}</option>`).join("")}</select></div>
      <div class="links" id="links" style="margin-top:8px"></div>
      <div class="row2"><button class="primary" id="addlead">+ Ajouter un prospect ici</button></div>
      <div class="note">Rappel : démarchage B2B uniquement, avec respect des lois locales sur les données personnelles et l'envoi de messages (opt-out clair). Vérifiez avant tout envoi de masse.</div>`;
    const upd = () => {
      const s = SECTEURS[$("#sect").value].nom.split(/[ ,&(]/)[0];
      const v = $("#ville").value.trim() || pa.nom, q = encodeURIComponent(s + " " + v);
      $("#links").innerHTML = [
        ["Google Maps", "https://www.google.com/maps/search/" + q],
        ["Google (sites sans présence web ?)", "https://www.google.com/search?q=" + encodeURIComponent(`${s} ${v} contact`)],
        ["LinkedIn entreprises", "https://www.linkedin.com/search/results/companies/?keywords=" + q],
        ["Facebook pages", "https://www.facebook.com/search/pages?q=" + q]
      ].map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join("");
    };
    $("#ville").oninput = upd; $("#sect").onchange = upd; upd();
    $("#addlead").onclick = () => leadForm(null, state.sel);
    $("#scan-pays").onclick = () => show("scan");
    el.querySelectorAll("[data-city]").forEach((c) => (c.onclick = () => window.scanCity && window.scanCity(pa.id, c.dataset.city)));
  }

  // ---- Classement
  function renderRank() {
    const rows = Object.values(P).filter(matches).sort((a, b) => score(b) - score(a));
    $("#tab-classement").innerHTML = `<p class="mut">Pays triés selon l'offre et les filtres choisis.</p><table><tr><th>#</th><th>Pays</th><th>Région</th><th>Score</th></tr>${rows.map((p, i) => `<tr class="row" data-id="${p.id}"><td>${i + 1}</td><td>${esc(p.nom)}</td><td class="mut">${REGIONS[p.reg].replace("Afrique ", "")}</td><td>${score(p).toFixed(1)}</td></tr>`).join("")}</table>`;
    document.querySelectorAll("#tab-classement .row").forEach((r) => (r.onclick = () => select(r.dataset.id)));
  }

  // ---- Prospects
  const STAT = ["À contacter", "Contacté", "Réponse", "RDV", "Gagné", "Perdu"];
  // Score de priorité d'un prospect (0-100) : marché du pays + joignabilité + besoin identifié + constat vérifié sur le site
  function leadScore(l) {
    const pa = P[l.pays];
    const best = pa ? Math.max(...Object.keys(SERVICES).map((k) => scoreService(pa, k))) : 1;
    const c = String(l.contact || "");
    const phone = /\+\d[\d\s().-]{6,}/.test(c), mail = /[^\s·,;<>]+@[^\s·,;<>]+\.[^\s·,;<>]+/.test(c);
    const gaps = l.gaps || [], top = recommend(gaps)[0];
    const w = top ? gaps.reduce((a, g) => a + (MANQUES.find((m) => m.id === g)?.o[top] || 0), 0) : 0;
    const verified = gaps.some((g) => ["https", "mobile", "down"].includes(g));
    const parts = [
      ["Marché du pays", Math.round(((best - 1) / 4) * 20), 20],
      ["Joignable", Math.min(26, (phone ? 18 : 0) + (mail ? 6 : 0) + (l.site ? 2 : 0)), 26],
      ["Besoin identifié", Math.min(30, w * 6), 30],
      ["Constat vérifié", verified ? 10 : 0, 10]
    ];
    const total = Math.round((parts.reduce((a, p) => a + p[1], 0) * 100) / 86);
    return { total, parts, level: total >= 65 ? "hot" : total >= 40 ? "mid" : "low" };
  }
  const closed = (l) => l.stop || l.statut === "Gagné" || l.statut === "Perdu";
  const scBadge = (l) => (closed(l) ? "" : `<span class="sc ${leadScore(l).level}" title="Score de priorité (0-100)">${leadScore(l).total}</span>`);
  const rank = (l) => (l.stop ? -2 : closed(l) ? -1 : leadScore(l).total);
  function recommend(gaps) {
    const t = {};
    gaps.forEach((g) => { const m = MANQUES.find((x) => x.id === g); if (m) for (const [o, w] of Object.entries(m.o)) t[o] = (t[o] || 0) + w; });
    return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([o]) => o);
  }
  // Message d'approche assemblé par le code (fiable, sans invention) : une accroche formulée en QUESTION selon la piste retenue.
  // Le modèle local ne sert qu'à choisir les pistes ; il n'écrit pas le message.
  const HOOKS = {
    fr: {
      wa: "Beaucoup de commerces comme le vôtre gèrent encore leurs commandes et leurs clients à la main sur WhatsApp : est-ce aussi votre cas ?",
      pay: "Vos clients peuvent-ils payer en ligne ou par mobile money (Wave, Orange Money…) ?",
      excel: "Gérez-vous encore vos stocks et vos factures sur papier ou sur Excel ?",
      crm: "Avez-vous un moyen simple de suivre vos clients et de les relancer ?",
      support: "Répondez-vous souvent aux mêmes questions de vos clients (prix, horaires, disponibilité) ?",
      forma: "Votre équipe est-elle formée à repérer les arnaques et le phishing ?",
      backup: "Vos données importantes sont-elles sauvegardées régulièrement ?",
      rgpd: "Les données de vos clients sont-elles collectées dans un cadre conforme à la loi ?",
      nosite: "Avez-vous un site web où vos clients peuvent voir vos services et vous contacter facilement ?",
      mailpro: "Vos clients vous écrivent-ils sur une adresse professionnelle à votre nom de domaine ?",
      https: "Lors d'un contrôle rapide, votre site m'a semblé s'afficher comme « non sécurisé » dans les navigateurs, ce qui peut faire fuir des clients.",
      mobile: "Lors d'un contrôle rapide, votre site m'a semblé peu confortable à utiliser sur téléphone, là où se trouvent la plupart de vos clients.",
      down: "Lors d'un contrôle rapide, votre site ne répondait pas : vos clients peuvent-ils toujours vous trouver en ligne ?"
    },
    en: {
      wa: "Many businesses like yours still handle orders and customers by hand on WhatsApp: is that the case for you too?",
      pay: "Can your customers pay online or by mobile money?",
      excel: "Do you still manage stock and invoices on paper or in Excel?",
      crm: "Do you have a simple way to track your customers and follow up with them?",
      support: "Do you often answer the same customer questions (prices, opening hours, availability)?",
      forma: "Is your team trained to spot scams and phishing?",
      backup: "Are your important files backed up regularly?",
      rgpd: "Is your customers' data collected in a way that complies with the law?",
      nosite: "Do you have a website where customers can see your services and contact you easily?",
      mailpro: "Do your customers write to a professional address on your own domain?",
      https: "In a quick check, your website seemed to show as \"not secure\" in browsers, which can put customers off.",
      mobile: "In a quick check, your website seemed hard to use on a phone, where most of your customers are.",
      down: "In a quick check, your website was not responding: can customers still find you online?"
    }
  };
  const HOOK_ORDER = ["down", "https", "mobile", "nosite", "wa", "pay", "support", "crm", "excel", "forma", "backup", "rgpd", "mailpro"];
  function message(l) {
    const pa = P[l.pays], en = pa && pa.langs.split("/")[0] === "en", H = HOOKS[en ? "en" : "fr"];
    const gaps = l.gaps || [];
    const hook = HOOK_ORDER.find((g) => gaps.includes(g));
    const off = recommend(gaps).slice(0, 2).map((o) => SERVICES[o].nom.replace(/^./, (c) => c.toLowerCase()));
    if (en) return `Hello ${l.nom},\n\nI help local businesses win more customers through digital tools (websites, automation, AI assistants). ${hook ? H[hook] + "\n\n" : ""}I can send you a free mini-audit with 3 concrete ideas${off.length ? " (" + off.join(", ") + ")" : ""}. Would that be useful? Reply STOP to opt out.\n\nBest regards${sigLine()}`;
    return `Bonjour ${l.nom},\n\nJ'aide les commerces locaux à gagner des clients grâce au numérique (site web, automatisation, assistants IA). ${hook ? H[hook] + "\n\n" : ""}Puis-je vous envoyer un mini-audit gratuit avec 3 idées concrètes${off.length ? " (" + off.join(", ") + ")" : ""} ? Répondez STOP pour ne plus être contacté.\n\nCordialement${sigLine()}`;
  }
  const lf = { q: "", st: "", pays: "", mode: "liste", sort: "score" };
  const waLink = (c) => { const m = String(c || "").match(/\+\d[\d\s().-]{6,}/); return m ? "https://wa.me/" + m[0].replace(/\D/g, "") : ""; };
  const persist = () => store.set(state.leads);
  function setStatut(i, s) { state.leads[i].statut = s; state.leads[i].maj = Date.now(); persist(); }
  function filtered() {
    const rows = filteredRaw();
    return lf.sort === "score" ? rows.sort((a, b) => rank(b.l) - rank(a.l)) : rows;
  }
  function filteredRaw() {
    const q = lf.q.toLowerCase();
    return state.leads.map((l, i) => ({ l, i })).filter(({ l }) =>
      (!lf.st || (lf.st === "__stop__" ? l.stop : l.statut === lf.st)) && (!lf.pays || l.pays === lf.pays) &&
      (!q || [l.nom, l.secteur, l.contact, l.site, l.notes].join(" ").toLowerCase().includes(q)));
  }
  const statSel = (i, cur) => `<select data-st="${i}" aria-label="Statut">${STAT.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("")}</select>`;
  function leadsTable() {
    const rows = filtered();
    $("#lead-n").textContent = rows.length + " / " + state.leads.length;
    let html;
    if (lf.mode === "pipeline") {
      html = `<div class="board">${STAT.map((s) => {
        const col = rows.filter(({ l }) => l.statut === s);
        return `<div class="col"><h4>${s} <span>${col.length}</span></h4>${col.map(({ l, i }) => {
          const wa = l.stop ? "" : waLink(l.contact), off = recommend(l.gaps)[0];
          return `<div class="card2"><b data-open="${i}" class="row">${l.stop ? "🚫 " : ""}${esc(l.nom)}</b> ${scBadge(l)}<div class="mut">${esc(P[l.pays]?.nom)} · ${esc(l.secteur)}</div>
            ${off ? `<div class="tag">★ ${esc(SERVICES[off].nom)}</div>` : ""}
            <div class="mut">${esc(l.contact) || ""}${wa ? ` <a href="${wa}" target="_blank" rel="noopener">💬</a>` : ""}</div>${statSel(i, l.statut)}</div>`;
        }).join("") || `<div class="mut empty">—</div>`}</div>`;
      }).join("")}</div>`;
    } else {
      html = `<table><tr><th title="Score de priorité (0-100)">Score</th><th>Entreprise</th><th>Pays</th><th>Contact</th><th>Statut</th></tr>${rows.map(({ l, i }) => {
        const wa = l.stop ? "" : waLink(l.contact), off = recommend(l.gaps)[0];
        return `<tr><td>${scBadge(l)}</td><td class="row" data-open="${i}"><b>${l.stop ? "🚫 " : ""}${esc(l.nom)}</b><div class="mut">${esc(l.secteur)}${off ? " · ★ " + esc(SERVICES[off].nom) : ""}${l.envoye ? " · 📤 " + fdate(l.envoye) : ""}</div></td>
          <td>${esc(P[l.pays]?.nom)}</td><td class="mut">${esc(l.contact) || "—"}${wa ? ` <a href="${wa}" target="_blank" rel="noopener" title="WhatsApp">💬</a>` : ""}</td>
          <td>${statSel(i, l.statut)}</td></tr>`;
      }).join("") || `<tr><td colspan="5" class="mut">Aucun prospect ne correspond.</td></tr>`}</table>`;
    }
    $("#lead-view").innerHTML = html;
    document.querySelectorAll("#lead-view [data-open]").forEach((r) => (r.onclick = () => leadForm(+r.dataset.open)));
    document.querySelectorAll("#lead-view [data-st]").forEach((x) => (x.onchange = () => { setStatut(+x.dataset.st, x.value); renderLeads(); }));
  }
  function renderLeads() {
    $("#count").textContent = state.leads.length;
    const el = $("#tab-prospects");
    if (!state.leads.length) {
      el.innerHTML = `<div class="empty-state"><h3>Aucun prospect pour l'instant</h3><p class="mut">Lancez un scan pour trouver des commerces dans une ville, ou ajoutez un prospect à la main.</p>
        <div class="row2" style="justify-content:center"><button class="primary" id="go-scan">Lancer un scan</button><button id="go-new">+ Nouveau prospect</button></div></div>`;
      $("#go-scan").onclick = () => show("scan"); $("#go-new").onclick = () => leadForm(null, state.sel || "SEN");
      return;
    }
    const pays = [...new Set(state.leads.map((l) => l.pays))];
    el.innerHTML = `<div class="row2" style="align-items:center;margin:0 0 10px"><input id="lf-q" placeholder="Rechercher…" value="${esc(lf.q)}" style="flex:1;min-width:160px">
        <select id="lf-st"><option value="">Tous statuts</option><option value="__stop__" ${lf.st === "__stop__" ? "selected" : ""}>🚫 Ne pas contacter</option>${STAT.map((s) => `<option ${s === lf.st ? "selected" : ""}>${s}</option>`).join("")}</select>
        <select id="lf-pays"><option value="">Tous pays</option>${pays.map((p) => `<option value="${p}" ${p === lf.pays ? "selected" : ""}>${esc(P[p]?.nom)}</option>`).join("")}</select>
        <div class="seg"><button id="m-liste" class="${lf.mode === "liste" ? "on" : ""}">Liste</button><button id="m-pipe" class="${lf.mode === "pipeline" ? "on" : ""}">Pipeline</button></div>
        <select id="lf-sort" title="Tri"><option value="score" ${lf.sort === "score" ? "selected" : ""}>Tri : priorité</option><option value="date" ${lf.sort === "date" ? "selected" : ""}>Tri : ajout</option></select>
        <button id="csv">Exporter CSV</button><button class="primary" id="go-new">+ Nouveau</button><span class="mut" id="lead-n"></span></div>
      <div id="lead-view"></div>`;
    $("#lf-q").oninput = (e) => { lf.q = e.target.value; leadsTable(); };
    $("#lf-st").onchange = (e) => { lf.st = e.target.value; leadsTable(); };
    $("#lf-pays").onchange = (e) => { lf.pays = e.target.value; leadsTable(); };
    $("#lf-sort").onchange = (e) => { lf.sort = e.target.value; leadsTable(); };
    $("#m-liste").onclick = () => { lf.mode = "liste"; renderLeads(); };
    $("#m-pipe").onclick = () => { lf.mode = "pipeline"; renderLeads(); };
    $("#go-new").onclick = () => leadForm(null, state.sel || lf.pays || "SEN");
    $("#csv").onclick = exportCsv;
    leadsTable();
  }

  // ---- Tableau de bord
  function renderDash() {
    const L = state.leads, n = L.length, by = (s) => L.filter((l) => l.statut === s).length;
    const contacted = n - by("À contacter"), won = by("Gagné");
    const rate = contacted ? Math.round((100 * won) / contacted) : 0;
    const old = Date.now() - 3 * 864e5;
    const relance = L.map((l, i) => ({ l, i })).filter(({ l }) => l.statut === "Contacté" && !l.stop && l.maj && l.maj < old);
    const top = Object.values(P).sort((a, b) => score(b, "all") - score(a, "all")).slice(0, 5);
    const prio = L.map((l, i) => ({ l, i })).filter(({ l }) => l.statut === "À contacter" && !l.stop).sort((a, b) => rank(b.l) - rank(a.l)).slice(0, 5);
    const cnt = (f) => { const m = {}; L.forEach((l) => { const k = f(l); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5); };
    const byC = cnt((l) => P[l.pays]?.nom), byO = cnt((l) => { const o = recommend(l.gaps)[0]; return o && SERVICES[o].nom; });
    const list = (rows, max) => rows.length ? rows.map(([k, v]) => `<div class="bar2"><span>${esc(k)}</span><div><b style="width:${(v / max) * 100}%"></b></div><span>${v}</span></div>`).join("") : `<p class="mut">Pas encore de données.</p>`;
    $("#dash").innerHTML = `
      <div class="vhead"><h1>Tableau de bord</h1><p class="mut">Vue d'ensemble de votre prospection.</p></div>
      <div class="kpis">
        <div class="kpi"><span>Prospects</span><b>${n}</b></div>
        <div class="kpi"><span>À contacter</span><b>${by("À contacter")}</b></div>
        <div class="kpi"><span>RDV obtenus</span><b>${by("RDV")}</b></div>
        <div class="kpi"><span>Gagnés</span><b>${won}</b></div>
        <div class="kpi"><span>Conversion</span><b>${rate}%</b><small>gagnés / contactés</small></div>
      </div>
      ${n ? "" : `<div class="empty-state"><h3>Commencez ici</h3><p class="mut">1) Repérez un marché sur la carte · 2) Scannez une ville · 3) Ajoutez les commerces aux prospects.</p>
        <div class="row2" style="justify-content:center"><button class="primary" data-go="carte">Explorer les marchés</button><button data-go="scan">Lancer un scan</button></div></div>`}
      <div class="grid2">
        <div class="card"><h3>Entonnoir</h3>${list(STAT.map((s) => [s, by(s)]), Math.max(1, ...STAT.map(by)))}</div>
        <div class="card"><h3>Marchés les plus prometteurs</h3>${top.map((p) => `<div class="bar2 row" data-sel="${p.id}"><span>${esc(p.nom)}</span><div><b style="width:${score(p, "all") * 20}%"></b></div><span>${score(p, "all").toFixed(1)}</span></div>`).join("")}</div>
        <div class="card"><h3>Prospects par pays</h3>${list(byC, byC[0]?.[1] || 1)}</div>
        <div class="card"><h3>Offres les plus recommandées</h3>${list(byO, byO[0]?.[1] || 1)}</div>
        <div class="card" style="grid-column:1/-1"><h3>À contacter en priorité</h3>${prio.length ? `<table>${prio.map(({ l, i }) => `<tr class="row" data-lead="${i}"><td>${scBadge(l)}</td><td><b>${esc(l.nom)}</b></td><td class="mut">${esc(P[l.pays]?.nom)}</td><td class="mut">${esc(l.contact) || "—"}</td></tr>`).join("")}</table>` : `<p class="mut">Aucun prospect « À contacter ».</p>`}</div>
        <div class="card" style="grid-column:1/-1"><h3>À relancer (contactés depuis plus de 3 jours)</h3>${relance.length ? `<table>${relance.slice(0, 8).map(({ l, i }) => `<tr class="row" data-lead="${i}"><td><b>${esc(l.nom)}</b></td><td class="mut">${esc(P[l.pays]?.nom)}</td><td class="mut">${Math.round((Date.now() - l.maj) / 864e5)} j · ${l.relances || 0} relance(s)</td></tr>`).join("")}</table>` : `<p class="mut">Rien à relancer.</p>`}</div>
      </div>`;
    document.querySelectorAll("#dash [data-go]").forEach((b) => (b.onclick = () => show(b.dataset.go)));
    document.querySelectorAll("#dash [data-sel]").forEach((r) => (r.onclick = () => select(r.dataset.sel)));
    document.querySelectorAll("#dash [data-lead]").forEach((r) => (r.onclick = () => leadForm(+r.dataset.lead)));
  }

  // ---- Réglages
  function renderSettings() {
    $("#settings").innerHTML = `
      <div class="vhead"><h1>Réglages</h1><p class="mut">Sauvegarde de vos données et informations d'usage.</p></div>
      <div class="card"><h3>Sauvegarde</h3>
        <p class="mut">Vos prospects sont stockés uniquement dans ce navigateur. Exportez-les régulièrement.</p>
        <div class="row2"><button id="bk-exp">Exporter une sauvegarde (JSON)</button><button id="bk-imp">Importer une sauvegarde</button><button id="bk-del">Tout supprimer</button><input type="file" id="bk-file" accept=".json,application/json" hidden></div><div class="note" id="bk-msg" hidden></div></div>
      <div class="card" style="margin-top:14px"><h3>Signature des messages</h3><p class="mut">Ajoutée à la fin des modèles de message et de relance (nom, activité, contact).</p><textarea id="sig" rows="3" style="width:100%" placeholder="Prénom Nom — Développeur web & IA
WhatsApp +…"></textarea></div>
      <div class="card" style="margin-top:14px"><h3>Modèle local (Qwen)</h3><p class="mut">Se configure dans l'onglet <a href="#" id="to-scan">Scan</a> (URL Ollama et modèle).</p></div>
      <div class="card" style="margin-top:14px"><h3>À propos des données</h3>
        <ul><li>Les notes par pays (1 à 5) sont des <b>estimations qualitatives</b>, à confronter à ITU, GSMA et Banque mondiale.</li>
        <li>Les commerces du scan viennent d'OpenStreetMap : données publiques mais incomplètes.</li>
        <li>Démarchage B2B uniquement ; respectez les lois locales sur les données personnelles et prévoyez toujours une option de désinscription.</li></ul></div>`;
    const msg = (t) => { const m = $("#bk-msg"); m.hidden = false; m.textContent = t; };
    $("#sig").value = sig(); $("#sig").oninput = (e) => { try { localStorage.setItem("radar.sig", e.target.value); } catch (err) {} };
    $("#to-scan").onclick = (e) => { e.preventDefault(); show("scan"); };
    $("#bk-exp").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "radar-afrique", v: 1, leads: state.leads }, null, 2)], { type: "application/json" }));
      a.download = "radar-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
    };
    $("#bk-imp").onclick = () => $("#bk-file").click();
    $("#bk-file").onchange = async (e) => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        const arr = Array.isArray(j) ? j : j.leads;
        if (!Array.isArray(arr)) throw new Error("format inconnu");
        let add = 0;
        arr.forEach((l) => {
          if (!l || typeof l.nom !== "string" || !P[l.pays] || state.leads.some((x) => x.nom === l.nom && x.pays === l.pays)) return;
          state.leads.push({ nom: l.nom, pays: l.pays, secteur: String(l.secteur || SECTEURS[0].nom), site: String(l.site || ""), contact: String(l.contact || ""),
            statut: STAT.includes(l.statut) ? l.statut : STAT[0], gaps: (Array.isArray(l.gaps) ? l.gaps : []).filter((g) => MANQUES.some((m) => m.id === g)), notes: String(l.notes || ""), stop: !!l.stop, stopDate: Number(l.stopDate) || undefined, maj: Number(l.maj) || undefined });
          add++;
        });
        persist(); $("#count").textContent = state.leads.length; msg(add + " prospects importés (doublons ignorés).");
      } catch (err) { msg("Import impossible : " + err.message); }
    };
    $("#bk-del").onclick = () => { if (confirm("Supprimer tous les prospects de ce navigateur ?")) { state.leads.length = 0; persist(); $("#count").textContent = 0; msg("Tous les prospects ont été supprimés."); } };
  }

  function exportCsv() {
    const cell = (v) => { v = String(v ?? ""); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const head = ["Entreprise", "Pays", "Secteur", "Site", "Contact", "Statut", "Manques", "Offres recommandées", "Message envoyé le", "Relances", "Ne pas contacter", "Score", "Notes"];
    const rows = state.leads.map((l) => [l.nom, P[l.pays]?.nom, l.secteur, l.site, l.contact, l.statut,
      l.gaps.map((g) => MANQUES.find((m) => m.id === g)?.t).join(" | "), recommend(l.gaps).map((o) => SERVICES[o].nom).join(" | "), l.envoye ? new Date(l.envoye).toISOString().slice(0, 10) : "", l.relances || 0, l.stop ? "oui" : "", leadScore(l).total, l.notes]);
    const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prospects.csv"; a.click();
  }
  // ---- Fiche prospect : message d'approche, envoi (copier / WhatsApp / email) et relances
  const sig = () => { try { return localStorage.getItem("radar.sig") || ""; } catch (e) { return ""; } };
  const sigLine = () => (sig() ? "\n" + sig() : "");
  const fdate = (t) => new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  const firstPhone = (c) => { const m = String(c || "").match(/\+\d[\d\s().-]{6,}/); return m ? m[0].replace(/\D/g, "") : ""; };
  const firstMail = (c) => { const m = String(c || "").match(/[^\s·,;<>]+@[^\s·,;<>]+\.[^\s·,;<>]+/); return m ? m[0] : ""; };
  function relanceMessage(l, n) {
    const pa = P[l.pays], en = pa && pa.langs.split("/")[0] === "en";
    const off = recommend(l.gaps || [])[0], offre = off ? SERVICES[off].nom.toLowerCase() : "";
    if (en) {
      return n === 0
        ? `Hello ${l.nom},\n\nI'm following up on my previous message. I can prepare a free mini-audit with 3 concrete improvements${offre ? " around " + offre : ""} for ${l.nom}. Would you have 10 minutes this week? Reply STOP to opt out.\n\nBest regards${sigLine()}`
        : `Hello ${l.nom},\n\nI don't want to bother you, so this is my last message. If it's of interest, just reply "OK" and I'll send the free mini-audit. Reply STOP to opt out.\n\nBest regards${sigLine()}`;
    }
    return n === 0
      ? `Bonjour ${l.nom},\n\nJe reviens vers vous au sujet de mon message précédent. Je peux vous préparer gratuitement un mini-audit avec 3 améliorations concrètes${offre ? " autour de : " + offre : ""} pour ${l.nom}. Auriez-vous 10 minutes cette semaine ? Répondez STOP pour ne plus être contacté.\n\nCordialement${sigLine()}`
      : `Bonjour ${l.nom},\n\nJe ne veux pas vous importuner : ceci est mon dernier message. Si le sujet vous intéresse, répondez simplement « OK » et je vous envoie le mini-audit gratuit. Répondez STOP pour ne plus être contacté.\n\nCordialement${sigLine()}`;
  }
  function leadForm(i, pays) {
    const l = i == null ? { nom: "", pays, secteur: SECTEURS[0].nom, site: "", contact: "", statut: STAT[0], gaps: [], notes: "" } : state.leads[i];
    // anciens prospects : le message Qwen était enregistré dans les notes
    let notes = l.notes || "", msg = l.msg || "";
    if (!msg) {
      const m = notes.match(/Message proposé \(Qwen\) :\n([\s\S]*?)(?=\nSource :|$)/);
      if (m) { msg = m[1].trim(); notes = notes.replace(m[0], "").replace(/\n{2,}/g, "\n").trim(); }
    }
    const nRel = l.relances || 0;
    tab("prospects");
    const el = $("#tab-prospects");
    el.innerHTML = `<div class="form"><h2>${i == null ? "Nouveau prospect" : esc(l.nom)}</h2><div id="score-box"></div>
      <label>Entreprise<input id="f-nom" value="${esc(l.nom)}"></label>
      <div class="row2"><label style="flex:1">Pays<select id="f-pays">${Object.values(P).map((p) => `<option value="${p.id}" ${p.id === l.pays ? "selected" : ""}>${esc(p.nom)}</option>`).join("")}</select></label>
      <label style="flex:1">Statut<select id="f-st">${STAT.map((s) => `<option ${s === l.statut ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
      <label class="chk stopbox"><input type="checkbox" id="f-stop" ${l.stop ? "checked" : ""}>🚫 Ne pas contacter (a demandé l'arrêt / répondu STOP)${l.stopDate ? " — depuis le " + fdate(l.stopDate) : ""}</label>
      <label>Secteur<select id="f-sec">${SECTEURS.map((s) => `<option ${s.nom === l.secteur ? "selected" : ""}>${esc(s.nom)}</option>`).join("")}</select></label>
      <label>Site / page<input id="f-site" value="${esc(l.site)}"></label>
      <div class="row2" style="margin-top:-2px"><button id="s-chk">🔍 Analyser le site</button></div><div id="s-out"></div>
      <label>Contact (téléphone au format +221…, email pro)<input id="f-contact" value="${esc(l.contact)}"></label>

      <h3>Message d'approche</h3>
      <div class="note warn" id="stop-banner" hidden></div>
      <div class="mut" id="m-state">${l.envoye ? "📤 Envoyé le " + fdate(l.envoye) : "Pas encore envoyé"}</div>
      <textarea id="f-msg" rows="8"></textarea>
      <div class="row2"><button id="m-copy">Copier</button><button id="m-wa">WhatsApp</button><button id="m-mail">Email</button><button id="m-qwen">✨ Rédiger avec Qwen</button><button id="m-tpl">↻ Modèle</button></div>
      <div class="row2"><button class="primary" id="m-sent">✓ Marquer comme envoyé</button></div>

      <h3>Relance</h3>
      <div class="mut" id="r-hint">${l.statut === "Contacté"
        ? `${nRel} relance${nRel > 1 ? "s" : ""} envoyée${nRel > 1 ? "s" : ""} · à relancer à partir du ${fdate((l.maj || Date.now()) + 3 * 864e5)}${nRel >= 3 ? ' · <b class="warn">3 relances sans réponse : pensez à passer en « Perdu ».</b>' : ""}`
        : "Relance disponible après l'envoi du premier message (bouton « ✓ Marquer comme envoyé »). Le modèle est déjà prêt ci-dessous."}</div>
      <textarea id="f-rel" rows="6"></textarea>
      <div class="row2"><button id="r-copy">Copier</button><button id="r-wa">WhatsApp</button><button id="r-mail">Email</button><button id="r-tpl">↻ Modèle</button></div>
      <div class="row2"><button class="primary" id="r-sent" ${l.statut === "Contacté" ? "" : "disabled"}>✓ Relance envoyée</button></div>
      <div class="note" id="m-note" hidden></div>

      <h3>Audit : manques constatés</h3>
      ${MANQUES.map((m) => `<label class="chk"><input type="checkbox" data-g="${m.id}" ${l.gaps.includes(m.id) ? "checked" : ""}>${esc(m.t)}</label>`).join("")}
      <div id="reco"></div>
      <label>Notes<textarea id="f-notes" rows="3"></textarea></label>
      <div class="row2"><button class="primary" id="save">Enregistrer</button><button id="cancel">Retour</button>${i != null ? '<button id="del">Supprimer</button>' : ""}</div></div>`;
    $("#f-notes").value = notes;
    const read = () => ({ nom: $("#f-nom").value.trim(), pays: $("#f-pays").value, secteur: $("#f-sec").value, site: $("#f-site").value.trim(), contact: $("#f-contact").value.trim(), statut: $("#f-st").value, stop: $("#f-stop").checked, notes: $("#f-notes").value, gaps: [...el.querySelectorAll("[data-g]:checked")].map((c) => c.dataset.g) });
    $("#f-msg").value = msg || message(read());
    if ($("#f-rel")) $("#f-rel").value = l.rel || relanceMessage(read(), nRel);
    // la section Relance suit le statut choisi dans la liste, sans attendre « Enregistrer »
    const syncRel = () => {
      const on = $("#f-st").value === "Contacté";
      $("#r-sent").disabled = !on || $("#f-stop").checked;
      $("#r-hint").textContent = on
        ? `${nRel} relance${nRel > 1 ? "s" : ""} envoyée${nRel > 1 ? "s" : ""} · à relancer à partir du ${fdate((l.statut === "Contacté" && l.maj ? l.maj : Date.now()) + 3 * 864e5)}${nRel >= 3 ? " · 3 relances sans réponse : pensez à passer en « Perdu »." : ""}`
        : "Relance disponible après l'envoi du premier message (bouton « ✓ Marquer comme envoyé »). Le modèle est déjà prêt ci-dessous.";
    };
    $("#f-st").addEventListener("change", syncRel); syncRel();
    // « Ne pas contacter » : bloque tout envoi et toute relance pour ce prospect
    const SEND = ["m-copy", "m-wa", "m-mail", "m-qwen", "m-sent", "r-copy", "r-wa", "r-mail", "r-sent"];
    const syncStop = () => {
      const on = $("#f-stop").checked, banner = $("#stop-banner");
      banner.hidden = !on;
      banner.textContent = "🚫 Ne pas contacter : aucun message ni relance ne doit être envoyé à ce prospect.";
      SEND.forEach((id) => { const b = $("#" + id); if (b && id !== "r-sent") b.disabled = on; });
      syncRel();
    };
    $("#f-stop").addEventListener("change", () => { if ($("#f-stop").checked && $("#f-st").value !== "Gagné") $("#f-st").value = "Perdu"; syncStop(); });
    syncStop();
    const note = (t) => { const n = $("#m-note"); n.hidden = false; n.textContent = t; };
    const reco = () => {
      const d = read(), r = recommend(d.gaps), s = leadScore(d);
      $("#score-box").innerHTML = d.stop ? "" : `<div class="scorebox"><span class="sc ${s.level}">${s.total}</span> <b>${{ hot: "Priorité haute", mid: "Priorité moyenne", low: "Priorité faible" }[s.level]}</b> <span class="mut">— ${s.parts.map(([n, p, m]) => `${n} ${p}/${m}`).join(" · ")}</span></div>`;
      $("#reco").innerHTML = r.length ? `<h3>Offres à proposer</h3><div class="chips">${r.map((o, k) => `<span>${k === 0 ? "★ " : ""}${SERVICES[o].nom}</span>`).join("")}</div>` : "";
    };
    el.querySelectorAll("[data-g]").forEach((x) => x.addEventListener("input", reco));
    ["#f-contact", "#f-site", "#f-pays", "#f-stop"].forEach((s) => $(s).addEventListener("input", reco)); reco();

    // analyse réelle du site : coche les manques constatés et ajoute les contacts trouvés sur le site
    $("#s-chk").onclick = async () => {
      const url = $("#f-site").value.trim(), out = $("#s-out"), b = $("#s-chk");
      if (!url) { out.innerHTML = `<div class="note">Renseignez d'abord l'adresse du site.</div>`; return; }
      b.disabled = true; out.innerHTML = `<div class="note">Analyse en cours (jusqu'à 10 secondes)…</div>`;
      try {
        const a = await SITECHECK.check(url);
        SITECHECK.gaps(a).forEach((g) => { const c = el.querySelector(`[data-g="${g}"]`); if (c) c.checked = true; });
        reco();
        const c = SITECHECK.contacts(a), cur = $("#f-contact").value, digits = (s) => s.replace(/\D/g, "");
        const np = (p) => (window.radarNormPhone ? window.radarNormPhone(p, $("#f-pays").value) : p);
        const add = [...c.phones.map(np).filter((p) => p && !digits(cur).includes(digits(p))), ...c.emails.filter((m) => !cur.includes(m))];
        if (add.length) $("#f-contact").value = [cur, ...add].filter(Boolean).join(" · ");
        $("#f-notes").value = ($("#f-notes").value.replace(/^Audit du site.*$/gm, "").replace(/\n{2,}/g, "\n").trim() + "\nAudit du site (" + new Date().toLocaleDateString("fr-FR") + ") : " + SITECHECK.text(a)).trim();
        out.innerHTML = `<div class="chks">${SITECHECK.html(a)}</div>` + (add.length ? `<div class="note">Contacts trouvés sur le site et ajoutés : ${esc(add.join(", "))}</div>` : "");
      } catch (e) { out.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
      b.disabled = false;
    };

    // enregistre la fiche (créée si nouvelle) avec des champs en plus ; renvoie false si le nom est vide
    const commit = (patch) => {
      const d = { ...l, ...read(), msg: $("#f-msg").value, rel: $("#f-rel") ? $("#f-rel").value : l.rel || "", ...patch };
      d.stopDate = d.stop ? (l.stop ? l.stopDate : Date.now()) : undefined;
      if (!d.nom) { $("#f-nom").focus(); return false; }
      if (i == null) { state.leads.push(d); i = state.leads.length - 1; } else state.leads[i] = d;
      store.set(state.leads); $("#count").textContent = state.leads.length;
      return true;
    };
    // boutons Copier / WhatsApp / Email pour un texte donné
    const wire = (p, area) => {
      $("#" + p + "-copy").onclick = async () => {
        try { await navigator.clipboard.writeText($(area).value); } catch (e) { $(area).select(); document.execCommand("copy"); }
        note("Message copié dans le presse-papiers.");
      };
      $("#" + p + "-wa").onclick = () => {
        const ph = firstPhone($("#f-contact").value);
        if (!ph) return note("Aucun numéro au format international (+221…) dans le champ Contact.");
        window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent($(area).value), "_blank", "noopener");
      };
      $("#" + p + "-mail").onclick = () => {
        const ad = firstMail($("#f-contact").value);
        if (!ad) return note("Aucune adresse email dans le champ Contact.");
        location.href = "mailto:" + ad + "?subject=" + encodeURIComponent("Mini-audit gratuit pour " + $("#f-nom").value) + "&body=" + encodeURIComponent($(area).value);
      };
    };
    wire("m", "#f-msg");
    $("#m-tpl").onclick = () => { $("#f-msg").value = message(read()); note("Message régénéré à partir du modèle."); };
    $("#m-qwen").onclick = async () => {
      const b = $("#m-qwen"); b.disabled = true; note("Qwen rédige le message… (10 à 30 secondes)");
      try {
        if (!window.qwenMessage) throw new Error("module Scan non chargé");
        $("#f-msg").value = (await window.qwenMessage(read())) + sigLine().replace(/^\n/, "\n\n");
        note("Message rédigé par Qwen : relisez-le avant l'envoi.");
      } catch (e) { note("Qwen indisponible : " + e.message); }
      b.disabled = false;
    };
    $("#m-sent").onclick = () => {
      if (l.envoye && !confirm("Ce message est déjà marqué comme envoyé le " + fdate(l.envoye) + ". Mettre à jour la date ?")) return;
      if (commit({ statut: "Contacté", envoye: Date.now(), maj: Date.now(), relances: l.envoye ? l.relances || 0 : 0, rel: "" })) leadForm(i);
    };
    if ($("#f-rel")) {
      wire("r", "#f-rel");
      $("#r-tpl").onclick = () => { $("#f-rel").value = relanceMessage(read(), nRel); note("Relance régénérée à partir du modèle."); };
      $("#r-sent").onclick = () => { if (commit({ relances: nRel + 1, maj: Date.now(), rel: "" })) leadForm(i); };
    }
    $("#save").onclick = () => { if (commit({ maj: i == null || $("#f-st").value !== l.statut ? Date.now() : l.maj })) renderLeads(); };
    $("#cancel").onclick = renderLeads;
    if ($("#del")) $("#del").onclick = () => { if (l.stop && !confirm("Ce prospect est marqué « Ne pas contacter ». Le supprimer effacerait cette trace : il pourrait être recontacté par erreur lors d'un prochain scan. Supprimer quand même ?")) return; state.leads.splice(i, 1); store.set(state.leads); renderLeads(); };
  }

  // ---- Navigation (vues) et onglets de la carte
  function show(v) {
    document.querySelectorAll("#side [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== "view-" + v));
    if (v === "dashboard") renderDash();
    if (v === "carte") setTimeout(() => map.invalidateSize(), 0);
    if (v === "scan" && window.renderScan) window.renderScan();
    if (v === "prospects" && !$("#tab-prospects .form")) renderLeads();
    if (v === "reglages") renderSettings();
  }
  function tab(t) {
    if (t === "scan" || t === "prospects") return show(t);
    show("carte");
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    ["pays", "classement"].forEach((n) => ($("#tab-" + n).hidden = n !== t));
    if (t === "classement") renderRank();
  }
  document.querySelectorAll("#side [data-view]").forEach((b) => (b.onclick = () => show(b.dataset.view)));
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
  Object.entries(REGIONS).forEach(([k, v]) => $("#region").insertAdjacentHTML("beforeend", `<option value="${k}">${v}</option>`));
  [["service", "service"], ["region", "region"], ["lang", "lang"]].forEach(([id, key]) => ($("#" + id).onchange = (e) => { state[key] = e.target.value; draw(); if (!$("#tab-classement").hidden) renderRank(); if (state.sel) renderPays(); }));

  $("#detail").onchange = (e) => { state.detail = e.target.checked; if (state.detail) { tiles.addTo(map); tiles.bringToBack(); } else tiles.remove(); draw(); };
  window.RADAR = { state, P, MANQUES, store, renderLeads, show, select, message, leadScore };
  draw(); legend(); renderPays(); renderLeads(); show("dashboard");
})();
