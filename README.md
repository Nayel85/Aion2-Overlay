# Nayel Overlay

> Overlay Aion 2 pour Windows, version perso de [Lokthar overlay](https://github.com/erylopez/aion-overlay)
> (lui-même tiré de [xCROv/aion2-nyerk](https://github.com/xCROv/aion2-nyerk)), avec le suivi des
> sessions, du butin et des missions en plus.

Tout ce que fait Lokthar (compteur de soul des pets, HUD en jeu, DPS meter, timers d'events et de
field bosses, carte, cubes cachés, PvP, buffs, page Guild, demandes de groupe…), plus :

## Ce que Nayel Overlay ajoute

- **Sessions de jeu** : une par personnage et par connexion, avec les AP et les Kina par source,
  les Enhance Stones et les autres monnaies.
  - **Page Session** : la session en cours en entier (Kina/h, AP/h, âmes, runs), le dernier run en
    haut.
  - **Page Past sessions** : toutes les sessions, du plus récent au plus ancien, filtrées par perso
    et par période ; une liste à gauche avec ce que chaque session a fait (« Vakron Sky Island ·
    Normal ×9 · Shugo · Kashapa, Dartan · 3 duty missions »), et le détail complet à droite.
- **Donjons** : un run par passage (même relancé sans sortir), avec son mode (Exploration,
  Conquest Normal/Hard, Transcendence stage 1-4), son temps de clear, tes morts, son nombre de
  cubes (abonnement compris) et son butin avec les icônes du jeu. Les runs d'un même donjon sont
  regroupés (×N), le détail de chacun à un clic.
- **Butin gold séparé** : équipement, matériaux de craft, ailes et tableaux, cartes Arcana. Le
  gris, vert et bleu n'est pas gardé.
- **Page Loot** : tes taux de loot par run, par cube ou par heure, par perso et tous persos
  confondus, filtrés par période, type de donjon, donjon et mode. Par objet : le total, la chance
  par run, et ta chance par rapport aux taux du jeu (questlog.gg), ×1 étant pile le taux annoncé.
  Les taux sont calculés pour un run complet (un tirage par boss : Vakron, c'est Tiere, Thamon et
  Vakron).
- **Shugo Festival** : les coffres que tu as ouverts et ce qu'ils ont donné.
- **Field bosses** : chaque boss dont tu ouvres le coffre a sa ligne, avec ce que le coffre a
  donné.
- **Missions duty** : chaque mission rendue avec ses récompenses. Un clic montre toute sa liste de
  récompenses possibles avec leur taux, celles que tu as eues cochées en vert. Leurs AP ne comptent
  plus comme des AP de faille.
- **Récolte** : nombre de récoltes, ratées, ×2, rank up, et les réussites par qualité (blanc,
  vert, bleu, gold), avec ce qui a été récolté.
- **DPS meter** : colonne des morts, colonnes centrées, et en mode « bosses » le meter reste sur le
  boss dans les donjons PvE (les adds ne le déclenchent plus). Pas de liste d'ennemis dans les
  donjons PvE.

## Installation

1. Installe [Npcap](https://npcap.com) (les options par défaut conviennent).
2. Dans les **Releases** de ce dépôt (il faut y avoir accès), prends au choix :
   - `Nayel-Overlay-Setup-<version>.exe` : l'installeur. Il s'installe pour ton compte Windows
     seulement, et à côté de Lokthar si tu l'as. Il n'est pas signé : si Windows affiche « Windows a
     protégé votre ordinateur », clique sur **Informations complémentaires → Exécuter quand même**.
   - `Nayel-Overlay-<version>-portable.zip` : la même app sans installation. Dézippe-la où tu veux et
     lance `nayel-overlay.exe`.
   - `Nayel-Overlay-<version>-installer.zip` : l'installeur zippé, si ton navigateur bloque les `.exe`.
3. Lance l'overlay **avant de te connecter** à ton personnage, pour qu'il lise ta collection et
   ouvre ta session.

L'overlay s'affiche par-dessus le jeu en mode **fenêtré ou fenêtré sans bordure**, pas en plein
écran exclusif. **Alt+E** ouvre et ferme le tableau de bord.

**Tu avais déjà Lokthar ?** Au premier lancement, Nayel Overlay copie tes données Lokthar
(`%APPDATA%\Lokthar` : collection, réglages, historique…) dans son propre dossier
(`%APPDATA%\Nayel Overlay`). L'original n'est pas touché, et les deux apps restent indépendantes.

## Mises à jour

**Settings → Updates → Check for updates** télécharge la dernière release de ce dépôt et
l'installe par-dessus ta copie (installée ou portable), seulement quand tu le demandes. Tes données
restent dans `%APPDATA%\Nayel Overlay`.

Le dépôt étant privé, l'app lit ses releases avec un token GitHub en **lecture seule**, limité à ce
dépôt, intégré à la compilation. Il n'est pas dans le code source : en local il vient de
`app/update-token.txt` (ignoré par Git), sur GitHub du secret `UPDATE_TOKEN`. Il expire au bout
d'un an : il faudra alors en créer un nouveau et publier une nouvelle version.

## Ce que l'app fait, et ne fait pas

Elle **ne fait qu'écouter**, comme les DPS meters courants d'Aion 2 : elle lit le trafic réseau du
jeu passivement, via Npcap. Elle n'envoie rien au jeu ni à ses serveurs, ne lit ni ne modifie la
mémoire du jeu, et n'envoie aucune touche. Ce qu'elle lit reste sur ton PC.

Elle ne va sur Internet que pour :
- les mises à jour, quand tu les demandes (ce dépôt) ;
- le site lokthar.com, **seulement si tu l'actives** (page Guild Events, réglage « Guild
  events », désactivé par défaut) : les events de guilde, et tes personnages (nom, classe, niveau,
  gear score, puissance de combat, énergie d'Odyle) envoyés au site, qui renvoie le roster de ta
  guilde s'il y est ;
- la synchro des field bosses avec le site Lokthar, désactivée par défaut ;
- les liens que tu cliques (questlog.gg), ouverts dans ton navigateur.

## Publier une version

1. Passe la version de `app/package.json` au numéro suivant : il doit être plus grand que celui de
   la dernière release, sinon l'app ne la proposera pas.
2. Commite, puis pousse un tag : `git tag v<version> && git push nayel main v<version>`.
3. Le workflow `.github/workflows/build.yml` compile sur GitHub (tests du moteur, typecheck,
   installeur, zip) et crée la release avec ses fichiers et leurs SHA-256, en 10 à 20 minutes.

Pour reprendre une nouvelle version de Lokthar : `git fetch origin`, puis `git merge origin/main`
dans la branche `nayel`, résoudre les conflits, et publier une version au numéro suivant.

## Compiler depuis les sources

Il faut Windows, [Node.js 24](https://nodejs.org), [Rust](https://rustup.rs) (avec les Visual
Studio Build Tools que rustup propose d'installer) et Npcap.

```bash
cd app && npm install && npm run dist
```

L'installeur et le zip sortent dans `app/dist/`. Pour développer, compile le moteur une fois, puis
lance l'app avec rechargement à chaud ; elle trouve `engine/target/release` toute seule :

```bash
cd engine && cargo build --release
cd ../app && npm install && npm run dev
```

Après une modification du moteur, recompile-le et utilise Settings → Restart engine.
`A2T_REPLAY=<fichier>` rejoue un enregistrement (`.pcap`, `.pcapng` ou un log de paquets A2Tools)
au lieu du jeu.

Pour trouver où le jeu envoie quelque chose : **Settings → Developer → Packet log**. Chaque message
du jeu lu par le moteur va dans `%APPDATA%\Nayel Overlay\recordings\packets-<date>.txt`, une ligne
par message (heure, opcode, longueur, octets), avec les repères que tu ajoutes (Alt+Shift+M).
Alt+Shift+R le démarre et l'arrête depuis le jeu.

Les données de jeu sont des instantanés de [questlog.gg](https://questlog.gg), régénérés par les
scripts de `app/scripts/` :
- `fetch-items.mjs` : noms, qualités et icônes des objets ;
- `fetch-loot.mjs` : récompenses des donjons, taux de drop par cube et nombre de boss ;
- `fetch-zones.mjs` : zones, types et difficultés des donjons ;
- `fetch-quests.mjs` : noms des missions duty.

## Crédits

- [Lokthar overlay](https://github.com/erylopez/aion-overlay) (GPL-3.0), dont Nayel Overlay est
  une version modifiée : tout l'overlay de base, le meter, les timers, la carte, la page Guild.
- Lokthar a commencé comme fork de [xCROv/aion2-nyerk](https://github.com/xCROv/aion2-nyerk)
  (GPL-3.0) : l'interface de l'overlay et les premières fonctions de suivi des pets. Le log PvP et
  le kill feed viennent de Nyerk 0.2.17.
- Le DPS meter, la capture des paquets et l'analyse des combats utilisent le code de
  [taengu/A2Tools-DPS-Meter](https://github.com/taengu/A2Tools-DPS-Meter) (GPL-3.0) : son parser
  comme dépendance, et son code de capture copié dans `engine/`. Le lecteur de coups des combats
  PvP (`engine/src/tracker/damage.rs`) est une copie de son parser de dégâts. Ses tables de
  monstres, de compétences et de buffs sont dans `engine/data/`, et les icônes de classes du meter
  sont les siennes.
- Les cubes cachés sont trouvés comme le fait
  [dr89mh/aion2-cube-radar](https://github.com/dr89mh/aion2-cube-radar) (GPL-3.0). La liste complète
  des modèles de cubes vient de
  [benhighlanderr/Aion2-Hidden-Cube-Radar](https://github.com/benhighlanderr/Aion2-Hidden-Cube-Radar).
- L'emplacement de la puissance de combat d'un joueur dans son message d'apparition a été trouvé
  par MarceUY.
- Les formats des pets et les règles de comptage des âmes suivent le plugin pet-souls de
  [taengu/A2Tools-Plugins](https://github.com/taengu/A2Tools-Plugins) (GPL-3.0).
- Les icônes de compétences sont celles du jeu, associées par le `skill_icons.json` d'A2Tools DPS
  Meter. Les buffs viennent de sa timeline de buffs (portée depuis Daevalog de Seralth, GPL-3.0).
- La mise en page du tableau de bord s'inspire de l'app overlay de [questlog.gg](https://questlog.gg).
- Les icônes du Shugo Festival et des Spacetime Rifts viennent de
  [guildmanager.app](https://guildmanager.app).
- Les noms, portraits et zones d'apparition des pets, les cartes, les objets, les récompenses et
  taux de drop des donjons, les zones et les missions viennent de [questlog.gg](https://questlog.gg).
- Les emplacements de récolte viennent de la carte du site Lokthar, ses repères importés
  d'[interactivemap.app](https://interactivemap.app/aion2).
- Les repères sur la carte du jeu reprennent l'approche de
  [problem-xyz/aion2-map-overlay](https://github.com/problem-xyz/aion2-map-overlay), avec l'accord
  de son auteur ; la reconnaissance utilise [OpenCV.js](https://opencv.org) (Apache-2.0).
- Aion 2, ses données et ses visuels appartiennent à NCSoft. Ce projet n'est ni affilié à NCSoft
  ou à questlog.gg, ni approuvé par eux.

## Licence

GPL-3.0-only : voir [LICENSE](LICENSE). Les projets crédités ci-dessus sont aussi sous GPL-3.0 ;
leur code reste sous le copyright de leurs auteurs. Si tu donnes l'app à quelqu'un, donne-lui aussi
accès au code source (ici, l'accès à ce dépôt).

## Avertissement

À utiliser à tes risques. L'overlay est passif, mais c'est aux conditions d'utilisation du jeu de
dire si les outils tiers sont autorisés.
