/* Données de la plateforme de prospection.
 * ATTENTION : les indicateurs 1-5 sont des ESTIMATIONS qualitatives (jugement, pas des statistiques officielles).
 * Ils servent à prioriser, pas à prouver. Affinez-les avec vos propres retours terrain (ITU, GSMA, Banque mondiale...).
 * m = taille/dynamisme du marché PME · c = connectivité · p = paiement/commerce numérique · y = cadre cyber & données perso
 */
window.REGIONS = { N: "Afrique du Nord", O: "Afrique de l'Ouest", C: "Afrique centrale", E: "Afrique de l'Est", S: "Afrique australe" };

// [iso3, nom, région, langues, m, c, p, y, moyens de paiement courants, cadre données perso (à vérifier)]
window.PAYS = [
  ["DZA","Algérie","N","ar/fr",4,3,2,2,"CIB / Edahabia","Loi 18-07"],
  ["EGY","Égypte","N","ar/en",5,4,3,3,"Fawry, Vodafone Cash, cartes","Loi 151/2020 (PDPL)"],
  ["LBY","Libye","N","ar",2,2,1,1,"Espèces, virements",""],
  ["MAR","Maroc","N","ar/fr",4,4,3,4,"CMI, Cash Plus, cartes","Loi 09-08 (CNDP)"],
  ["TUN","Tunisie","N","ar/fr",3,4,3,4,"Cartes, e-Dinar, D17","Loi 2004-63 (INPDP)"],
  ["ESH","Sahara occidental","N","ar/es",1,1,1,1,"",""],
  ["MRT","Mauritanie","N","ar/fr",2,2,2,1,"Bankily, Masrvi",""],
  ["SDN","Soudan","N","ar/en",2,2,1,1,"Bankak",""],
  ["SEN","Sénégal","O","fr",3,4,4,4,"Wave, Orange Money, Free Money","Loi 2008-12 (CDP)"],
  ["CIV","Côte d'Ivoire","O","fr",4,4,4,4,"Wave, Orange Money, MTN MoMo","Loi 2013-450 (ARTCI)"],
  ["GHA","Ghana","O","en",4,4,4,3,"MTN MoMo, Vodafone Cash","Act 843 (Data Protection Commission)"],
  ["NGA","Nigeria","O","en",5,4,4,3,"Paystack, Flutterwave, virements","NDPA 2023 (NDPC)"],
  ["BEN","Bénin","O","fr",3,3,3,3,"MTN MoMo, Moov Money","Code du numérique (APDP)"],
  ["TGO","Togo","O","fr",2,3,3,3,"T-Money, Flooz","Loi 2019-014 (IPDP)"],
  ["BFA","Burkina Faso","O","fr",3,2,3,3,"Orange Money, Moov Money","Loi 010-2004 (CIL)"],
  ["MLI","Mali","O","fr",2,2,3,2,"Orange Money, Moov Money","Loi 2013-015 (APDP)"],
  ["NER","Niger","O","fr",2,1,2,2,"Airtel Money, Orange Money",""],
  ["GIN","Guinée","O","fr",2,2,2,2,"Orange Money, MTN MoMo",""],
  ["GNB","Guinée-Bissau","O","pt",1,1,2,1,"Orange Money",""],
  ["GMB","Gambie","O","en",1,2,2,1,"Wave, Afrimoney",""],
  ["LBR","Libéria","O","en",1,2,2,1,"Orange Money, MTN MoMo",""],
  ["SLE","Sierra Leone","O","en",1,2,2,1,"Orange Money, Afrimoney",""],
  ["CMR","Cameroun","C","fr/en",3,3,3,3,"MTN MoMo, Orange Money","Loi 2024-017"],
  ["GAB","Gabon","C","fr",2,3,3,3,"Airtel Money, Moov Money",""],
  ["COG","Congo","C","fr",2,2,3,2,"MTN MoMo, Airtel Money",""],
  ["COD","RD Congo","C","fr",3,2,3,2,"M-Pesa, Orange Money, Airtel Money",""],
  ["TCD","Tchad","C","fr/ar",1,1,2,1,"Airtel Money, Moov Money",""],
  ["CAF","Centrafrique","C","fr",1,1,1,1,"",""],
  ["GNQ","Guinée équatoriale","C","es/fr",1,2,2,1,"",""],
  ["KEN","Kenya","E","en",5,5,5,4,"M-Pesa, Airtel Money, cartes","Data Protection Act 2019 (ODPC)"],
  ["ETH","Éthiopie","E","en",4,2,3,2,"Telebirr, CBE Birr","Proclamation 1321/2024"],
  ["UGA","Ouganda","E","en",3,3,4,3,"MTN MoMo, Airtel Money","DPPA 2019 (PDPO)"],
  ["TZA","Tanzanie","E","en/sw",4,3,4,2,"M-Pesa, Tigo Pesa, Airtel Money","PDPA 2022 (PDPC)"],
  ["RWA","Rwanda","E","en/fr",3,4,4,4,"MTN MoMo, Airtel Money","Loi 058/2021 (NCSA)"],
  ["BDI","Burundi","E","fr",1,1,2,1,"Lumicash, Ecocash",""],
  ["SOM","Somalie","E","so/ar",1,2,4,1,"EVC Plus, Zaad",""],
  ["DJI","Djibouti","E","fr/ar",1,2,2,2,"D-Money",""],
  ["ERI","Érythrée","E","ti/ar",1,1,1,1,"",""],
  ["SSD","Soudan du Sud","E","en",1,1,1,1,"",""],
  ["ZAF","Afrique du Sud","S","en",5,5,4,5,"Cartes, EFT, Ozow, SnapScan","POPIA (Information Regulator)"],
  ["AGO","Angola","S","pt",3,2,2,2,"Multicaixa Express",""],
  ["MOZ","Mozambique","S","pt",2,2,3,2,"M-Pesa, e-Mola",""],
  ["ZMB","Zambie","S","en",3,3,3,3,"MTN MoMo, Airtel Money","Data Protection Act 2021"],
  ["ZWE","Zimbabwe","S","en",3,3,4,2,"EcoCash, ZIPIT","Cyber and Data Protection Act 2021"],
  ["BWA","Botswana","S","en",2,3,3,3,"Orange Money, MyZaka","Data Protection Act 2018"],
  ["NAM","Namibie","S","en",2,3,3,2,"EFT, cartes",""],
  ["MWI","Malawi","S","en",2,2,3,1,"Airtel Money, TNM Mpamba",""],
  ["MDG","Madagascar","S","fr/mg",2,2,3,2,"MVola, Orange Money, Airtel Money","Loi 2014-038"],
  ["LSO","Lesotho","S","en",1,2,3,1,"M-Pesa, EcoCash",""],
  ["SWZ","Eswatini","S","en",1,2,3,2,"MTN MoMo",""]
];
// Correspondance avec les noms du fond de carte
window.GEO_ALIAS = {};

