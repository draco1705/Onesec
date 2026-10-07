'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Calendar, Trash2, Play, CheckCircle2, Circle, X } from 'lucide-react';

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [artistName, setArtistName] = useState('');
  const [status, setStatus] = useState('');
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [artistImage, setArtistImage] = useState('');
  const [genre, setGenre] = useState('Pop');
  
  const [view, setView] = useState<'list' | 'create'>('list');
  const [scheduleOption, setScheduleOption] = useState<'A' | 'B' | 'C'>('A');
  const [customDate, setCustomDate] = useState('');

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

  const searchiTunes = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
        setGenre(uniqueTracks[0].primaryGenreName || 'Pop');
        const defaultSelected = uniqueTracks.slice(0, 50).map(t => t.trackId);
        setSelectedTracks(new Set(defaultSelected));
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

  const getNextQueueDate = () => {
    if (history.length === 0) return new Date().toISOString().split('T')[0];
    const sortedDates = history.map(h => h.play_date).sort().reverse();
    const latestDate = new Date(sortedDates[0]);
    latestDate.setUTCDate(latestDate.getUTCDate() + 1);
    return latestDate.toISOString().split('T')[0];
  };

  const nextQueueDate = getNextQueueDate();

  const handleSaveChallenge = async () => {
    if (selectedTracks.size === 0) {
      setStatus('Please select at least 1 song!');
      return;
    }
    
    setStatus('Saving custom challenge...');
    
    let targetDate = new Date().toISOString().split('T')[0];
    if (scheduleOption === 'A') targetDate = nextQueueDate;
    if (scheduleOption === 'C' && customDate) targetDate = customDate;

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
      setView('list');
    } else {
      setStatus(`Error: ${data.error}`);
    }
  };

  const playPreview = (url: string) => {
    new Audio(url).play();
  };

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans selection:bg-green-500/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-zinc-800">
            <h1 className="text-2xl font-bold tracking-tight">Challenge Archive</h1>
            <button onClick={() => setView('create')} className="bg-white text-black font-bold text-sm px-4 py-2 rounded flex items-center gap-2 hover:bg-zinc-200 transition-colors">
              <Plus size={16} /> Create Challenge
            </button>
          </div>
          <div className="bg-[#111] p-6 rounded-lg border border-zinc-800">
            <div className="space-y-3">
              {history.length > 0 ? history.map((item, i) => {
                const isToday = item.play_date === new Date().toISOString().split('T')[0];
                return (
                  <div key={i} className="bg-zinc-900/50 p-4 rounded-lg flex items-center gap-4 border border-zinc-800/50">
                    <img src={item.artist_image_url} alt={item.artist_name} className="w-12 h-12 rounded object-cover" />
                    <div className="flex-1">
                      <div className="font-bold text-white flex items-center gap-2">
                        {item.artist_name}
                        {isToday && <span className="bg-green-500 text-black text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Live Today</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                        <Calendar size={12} /> {item.play_date}
                      </div>
                    </div>
                  </div>
                );
              }) : <div className="text-zinc-500 text-sm p-4 text-center">No history found or database not connected.</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedTracksList = searchResults.filter(t => selectedTracks.has(t.trackId));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-4 md:p-8 font-sans flex items-center justify-center">
      <div className="w-full max-w-4xl bg-[#111] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:p-6 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="bg-white text-black font-bold text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">Workflow</span>
            <h1 className="text-lg md:text-xl font-bold text-white">Create Daily Challenge</h1>
          </div>
          <button onClick={() => setView('list')} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          
          {/* Step 1 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span> 
                Select Featured Artist
              </h2>
              {searchResults.length > 0 && <span className="text-[10px] font-bold text-green-500 tracking-widest">STEP COMPLETE</span>}
            </div>
            
            <form onSubmit={searchiTunes} className="relative mb-4">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input 
                type="text" 
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder="Search Artist..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-3 pl-10 pr-24 text-sm text-white focus:outline-none focus:border-zinc-600"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded transition-colors">
                {isSearching ? '...' : 'Search'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <img src={artistImage} className="w-14 h-14 rounded object-cover shadow" />
                  <div>
                    <div className="text-white font-bold text-lg flex items-center gap-2">
                      {searchResults[0].artistName} <CheckCircle2 size={16} className="text-green-500" />
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                      {genre} <span className="text-green-500 ml-1">• Verified Catalog ({searchResults.length} songs available)</span>
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex text-xs font-bold text-zinc-400 items-center gap-1 bg-zinc-800/50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 size={14} className="text-green-500" /> {selectedTracks.size}-Track Fuzzy Pool Auto-Generated
                </div>
              </div>
            )}
          </div>

          {/* Step 2 */}
          {searchResults.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span> 
                  Curate Song Pools (1sec Slices)
                </h2>
                <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">{selectedTracksList.length} OF {searchResults.length} CONFIGURED</span>
              </div>
              
              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="max-h-[250px] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/50">
                  {searchResults.map((track, idx) => {
                    const isSelected = selectedTracks.has(track.trackId);
                    return (
                      <div key={track.trackId} className={`flex items-center justify-between p-3 hover:bg-zinc-800/40 group transition-opacity ${isSelected ? '' : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                        <div className="flex items-center gap-4">
                          <div className="text-xs font-bold text-zinc-500 bg-zinc-900 w-6 h-6 rounded flex items-center justify-center">{(idx + 1).toString().padStart(2, '0')}</div>
                          <div>
                            <div className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
                              {!isSelected && <span className="bg-red-500 text-black text-[9px] px-1 mr-2 rounded uppercase font-black tracking-widest">REMOVED</span>}
                              {track.trackName}
                            </div>
                            <div className="text-[10px] text-zinc-500">{track.collectionName} ({track.releaseDate?.substring(0,4) || 'Unknown'})</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex text-[10px] font-mono text-zinc-500 items-center gap-2">
                            OFFSET <span className="text-zinc-300">00:00.000s</span>
                          </div>
                          <button onClick={() => playPreview(track.previewUrl)} className="flex items-center gap-1 text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1.5 rounded transition-colors">
                            <Play size={10} fill="currentColor" /> 1s
                          </button>
                          {isSelected ? (
                            <button onClick={() => toggleTrack(track.trackId)} className="text-zinc-600 hover:text-red-500 transition-colors px-2">
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <button onClick={() => toggleTrack(track.trackId)} className="text-green-500 hover:text-green-400 transition-colors px-2">
                              <Plus size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-zinc-900 p-3 flex justify-between items-center text-[10px] text-zinc-500 border-t border-zinc-800/50">
                  <span>{selectedTracksList.length}-Track Search Pool (Fuzzy Match for Guessers):</span>
                  <span>Auto-Populated from Studio Discography</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {searchResults.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span> 
                  Schedule & Publish Strategy
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Option A */}
                <div onClick={() => setScheduleOption('A')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'A' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-green-500">Option A • Next Slot</span>
                    {scheduleOption === 'A' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Next Available Date</div>
                  <div className="text-[10px] text-zinc-400">Appends to queue: {nextQueueDate} (00:00 UTC)</div>
                </div>

                {/* Option B */}
                <div onClick={() => setScheduleOption('B')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'B' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-orange-500">Option B • Override</span>
                    {scheduleOption === 'B' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Make Active Now</div>
                  <div className="text-[10px] text-zinc-400">Immediately replaces today's active live song</div>
                </div>

                {/* Option C */}
                <div onClick={() => setScheduleOption('C')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'C' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-blue-500">Option C • Calendar</span>
                    {scheduleOption === 'C' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Pick Custom Date</div>
                  <input 
                    type="date" 
                    value={customDate}
                    onChange={(e) => { setCustomDate(e.target.value); setScheduleOption('C'); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-zinc-900 border border-zinc-700 text-[10px] p-1.5 rounded text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
          
          {status && <div className={`text-sm font-bold p-3 rounded text-center ${status.includes('Error') ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>{status}</div>}
        </div>

        {/* Footer */}
        {searchResults.length > 0 && (
          <div className="p-4 md:p-6 border-t border-zinc-800 bg-[#0a0a0a] rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
            <button onClick={() => setView('list')} className="text-xs font-bold text-zinc-500 hover:text-white transition-colors">
              Cancel & Discard
            </button>
            <div className="flex gap-3 w-full sm:w-auto">
              <button onClick={() => setView('list')} className="flex-1 sm:flex-none text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded transition-colors">
                Save as Draft
              </button>
              <button onClick={handleSaveChallenge} className="flex-1 sm:flex-none text-xs font-bold bg-white hover:bg-zinc-200 text-black px-6 py-2.5 rounded transition-colors flex items-center justify-center gap-2">
                <Calendar size={14} /> 
                {scheduleOption === 'A' ? `Save & Add to Queue (${nextQueueDate})` : scheduleOption === 'B' ? 'Save & Make Live Today' : 'Save Custom Date'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
