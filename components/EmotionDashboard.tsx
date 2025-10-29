import React from 'react';
import { MoodLog } from '../types';
import MoodTrackerPanel from './MoodTrackerPanel';

interface EmotionDashboardProps {
    currentIntervention: string;
    moodLogs: Record<string, MoodLog>;
    onLogMood: (log: MoodLog) => void;
    onAskAboutMoodPatterns: () => void;
}

const EmotionDashboard: React.FC<EmotionDashboardProps> = ({ 
    currentIntervention, 
    moodLogs, 
    onLogMood, 
    onAskAboutMoodPatterns 
}) => {

    return (
        <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
            
            <MoodTrackerPanel 
                moodLogs={moodLogs}
                onLogMood={onLogMood}
                onAskAI={onAskAboutMoodPatterns}
            />

            <div className="flex-shrink-0 p-6 bg-white/30 backdrop-blur-md rounded-2xl shadow-lg border border-white/30">
                <h3 className="text-xl font-bold text-gray-700 mb-3">Therapeutic Suggestion</h3>
                <div className="p-4 bg-indigo-100 rounded-lg">
                    <p className="text-indigo-800 italic">
                        {currentIntervention || "I'm here to listen. Feel free to share what's on your mind."}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default EmotionDashboard;