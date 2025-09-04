const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Pour servir les fichiers statiques

// Configuration de multer pour gérer les uploads de fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = 'uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Génère un nom unique pour éviter les conflits
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.wav';
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Limite à 10MB
    },
    fileFilter: (req, file, cb) => {
        // Accepte les fichiers audio
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers audio sont acceptés'), false);
        }
    }
});

// Initialisation de l'API Gemini Pro 2.5
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Route pour la rédaction à partir d'un brief vocal
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier audio fourni' });
        }

        console.log('Fichier reçu:', req.file.filename);

        // Lire le fichier audio
        const audioPath = req.file.path;
        const audioData = fs.readFileSync(audioPath);

        // Récupérer le modèle choisi par l'utilisateur
        const selectedModel = req.body.model || 'pro'; // Par défaut Pro
        const modelName = selectedModel === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
        
        console.log(`Utilisation du modèle: ${modelName}`);
        
        // Préparer les données pour le modèle Gemini choisi
        const model = genAI.getGenerativeModel({ model: modelName });

        const audioPart = {
            inlineData: {
                data: audioData.toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        // Prompt optimisé pour la rédaction à partir d'un brief oral
        const prompt = `Tu es un assistant de rédaction expert. Dans ce fichier audio, la personne te donne un brief oral contenant :

CONSIGNES possibles :
- Type de contenu (email, article, présentation, rapport, etc.)
- Ton et style (professionnel, décontracté, commercial, académique...)
- Longueur souhaitée
- Public cible
- Objectif du texte

CONTENU à rédiger :
- Informations factuelles
- Idées principales à développer
- Points clés à mettre en avant
- Structure souhaitée

TON RÔLE :
1. Analyser le brief oral pour identifier les consignes et le contenu
2. Rédiger un texte cohérent et bien structuré selon ces consignes
3. Adapter le style et le ton aux demandes exprimées

IMPORTANT : Réponds uniquement avec le texte final rédigé, prêt à être utilisé. Si les consignes sont imprécises, fais de ton mieux pour interpréter l'intention et rédige un contenu de qualité.`;

        // Fonction de retry avec backoff exponentiel
        const generateWithRetry = async (maxRetries = 3) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`Tentative ${attempt}/${maxRetries} pour ${modelName}`);
                    const result = await model.generateContent([prompt, audioPart]);
                    return result;
                } catch (error) {
                    const isRetryableError = error.message.includes('503') || 
                                           error.message.includes('overloaded') ||
                                           error.message.includes('500') ||
                                           error.message.includes('429');
                    
                    if (isRetryableError && attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`Erreur ${error.message}. Nouvelle tentative dans ${delay/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw error;
                }
            }
        };

        const result = await generateWithRetry();
        const generatedText = result.response.text();
        
        // Récupérer les métadonnées d'usage
        const usageMetadata = result.response.usageMetadata;
        
        // Calculer le coût en euros (prix 2025)
        const pricing = selectedModel === 'flash' 
            ? { input: 0.004, output: 0.020 } // Flash: $0.004/$0.020 per 1K tokens
            : { input: 4, output: 20 };       // Pro: $4/$20 per 1M tokens
            
        const divisor = selectedModel === 'flash' ? 1000 : 1000000;
        const inputCostUSD = (usageMetadata.promptTokenCount || 0) * pricing.input / divisor;
        const outputCostUSD = (usageMetadata.candidatesTokenCount || 0) * pricing.output / divisor;
        const totalCostUSD = inputCostUSD + outputCostUSD;
        const totalCostEUR = totalCostUSD * 0.92; // Approximation USD->EUR
        
        console.log(`Coût de la requête: ${totalCostEUR.toFixed(6)}€ (${usageMetadata.promptTokenCount} tokens entrée, ${usageMetadata.candidatesTokenCount} tokens sortie)`);

        // Nettoyer le fichier temporaire
        fs.unlinkSync(audioPath);

        // Retourner le texte rédigé avec le coût
        res.json({
            success: true,
            content: generatedText.trim(),
            cost: {
                totalEUR: totalCostEUR,
                totalUSD: totalCostUSD,
                inputTokens: usageMetadata.promptTokenCount || 0,
                outputTokens: usageMetadata.candidatesTokenCount || 0,
                model: modelName
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Erreur lors de la rédaction:', error);

        // Nettoyer le fichier en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Erreur lors de la rédaction: ' + error.message
        });
    }
});

// Route de test de santé
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Route pour tester la connexion Gemini Pro 2.5
app.get('/api/test-gemini', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const result = await model.generateContent("Dis simplement 'API Gemini 2.5 Pro fonctionnelle'");
        const response = result.response.text();

        res.json({
            success: true,
            model: "gemini-2.5-pro",
            response: response
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            suggestion: "Vérifiez le nom du modèle dans la documentation Google AI"
        });
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Assistant Rédaction Vocale démarré sur le port ${PORT}`);
    console.log(`✍️ Interface disponible sur http://localhost:${PORT}`);

    // Vérification de la clé API
    if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  ATTENTION: Variable d\'environnement GEMINI_API_KEY non définie');
    } else {
        console.log('✅ Clé API Gemini Pro 2.5 configurée');
    }
});

// Gestion gracieuse de l'arrêt
process.on('SIGINT', () => {
    console.log('\n🔄 Arrêt du serveur...');

    // Nettoyer les fichiers temporaires
    const uploadsDir = 'uploads';
    if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        files.forEach(file => {
            fs.unlinkSync(path.join(uploadsDir, file));
        });
        console.log('🧹 Fichiers temporaires nettoyés');
    }

    process.exit(0);
});