window.SERVICES = {
  web:  { nom: "Sites web & e-commerce", w: { m: .4, c: .3, p: .3, y: 0 } },
  cyber:{ nom: "Formation cybersécurité", w: { m: .3, c: .3, p: 0, y: .4 } },
  ia:   { nom: "Agents IA sur mesure",    w: { m: .4, c: .4, p: .2, y: 0 } },
  auto: { nom: "Automatisation",          w: { m: .4, c: .3, p: .3, y: 0 } }
};

// Secteurs : manques fréquents (hypothèses de départ à valider par un audit) et offres qui y répondent
window.SECTEURS = [
  { nom: "Commerce & distribution", offres: ["web","ia","auto"],
    manques: ["Pas de boutique en ligne, ventes gérées à la main sur WhatsApp", "Stocks et factures sur cahier ou Excel", "Paiement mobile non intégré au site"] },
  { nom: "Finance, microfinance & fintech", offres: ["cyber","ia","auto"],
    manques: ["Clients exposés au phishing et à la fraude mobile money", "Équipes peu formées à l'ingénierie sociale", "Vérification KYC et relances manuelles", "Conformité protection des données à documenter"] },
  { nom: "Santé (cliniques, pharmacies)", offres: ["web","cyber","auto"],
    manques: ["Prise de rendez-vous par téléphone/papier", "Données patients sensibles sans politique de sécurité", "Rappels et suivi non automatisés"] },
  { nom: "Éducation & formation privée", offres: ["web","ia","auto"],
    manques: ["Inscriptions et paiements de scolarité manuels", "Pas de plateforme de cours ni de suivi en ligne", "Questions parents/élèves répétitives"] },
  { nom: "Hôtellerie, restauration & tourisme", offres: ["web","ia"],
    manques: ["Dépendance aux plateformes de réservation (commissions)", "Réponses lentes ou hors horaires aux demandes", "Site non adapté mobile / peu de langues"] },
  { nom: "Immobilier", offres: ["web","ia","auto"],
    manques: ["Annonces sur réseaux sociaux uniquement", "Qualification des prospects manuelle", "Pas de CRM ni de suivi des visites"] },
  { nom: "Transport & logistique", offres: ["auto","web","cyber"],
    manques: ["Suivi des colis/flottes par appels", "Devis et facturation manuels", "Fraude sur changements de coordonnées de paiement"] },
  { nom: "Agro-industrie & agriculture", offres: ["auto","web"],
    manques: ["Traçabilité et rapports de production papier", "Peu de vitrine pour l'export", "Collecte de données terrain non digitalisée"] },
  { nom: "Cabinets (comptables, juridiques, conseil)", offres: ["cyber","auto","ia"],
    manques: ["Documents clients confidentiels échangés par mail/WhatsApp", "Saisie répétitive, relances de facturation manuelles", "Recherche documentaire/assistant interne absent"] },
  { nom: "ONG, administration & services publics", offres: ["cyber","web","auto"],
    manques: ["Hameçonnage ciblant le personnel (faux appels d'offres, faux bailleurs)", "Sites obsolètes ou non sécurisés", "Rapports et collecte de données manuels"] }
];

