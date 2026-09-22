# TanàImmo — Test technique Développeur Web React

Ce dépôt contient ma réponse au test technique **Développeur Web React – Maintenance et fiabilité de plateforme**.

Le travail réalisé couvre :

- la revue et l'analyse des extraits de code fournis ;
- la correction des extraits B et C ;
- l'implémentation d'un connecteur CRM robuste ;
- les tests unitaires demandés pour le connecteur CRM ;
- une proposition de gestion d'incident et de supervision avant mise en production.

L'objectif a été de privilégier des solutions simples, robustes et explicables dans un contexte de production.

---

## Prérequis

- Node.js 18 ou supérieur
- npm

Aucune base PostgreSQL ni aucun serveur externe ne sont nécessaires pour exécuter les tests du connecteur CRM.

---

## Installation

Cloner le dépôt :

```bash
git clone https://github.com/mathieu29nick/tanaimmo-react-technical-test.git
cd tanaimmo-react-technical-test
```

Vérifier la version de Node.js :

```bash
node -v
```

Le projet nécessite Node.js 18 ou supérieur.

Aucune dépendance externe n'est nécessaire pour exécuter les tests.

---

## Lancer les tests

Exécuter :

```bash
npm test
```

Les tests couvrent les deux scénarios demandés pour le connecteur CRM :

- `429` puis succès ;
- `500` trois fois puis abandon.

Pour exécuter les tests en mode watch :

```bash
npm run test:watch
```

---

## Exécution du projet

Ce dépôt n'est pas une application complète destinée à être lancée avec `npm start` ou `npm run dev`.

Le rendu porte principalement sur :

- l'analyse des extraits fournis ;
- la correction des extraits B et C ;
- l'implémentation du connecteur CRM ;
- les tests unitaires du connecteur ;
- les réponses rédigées dans `REPONSES.md`.

Aucune base PostgreSQL ni aucun serveur Express complet ne sont nécessaires pour évaluer le rendu.

---

## Structure du dépôt

```text
.
├── src/
│   ├── crm/
│   │   └── crmClient.js
│   │
│   └── routes/
│       ├── listings.js
│       └── paymentWebhook.js
│
├── tests/
│   └── crmClient.test.js
│
├── sql/
│   └── payment_webhook.sql
│
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── REPONSES.md
```

---

# Partie 1 — Revue de code

L'analyse complète des trois extraits est disponible dans :

```text
REPONSES.md
```

Pour chaque problème identifié, le document indique :

- le problème ;
- son niveau de gravité ;
- la correction proposée.

## Extrait A — Composant React

L'extrait A est analysé dans `REPONSES.md`.

Les principaux points identifiés concernent notamment :

- le `useEffect` sans tableau de dépendances ;
- l'absence de gestion des erreurs HTTP ;
- la gestion de l'état `loading` ;
- le risque de requêtes obsolètes lors d'un changement rapide de ville ;
- l'absence de `key` dans le rendu de la liste ;
- la construction du paramètre `city`.

Conformément à l'énoncé, l'extrait A est analysé dans la partie rédigée et aucune version corrigée n'est livrée dans le code.

---

## Extrait B — Route API de recherche d'annonces

La version corrigée est disponible dans :

```text
src/routes/listings.js
```

Les principales corrections apportées sont :

- utilisation de requêtes SQL paramétrées afin d'éviter les injections SQL ;
- validation des paramètres `city` et `page` ;
- ajout d'une pagination avec `LIMIT` et `OFFSET` ;
- suppression du problème de requêtes N+1 ;
- chargement groupé des agences et des photos ;
- gestion explicite des erreurs ;
- tri déterministe pour rendre la pagination plus stable.

L'objectif principal de cette correction est de limiter le nombre de requêtes SQL et de rendre la route plus robuste lors de pics de trafic.

---

## Extrait C — Webhook de confirmation de paiement

La version corrigée est disponible dans :

```text
src/routes/paymentWebhook.js
```

Les principaux points traités sont :

- validation minimale de l'événement reçu ;
- traitement idempotent des événements ;
- protection contre le traitement multiple d'un même webhook ;
- utilisation d'une transaction SQL ;
- mise à jour atomique de la réservation ;
- découplage des appels externes du traitement HTTP ;
- utilisation d'une outbox pour les traitements asynchrones ;
- réponse rapide au prestataire de paiement.

Le schéma SQL utilisé pour illustrer le mécanisme d'idempotence et d'outbox est disponible dans :

```text
sql/payment_webhook.sql
```

La correction suppose que le prestataire de paiement fournit un identifiant unique par événement.

Dans un environnement réel, la vérification de la signature du webhook serait également implémentée selon la documentation du prestataire.

---

# Partie 2 — Connecteur CRM

Le connecteur CRM est disponible dans :

```text
src/crm/crmClient.js
```

Il expose la fonction :

```js
createLead(lead)
```

Le connecteur prend en charge :

