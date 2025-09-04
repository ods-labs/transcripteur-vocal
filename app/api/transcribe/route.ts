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

    // Convertir le fichier en base64
    const arrayBuffer = await audioFile.arrayBuffer()
    const audioData = Buffer.from(arrayBuffer).toString('base64')

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
4. Sauf indication contraire, formater le texte pour être prêt à copier coller dans un editeur de texte ou slack

IMPORTANT : Réponds uniquement avec le texte final rédigé, prêt à être utilisé. Si les consignes sont imprécises, fais de ton mieux pour interpréter l'intention et rédige un contenu de qualité.`

    // Fonction de génération avec fallback automatique
    const generateWithFallback = async () => {
      let actualModel = selectedModel
      let modelName = selectedModel === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro'
      let model = genAI.getGenerativeModel({ model: modelName })
      
      try {
        const result = await model.generateContent([prompt, audioPart])
        return { result, actualModel: selectedModel, modelName }
      } catch (error: any) {
        console.log(`Erreur avec ${modelName}:`, error.message)
        
        // Si erreur de quota/limite et que ce n'est pas déjà Flash, fallback sur Flash
        const isQuotaError = error.message?.includes('429') || 
                           error.message?.includes('quota') ||
                           error.message?.includes('Too Many Requests')
        
        if (isQuotaError && selectedModel !== 'flash') {
          console.log('🔄 Quota atteint pour Pro, fallback automatique sur Flash...')
          
          // Retry avec Flash
          actualModel = 'flash'
          modelName = 'gemini-2.5-flash'
          model = genAI.getGenerativeModel({ model: modelName })
          
          console.log(`Nouvelle tentative avec ${modelName}`)
          const result = await model.generateContent([prompt, audioPart])
          return { result, actualModel, modelName, fallback: true }
        }
        
        // Si autres erreurs retryables
        const isRetryableError = error.message?.includes('503') || 
                               error.message?.includes('overloaded') ||
                               error.message?.includes('500')
        
        if (isRetryableError) {
          // Retry simple avec délai
          console.log('⏳ Serveur surchargé, nouvelle tentative dans 3s...')
          await new Promise(resolve => setTimeout(resolve, 3000))
          const result = await model.generateContent([prompt, audioPart])
          return { result, actualModel, modelName }
        }
        
        throw error
      }
    }

    const { result, actualModel, modelName, fallback } = await generateWithFallback()
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
      fallback: fallback ? `Quota atteint pour Pro, fallback automatique sur Flash` : undefined,
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