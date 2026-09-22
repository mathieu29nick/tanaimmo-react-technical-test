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

| Problème | Gravité | Correction proposée |
|---|---|---|
| La valeur `city` est injectée directement dans la requête SQL. Un utilisateur peut modifier le paramètre et provoquer une injection SQL. | Critique | Utiliser une requête paramétrée avec `$1`, `$2`, etc. |
| Le paramètre `page` est récupéré mais n'est jamais utilisé. Toutes les annonces d'une ville sont retournées en une seule fois. Lors d'un pic de trafic, cela peut fortement charger l'API et PostgreSQL. | Élevée | Ajouter une pagination avec `LIMIT` et `OFFSET`, avec une taille de page limitée. |
| Deux requêtes supplémentaires sont exécutées pour chaque annonce afin de récupérer l'agence et les photos. Cela crée un problème N+1. Pour 100 annonces, la route peut exécuter 201 requêtes SQL. | Élevée | Charger les agences et les photos en lots avec des requêtes utilisant `ANY(...)`, ou utiliser des jointures SQL. |
| Les paramètres `city` et `page` ne sont pas validés. Une ville vide ou une valeur de page invalide peut produire un comportement incorrect. | Moyenne | Vérifier que `city` est une chaîne non vide et que `page` est un entier positif. |
| La route ne gère aucune erreur de base de données. Une erreur PostgreSQL peut remonter jusqu'à Express sans réponse contrôlée. | Élevée | Encadrer les accès à la base avec `try/catch` et retourner une erreur HTTP 500 générique. |
| `SELECT *` récupère potentiellement des colonnes inutiles et augmente la quantité de données transférées entre PostgreSQL et l'API. | Faible à moyenne | Sélectionner uniquement les colonnes nécessaires lorsque le schéma est connu. |