/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  Settings, 
  Radio, 
  Music, 
  Upload, 
  Trash2, 
  LayoutDashboard,
  ListMusic,
  Mic2,
  Heart,
  MessageSquare,
  Send,
  X,
  BarChart3,
  Edit2,
  Save,
  Search,
  Globe,
  RadioTower,
  Mic,
  StopCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Song {
  id: number;
  title: string;
  artist: string;
  filename: string;
  added_at: string;
}

interface SongRequest {
  id: number;
  song_name: string;
  listener_name: string;
  message: string;
  created_at: string;
}

export default function App() {
  const [view, setView] = useState<'player' | 'cpanel'>('player');
  const [panelTab, setPanelTab] = useState<'dashboard' | 'songs' | 'requests' | 'settings'>('dashboard');
  const [songs, setSongs] = useState<Song[]>([]);
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [stats, setStats] = useState({ songCount: 0, requestCount: 0, listeners: 0 });
  const [settings, setSettings] = useState({ name: 'Radio Estelar', slogan: 'En Vivo • 98.5 FM' });
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isUploading, setIsUploading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [newRequest, setNewRequest] = useState({ song_name: '', listener_name: '', message: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ title: '', artist: '' });
  const [isLive, setIsLive] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [onlineSearchResults, setOnlineSearchResults] = useState<any[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);

  useEffect(() => {
    fetchSongs();
    fetchRequests();
    fetchStats();
    fetchSettings();
    setupWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const setupWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'GET_STATUS' }));
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.type === 'LIVE_STATUS') {
          setIsLive(message.active);
          if (message.active && !isBroadcasting) {
            setupLivePlayer();
          }
        }
      } else if (event.data instanceof Blob) {
        const buffer = await event.data.arrayBuffer();
        handleLiveAudio(buffer);
      }
    };
  };

  const setupLivePlayer = () => {
    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(ms);
        ms.addEventListener('sourceopen', () => {
          const sb = ms.addSourceBuffer('audio/webm; codecs=opus');
          sourceBufferRef.current = sb;
          sb.addEventListener('updateend', () => {
            if (queueRef.current.length > 0 && !sb.updating) {
              sb.appendBuffer(queueRef.current.shift()!);
            }
          });
        });
      }
    }
  };

  const handleLiveAudio = (buffer: ArrayBuffer) => {
    if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
      sourceBufferRef.current.appendBuffer(buffer);
    } else {
      queueRef.current.push(buffer);
    }
    if (audioRef.current && audioRef.current.paused && isLive) {
      audioRef.current.play().catch(() => {});
    }
  };

  const startBroadcasting = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(e.data);
        }
      };

      mr.start(1000); // Send chunks every second
      setIsBroadcasting(true);
      wsRef.current?.send(JSON.stringify({ type: 'START_LIVE' }));
    } catch (err) {
      console.error("Error al acceder al micrófono", err);
      alert("No se pudo acceder al micrófono. Por favor, verifica los permisos.");
    }
  };

  const stopBroadcasting = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsBroadcasting(false);
    wsRef.current?.send(JSON.stringify({ type: 'STOP_LIVE' }));
  };

  const fetchSongs = async () => {
    try {
      const res = await fetch('/api/songs');
      const data = await res.json();
      setSongs(data);
    } catch (err) {
      console.error("Error al cargar canciones", err);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/requests');
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error("Error al cargar solicitudes", err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Error al cargar estadísticas", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.name) setSettings({ name: data.name, slogan: data.slogan || 'En Vivo • 98.5 FM' });
    } catch (err) {
      console.error("Error al cargar ajustes", err);
    }
  };

  const updateSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      alert('Ajustes guardados correctamente');
    } catch (err) {
      console.error("Error al guardar ajustes", err);
    }
  };

  const startEditing = (song: Song) => {
    setEditingSongId(song.id);
    setEditData({ title: song.title, artist: song.artist });
  };

  const saveSongEdit = async (id: number) => {
    try {
      await fetch(`/api/songs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      setEditingSongId(null);
      fetchSongs();
    } catch (err) {
      console.error("Error al editar canción", err);
    }
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequest),
      });
      if (res.ok) {
        setNewRequest({ song_name: '', listener_name: '', message: '' });
        setShowRequestModal(false);
        fetchRequests();
        alert('¡Solicitud enviada con éxito!');
      }
    } catch (err) {
      console.error("Error al enviar solicitud", err);
    }
  };

  const deleteRequest = async (id: number) => {
    try {
      await fetch(`/api/requests/${id}`, { method: 'DELETE' });
      fetchRequests();
    } catch (err) {
      console.error("Error al eliminar solicitud", err);
    }
  };

  const currentSong = songs[currentSongIndex];

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Error al reproducir", e));
    }
    setIsPlaying(!isPlaying);
  };

  const nextSong = () => {
    if (queue.length > 0) {
      const nextFromQueue = queue[0];
      setQueue(prev => prev.slice(1));
      const index = songs.findIndex(s => s.id === nextFromQueue.id);
      if (index !== -1) {
        setCurrentSongIndex(index);
      }
    } else if (songs.length > 0) {
      setCurrentSongIndex((prev) => (prev + 1) % songs.length);
    }
    setIsPlaying(true);
  };

  const prevSong = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

  const addToQueue = (song: Song) => {
    setQueue(prev => [...prev, song]);
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const searchMusicOnline = async (query: string) => {
    if (!query) return;
    setIsSearchingOnline(true);
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Busca información detallada sobre la canción o artista "${query}". Devuelve una lista de 5 resultados posibles en formato JSON. Cada resultado debe tener: title, artist, album, year, genre. Solo devuelve el JSON puro.`,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const results = JSON.parse(response.text || "[]");
      setOnlineSearchResults(results);
    } catch (err) {
      console.error("Error en búsqueda online", err);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const importOnlineSong = async (songData: any) => {
    try {
      await fetch('/api/songs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(songData),
      });
      fetchSongs();
      alert(`"${songData.title}" se ha añadido a tu biblioteca (Simulado)`);
    } catch (err) {
      console.error("Error al importar canción", err);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
  }, [currentSongIndex]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
    formData.append('artist', 'Artista Local');

    try {
      const res = await fetch('/api/songs/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        await fetchSongs();
      }
    } catch (err) {
      console.error("Error al subir archivo", err);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteSong = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta canción?')) return;
    try {
      await fetch(`/api/songs/${id}`, { method: 'DELETE' });
      await fetchSongs();
    } catch (err) {
      console.error("Error al eliminar", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Radio className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{settings.name}</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500 font-semibold">{settings.slogan}</p>
              {isLive && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500 text-[8px] font-bold text-white rounded uppercase animate-pulse">
                  <Wifi className="w-2 h-2" /> En Vivo
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => setView('player')}
            className={`px-6 py-2 rounded-xl text-sm font-medium transition-all ${view === 'player' ? 'bg-white text-black shadow-xl' : 'text-white/60 hover:text-white'}`}
          >
            Escuchar
          </button>
          <button 
            onClick={() => setView('cpanel')}
            className={`px-6 py-2 rounded-xl text-sm font-medium transition-all ${view === 'cpanel' ? 'bg-white text-black shadow-xl' : 'text-white/60 hover:text-white'}`}
          >
            cPanel
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        <AnimatePresence mode="wait">
          {view === 'player' ? (
            <motion.div 
              key="player"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-2 gap-16 items-center min-h-[60vh]"
            >
              {/* Left: Visualizer/Art */}
              <div className="relative aspect-square max-w-md mx-auto lg:mx-0">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-[3rem] blur-2xl animate-pulse" />
                <div className="relative h-full w-full bg-zinc-900 rounded-[3rem] border border-white/10 overflow-hidden flex items-center justify-center group">
                  {currentSong ? (
                    <div className="text-center p-8">
                      <motion.div 
                        animate={isPlaying ? { scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] } : {}}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="w-48 h-48 mx-auto bg-zinc-800 rounded-full flex items-center justify-center mb-8 border-4 border-emerald-500/30 shadow-2xl"
                      >
                        <Music className="w-20 h-20 text-emerald-500" />
                      </motion.div>
                      <h2 className="text-3xl font-bold mb-2 truncate">{currentSong.title}</h2>
                      <p className="text-emerald-500 font-medium">{currentSong.artist}</p>
                    </div>
                  ) : (
                    <div className="text-center opacity-40">
                      <Radio className="w-24 h-24 mx-auto mb-4" />
                      <p>No hay canciones en la lista</p>
                    </div>
                  )}
                  
                  {/* Floating Elements */}
                  <div className="absolute top-6 right-6 flex gap-2">
                    <div className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                      HD Audio
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex flex-col justify-center">
                <div className="mb-12">
                  <span className="text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-4 block">Reproduciendo Ahora</span>
                  <h3 className="text-5xl font-bold tracking-tighter mb-4 leading-tight">
                    {currentSong?.title || "Sintonizando..."}
                  </h3>
                  <div className="flex items-center gap-4 text-white/60">
                    <span className="flex items-center gap-2"><Mic2 className="w-4 h-4" /> Locutor: IA Estelar</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> 1.2k Oyentes</span>
                  </div>
                </div>

                {/* Progress Bar (Simulated) */}
                <div className="mb-12">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-500"
                      initial={{ width: "0%" }}
                      animate={isPlaying ? { width: "100%" } : {}}
                      transition={{ duration: 180, ease: "linear" }}
                    />
                  </div>
                  <div className="flex justify-between mt-3 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                    <span>0:00</span>
                    <span>En Vivo</span>
                  </div>
                </div>

                {/* Main Controls */}
                <div className="flex items-center gap-8 mb-12">
                  <button onClick={prevSong} className="p-4 rounded-full hover:bg-white/5 transition-colors text-white/60 hover:text-white">
                    <SkipBack className="w-8 h-8" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-2xl shadow-white/10"
                  >
                    {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-1" />}
                  </button>
                  <button onClick={nextSong} className="p-4 rounded-full hover:bg-white/5 transition-colors text-white/60 hover:text-white">
                    <SkipForward className="w-8 h-8" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  {/* Volume */}
                  <div className="flex items-center gap-4 flex-1 max-w-xs">
                    <Volume2 className="w-5 h-5 text-white/40" />
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  <button 
                    onClick={() => setShowRequestModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    Pedir Canción
                  </button>
                </div>
              </div>

              {/* Request Modal */}
              <AnimatePresence>
                {showRequestModal && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowRequestModal(false)}
                      className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl"
                    >
                      <button 
                        onClick={() => setShowRequestModal(false)}
                        className="absolute top-6 right-6 p-2 text-white/40 hover:text-white transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <h3 className="text-2xl font-bold mb-6">Pedir una Canción</h3>
                      
                      <form onSubmit={submitRequest} className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Nombre de la Canción</label>
                          <input 
                            required
                            type="text" 
                            value={newRequest.song_name}
                            onChange={(e) => setNewRequest({...newRequest, song_name: e.target.value})}
                            placeholder="Ej: Bohemian Rhapsody"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Tu Nombre</label>
                          <input 
                            type="text" 
                            value={newRequest.listener_name}
                            onChange={(e) => setNewRequest({...newRequest, listener_name: e.target.value})}
                            placeholder="Anónimo"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Mensaje (Opcional)</label>
                          <textarea 
                            value={newRequest.message}
                            onChange={(e) => setNewRequest({...newRequest, message: e.target.value})}
                            placeholder="¡Un saludo para todos!"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors h-24 resize-none"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-black font-bold py-4 rounded-xl hover:scale-[1.02] transition-transform shadow-xl shadow-emerald-500/20"
                        >
                          <Send className="w-4 h-4" />
                          Enviar Solicitud
                        </button>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="cpanel"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900/50 border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-2xl shadow-2xl"
            >
              <div className="grid lg:grid-cols-[280px_1fr] min-h-[70vh]">
                {/* Sidebar */}
                <aside className="border-r border-white/5 p-8 bg-black/20">
                  <div className="flex items-center gap-3 mb-12">
                    <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                      <Settings className="w-4 h-4" />
                    </div>
                    <span className="font-bold tracking-tight">Panel de Control</span>
                  </div>

                  <nav className="space-y-2">
                    <button 
                      onClick={() => setPanelTab('dashboard')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'dashboard' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <BarChart3 className="w-4 h-4" /> Dashboard
                    </button>
                    <button 
                      onClick={() => setPanelTab('songs')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'songs' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <ListMusic className="w-4 h-4" /> Biblioteca
                    </button>
                    <button 
                      onClick={() => setPanelTab('requests')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'requests' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <MessageSquare className="w-4 h-4" /> Solicitudes
                    </button>
                    <button 
                      onClick={() => setPanelTab('broadcast')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'broadcast' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <RadioTower className="w-4 h-4" /> Emisión en Vivo
                    </button>
                    <button 
                      onClick={() => setPanelTab('online-search')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'online-search' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <Search className="w-4 h-4" /> Buscador Web
                    </button>
                    <button 
                      onClick={() => setPanelTab('settings')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${panelTab === 'settings' ? 'bg-white/5 text-emerald-500' : 'text-white/60 hover:bg-white/5'}`}
                    >
                      <Settings className="w-4 h-4" /> Ajustes
                    </button>
                  </nav>

                  <div className="mt-auto pt-12">
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Estado del Servidor</p>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Operativo
                      </div>
                    </div>
                  </div>
                </aside>

                {/* Content */}
                <div className="p-12 overflow-y-auto max-h-[70vh]">
                  {panelTab === 'dashboard' && (
                    <div className="space-y-12">
                      <div className="grid grid-cols-3 gap-6">
                        <div className="p-8 bg-white/5 border border-white/5 rounded-3xl">
                          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-4">Canciones</p>
                          <h4 className="text-4xl font-bold">{stats.songCount}</h4>
                        </div>
                        <div className="p-8 bg-white/5 border border-white/5 rounded-3xl">
                          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-4">Solicitudes</p>
                          <h4 className="text-4xl font-bold">{stats.requestCount}</h4>
                        </div>
                        <div className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl">
                          <p className="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-4">Oyentes Online</p>
                          <h4 className="text-4xl font-bold text-emerald-500">{stats.listeners}</h4>
                        </div>
                      </div>

                      <div className="p-8 bg-white/5 border border-white/5 rounded-3xl">
                        <h3 className="text-xl font-bold mb-6">Actividad Reciente</h3>
                        <div className="space-y-4">
                          {requests.slice(0, 3).map(req => (
                            <div key={req.id} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center">
                                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{req.song_name}</p>
                                  <p className="text-xs text-white/40">{req.listener_name}</p>
                                </div>
                              </div>
                              <span className="text-[10px] text-white/20">{new Date(req.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {panelTab === 'songs' && (
                    <>
                      <div className="flex items-center justify-between mb-12">
                        <div>
                          <h2 className="text-3xl font-bold tracking-tight mb-2">Biblioteca Musical</h2>
                          <p className="text-white/40 text-sm">Gestiona las pistas de tu emisora</p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input 
                              type="text" 
                              placeholder="Buscar canción..." 
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-64"
                            />
                          </div>
                          <label className="cursor-pointer group">
                            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                            <div className={`flex items-center gap-3 px-6 py-3 bg-emerald-500 text-black rounded-xl font-bold text-sm transition-all group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-emerald-500/20 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                              <Upload className="w-4 h-4" />
                              {isUploading ? 'Subiendo...' : 'Subir'}
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Songs Table */}
                      <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/5">
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Título</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Artista</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Fecha</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {songs.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.artist.toLowerCase().includes(searchQuery.toLowerCase())).map((song) => (
                              <tr key={song.id} className="group hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                  {editingSongId === song.id ? (
                                    <input 
                                      className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-sm w-full"
                                      value={editData.title}
                                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                                    />
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center">
                                        <Music className="w-4 h-4 text-white/40" />
                                      </div>
                                      <span className="font-medium">{song.title}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  {editingSongId === song.id ? (
                                    <input 
                                      className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-sm w-full"
                                      value={editData.artist}
                                      onChange={(e) => setEditData({...editData, artist: e.target.value})}
                                    />
                                  ) : (
                                    <span className="text-white/60 text-sm">{song.artist}</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-white/40 text-xs">{new Date(song.added_at).toLocaleDateString('es-ES')}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => addToQueue(song)}
                                      className="p-2 text-white/20 hover:text-emerald-500 transition-colors"
                                      title="Añadir a la cola"
                                    >
                                      <ListMusic className="w-4 h-4" />
                                    </button>
                                    {editingSongId === song.id ? (
                                      <button onClick={() => saveSongEdit(song.id)} className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors">
                                        <Save className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <button onClick={() => startEditing(song)} className="p-2 text-white/20 hover:text-white transition-colors">
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => deleteSong(song.id)}
                                      className="p-2 text-white/20 hover:text-rose-500 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {panelTab === 'requests' && (
                    <>
                      <div className="flex items-center justify-between mb-12">
                        <div>
                          <h2 className="text-3xl font-bold tracking-tight mb-2">Solicitudes de Oyentes</h2>
                          <p className="text-white/40 text-sm">Canciones pedidas por tu audiencia</p>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        {requests.map((req) => (
                          <div key={req.id} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-colors">
                            <div className="flex items-center gap-6">
                              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                                <MessageSquare className="w-6 h-6 text-emerald-500" />
                              </div>
                              <div>
                                <h4 className="font-bold text-lg">{req.song_name}</h4>
                                <p className="text-sm text-white/60">Pedida por: <span className="text-emerald-500">{req.listener_name}</span></p>
                                {req.message && <p className="text-xs text-white/40 mt-1 italic">"{req.message}"</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-[10px] font-mono text-white/20">{new Date(req.created_at).toLocaleTimeString()}</span>
                              <button 
                                onClick={() => deleteRequest(req.id)}
                                className="p-2 text-white/20 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {requests.length === 0 && (
                          <div className="px-6 py-12 text-center text-white/20 italic bg-white/5 rounded-2xl border border-dashed border-white/10">
                            No hay solicitudes pendientes.
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {panelTab === 'broadcast' && (
                    <div className="max-w-xl space-y-8">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Emisión en Vivo</h2>
                        <p className="text-white/40 text-sm">Transmite audio directamente desde tu micrófono</p>
                      </div>

                      <div className="p-12 bg-black/40 border border-white/5 rounded-[3rem] text-center">
                        <div className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center mb-8 transition-all duration-500 ${isBroadcasting ? 'bg-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.4)] scale-110' : 'bg-white/5 border border-white/10'}`}>
                          {isBroadcasting ? <Mic className="w-12 h-12 text-white animate-pulse" /> : <Mic className="w-12 h-12 text-white/20" />}
                        </div>

                        <h3 className="text-2xl font-bold mb-2">{isBroadcasting ? 'Transmitiendo en Vivo' : 'Listo para Transmitir'}</h3>
                        <p className="text-white/40 text-sm mb-12">
                          {isBroadcasting ? 'Tu audiencia te está escuchando ahora mismo.' : 'Haz clic en el botón para iniciar la transmisión.'}
                        </p>

                        <div className="flex justify-center gap-4">
                          {!isBroadcasting ? (
                            <button 
                              onClick={startBroadcasting}
                              className="flex items-center gap-3 px-8 py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-emerald-500/20"
                            >
                              <RadioTower className="w-5 h-5" /> Iniciar Transmisión
                            </button>
                          ) : (
                            <button 
                              onClick={stopBroadcasting}
                              className="flex items-center gap-3 px-8 py-4 bg-rose-500 text-white rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-rose-500/20"
                            >
                              <StopCircle className="w-5 h-5" /> Detener Transmisión
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Calidad</p>
                          <p className="text-sm font-medium">HD Audio (Opus)</p>
                        </div>
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Latencia</p>
                          <p className="text-sm font-medium text-emerald-500">Baja (~1s)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {panelTab === 'online-search' && (
                    <div className="space-y-8">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Buscador Web de Música</h2>
                        <p className="text-white/40 text-sm">Encuentra canciones en la red e impórtalas a tu biblioteca</p>
                      </div>

                      <div className="flex gap-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                          <input 
                            type="text" 
                            placeholder="Nombre de canción, artista o álbum..." 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && searchMusicOnline((e.target as HTMLInputElement).value)}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            const input = document.querySelector('input[placeholder="Nombre de canción, artista o álbum..."]') as HTMLInputElement;
                            searchMusicOnline(input.value);
                          }}
                          className="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-emerald-500/20"
                        >
                          {isSearchingOnline ? 'Buscando...' : 'Buscar'}
                        </button>
                      </div>

                      <div className="grid gap-4">
                        {onlineSearchResults.map((result, idx) => (
                          <div key={idx} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-colors">
                            <div className="flex items-center gap-6">
                              <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                                <Music className="w-6 h-6 text-white/20" />
                              </div>
                              <div>
                                <h4 className="font-bold text-lg">{result.title}</h4>
                                <p className="text-sm text-white/60">{result.artist} — {result.album} ({result.year})</p>
                                <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">{result.genre}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => importOnlineSong(result)}
                              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-xl text-sm font-bold transition-all"
                            >
                              <Upload className="w-4 h-4" /> Importar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {panelTab === 'settings' && (
                    <div className="max-w-xl space-y-8">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Ajustes de la Radio</h2>
                        <p className="text-white/40 text-sm">Personaliza la identidad de tu emisora</p>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Nombre de la Radio</label>
                          <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input 
                              type="text" 
                              value={settings.name}
                              onChange={(e) => setSettings({...settings, name: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Eslogan / Frecuencia</label>
                          <input 
                            type="text" 
                            value={settings.slogan}
                            onChange={(e) => setSettings({...settings, slogan: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <button 
                          onClick={updateSettings}
                          className="flex items-center gap-3 px-8 py-4 bg-emerald-500 text-black rounded-xl font-bold text-sm hover:scale-105 transition-all shadow-xl shadow-emerald-500/20"
                        >
                          <Save className="w-4 h-4" />
                          Guardar Cambios
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Hidden Audio Element */}
      {isLive && !isBroadcasting ? (
        <audio ref={audioRef} autoPlay />
      ) : currentSong && (
        <audio 
          ref={audioRef}
          src={`/uploads/${currentSong.filename}`}
          autoPlay={isAutoPlay}
          onEnded={nextSong}
        />
      )}

      {/* Footer Player Bar (Always visible) */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-2xl border-t border-white/5 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 w-1/3">
            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center border border-white/10">
              <Radio className={`w-6 h-6 ${isPlaying ? 'text-emerald-500 animate-pulse' : 'text-white/20'}`} />
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">{isLive ? 'TRANSMISIÓN EN VIVO' : (currentSong?.title || settings.name)}</p>
              <p className="text-xs text-white/40 truncate">{isLive ? 'Escuchando señal directa' : (currentSong?.artist || settings.slogan)}</p>
            </div>
          </div>

          {/* Queue Preview */}
          {queue.length > 0 && (
            <div className="hidden lg:flex items-center gap-4 px-6 border-l border-white/5">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <ListMusic className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Siguiente</p>
                <p className="text-xs font-bold truncate max-w-[120px]">{queue[0].title}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-6">
            <button onClick={prevSong} className="text-white/40 hover:text-white transition-colors"><SkipBack className="w-5 h-5" /></button>
            <button 
              onClick={togglePlay}
              className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>
            <button onClick={nextSong} className="text-white/40 hover:text-white transition-colors"><SkipForward className="w-5 h-5" /></button>
          </div>

          <div className="flex items-center justify-end gap-4 w-1/3">
            <Volume2 className="w-4 h-4 text-white/40" />
            <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${volume * 100}%` }} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
