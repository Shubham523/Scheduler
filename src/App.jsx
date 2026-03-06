import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { getMessaging, getToken } from "firebase/messaging";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { 
  Calendar, Clock, Brain, Activity, Coffee, Briefcase, BookOpen, 
  Plus, Trash2, CheckCircle, Layout, Edit2, X, Save, AlertTriangle, 
  Download, Upload, Bell, BellOff, Play, Pause, RotateCcw, Music,
  Minimize2, Code, SquareDashedBottom, Sun, Moon, LogIn, LogOut, RefreshCw,MoreVertical 
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyD3kk6lsdTUtm-FqxXuXXWHzUZlskbm4hk",
  authDomain: "lifesync-73485.firebaseapp.com",
  projectId: "lifesync-73485",
  storageBucket: "lifesync-73485.firebasestorage.app",
  messagingSenderId: "846606800836",
  appId: "1:846606800836:web:3a20fe80eba7826f6a3691"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const messaging = typeof window !== 'undefined' && 
                  'serviceWorker' in navigator && 
                  window.isSecureContext ? getMessaging(app) : null;

// --- Constants ---
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const INITIAL_EVENTS = [
  { id: 1, title: "Deep Work / Coding", category: "work", start: "09:00", end: "11:00", days: ["Monday", "Wednesday", "Friday"] },
  { id: 2, title: "Team Sync", category: "work", start: "11:30", end: "12:30", days: ["Monday"] },
  { id: 3, title: "Lunch Break", category: "leisure", start: "12:30", end: "13:30", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
];

const CATEGORIES = {
  work: { label: "Work", color: "bg-blue-500/10 text-blue-600 dark:text-blue-200 border-blue-500/30", barColor: "bg-blue-500", icon: Briefcase },
  study: { label: "Study", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 border-indigo-500/30", barColor: "bg-indigo-500", icon: BookOpen },
  health: { label: "Health", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-200 border-emerald-500/30", barColor: "bg-emerald-500", icon: Activity },
  leisure: { label: "Leisure", color: "bg-orange-500/10 text-orange-600 dark:text-orange-200 border-orange-500/30", barColor: "bg-orange-500", icon: Coffee },
  chore: { label: "Chores", color: "bg-slate-200 dark:bg-slate-700/30 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600/30", barColor: "bg-slate-500", icon: Layout },
  google: { label: "G-Cal", color: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)]", barColor: "bg-sky-400", icon: Calendar }
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

const flashTabTitle = (message, stopRef) => {
  let isOriginal = true;
  const originalTitle = document.title;
  const interval = setInterval(() => {
    document.title = isOriginal ? "🔔 " + message : originalTitle;
    isOriginal = !isOriginal;
  }, 1000);
  
  stopRef.current = () => {
    clearInterval(interval);
    document.title = originalTitle;
  };
};

const sendSystemNotification = (title, options) => {
  if (Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.showNotification) reg.showNotification(title, options);
      else new Notification(title, options);
    }).catch(() => new Notification(title, options));
  } else {
    new Notification(title, options);
  }
};

// --- Components ---
const EventCard = ({ event, onDelete, onEdit, isActive }) => {
  const catConfig = CATEGORIES[event.category] || CATEGORIES.work;
  const Icon = catConfig.icon;

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isSwipeLockedIn = useRef(false);   // true once we commit to horizontal swipe
  const isScrollIntent = useRef(false);     // true once we detect vertical scroll intent
  const rafId = useRef(null);
  const cardRef = useRef(null);

  const DEAD_ZONE = 15;       // px before deciding swipe vs scroll
  const DELETE_THRESHOLD = 120; // px to trigger delete
  const RESISTANCE_POINT = 140; // px where rubber-band resistance kicks in

  // Attach touchmove as non-passive so e.preventDefault() works
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  });

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwipeLockedIn.current = false;
    isScrollIntent.current = false;
  };

  const handleTouchMove = (e) => {
    if (!touchStartX.current || isScrollIntent.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Dead zone: decide intent before doing anything
    if (!isSwipeLockedIn.current) {
      if (Math.abs(diffX) < DEAD_ZONE && Math.abs(diffY) < DEAD_ZONE) return; // still in dead zone
      if (Math.abs(diffY) > Math.abs(diffX)) {
        // Vertical movement dominates → user is scrolling, bail out
        isScrollIntent.current = true;
        return;
      }
      // Horizontal dominates → commit to swipe
      isSwipeLockedIn.current = true;
    }

    // Prevent page scroll while swiping horizontally
    e.preventDefault();

    // Apply rubber-band resistance past RESISTANCE_POINT
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      let offset;
      if (diffX > RESISTANCE_POINT) offset = RESISTANCE_POINT + (diffX - RESISTANCE_POINT) * 0.2;
      else if (diffX < -RESISTANCE_POINT) offset = -RESISTANCE_POINT + (diffX + RESISTANCE_POINT) * 0.2;
      else offset = diffX;
      setSwipeOffset(offset);
    });
  };

  const handleTouchEnd = () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    // Both directions trigger a delete!
    if (Math.abs(swipeOffset) > DELETE_THRESHOLD) {
      triggerDelete(swipeOffset > 0 ? 1 : -1);
    } else {
      setSwipeOffset(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    isSwipeLockedIn.current = false;
    isScrollIntent.current = false;
  };

  const triggerDelete = (direction = -1) => {
    setSwipeOffset(direction * 500); // Fly fully off in the swiped direction
    setIsExiting(true);   
    
    setTimeout(() => {
        onDelete(event.id);
    }, 300);
  };

  // Math for the background animations based on pull distance
  const progress = Math.min(Math.abs(swipeOffset) / DELETE_THRESHOLD, 1);
  const circleSize = Math.min(Math.abs(swipeOffset), 56); 
  const iconScale = 0.5 + (progress * 0.5); 

  return (
    <div className={`relative overflow-hidden transition-all duration-300 ease-out
      ${isExiting ? 'max-h-0 opacity-0 mb-0' : 'max-h-[250px] opacity-100 mb-3'}
    `}>
      
      {/* THE NEW BACKGROUND REVEAL LAYER */}
      <div className={`absolute inset-0 bg-red-400 dark:bg-red-500 rounded-xl flex items-center justify-between px-6 z-0 transition-opacity duration-150 ${swipeOffset !== 0 || isExiting ? 'opacity-100' : 'opacity-0'}`}>
         {/* Left Dustbin (Revealed when swiping right, swipeOffset > 0) */}
         <div className={`relative flex items-center justify-center transition-opacity duration-75 ${swipeOffset > 0 ? 'opacity-100' : 'opacity-0'}`}>
            <div 
               className="absolute bg-white/20 rounded-full transition-all duration-75 ease-out"
               style={{ width: `${circleSize}px`, height: `${circleSize}px`, opacity: progress }}
            />
            <Trash2 className="text-white relative z-10 transition-transform duration-75 ease-out" style={{ transform: `scale(${iconScale})` }} />
         </div>

         {/* Right Dustbin (Revealed when swiping left, swipeOffset < 0) */}
         <div className={`relative flex items-center justify-center transition-opacity duration-75 ${swipeOffset < 0 ? 'opacity-100' : 'opacity-0'}`}>
            <div 
               className="absolute bg-white/20 rounded-full transition-all duration-75 ease-out"
               style={{ width: `${circleSize}px`, height: `${circleSize}px`, opacity: progress }}
            />
            <Trash2 className="text-white relative z-10 transition-transform duration-75 ease-out" style={{ transform: `scale(${iconScale})` }} />
         </div>
      </div>

      {/* THE DRAGGABLE CARD LAYER */}
      <div 
        ref={cardRef}
        onTouchStart={event.category !== 'google' ? handleTouchStart : undefined}
        onTouchEnd={event.category !== 'google' ? handleTouchEnd : undefined}
        onDoubleClick={() => event.category !== 'google' && onEdit(event)}
        style={{ transform: `translateX(${swipeOffset}px)`, touchAction: 'pan-y' }}
        className={`relative group py-4 px-1 border cursor-pointer select-none
        ${isActive ? 'border-transparent shadow-[0_0_30px_rgba(56,189,248,0.25)] bg-gradient-to-r from-sky-100/80 to-transparent dark:from-sky-900/40 dark:to-slate-900' : `${catConfig.color} bg-white dark:bg-slate-900`}
        ${swipeOffset === 0 || isExiting ? 'transition-transform duration-300' : ''} 
        rounded-xl h-full w-full flex items-center z-10`}
      >

        {/* LEFT HINT: ⟨ */}
        <div className={`animate-pulse text-2xl font-light w-8 flex-shrink-0 flex justify-center transition-colors ${isActive ? 'text-sky-400/80' : 'text-slate-300 dark:text-slate-700'}`}>
          ⟨
        </div>

        {/* MAIN CONTENT */}
        <div className="flex justify-between items-start gap-3 flex-1 min-w-0 px-1">
          <div className="flex gap-4 min-w-0 flex-1">
            <div className="mt-1 flex-shrink-0">
              <Icon size={18} className={isActive ? 'text-sky-500' : 'opacity-80'} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-base tracking-wide truncate pr-2 text-gray-800 dark:text-slate-100">{event.title}</h4>
              <div className="flex items-center text-xs opacity-70 mt-1.5 gap-3 font-mono flex-wrap text-gray-600 dark:text-slate-300 w-full">
                <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> {event.start} - {event.end}</span>
                <span>•</span>
                <span>{Math.round(getDuration(event.start, event.end) / 60 * 10) / 10}h</span>
                {event.isBusy !== false && (
                  <span className="text-slate-500 dark:text-slate-400 font-medium ml-auto bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] mr-4 uppercase tracking-wide">Busy</span>
                )}
              </div>
              {event.venue && (
                <div className="flex items-center mt-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                  <span>📍 {event.venue}</span>
                </div>
              )}
            </div>
          </div>

          {/* DESKTOP BUTTONS (Fallback for non-touch users) */}
          <div className="flex gap-1 opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(event); }} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-500 dark:text-slate-300 transition-colors" 
              title="Edit Task"
            >
              <Edit2 size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); triggerDelete(-1); }} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-red-500 dark:text-red-400 transition-colors" 
              title="Delete Task"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* RIGHT HINT: ⟩ */}
        <div className={`animate-pulse text-2xl font-light w-8 flex-shrink-0 flex justify-center transition-colors ${isActive ? 'text-sky-400/80' : 'text-slate-300 dark:text-slate-700'}`}>
          ⟩
        </div>

      </div>
    </div>
  );
};

