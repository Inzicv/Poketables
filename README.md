# Poketable · Multipliez-les tous !

Jeu pour réviser les tables de multiplication. Un Pokémon sauvage apparaît avec une multiplication au-dessus de la tête. La Pokéball est enfermée dans un coffre à code : le code, c'est le résultat. Coffre ouvert → clique sur la Pokéball pour la lancer et attraper le Pokémon, qui rejoint ton Pokédex.

## Réglages
- Dresseur : Sacha ou Ondine.
- Tables de 1 à 10 à inclure (au moins une).
- Temps pour ouvrir le coffre : 10 à 60 s, ou sans chrono.
- Nombre de Pokémon par partie : 10, 20, ou toutes les multiplications des tables choisies.

Un seul essai par coffre. Mauvais code ou temps écoulé : le Pokémon s'enfuit et la bonne réponse s'affiche. La fin de partie liste les multiplications à réviser.

Réglages et Pokédex sont enregistrés dans le navigateur.

## Sauvegarde en ligne (facultative)
Un pseudonyme par enfant, pensé pour des frères et sœurs sur la même tablette. Pas de mot de passe, pas de nom, pas d'e-mail.

- **Choisir mon pseudonyme** : 3 propositions façon Pokémon (ex. `mewdore`), « D'autres idées » pour en tirer d'autres. Le Pokédex de l'appareil devient celui de ce pseudonyme.
- **J'ai déjà un pseudonyme** : charge son Pokédex et ses réglages à la place de ceux de l'appareil (jamais de mélange). Si l'appareil a des Pokémon non sauvegardés, le jeu demande confirmation et en garde une copie de secours locale.
- **Changer de joueur** : sauvegarde d'abord, puis vide l'appareil pour l'enfant suivant. Refusé tant que la sauvegarde n'est pas partie (hors ligne).
- Sauvegarde automatique après chaque capture. Si le même pseudonyme a changé sur un autre appareil pendant que celui-ci avait du nouveau, la synchro s'arrête et propose « Reprendre le Pokédex en ligne » ou « Garder celui de cet appareil ».
- Hors ligne, le jeu reste jouable ; la sauvegarde repart au retour du réseau.

Le pseudonyme suffit pour accéder à la sauvegarde : à réserver à un petit cercle de familles. Stockage : Vercel Blob privé (`src/lib/save-store.ts`, routes `src/app/api/save`), dans le dossier `saves/`. Le même Blob store que La Guilde des CE2 peut servir : la Guilde utilise `adventures/`, aucun mélange. Sans le jeton `BLOB_READ_WRITE_TOKEN`, le jeu marche normalement mais la sauvegarde en ligne affiche « momentanément indisponible ».

## Rareté
Chaque Pokémon a un poids d'apparition selon son rang (`TIER_WEIGHTS` dans `src/lib/game.ts`) :

| Rang | Poids | Chance d'un Pokémon précis (Pokédex vide) |
|---|---:|---:|
| Forme de base (et bébés) | 10 | ~0,46 % |
| 1re évolution | 6 | ~0,28 % |
| Évolution finale | 4 | ~0,19 % |
| Légendaires et fabuleux | 2,5 | ~0,12 % |
| Mew et Mewtwo | 1,5 | ~0,06 % |

Un Pokémon pas encore capturé apparaît 3 fois plus souvent (`NEW_POKEMON_BOOST`) pour que la collection avance. Vérifier les taux : `npx tsx scripts/simulate-rarity.ts`.

## Ajouter ou modifier des Pokémon
1. Déposer l'image dans `public/pokemon/` au format `numéro-nom.webp` (ex. `025-pikachu.webp`, numéro sur 3 chiffres).
2. Ajouter une ligne dans `scripts/data/pokemon-names.txt` : `numéro Nom rang` (rang : `b` base, `1` 1re évolution, `2` évolution finale, `L` légendaire, `M` ultra rare).
3. `node scripts/generate-pokedex.mjs` puis `npm run check`.

## Lancer en local
```bash
npm install
npm run dev
```
Puis http://localhost:3000.

## Vérifications
```bash
npx tsc --noEmit && npm run lint && npm run check && npm run build
npx next start -p 3100   # dans un autre terminal
node scripts/verify-game.cjs
node scripts/verify-cloud.cjs   # faux serveur en mémoire, aucun jeton nécessaire
```

## Déploiement Vercel
1. vercel.com → Add New… → Project → importer `Inzicv/Poketables`.
2. Framework détecté : Next.js. Deploy.
3. Pour la sauvegarde en ligne : onglet **Storage** du projet → relier le Blob store (celui de la Guilde convient). Vercel ajoute tout seul `BLOB_READ_WRITE_TOKEN`. Puis **Redeploy**.

La production suit la branche `main`. Ne jamais mettre le jeton dans Git.
