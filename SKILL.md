---
name: prospection-salles
description: Module de prospection automatisée pour Connect Comedy Club. Utiliser ce skill dès que l'utilisateur parle de prospection de lieux, de recherche de théâtres/cinémas/salles de spectacle/MJC/centres culturels/centres sociaux, d'envoi d'emails de prospection B2B, de campagne emailing vers des propriétaires ou gestionnaires de lieux, de cron de prospection, de configuration du panneau de prospection (mode auto/manuel, fréquence, cibles, départements), ou de toute fonctionnalité liée à la collecte de contacts de lieux classés par département et à leur enregistrement dans MongoDB avec suivi de statut d'envoi.
---

# Skill — Prospection automatisée de salles de spectacle (Connect Comedy Club)

## 1. Objectif de la fonctionnalité

Ajouter à la plateforme Connect Comedy Club un module de **prospection B2B automatisée** qui :

1. Recherche sur internet des **théâtres, cinémas, salles de spectacle, MJC (Maisons des Jeunes et de la Culture), centres culturels et centres sociaux** en France.
2. Collecte pour chaque lieu : **nom, email, téléphone, adresse, site web**, classés par département.
3. Enregistre les résultats dans **MongoDB** (avec déduplication).
4. Envoie un **email pré-défini** invitant les propriétaires/gérants à découvrir la plateforme (lien vers le site + flyer PDF).
5. Suit le **statut de chaque contact** : email transmis ou non, date d'envoi, erreurs, désinscription.
6. Expose un **panneau de configuration** admin permettant de piloter le tout sans toucher au code.

### Déclencheurs (les deux doivent exister)
- **Manuel** : bouton "Lancer la prospection" dans le back-office admin → appel API avec les cibles choisies à la volée.
- **Automatique** : cron configurable depuis l'interface (fréquence, jours, heure) — peut être mis en pause à tout moment.

---

## 2. Architecture cible

```
[Panneau config admin] ──PATCH /api/prospection/config──▶ prospection_config (MongoDB)
                                                                    │
[Bouton manuel] ──┐                                                 │ lu à chaque run
                  ├──▶ POST /api/prospection/run ──▶ ProspectionService
[Cron dynamique] ──┘                                      │
                                         ┌────────────────┼────────────────┐
                                         ▼                ▼                ▼
                                  SearchService    VenueRepository    EmailService
                                  (recherche web)   (MongoDB)         (envoi + statut)
```

- **SearchService** : interroge les sources de données et normalise les résultats.
- **VenueRepository** : upsert dans MongoDB, déduplication par email + nom/adresse.
- **EmailService** : envoie l'email type, met à jour le statut, respecte les quotas anti-spam.
- **ProspectionService** : orchestre le tout, lit la config en BDD, journalise chaque run.
- **CronManager** : instancie et recrée le job node-cron à la volée quand la config change.

Stack supposée : Node.js — vérifier le `package.json` avant d'écrire du code.

---

## 3. Modèle de données MongoDB

### Collection `venues` (lieux prospectés)

