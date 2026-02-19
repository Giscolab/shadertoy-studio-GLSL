# 🗺️ Roadmap Shader Studio

Voici les fonctionnalités prévues pour les futures versions de Shader Studio.

## 🚀 Court Terme (v5.x)
- [ ] **Support MIDI** : Contrôler les paramètres (vitesse, couleurs, effets) via un contrôleur physique externe (Web MIDI API).
- [ ] **Partage par URL** : Encoder toute la configuration (JSON) en Base64 dans le hash de l'URL pour partager instantanément une création.
- [ ] **Drag & Drop Amélioré** : Support du glisser-déposer pour les textures (images) et les fichiers audio directement sur le canvas.
- [ ] **Nouveaux Presets** : Étendre la bibliothèque à 50 presets couvrant plus de styles artistiques.
- [ ] **Undo/Redo** : Historique des modifications pour annuler ou rétablir les actions rapidement.
- [ ] **Capture Transparente** : Option pour exporter des PNG avec fond transparent (alpha channel) pour le compositing.

## 🛠 Moyen Terme (v6.0)
- [ ] **Textures Vidéo / Webcam** : Utiliser le flux de la caméra ou un fichier vidéo comme texture d'entrée (`uTexture`).
- [ ] **Système de Calques (Layers)** : Pouvoir empiler plusieurs shaders avec des modes de fusion (Add, Multiply, Overlay).
- [ ] **Export GIF** : Option d'export plus légère pour les réseaux sociaux.
- [ ] **Mode VR / WebXR** : Immerger l'utilisateur dans le shader en réalité virtuelle.
- [ ] **Support OSC (Open Sound Control)** : Recevoir des données de logiciels tiers (TouchDesigner, Ableton) via WebSocket.
- [ ] **Bibliothèque de Textures** : Gestionnaire d'assets local pour stocker et réutiliser ses propres images.

## 🔮 Long Terme / R&D
- [ ] **Éditeur Nodal** : Remplacer la pile d'effets fixe par un graphe nodal visuel (comme Blender ou TouchDesigner).
- [ ] **Raymarching (SDF)** : Support natif des fonctions de distance signées pour créer des volumes 3D procéduraux sans géométrie classique.
- [ ] **Compute Shaders (WebGPU)** : Passer à WebGPU pour des simulations physiques massives (particules, fluides) sur le GPU.
- [ ] **Galerie en Ligne** : Un backend pour sauvegarder, explorer et voter pour les créations de la communauté.
- [ ] **IA Générative** : Intégration pour générer des textures ou des fragments de code shader via prompt (Stable Diffusion / LLM).
- [ ] **Export Moteur de Jeu** : Transpilation vers Unity Shader Graph ou Unreal Material.

## 🌐 Plateforme Web & Communauté (v7.0+)
- [ ] **Authentification Utilisateur** : Système de comptes sécurisés (Login/Register) pour gérer son profil.
- [ ] **Dashboard Personnel** : Espace membre pour retrouver ses shaders sauvegardés, ses favoris et ses brouillons.
- [ ] **Galerie Publique** : Une page "Explore" pour découvrir les créations des autres utilisateurs avec filtres et recherche.
- [ ] **Système de Publication** : Possibilité de publier ses shaders (privé/public) et de recevoir des likes/commentaires.
- [ ] **Marketplace d'Assets** : Échange ou vente de presets et de textures personnalisées entre membres.

---

### 💡 Vous avez une idée ?

N'hésitez pas à ouvrir une **Issue** sur GitHub pour proposer une fonctionnalité qui n'est pas dans cette liste !

> *Dernière mise à jour : Octobre 2023*
