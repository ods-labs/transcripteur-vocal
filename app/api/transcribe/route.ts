import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    // Timeout pour les requêtes longues (10 minutes)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000)
    
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const selectedModel = (formData.get('model') as string) || 'pro'
    const existingTextRaw = formData.get('existingText')
    const existingText = existingTextRaw ? String(existingTextRaw) : null
    
    if (!audioFile) {
      clearTimeout(timeout)
      return NextResponse.json(
        { error: 'Aucun fichier audio fourni' },
        { status: 400 }
      )
    }

    // Validation de la taille (max 50MB pour éviter les timeouts)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (audioFile.size > maxSize) {
      clearTimeout(timeout)
      return NextResponse.json(
        { error: `Fichier trop volumineux (${Math.round(audioFile.size / 1024 / 1024)}MB). Maximum: 50MB` },
        { status: 413 }
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

    // Créer le prompt selon le mode (nouveau ou complément)
    let prompt: string
    
    if (existingText && existingText.trim()) {
      // Mode complément
      prompt = `Tu es un assistant de rédaction expert. Tu as déjà produit ce texte :

==================
TEXTE EXISTANT :
${existingText}
==================

Dans ce fichier audio, la personne te donne des instructions pour MODIFIER/COMPLÉTER ce texte existant.

Les instructions peuvent être :
- Modifier le formatage (mettre en gras, italique, etc.)
- Ajouter de nouvelles informations
- Réorganiser le contenu
- Changer le style ou le ton
- Corriger ou préciser certains points
- Continuer le texte avec de nouveaux éléments

TON RÔLE :
1. Prendre le TEXTE EXISTANT ci-dessus comme base
2. Appliquer EXACTEMENT les instructions données dans l'audio
3. Si c'est un changement de formatage : appliquer le formatage au texte existant
4. Si c'est un ajout : intégrer harmonieusement avec le texte existant
5. Produire un texte COMPLET qui respecte les nouvelles instructions

IMPORTANT : 
- Réponds UNIQUEMENT avec le texte final modifié/complété
- N'ajoute AUCUNE explication du type "voici le texte modifié"
- Applique les instructions à la lettre
- Garde tout le contenu original sauf si explicitement demandé de le changer`
    } else {
      // Mode création classique
      prompt = `Tu es un assistant de rédaction expert. Dans ce fichier audio, la personne te donne un brief oral contenant :

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
    }

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
                               error.message?.includes('500') ||
                               error.message?.includes('502') ||
                               error.message?.includes('504') ||
                               error.message?.includes('timeout') ||
                               error.message?.includes('network')
        
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
    clearTimeout(timeout)
    
    if (!result) {
      throw new Error('Aucune réponse du modèle')
    }
    
    const generatedText = result.response.text()
    
    if (!generatedText || generatedText.trim().length === 0) {
      throw new Error('Réponse vide du modèle')
    }
    
    // Récupérer les métadonnées d'usage
    const usageMetadata = result.response.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }
    
    // Calculer le coût en euros (prix 2025)
    const pricing = selectedModel === 'flash' 
      ? { input: 0.30, output: 2.5 } // Flash: $0.30/$2.5 per 1M tokens
      : { input: 1.25, output: 10 }  // Pro: $1.25/$10 per 1M tokens
        
    const divisor = 1000000 // Les deux modèles sont facturés par 1M tokens
    const inputCostUSD = (usageMetadata.promptTokenCount || 0) * pricing.input / divisor
    const outputCostUSD = (usageMetadata.candidatesTokenCount || 0) * pricing.output / divisor
    const totalCostUSD = inputCostUSD + outputCostUSD
    const totalCostEUR = totalCostUSD * 0.92 // Approximation USD->EUR

    console.log(`✅ Transcription réussie (${Math.round(audioFile.size / 1024)}KB -> ${generatedText.length} chars, ${modelName})`)
    
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
    console.error('❌ Erreur lors de la rédaction:', error)
    
    // Messages d'erreur plus spécifiques
    let errorMessage = error.message || 'Erreur inconnue'
    let statusCode = 500
    
    if (error.message?.includes('The string did not match the expected pattern')) {
      errorMessage = 'Format audio non supporté ou fichier corrompu'
      statusCode = 400
    } else if (error.message?.includes('Request Entity Too Large')) {
      errorMessage = 'Fichier audio trop volumineux'
      statusCode = 413
    } else if (error.message?.includes('timeout') || error.message?.includes('AbortError')) {
      errorMessage = 'Timeout: le fichier audio est trop long à traiter'
      statusCode = 408
    } else if (error.message?.includes('429') || error.message?.includes('quota')) {
      errorMessage = 'Quota API dépassé, réessayez plus tard'
      statusCode = 429
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage
      },
      { status: statusCode }
    )
  }
}