```js
{
  _id: ObjectId,
  name: "Théâtre de la Gaîté",
  type: "theatre" | "cinema" | "salle_spectacle" | "mjc" | "centre_culturel" | "centre_social" | "autre",
  email: "contact@exemple.fr",          // null si non trouvé
  phone: "+33 1 23 45 67 89",           // null si non trouvé
  address: {
    street: "12 rue ...",
    city: "Versailles",
    postalCode: "78000",
    departement: "78",                  // ⚠️ clé de classement — dérivé du code postal
    departementName: "Yvelines"
  },
  website: "https://...",
  source: "google_places" | "insee_bpe" | "data_gouv" | "scraping" | "manuel",
  emailStatus: "non_envoye" | "envoye" | "echec" | "desinscrit" | "repondu",
  emailHistory: [
    { sentAt: ISODate, campaign: "invitation-plateforme-v1", status: "envoye", error: null }
  ],
  optOut: false,                        // ⚠️ RGPD : ne JAMAIS renvoyer si true
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**Index obligatoires :**
```js
db.venues.createIndex({ email: 1 }, { unique: true, sparse: true })
db.venues.createIndex({ "address.departement": 1 })
db.venues.createIndex({ type: 1 })
db.venues.createIndex({ "address.departement": 1, type: 1 })  // filtre combiné
db.venues.createIndex({ emailStatus: 1 })
db.venues.createIndex({ name: 1, "address.postalCode": 1 })   // dédup secondaire
```

### Collection `prospection_runs` (journal des exécutions)

```js
{
  _id: ObjectId,
  trigger: "manuel" | "cron",
  startedAt: ISODate,
  finishedAt: ISODate,
  filtres: {
    departements: ["75", "78", "92"],   // [] = tous les départements
    types: ["theatre", "mjc"],          // [] = tous les types
    maxEmails: 50,
    dryRun: false
  },
  stats: { found: 42, new: 17, duplicates: 25, emailsSent: 15, emailsFailed: 2 },
  status: "running" | "done" | "error",
  error: null
}
```

### Collection `prospection_config` (configuration persistante — document UNIQUE)

C'est le cerveau du panneau de contrôle. Un seul document dans cette collection, mis à jour via l'interface admin. Le cron et les runs le lisent à chaque déclenchement.

```js
{
  _id: ObjectId,                          // document unique — toujours le même _id fixe

  // ── MODE ──────────────────────────────────────────────────────────────────
  mode: "auto" | "manuel",
  // "auto"   → le cron tourne selon la fréquence configurée
  // "manuel" → le cron est suspendu, seul le bouton admin peut déclencher un run

  // ── FRÉQUENCE DU CRON (utilisé uniquement si mode = "auto") ──────────────
  cron: {
    expression: "0 9 * * 1,4",           // expression cron standard, recalculée à la sauvegarde
    timezone: "Europe/Paris",
    joursActifs: [1, 4],                  // 0=dim 1=lun 2=mar 3=mer 4=jeu 5=ven 6=sam
    heureEnvoi: "09:00",                  // format HH:MM, pour reconstruire l'expression
    prochainRun: ISODate,                 // calculé et mis à jour après chaque run
  },

  // ── CIBLES DE PROSPECTION PAR DÉFAUT (utilisées par le cron auto) ────────
  cibles: {
    departements: ["75", "78", "91", "92", "93", "94", "95", "77"],
    // [] = tous les départements France entière
    // Le run manuel peut surcharger cette valeur à la volée

    types: ["theatre", "cinema", "salle_spectacle", "mjc", "centre_culturel", "centre_social"],
    // [] = tous les types
    // Le run manuel peut aussi surcharger cette valeur
  },

  // ── PARAMÈTRES D'ENVOI ───────────────────────────────────────────────────
  envoi: {
    maxEmailsParRun: 50,                  // quota anti-spam par exécution
    delaiEntreEnvois: 3,                  // secondes entre chaque email (2–10 recommandé)
    dryRunParDefaut: false,               // si true, le cron simule sans jamais envoyer
  },

  // ── MÉTADONNÉES ──────────────────────────────────────────────────────────
  updatedAt: ISODate,
  updatedBy: "Super Administrateur"
}
```

**Règles d'implémentation de la config :**
- Initialiser ce document au premier démarrage si absent (`findOneAndUpdate` avec `upsert: true`).
- Route de lecture : `GET /api/prospection/config` — renvoie la config actuelle à l'interface.
- Route de mise à jour : `PATCH /api/prospection/config` — patch partiel, protégée admin.
- Quand `mode`, `cron.joursActifs` ou `cron.heureEnvoi` changent → **CronManager recrée le job** node-cron à la volée (destroy + reschedule) sans redémarrer le serveur.
- Reconstruire `cron.expression` depuis `joursActifs` + `heureEnvoi` à chaque sauvegarde : `"MM HH * * JOURS"`.

**Règle de classement par département** : extraire les 2 premiers chiffres du code postal (3 pour les DOM : 971–976, Corse 2A/2B → codes postaux 20xxx). Prévoir une table de correspondance `codePostal → departement`.

---

## 4. Stratégie de recherche web — IMPORTANT

Ne pas scraper Google directement (fragile + contraire aux CGU). Sources par ordre de préférence :

1. **Google Places API** (recommandé) : recherche par type de lieu et zone géographique. Fournit nom, adresse, téléphone, site web. ⚠️ L'email n'est PAS fourni → enrichissement obligatoire.

   Correspondance types → Google Places :
   | Type de lieu      | `type` Google Places                                            |
   |-------------------|-----------------------------------------------------------------|
   | Théâtre           | `theater`, `performing_arts_theater`                            |
   | Cinéma            | `movie_theater`                                                 |
   | MJC               | `community_center` + filtre nom "MJC" / "maison des jeunes"    |
   | Centre culturel   | `cultural_center`                                               |
   | Centre social     | `community_center` + filtre nom "social" / "centre social"     |
   | Salle polyvalente | `event_venue`                                                   |

   ⚠️ `community_center` et `cultural_center` ramènent du bruit — toujours filtrer par mots-clés dans le nom.

2. **Enrichissement email** : visiter le site web du lieu (page contact / mentions légales), parser le HTML avec cheerio, extraire l'email. Fallback : `contact@domaine`.

3. **Données ouvertes — gratuites et fiables :**
   - `data.gouv.fr` : jeux de données CNC (cinémas), salles de spectacle, équipements culturels.
   - **BPE INSEE** : recense exhaustivement MJC, centres sociaux et culturels par commune. URL : `https://www.insee.fr/fr/statistiques/3568638` — **meilleure source pour MJC/centres sociaux**.
   - **RNMA** : annuaire national des MJC.
   - **Ministère de la Culture** : base des équipements culturels.

