
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decode, decodeAudioData, createBlob } from '../utils/audio';

interface Callbacks {
  onTranscriptUpdate: (text: string, isFinal: boolean, speaker: 'Victime' | 'IA') => void;
  onTurnComplete: (speaker: 'Victime' | 'IA') => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any | null = null;
  private sessionPromise: Promise<any> | null = null;
  private mediaStream: MediaStream | null = null;
  
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private outputSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  
  private currentInputTranscription = '';
  private currentOutputTranscription = '';

  constructor() {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async startSession(callbacks: Callbacks): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `Vous êtes une intelligence artificielle d'assistance aux victimes, conçue pour recueillir les dépositions dans les cas de violences conjugales. Votre rôle est d'agir comme un enquêteur professionnel, calme et empathique. Votre objectif principal est de constituer un rapport clair et précis pour les forces de l'ordre.

Votre démarche doit être structurée :
1.  **Introduction et Mise en Confiance :** Commencez par vous présenter et rassurer la victime. Expliquez que la conversation est confidentielle et a pour but de l'aider.
2.  **Récit Libre :** Invitez la victime à raconter ce qui s'est passé avec ses propres mots.
3.  **Questions de Précision :** Une fois le récit initial terminé, posez des questions méthodiques pour obtenir les détails essentiels :
    *   **Identité :** "Pouvez-vous me donner le nom de la personne impliquée ?"
    *   **Nature des faits :** "Pouvez-vous décrire précisément les actes de violence (physique, verbale, psychologique) ?"
    *   **Date et Heure :** "Quand exactement cela s'est-il produit ? Le jour et l'heure si possible."
    *   **Lieu :** "Où les faits ont-ils eu lieu ? Soyez aussi précise que possible."
    *   **Témoins :** "Y avait-il d'autres personnes présentes ? Si oui, qui ?"
    *   **Antécédents :** "Est-ce la première fois que cela arrive ?"
    *   **Preuves :** "Existe-t-il des preuves (photos, messages, certificats médicaux) ?"
4.  **Conclusion :** Remerciez la victime pour son courage et expliquez que sa déposition va être formalisée dans un rapport.

Restez calme, ne portez aucun jugement, et guidez la conversation pour qu'elle soit la plus complète possible. Répondez exclusivement en français.`,
        },
        callbacks: {
          onopen: () => {
            this.sourceNode = this.inputAudioContext!.createMediaStreamSource(this.mediaStream!);
            this.scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
            
            this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              this.sessionPromise?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            this.sourceNode.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.inputAudioContext!.destination);
          },
          onmessage: async (message: LiveServerMessage) => this.handleServerMessage(message, callbacks),
          onerror: (e: ErrorEvent) => callbacks.onError(`Erreur de connexion : ${e.message}`),
          onclose: (e: CloseEvent) => {
            callbacks.onClose();
            this.cleanup();
          },
        },
      });
      
      this.session = await this.sessionPromise;

    } catch (error) {
      if (error instanceof Error) {
        callbacks.onError(`Impossible de démarrer la session : ${error.message}`);
      } else {
        callbacks.onError('Une erreur inconnue est survenue lors du démarrage de la session.');
      }
      this.cleanup();
    }
  }

  private async handleServerMessage(message: LiveServerMessage, callbacks: Callbacks) {
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      this.currentInputTranscription += text;
      callbacks.onTranscriptUpdate(this.currentInputTranscription, false, 'Victime');
    }

    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      this.currentOutputTranscription += text;
      callbacks.onTranscriptUpdate(this.currentOutputTranscription, false, 'IA');
    }

    if (message.serverContent?.turnComplete) {
        if(this.currentInputTranscription) {
            callbacks.onTurnComplete('Victime');
            this.currentInputTranscription = '';
        }
        if(this.currentOutputTranscription) {
            callbacks.onTurnComplete('IA');
            this.currentOutputTranscription = '';
        }
    }

    if (message.serverContent?.interrupted) {
      for (const source of this.outputSources.values()) {
        source.stop();
        this.outputSources.delete(source);
      }
      this.nextStartTime = 0;
    }
    
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      const audioBuffer = await decodeAudioData(decode(base64Audio), this.outputAudioContext, 24000, 1);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);

      source.addEventListener('ended', () => {
        this.outputSources.delete(source);
      });

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.outputSources.add(source);
    }
  }

  stopSession() {
    this.session?.close();
    this.cleanup();
  }

  private cleanup() {
    this.scriptProcessor?.disconnect();
    this.scriptProcessor = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
    
    this.inputAudioContext?.close();
    this.inputAudioContext = null;
    this.outputAudioContext?.close();
    this.outputAudioContext = null;

    this.outputSources.forEach(s => s.stop());
    this.outputSources.clear();

    this.session = null;
    this.sessionPromise = null;
  }
}
