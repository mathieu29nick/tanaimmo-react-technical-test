## Partie 1 – Revue de code

### Extrait A – Composant React `ListingList`

| Problème | Gravité | Correction proposée |
|---|---|---|
| Le `useEffect` n'a pas de tableau de dépendances. Il s'exécute après chaque rendu, ce qui déclenche un nouveau `fetch`, puis un nouveau `setState`, et peut provoquer une boucle de requêtes. | Critique | Ajouter `[city]` comme dépendance pour ne relancer la requête que lorsque la ville change. |
| Les erreurs réseau et les réponses HTTP non valides ne sont pas gérées. `r.json()` est appelé même si l'API répond avec une erreur 4xx/5xx. | Élevée | Vérifier `response.ok`, utiliser `try/catch` ou `.catch()` et prévoir un état `error`. |
| `city` est concaténé directement dans l'URL sans encodage. Une ville contenant des espaces ou des caractères spéciaux peut produire une URL incorrecte. | Moyenne | Utiliser `encodeURIComponent(city)` ou `URLSearchParams`. |
| Les éléments générés avec `listings.map()` n'ont pas de propriété `key`, ce qui génère un warning React et peut provoquer des problèmes de réconciliation. | Moyenne | Ajouter une clé stable comme `key={l.id}`. |
| Si `city` change rapidement, une ancienne requête peut se terminer après la nouvelle et écraser les résultats avec des données obsolètes. | Moyenne | Annuler la requête précédente avec `AbortController`, ou ignorer la réponse si le composant n'est plus actif. |
| L'état `loading` n'est remis à `false` que lorsque la requête réussit. En cas d'erreur, l'interface peut rester bloquée sur "Chargement…". | Élevée | Remettre `loading` à `false` dans un bloc `finally`. |


### Extrait B – Route API de recherche d'annonces
### Correction dans : src/routes/listing.js

| Problème | Gravité | Correction proposée |
|---|---|---|
| La valeur `city` est injectée directement dans la requête SQL. Un utilisateur peut modifier le paramètre et provoquer une injection SQL. | Critique | Utiliser une requête paramétrée avec `$1`, `$2`, etc. |
| Le paramètre `page` est récupéré mais n'est jamais utilisé. Toutes les annonces d'une ville sont retournées en une seule fois. Lors d'un pic de trafic, cela peut fortement charger l'API et PostgreSQL. | Élevée | Ajouter une pagination avec `LIMIT` et `OFFSET`, avec une taille de page limitée. |
| Deux requêtes supplémentaires sont exécutées pour chaque annonce afin de récupérer l'agence et les photos. Cela crée un problème N+1. Pour 100 annonces, la route peut exécuter 201 requêtes SQL. | Élevée | Charger les agences et les photos en lots avec des requêtes utilisant `ANY(...)`, ou utiliser des jointures SQL. |
| Les paramètres `city` et `page` ne sont pas validés. Une ville vide ou une valeur de page invalide peut produire un comportement incorrect. | Moyenne | Vérifier que `city` est une chaîne non vide et que `page` est un entier positif. |
| La route ne gère aucune erreur de base de données. Une erreur PostgreSQL peut remonter jusqu'à Express sans réponse contrôlée. | Élevée | Encadrer les accès à la base avec `try/catch` et retourner une erreur HTTP 500 générique. |
| `SELECT *` récupère potentiellement des colonnes inutiles et augmente la quantité de données transférées entre PostgreSQL et l'API. | Faible à moyenne | Sélectionner uniquement les colonnes nécessaires lorsque le schéma est connu. |

### Extrait C – Webhook de confirmation de paiement
### Correction dans : src/routes/paymentWebhook.js et sql/payment_webhook.sql

