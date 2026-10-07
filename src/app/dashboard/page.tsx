'use client';

import { useState, useEffect } from 'react';
import { Search, Check, Plus, Calendar, Zap, List } from 'lucide-react';

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [artistName, setArtistName] = useState('');
  const [status, setStatus] = useState('');
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [artistImage, setArtistImage] = useState('');
  
  const [view, setView] = useState<'list' | 'create'>('list');

  // Fetch history
  const loadHistory = () => {
    fetch('/api/dashboard/history')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setHistory(data);
      });
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const searchiTunes = async () => {
    if (!artistName) return;
    setIsSearching(true);
    try {
      const url1 = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`;
      const url2 = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName + ' feat')}&entity=song&limit=200`;
      
      const [res1, res2] = await Promise.all([fetch(url1), fetch(url2)]);
      const data1 = await res1.json();
      const data2 = await res2.json();

      const combinedResults = [...(data1.results || []), ...(data2.results || [])];
      
      const validTracks = combinedResults.filter(t => t.previewUrl);
      const uniqueTracks = Array.from(new Map(validTracks.map(t => [t.trackId, t])).values());
      
      setSearchResults(uniqueTracks);
      
      if (uniqueTracks.length > 0) {
        setArtistImage(uniqueTracks[0].artworkUrl100.replace('100x100bb', '600x600bb'));
        setSelectedTracks(new Set(uniqueTracks.map(t => t.trackId)));
      }
    } catch (err) {
      console.error(err);
    }
    setIsSearching(false);
  };

  const toggleTrack = (trackId: number) => {
    const next = new Set(selectedTracks);
    if (next.has(trackId)) next.delete(trackId);
    else next.add(trackId);
    setSelectedTracks(next);
  };

  const handleSaveChallenge = async (mode: 'today' | 'queue') => {
    if (selectedTracks.size === 0) {
      setStatus('Please select at least 1 song!');
      return;
    }
    
    setStatus('Saving custom challenge...');
    
    // Determine the date
    let targetDate = new Date().toISOString().split('T')[0];
    
    if (mode === 'queue' && history.length > 0) {
      // Find the latest scheduled date
      const sortedDates = history.map(h => h.play_date).sort().reverse();
      const latestDate = new Date(sortedDates[0]);
      latestDate.setUTCDate(latestDate.getUTCDate() + 1);
      targetDate = latestDate.toISOString().split('T')[0];
    }
    
    const finalPool = searchResults
      .filter(t => selectedTracks.has(t.trackId))
      .map(track => ({
        id: track.trackId.toString(),
        title: track.trackName,
        album: track.collectionName,
        year: track.releaseDate ? track.releaseDate.substring(0, 4) : 'Unknown',
        preview_url: track.previewUrl,
        slice_offset_sec: 0,
        artwork_url: track.artworkUrl100?.replace('100x100bb', '600x600bb')
      }));

    const allTitles = finalPool.map(t => t.title);

    const res = await fetch('/api/cron/generate-daily', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer secret`
      },
      body: JSON.stringify({ 
        artistName, 
        playDate: targetDate,
        customPool: finalPool,
        customTitles: allTitles,
        customImage: artistImage
      })
    });
    
    const data = await res.json();
    if (data.success) {
      setStatus('');
      setArtistName('');
      setSearchResults([]);
      loadHistory();
      setView('list'); // Return to list view
    } else {
      setStatus(`Error: ${data.error} (Did you add your Supabase keys?)`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black tracking-tighter">ONESEC ADMIN</h1>
          {view === 'list' ? (
            <button onClick={() => setView('create')} className="bg-green-500 hover:bg-green-400 text-black font-black px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
              <Plus size={18} /> CREATE CHALLENGE
            </button>
          ) : (
            <button onClick={() => setView('list')} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
              <List size={18} /> BACK TO SCHEDULE
            </button>
          )}
        </div>
        
        {view === 'list' && (
          <div className="bg-[#111] p-6 rounded-xl border border-zinc-800">
            <h2 className="text-xl font-bold mb-6">Scheduled Challenges</h2>
            <div className="space-y-3">
              {history.length > 0 ? history.map((item, i) => {
                const isToday = item.play_date === new Date().toISOString().split('T')[0];
                return (
                  <div key={i} className="bg-zinc-900 p-4 rounded-lg flex items-center gap-4 border border-zinc-800">
                    <img src={item.artist_image_url} alt={item.artist_name} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="font-bold text-lg text-white flex items-center gap-2">
                        {item.artist_name}
                        {isToday && <span className="bg-green-500 text-black text-[10px] px-2 py-0.5 rounded font-black tracking-widest">LIVE TODAY</span>}
                      </div>
                      <div className="text-sm font-mono text-zinc-400 mt-1 flex items-center gap-2">
                        <Calendar size={14} /> {item.play_date}
                      </div>
                    </div>
                  </div>
                );
              }) : <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded border border-zinc-800 text-center">No history found or database not connected.</div>}
            </div>
          </div>
        )}

        {view === 'create' && (
          <div className="bg-[#111] p-6 rounded-xl border border-zinc-800 flex flex-col h-[75vh]">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between shrink-0">
              <span>Find Artist & Build Pool</span>
              {searchResults.length > 0 && <span className="text-sm font-normal text-zinc-500">{selectedTracks.size} Selected</span>}
            </h2>
            
            <div className="flex gap-2 mb-6 shrink-0">
              <input 
                type="text" 
                placeholder="Artist Name (e.g. Drake)"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchiTunes()}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-white focus:outline-none focus:border-green-500 text-lg"
              />
              <button onClick={searchiTunes} className="bg-white text-black px-8 rounded-lg font-bold flex items-center justify-center hover:bg-zinc-200">
                {isSearching ? '...' : <Search size={24} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar border border-zinc-800 rounded-lg bg-black/20 p-2">
              {searchResults.map(track => {
                const isSelected = selectedTracks.has(track.trackId);
                return (
                  <div 
                    key={track.trackId} 
                    onClick={() => toggleTrack(track.trackId)}
                    className={`p-3 rounded-lg flex items-center justify-between cursor-pointer border transition-colors ${isSelected ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                  >
                    <div className="flex items-center gap-4 overflow-hidden">
                      <img src={track.artworkUrl100} className="w-12 h-12 rounded object-cover shadow" />
                      <div className="truncate">
                        <div className={`font-bold truncate ${isSelected ? 'text-green-500' : 'text-zinc-300'}`}>{track.trackName}</div>
                        <div className="text-xs text-zinc-500 truncate">{track.artistName} • {track.collectionName}</div>
                      </div>
                    </div>
                    {isSelected ? <Check size={20} className="text-green-500 shrink-0 ml-2" /> : <div className="w-[20px] h-[20px] border border-zinc-600 rounded-sm shrink-0 ml-2" />}
                  </div>
                );
              })}
              {searchResults.length === 0 && !isSearching && (
                <div className="text-center text-zinc-600 mt-12 font-bold tracking-widest text-sm">SEARCH AN ARTIST TO BEGIN</div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="shrink-0 mt-6 pt-6 border-t border-zinc-800">
                {status && <div className={`text-sm font-bold mb-4 p-3 rounded text-center ${status.includes('Error') ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>{status}</div>}
                
                <div className="flex gap-4">
                  <button disabled={selectedTracks.size === 0} onClick={() => handleSaveChallenge('queue')} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    <Calendar size={18} /> ADD TO QUEUE
                  </button>
                  <button disabled={selectedTracks.size === 0} onClick={() => handleSaveChallenge('today')} className="flex-1 bg-green-500 hover:bg-green-400 text-black font-black py-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                    <Zap size={18} fill="currentColor" /> SET LIVE FOR TODAY
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
