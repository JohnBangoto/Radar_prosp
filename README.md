# Radar Afrique

Outil local de prospection B2B : repérer les marchés africains les plus prometteurs, scanner les commerces d'une ville (garages, salons, restaurants…), qualifier les prospects et suivre les contacts. Il ne nécessite aucune base de données : tout reste dans votre navigateur.

## Lancement

Prérequis : [Node.js](https://nodejs.org) (aucune dépendance à installer).

```
lancer.bat          # Windows : démarre le serveur et ouvre http://localhost:8080
node server.js      # équivalent ; autre port : set PORT=8090 puis node server.js
```

Le serveur écoute uniquement sur votre machine (127.0.0.1). Il sert l'application **et** analyse les sites web des prospects, ce que le navigateur ne peut pas faire seul. Un serveur de fichiers simple (`py -m http.server`) affiche l'application mais désactive l'analyse des sites.

## Utilisation

1. **Marchés** : cliquez un pays sur la carte. Sa fiche donne le potentiel par offre, un angle d'approche et ses grandes villes (cliquables).
2. **Scan** : choisissez un pays, une ville (ou « grandes villes »), les types de commerce, puis *Lancer le scan*. Les résultats sont triés par score de priorité.
   - 🔍 *Vérifier les sites web* : HTTPS, adapté mobile, ancienneté, paiement en ligne, contacts trouvés sur le site.
   - *IA* : le modèle local choisit les pistes d'amélioration les plus plausibles.
   - *+* / *Tout ajouter* : envoie les commerces dans **Prospects**.
3. **Prospects** : liste ou pipeline, tri par priorité, filtres. Dans la fiche : message d'approche (copier, WhatsApp, email), relances, analyse du site, case **Ne pas contacter**.
4. **Tableau de bord** : prospects à contacter en priorité, à relancer, entonnoir par statut.
5. **Réglages** : signature des messages, sauvegarde JSON (export/import), suppression des données.

### Score de priorité (0-100)

Marché du pays (20) + joignabilité : téléphone, email (26) + besoin identifié (30) + constat vérifié sur le site (10). Pastille verte ≥ 65, jaune ≥ 40. Les poids sont un point de départ : ajustez-les dans `leadScore` ([app.js](app.js)) selon vos résultats.

## Modèle local (optionnel) : Qwen via Ollama

Le modèle ne fait que **choisir les pistes** ; le message d'approche est assemblé par le code à partir de phrases-questions, pour éviter les affirmations inventées.

```
ollama pull qwen2.5:3b        # rapide sur CPU ; qwen2.5:7b est plus précis mais plus lent
```

Ollama doit autoriser la page : définissez `OLLAMA_ORIGINS=*` (variable d'environnement), puis redémarrez Ollama. Dans l'onglet Scan, *Tester la connexion* liste les modèles installés.

## Sources de données et coûts

| Source | Coût | Remarque |
|---|---|---|
| OpenStreetMap (Overpass, Nominatim, fond de carte) | Gratuit | Par défaut. Données incomplètes : à Dakar, environ 15 % des restaurants ont un téléphone publié. |
| Qwen / Ollama | Gratuit | Tourne sur votre machine. |
| Google Places (option) | **Payant à l'usage** | Source « Google » ou « Les deux » dans l'onglet Scan. Nécessite votre clé API (Places API (New)) ; elle reste dans le navigateur. Un plafond de requêtes par scan et une confirmation évitent les mauvaises surprises ; fixez aussi un budget d'alerte dans Google Cloud. |

## Données personnelles et conformité

- Les prospects sont stockés dans le `localStorage` du navigateur : ils ne quittent pas votre machine, mais disparaissent si vous videz les données du navigateur. **Exportez régulièrement la sauvegarde JSON** (Réglages).
- Démarchage **B2B uniquement**. Respectez les lois locales sur les données personnelles et l'envoi de messages. Tous les modèles incluent une mention de désinscription (STOP).
- Un prospect marqué **Ne pas contacter** voit tous les envois et relances bloqués, et il est signalé lors des scans suivants. Ne le supprimez pas : exportez la sauvegarde pour conserver cette liste.
- Les notes par pays (1 à 5) dans `data.js` sont des **estimations qualitatives**, à confronter à des sources (ITU, GSMA, Banque mondiale).

## Structure du projet

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Interface (navigation latérale, vues) |
| `app.js` | Carte, fiches pays, prospects, pipeline, tableau de bord, réglages, score |
| `scan.js` | Scan OpenStreetMap, vérification des sites, intégration Qwen |
| `places.js` | Source Google Places (optionnelle) |
| `sitecheck.js` | Client de l'analyse de site (appelle `/api/check`) |
| `server.js` | Serveur local : fichiers statiques + analyse de sites (anti-SSRF, 10 s, 800 Ko max) |
| `data.js` | Pays et indicateurs, offres, secteurs, check-list des manques |
| `cities.js` | Grandes villes par pays (nom + coordonnées) : ajoutez-y vos villes |
| `africa-geo.js` | Contours des pays (GeoJSON) |

## Limites connues

- OpenStreetMap est lacunaire hors des grandes villes : un commerce « sans site » dans les résultats peut en avoir un non renseigné. Vérifiez avant de contacter.
- « Adapté mobile » se base sur la balise *viewport*, ce n'est pas un test complet.
- Les messages d'approche existent en français et en anglais (selon la langue du pays) ; arabe et portugais restent à ajouter.
- Pas de multi-utilisateur ni de synchronisation : un seul navigateur à la fois.
