# Contribuer à Shader Studio

Merci de l'intérêt que vous portez à Shader Studio ! Nous voulons rendre la création de shaders accessible à tous, et votre aide est précieuse.

## Comment contribuer ?

### 🐛 Signaler un Bug
Si vous trouvez un bug, ouvrez une **Issue** sur GitHub en décrivant :
1.  Ce que vous essayiez de faire.
2.  Ce qui s'est passé (avec des captures d'écran si possible).
3.  Votre navigateur et système d'exploitation.

### 💡 Proposer une Fonctionnalité
Vous avez une idée de nouveau shader, de géométrie ou d'effet ?
1.  Ouvrez une **Issue** avec le tag `enhancement`.
2.  Décrivez votre idée et pourquoi elle serait utile.

### 💻 Soumettre du Code (Pull Request)
1.  **Forkez** le dépôt.
2.  Créez une branche pour votre fonctionnalité (`git checkout -b feature/AmazingShader`).
3.  Commitez vos changements (`git commit -m 'Add AmazingShader'`).
4.  Poussez vers la branche (`git push origin feature/AmazingShader`).
5.  Ouvrez une **Pull Request**.

## Standards de Code

*   **Pas de Build Step** : Le projet doit rester exécutable directement dans le navigateur sans compilation (ES Modules natifs).
*   **Style** : Gardez le code propre et commenté. Utilisez la syntaxe ES6+ moderne.
*   **Performance** : Attention aux boucles de rendu (`animate`). Évitez d'allouer de la mémoire (new Vector3, new Object) à chaque frame.

## Ajouter un nouveau Shader

Pour ajouter un nouveau type de bruit ou de motif :
1.  Ajoutez le code GLSL dans `src/shaders.js` (objet `ShaderChunks`).
2.  Ajoutez l'option dans `src/Config.js` (paramètre `noiseType`).
3.  Testez le résultat visuel.

Merci de faire grandir Shader Studio ! 🚀