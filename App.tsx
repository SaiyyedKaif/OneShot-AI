import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConversationView from './components/ConversationView';
import EmotionDashboard from './components/EmotionDashboard';
import OnboardingFlow from './components/OnboardingFlow';
import ChatWindow from './components/ChatWindow';
import { ChatIcon, CloseIcon } from './components/Icons';
import { GoogleUser, MoodLog, MoodScale, UserProfile, GroundingSource, Message } from './types';
import { sendMessageToAI, sendGeneralChatMessage, LiveConversationService } from './services/geminiService';

interface Turn {
    id: number;
    user: string;
    ai: string;
    sources?: GroundingSource[];
}

// --- Sub-Components defined within App.tsx to avoid creating new files ---

const Header: React.FC<{ user: GoogleUser; onSignOut: () => void }> = ({ user, onSignOut }) => (
    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <img src={user.picture} alt="User" className="w-10 h-10 rounded-full border-2 border-white shadow-md" />
            <div>
                <p className="font-bold text-gray-800">{user.name}</p>
                <p className="text-xs text-gray-600">{user.email}</p>
            </div>
        </div>
        <button
            onClick={onSignOut}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white/70 backdrop-blur-sm rounded-full hover:bg-white/90 border border-gray-200 transition-colors shadow-sm"
        >
            Sign Out
        </button>
    </div>
);

const LoginScreen: React.FC = () => (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-sky-100 via-purple-100 to-white p-4">
        <div className="text-center p-8 bg-white/50 backdrop-blur-lg rounded-2xl shadow-xl">
            <h1 className="text-4xl font-bold text-gray-800">Welcome to OneShot AI</h1>
            <p className="mt-4 text-gray-600 max-w-md">Your personal emotional wellness assistant. Sign in to begin your journey towards better emotional health.</p>
            <div id="google-signin-button" className="mt-8 flex justify-center"></div>
        </div>
    </div>
);

const LoadingScreen: React.FC<{text: string}> = ({ text }) => (
     <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
             <div className="w-12 h-12 border-4 border-t-blue-500 border-gray-200 rounded-full animate-spin"></div>
             <p className="mt-4 text-gray-600">{text}</p>
        </div>
    </div>
);


