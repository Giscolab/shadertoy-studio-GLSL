# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [5.0.0] - 2023-10-27

### Ajouté
- **Refonte complète de l'architecture** (App, AudioEngine, VideoRecorder séparés).
- **Audio Engine v2** : Analyse par bandes (Bass/Mid/High), filtres Biquad, détection de BPM.
- **Support MIDI** : Intégration complète Web MIDI avec système de mapping "Learn".
- **Drag & Drop** : Chargement à la volée de fichiers audio et de textures sur le canvas.
- **Nouveaux Shaders** : Mandelbrot, Reaction-Diffusion (simulé), Hexagonal, Wave Interference.
- **Nouvelles Géométries** : Klein Bottle, Möbius Strip, Heart, Gear, Spring Coil.
- **Post-Processing** : Ajout des effets Pixel Art et Vignette.
- **Export Vidéo** : Support complet WebM/MP4 avec choix de la résolution et du bitrate.
- **Presets** : Ajout de 10 nouveaux presets (Total 22).

### Modifié
- Interface migrée vers **Tweakpane v4**.
- Amélioration des performances du rendu (optimisation des uniforms).
- Le système de sauvegarde utilise maintenant le LocalStorage pour persister l'état complet.

## [4.0.0] - Version précédente
- Introduction du système de plugins Tweakpane.
- Premier support de l'export vidéo (expérimental).

## [3.0.0]
- Ajout du support Audio (Microphone uniquement).
- Ajout du Bloom.

## [1.0.0]
- Lancement initial : Éditeur de base avec 3 shaders et couleurs simples.