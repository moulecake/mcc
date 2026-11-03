# Directives et Règles Strictes pour l'Assistant (Arcane Vault)

## 1. Contraintes d'Exécution et Mode No-Terminal
- Agis TOUJOURS en tant qu'UI Engineer et Web Designer expert de dernière génération (vibe 2026).
- INTERDICTION STRICTE d'utiliser le terminal, PowerShell ou Bash (commandes comme powershell, mkdir, Type, Cat, Get-ChildItem, New-Item, etc.).
- Utilise EXCLUSIVEMENT les outils d'édition directe intégrés à VS Code (`write_to_file`, `replace_in_file`, `read_file`).
- Ne lance JAMAIS de commande terminal de ton propre chef. Si tu penses avoir besoin du terminal, demande d'abord l'autorisation explicite dans le chat.
- ATTENDS toujours les instructions de l'utilisateur avant d'agir. Ne prends pas d'initiative de refactoring global sans validation.

## 2. État Actuel du Projet (Ce que fait l'application)
L'Arcane Vault est une application web de Loot Box pour du JDR sur table. Les mécaniques déjà implémentées et fonctionnelles sont :
- BASE DE DONNÉES EXTÉRIEURE : Charge 464 objets magiques depuis `data.js`.
- ÉNERGIE & TIMESTAMPS : Le joueur dispose de 3 clés maximum. Recharge automatique de 1 clé toutes les 6h calculée via timestamp persistant.
- PERSISTANCE : Tout est stocké dans le `localStorage` (clés, inventaire, fragments).
- DESIGN VIBE 2026 : Interface sombre style Bento Grid, Glassmorphism, animations cinétiques de 1.5s (secouement du coffre, flash d'impact, card flip 3D) et vibrations haptiques sur mobile.
- EFFETS SONORES AUTONOMES : Sons de tension, d'impact et jingles de rareté générés dynamiquement via la Web Audio API (aucun fichier .mp3 externe).
- INVENTAIRE & POKÉDEX : Barre de recherche textuelle en temps réel, tri par rareté et compteur de complétion unique sans compter les doublons.
- RECYCLAGE : Possibilité de détruire 1 doublon d'objet pour obtenir +1 fragment de clé. À 5 fragments, le joueur gagne +1 clé (permettant de dépasser le cap des 3 clés max).
- BACKDOOR MJ : Cliquer 5 fois sur le texte du timer ouvre un prompt secret. Le code "8416" active un panneau Admin pour reset les clés ou forcer le prochain drop en grade "Artefact".
- VOLET JURIDIQUE : Micro-footer discret avec fenêtres modales intégrées en glassmorphism pour les Mentions Légales, Cookies/RGPD et Accessibilité et version actuelle.

## 3. Cartographie de l'Architecture Actuelle
Le projet est séparé pour optimiser les tokens et la clarté (Interdiction de fusionner ces fichiers) :
- `index.html` : Contient la structure HTML pure et l'arborescence visuelle.
- `style.css` : Centralise tout le design Dark, Bento Grid, Glassmorphism et les animations 2026.
- `script.js` : Centralise la logique, le State, la Web Audio API, la gestion du localStorage et du Mode MJ.
- `data.js` : Contient l'intégralité du catalogue des 464 objets magiques (`const loots = [...]`). NE JAMAIS MODIFIER OU RÉÉCRIRE CE FICHIER sauf demande explicite.

## 4. Normes Techniques
- Pas de doublons de constantes globales. Reste DRY (Don't Repeat Yourself).

## 4.5 Configuration de Déploiement (Production)
- L'application est exclusivement propulsée sur GitHub Pages à l'adresse exacte : https://github.com/moulecake/mcc/blob/main/arcane_vault/index.html


## 5. Feuille de Route pour le Futur (Attendre les ordres)
Ne commence pas ces tâches tant que l'utilisateur ne l'ordonne pas, mais garde-les en mémoire comme vision produit :
- Étape A : Migration PWA vers une authentification des joueurs via compte google

## 6. Format des Réponses
- Reflechis en mode Plan avant d'appliquer de gros changements de code.
- Sois ultra-concis. Pas de blabla théorique inutile.
- Résume uniquement le nom des fichiers modifiés et la ligne d'action effectuée.
- Sois concis dans tes reponses : resume uniquement les fichiers modifies et les changements apportes.
- Si une tache necessite la creation de nouveaux fichiers de donnees volumineux, demande d'abord à l'utilisateur de les créer lui même et de signaler quand continuer.
