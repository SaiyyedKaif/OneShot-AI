
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  sources?: GroundingSource[];
}

export interface GroundingSource {
    uri: string;
    title: string;
}

export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface UserProfile {
    name: string;
    demographics: {
        age?: string;
        gender?: string;
    };
    reasons: string[];
    goals: string;
}

export interface MoodLog {
    date: string; // YYYY-MM-DD
    rating: number; // 1-5
    note?: string;
}

// Fix: Add the missing `Emotion` enum that is used by the `VideoFeed` component.
export enum Emotion {
    Happy = 'Happy',
    Sad = 'Sad',
    Angry = 'Angry',
    Fearful = 'Fearful',
    Disgust = 'Disgust',
    Surprise = 'Surprise',
    Neutral = 'Neutral',
}

export const MoodScale: Record<number, { label: string; emoji: string; color: string; bgColor: string }> = {
    1: { label: 'Very Sad', emoji: '😭', color: '#ef4444', bgColor: '#fee2e2' }, 
    2: { label: 'Sad', emoji: '😢', color: '#60a5fa', bgColor: '#dbeafe' }, 
    3: { label: 'Neutral', emoji: '😐', color: '#9ca3af', bgColor: '#f3f4f6' },
    4: { label: 'Happy', emoji: '😊', color: '#4ade80', bgColor: '#dcfce7' },
    5: { label: 'Very Happy', emoji: '😁', color: '#facc15', bgColor: '#fef9c3' },
};