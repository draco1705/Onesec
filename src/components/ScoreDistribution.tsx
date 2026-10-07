'use client';

import { Copy, Flame } from 'lucide-react';

interface TrackFeedback {
  isCorrect: boolean;
  actualTitle: string;
  album: string;
  year: string | number;
  timeTaken: number;
  guess: string;
}

interface Props {
  userScore: number;
  userTimeMs: number;
  guessHistory: TrackFeedback[];
  artistName: string;
}

export default function ScoreDistribution({ userScore, userTimeMs, guessHistory, artistName }: Props) {
  // Removed global score spread state and fetch

  const handleShare = () => {
    const emojis = guessHistory.map(h => h.isCorrect ? '🟩' : '⬛').join('');
    const timeSec = (userTimeMs / 1000).toFixed(1);
    const dayNumber = 14; // Mocked for design
    
    const text = `Halfsec #${dayNumber} - ${artistName || 'Daily Artist'}\n${userScore}/${guessHistory.length} ⚡ (${timeSec}s)\n${emojis}\nplay: halfsec.fm`;
    
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const timeSec = (userTimeMs / 1000).toFixed(1);

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      <div className="text-center mb-8">
        <div className="text-xs font-bold tracking-widest text-zinc-500 mb-2 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"/> DAILY CHALLENGE #14 COMPLETE
        </div>
        <h2 className="text-2xl font-black text-white tracking-widest">FEATURED: {artistName?.toUpperCase()}</h2>
      </div>

      <div className="bg-[#111] border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center mb-6 shadow-xl relative overflow-hidden">
         <div className="text-xs font-bold tracking-widest text-zinc-500 mb-4">FINAL ACCURACY</div>
         <div className="text-7xl font-black text-white tracking-tighter flex items-baseline gap-2 mb-4">
           {userScore} <span className="text-4xl text-zinc-600">/ {guessHistory.length}</span>
         </div>
         <div className="text-sm font-bold tracking-widest text-zinc-400 flex items-center gap-2 mb-6">
           <Flame size={14} className="text-orange-500"/> Total Time: <span className="text-white">{timeSec}s</span>
         </div>
         <div className="bg-zinc-800/50 border border-zinc-700 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest flex items-center gap-2 text-green-500">
           <span className="text-green-500">🏆</span> TOP 8% OF PLAYERS TODAY • ELITE EAR
         </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-2 px-2">
          <span>TRACK BREAKDOWN</span>
          <span>TIME ELAPSED</span>
        </div>
        <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-y-auto max-h-[300px] shadow-xl">
          {guessHistory.map((h, i) => (
            <div key={i} className={`flex items-center justify-between p-4 border-b border-zinc-800 last:border-0 ${!h.isCorrect ? 'bg-red-950/10' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="text-xs font-mono font-bold text-zinc-600">0{i+1}</div>
                <div>
                  <div className="font-bold text-white mb-1">{h.actualTitle}</div>
                  {h.isCorrect ? (
                    <div className="text-xs text-zinc-500">{h.album} ({h.year})</div>
                  ) : (
                    <div className="text-xs text-red-400">Guessed &quot;{h.guess}&quot;</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm font-mono text-zinc-400">{(h.timeTaken / 1000).toFixed(1)}s</div>
                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${h.isCorrect ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                  {h.isCorrect ? '✓' : '✕'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>


      
      <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-lg border border-zinc-800">
         <div className="flex flex-wrap gap-1 max-w-[50%]">
           {guessHistory.map((h, i) => (
             <div key={i} className={`w-4 h-4 rounded-sm ${h.isCorrect ? 'bg-green-500' : 'bg-zinc-700'}`} />
           ))}
         </div>
         <div className="text-xs font-bold tracking-widest text-zinc-500 text-center">HALFSEC #14 <br className="sm:hidden" />[{userScore}/{guessHistory.length}]</div>
         <button onClick={handleShare} className="text-xs font-bold tracking-widest text-white flex items-center gap-2 hover:text-green-400 transition-colors">
           <Copy size={14} /> COPY CARD
         </button>
      </div>

    </div>
  );
}
