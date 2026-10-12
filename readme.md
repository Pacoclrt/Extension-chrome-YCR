# ⚡ 7Speaking Auto Solver HUD

Extension Google Chrome (Manifest V3) permettant d'automatiser et de résoudre les quiz sur la plateforme 7Speaking grâce à l'interception des requêtes réseau de l'API (`quiz.cfc`) et une interface flottante (HUD) intégrée.

## 🚀 Fonctionnalités

* **Interception réseau native :** Capture les réponses aux questions dès leur chargement (`quiz.cfc`) via `fetch` et `XMLHttpRequest` sans altérer l'intégrité de la session.

* **Interface flottante (HUD) :** Un widget minimaliste et rétractable intégré directement sur l'écran.

* **Support multi-formats :**

  * Questions à choix multiples (QCM / boutons radio).

  * Champs de texte libre (`input` et `textarea`) avec simulation d'événements de saisie React.

* **Enchaînement automatique :** Sélectionne la réponse, clique sur « Valider » puis passe immédiatement à la question suivante (« Suivant »).

* **Délai paramétrable :** Définis un temps de pause (en secondes) entre chaque question avec compte à rebours en temps réel sur le HUD.

* **Contrôle total :** Bouton Démarrer / Arrêter à tout moment.

## 📂 Structure du projet

Assure-toi que les fichiers sont organisés dans un même dossier :

```
7speaking-solver/
├── manifest.json   # Configuration de l'extension Chrome (Manifest V3)
├── injector.js     # Script principal (interception réseau, logique DOM & interface HUD)
└── README.md       # Documentation du projet

```

## 🛠️ Installation

1. Télécharge ou clone ce dépôt sur ta machine :

   ```
   git clone https://github.com/<ton-pseudo>/<nom-du-repo>.git
   
   ```

2. Ouvre **Google Chrome** (ou un navigateur Chromium compatible comme Brave ou Edge).

3. Rends-toi sur la page de gestion des extensions :

   ```
   chrome://extensions/
   
   ```

4. Active le **Mode développeur** en cochant l'interrupteur en haut à droite.

5. Clique sur le bouton **Charger l'extension non empaquetée** (*Load unpacked*) en haut à gauche.

6. Sélectionne le dossier contenant les fichiers `manifest.json` et `injector.js`.

## 📖 Utilisation

1. Connecte-toi sur [7Speaking](https://user.7speaking.com/).

2. Lance un module contenant un quiz ou un examen.

3. Le panneau **⚡ 7Speaking Bot** apparaît automatiquement en haut à droite de l'écran.

4. Dès que la page charge les questions, le statut passe à :

   ```
   Quiz chargé : X questions
   
   ```

5. *(Optionnel)* Modifie la valeur dans le champ **Pause entre réponses** (ex. `2` ou `3` secondes) pour espacer les validations.

6. Clique sur **DÉMARRER** : l'extension prend la main, remplit les réponses et enchaîne les questions automatiquement.

7. Clique sur **ARRÊTER** à tout moment si tu souhaites reprendre le contrôle manuel.

## ⚙️ Configuration & Options

| Option | Description | Valeur par défaut | 
| ----- | ----- | ----- | 
| **DÉMARRER / ARRÊTER** | Active ou suspend la boucle de résolution automatique. | Inactif (`DÉMARRER`) | 
| **Pause entre réponses** | Temps d'attente (en secondes) avant de passer à la question suivante. | `2` secondes | 
| **Bouton `−` / `+`** | Réduit ou déploie le volet de l'interface pour libérer la vue. | Déployé | 

## ⚠️ Avertissement (Disclaimer)

Ce projet est développé et partagé à des **fins strictement pédagogiques et éducatives** (démonstration d'interception réseau et d'automatisation via DOM).

L'utilisation de ce type d'outil sur une plateforme d'apprentissage peut enfreindre les Conditions Générales d'Utilisation (CGU) du service ainsi que le règlement de ton établissement d'enseignement ou entreprise. L'auteur décline toute responsabilité quant à l'usage qui en est fait.