# 🎨 Shader Studio v5

> Un éditeur de shaders procéduraux "No-Code" haute performance, fonctionnant entièrement dans le navigateur avec WebGL.

![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![WebGL](https://img.shields.io/badge/WebGL-2.0-orange.svg)

**Shader Studio** est un outil créatif permettant de concevoir des visuels génératifs complexes, réactifs à la musique, sans écrire une seule ligne de code GLSL. Il combine la puissance de Three.js avec une interface intuitive pour offrir une expérience de VJing et de création numérique accessible à tous.

## ✨ Fonctionnalités Clés

### 🧠 Moteur Génératif
*   **18 Géométries Paramétriques** : Sphère, Tore, Klein Bottle, Ruban de Möbius, Cœur, Engrenage...
*   **15 Algorithmes de Bruit** : Simplex, Voronoi, FBM, Domain Warping, Reaction-Diffusion, Mandelbrot...
*   **22 Presets Visuels** : Cyberpunk, Lava Planet, Deep Ocean, Glitch Matrix...

### 🎵 Audio Réactivité (Audio Engine)
*   Analyse spectrale en temps réel (FFT).
*   Séparation des bandes **Bass / Mid / High**.
*   **Mapping Dynamique** : Assignez n'importe quelle bande de fréquence à des paramètres visuels (Déplacement, Vitesse, Échelle).
*   Détection de **BPM** et Flash sur le beat.
*   Support Micro et Fichiers Audio (MP3, WAV, OGG).

### 🎹 Contrôle MIDI
*   **Support Web MIDI API** : Connectez vos contrôleurs physiques (Korg, Akai, etc.).
*   **Mapping "Learn"** : Assignez facilement des potards aux paramètres du shader en un clic.
*   **Feedback Visuel** : Moniteur d'entrées MIDI intégré pour le débogage.

### 🎬 Post-Processing & Export
*   **Effets Cinématiques** : Bloom, RGB Shift (Aberration Chromatique), Glitch, Pixel Art, Vignette.
*   **Export Vidéo** : Enregistrez des boucles parfaites en **WebM/MP4** (60 FPS) avec choix du bitrate et de la résolution (jusqu'à 4K).
*   **Export Image** : Capture d'écran haute résolution (PNG).
*   **Export Code** : Générez le code GLSL final pour l'utiliser dans vos propres projets.

### 🛠 Interface Pro
*   Interface flottante rétractable (Tweakpane v4).
*   Moniteurs de performance (FPS, MS, Graphiques Audio).
*   Sauvegarde automatique des réglages (LocalStorage).

## 🚀 Installation & Utilisation

Aucune installation complexe n'est requise (pas de `npm install`, pas de bundler). Le projet utilise des modules ES6 natifs.

### Lancement Rapide
1.  Clonez ce dépôt.
2.  Servez le dossier racine avec un serveur web local (pour éviter les erreurs CORS).
    *   **VS Code** : Installez l'extension "Live Server" et cliquez sur "Go Live".
    *   **Python** : `python3 -m http.server`
    *   **Node** : `npx serve`
3.  Ouvrez votre navigateur sur `http://localhost:8000`.

### Contrôles
*   **Double-clic** sur le canvas : Plein écran.
*   **Haut-droit (☰)** : Afficher/Masquer l'interface.
*   **Glisser-déposer** : Chargez une image (texture) ou un fichier audio directement sur la fenêtre.

## 📂 Structure du Projet

```
/
├── index.html          # Point d'entrée
├── style.css           # Styles UI (Glassmorphism)
├── src/
│   ├── main.js         # Bootstrapper
│   ├── App.js          # Orchestrateur principal (Three.js)
│   ├── Config.js       # Définition des paramètres UI
│   ├── shaders.js      # Bibliothèque de chunks GLSL
│   ├── AudioEngine.js  # Analyse audio & Beat detection
│   └── VideoRecorder.js # Moteur d'export vidéo
│   └── MidiHandler.js  # Gestion Web MIDI API
└── docs/               # Documentation
```

## 🤝 Contribuer

Les contributions sont les bienvenues ! Veuillez consulter CONTRIBUTING.md pour les détails.

## 📜 Licence

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.

---

*Créé avec ❤️ et WebGL.*