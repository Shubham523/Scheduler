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
  Play,
  Pause,
  RotateCcw,
  Minimize2
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
    color: "bg-blue-500/10 text-blue-200 border-blue-500/30", 
    barColor: "bg-blue-500",
    icon: Briefcase 
  },
  study: { 
    label: "Study", 
    color: "bg-indigo-500/10 text-indigo-200 border-indigo-500/30", 
    barColor: "bg-indigo-500",
    icon: BookOpen 
  },
  health: { 
    label: "Health", 
    color: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30", 
    barColor: "bg-emerald-500",
    icon: Activity 
  },
  leisure: { 
    label: "Leisure", 
    color: "bg-orange-500/10 text-orange-200 border-orange-500/30", 
    barColor: "bg-orange-500",
    icon: Coffee 
  },
  chore: { 
    label: "Chores", 
    color: "bg-slate-700/30 text-slate-300 border-slate-600/30", 
    barColor: "bg-slate-500",
    icon: Layout 
  },
};

// --- Helper Functions ---

const timeToMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const getDuration = (start, end) => timeToMinutes(end) - timeToMinutes(start);

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// --- Components ---

const FocusTimer = ({ event, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('focus'); // focus | break

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      // Play sound or notify
      if (mode === 'focus') {
         setMode('break');
         setTimeLeft(5 * 60);
      } else {
         setMode('focus');
         setTimeLeft(25 * 60);
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-80">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${mode === 'focus' ? 'text-sky-400' : 'text-emerald-400'}`}>
              {mode === 'focus' ? 'Deep Focus' : 'Short Break'}
            </span>
            <h4 className="text-slate-100 font-medium truncate w-48">{event.title}</h4>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <Minimize2 size={18} />
          </button>
        </div>

        <div className="text-5xl font-mono text-center mb-6 text-slate-100 font-light tracking-widest">
          {formatTime(timeLeft)}
        </div>

        <div className="flex justify-center gap-4">
          <button 
            onClick={toggleTimer}
            className={`p-3 rounded-full text-white transition-all shadow-lg ${isActive ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'}`}
          >
            {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
          <button 
            onClick={resetTimer}
            className="p-3 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all"
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
    <div className={`relative group p-4 mb-3 rounded-xl border ${catConfig.color} hover:border-opacity-60 transition-all`}>
      <div className="flex justify-between items-start">
        <div className="flex gap-4">
          <div className="mt-1">
            <Icon size={18} className="opacity-80" />
          </div>
          <div>
            <h4 className="font-semibold text-base tracking-wide">{event.title}</h4>
            <div className="flex items-center text-xs opacity-70 mt-1.5 gap-3 font-mono">
              <span className="flex items-center gap-1"><Clock size={12} /> {event.start} - {event.end}</span>
              <span>•</span>
              <span>{Math.round(getDuration(event.start, event.end) / 60 * 10) / 10}h</span>
            </div>
            {event.days && event.days.length > 1 && (
                <div className="flex gap-1 mt-2">
                    {DAYS_OF_WEEK.map(d => (
                        <span key={d} className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full ${event.days.includes(d) ? 'bg-current bg-opacity-20 font-bold' : 'opacity-20'}`}>
                            {d[0]}
                        </span>
                    ))}
                </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity items-center">
           {isWorkOrStudy && (
             <button 
                onClick={() => onStartFocus(event)}
                className="p-2 hover:bg-white/10 rounded-lg text-emerald-400 transition-colors"
                title="Start Focus Timer"
             >
                <Play size={16} />
             </button>
           )}
           <button 
            onClick={() => onEdit(event)}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
            title="Edit Task"
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => onDelete(event.id)}
            className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition-colors"
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
    <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl mb-3 hover:border-sky-500/30 transition-colors">
      <div className="flex gap-3">
        <div className="bg-sky-500/20 p-2 rounded-lg h-fit text-sky-400">
          <Brain size={18} />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-slate-200 text-sm mb-1">{suggestion.title}</h4>
          <p className="text-slate-400 text-xs mb-3 leading-relaxed">{suggestion.reason}</p>
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
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-800" />
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className={colorClass} />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <span className="text-sm font-bold text-slate-200">{Math.round(percentage)}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-400 mt-2">{label}</span>
    </div>
  );
};

// --- Modal Component ---

const EventModal = ({ isOpen, onClose, onSave, initialData, currentDay }) => {
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
        start: '09:00', 
        end: '10:00',
        days: [currentDay],
        isRecurring: false
      });
    }
  }, [initialData, isOpen, currentDay]);

  const toggleDay = (day) => {
    if (formData.days.includes(day)) {
        // Prevent deselecting all days
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
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-100">{initialData ? 'Edit Task' : 'Add New Task'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Task Name</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
              placeholder="e.g. Project Meeting"
              autoFocus
            />
          </div>

          <div>
             <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-slate-400 uppercase">Schedule</label>
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
                                days: isChecked ? prev.days : [currentDay] // Reset to single day if unchecked
                            }));
                        }}
                        className="rounded bg-slate-800 border-slate-600 text-sky-600 focus:ring-sky-500"
                    />
                    <label htmlFor="recurring" className="text-xs text-slate-300 cursor-pointer select-none">Repeat Weekly</label>
                </div>
             </div>

             {formData.isRecurring ? (
                <div className="flex justify-between gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={`w-8 h-8 text-xs rounded-md transition-all ${
                                formData.days.includes(day) 
                                ? 'bg-sky-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:bg-slate-800'
                            }`}
                        >
                            {day[0]}
                        </button>
                    ))}
                </div>
             ) : (
                <div className="text-sm text-slate-300 p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-2">
                    <Calendar size={14} className="text-slate-500" />
                    {formData.days[0] || currentDay}
                </div>
             )}
          </div>

          <div>
             <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Category</label>
             <div className="grid grid-cols-3 gap-2">
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setFormData({...formData, category: key})}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition-all ${
                      formData.category === key 
                        ? `${cat.color} border-current ring-1 ring-current` 
                        : 'border-slate-800 bg-slate-950 text-slate-500 hover:bg-slate-800'
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
              <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Start Time</label>
              <input 
                type="time" 
                value={formData.start}
                onChange={(e) => setFormData({...formData, start: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">End Time</label>
              <input 
                type="time" 
                value={formData.end}
                onChange={(e) => setFormData({...formData, end: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors">
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
  // 1. Initialize from Local Storage
  const [events, setEvents] = useState(() => {
    try {
        const saved = localStorage.getItem('lifeSyncEvents');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error("Failed to load events", e);
    }
    return INITIAL_EVENTS;
  });

  const [activeTab, setActiveTab] = useState('schedule');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [notification, setNotification] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [activeFocusEvent, setActiveFocusEvent] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // File Input Ref
  const fileInputRef = useRef(null);

  // 2. Save to Local Storage whenever events change
  useEffect(() => {
    localStorage.setItem('lifeSyncEvents', JSON.stringify(events));
  }, [events]);

  // 3. Reminders System
  useEffect(() => {
    // Check permission status on load
    if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
    }

    const interval = setInterval(() => {
        if (Notification.permission !== 'granted') return;
        
        const now = new Date();
        const currentDayIndex = now.getDay(); // 0 = Sunday, 1 = Monday
        // Convert JS day index to our string format
        const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayStr = dayMap[currentDayIndex];
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMins = currentHour * 60 + currentMinute;

        events.forEach(event => {
            // Check if event happens today
            if (event.days && event.days.includes(todayStr)) {
                const eventStartMins = timeToMinutes(event.start);
                const diff = eventStartMins - currentTimeInMins;
                
                // Notify 5 minutes before (diff === 5)
                if (diff === 5) {
                    new Notification(`Upcoming: ${event.title}`, {
                        body: `Starting in 5 minutes (${event.start})`,
                        icon: '/icon.png' // Would work in PWA
                    });
                }
            }
        });

    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [events]);

  const requestNotificationPermission = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        setNotificationsEnabled(true);
        showNotification("Notifications enabled!", "success");
    } else {
        showNotification("Permission denied. Check browser settings.", "error");
    }
  };

  // --- Logic Engines ---
  
  const displayedEvents = useMemo(() => {
    // Filter events if they include the selected day in their 'days' array
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
            id: 'missing-health', title: "No Movement Detected",
            reason: "Physical activity is missing on " + selectedDay + ". A 30m walk improves focus.",
            action: { title: "Evening Walk", category: "health", start: "18:00", end: "18:30", days: [selectedDay] }
        });
        }
        if ((!byCategory.study || byCategory.study < 60) && (!byCategory.work || byCategory.work < 120)) {
        suggs.push({
            id: 'missing-study', title: "Increase Focus Time",
            reason: "Deep work schedule is light on " + selectedDay + ".",
            action: { title: "Deep Study", category: "study", start: "14:00", end: "15:30", days: [selectedDay] }
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

  const checkOverlap = (newEvent, excludeId = null) => {
    const newStart = timeToMinutes(newEvent.start);
    const newEnd = timeToMinutes(newEvent.end);
    
    // Flatten check: Do any days in newEvent overlap with existing events on those days?
    // Get all events that share ANY day with newEvent
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

  const openAddModal = () => {
    setEditingEvent(null);
    setIsModalOpen(true);
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
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
            } else {
                showNotification("Invalid file format", "error");
            }
        } catch (error) {
            showNotification("Error reading file", "error");
        }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-10 selection:bg-sky-500/30">
      
      {/* Hidden File Input for Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".json"
      />

      {/* Focus Timer Overlay */}
      {activeFocusEvent && (
        <FocusTimer event={activeFocusEvent} onClose={() => setActiveFocusEvent(null)} />
      )}

      {/* Edit/Add Modal */}
      <EventModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveEvent}
        initialData={editingEvent}
        currentDay={selectedDay}
      />

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md bg-opacity-80">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-sky-600 p-2 rounded-lg text-white shadow-lg shadow-sky-900/20">
              <Activity size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
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
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-900/40' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                 >
                    {day.substring(0, 3)}
                 </button>
             ))}
          </div>

          <div className="flex gap-2 w-full md:w-auto justify-end">
            <button 
                onClick={notificationsEnabled ? () => showNotification("Notifications active") : requestNotificationPermission}
                className={`p-2 rounded-lg transition-all border ${notificationsEnabled ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' : 'text-slate-400 border-slate-700 bg-slate-800 hover:text-slate-200'}`}
                title="Enable Reminders"
            >
                <Bell size={18} />
            </button>
            <div className="h-8 w-[1px] bg-slate-800 mx-1"></div>
            <button 
                onClick={handleExport}
                className="p-2 rounded-lg text-slate-400 border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200 transition-all"
                title="Backup Data"
            >
                <Download size={18} />
            </button>
            <button 
                onClick={handleImportClick}
                className="p-2 rounded-lg text-slate-400 border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200 transition-all"
                title="Restore Data"
            >
                <Upload size={18} />
            </button>
            <div className="h-8 w-[1px] bg-slate-800 mx-1"></div>
            <button 
                onClick={openAddModal}
                className="flex items-center gap-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg transition-all shadow-lg shadow-sky-900/20"
            >
                <Plus size={16} />
                <span>Add Task</span>
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

      <main className="max-w-4xl mx-auto px-4 mt-8">
        
        {/* Dashboard Tabs */}
        <div className="flex gap-6 mb-6 border-b border-slate-800 px-2">
            <button 
                onClick={() => setActiveTab('schedule')}
                className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'schedule' ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                {selectedDay}'s Schedule
                {activeTab === 'schedule' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-sky-500 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => setActiveTab('analysis')}
                className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'analysis' ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Daily Insights
                {activeTab === 'analysis' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-sky-500 rounded-t-full"></div>}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Main Content Area */}
            <div className="md:col-span-2 space-y-4">
                {activeTab === 'schedule' ? (
                    <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-5 min-h-[400px]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
                                <Calendar size={18} className="text-slate-500"/> {selectedDay} Timeline
                            </h2>
                            <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full font-medium border border-slate-700">
                                {displayedEvents.length} Blocks
                            </span>
                        </div>
                        
                        {displayedEvents.length === 0 ? (
                            <div className="text-center py-12 text-slate-600">
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
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
                        <div className="flex justify-around mb-10 mt-4">
                            <StatsRing percentage={stats.percentages.work} colorClass="text-blue-500" label="Work" />
                            <StatsRing percentage={stats.percentages.study} colorClass="text-indigo-400" label="Study" />
                            <StatsRing percentage={stats.percentages.health} colorClass="text-emerald-400" label="Health" />
                        </div>
                        <div className="space-y-6">
                            {Object.entries(stats.byCategory).map(([cat, mins]) => (
                                <div key={cat} className="group">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="capitalize text-slate-400 group-hover:text-slate-200 transition-colors">{cat}</span>
                                        <span className="font-mono text-slate-500">{Math.round(mins/60 * 10)/10}h</span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden shadow-inner">
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
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                    <h3 className="font-semibold text-slate-300 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Brain size={14} className="text-amber-400" /> Suggestions
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
                        <div className="text-center py-6 text-slate-500 text-sm">
                            Schedule is optimal for {selectedDay}.
                        </div>
                    )}
                </div>

                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl border border-indigo-500/30 p-5">
                    <h3 className="font-bold mb-2 text-indigo-200">Pro Tip</h3>
                    <p className="text-indigo-200/70 text-sm mb-0 leading-relaxed">
                        Deep work is best done in 90-minute blocks. Try scheduling your next block at 10:00 AM.
                    </p>
                </div>
            </div>

        </div>
      </main>
    </div>
  );
};

export default MainApp;