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