export interface TranscriptEntry {
  id: number;
  speaker: 'Victime' | 'IA';
  text: string;
  isFinal: boolean;
}