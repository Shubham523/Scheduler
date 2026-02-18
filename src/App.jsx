import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Clock, 
  Brain, 
  Activity, 
  Coffee, 
  Briefcase, 
  BookOpen, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Layout,
  Edit2,
  X,
  Save,
  AlertTriangle,
  Download,
  Upload,
  Bell,
  BellOff, 
  Play,
  Pause,
  RotateCcw,
  Minimize2,
  Code,
  SquareDashedBottom,
  Sparkles,
  Loader2,
  Key,
  Image as ImageIcon,
  Sun,
  Moon
} from 'lucide-react';

// --- Constants ---

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const INITIAL_EVENTS = [
  { id: 1, title: "Deep Work / Coding", category: "work", start: "09:00", end: "11:00", days: ["Monday", "Wednesday", "Friday"] },
  { id: 2, title: "Team Sync", category: "work", start: "11:30", end: "12:30", days: ["Monday"] },
  { id: 3, title: "Lunch Break", category: "leisure", start: "12:30", end: "13:30", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
];

const CATEGORIES = {
  work: { 
    label: "Work", 
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-200 border-blue-500/30", 
    barColor: "bg-blue-500",
    icon: Briefcase 
  },
  study: { 
    label: "Study", 
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 border-indigo-500/30", 
    barColor: "bg-indigo-500",
    icon: BookOpen 
  },
  health: { 
    label: "Health", 
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-200 border-emerald-500/30", 
    barColor: "bg-emerald-500",
    icon: Activity 
  },
  leisure: { 
    label: "Leisure", 
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-200 border-orange-500/30", 
    barColor: "bg-orange-500",
    icon: Coffee 
  },
  chore: { 
    label: "Chores", 
    color: "bg-slate-200 dark:bg-slate-700/30 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600/30", 
    barColor: "bg-slate-500",
    icon: Layout 
  },
  empty: {
    label: "Empty",
    color: "bg-slate-100 dark:bg-slate-800/50 text-slate-400 border-slate-300 dark:border-slate-700 dashed border-2",
    barColor: "bg-slate-400",
    icon: SquareDashedBottom
  }
};

// --- Helper Functions ---

const timeToMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const getDuration = (start, end) => timeToMinutes(end) - timeToMinutes(start);

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Play a distinct notification sound
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

// Flash the tab title
const flashTabTitle = (message) => {
  let isOriginal = true;
  const originalTitle = document.title;
  const interval = setInterval(() => {
    document.title = isOriginal ? "🔔 " + message : originalTitle;
    isOriginal = !isOriginal;
  }, 1000);
  
  setTimeout(() => {
    clearInterval(interval);
    document.title = originalTitle;
  }, 10000);
  
  window.addEventListener('focus', () => {
    clearInterval(interval);
    document.title = originalTitle;
  }, { once: true });
};


// --- API Logic ---

const callGeminiPlanner = async (prompt, apiKey, currentDay) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const systemPrompt = `
    You are a scheduling assistant for the "LifeSync" app.
    Current Day Context: ${currentDay}.
    
    Categories available: "work", "study", "health", "leisure", "chore".
    
    Your task: Convert the user's natural language request into a JSON array of event objects.
    Each object must have: 
    - title (string)
    - category (one of the strings above, default to leisure)
    - start (HH:MM 24h format string)
    - end (HH:MM 24h format string)
    - days (array of strings, e.g. ["Monday", "Wednesday"])

    Rules:
    - If user doesn't specify day, assume "${currentDay}".
    - If user says "every day", include all days of the week.
    - Ensure start time is before end time.
    - Return ONLY the JSON array. No markdown, no text.
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\nUser Request: " + prompt }] }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    const text = data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw err;
  }
};

const callGeminiVision = async (base64Image, apiKey) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const prompt = `
    Analyze this timetable image. Extract the weekly schedule into a JSON array of event objects.
    
    Categories to map: "work" (classes/lectures), "study", "health", "leisure", "chore".
    
    Output JSON format:
    [
      {
        "title": "Math Class",
        "category": "work",
        "start": "09:00",
        "end": "10:00",
        "days": ["Monday", "Wednesday"]
      }
    ]
    
    Rules:
    - Use 24h format (HH:MM) for start/end.
    - If days are ambiguous, assume Monday-Friday.
    - Return ONLY valid JSON inside. No markdown block.
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    const text = data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw err;
  }
};

