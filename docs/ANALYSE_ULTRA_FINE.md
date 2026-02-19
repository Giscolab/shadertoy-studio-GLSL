# Analyse ultra fine — Shader Studio v5

## 1) Positionnement produit et proposition de valeur

Shader Studio v5 est un studio créatif Web orienté "no-code" pour produire des visuels GLSL interactifs en temps réel, avec un focus VJ/performance live (audio-réactivité, MIDI, presets, export vidéo). Le README annonce un runtime 100% navigateur sans build step, et un usage basé sur modules ES natifs + serveur statique local.  

Implication produit : excellent time-to-first-render (ouvrir `index.html` via serveur local) et faible friction pour les artistes, au prix d'une dépendance CDN à l'exécution.

## 2) Architecture logicielle (vue macro)

Le projet est une SPA légère organisée autour d'un orchestrateur central `App` (1785 lignes), complété par des modules spécialisés :

- `App.js` : moteur principal (Babylon.js), UI Tweakpane, événements, éditeur GLSL, presets, post-process, rendering loop.
- `shaders.js` : bibliothèque shader/chunks + presets + templates ShaderToy.
- `AudioEngine.js` : graphe WebAudio, analyse FFT, bandes bass/mid/high, BPM/beat callbacks.
- `VideoRecorder.js` : enregistrement canvas via `MediaRecorder`, résolution/FPS/bitrate et détection de formats.
- `MidiHandler.js` : abstraction minimale Web MIDI et callback de messages.
- `Config.js` : définition déclarative des paramètres UI/audio/export.

**Observation structurelle clé :** le code suit une architecture "modulaire mais centralisée" : beaucoup de responsabilités sont correctement extraites, mais `App.js` reste un "god object" qui assemble presque toute la logique d'orchestration.

## 3) Stack technique et exécution

- **Rendering** : Babylon.js chargé via CDN (`babylon.js`, loaders, GUI).
- **UI** : Tweakpane + plugin essentials via importmap CDN.
- **Code editor** : CodeMirror 5 via CDN.
- **Audio** : Web Audio API (AudioContext + Analyser + Biquad).
- **MIDI** : Web MIDI API (`navigator.requestMIDIAccess`).
- **Export vidéo** : Web APIs `captureStream` / `MediaRecorder`.
- **Persistance** : LocalStorage pour état shader/audio + mappings MIDI + shader custom.

### Impact opérationnel

- ✅ Simplicité de distribution (pas de pipeline build).
- ⚠️ Sensibilité aux indisponibilités CDN (pas de fallback local).
- ⚠️ Variabilité navigateur pour MIDI/MediaRecorder et codecs.

## 4) Flux d'exécution détaillé (runtime)

1. `src/main.js` instancie immédiatement `new App()`.
2. `App` initialise moteur Babylon, scène, caméra, textures par défaut, shader material, géométrie initiale.
3. Le panneau Tweakpane est construit depuis `Config.js` et pilote `debugObject`.
4. Les événements UI (toggle, drag/drop, compile GLSL, etc.) sont branchés.
5. La boucle `engine.runRenderLoop` exécute `animate()` puis `scene.render()`.

Ce flux est lisible et direct, très utile pour un projet créatif itératif.

## 5) Qualité de conception — points forts

### 5.1 Séparation fonctionnelle pertinente
Même si `App.js` est volumineux, les sous-domaines complexes (audio, vidéo, MIDI, config, shaders) sont découpés en modules dédiés, ce qui facilite les évolutions incrémentales.

### 5.2 Couverture fonctionnelle élevée pour un projet sans backend
Le produit combine en un seul runtime : géométries paramétriques, bibliothèques de bruit, presets, ShaderToy mode, audio-réactivité, MIDI learn, export image/vidéo et éditeur live. C'est une densité fonctionnelle forte pour une base front-only.