const SuggestionCard = ({ suggestion, onAccept }) => (
  <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 p-4 rounded-xl mb-3 hover:border-sky-500 dark:hover:border-sky-500/30 transition-colors">
    <div className="flex gap-3">
      <div className="bg-sky-100 dark:bg-sky-500/20 p-2 rounded-lg h-fit text-sky-600 dark:text-sky-400">
        <Brain size={18} />
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-gray-800 dark:text-slate-200 text-sm mb-1">{suggestion.title}</h4>
        <p className="text-gray-600 dark:text-slate-400 text-xs mb-3 leading-relaxed">{suggestion.reason}</p>
        <button onClick={onAccept} className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 w-fit">
          <Plus size={14} /> Add Block
        </button>
      </div>
    </div>
  </div>
);

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

const EventModal = ({ isOpen, onClose, onSave, initialData, currentDay, initialStart, initialEnd }) => {
  const [formData, setFormData] = useState({ 
    title: '', category: 'work', start: '09:00', end: '10:00', days: [currentDay], isRecurring: false, venue: '', isBusy: true
  });

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData, isRecurring: initialData.days && initialData.days.length > 1, venue: initialData.venue || '', isBusy: initialData.isBusy !== false });
    } else {
      setFormData({ title: '', category: 'work', start: initialStart || '09:00', end: initialEnd || '10:00', days: [currentDay], isRecurring: false, venue: '', isBusy: true });
    }
  }, [initialData, isOpen, currentDay, initialStart, initialEnd]);

  const toggleDay = (day) => {
    if (formData.days.includes(day)) {
        if (formData.days.length > 1) setFormData(prev => ({ ...prev, days: prev.days.filter(d => d !== day) }));
    } else {
        setFormData(prev => ({ ...prev, days: [...prev.days, day] }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border-t sm:border border-gray-200 dark:border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom sm:zoom-in duration-300">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-slate-800/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${initialData ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/20'}`}>
              {initialData ? <Edit2 size={16} /> : <Plus size={16} />}
            </div>
            <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">{initialData ? 'Edit Task' : 'New Task'}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          <div className="space-y-4">
            
            {/* Task Name */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">Task Details</label>
              <input 
                type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-sky-500/50 focus:bg-white dark:focus:bg-slate-900 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-200 outline-none transition-all"
                placeholder="What are you doing? (e.g. Physics Class)" autoFocus
              />
              <input 
                type="text" value={formData.venue || ''} onChange={(e) => setFormData({...formData, venue: e.target.value})}
                className="w-full mt-2 bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-sky-500/50 focus:bg-white dark:focus:bg-slate-900 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-200 outline-none transition-all"
                placeholder="Where? (e.g. LT-3, Physics Lab)"
              />
            </div>

            {/* Overlap Prevention */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-colors cursor-pointer" onClick={() => setFormData({...formData, isBusy: !formData.isBusy})}>
               <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${formData.isBusy ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/20' : 'bg-gray-200 text-gray-500 dark:bg-slate-800'}`}>
                    <AlertTriangle size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Prevent Overlaps</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">Mark as busy during this time</p>
                  </div>
               </div>
               <input 
                   type="checkbox" checked={formData.isBusy}
                   onChange={(e) => setFormData({...formData, isBusy: e.target.checked})}
                   className="w-4 h-4 rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                   onClick={(e) => e.stopPropagation()}
               />
            </div>

            {/* Schedule Section */}
            <div>
               <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Schedule</label>
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, isRecurring: !prev.isRecurring, days: !prev.isRecurring ? prev.days : [currentDay] }))}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${formData.isRecurring ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                  >
                    {formData.isRecurring ? 'RECURRING' : 'ONCE'}
                  </button>
               </div>

               {formData.isRecurring ? (
                  <div className="flex justify-between gap-1 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-transparent">
                      {DAYS_OF_WEEK.map(day => (
                          <button key={day} onClick={() => toggleDay(day)} className={`flex-1 aspect-square sm:aspect-auto sm:h-9 text-[10px] font-bold rounded-lg transition-all ${formData.days.includes(day) ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
                              {day[0]}
                          </button>
                      ))}
                  </div>
               ) : (
                  <div className="text-xs font-semibold text-gray-700 dark:text-slate-300 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center gap-3">
                      <Calendar size={14} className="text-sky-500" />
                      {formData.days[0] || currentDay}
                  </div>
               )}
            </div>

            {/* Time Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">Start</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="time" value={formData.start} onChange={(e) => setFormData({...formData, start: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-sky-500/50 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold text-gray-800 dark:text-slate-200 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">End</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="time" value={formData.end} onChange={(e) => setFormData({...formData, end: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-sky-500/50 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold text-gray-800 dark:text-slate-200 outline-none" />
                </div>
              </div>
            </div>

            {/* Category Grid */}
            <div>
               <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Category</label>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button 
                      key={key} 
                      onClick={() => setFormData({...formData, category: key})} 
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${formData.category === key 
                        ? `${cat.color} border-current ring-1 ring-current` 
                        : 'border-transparent bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                    >
                      <cat.icon size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-tight">{cat.label}</span>
                    </button>
                  ))}
               </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-800/50 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">Cancel</button>
          <button 
            onClick={() => onSave(formData)} 
            disabled={!formData.title} 
            className="flex-[2] py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-600/20 flex justify-center items-center gap-2"
          >
            <Save size={16} /> {initialData ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MainApp = () => {

  // 1. Core Device ID Initialization (Crucial for Cloud Sync and Notifications)
  const deviceId = useMemo(() => {
    let id = localStorage.getItem('lifeSyncDeviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('lifeSyncDeviceId', id);
    }
    return id;
  }, []);

  const [events, setEvents] = useState(() => {
    try {
        const saved = localStorage.getItem('lifeSyncEvents');
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_EVENTS;
  });

  const [user, setUser] = useState(null);
  const [gcalEvents, setGcalEvents] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, "userSchedules", u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().events) setEvents(docSnap.data().events);
        fetchGCal(localStorage.getItem('gcalToken'));
      }
    });
    return () => unsubscribe();
  }, []);
  const handleSync = async () => {
    const success = await fetchGCal();
    if (!success) {
      // Token expired or missing, trigger re-auth without logout
      handleLogin();
    } else {
      showNotification("Calendar synced!");
    }
  };
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    try {
      // If popup still fails due to COOP, you can use signInWithRedirect(auth, provider)
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      localStorage.setItem('gcalToken', token);
      fetchGCal(token);
      showNotification("Logged in and synced!");
    } catch (err) { 
      console.error("LOGIN ERROR:", err);
      showNotification("Login failed. Check console.", "error"); 
    }
  };

  const fetchGCal = async (token = localStorage.getItem('gcalToken')) => {
    if (!token) return false;
    setIsSyncing(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() + 7);

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.status === 401) {
        localStorage.removeItem('gcalToken');
        setIsSyncing(false);
        return false; // Signal that we need a new token
      }

      const data = await res.json();
      if (data.items) {
        const formatted = data.items.map(item => {
          const startDT = new Date(item.start.dateTime || item.start.date);
          const endDT = new Date(item.end.dateTime || item.end.date);
          const dayName = DAYS_OF_WEEK[startDT.getDay() === 0 ? 6 : startDT.getDay() - 1];

          return {
            id: item.id,
            title: item.summary,
            category: 'google',
            start: startDT.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            end: endDT.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            days: [dayName], 
            isBusy: item.transparency !== 'transparent'
          };
        });
        setGcalEvents(formatted);
      }
      setIsSyncing(false);
      return true;
    } catch (e) { 
      console.error("FETCH ERROR:", e); 
      setIsSyncing(false);
      return false;
    }
  };
  const [selectedDay, setSelectedDay] = useState(() => {
  const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return dayMap[new Date().getDay()];
  });
  const [showUpNext, setShowUpNext] = useState(true);
  const [currentTimeMins, setCurrentTimeMins] = useState(() => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
  });
  useEffect(() => {
      const timer = setInterval(() => {
          const now = new Date();
          setCurrentTimeMins(now.getHours() * 60 + now.getMinutes());
      }, 60000); 
      return () => clearInterval(timer);
  }, []);
  const [notification, setNotification] = useState(null);
  const [customSoundUrl, setCustomSoundUrl] = useState(() => localStorage.getItem('lifeSyncCustomSound') || null);
  const [activeAlert, setActiveAlert] = useState(null);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('lifeSyncNotifications') === 'true';
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('theme') === 'dark' || 
                 (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
      return true;
  });

  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [smartTime, setSmartTime] = useState({ start: '09:00', end: '10:00' });

  // 2. Updated Firestore Sync Function
    const updateSchedule = async (newEvents) => {
    setEvents(newEvents); 
    try {
      if (deviceId) {
        // Optimization: Create a unique list of all start times in minutes
        const activeMinutes = Array.from(new Set(
          newEvents.map(e => {
            const [h, m] = e.start.split(':').map(Number);
            return h * 60 + m;
          })
        ));
        await setDoc(doc(db, "userSchedules", user ? user.uid : deviceId), {
          events: newEvents,
          activeMinutes: activeMinutes, // New Attribute
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error("Firestore Save Error:", error);
    }
  };
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const audioLoopInterval = useRef(null);
  const flashStopRef = useRef(null);
  const customAudioPlayer = useRef(null);

  useEffect(() => {
    localStorage.setItem('lifeSyncEvents', JSON.stringify(events));
  }, [events]);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
      if (isDarkMode) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  const startSyntheticVibrantLoop = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playChime = () => {
        const t = audioCtx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => { 
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0, t + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.5);
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.5);
        });
    };
    playChime();
    audioLoopInterval.current = setInterval(playChime, 2500);
  };

  const triggerAlert = (title, message) => {
    if (!notificationsEnabled) return;
    if (activeAlert) return; 

    setActiveAlert({ title, message });
    sendSystemNotification(`Alert: ${title}`, { body: message, icon: '/vite.svg', requireInteraction: true });
    flashTabTitle(`Alert: ${title}`, flashStopRef);

    if (customSoundUrl) {
        customAudioPlayer.current = new Audio(customSoundUrl);
        customAudioPlayer.current.loop = true;
        customAudioPlayer.current.play().catch(() => {
            startSyntheticVibrantLoop();
        });
    } else {
        startSyntheticVibrantLoop();
    }
  };

  const dismissAlert = () => {
    setActiveAlert(null);
    if (audioLoopInterval.current) clearInterval(audioLoopInterval.current);
    if (flashStopRef.current) flashStopRef.current();
    if (customAudioPlayer.current) {
        customAudioPlayer.current.pause();
        customAudioPlayer.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (!notificationsEnabled) return;

    const checkNotifications = () => {
        if (activeAlert) return; 
        
        const now = new Date();
        const currentDayIndex = now.getDay(); 
        const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayStr = dayMap[currentDayIndex];
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMins = currentHour * 60 + currentMinute;

        events.forEach(event => {
            if (event.days && event.days.includes(todayStr)) {
                const eventStartMins = timeToMinutes(event.start);
                const diff = eventStartMins - currentTimeInMins;
                const eventUid = `${event.id}-${todayStr}`; 

                if (diff > 0 && diff <= 5 && !notifiedEvents.has(eventUid)) {
                    triggerAlert(event.title, `Starting in ${diff} minutes (${event.start})`);
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
  }, [events, notificationsEnabled, notifiedEvents, activeAlert]);

  // 3. Robust Notification Toggle Logic
  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('lifeSyncNotifications', 'false');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      showNotification("Push notifications not supported by your browser", "error");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showNotification("Notification permission denied", "error");
        return;
      }

      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await navigator.serviceWorker.ready; // Fixes pushManager error

      if (!messaging) {
         showNotification("Messaging service failed to load", "error");
         return;
      }

      const currentToken = await getToken(messaging, { 
        vapidKey: 'BMOZR-PBqFw-3ds-7PskvNkqjiQbcsKlV9-CRN3IU9lwd--OoKz5GLJU2YDJhpsrMMozU7EqSZ-W4FDQXRI44tQ', 
        serviceWorkerRegistration: registration
      });
    
      if (currentToken) {
        await setDoc(doc(db, "deviceTokens", deviceId), {
          token: currentToken,
          updatedAt: new Date()
        });
        setNotificationsEnabled(true);
        localStorage.setItem('lifeSyncNotifications', 'true');
        showNotification("Notifications enabled");
      }
    } catch (err) {
      console.error("Token Error:", err);
      showNotification("Failed to connect notifications.", "error");
    }
  };

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCustomAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showNotification("Audio file must be less than 2MB.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const base64Audio = event.target.result;
        setCustomSoundUrl(base64Audio);
        try {
            localStorage.setItem('lifeSyncCustomSound', base64Audio);
            showNotification("Custom alert sound saved!");
        } catch (e) {
            showNotification("File too large for local storage.", "error");
        }
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const removeCustomAudio = () => {
      setCustomSoundUrl(null);
      localStorage.removeItem('lifeSyncCustomSound');
      showNotification("Restored default alert chime.");
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
            return { start: minutesToTime(currentPointer), end: minutesToTime(currentPointer + blockDuration) };
        }
        if (eEnd > currentPointer) {
            currentPointer = eEnd;
        }
    }
    if (currentPointer + blockDuration < 24 * 60) {
        return { start: minutesToTime(currentPointer), end: minutesToTime(currentPointer + blockDuration) };
    }
    return { start: '09:00', end: '10:00' };
  };

  const checkOverlap = (newEvent, excludeId = null) => {
    if (newEvent.isBusy === false) return null; // "Free" tasks never cause conflicts

    const newStart = timeToMinutes(newEvent.start);
    const newEnd = timeToMinutes(newEvent.end);
    const relevantEvents = events.filter(e => e.id !== excludeId && e.days.some(day => newEvent.days.includes(day)));

    return relevantEvents.find(e => {
      if (e.isBusy === false) return false; // Ignore existing tasks marked as "Free"
      
      const eStart = timeToMinutes(e.start);
      const eEnd = timeToMinutes(e.end);
      return (newStart < eEnd && newEnd > eStart);
    });
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setSmartTime(findNextFreeSlot(selectedDay));
    setIsModalOpen(true);
  };

  const handleQuickAddEmpty = () => {
    const slot = findNextFreeSlot(selectedDay);
    const newEvent = { id: Date.now(), title: "Empty Slot", category: "empty", start: slot.start, end: slot.end, days: [selectedDay] };
    const overlap = checkOverlap(newEvent);
    
    if (overlap) return showNotification("Schedule full! Cannot add empty block.", "error");
    updateSchedule([...events, newEvent]);
    showNotification("Added Empty Block at " + slot.start);
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    setSmartTime({ start: event.start, end: event.end });
    setIsModalOpen(true);
  };

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

  const handleImportClick = () => fileInputRef.current.click();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedEvents = JSON.parse(event.target.result);
            if (Array.isArray(importedEvents)) {
                updateSchedule(importedEvents);
                showNotification("Schedule restored successfully!");
            }
        } catch (error) {}
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const displayedEvents = useMemo(() => {
    const all = [...events, ...gcalEvents];
    return all.filter(e => (e.days && e.days.includes(selectedDay))).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  }, [events, gcalEvents, selectedDay]);

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
    if (displayedEvents.length > 0 && (!byCategory.health || byCategory.health < 30)) {
        suggs.push({
            id: 'missing-health', title: "No Movement",
            reason: "Missing physical activity.",
            action: { title: "Walk", category: "health", start: "18:00", end: "18:30", days: [selectedDay] }
        });
    }
    return suggs;
  }, [stats, displayedEvents, selectedDay]);
  const exportData = () => {
    const dataStr = JSON.stringify(events);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'lifesync_backup.json');
    linkElement.click();
  };
  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedEvents = JSON.parse(event.target.result);
        setEvents(importedEvents);
        showNotification("Schedule imported!");
      } catch (err) {
        showNotification("Invalid file format", "error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-800 dark:text-slate-200 font-sans pb-10 transition-colors duration-300">
      
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
      <input type="file" ref={audioInputRef} onChange={handleCustomAudioUpload} className="hidden" accept="audio/*" />

      {activeAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white dark:bg-slate-900 border-2 border-sky-500 rounded-3xl p-8 text-center max-w-sm w-full shadow-[0_0_80px_rgba(14,165,233,0.4)] animate-bounce-in">
                <div className="relative inline-block mb-4">
                   <div className="absolute inset-0 bg-sky-500 rounded-full animate-ping opacity-75"></div>
                   <Bell className="w-16 h-16 text-sky-500 relative z-10" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">{activeAlert.title}</h2>
                <p className="text-gray-500 dark:text-slate-400 mb-8 font-medium">{activeAlert.message}</p>
                <button onClick={dismissAlert} className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-sky-500/50">
                   Dismiss & Stop Audio
                </button>
             </div>
          </div>
      )}

      <EventModal 
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} 
        onSave={(data) => {
          // Check for conflicts before saving
          const conflict = checkOverlap(data, editingEvent ? editingEvent.id : null);
          if (conflict) {
            const proceed = window.confirm(`This overlaps with a busy block: "${conflict.title}". Do you still want to save?`);
            if (!proceed) return;
          }

          let newEvents;
          if (editingEvent) newEvents = events.map(e => e.id === editingEvent.id ? {...data, id: e.id} : e);
          else newEvents = [...events, {...data, id: Date.now().toString()}];
          updateSchedule(newEvents);
          setIsModalOpen(false);
        }}
        initialData={editingEvent} currentDay={selectedDay}
        initialStart={smartTime.start} initialEnd={smartTime.end}
      />

    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4">
          
          {/* Row 1: Brand & Actions */}
          <div className="flex items-center justify-between py-2.5 mb-2.5">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="bg-sky-600 p-1.5 rounded-lg text-white shadow-lg shadow-sky-500/20">
                <Activity size={18} />
              </div>
              <h1 className="font-bold text-lg">LifeSync</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {user && (
                <button 
                  onClick={handleSync} 
                  className={`p-2 rounded-lg text-slate-500 hover:text-sky-500 transition-colors ${isSyncing ? 'animate-spin' : ''}`}
                  title="Refresh Calendar"
                >
                  <RefreshCw size={18}/>
                </button>
)}

              <button 
                onClick={toggleNotifications} 
                className={`p-2 rounded-lg transition-all border ${notificationsEnabled 
                  ? 'text-emerald-500 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                  : 'text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:text-slate-500'}`}
                title={notificationsEnabled ? 'Notifications ON — tap to disable' : 'Notifications OFF — tap to enable'}
              >
                {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              </button>

              <button onClick={() => { setEditingEvent(null); setIsModalOpen(true); }} className="bg-sky-600 p-2 rounded-lg text-white shadow-lg shadow-sky-600/20 active:scale-95 transition-transform">
                <Plus size={18}/>
              </button>

              {user ? (
                  <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                      <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
                  </div>
              ) : (
                  <button onClick={handleLogin} className="p-2 text-sky-600 dark:text-sky-400 font-bold text-xs"><LogIn size={20}/></button>
              )}

              {/* 3-Dot Menu */}
              <div className="relative" ref={menuRef}>
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <MoreVertical size={20} />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden py-1 z-[60]">
                    <button onClick={() => { setIsDarkMode(!isDarkMode); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      {isDarkMode ? <Sun size={16}/> : <Moon size={16}/>}
                      {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                    </button>
                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
                    <button onClick={() => { exportData(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <Download size={16}/> Export Schedule
                    </button>
                    <button onClick={() => { fileInputRef.current.click(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <Upload size={16}/> Import Schedule
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={importData} />
                    {user && (
                      <>
                        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
                        <button onClick={() => { signOut(auth); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <LogOut size={16}/> Logout
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Day Selection */}
          <div className="flex gap-1.5 pb-6 overflow-x-auto no-scrollbar justify-between">
            {DAYS_OF_WEEK.map(d => (
                <button 
                  key={d} 
                  onClick={() => setSelectedDay(d)} 
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all uppercase tracking-wider border ${selectedDay === d 
                    ? 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-500/20' 
                    : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 border-transparent hover:border-slate-300 dark:hover:border-slate-700'}`}
                >
                  {d.slice(0,3)}
                </button>
            ))}
          </div>

        </div>
      </header>
      {notification && (
        <div className={`fixed bottom-10 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-lg shadow-2xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-50 font-medium 
          ${notification.type === 'error' ? 'bg-red-500 text-white' : 
            notification.type === 'info' ? 'bg-slate-700 dark:bg-slate-600 text-slate-100' : // Softer, darker theme for standard info/delete
            'bg-emerald-600 text-white'}`} // Success
        >
          {notification.type === 'error' ? <AlertTriangle size={18} /> : 
          notification.type === 'info' ? <Trash2 size={18} /> : 
          <CheckCircle size={18} />}
          {notification.msg}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 mt-8 flex-1">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
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
                                <button onClick={openAddModal} className="mt-4 text-sky-500 hover:text-sky-400 text-sm font-medium">+ Create one now</button>
                            </div>
                        ) : (
                            <div className="relative ml-2 space-y-2">
                                {displayedEvents.map((event) => {
                                  const startMins = timeToMinutes(event.start);
                                  const endMins = timeToMinutes(event.end);
                                  const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                                  const isToday = selectedDay === dayMap[new Date().getDay()];
                                  const isActive = isToday && (currentTimeMins >= startMins && currentTimeMins < endMins);

                                  return (
                                    <EventCard 
                                      key={event.id} 
                                      event={event} 
                                      isActive={isActive}
                                      onDelete={(id) => {
                                        updateSchedule(events.filter(e => e.id !== id));
                                        showNotification("Task deleted", "info");
                                      }}
                                      onEdit={openEditModal} 
                                    />
                                  );
                                })}
                            </div>
                        )}
                    </div>
            </div>

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
                                    updateSchedule([...events, newAction]);
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
            </div>

        </div>
      </main>

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