| Problème | Gravité | Correction proposée |
|---|---|---|
| Le webhook n'est pas idempotent. Si le prestataire réessaie le même événement, l'email et la notification CRM peuvent être envoyés plusieurs fois. | Critique | Utiliser un identifiant unique d'événement et enregistrer les événements déjà traités. Ignorer proprement un événement déjà reçu. |
| La réponse HTTP 200 n'est envoyée qu'après l'envoi de l'email et l'appel au CRM. Le CRM peut prendre jusqu'à 8 secondes, ce qui rapproche dangereusement le traitement de la limite de 10 secondes. | Élevée | Ne faire dans le webhook que les opérations nécessaires et durables, puis déléguer les appels externes à un traitement asynchrone. |
| Si `sendEmail` ou `crm.notifyPayment` échoue, la route peut retourner une erreur au prestataire alors que le paiement a déjà été marqué `paid`. Le retry rejouera alors les traitements. | Critique | Découpler la mise à jour du paiement des effets secondaires et stocker ces effets dans une file/outbox pouvant être rejouée indépendamment. |
| Le corps du webhook n'est pas validé avant utilisation. Des champs comme `booking_id` ou `customer_email` peuvent être absents ou invalides. | Moyenne | Vérifier les champs obligatoires avant traitement et rejeter les événements invalides. |
| Aucune vérification de l'authenticité du webhook n'apparaît dans l'extrait. Un tiers pourrait potentiellement appeler cette route et marquer une réservation comme payée. | Critique | Vérifier la signature du webhook ou le mécanisme d'authentification fourni par le prestataire avant le traitement. |
| La mise à jour du paiement et l'enregistrement du traitement du webhook ne sont pas atomiques. Une erreur entre plusieurs opérations peut laisser un état incohérent. | Élevée | Utiliser une transaction SQL pour enregistrer l'événement, modifier la réservation et créer les tâches asynchrones. |

** Pour l'idempotence, la correction suppose que le prestataire fournit un identifiant
unique par événement (`event.id`). Si ce n'est pas le cas, il faudrait utiliser la clé
d'idempotence ou l'identifiant équivalent documenté par le prestataire. **

## Partie 3 – Gestion d'incident

### 3.1 – Scénario

À 21h40, je commence par vérifier que l'alerte est réelle : taux de 5xx, latence, volume de requêtes, CPU/mémoire de l'API, connexions PostgreSQL et erreurs applicatives récentes. Je regarde également s'il y a eu un déploiement ou un changement de configuration juste avant l'incident.

Comme la campagne SMS a commencé dix minutes plus tôt et que l'extrait B est en production, ma première hypothèse est une saturation liée à la montée brutale du trafic. La route `/api/listings` est particulièrement suspecte : elle ne pagine pas les résultats et exécute deux requêtes supplémentaires par annonce, ce qui peut provoquer un grand nombre de requêtes SQL et saturer PostgreSQL.

Dans les 5 premières minutes, je vérifie les logs des erreurs 5xx, les endpoints les plus lents, le nombre de connexions actives en base et les requêtes lentes. Je cherche notamment à confirmer si `/api/listings` représente une part importante de la latence.

Je préviens rapidement le client que l'incident est confirmé, que l'équipe est en train d'identifier le point de saturation et que je vais privilégier le rétablissement du service avant l'analyse complète. Je lui donne un nouveau point de situation dans 10 à 15 minutes.

Même sans avoir encore identifié la cause exacte, je cherche à réduire la charge : limitation temporaire du trafic si possible, réduction du nombre d'éléments retournés par la route de recherche, désactivation temporaire d'une fonctionnalité non critique ou mise en cache d'une réponse très sollicitée. Si un déploiement récent est suspect, j'envisage également un rollback.

Si l'extrait B est confirmé comme cause, je déploie la correction avec pagination et suppression du N+1, après un test rapide ciblé. Je continue ensuite à surveiller le taux de 5xx, la latence et PostgreSQL jusqu'au retour à un niveau normal.

Une fois le service stabilisé, j'informe le client de la reprise et je reste prudent sur la cause tant qu'elle n'est pas confirmée.

Le lendemain, je fais une analyse post-incident : timeline, cause racine, impact, mesures prises et améliorations. J'ajoute des tests de charge sur les endpoints critiques, je vérifie les index PostgreSQL, les limites du pool de connexions et je mets en place les alertes manquantes avant la prochaine campagne marketing.

### 3.2 – Alertes avant le lancement

| Alerte | Seuil | Outil |
|---|---|---|
| Taux d'erreurs HTTP 5xx | > 2 % pendant 5 minutes | Sentry |
| Latence API | p95 > 2 secondes pendant 5 minutes | Prometheus + Grafana Alerting |
| Pool PostgreSQL | > 80 % des connexions utilisées pendant 5 minutes | Prometheus + Grafana Alerting |
| CPU / mémoire de l'API | > 85 % pendant 5 minutes | Prometheus + Grafana Alerting |