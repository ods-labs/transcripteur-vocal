# Transcripteur Vocal

Application de transcription vocale utilisant l'API Gemini Pro de Google.

## Déploiement sur AWS Amplify

### 1. Prérequis
- Compte AWS avec accès à Amplify
- Clé API Gemini Pro (Google AI Studio)
- Repository Git (GitHub, GitLab, etc.)

### 2. Configuration des variables d'environnement

Dans la console AWS Amplify, ajoutez cette variable d'environnement :

```
GEMINI_API_KEY = votre_cle_api_gemini
```

### 3. Déploiement

1. Connectez votre repository à AWS Amplify
2. Amplify détectera automatiquement le fichier `amplify.yml`
3. Ajoutez la variable d'environnement `GEMINI_API_KEY`
4. Lancez le déploiement

### 4. Structure du projet

```
/
├── public/           # Frontend statique
│   └── index.html   # Interface utilisateur
├── server.js        # Serveur Express/API
├── amplify.yml      # Configuration Amplify
└── package.json     # Dépendances Node.js
```

## Utilisation locale

1. Clonez le repository
2. `npm install`
3. Créez un fichier `.env` avec `GEMINI_API_KEY=votre_cle`
4. `npm run dev`
5. Ouvrez `http://localhost:3000`