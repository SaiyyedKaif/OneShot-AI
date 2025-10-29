import React, { useState, useRef, useEffect } from 'react';
import { Message, GroundingSource } from '../types';
import { MicIcon, StopIcon, SendIcon, BotIcon, UserIcon, ClearIcon } from './Icons';

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isLoading: boolean;
  transcription: string;
}

const MAX_CHARS = 1000;

const SourceLink: React.FC<{source: GroundingSource}> = ({ source }) => (
    <a 
        href={source.uri} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="block text-xs text-blue-400 hover:text-blue-300 underline truncate transition-colors"
        title={source.title}
    >
        {source.title || new URL(source.uri).hostname}
    </a>
);

// Simple component to render basic markdown (bold, italics)
const MessageBody: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  
    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={i}>{part.slice(1, -1)}</em>;
          }
          return part;
        })}
      </div>
    );
};


const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  isRecording,
  onStartRecording,
  onStopRecording,
  isLoading,
  transcription,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // Effect for auto-growing textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
        // Reset height to allow shrinking
        textarea.style.height = 'auto';
        // Set height to scroll height, respecting max-height
        textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputText]);
  
  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/30 backdrop-blur-md rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end animate-slide-in-right' : 'animate-slide-in-left'}`}>
              {msg.sender === 'ai' && <BotIcon className="w-8 h-8 text-blue-500 flex-shrink-0 mt-1" />}
              <div className={`max-w-md p-4 rounded-2xl shadow-sm ${msg.sender === 'user' ? 'bg-blue-500 text-white rounded-br-lg' : 'bg-white text-gray-800 rounded-bl-lg border border-gray-200'}`}>
                <MessageBody text={msg.text} />
                 {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-black/10">
                        <p className="text-xs font-semibold mb-1 opacity-80">Sources:</p>
                        <div className="space-y-1">
                            {msg.sources.map((source, i) => <SourceLink key={i} source={source} />)}
                        </div>
                    </div>
                )}
              </div>
              {msg.sender === 'user' && <UserIcon className="w-8 h-8 text-gray-500 flex-shrink-0 mt-1" />}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start gap-3 animate-slide-in-left">
              <BotIcon className="w-8 h-8 text-blue-500 flex-shrink-0 mt-1" />
              <div className="max-w-md p-4 rounded-2xl bg-white text-gray-800 rounded-bl-lg shadow-sm border border-gray-200">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 bg-white/60 backdrop-blur-sm border-t border-gray-200/80">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={isRecording ? transcription : inputText}
            onChange={(e) => !isRecording && setInputText(e.target.value.slice(0, MAX_CHARS))}
            onKeyPress={handleKeyPress}
            placeholder={isRecording ? 'Listening...' : "Type or hold mic to talk..."}
            className="w-full pl-4 pr-28 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none leading-tight max-h-32 overflow-y-auto"
            rows={1}
            disabled={isRecording}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            {!isRecording && inputText.length > 0 && (
                <button 
                    onClick={() => setInputText('')} 
                    className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors focus:outline-none"
                    aria-label="Clear input"
                >
                    <ClearIcon className="w-5 h-5" />
                </button>
            )}
            {!isRecording && inputText ? (
                <button onClick={handleSend} className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label="Send message">
                    <SendIcon className="w-5 h-5" />
                </button>
            ) : (
                <button
                    onClick={isRecording ? onStopRecording : onStartRecording}
                    className={`p-2 rounded-full transition-colors focus:outline-none focus:ring-2 ${
                    isRecording ? 'bg-red-500 text-white animate-pulse ring-red-400' : 'bg-blue-500 text-white hover:bg-blue-600 ring-blue-400'
                    }`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                >
                    {isRecording ? <StopIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
                </button>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 mt-1 pr-2">
            {inputText.length} / {MAX_CHARS}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;