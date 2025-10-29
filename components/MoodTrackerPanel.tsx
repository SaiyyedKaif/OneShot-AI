import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MoodLog, MoodScale } from '../types';
import { AnalyzeIcon } from './Icons';

interface MoodTrackerPanelProps {
    moodLogs: Record<string, MoodLog>;
    onLogMood: (log: MoodLog) => void;
    onAskAI: () => void;
}

const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length && payload[0].payload.rating > 0) {
      const rating = payload[0].payload.rating;
      const moodInfo = MoodScale[rating];
      return (
        <div className="p-2 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold">{`Date: ${label}`}</p>
          <p style={{ color: moodInfo.color }}>{`Mood: ${moodInfo.label}`}</p>
          {payload[0].payload.note && <p className="text-xs italic text-gray-600 mt-1">{`Note: ${payload[0].payload.note}`}</p>}
        </div>
      );
    }
    return null;
  };

const MoodTrackerPanel: React.FC<MoodTrackerPanelProps> = ({ moodLogs, onLogMood, onAskAI }) => {
    const todayStr = getTodayDateString();
    const todayLog = moodLogs[todayStr];

    const [selectedMood, setSelectedMood] = useState<number | null>(null);
    const [note, setNote] = useState('');

    const handleLogMood = () => {
        if (selectedMood) {
            onLogMood({
                date: todayStr,
                rating: selectedMood,
                note: note.trim(),
            });
            setSelectedMood(null);
            setNote('');
        }
    };

    const chartData = useMemo(() => {
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const log = moodLogs[dateStr];
            data.push({
                name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                rating: log ? log.rating : 0,
                note: log?.note,
            });
        }
        return data;
    }, [moodLogs]);

    return (
        <div className="flex-shrink-0 p-6 bg-white/30 backdrop-blur-md rounded-2xl shadow-lg border border-white/30">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-700">Mood Tracker</h3>
                <button 
                    onClick={onAskAI}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-full hover:bg-indigo-600 transition-colors shadow"
                    title="Ask AI to analyze your recent mood patterns"
                >
                    <AnalyzeIcon className="w-4 h-4" />
                    <span>Analyze with AI</span>
                </button>
            </div>

            {todayLog ? (
                <div className={`p-4 rounded-lg`} style={{backgroundColor: MoodScale[todayLog.rating].bgColor}}>
                    <p className="font-semibold text-gray-800">Today's Mood:</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl">{MoodScale[todayLog.rating].emoji}</span>
                        <span className="font-bold" style={{color: MoodScale[todayLog.rating].color}}>{MoodScale[todayLog.rating].label}</span>
                    </div>
                    {todayLog.note && <p className="text-sm text-gray-600 mt-2 italic">Note: "{todayLog.note}"</p>}
                </div>
            ) : (
                <div>
                    <p className="font-semibold text-gray-700 mb-2">How are you feeling today?</p>
                    <div className="flex justify-around items-center mb-3">
                        {Object.entries(MoodScale).map(([rating, { emoji, label }]) => (
                            <button
                                key={rating}
                                onClick={() => setSelectedMood(Number(rating))}
                                className={`p-2 rounded-full text-3xl transition-transform transform hover:scale-125 ${selectedMood === Number(rating) ? 'bg-indigo-200 scale-125' : ''}`}
                                title={label}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add an optional note..."
                        className="w-full text-sm p-2 rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        rows={2}
                    />
                    <button
                        onClick={handleLogMood}
                        disabled={!selectedMood}
                        className="w-full mt-2 px-4 py-2 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-gray-400"
                    >
                        Log Mood
                    </button>
                </div>
            )}
            
            <div className="mt-6 h-48">
                 <h4 className="font-semibold text-gray-700 text-sm mb-2">Last 7 Days</h4>
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                        <XAxis dataKey="name" stroke="#4b5563" fontSize={12} />
                        <YAxis domain={[0, 5]} tick={false} stroke="#4b5563" />
                        <Tooltip content={<CustomBarTooltip />} cursor={{fill: 'rgba(139, 92, 246, 0.1)'}} />
                        <Bar dataKey="rating">
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.rating > 0 ? MoodScale[entry.rating].color : 'transparent'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default MoodTrackerPanel;