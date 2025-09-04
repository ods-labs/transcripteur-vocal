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

// Initialisation de l'API Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Route pour la transcription
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier audio fourni' });
        }

        console.log('Fichier reçu:', req.file.filename);

        // Lire le fichier audio
        const audioPath = req.file.path;
        const audioData = fs.readFileSync(audioPath);

        // Préparer les données pour Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        const audioPart = {
            inlineData: {
                data: audioData.toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        // Faire la requête de transcription
        const prompt = "écoute les consignes du mémo vocal et rédige ce qui est demandé. retourne uniquement le texte transcrit sans commentaires additionnels.";

        const result = await model.generateContent([prompt, audioPart]);
        const transcript = result.response.text();

        // Nettoyer le fichier temporaire
        fs.unlinkSync(audioPath);

        // Retourner la transcription
        res.json({
            success: true,
            transcript: transcript.trim(),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Erreur lors de la transcription:', error);

        // Nettoyer le fichier en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Erreur lors de la transcription: ' + error.message
        });
    }
});

// Route de test
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📝 Interface disponible sur http://localhost:${PORT}`);

    // Vérification de la clé API
    if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  ATTENTION: Variable d\'environnement GEMINI_API_KEY non définie');
    } else {
        console.log('✅ Clé API Gemini configurée');
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