4. **SerpAPI / Brave Search** si budget : résultats structurés pour petites structures hors Google Maps.

**Implémentation attendue :**
- Boucle sur les départements cibles (issus de `config.cibles.departements`).
- Une requête par type de lieu et par département pour maximiser la couverture.
- Rate limiting : max 1 requête/seconde vers les sites externes.
- Normalisation des téléphones au format E.164 (+33...).
- Validation email (regex + vérification MX optionnelle).
- Toujours renseigner le champ `source`.

---

## 5. Envoi des emails

### Fournisseur
Le projet utilise déjà **SendGrid** (`@sendgrid/mail`) configuré dans le `.env` existant. Utiliser impérativement cette intégration — ne pas introduire un autre fournisseur. La clé est disponible via `process.env.SENDGRID_API_KEY`. Respecter le flag `DISABLE_EMAILS` : si `true`, ne jamais envoyer même en run réel.

### Template (campagne `invitation-plateforme-v1`)
- Objet : personnalisé avec le nom du lieu.
- Corps : présentation de Connect Comedy Club, bénéfice concret pour le lieu, lien site + flyer PDF (lien de téléchargement, pas pièce jointe — meilleure délivrabilité).
- **Obligatoire RGPD** : lien de désinscription + identité expéditeur complète.

### Règles d'envoi
- Filtre MongoDB : `{ emailStatus: "non_envoye", optOut: false }`.
- **Ciblage département** : `{ "address.departement": { $in: config.cibles.departements } }` — surchargeable par le run manuel.
- **Ciblage type** : `{ type: { $in: config.cibles.types } }` — surchargeable par le run manuel.
- Les deux filtres sont cumulables (ex. MJC + centres culturels du 75 et 92 uniquement).
- Quota : `config.envoi.maxEmailsParRun` emails max par run.
- Délai : `config.envoi.delaiEntreEnvois` secondes entre chaque envoi.
- Échec SMTP → `emailStatus: "echec"` + log dans `emailHistory`.
- Endpoint désinscription : `GET /api/prospection/unsubscribe?token=...` → `optOut: true`.

---

## 6. Déclencheurs et panneau de configuration

### Panneau de configuration admin (page Prospection)

