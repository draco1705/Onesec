'use client';

import { useState, useEffect } from 'react';
import { Search, Check, X } from 'lucide-react';

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [artistName, setArtistName] = useState('');
  const [playDate, setPlayDate] = useState('');
  const [status, setStatus] = useState('');
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [artistImage, setArtistImage] = useState('');

  // Fetch history
  useEffect(() => {
    fetch('/api/dashboard/history')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setHistory(data);
      });
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
      
      // Filter valid previews and deduplicate
      const validTracks = combinedResults.filter(t => t.previewUrl);
      const uniqueTracks = Array.from(new Map(validTracks.map(t => [t.trackId, t])).values());
      
      setSearchResults(uniqueTracks);
      
      if (uniqueTracks.length > 0) {
        setArtistImage(uniqueTracks[0].artworkUrl100.replace('100x100bb', '600x600bb'));
        // Auto-select all by default
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

  const handleAddCustomArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTracks.size === 0) {
      setStatus('Please select at least 1 song!');
      return;
    }
    
    setStatus('Saving custom challenge...');
    
    // Format tracks exactly like the backend generator does
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

    // Generate searchable titles array
    const allTitles = finalPool.map(t => t.title);

    const res = await fetch('/api/cron/generate-daily', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer secret`
      },
      body: JSON.stringify({ 
        artistName, 
        playDate,
        customPool: finalPool,
        customTitles: allTitles,
        customImage: artistImage
      })
    });
    
    const data = await res.json();
    if (data.success) {
      setStatus(`Added successfully with ${finalPool.length} songs!`);
      setHistory([data.challenge, ...history]);
    } else {
      setStatus(`Error: ${data.error} (Did you add your Supabase keys?)`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans">
      <h1 className="text-3xl font-black mb-8 tracking-tighter">ONESEC ADMIN DASHBOARD</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#111] p-6 rounded-xl border border-zinc-800 flex flex-col h-[80vh]">
          <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
            <span>1. Search & Select Songs</span>
            <span className="text-sm font-normal text-zinc-500">{selectedTracks.size} Selected</span>
          </h2>
          
          <div className="flex gap-2 mb-6 shrink-0">
            <input 
              type="text" 
              placeholder="Artist Name (e.g. Drake)"
              value={artistName}
              onChange={e => setArtistName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchiTunes()}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500"
            />
            <button onClick={searchiTunes} className="bg-white text-black px-4 rounded-lg font-bold flex items-center justify-center hover:bg-zinc-200">
              {isSearching ? '...' : <Search size={20} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {searchResults.map(track => {
              const isSelected = selectedTracks.has(track.trackId);
              return (
                <div 
                  key={track.trackId} 
                  onClick={() => toggleTrack(track.trackId)}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer border transition-colors ${isSelected ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <img src={track.artworkUrl100} className="w-10 h-10 rounded object-cover" />
                    <div className="truncate">
                      <div className={`font-bold truncate ${isSelected ? 'text-green-500' : 'text-zinc-300'}`}>{track.trackName}</div>
                      <div className="text-xs text-zinc-500 truncate">{track.artistName} • {track.collectionName}</div>
                    </div>
                  </div>
                  {isSelected ? <Check size={18} className="text-green-500 shrink-0 ml-2" /> : <div className="w-[18px] h-[18px] border border-zinc-600 rounded-sm shrink-0 ml-2" />}
                </div>
              );
            })}
            {searchResults.length === 0 && !isSearching && (
              <div className="text-center text-zinc-500 mt-10">Search an artist to load their discography.</div>
            )}
          </div>
        </div>

        <div className="space-y-8 h-[80vh] flex flex-col">
          <div className="bg-[#111] p-6 rounded-xl border border-zinc-800 shrink-0">
            <h2 className="text-xl font-bold mb-4">2. Schedule Challenge</h2>
            <form onSubmit={handleAddCustomArtist} className="space-y-4">
              <div>
                <label className="block text-xs font-bold tracking-widest text-zinc-500 mb-2 flex justify-between items-center">
                  PLAY DATE (YYYY-MM-DD)
                  <button type="button" onClick={() => setPlayDate(new Date().toISOString().split('T')[0])} className="text-green-500 hover:text-green-400">Set to Today</button>
                </label>
                <input 
                  type="date" 
                  value={playDate}
                  onChange={e => setPlayDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:border-green-500"
                  required
                />
              </div>
              <button disabled={selectedTracks.size === 0 || !playDate} type="submit" className="w-full bg-green-500 hover:bg-green-400 text-black font-black py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                SAVE TO DATABASE
              </button>
              {status && <div className={`text-sm font-bold mt-2 p-3 rounded ${status.includes('Error') ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>{status}</div>}
            </form>
          </div>

          <div className="bg-[#111] p-6 rounded-xl border border-zinc-800 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-xl font-bold mb-4 shrink-0">Challenge History</h2>
            <div className="space-y-3 overflow-y-auto flex-1 pr-2">
              {history.length > 0 ? history.map((item, i) => (
                <div key={i} className="bg-zinc-900 p-4 rounded-lg flex items-center gap-4 border border-zinc-800">
                  <img src={item.artist_image_url} alt={item.artist_name} className="w-12 h-12 rounded-lg object-cover" />
                  <div>
                    <div className="font-bold text-white">{item.artist_name}</div>
                    <div className="text-xs font-mono text-zinc-500">{item.play_date} • {item.track_pool?.length || 0} tracks</div>
                  </div>
                </div>
              )) : <div className="text-zinc-500 text-sm">No history found or database not connected.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
