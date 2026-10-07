'use client';

import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { audioEngine } from '@/lib/audio-player';
import ScoreDistribution from './ScoreDistribution';
import { Play, SkipForward, HelpCircle, Flame, BarChart2, Volume2, User, Search, RefreshCw, X, FastForward, Clock } from 'lucide-react';

type GameState = 'START_SCREEN' | 'PLAYING_ROUND' | 'ROUND_FEEDBACK' | 'GAME_OVER';

interface TrackFeedback {
  isCorrect: boolean;
  actualTitle: string;
  album: string;
  year: string | number;
  sliceStart: number;
  timeTaken: number;
  guess: string;
  artwork_url?: string;
}

export default function GameContainer() {
  const [gameState, setGameState] = useState<GameState>('START_SCREEN');
  const [challenge, setChallenge] = useState<any>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [guessHistory, setGuessHistory] = useState<TrackFeedback[]>([]);
  const [feedback, setFeedback] = useState<TrackFeedback | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const fuseRef = useRef<Fuse<string> | null>(null);
  
  const timerStartRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [roundTimeRemaining, setRoundTimeRemaining] = useState(10); // 10s per round

  const [testArtist, setTestArtist] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [resetTimer, setResetTimer] = useState<string>('00:00:00');
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTime(now.toISOString().split('T')[1].slice(0,8));
      
      const nextReset = new Date(now);
      nextReset.setUTCHours(12, 0, 0, 0);
      if (now.getTime() >= nextReset.getTime()) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
      
      const diffMs = nextReset.getTime() - now.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60)).toString().padStart(2, '0');
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000).toString().padStart(2, '0');
      
      setResetTimer(`${hours}:${mins}:${secs}`);
    };

    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artistParam = params.get('artist');
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTestArtist(artistParam || 'Wxrdie'); // Still set it so the UI shows it correctly if needed
    
    const dateStr = new Date().toISOString().split('T')[0];
    const url = artistParam 
      ? `/api/daily?date=${dateStr}&artist=${encodeURIComponent(artistParam)}`
      : `/api/daily?date=${dateStr}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setChallenge(data);
          fuseRef.current = new Fuse(data.all_searchable_titles, {
            threshold: 0.3
          });
          
          data.track_pool.forEach((t: { preview_url: string; id: string }) => {
            audioEngine.loadAudio(t.preview_url, t.id);
          });
        }
      });
  }, []);

  // Global 1 minute timer
  const [gameTimeRemaining, setGameTimeRemaining] = useState(60);

  const endGame = async (finalScore = score, finalTimeMs = totalTimeMs) => {
    if (sessionToken && challenge) {
      const dateStr = new Date().toISOString().split('T')[0];
      try {
        await fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            date: dateStr, 
            score: finalScore, 
            totalTimeMs: finalTimeMs,
            sessionToken,
            challengeId: challenge.id
          })
        });
      } catch (e) {
        console.error('Submission failed', e);
      }
    }
    setGameState('GAME_OVER');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let interval: any;
    if (gameState === 'PLAYING_ROUND' && gameTimeRemaining > 0) {
      interval = setInterval(() => {
        setGameTimeRemaining(prev => {
          if (prev <= 0.1) {
            clearInterval(interval);
            endGame();
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [gameState, gameTimeRemaining]);

  useEffect(() => {
    if (searchQuery && fuseRef.current) {
      const results = fuseRef.current.search(searchQuery).slice(0, 5).map(r => r.item);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const startGame = async () => {
    audioEngine.unlock();
    
    if (challenge) {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id })
      });
      const data = await res.json();
      setSessionToken(data.sessionToken);
    }

    setGameState('PLAYING_ROUND');
    setGameTimeRemaining(60);
    timerStartRef.current = performance.now();
  };

  const playCurrentSnippet = () => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    const buffer = audioEngine.getBuffer(track.id);
    if (buffer) {
      setIsPlaying(true);
      audioEngine.playSlice(buffer, track.slice_offset_sec, 1.0);
      setTimeout(() => setIsPlaying(false), 1000);
    }
  };
  
  const playFullPreview = () => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    const buffer = audioEngine.getBuffer(track.id);
    if (buffer) {
      setIsPlaying(true);
      audioEngine.playSlice(buffer, 0, 30);
      setTimeout(() => setIsPlaying(false), 30000);
    }
  };

  const submitGuess = async (guess: string) => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    // eslint-disable-next-line react-hooks/purity
    const timeTaken = performance.now() - timerStartRef.current;
    
    // We don't block the UI while waiting for the server, we assume correct locally first or just advance
    // Let's do it optimistically or just wait if it's fast enough. The user wants fast UI.
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Fire and forget verification if we want it blazing fast, or await it.
    // Let's await it but skip ROUND_FEEDBACK state.
    const res = await fetch('/api/verify-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        date: dateStr, 
        trackId: track.id, 
        guess,
        testArtist
      })
    });
    const result = await res.json();
    
    // Time penalty for skipping
    if (guess === '') {
      setGameTimeRemaining(prev => Math.max(0, prev - 1.0));
    }
    
    const isCorrect = result.isCorrect;
    const fb: TrackFeedback = { 
      isCorrect, 
      actualTitle: result.actualTitle,
      album: result.album,
      year: result.year,
      sliceStart: result.sliceStart,
      timeTaken,
      guess: guess || 'Skipped',
      artwork_url: result.artwork_url
    };
    
    const newScore = score + (isCorrect ? 1 : 0);
    const newTime = totalTimeMs + timeTaken;
    const newHistory = [...guessHistory, fb];

    setScore(newScore);
    setTotalTimeMs(newTime);
    setGuessHistory(newHistory);
    
    // Auto advance
    if (currentRound < challenge.track_pool.length - 1) {
      setCurrentRound(prev => prev + 1);
      setSearchQuery('');
    } else {
      endGame(newScore, newTime);
    }
  };

  if (!challenge && gameState !== 'GAME_OVER') {
    return <div className="text-white text-center mt-20 font-mono" suppressHydrationWarning>INITIALIZING PROTOCOL...</div>;
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-green-500/30">
      {/* Top Navbar */}
      <nav className="relative w-full border-b border-zinc-800 bg-[#111] px-4 md:px-6 py-3 flex items-center justify-between text-xs tracking-wider">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-white text-lg shrink-0">
            <span className="w-4 h-4 bg-white block rounded-sm" /> ONESEC
          </div>
          <div className="hidden lg:flex items-center gap-2 bg-zinc-800/50 px-3 py-1 rounded">
            <span>DAILY #14</span>
            <span className="text-zinc-500" suppressHydrationWarning>RESET IN {resetTimer}</span>
          </div>
        </div>
        
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-6 font-bold">
          <button className="text-white hover:text-green-400 transition-colors">GAME</button>
          <button className="text-zinc-500 hover:text-white transition-colors">ARCHIVE</button>
        </div>

        <div className="flex items-center gap-3 text-zinc-400 shrink-0">
          <HelpCircle size={16} className="cursor-pointer hover:text-white hidden sm:block" />
          <div className="flex items-center gap-1 text-green-500">
            <Flame size={16} /> <span className="hidden sm:inline">7</span>
          </div>
          <BarChart2 size={16} className="cursor-pointer hover:text-white hidden sm:block" />
          <Volume2 size={16} className="cursor-pointer hover:text-white hidden sm:block" />
          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white text-black flex items-center justify-center cursor-pointer">
            <User size={14} />
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto pt-12 pb-24">
        {gameState === 'START_SCREEN' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center mb-6 text-xs font-bold tracking-widest text-zinc-500">
              <span className="flex items-center gap-2 text-green-500"><div className="w-2 h-2 rounded-full bg-green-500"/> AUDIO ENGINE READY</span>
              <span>UTC {currentTime}</span>
            </div>
            
            <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden p-8 shadow-2xl relative">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-xs font-bold tracking-widest text-zinc-500 mb-1 bg-zinc-800 inline-block px-2 py-1 rounded">DAILY PROTOCOL #14</div>
                  <div className="text-sm tracking-widest text-zinc-400 mt-4">FEATURED CATALOG</div>
                  <h1 className="text-5xl font-black text-white uppercase tracking-tighter mt-1">{challenge?.artist_name}</h1>
                </div>
                <div className="text-xs font-bold tracking-widest text-green-500">1S SNIPPET / ROUND</div>
              </div>
              
              <div className="relative w-full h-64 bg-zinc-900 rounded-lg overflow-hidden mb-8 group flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={challenge?.artist_image_url} alt="Artist" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity grayscale group-hover:grayscale-0 group-hover:opacity-60 transition-all duration-700" />
                <div className="relative z-10 w-20 h-20 bg-black/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-2xl border border-white/10">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-1.5 h-6 bg-white rounded-full animate-pulse" style={{ animationDelay: `${i*0.1}s` }} />)}
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {[
                  { step: '01', title: 'Listen to a sharp 1-second audio snippet', icon: <Volume2 size={20} /> },
                  { step: '02', title: 'Guess as many tracks as you can in 60s', icon: <Search size={20} /> },
                  { step: '03', title: 'Score points & claim rank', icon: <Flame size={20} /> }
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                    <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center text-white">{s.icon}</div>
                    <div>
                      <div className="text-xs font-bold tracking-widest text-zinc-500">STEP {s.step}</div>
                      <div className="text-white font-medium">{s.title}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button onClick={startGame} className="w-full py-5 bg-white text-black font-black tracking-widest text-lg rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                START TODAY&apos;S GAME <FastForward size={20} />
              </button>
            </div>
          </div>
        )}

        {gameState === 'PLAYING_ROUND' && (
          <div className="animate-in fade-in duration-300">
            {/* Progression Bar */}
            <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-2">
              <span>GUESS PROGRESSION</span>
              <span>ROUND {currentRound + 1}</span>
            </div>
            <div className="flex gap-2 mb-8">
              {[...Array(20)].map((_, i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-full ${i < currentRound ? 'bg-zinc-700' : i === currentRound ? 'bg-white' : 'bg-zinc-800'}`} />
              ))}
            </div>

            {/* Timer Box */}
            <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <Clock className="text-zinc-500" size={24} />
                <div>
                  <div className="text-xs tracking-widest text-zinc-500 font-bold mb-1">TIME REMAINING</div>
                  <div className="text-2xl font-mono text-white">{gameTimeRemaining < 10 ? '0' : ''}{gameTimeRemaining.toFixed(1)}s</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs tracking-widest text-zinc-500 font-bold mb-1">SCORE</div>
                <div className="text-2xl font-mono text-green-500 font-bold">{score} / {currentRound}</div>
              </div>
            </div>

            {/* Audio Engine Box */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6 mb-6">
              <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-6">
                <span><span className="text-zinc-700 mr-2">●</span>SRC: {challenge?.artist_name.toUpperCase()} • DISCOGRAPHY SLICE</span>
                <span>SAMPLE RATE: 48kHz</span>
              </div>
              
              {/* Fake Visualizer */}
              <div className="h-24 flex items-end justify-between gap-1 mb-6 px-4">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className={`w-full bg-zinc-700 rounded-t-sm transition-all duration-75`} style={{ height: isPlaying ? `${Math.abs(Math.sin(i * 12.3)) * 100}%` : '10%' }} />
                ))}
              </div>
              
              <div className="flex justify-between items-center bg-zinc-900 p-2 pl-4 rounded-lg">
                <div>
                  <div className="text-xl font-bold text-white">Snippet 0{currentRound + 1}</div>
                  <div className="text-xs text-zinc-500">Artist: {challenge?.artist_name} • 1s audio slice</div>
                </div>
                <button onClick={playCurrentSnippet} className="bg-white text-black px-6 py-3 rounded font-bold text-sm flex items-center gap-2 hover:bg-zinc-200">
                  <Play size={16} fill="currentColor" /> PLAY SNIPPET (1s) <span className="bg-zinc-200 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded ml-2">SPACE</span>
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="mb-2 flex justify-between text-xs font-bold tracking-widest text-zinc-500">
              <span>IDENTIFY TRACK</span>
              <span>SEARCH DISCOGRAPHY ({challenge?.all_searchable_titles.length} SONGS)</span>
            </div>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-4 text-zinc-500" size={20} />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full bg-[#111] border border-zinc-800 rounded-lg py-4 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-medium"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#111] border border-zinc-800 rounded-lg overflow-hidden z-20 shadow-2xl">
                  {searchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => submitGuess(res)}
                      className="w-full text-left p-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-zinc-500 group-hover:text-white"><Play size={16} /></div>
                        <div>
                          <div className="text-white font-medium">{res}</div>
                          <div className="text-xs text-zinc-500">{challenge?.artist_name}</div>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-zinc-600 group-hover:text-zinc-400 tracking-widest">READY ↵</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={() => submitGuess('')} className="flex-1 bg-zinc-900 border border-zinc-800 py-4 rounded-lg font-bold text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2">
                <SkipForward size={18} /> SKIP ROUND (-1s)
              </button>
              <button disabled={!searchQuery} onClick={() => submitGuess(searchResults[0] || searchQuery)} className="flex-1 bg-white text-black py-4 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                SUBMIT GUESS →
              </button>
            </div>

            {/* Previous Guesses / Track Pictures */}
            {guessHistory.length > 0 && (
              <div className="mt-8 border-t border-zinc-800 pt-6">
                <div className="text-xs font-bold tracking-widest text-zinc-500 mb-4">PREVIOUS TRACKS</div>
                <div className="flex flex-col gap-3">
                  {[...guessHistory].reverse().slice(0, 5).map((h, i) => (
                    <div key={i} className="flex items-center gap-4 bg-[#111] p-3 rounded-lg border border-zinc-800">
                      <div className="w-12 h-12 bg-zinc-800 rounded overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={h.artwork_url || challenge?.artist_image_url} alt="Album" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold truncate">{h.actualTitle}</div>
                        <div className="text-xs text-zinc-500 truncate">{h.isCorrect ? <span className="text-green-500">Correctly guessed!</span> : <span>{h.guess === 'Skipped' ? `Skipped (Answer: ${h.actualTitle})` : `Missed (You guessed: ${h.guess})`}</span>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}



        {gameState === 'GAME_OVER' && (
          <ScoreDistribution 
            userScore={score} 
            userTimeMs={totalTimeMs} 
            guessHistory={guessHistory}
            artistName={challenge?.artist_name}
          />
        )}
      </main>
    </div>
  );
}