L'interface expose les contrôles suivants, tous sauvegardés via `PATCH /api/prospection/config` :

**Bloc Mode :**
- Toggle **Auto / Manuel**
  - `auto` → le cron tourne selon la fréquence configurée
  - `manuel` → cron suspendu, seul le bouton "Lancer" fonctionne

**Bloc Fréquence** (visible uniquement si mode = auto) :
- Sélecteur jours de la semaine (cases à cocher : lun, mar, mer, jeu, ven, sam, dim)
- Champ heure d'envoi (HH:MM)
- Affichage du prochain run calculé

**Bloc Cibles par défaut** (utilisées par le cron auto ET pré-remplies pour le run manuel) :
- Sélecteur multi-départements (liste des 101 départements + DOM, avec recherche)
- Sélecteur multi-types (théâtre, cinéma, MJC, centre culturel, centre social, salle de spectacle)

**Bloc Paramètres d'envoi :**
- Champ "Emails max par run" (nombre, min 1 max 200)
- Champ "Délai entre envois" (secondes, min 2 max 30)
- Toggle "Dry run par défaut" (le cron simule sans jamais envoyer)

**Bouton Enregistrer** → `PATCH /api/prospection/config` → CronManager recrée le job si la fréquence a changé.

### Run manuel (bouton "Lancer la prospection")

Permet de surcharger les cibles par défaut pour ce run uniquement, sans modifier la config :
```json
POST /api/prospection/run
{
  "departements": ["75", "92"],
  "types": ["mjc", "centre_culturel"],
  "maxEmails": 30,
  "dryRun": false
}
```
Si un champ est absent, la valeur de `prospection_config` est utilisée.
Réponse immédiate avec `runId` ; exécution asynchrone ; suivi via `GET /api/prospection/runs/:id`.

### CronManager — recréation dynamique du job

```js
// src/jobs/CronManager.js
const cron = require('node-cron');

let currentTask = null;

async function start() {
  const config = await ProspectionConfig.findOne();
  if (!config || config.mode !== 'auto') return;

  if (currentTask) currentTask.destroy();  // supprime l'ancien job

  currentTask = cron.schedule(config.cron.expression, async () => {
    const freshConfig = await ProspectionConfig.findOne(); // relit à chaque run
    if (!freshConfig || freshConfig.mode !== 'auto') return;
    if (freshConfig.envoi.dryRunParDefaut) return; // sécurité dry run global
    await ProspectionService.run({ trigger: 'cron' });
  }, { timezone: config.cron.timezone });
}

module.exports = { start };
// Appelé au démarrage ET après chaque PATCH /api/prospection/config
```

### Crontab système (filet de sécurité VPS)

En complément de node-cron, configurer un appel curl en crontab système pour les cas de redémarrage. Réutiliser `CRON_SECRET` déjà présent dans le `.env` :
```bash
# crontab -e
0 9 * * 1,4 curl -s -X POST http://localhost:3001/api/prospection/run \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"cron"}' >> /var/log/prospection-cron.log 2>&1
```
Note : le port est `3001` (PORT du `.env` existant).

- Verrou anti-doublon : refuser si un run a déjà `status: "running"`.
- PM2 : `pm2 startup && pm2 save` pour relance automatique au reboot.

---

## 7. Conformité RGPD / CNIL — NE PAS IGNORER

La prospection **B2B** par email est autorisée en France sans consentement préalable, sous conditions :
1. Message en rapport avec la profession du destinataire (✅ salles de spectacle ↔ plateforme de spectacles).
2. Adresses génériques professionnelles (contact@, info@) de préférence.
3. **Lien de désinscription obligatoire** dans chaque email, opt-out définitif.
4. **Identité expéditeur claire** : raison sociale, adresse, contact.
5. Registre de traitement + suppression possible sur demande.
6. Ne jamais revendre la base.

Toute implémentation sans lien de désinscription ou sans flag `optOut` est incomplète.

---

## 8. Variables d'environnement

Le projet possède déjà un `.env` complet. **Ne jamais recréer ce fichier ni écraser les variables existantes.**