// Check-list d'audit d'un prospect : chaque manque coché déclenche des offres (poids = priorité)
window.MANQUES = [
  { id: "nosite",   t: "Aucun site web (ou seulement une page Facebook)",        o: { web: 3 } },
  { id: "down",     t: "Site injoignable ou en erreur (à re-vérifier)",           o: { web: 3 } },
  { id: "mobile",   t: "Site lent, non adapté mobile ou obsolète",                o: { web: 2 } },
  { id: "https",    t: "Pas de HTTPS / avertissement de sécurité du navigateur",  o: { web: 1, cyber: 2 } },
  { id: "mailpro",  t: "Email sur Gmail/Yahoo au lieu du domaine de l'entreprise",o: { web: 1, cyber: 1 } },
  { id: "pay",      t: "Pas de paiement en ligne / mobile money intégré",         o: { web: 3, auto: 1 } },
  { id: "wa",       t: "Ventes et support gérés à la main sur WhatsApp",          o: { ia: 3, auto: 2 } },
  { id: "support",  t: "Questions clients répétitives, réponses lentes",          o: { ia: 3 } },
  { id: "excel",    t: "Facturation, stocks ou reporting sur Excel / papier",     o: { auto: 3 } },
  { id: "crm",      t: "Aucun suivi structuré des clients et prospects (CRM)",    o: { auto: 2, ia: 1 } },
  { id: "forma",    t: "Personnel jamais formé à la cybersécurité / phishing",    o: { cyber: 3 } },
  { id: "backup",   t: "Pas de sauvegardes régulières ni de mots de passe gérés", o: { cyber: 2 } },
  { id: "rgpd",     t: "Données clients collectées sans cadre de conformité",     o: { cyber: 2, web: 1 } },
  { id: "incident", t: "Incident passé (fraude, piratage de compte, ransomware)", o: { cyber: 3 } }
];