- l'authentification avec un Bearer Token ;
- un timeout de 5 secondes ;
- un nombre maximal de 3 tentatives ;
- le retry des erreurs temporaires ;
- le retry sur les réponses `429` ;
- la prise en compte de l'en-tête `Retry-After` ;
- un backoff exponentiel entre les tentatives ;
- l'absence de retry sur les erreurs `4xx` définitives ;
- une clé d'idempotence conservée pendant les retries ;
- le token CRM lu depuis une variable d'environnement ;
- l'absence de token dans les logs et les messages d'erreur.

L'API CRM décrite dans l'énoncé étant fictive, les appels sont simulés dans les tests.

---

## Tests du connecteur CRM

Les tests sont disponibles dans :

```text
tests/crmClient.test.js
```

Deux scénarios sont couverts.

### 1. 429 puis succès

Le premier appel retourne :

```text
429 Too Many Requests
```

Le connecteur :

- récupère l'en-tête `Retry-After` ;
- attend avant d'effectuer une nouvelle tentative ;
- conserve la même clé d'idempotence ;
- effectue un second appel ;
- retourne le lead lorsque le CRM répond avec le statut `201`.

### 2. 500 trois fois puis abandon

Le CRM retourne trois réponses :

```text
500 Internal Server Error
```

Le connecteur :

- effectue trois tentatives maximum ;
- applique un backoff exponentiel entre les tentatives ;
- arrête les retries après la troisième tentative ;
- retourne une erreur contrôlée.

---

# Partie 3 — Gestion d'incident

La réponse complète à la partie gestion d'incident est disponible dans :

```text
REPONSES.md
```

Elle couvre notamment :

- les premières vérifications lors de l'incident ;
- les hypothèses liées à la montée brutale du trafic ;
- l'analyse de la route `/api/listings` ;
- les vérifications côté API et PostgreSQL ;
- les actions de mitigation possibles ;
- la communication avec le client ;
- les actions après stabilisation ;
- les améliorations à mettre en place après l'incident ;
- les alertes à configurer avant la mise en production.

---

# Variables d'environnement

Le connecteur CRM utilise la variable suivante :

```env
CRM_TOKEN=your_crm_token_here
```

Un fichier :

```text
.env.example
```

est fourni afin de documenter les variables d'environnement nécessaires.

Le fichier `.env` est exclu du dépôt via `.gitignore`.

Aucun token réel ni aucun autre secret n'est versionné dans le dépôt.

---

# Ce qui a été réalisé

- Analyse des extraits A, B et C
- Tableau des problèmes, gravités et corrections proposées
- Correction de la route de recherche d'annonces
- Protection contre les injections SQL
- Pagination des résultats
- Suppression du problème N+1
- Correction du webhook de paiement
- Gestion de l'idempotence du webhook
- Utilisation d'une transaction SQL
- Proposition d'un mécanisme d'outbox
- Implémentation du connecteur CRM
- Timeout de 5 secondes
- Retry avec backoff exponentiel
- Gestion de `Retry-After`
- Gestion différenciée des erreurs temporaires et définitives
- Clé d'idempotence
- Tests unitaires demandés
- Rédaction du scénario de gestion d'incident
- Proposition d'alertes de supervision

---

# Ce qui n'a pas été réalisé

Afin de rester dans le périmètre et le temps du test :

- aucune base PostgreSQL réelle n'a été installée ;
- aucun serveur Express complet n'a été mis en place ;
- aucun appel vers un CRM réel n'a été effectué ;
- seuls les deux tests unitaires explicitement demandés pour le connecteur CRM ont été implémentés ;
- le worker chargé de consommer la table `payment_outbox` n'a pas été implémenté ;
- la vérification cryptographique de la signature du webhook n'a pas été implémentée, le mécanisme de signature du prestataire n'étant pas fourni dans l'énoncé.

Dans un environnement de production, les prochaines étapes seraient notamment :

- ajouter des tests d'intégration sur les routes HTTP ;
- ajouter des tests de charge sur les endpoints critiques ;
- implémenter un worker pour traiter l'outbox ;
- ajouter une stratégie de retry pour les tâches asynchrones ;
- implémenter la vérification de signature du webhook ;
- vérifier les index PostgreSQL ;
- superviser les métriques applicatives et PostgreSQL.

---

# Historique Git

Le travail a été découpé en plusieurs commits afin de conserver un historique lisible et de refléter la progression du développement.

Exemple de progression :

```text
chore: initialize technical test project
docs: review React listing component
fix: secure and optimize listings endpoint
fix: make payment webhook idempotent and reliable
feat: add resilient CRM lead client with retries
docs: add incident response and monitoring plan
docs: finalize project README
```

---

# Temps passé

Temps réellement passé sur le test :

**01 h 30 min**

---

# Notes

J'ai volontairement privilégié une implémentation limitée au périmètre demandé, avec peu de dépendances et des choix techniques simples à comprendre, tester et maintenir.

Les éléments nécessitant normalement une infrastructure externe — PostgreSQL, CRM réel ou worker asynchrone — sont représentés de manière suffisamment explicite pour présenter l'approche retenue sans ajouter d'infrastructure inutile au test.