### Variables déjà présentes à réutiliser telles quelles

| Variable existante | Utilisation dans le module prospection |
|---|---|
| `DATABASE_URL` | Connexion MongoDB — utiliser ce nom exact, pas `MONGODB_URI` |
| `CRON_SECRET` | Token Bearer pour sécuriser la route `POST /api/prospection/run` déclenchée par crontab |
| `UNSUBSCRIBE_SECRET` | Signer les tokens des liens de désinscription prospection (même mécanique que l'existant) |
| `API_URL` | Construire les liens de désinscription dans les emails (`${API_URL}/api/prospection/unsubscribe?token=...`) |
| `FRONTEND_URL` | Lien vers le site dans le corps de l'email de prospection |
| `DISABLE_EMAILS` | Respecter ce flag — si `true`, ne pas envoyer même si `dryRun: false` |
| `ENABLE_CRONS` | Respecter ce flag — si `false`, ne pas démarrer le CronManager |

### Variables à ajouter si absentes

```
# --- PROSPECTION (SendGrid API) ---
SENDGRID_API_KEY=               # clé API SendGrid (l'ancienne SMTP_PASS si elle existait)
SENDGRID_FROM=contact@connectcomedyclub.com

# --- PROSPECTION (Recherche de lieux) ---
GOOGLE_PLACES_API_KEY=          # pour la recherche de théâtres, cinémas, MJC, etc.

# --- PROSPECTION (Cron) ---
PROSPECTION_CRON_SCHEDULE=0 9 * * 1,4   # valeur par défaut — surchargée par prospection_config
```

### Intégration dans le système de cron existant

Le projet a déjà `CRON_COMEDIAN_SCHEDULE` et `CRON_ORGANIZER_SCHEDULE`. Le cron de prospection suit **exactement le même pattern** — la fréquence par défaut vient du `.env` mais est ensuite pilotée dynamiquement par `prospection_config` en MongoDB (modifiable depuis l'interface sans redémarrer).

⚠️ Toujours vérifier `ENABLE_CRONS === 'true'` avant de démarrer le CronManager de prospection, pour rester cohérent avec le comportement des autres crons du projet.

---

## 9. Ordre d'implémentation recommandé

1. **Collection `prospection_config`** : schéma, initialisation au démarrage, routes GET + PATCH.
2. **Modèle `venues` + `prospection_runs`** : schémas, index, fonction de dédup.
3. **CronManager** : lecture de la config, création/destruction du job, démarrage au boot.
4. **SearchService** : Google Places → normalisation → upsert en BDD. Tester 1 département en `dryRun`.
5. **Enrichissement email** : extraction depuis les sites web des lieux.
6. **EmailService** : template HTML, désinscription, mise à jour des statuts. Tester sur SA PROPRE adresse d'abord.
7. **Route POST /api/prospection/run** avec surcharge des cibles + verrou anti-doublon.
8. **Panneau de configuration admin** : toggle mode, fréquence, cibles, paramètres d'envoi, bouton Enregistrer.
9. **Tableau des venues** : filtres département + type + statut, historique des runs.

---

## 10. Critères de réussite

- [ ] Passer `mode: "manuel"` depuis l'interface suspend le cron sans redémarrer le serveur.
- [ ] Modifier la fréquence (jours + heure) depuis l'interface recrée le job cron dynamiquement.
- [ ] Modifier les cibles (départements + types) depuis l'interface est pris en compte au prochain run auto.
- [ ] Un run manuel peut surcharger les cibles sans modifier la config persistante.
- [ ] Un run en `dryRun` remplit `venues` sans envoyer un seul email.
- [ ] Un run réel envoie les emails, pose `emailStatus: "envoye"`, historise dans `emailHistory`.
- [ ] Le lien de désinscription pose `optOut: true` et bloque tout envoi futur.
- [ ] Le verrou anti-doublon refuse un run si un autre est `status: "running"`.
- [ ] Aucun email envoyé deux fois à la même adresse pour la même campagne.
