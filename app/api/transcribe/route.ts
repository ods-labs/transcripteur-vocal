import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const selectedModel = (formData.get('model') as string) || 'pro'

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Aucun fichier audio fourni' },
        { status: 400 }
      )
    }

    console.log('Fichier reçu:', audioFile.name, 'Taille:', audioFile.size)

    // Convertir le fichier en base64
    const arrayBuffer = await audioFile.arrayBuffer()
    const audioData = Buffer.from(arrayBuffer).toString('base64')

    const modelName = selectedModel === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro'
    console.log(`Utilisation du modèle: ${modelName}`)
    
    const model = genAI.getGenerativeModel({ model: modelName })

    const audioPart = {
      inlineData: {
        data: audioData,
        mimeType: audioFile.type
      }
    }

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

IMPORTANT : Réponds uniquement avec le texte final rédigé, prêt à être utilisé. Si les consignes sont imprécises, fais de ton mieux pour interpréter l'intention et rédige un contenu de qualité.`

    // Fonction de retry avec backoff exponentiel
    const generateWithRetry = async (maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Tentative ${attempt}/${maxRetries} pour ${modelName}`)
          const result = await model.generateContent([prompt, audioPart])
          return result
        } catch (error: any) {
          const isRetryableError = error.message?.includes('503') || 
                                 error.message?.includes('overloaded') ||
                                 error.message?.includes('500') ||
                                 error.message?.includes('429')
          
          if (isRetryableError && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
            console.log(`Erreur ${error.message}. Nouvelle tentative dans ${delay/1000}s...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw error
        }
      }
      throw new Error('Toutes les tentatives ont échoué')
    }

    const result = await generateWithRetry()
    if (!result) {
      throw new Error('Aucune réponse du modèle')
    }
    
    const generatedText = result.response.text()
    
    // Récupérer les métadonnées d'usage
    const usageMetadata = result.response.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }
    
    // Calculer le coût en euros (prix 2025)
    const pricing = selectedModel === 'flash' 
      ? { input: 0.004, output: 0.020 } // Flash: $0.004/$0.020 per 1K tokens
      : { input: 4, output: 20 }       // Pro: $4/$20 per 1M tokens
        
    const divisor = selectedModel === 'flash' ? 1000 : 1000000
    const inputCostUSD = (usageMetadata.promptTokenCount || 0) * pricing.input / divisor
    const outputCostUSD = (usageMetadata.candidatesTokenCount || 0) * pricing.output / divisor
    const totalCostUSD = inputCostUSD + outputCostUSD
    const totalCostEUR = totalCostUSD * 0.92 // Approximation USD->EUR
    
    console.log(`Coût de la requête: ${totalCostEUR.toFixed(6)}€ (${usageMetadata.promptTokenCount || 0} tokens entrée, ${usageMetadata.candidatesTokenCount || 0} tokens sortie)`)

    return NextResponse.json({
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

  } catch (error: any) {
    console.error('Erreur lors de la rédaction:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur lors de la rédaction: ' + error.message
      },
      { status: 500 }
    )
  }
}