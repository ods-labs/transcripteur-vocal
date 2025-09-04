const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const upload = multer();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
    // Headers CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Content-Type': 'application/json'
    };

    // Gérer preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Décoder le body de la requête
        const body = event.isBase64Encoded 
            ? Buffer.from(event.body, 'base64').toString('utf-8')
            : event.body;

        // Parser les données multipart
        const boundary = event.headers['content-type'].split('boundary=')[1];
        const parts = body.split(`--${boundary}`);
        
        let audioData = null;
        let selectedModel = 'pro';
        
        // Extraire les données du form-data
        for (const part of parts) {
            if (part.includes('name="audio"')) {
                // Extraire les données audio base64
                const base64Match = part.match(/\r\n\r\n(.*)\r\n/s);
                if (base64Match) {
                    audioData = base64Match[1];
                }
            }
            if (part.includes('name="model"')) {
                const modelMatch = part.match(/\r\n\r\n(.*)\r\n/);
                if (modelMatch) {
                    selectedModel = modelMatch[1].trim();
                }
            }
        }

        if (!audioData) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Aucun fichier audio fourni' })
            };
        }

        const modelName = selectedModel === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
        console.log(`Utilisation du modèle: ${modelName}`);
        
        const model = genAI.getGenerativeModel({ model: modelName });

        const audioPart = {
            inlineData: {
                data: audioData,
                mimeType: 'audio/webm'
            }
        };

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
                        const delay = Math.pow(2, attempt) * 1000;
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
        
        const usageMetadata = result.response.usageMetadata;
        
        const pricing = selectedModel === 'flash' 
            ? { input: 0.004, output: 0.020 }
            : { input: 4, output: 20 };
            
        const divisor = selectedModel === 'flash' ? 1000 : 1000000;
        const inputCostUSD = (usageMetadata.promptTokenCount || 0) * pricing.input / divisor;
        const outputCostUSD = (usageMetadata.candidatesTokenCount || 0) * pricing.output / divisor;
        const totalCostUSD = inputCostUSD + outputCostUSD;
        const totalCostEUR = totalCostUSD * 0.92;
        
        console.log(`Coût: ${totalCostEUR.toFixed(6)}€ (${usageMetadata.promptTokenCount} entrée, ${usageMetadata.candidatesTokenCount} sortie)`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
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
            })
        };

    } catch (error) {
        console.error('Erreur:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Erreur lors de la rédaction: ' + error.message
            })
        };
    }
};