### 5.3 Approche déclarative de la configuration
`Config.js` centralise les paramètres (types, bornes, valeurs par défaut, labels), ce qui réduit la duplication dans la UI et améliore la cohérence des contrôles.

### 5.4 Bonnes pratiques de robustesse présentes
Le code prévoit un `dispose()` global côté `App` et un `dispose()` côté `AudioEngine`, ce qui montre une attention à la libération de ressources (event listeners, passes, textures, engine). 

## 6) Dette technique et risques

### 6.1 Taille de `App.js` (maintenabilité)
`App.js` concentre trop de préoccupations (UI pane, editor, géométrie, shader compile, post-process, persistence, events, ShaderToy, drag/drop, export). Cela augmente le coût cognitif et le risque de régressions croisées.

**Action recommandée (priorité haute)** : extraire au moins 4 domaines : `EditorController`, `PostProcessController`, `GeometryFactory`, `PersistenceService`.

### 6.2 Dépendances externes non versionnées localement
Le chargement CDN simplifie l'installation mais introduit des risques de disponibilité/performance/reproductibilité offline.

**Action recommandée (priorité moyenne)** : option "vendor local" documentée (fichiers lockés dans `/vendor`), activable via simple switch dans `index.html`.

### 6.3 Écart documentation / implémentation
Le README décrit explicitement Three.js, alors que l'application est migrée Babylon.js (confirmé dans en-tête d'`App.js` et usages `BABYLON.*`).

**Action recommandée (priorité haute)** : aligner la documentation pour éviter confusion contributeurs/utilisateurs.

### 6.4 Testabilité limitée
Aucune infrastructure de tests unitaires/intégration n'est présente. Le projet est orienté prototype créatif, mais l'absence de garde-fous automatiques rend les refactors lourds.

**Action recommandée (priorité moyenne)** : introduire un socle minimal (tests utilitaires purs + smoke tests de chargement de modules).

## 7) Analyse performance (statique)

### Points positifs
- Le rendu repose sur GPU et un loop Babylon standard.
- Les effets audio utilisent des analyseurs dédiés par bande, ce qui simplifie le mapping sans recalcul CPU complexe côté JS.

### Points de vigilance
- Compilation/re-compilation shader fréquente possible avec éditeur live : à amortir via debounce côté UI.
- Multiplication d'effets post-process activables : utile artistiquement, potentiellement coûteux sur GPU modestes.
- Allocation potentielle dans certaines branches de géométrie custom à surveiller lors de changements fréquents.

## 8) Expérience développeur et contribution

- Projet facile à lancer (`python3 -m http.server`) sans dépendances Node.
- Contribuer est simple pour itérations rapides.
- En revanche, `App.js` réduit l'onboarding avancé : lecture longue avant modifications sûres.

## 9) Priorisation pragmatique (30 jours)

1. **Alignement doc** (README/docs) sur Babylon.js + état réel des features.  
2. **Refactor de découpage `App.js`** en contrôleurs ciblés sans changer le comportement.  
3. **Ajout de checks automatisés minimaux** (lint/syntax/smoke).  
4. **Mode dépendances locales optionnel** pour robustesse hors-ligne.  
5. **Instrumentation perf basique** (frame time moyen + coût passes activées).

## 10) Verdict synthétique

Projet **très riche fonctionnellement** et bien orienté pour la création visuelle temps réel dans le navigateur. La base est solide pour un usage créatif/proto rapide. Le principal levier de maturité n'est pas la feature supplémentaire, mais la **réduction de complexité de l'orchestrateur `App.js`** et l'**alignement documentation/implémentation**.

---

## Annexe — métriques rapides

- `src/App.js` : 1785 lignes.
- `src/shaders.js` : 1075 lignes.
- Total fichiers JS `src/` : 3608 lignes.
- Total lignes (fichiers principaux inspectés) : 3845.

Ces métriques confirment une concentration de logique dans quelques fichiers volumineux.