const App: React.FC = () => {
    const [authUser, setAuthUser] = useState<GoogleUser | null>(null);
    const [isAuthInitialized, setIsAuthInitialized] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [conversationState, setConversationState] = useState<'idle' | 'active' | 'error'>('idle');
    const [transcript, setTranscript] = useState<Turn[]>([]);
    const [currentUserText, setCurrentUserText] = useState('');
    const [currentAiText, setCurrentAiText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentIntervention, setCurrentIntervention] = useState('');
    const [moodLogs, setMoodLogs] = useState<Record<string, MoodLog>>({});
    
    // Chatbot state
    const [isChatbotOpen, setIsChatbotOpen] = useState(false);
    const [chatbotMessages, setChatbotMessages] = useState<Message[]>([
        { id: 'initial-chatbot', text: "Hello! As your AI assistant, I can help with general questions. How can I help you today?", sender: 'ai' }
    ]);
    const [isChatbotLoading, setIsChatbotLoading] = useState(false);

    const liveServiceRef = useRef<LiveConversationService | null>(null);
    const turnCounterRef = useRef(0);

    // --- Authentication ---
    const handleCredentialResponse = useCallback((response: any) => {
        try {
            // NOTE: In a production app, you'd send this to a backend for verification.
            // Here, we decode it on the client for simplicity.
            const decodedToken = JSON.parse(atob(response.credential.split('.')[1]));
            const user: GoogleUser = {
                id: decodedToken.sub,
                name: decodedToken.name,
                email: decodedToken.email,
                picture: decodedToken.picture,
            };
            setAuthUser(user);
        } catch (error) {
            console.error("Failed to decode credential response:", error);
        }
    }, []);

    useEffect(() => {
        const checkGoogle = () => {
            if ((window as any).google?.accounts?.id) {
                (window as any).google.accounts.id.initialize({
                    // ====================================================================================
                    // IMPORTANT: Email Integration Step 1: Google Sign-In
                    //
                    // To enable Google Sign-In, you must replace the placeholder value below with your
                    // own Google Cloud OAuth 2.0 Client ID.
                    //
                    // How to get your Client ID:
                    // 1. Go to the Google Cloud Console: https://console.cloud.google.com/apis/credentials
                    // 2. Create a new project or select an existing one.
                    // 3. Go to "Credentials", click "+ CREATE CREDENTIALS", and choose "OAuth client ID".
                    // 4. Select "Web application" as the application type.
                    // 5. Under "Authorized JavaScript origins", add the URL where you are hosting this app.
                    // 6. Click "Create", and copy the "Client ID" provided.
                    // 7. Paste your Client ID in place of the placeholder string below.
                    // ====================================================================================
                    client_id: "686574455083-jivv1v2etmj38s5qh5bdq5hm7dhepldc.apps.googleusercontent.com", // <-- PASTE YOUR CLIENT ID HERE
                    callback: handleCredentialResponse,
                });
                setIsAuthInitialized(true);
            } else {
                setTimeout(checkGoogle, 100); // Retry after 100ms
            }
        };
        checkGoogle();
    }, [handleCredentialResponse]);

    useEffect(() => {
        if (isAuthInitialized && !authUser) {
             (window as any).google.accounts.id.renderButton(
                document.getElementById('google-signin-button'),
                { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with' }
            );
        }
    }, [isAuthInitialized, authUser]);

    const handleSignOut = () => {
        setAuthUser(null);
        setUserProfile(null);
        setTranscript([]);
        setMoodLogs({});
        setCurrentIntervention('');
        // This prevents the One-Tap prompt from showing after manual sign-out.
        (window as any).google?.accounts?.id?.disableAutoSelect();
    };

    // --- Data Persistence ---
    useEffect(() => {
        if (!authUser) return;
        try {
            const savedProfile = localStorage.getItem(`userProfile_${authUser.id}`);
            if (savedProfile) {
                setUserProfile(JSON.parse(savedProfile));
            }
            const savedLogs = localStorage.getItem(`moodLogs_${authUser.id}`);
            if (savedLogs) {
                setMoodLogs(JSON.parse(savedLogs));
            }
        } catch (error) {
            console.error("Could not load data from local storage:", error);
        }
    }, [authUser]);
    
    const handleSaveProfile = useCallback((profile: UserProfile) => {
        if (!authUser) return;
        try {
            localStorage.setItem(`userProfile_${authUser.id}`, JSON.stringify(profile));
            setUserProfile(profile);
        } catch (error) {
            console.error("Could not save user profile:", error);
        }
    }, [authUser]);

    const handleLogMood = useCallback((log: MoodLog) => {
        if (!authUser) return;
        setMoodLogs(prevLogs => {
            const newLogs = { ...prevLogs, [log.date]: log };
            try {
                localStorage.setItem(`moodLogs_${authUser.id}`, JSON.stringify(newLogs));
            } catch (error) {
                console.error("Could not save mood logs to local storage:", error);
            }
            return newLogs;
        });
    }, [authUser]);

    // --- Core App Logic ---
    const handleSendTextMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        turnCounterRef.current += 1;
        const newUserTurn: Turn = { id: turnCounterRef.current, user: text, ai: '' };
        setTranscript(prev => [...prev, newUserTurn]);
        setIsLoading(true);

        try {
            const response = await sendMessageToAI(text, userProfile);
            const aiText = response.text;
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            const sources: GroundingSource[] = groundingChunks
                ?.map((chunk: any) => ({
                    uri: chunk.web?.uri || '',
                    title: chunk.web?.title || '',
                }))
                .filter((source: GroundingSource) => source.uri) ?? [];

            setTranscript(prev => prev.map(t => t.id === newUserTurn.id ? { ...t, ai: aiText, sources } : t));
            setCurrentIntervention(aiText.split('\n')[0]);

        } catch (error) {
            console.error("Failed to get response from AI:", error);
            const errorMessage = "Sorry, I'm having trouble connecting. Please try again later.";
            setTranscript(prev => prev.map(t => t.id === newUserTurn.id ? { ...t, ai: errorMessage } : t));
        } finally {
            setIsLoading(false);
        }
    }, [userProfile]);

    const handleAskAboutMoodPatterns = useCallback(() => {
        const logs: MoodLog[] = Object.values(moodLogs);
        if (logs.length < 2) {
            handleSendTextMessage("I don't have enough mood data to analyze yet. Please log your mood for a few more days.");
            return;
        }
        const recentLogs = logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
        const formattedLogs = recentLogs.map(log => 
            `- ${log.date}: Mood rating of ${log.rating} (${MoodScale[log.rating].label})${log.note ? `, note: "${log.note}"` : ''}`
        ).join('\n');
        const prompt = `Here is my recent mood history:\n${formattedLogs}\n\nBased on this, can you help me identify any potential patterns or insights?`;
        handleSendTextMessage(prompt);
    }, [moodLogs, handleSendTextMessage]);
    
    const handleStartConversation = useCallback(() => {
        if (!userProfile) return;
        liveServiceRef.current = new LiveConversationService(userProfile,
            (userText) => setCurrentUserText(userText),
            (aiText) => setCurrentAiText(aiText),
            (finalUserText, finalAiText) => {
                turnCounterRef.current += 1;
                setTranscript(prev => [...prev, { id: turnCounterRef.current, user: finalUserText, ai: finalAiText }]);
                setCurrentUserText('');
                setCurrentAiText('');
                if (finalAiText) setCurrentIntervention(finalAiText.split('\n')[0]);
            },
            (error) => {
                console.error('Conversation error:', error);
                setConversationState('error');
            }
        );
        liveServiceRef.current.start();
        setConversationState('active');
    }, [userProfile]);

    const handleStopConversation = useCallback(() => {
        liveServiceRef.current?.stop();
        liveServiceRef.current = null;
        setConversationState('idle');
        setCurrentUserText('');
        setCurrentAiText('');
    }, []);

    const handleSendEmailReport = useCallback(() => {
        if (!authUser || transcript.length === 0) return;

        const subject = `Your AI Therapy Session Report - ${new Date().toLocaleDateString()}`;
        
        let body = `Hello ${authUser.name},\n\nHere is the transcript of your recent session with OneShot AI.\n\n`;
        body += "========================================\n";
        body += "  CONVERSATION TRANSCRIPT\n";
        body += "========================================\n\n";

        transcript.forEach(turn => {
            if(turn.user) body += `You: ${turn.user}\n\n`;
            if(turn.ai) body += `OneShot: ${turn.ai}\n\n`;
        });
        
        body += "\nWe hope this is helpful for your reflection. Keep up the great work on your wellness journey!\n\nSincerely,\nThe OneShot AI Team";

        const mailtoLink = `mailto:${authUser.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    }, [authUser, transcript]);

    const handleSendChatbotMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const newUserMessage: Message = { id: Date.now().toString(), text, sender: 'user' };
        setChatbotMessages(prev => [...prev, newUserMessage]);
        setIsChatbotLoading(true);

        try {
            const response = await sendGeneralChatMessage(text);
            const aiText = response.text;
            const aiMessage: Message = { id: Date.now().toString() + '-ai', text: aiText, sender: 'ai' };
            setChatbotMessages(prev => [...prev, aiMessage]);

        } catch (error) {
            console.error("Failed to get response from chatbot AI:", error);
            const errorMessage: Message = { id: Date.now().toString() + '-error', text: "Sorry, I'm having trouble connecting right now.", sender: 'ai' };
            setChatbotMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsChatbotLoading(false);
        }
    }, []);

    useEffect(() => () => { liveServiceRef.current?.stop() }, []);

    // --- Render Logic ---
    if (!isAuthInitialized) {
        return <LoadingScreen text="Initializing authentication..." />;
    }
    if (!authUser) {
        return <LoginScreen />;
    }
    if (!userProfile) {
        return <OnboardingFlow onComplete={handleSaveProfile} googleUser={authUser} />;
    }
        
    const initialMessage: Turn[] = transcript.length === 0 && !currentUserText && !currentAiText && conversationState === 'idle'
        ? [{ id: 0, user: '', ai: `Hello ${userProfile.name}! I'm OneShot. You can start a voice session or switch to text chat below.` }]
        : [];
    const displayedTranscript = [...initialMessage, ...transcript];

    return (
        <div className="relative min-h-screen w-full bg-gradient-to-br from-sky-100 via-purple-100 to-white p-4 pt-20 lg:p-8 lg:pt-24">
            <Header user={authUser} onSignOut={handleSignOut} />
            <main className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-7 gap-6 h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-8rem)]">
                <div className="lg:col-span-1 xl:col-span-4 h-full min-h-[500px] lg:min-h-0">
                    <ConversationView 
                        transcript={displayedTranscript}
                        currentUserText={currentUserText}
                        currentAiText={currentAiText}
                        conversationState={conversationState}
                        onStart={handleStartConversation}
                        onStop={handleStopConversation}
                        isLoadingAiResponse={isLoading}
                        onSendReport={handleSendEmailReport}
                        onSendTextMessage={handleSendTextMessage}
                    />
                </div>
                <div className="lg:col-span-1 xl:col-span-3 h-full min-h-[400px] lg:min-h-0">
                    <EmotionDashboard 
                        currentIntervention={currentIntervention}
                        moodLogs={moodLogs}
                        onLogMood={handleLogMood}
                        onAskAboutMoodPatterns={handleAskAboutMoodPatterns}
                    />
                </div>
            </main>

            {/* Chatbot Feature */}
            <button
                onClick={() => setIsChatbotOpen(!isChatbotOpen)}
                className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-300 z-50"
                aria-label="Toggle chatbot"
            >
                {isChatbotOpen ? <CloseIcon className="w-6 h-6" /> : <ChatIcon className="w-6 h-6" />}
            </button>

            {isChatbotOpen && (
                <div className="fixed bottom-24 right-6 lg:bottom-28 lg:right-8 w-[90vw] max-w-md h-[70vh] max-h-[600px] z-40 animate-slide-in-right">
                    <div className="h-full flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-gray-200/80">
                         <div className="flex-shrink-0 flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm border-b border-gray-200/80">
                            <h3 className="text-lg font-bold text-gray-800 ml-2">AI Assistant</h3>
                            <button onClick={() => setIsChatbotOpen(false)} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-full" aria-label="Close chatbot">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 bg-gray-100/50 overflow-hidden">
                           <ChatWindow
                                messages={chatbotMessages}
                                onSendMessage={handleSendChatbotMessage}
                                isLoading={isChatbotLoading}
                                isRecording={false}
                                onStartRecording={() => {}}
                                onStopRecording={() => {}}
                                transcription=""
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;