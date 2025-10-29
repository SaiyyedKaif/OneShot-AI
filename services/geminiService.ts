import { GoogleGenAI, Chat, GenerateContentResponse, LiveServerMessage, Modality, Blob } from "@google/genai";
import { UserProfile } from "../types";

// --- Audio Utility Functions (as per Gemini Docs) ---

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Gemini Service ---

let ai: GoogleGenAI | null = null;
const getAI = () => {
    if (!ai) {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable not set");
        }
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
};


let chat: Chat | null = null;
let currentProfileId: string | null = null; // To track if the profile has changed

const getChat = (profile: UserProfile | null) => {
    const profileId = profile ? JSON.stringify(profile) : 'default';

    if (!chat || currentProfileId !== profileId) {
        const aiInstance = getAI();
        let systemInstruction = `You are OneShot, a compassionate and empathetic AI Therapist. Your task is to analyze mood logs. The user will provide a text prompt with their mood history. Respond with gentle, therapeutic observations and insights based on the data provided. Keep responses concise and focused.`;

        if (profile) {
            systemInstruction += `\n\n## User Profile Information:\n
- **Name**: You are speaking with ${profile.name}.
- **Primary Reasons for Seeking Support**: ${profile.reasons.join(', ')}.
- **Stated Goals**: "${profile.goals}".`;
        }

        chat = aiInstance.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
            },
        });
        currentProfileId = profileId;
    }
    return chat;
}

export const sendMessageToAI = async (message: string, profile: UserProfile | null): Promise<GenerateContentResponse> => {
    const chatInstance = getChat(profile);
    const response = await chatInstance.sendMessage({ message });
    return response;
};

// --- General Purpose Chatbot Service ---
let generalChat: Chat | null = null;

const getGeneralChat = () => {
    if (!generalChat) {
        const aiInstance = getAI();
        generalChat = aiInstance.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: 'You are a helpful and friendly AI assistant for the OneShot AI Therapist app. Answer general questions concisely.',
            },
        });
    }
    return generalChat;
}

export const sendGeneralChatMessage = async (message: string): Promise<GenerateContentResponse> => {
    const chatInstance = getGeneralChat();
    const response = await chatInstance.sendMessage({ message });
    return response;
};


// --- Text to Speech Service ---
let ttsAudioContext: AudioContext | null = null;
const getTtsAudioContext = () => {
    if (!ttsAudioContext || ttsAudioContext.state === 'closed') {
        ttsAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return ttsAudioContext;
}

export const textToSpeech = async (text: string): Promise<void> => {
    try {
        const aiInstance = getAI();
        const response = await aiInstance.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' }, // A calm, suitable voice
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioContext = getTtsAudioContext();
            const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                audioContext,
                24000,
                1,
            );
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();

            return new Promise(resolve => {
                source.onended = () => resolve();
            });
        }
    } catch (error) {
        console.error("Text to Speech failed:", error);
        throw error;
    }
};

// --- Live Conversation Service ---
export class LiveConversationService {
    private inputAudioContext: AudioContext;
    private outputAudioContext: AudioContext;
    private sessionPromise: Promise<any> | null = null;
    private mediaStream: MediaStream | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
    private nextStartTime = 0;
    private sources = new Set<AudioBufferSourceNode>();

    constructor(
        private profile: UserProfile | null,
        private onInputTranscription: (text: string) => void,
        private onOutputTranscription: (text: string) => void,
        private onTurnComplete: (input: string, output: string) => void,
        private onError: (error: any) => void
    ) {
        this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    private createBlob(data: Float32Array): Blob {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = data[i] * 32768;
        }
        return {
            data: encode(new Uint8Array(int16.buffer)),
            mimeType: 'audio/pcm;rate=16000',
        };
    }
    
    async start() {
        if (this.sessionPromise) return;

        try {
            const aiInstance = getAI();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;

            let currentInputTranscription = '';
            let currentOutputTranscription = '';

            const profile = this.profile;
            let systemInstruction = `You are OneShot, a compassionate and empathetic AI Therapist conducting a real-time voice session. Your tone is calm, non-judgmental, and supportive. Your goal is to provide accessible emotional support.
- Listen carefully to the user's live audio transcription.
- Respond with gentle emotional mirroring and empathy.
- Keep your responses concise to maintain a conversational flow.
- You can be interrupted.`;

            if (profile) {
                systemInstruction += `\n\n## User Profile Information:\n
- **Name**: You are speaking with ${profile.name}.
- **Primary Reasons for Seeking Support**: ${profile.reasons.join(', ')}.
- **Stated Goals**: "${profile.goals}".
\nYou MUST use this information to personalize your conversation. Refer to the user by their name, ${profile.name}, where appropriate.`;
            }

            this.sessionPromise = aiInstance.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        if (!this.sessionPromise) return;

                        this.mediaStreamSource = this.inputAudioContext.createMediaStreamSource(stream);
                        this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
                        
                        this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = this.createBlob(inputData);
                            this.sessionPromise?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        this.mediaStreamSource.connect(this.scriptProcessor);
                        this.scriptProcessor.connect(this.inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            currentInputTranscription += text;
                            this.onInputTranscription(currentInputTranscription);
                        }
                        if (message.serverContent?.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            currentOutputTranscription += text;
                            this.onOutputTranscription(currentOutputTranscription);
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            this.playAudioChunk(base64Audio);
                        }

                        if (message.serverContent?.interrupted) {
                            this.stopAllPlayback();
                        }

                        if (message.serverContent?.turnComplete) {
                            this.onTurnComplete(currentInputTranscription, currentOutputTranscription);
                            currentInputTranscription = '';
                            currentOutputTranscription = '';
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("Live session error:", e);
                        this.onError(e);
                        this.stop();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log("Live session closed.");
                        this.stop();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction,
                },
            });
        } catch (error) {
            console.error("Failed to start live conversation:", error);
            this.onError(error);
        }
    }

    private async playAudioChunk(base64Audio: string) {
        this.nextStartTime = Math.max(
            this.nextStartTime,
            this.outputAudioContext.currentTime,
        );
        const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            this.outputAudioContext,
            24000,
            1,
        );
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);
        source.addEventListener('ended', () => {
            this.sources.delete(source);
        });

        source.start(this.nextStartTime);
        this.nextStartTime = this.nextStartTime + audioBuffer.duration;
        this.sources.add(source);
    }

    private stopAllPlayback() {
        for (const source of this.sources.values()) {
            try {
                source.stop();
            } catch (e) {
                // Ignore errors if source already stopped
            }
            this.sources.delete(source);
        }
        this.nextStartTime = 0;
    }

    async stop() {
        if (this.sessionPromise) {
            this.sessionPromise.then(session => session.close()).catch(e => console.error("Error closing session:", e));
            this.sessionPromise = null;
        }

        this.stopAllPlayback();

        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor.onaudioprocess = null;
            this.scriptProcessor = null;
        }
        if (this.mediaStreamSource) {
            this.mediaStreamSource.disconnect();
            this.mediaStreamSource = null;
        }
        
        this.mediaStream?.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
        
        if (this.inputAudioContext.state !== 'closed') {
           this.inputAudioContext.close().catch(e => console.error("Error closing input context:", e));
        }
        if (this.outputAudioContext.state !== 'closed') {
            this.outputAudioContext.close().catch(e => console.error("Error closing output context:", e));
         }

        // Re-initialize for next session
        this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
}