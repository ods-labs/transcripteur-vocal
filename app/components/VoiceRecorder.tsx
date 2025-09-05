'use client'

import { useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import styles from '../page.module.css'

interface CostData {
  totalEUR: number
  totalUSD: number
  inputTokens: number
  outputTokens: number
  model: string
}

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [status, setStatus] = useState('Cliquez pour commencer l\'enregistrement')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [retryError, setRetryError] = useState('')
  const [costData, setCostData] = useState<CostData | null>(null)
  const [showModelSelection, setShowModelSelection] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [timer, setTimer] = useState('00:00')
  const [showRetryButton, setShowRetryButton] = useState(false)
  const [canDownload, setCanDownload] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordedAudioRef = useRef<Blob | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastModelRef = useRef<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedTimeRef.current
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0')
      const seconds = (elapsed % 60).toString().padStart(2, '0')
      setTimer(`${minutes}:${seconds}`)
    }, 1000)
  }, [])

  const pauseTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
      pausedTimeRef.current = Date.now() - startTimeRef.current
    }
  }, [])

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    pausedTimeRef.current = 0
    setTimer('00:00')
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        
        if (audioBlob.size === 0) {
          setError('Enregistrement vide')
          setStatus('Cliquez pour commencer l\'enregistrement')
          return
        }

        recordedAudioRef.current = audioBlob
        setShowModelSelection(true)
        setStatus('Enregistrement terminé - Choisissez le modèle')
      }

      mediaRecorderRef.current.start(100)
      setIsRecording(true)
      setStatus('Enregistrement en cours... Cliquez pour arrêter')
      setError('')
      setRetryError('')
      setShowRetryButton(false)
      startTimer()

    } catch (error) {
      console.error('Erreur d\'accès au microphone:', error)
      setError('Impossible d\'accéder au microphone. Vérifiez les permissions.')
    }
  }, [startTimer])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      stopTimer()
      
      // Arrêter le stream
      mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop())
    }
  }, [isRecording, stopTimer])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      setStatus('Enregistrement en pause - Cliquez pour reprendre')
      pauseTimer()
    }
  }, [isRecording, isPaused, pauseTimer])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      setStatus('Enregistrement en cours... Cliquez pour arrêter')
      startTimer()
    }
  }, [isRecording, isPaused, startTimer])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      if (isPaused) {
        resumeRecording()
      } else {
        pauseRecording()
      }
    } else {
      startRecording()
    }
  }, [isRecording, isPaused, startRecording, pauseRecording, resumeRecording])

  const finalStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
      setCanDownload(true)
      stopTimer()
      
      // Arrêter le stream
      mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop())
    }
  }, [isRecording, isPaused, stopTimer])

  const downloadRecording = useCallback(() => {
    if (recordedAudioRef.current) {
      const url = URL.createObjectURL(recordedAudioRef.current)
      const a = document.createElement('a')
      a.href = url
      a.download = `memo-vocal-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }, [])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Vérifier le type de fichier
      const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/aac']
      if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|webm|ogg|m4a|aac)$/i)) {
        setError('Type de fichier non supporté. Utilisez WAV, MP3, WEBM, OGG, M4A ou AAC.')
        return
      }

      recordedAudioRef.current = file
      setShowModelSelection(true)
      setStatus('Fichier uploadé - Choisissez le modèle')
      setCanDownload(false)
      setError('')
      setRetryError('')
    }
    // Reset du input pour permettre de re-upload le même fichier
    if (event.target) {
      event.target.value = ''
    }
  }, [])

  const processWithModel = useCallback(async (modelType: string) => {
    if (!recordedAudioRef.current) return

    lastModelRef.current = modelType
    setShowModelSelection(false)
    setIsProcessing(true)
    setStatus('Transcription en cours...')
    setError('')
    setRetryError('')
    setShowRetryButton(false)

    try {
      const formData = new FormData()
      formData.append('audio', recordedAudioRef.current, 'recording.webm')
      formData.append('model', modelType)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        setTranscript(result.content)
        if (result.cost) {
          setCostData(result.cost)
        }
        if (result.fallback) {
          setRetryError(`ℹ️ ${result.fallback}`)
          setShowRetryButton(false) // Pas de bouton retry pour fallback automatique
        }
        setStatus('Transcription terminée')
      } else {
        throw new Error(result.error || 'Erreur de transcription')
      }

    } catch (error: any) {
      console.error('Erreur:', error)
      
      const isRetryableError = error.message.includes('503') || 
                             error.message.includes('overloaded') ||
                             error.message.includes('500') ||
                             error.message.includes('429')
      
      if (isRetryableError) {
        setRetryError(`Le modèle ${modelType === 'flash' ? 'Gemini Flash' : 'Gemini Pro'} est surchargé. Vous pouvez ressayer dans quelques instants.`)
        setShowRetryButton(true)
        // Effacer l'ancienne transcription pour éviter la confusion
        setTranscript('')
        setCostData(null)
      } else {
        setError('Erreur lors de la transcription: ' + error.message)
        // Effacer l'ancienne transcription pour éviter la confusion
        setTranscript('')
        setCostData(null)
      }
    } finally {
      setIsProcessing(false)
      if (!retryError && !error) {
        setStatus('Cliquez pour commencer l\'enregistrement')
      }
    }
  }, [])

  const retryLastRequest = useCallback(async () => {
    if (!recordedAudioRef.current || !lastModelRef.current) return
    
    setShowRetryButton(false)
    await new Promise(resolve => setTimeout(resolve, 2000))
    await processWithModel(lastModelRef.current)
  }, [processWithModel])

  // Détecter si le contenu ressemble à du Markdown
  const isMarkdown = useCallback((text: string) => {
    const markdownIndicators = [
      /^#{1,6}\s+/m,     // Titres
      /\*{1,2}.*\*{1,2}/, // Gras/italique
      /^[-*+]\s+/m,      // Listes
      /^\d+\.\s+/m,      // Listes numérotées
      /```[\s\S]*?```/,  // Code blocks
      /`[^`]+`/,         // Code inline
      /\[.*?\]\(.*?\)/   // Liens
    ]
    return markdownIndicators.some(pattern => pattern.test(text))
  }, [])


  // Copier le markdown brut (pour Notion)
  const copyMarkdown = useCallback(async () => {
    if (!transcript) return
    
    try {
      await navigator.clipboard.writeText(transcript)
    } catch (error) {
      console.error('Erreur de copie markdown:', error)
      setError('Impossible de copier dans le presse-papier')
    }
  }, [transcript])

  // Copier le texte formaté directement depuis la zone d'affichage
  const copyFormatted = useCallback(async () => {
    console.log('🔄 copyFormatted - Début')
    if (!transcript) {
      console.log('❌ Pas de transcript')
      return
    }
    
    try {
      let targetContainer: HTMLElement | null = null
      
      console.log('📝 isMarkdown:', isMarkdown(transcript))
      
      if (isMarkdown(transcript)) {
        // Chercher avec le module CSS
        targetContainer = document.querySelector(`[class*="markdown"]`) as HTMLElement
        console.log('🎯 Recherche [class*="markdown"]:', !!targetContainer)
        if (!targetContainer) {
          // Fallback: chercher directement dans le transcriptBox
          targetContainer = document.querySelector(`[class*="transcriptBox"] [class*="markdown"]`) as HTMLElement
          console.log('🎯 Recherche dans transcriptBox:', !!targetContainer)
        }
      } else {
        targetContainer = document.querySelector(`[class*="plainText"]`) as HTMLElement
        console.log('🎯 Recherche [class*="plainText"]:', !!targetContainer)
      }
      
      if (targetContainer) {
        console.log('✅ Container trouvé:', targetContainer.tagName)
        console.log('📄 Contenu HTML:', targetContainer.innerHTML.substring(0, 100) + '...')
        
        // Sélectionner le contenu de la zone d'affichage
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(targetContainer)
        selection?.removeAllRanges()
        selection?.addRange(range)
        
        console.log('🖱️ Sélection créée, texte sélectionné:', selection?.toString().substring(0, 50) + '...')
        
        // Utiliser execCommand pour copier le formatage riche
        const success = document.execCommand('copy')
        console.log('📋 execCommand result:', success)
        selection?.removeAllRanges()
        
        if (!success) {
          throw new Error('execCommand failed')
        }
        console.log('✅ Copie réussie avec formatage')
      } else {
        console.log('❌ Container non trouvé, fallback vers clipboard.writeText')
        // Fallback si la zone n'est pas trouvée
        await navigator.clipboard.writeText(transcript)
      }
      
    } catch (error) {
      console.error('❌ Erreur de copie formatée:', error)
      // Fallback vers le markdown brut
      try {
        await navigator.clipboard.writeText(transcript)
        console.log('📋 Fallback vers markdown brut réussi')
      } catch (fallbackError) {
        console.error('❌ Fallback échoué aussi:', fallbackError)
        setError('Impossible de copier dans le presse-papier')
      }
    }
  }, [transcript, isMarkdown])

  return (
    <div className={styles.container}>
      <h1>🎙️ VoixLà</h1>

      <div className={styles.recorderSection}>
        <button 
          onClick={toggleRecording}
          className={`${styles.recordButton} ${
            isRecording ? (isPaused ? styles.paused : styles.recording) : 
            isProcessing ? styles.processing : styles.idle
          }`}
        >
          {isRecording ? (isPaused ? '▶️' : '⏸️') : isProcessing ? '⏳' : '🎙️'}
        </button>

        {(isRecording || isPaused) && (
          <button 
            onClick={finalStopRecording}
            className={`${styles.stopButton}`}
          >
            ⏹️ Arrêter
          </button>
        )}

        <div className={`${styles.status} ${
          isRecording ? (isPaused ? styles.paused : styles.recording) : 
          isProcessing ? styles.processing : styles.idle
        }`}>
          {status}
        </div>

        {(isRecording || isPaused) && (
          <div className={styles.timer}>{timer}</div>
        )}

        {canDownload && recordedAudioRef.current && (
          <button 
            onClick={downloadRecording}
            className={styles.downloadButton}
          >
            💾 Télécharger le memo
          </button>
        )}
      </div>

      <div className={styles.uploadSection}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a,.aac"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className={styles.uploadButton}
        >
          📤 Uploader un fichier audio
        </button>
      </div>

      {showModelSelection && (
        <div className={styles.modelSelection}>
          <h4>🤖 Choisissez le modèle de transcription :</h4>
          <div className={styles.modelButtons}>
            <button 
              onClick={() => processWithModel('flash')}
              className={`${styles.modelButton} ${styles.flash}`}
            >
              ⚡ Rapide
              <div className={styles.modelInfo}>Gemini Flash - Réponse quasi instantanée</div>
            </button>
            <button 
              onClick={() => processWithModel('pro')}
              className={`${styles.modelButton} ${styles.pro}`}
            >
              🏆 Précis
              <div className={styles.modelInfo}>Gemini Pro - Lent mais qualité maximale</div>
            </button>
          </div>
        </div>
      )}

      {/* Messages d'erreur remontés pour être immédiatement visibles */}
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {retryError && (
        <div className={styles.errorRetry}>
          ⚠️ {retryError}
          <br />
          {showRetryButton && (
            <button onClick={retryLastRequest} className={styles.retryButton}>
              🔄 Ressayer la transcription
            </button>
          )}
        </div>
      )}

      <div className={styles.transcriptSection}>
        <h3>Transcription :</h3>
        <div className={`${styles.transcriptBox} ${transcript ? styles.hasContent : ''}`}>
          {isProcessing ? (
            <div className={styles.loading}>
              <div className={styles.loader}></div>
              Transcription en cours...
            </div>
          ) : transcript ? (
            isMarkdown(transcript) ? (
              <div className={styles.markdown}>
                <ReactMarkdown>
                  {transcript}
                </ReactMarkdown>
              </div>
            ) : (
              <div className={styles.plainText}>
                {transcript.split('\n').map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )
          ) : (
            <div className={styles.examples}>
              <div className={styles.exampleTitle}>💡 Exemples d'utilisation :</div>
              
              <div className={styles.exampleItem}>
                <strong>📧 Email professionnel :</strong><br />
                "Rédige un email pour mon client, ton professionnel, pour reporter notre réunion de demain..."
              </div>
              
              <div className={styles.exampleItem}>
                <strong>📝 Article de blog :</strong><br />
                "Écris un article sur les tendances IA 2025, style décontracté, 500 mots environ..."
              </div>
              
              <div className={styles.exampleItem}>
                <strong>💬 Message Slack :</strong><br />
                "Résume les points clés de notre réunion d'équipe, format court pour Slack..."
              </div>
              
              <div className={styles.exampleItem}>
                <strong>📋 Rapport :</strong><br />
                "Transforme mes notes en rapport structuré pour la direction, ton formel..."
              </div>
            </div>
          )}
        </div>
        
        {transcript && (
          <div className={styles.copyButtons}>
            <button onClick={copyMarkdown} className={`${styles.copyButton} ${styles.notion}`}>
              📝 Copier pour Notion (MD)
            </button>
            <button onClick={copyFormatted} className={`${styles.copyButton} ${styles.html}`}>
              ✨ Copier pour Email/Word/Slack
            </button>
          </div>
        )}

        {costData && (
          <div className={styles.costInfo}>
            💰 Coût: {costData.totalEUR.toFixed(6)}€ ({costData.model})
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          🧪 <strong>VoixLà</strong> est une expérimentation en cours... mais on peut déjà se dire que c'est la meilleure app de la <strong>DicTech</strong> ! 🚀
        </div>
      </footer>
    </div>
  )
}