// --- Components ---

const AIModal = ({ isOpen, onClose, onGenerate }) => {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!apiKey) {
      setError("Please enter a valid API Key");
      return;
    }
    setLoading(true);
    setError(null);
    
    localStorage.setItem('gemini_api_key', apiKey);

    try {
      await onGenerate(prompt, apiKey);
      setPrompt("");
      onClose();
    } catch (err) {
      setError(err.message || "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="text-sky-400" size={20} />
            <h3 className="text-lg font-bold text-slate-100">AI Magic Plan</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
             <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
               <Key size={12} /> Google Gemini API Key
             </label>
             <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here..."
                className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-slate-300 focus:border-sky-500 outline-none"
             />
             <p className="text-[10px] text-slate-500 mt-1">Key is stored locally in your browser.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase">What should I plan?</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none min-h-[100px]"
              placeholder="e.g. 'I have a math exam on Friday. Plan 2 hours of study every morning this week and gym in the evenings.'"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded flex items-center gap-2">
                <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            disabled={!prompt || loading}
            className="flex-1 py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

const ImageUploadModal = ({ isOpen, onClose, onProcess }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      processImage(file);
    }
  };

  const processImage = async (file) => {
    if (!apiKey) {
      setError("Please enter a valid API Key first");
      return;
    }
    setLoading(true);
    setError(null);
    
    localStorage.setItem('gemini_api_key', apiKey);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result.split(',')[1]; 
        await onProcess(base64String, apiKey);
        onClose();
      } catch (err) {
        setError(err.message || "Failed to process image");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-sky-500" size={20} />
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Scan Timetable</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700/50">
             <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1">
               <Key size={12} /> Google Gemini API Key
             </label>
             <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here..."
                className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-md p-2 text-xs text-gray-800 dark:text-slate-300 focus:border-sky-500 outline-none"
             />
          </div>

          <div 
            onClick={() => fileInputRef.current.click()}
            className="border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-sky-500 dark:hover:border-sky-500 transition-colors group"
          >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/*"
            />
            {loading ? (
                <div className="flex flex-col items-center">
                    <Loader2 className="animate-spin text-sky-500 mb-2" size={32} />
                    <span className="text-sm text-gray-500 dark:text-slate-400">Analyzing Schedule...</span>
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <Upload className="text-gray-400 dark:text-slate-500 group-hover:text-sky-500 mb-2" size={32} />
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Click to Upload Image</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500 mt-1">Supports JPG, PNG</span>
                </div>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 p-2 rounded flex items-center gap-2">
                <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FocusTimer = ({ event, onClose }) => {
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('focus'); 
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      playNotificationSound();
      if (mode === 'focus') {
         setMode('break');
         setTimeLeft(5 * 60);
         new Notification("Focus Session Complete", { body: "Time for a break!" });
      } else {
         setMode('focus');
         setTimeLeft(duration * 60);
         new Notification("Break Over", { body: "Back to work!" });
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, duration]);

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'focus' ? duration * 60 : 5 * 60);
  };

  const handleDurationChange = (e) => {
      const val = parseInt(e.target.value) || 25;
      setDuration(val);
      setTimeLeft(val * 60);
      setIsEditing(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-6 rounded-2xl shadow-2xl w-80">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${mode === 'focus' ? 'text-sky-500 dark:text-sky-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
              {mode === 'focus' ? 'Deep Focus' : 'Short Break'}
            </span>
            <h4 className="text-gray-800 dark:text-slate-100 font-medium truncate w-48">{event.title}</h4>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300">
            <Minimize2 size={18} />
          </button>
        </div>

        <div className="text-center mb-6">
            {isEditing && !isActive ? (
                <div className="flex items-center justify-center gap-2">
                    <input 
                        type="number" 
                        value={duration} 
                        onChange={(e) => setDuration(e.target.value === '' ? '' : parseInt(e.target.value))}
                        onBlur={handleDurationChange}
                        autoFocus
                        className="text-4xl font-mono text-center w-24 bg-gray-100 dark:bg-slate-800 rounded border border-gray-300 dark:border-slate-600 text-gray-800 dark:text-slate-100"
                    />
                    <span className="text-sm text-gray-500">min</span>
                </div>
            ) : (
                <div 
                    onClick={() => !isActive && setIsEditing(true)}
                    className={`text-5xl font-mono text-gray-800 dark:text-slate-100 font-light tracking-widest ${!isActive ? 'cursor-pointer hover:text-sky-500 transition-colors' : ''}`}
                    title={!isActive ? "Click to edit duration" : ""}
                >
                    {formatTime(timeLeft)}
                </div>
            )}
        </div>

        <div className="flex justify-center gap-4">
          <button 
            onClick={toggleTimer}
            className={`p-3 rounded-full text-white transition-all shadow-lg ${isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-600 hover:bg-sky-500'}`}
          >
            {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
          <button 
            onClick={resetTimer}
            className="p-3 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const EventCard = ({ event, onDelete, onEdit, onStartFocus }) => {
  const catConfig = CATEGORIES[event.category] || CATEGORIES.work;
  const Icon = catConfig.icon;
  const isWorkOrStudy = event.category === 'work' || event.category === 'study';

  return (
    <div className={`relative group p-4 mb-3 rounded-xl border ${catConfig.color} transition-all bg-white dark:bg-transparent`}>
      <div className="flex justify-between items-start gap-3">
        {/* Content Section */}
        <div className="flex gap-4 min-w-0 flex-1">
          <div className="mt-1 flex-shrink-0">
            <Icon size={18} className="opacity-80" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-base tracking-wide truncate pr-2 text-gray-800 dark:text-slate-100">{event.title}</h4>
            <div className="flex items-center text-xs opacity-70 mt-1.5 gap-3 font-mono flex-wrap text-gray-600 dark:text-slate-300">
              <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> {event.start} - {event.end}</span>
              <span>•</span>
              <span>{Math.round(getDuration(event.start, event.end) / 60 * 10) / 10}h</span>
            </div>
            {event.days && event.days.length > 1 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                    {DAYS_OF_WEEK.map(d => (
                        <span key={d} className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full ${event.days.includes(d) ? 'bg-current bg-opacity-20 font-bold text-gray-700 dark:text-slate-200' : 'opacity-20 text-gray-400 dark:text-slate-500'}`}>
                            {d[0]}
                        </span>
                    ))}
                </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity items-center">
           {isWorkOrStudy && (
             <button 
                onClick={() => onStartFocus(event)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-emerald-500 dark:text-emerald-400 transition-colors"
                title="Start Focus Timer"
             >
                <Play size={16} />
             </button>
           )}
           <button 
            onClick={() => onEdit(event)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-500 dark:text-slate-300 transition-colors"
            title="Edit Task"
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => onDelete(event.id)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-red-500 dark:text-red-400 transition-colors"
            title="Delete Task"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const SuggestionCard = ({ suggestion, onAccept }) => {
  return (
    <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 p-4 rounded-xl mb-3 hover:border-sky-500 dark:hover:border-sky-500/30 transition-colors">
      <div className="flex gap-3">
        <div className="bg-sky-100 dark:bg-sky-500/20 p-2 rounded-lg h-fit text-sky-600 dark:text-sky-400">
          <Brain size={18} />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-gray-800 dark:text-slate-200 text-sm mb-1">{suggestion.title}</h4>
          <p className="text-gray-600 dark:text-slate-400 text-xs mb-3 leading-relaxed">{suggestion.reason}</p>
          <button 
            onClick={onAccept}
            className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 w-fit"
          >
            <Plus size={14} /> Add Block
          </button>
        </div>
      </div>
    </div>
  );
};

const StatsRing = ({ percentage, colorClass, label }) => {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-200 dark:text-slate-800" />
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className={colorClass} />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <span className="text-sm font-bold text-gray-800 dark:text-slate-200">{Math.round(percentage)}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 mt-2">{label}</span>
    </div>
  );
};

// --- Modal Component ---

const EventModal = ({ isOpen, onClose, onSave, initialData, currentDay, initialStart, initialEnd }) => {
  const [formData, setFormData] = useState({ 
    title: '', 
    category: 'work', 
    start: '09:00', 
    end: '10:00',
    days: [currentDay],
    isRecurring: false
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        isRecurring: initialData.days && initialData.days.length > 1
      });
    } else {
      setFormData({ 
        title: '', 
        category: 'work', 
        start: initialStart || '09:00', 
        end: initialEnd || '10:00',
        days: [currentDay],
        isRecurring: false
      });
    }
  }, [initialData, isOpen, currentDay, initialStart, initialEnd]);

  const toggleDay = (day) => {
    if (formData.days.includes(day)) {
        if (formData.days.length > 1) {
            setFormData(prev => ({ ...prev, days: prev.days.filter(d => d !== day) }));
        }
    } else {
        setFormData(prev => ({ ...prev, days: [...prev.days, day] }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">{initialData ? 'Edit Task' : 'Add New Task'}</h3>
          <button onClick={onClose} className="text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase">Task Name</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-lg p-3 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
              placeholder="e.g. Physics Class"
              autoFocus
            />
          </div>

          <div>
             <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Schedule</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="recurring"
                        checked={formData.isRecurring}
                        onChange={(e) => {
                            const isChecked = e.target.checked;
                            setFormData(prev => ({ 
                                ...prev, 
                                isRecurring: isChecked,
                                days: isChecked ? prev.days : [currentDay]
                            }));
                        }}
                        className="rounded bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                    />
                    <label htmlFor="recurring" className="text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none">Repeat Weekly</label>
                </div>
             </div>

             {formData.isRecurring ? (
                <div className="flex justify-between gap-1 p-1 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={`w-8 h-8 text-xs rounded-md transition-all ${
                                formData.days.includes(day) 
                                ? 'bg-sky-600 text-white shadow-sm' 
                                : 'text-gray-500 dark:text-slate-500 hover:bg-gray-200 dark:hover:bg-slate-800'
                            }`}
                        >
                            {day[0]}
                        </button>
                    ))}
                </div>
             ) : (
                <div className="text-sm text-gray-600 dark:text-slate-300 p-3 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400 dark:text-slate-500" />
                    {formData.days[0] || currentDay}
                </div>
             )}
          </div>

          <div>
             <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase">Category</label>
             <div className="grid grid-cols-3 gap-2">
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setFormData({...formData, category: key})}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition-all ${
                      formData.category === key 
                        ? `${cat.color} border-current ring-1 ring-current` 
                        : 'border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 text-gray-500 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <cat.icon size={16} className="mb-1" />
                    {cat.label}
                  </button>
                ))}
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase">Start Time</label>
              <input 
                type="time" 
                value={formData.start}
                onChange={(e) => setFormData({...formData, start: e.target.value})}
                className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-lg p-3 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase">End Time</label>
              <input 
                type="time" 
                value={formData.end}
                onChange={(e) => setFormData({...formData, end: e.target.value})}
                className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-lg p-3 text-gray-800 dark:text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => onSave(formData)}
            disabled={!formData.title}
            className="flex-1 py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            <Save size={18} />
            Save Task
          </button>
        </div>
      </div>
    </div>
  );
};

const MainApp = () => {
  // 1. Initialize
  const [events, setEvents] = useState(() => {
    try {
        const saved = localStorage.getItem('lifeSyncEvents');
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_EVENTS;
  });

  const [activeTab, setActiveTab] = useState('schedule');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [notification, setNotification] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [activeFocusEvent, setActiveFocusEvent] = useState(null);
  
  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
      // Check system preference or saved pref
      if (typeof window !== 'undefined') {
          return localStorage.getItem('theme') === 'dark' || 
                 (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
      return true; // Default dark
  });

  useEffect(() => {
      // Apply dark mode class to html element
      if (isDarkMode) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  // Track notified events to prevent duplicate alerts but ensure at least one
  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [smartTime, setSmartTime] = useState({ start: '09:00', end: '10:00' });

  const fileInputRef = useRef(null);

  // 2. Save
  useEffect(() => {
    localStorage.setItem('lifeSyncEvents', JSON.stringify(events));
  }, [events]);

  // 3. AGGRESSIVE NOTIFICATION SYSTEM
  useEffect(() => {
    if (Notification.permission === 'granted') setNotificationsEnabled(true);

    const checkNotifications = () => {
        if (!notificationsEnabled || Notification.permission !== 'granted') return;
        
        const now = new Date();
        const currentDayIndex = now.getDay(); 
        const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayStr = dayMap[currentDayIndex];
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMins = currentHour * 60 + currentMinute;

        events.forEach(event => {
            // Check if event is today
            if (event.days && event.days.includes(todayStr)) {
                const eventStartMins = timeToMinutes(event.start);
                const diff = eventStartMins - currentTimeInMins;
                
                const eventUid = `${event.id}-${todayStr}`; 

                if (diff > 0 && diff <= 5 && !notifiedEvents.has(eventUid)) {
                    playNotificationSound();
                    flashTabTitle(`Alert: ${event.title}`);
                    new Notification(`Upcoming: ${event.title}`, {
                        body: `Starting in ${diff} minutes (${event.start})`,
                        icon: '/vite.svg',
                        requireInteraction: true 
                    });
                    setNotifiedEvents(prev => new Set(prev).add(eventUid));
                }
            }
        });
    };

    const interval = setInterval(checkNotifications, 10000); 
    
    const cleanup = setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            setNotifiedEvents(new Set());
        }
    }, 60000);

    return () => {
        clearInterval(interval);
        clearInterval(cleanup);
    };
  }, [events, notificationsEnabled, notifiedEvents]);

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
        setNotificationsEnabled(false);
        showNotification("Notifications muted", "success");
        return;
    }

    if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
        playNotificationSound();
        new Notification("LifeSync", { body: "System alerts active!" });
        showNotification("Notifications active", "success");
    } else {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            setNotificationsEnabled(true);
            playNotificationSound();
            new Notification("LifeSync", { body: "Notifications enabled!" });
            showNotification("Notifications active", "success");
        } else {
            showNotification("Permission denied. Check settings.", "error");
        }
    }
  };

  // --- Logic Engines ---
  
  const displayedEvents = useMemo(() => {
    return events.filter(e => (e.days && e.days.includes(selectedDay)))
                 .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  }, [events, selectedDay]);

  const stats = useMemo(() => {
    const totalMinutes = displayedEvents.reduce((acc, curr) => acc + getDuration(curr.start, curr.end), 0);
    const byCategory = displayedEvents.reduce((acc, curr) => {
      const dur = getDuration(curr.start, curr.end);
      acc[curr.category] = (acc[curr.category] || 0) + dur;
      return acc;
    }, {});
    const ACTIVE_DAY = 720;
    return {
      totalMinutes,
      byCategory,
      percentages: {
        work: Math.min(((byCategory.work || 0) / ACTIVE_DAY) * 100, 100),
        study: Math.min(((byCategory.study || 0) / ACTIVE_DAY) * 100, 100),
        health: Math.min(((byCategory.health || 0) / ACTIVE_DAY) * 100, 100),
        leisure: Math.min(((byCategory.leisure || 0) / ACTIVE_DAY) * 100, 100),
      }
    };
  }, [displayedEvents]);

  const suggestions = useMemo(() => {
    const suggs = [];
    const { byCategory } = stats;
    if (displayedEvents.length > 0) {
        if (!byCategory.health || byCategory.health < 30) {
        suggs.push({
            id: 'missing-health', title: "No Movement",
            reason: "Missing physical activity.",
            action: { title: "Walk", category: "health", start: "18:00", end: "18:30", days: [selectedDay] }
        });
        }
    }
    return suggs;
  }, [stats, displayedEvents, selectedDay]);

  // --- Handlers ---

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const findNextFreeSlot = (targetDay) => {
    const dayEvents = events.filter(e => e.days.includes(targetDay))
                            .sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    
    let currentPointer = 8 * 60; 
    const blockDuration = 60; 

    for (let e of dayEvents) {
        const eStart = timeToMinutes(e.start);
        const eEnd = timeToMinutes(e.end);

        if (eStart - currentPointer >= blockDuration) {
            return { 
                start: minutesToTime(currentPointer), 
                end: minutesToTime(currentPointer + blockDuration) 
            };
        }
        if (eEnd > currentPointer) {
            currentPointer = eEnd;
        }
    }
    if (currentPointer + blockDuration < 24 * 60) {
        return { 
            start: minutesToTime(currentPointer), 
            end: minutesToTime(currentPointer + blockDuration) 
        };
    }
    return { start: '09:00', end: '10:00' };
  };

  const checkOverlap = (newEvent, excludeId = null) => {
    const newStart = timeToMinutes(newEvent.start);
    const newEnd = timeToMinutes(newEvent.end);
    
    const relevantEvents = events.filter(e => 
        e.id !== excludeId && 
        e.days.some(day => newEvent.days.includes(day))
    );

    const conflict = relevantEvents.find(e => {
      const eStart = timeToMinutes(e.start);
      const eEnd = timeToMinutes(e.end);
      return (newStart < eEnd && newEnd > eStart);
    });

    return conflict;
  };

  const handleSaveEvent = (data) => {
    const overlap = checkOverlap(data, editingEvent ? editingEvent.id : null);
    
    if (overlap) {
        showNotification(`Overlap Warning: Conflicts with "${overlap.title}"`, 'error');
        return; 
    }

    if (editingEvent) {
      setEvents(events.map(e => e.id === editingEvent.id ? { ...data, id: editingEvent.id } : e));
      showNotification("Task updated successfully.");
    } else {
      const newEvent = { ...data, id: Date.now() };
      setEvents([...events, newEvent]);
      showNotification("New task added.");
    }
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const handleAIGeneration = async (prompt, key) => {
      const generatedEvents = await callGeminiPlanner(prompt, key, selectedDay);
      const eventsWithIds = generatedEvents.map(e => ({...e, id: Date.now() + Math.random() }));
      setEvents(prev => [...prev, ...eventsWithIds]);
      showNotification(`Added ${eventsWithIds.length} events from AI`);
  };

  const handleImageScan = async (base64, key) => {
      const scannedEvents = await callGeminiVision(base64, key);
      const eventsWithIds = scannedEvents.map(e => ({...e, id: Date.now() + Math.random() }));
      setEvents(prev => [...prev, ...eventsWithIds]);
      showNotification(`Scanned ${eventsWithIds.length} events from image`);
  };

  const openAddModal = () => {
    setEditingEvent(null);
    const slot = findNextFreeSlot(selectedDay);
    setSmartTime(slot);
    setIsModalOpen(true);
  };

  const handleQuickAddEmpty = () => {
    const slot = findNextFreeSlot(selectedDay);
    const newEvent = {
        id: Date.now(),
        title: "Empty Slot",
        category: "empty",
        start: slot.start,
        end: slot.end,
        days: [selectedDay]
    };
    
    const overlap = checkOverlap(newEvent);
    if (overlap) {
        showNotification("Schedule full! Cannot add empty block.", "error");
        return;
    }

    setEvents([...events, newEvent]);
    showNotification("Added Empty Block at " + slot.start);
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    setSmartTime({ start: event.start, end: event.end });
    setIsModalOpen(true);
  };

  // --- Backup Functions ---

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "lifesync_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showNotification("Schedule exported!");
  };

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedEvents = JSON.parse(event.target.result);
            if (Array.isArray(importedEvents)) {
                setEvents(importedEvents);
                showNotification("Schedule restored successfully!");
            }
        } catch (error) {}
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-800 dark:text-slate-200 font-sans pb-10 transition-colors duration-300">
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".json"
      />

      {activeFocusEvent && (
        <FocusTimer event={activeFocusEvent} onClose={() => setActiveFocusEvent(null)} />
      )}

      {/* AI Modal */}
      <AIModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onGenerate={handleAIGeneration}
      />

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onProcess={handleImageScan}
      />

      {/* Edit/Add Modal */}
      <EventModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveEvent}
        initialData={editingEvent}
        currentDay={selectedDay}
        initialStart={smartTime.start}
        initialEnd={smartTime.end}
      />

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-20 backdrop-blur-md bg-opacity-80 dark:bg-opacity-80 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-sky-600 p-2 rounded-lg text-white shadow-lg shadow-sky-500/20">
              <Activity size={20} />
            </div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100 tracking-tight">
              LifeSync
            </h1>
          </div>
          
          {/* Day Selector */}
          <div className="flex overflow-x-auto gap-1 w-full md:w-auto pb-2 md:pb-0 no-scrollbar justify-start md:justify-center">
             {DAYS_OF_WEEK.map(day => (
                 <button 
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        selectedDay === day 
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-500/30' 
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                 >
                    {day.substring(0, 3)}
                 </button>
             ))}
          </div>

          <div className="flex gap-2 w-full md:w-auto justify-end">
             {/* Magic Wand & Scan Buttons */}
             <button 
                onClick={() => setIsAIModalOpen(true)}
                className="p-2 rounded-lg text-sky-500 border border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all"
                title="AI Magic Planner"
            >
                <Sparkles size={18} />
            </button>
            <button 
                onClick={() => setIsImageModalOpen(true)}
                className="p-2 rounded-lg text-purple-500 border border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all"
                title="Scan Timetable Image"
            >
                <ImageIcon size={18} />
            </button>
            
            <div className="h-8 w-[1px] bg-gray-200 dark:bg-slate-800 mx-1"></div>

            <button 
                onClick={toggleNotifications}
                className={`p-2 rounded-lg transition-all border ${notificationsEnabled ? 'text-emerald-500 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10' : 'text-gray-400 dark:text-slate-400 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-200'}`}
                title={notificationsEnabled ? "Mute Notifications" : "Enable Notifications"}
            >
                {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
            
            <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg text-gray-400 dark:text-slate-400 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-200 transition-all"
                title="Toggle Dark Mode"
            >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="h-8 w-[1px] bg-gray-200 dark:bg-slate-800 mx-1"></div>
            
             <button 
                onClick={handleQuickAddEmpty}
                className="p-2 rounded-lg text-gray-400 dark:text-slate-400 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all shadow-lg"
                title="Quick Add Empty Block"
            >
                <SquareDashedBottom size={18} />
            </button>

            <button 
                onClick={openAddModal}
                className="flex items-center gap-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg transition-all shadow-lg shadow-sky-500/30"
            >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Task</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-20 right-4 px-4 py-3 rounded-lg shadow-2xl text-sm flex items-center gap-3 animate-bounce-in z-50 font-medium ${
            notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {notification.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
          {notification.msg}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 mt-8 flex-1">
        
        {/* Dashboard Tabs */}
        <div className="flex gap-6 mb-6 border-b border-gray-200 dark:border-slate-800 px-2">
            <button 
                onClick={() => setActiveTab('schedule')}
                className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'schedule' ? 'text-sky-600 dark:text-sky-400' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'}`}
            >
                {selectedDay}'s Schedule
                {activeTab === 'schedule' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-sky-600 dark:bg-sky-500 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => setActiveTab('analysis')}
                className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'analysis' ? 'text-sky-600 dark:text-sky-400' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'}`}
            >
                Daily Insights
                {activeTab === 'analysis' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-sky-600 dark:bg-sky-500 rounded-t-full"></div>}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Main Content Area */}
            <div className="md:col-span-2 space-y-4">
                {activeTab === 'schedule' ? (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-5 min-h-[400px]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-semibold text-gray-800 dark:text-slate-200 flex items-center gap-2">
                                <Calendar size={18} className="text-gray-400 dark:text-slate-500"/> {selectedDay} Timeline
                            </h2>
                            <span className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-3 py-1 rounded-full font-medium border border-gray-200 dark:border-slate-700">
                                {displayedEvents.length} Blocks
                            </span>
                        </div>
                        
                        {displayedEvents.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 dark:text-slate-600">
                                <p>No tasks for {selectedDay}.</p>
                                <button onClick={openAddModal} className="mt-4 text-sky-500 hover:text-sky-400 text-sm font-medium">
                                    + Create one now
                                </button>
                            </div>
                        ) : (
                            <div className="relative ml-2 space-y-2">
                                {displayedEvents.map((event) => (
                                    <EventCard 
                                        key={event.id} 
                                        event={event} 
                                        onDelete={(id) => setEvents(events.filter(e => e.id !== id))}
                                        onEdit={openEditModal}
                                        onStartFocus={setActiveFocusEvent}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6">
                        <div className="flex justify-around mb-10 mt-4">
                            <StatsRing percentage={stats.percentages.work} colorClass="text-blue-500" label="Work" />
                            <StatsRing percentage={stats.percentages.study} colorClass="text-indigo-400" label="Study" />
                            <StatsRing percentage={stats.percentages.health} colorClass="text-emerald-400" label="Health" />
                        </div>
                        <div className="space-y-6">
                            {Object.entries(stats.byCategory).map(([cat, mins]) => (
                                <div key={cat} className="group">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="capitalize text-gray-500 dark:text-slate-400 group-hover:text-gray-800 dark:group-hover:text-slate-200 transition-colors">{cat}</span>
                                        <span className="font-mono text-gray-400 dark:text-slate-500">{Math.round(mins/60 * 10)/10}h</span>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden shadow-inner">
                                        <div 
                                            className={`h-full ${CATEGORIES[cat].barColor} shadow-lg`} 
                                            style={{ width: `${Math.min((mins / 720) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Sidebar / Suggestions */}
            <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5">
                    <h3 className="font-semibold text-gray-700 dark:text-slate-300 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Brain size={14} className="text-amber-500 dark:text-amber-400" /> Suggestions
                    </h3>
                    
                    {suggestions.length > 0 ? (
                        suggestions.map(sugg => (
                            <SuggestionCard key={sugg.id} suggestion={sugg} onAccept={() => {
                                const newAction = { ...sugg.action, id: Date.now() };
                                const overlap = checkOverlap(newAction);
                                if (overlap) {
                                    showNotification(`Cannot add suggestion: Conflicts with "${overlap.title}"`, 'error');
                                } else {
                                    setEvents([...events, newAction]);
                                    showNotification("Block added.");
                                }
                            }} />
                        ))
                    ) : (
                        <div className="text-center py-6 text-gray-400 dark:text-slate-500 text-sm">
                            Schedule is optimal for {selectedDay}.
                        </div>
                    )}
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-slate-800 dark:from-indigo-900 dark:to-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 p-5 text-white">
                    <h3 className="font-bold mb-2 text-indigo-100 dark:text-indigo-200">Pro Tip</h3>
                    <p className="text-indigo-100/80 dark:text-indigo-200/70 text-sm mb-0 leading-relaxed">
                        Click the Moon icon to toggle between light and dark themes.
                    </p>
                </div>
            </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-gray-500 dark:text-slate-600 text-xs border-t border-gray-200 dark:border-slate-800/50">
        <p className="flex items-center justify-center gap-2">
            <Code size={12} />
            Developed by <span className="text-sky-600 dark:text-sky-500 font-medium">Shubham Saini</span> • © {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  );
};

export default MainApp;