
import React, { useState, useRef, useCallback, useEffect } from 'react';
import jsPDF from 'jspdf';
// FIX: The module augmentation for 'jspdf' was causing a TypeScript error.
// Switched from plugin-based usage (`import 'jspdf-autotable'`) to the recommended
// functional import (`import autoTable from 'jspdf-autotable'`) to resolve the issue
// without needing module augmentation.
import autoTable from 'jspdf-autotable';
import { GeminiLiveService } from './services/geminiLiveService';
import { TranscriptEntry } from './types';
import { MicrophoneIcon, StopIcon, UserIcon, GeminiIcon, DownloadIcon, PlusIcon, UploadCloudIcon } from './components/icons';

const App: React.FC = () => {
  const [sessionState, setSessionState] = useState<'idle' | 'active' | 'finished'>('idle');
  const [status, setStatus] = useState("Cliquez sur le microphone pour commencer votre déposition.");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const caseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);
  
  const onTranscriptUpdate = useCallback((text: string, isFinal: boolean, speaker: 'Victime' | 'IA') => {
    setTranscripts(prev => {
      const lastEntry = prev[prev.length - 1];
      if (lastEntry && !lastEntry.isFinal && lastEntry.speaker === speaker) {
        const updatedEntry = { ...lastEntry, text, isFinal };
        return [...prev.slice(0, -1), updatedEntry];
      } else {
        return [...prev, { id: Date.now(), speaker, text, isFinal }];
      }
    });
  }, []);

  const onTurnComplete = useCallback((speaker: 'Victime' | 'IA') => {
      setTranscripts(prev => prev.map(t => (t.speaker === speaker && !t.isFinal) ? { ...t, isFinal: true } : t));
  }, []);

  const handleStart = async () => {
    if (sessionState === 'active') return;

    caseIdRef.current = `CASE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setTranscripts([]);
    setStatus('Initialisation de la connexion sécurisée...');
    setSessionState('active');
    
    const service = new GeminiLiveService();
    serviceRef.current = service;

    await service.startSession({
      onTranscriptUpdate,
      onTurnComplete,
      onError: (error) => {
        setStatus(`Erreur: ${error}`);
        console.error(error);
        setSessionState('idle');
      },
      onClose: () => {
        setStatus('Déposition terminée. Vous pouvez maintenant générer le rapport.');
        setSessionState('finished');
      },
    });
    
    setSessionState(current => {
        if (current === 'active') {
            setStatus("Je vous écoute. Prenez votre temps pour raconter ce qui s'est passé.");
        }
        return current;
    });
  };

  const handleStop = () => {
    if (sessionState !== 'active' || !serviceRef.current) return;
    serviceRef.current.stopSession();
    setStatus("Fin de la session en cours...");
  };

  const generatePdfReport = () => {
    const doc = new jsPDF();
    const timestamp = new Date();

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT DE DÉPOSITION URGENT', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Numéro de dossier : ${caseIdRef.current}`, 15, 35);
    doc.text(`Date et Heure : ${timestamp.toLocaleString('fr-FR')}`, 15, 40);

    // Warning
    doc.setFontSize(9);
    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text("DOCUMENT CONFIDENTIEL - DESTINÉ AUX FORCES DE L'ORDRE", 105, 50, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Transcript
    const tableBody = transcripts.map(entry => [entry.speaker, entry.text]);
    // FIX: Changed from `doc.autoTable` to `autoTable(doc, ...)` to align with functional usage.
    autoTable(doc, {
      startY: 60,
      head: [['Intervenant', 'Transcription']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { cellPadding: 2, fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
      },
      didDrawPage: (data: any) => {
        // Footer
        doc.setFontSize(8);
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.text(`Page ${data.pageNumber} sur ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    const pdfTimestamp = timestamp.toISOString().replace(/[:.]/g, '-');
    doc.save(`rapport-urgence-${pdfTimestamp}.pdf`);
    setStatus("Rapport PDF téléchargé. Vous pouvez le transmettre aux autorités.");
  };

  const handleSendSimulation = () => {
    setStatus("Transmission du rapport en cours...");
    setTimeout(() => {
        alert("Ceci est une simulation.\n\nDans une application réelle, votre rapport PDF chiffré serait maintenant transmis de manière sécurisée aux services de police compétents.\n\nN'oubliez pas de sauvegarder le fichier PDF qui a été téléchargé.");
        setStatus("Simulation d'envoi terminée. Le rapport a aussi été téléchargé.");
    }, 1500);
    generatePdfReport();
  };

  const handleNewSession = () => {
    setTranscripts([]);
    setStatus("Cliquez sur le microphone pour commencer votre déposition.");
    setSessionState('idle');
    caseIdRef.current = null;
  };

  const TranscriptLine: React.FC<{ entry: TranscriptEntry }> = ({ entry }) => {
    const isUser = entry.speaker === 'Victime';
    const Icon = isUser ? UserIcon : GeminiIcon;
    const speakerName = isUser ? 'Victime' : 'IA (Assistance)';
    const textColor = isUser ? 'text-blue-300' : 'text-teal-300';
    return (
      <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-800">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-700 ${textColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-grow pt-1">
          <p className={`font-bold ${textColor}`}>{speakerName}</p>
          <p className={`mt-1 whitespace-pre-wrap ${entry.isFinal ? 'text-gray-200' : 'text-gray-400 italic'}`}>
            {entry.text}
          </p>
        </div>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-200">
      <header className="p-4 border-b border-gray-700 shadow-lg bg-gray-800/50 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
          Portail de Dépôt de Plainte Sécurisé
        </h1>
      </header>

      <main className="flex-grow p-4 md:p-6 flex flex-col overflow-hidden">
        {sessionState !== 'active' && sessionState !== 'finished' &&
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-4" role="alert">
                <strong className="font-bold">Important : </strong>
                <span className="block sm:inline">Si vous êtes en danger immédiat, appelez le 17. Ce service est destiné à recueillir une déposition, pas à gérer les urgences en temps réel.</span>
            </div>
        }
        <div 
          ref={transcriptContainerRef} 
          className="flex-grow overflow-y-auto space-y-4 pr-2"
        >
          {transcripts.length === 0 && sessionState !== 'active' && (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                <MicrophoneIcon className="w-24 h-24 mb-4"/>
                <p className="text-lg">Votre déposition confidentielle apparaîtra ici.</p>
                <p>Votre conversation sera enregistrée pour créer un rapport destiné aux forces de l'ordre.</p>
            </div>
          )}
          {transcripts.map((entry) => (
            <TranscriptLine key={entry.id} entry={entry} />
          ))}
        </div>
      </main>

      <footer className="p-4 border-t border-gray-700 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto text-center">
            <p className="text-sm text-gray-400 mb-4 h-5">{status}</p>
            <div className="flex justify-center items-center gap-4 h-20">
                {sessionState === 'idle' && (
                    <button
                        onClick={handleStart}
                        aria-label="Commencer la déposition"
                        className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300/50"
                    >
                        <MicrophoneIcon className="w-10 h-10" />
                    </button>
                )}
                {sessionState === 'active' && (
                    <button
                        onClick={handleStop}
                        aria-label="Arrêter la déposition"
                        className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-4 focus:ring-red-300/50 animate-pulse"
                    >
                        <StopIcon className="w-8 h-8" />
                    </button>
                )}
                {sessionState === 'finished' && (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={handleSendSimulation}
                            aria-label="Envoyer le rapport aux autorités (Simulation)"
                            className="px-6 py-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-4 focus:ring-red-300/50 gap-2 font-semibold"
                        >
                            <UploadCloudIcon className="w-6 h-6" />
                            <span>Envoyer aux Autorités (Simulation)</span>
                        </button>
                         <button
                            onClick={generatePdfReport}
                            aria-label="Télécharger le rapport PDF"
                            className="px-6 py-3 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-4 focus:ring-green-300/50 gap-2"
                        >
                            <DownloadIcon className="w-6 h-6" />
                            <span>Télécharger le PDF</span>
                        </button>
                        <button
                            onClick={handleNewSession}
                            aria-label="Commencer une nouvelle déposition"
                            className="px-6 py-3 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-4 focus:ring-gray-400/50 gap-2"
                        >
                            <PlusIcon className="w-6 h-6" />
                        </button>
                    </div>
                )}
            </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
