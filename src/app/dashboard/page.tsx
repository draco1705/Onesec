'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Calendar, Trash2, Play, CheckCircle2, Circle, X, FolderOpen, Music, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';

// Source for each track — used for badges
type TrackSource = 'deezer' | 'local';

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [artistName, setArtistName] = useState('');
  const [status, setStatus] = useState('');

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [artistImage, setArtistImage] = useState('');
  const [genre, setGenre] = useState('');

  const [view, setView] = useState<'list' | 'create'>('list');
  const [scheduleOption, setScheduleOption] = useState<'A' | 'B' | 'C'>('A');
  const [customDate, setCustomDate] = useState('');

  // Multi-source — both can be active simultaneously
  const [useDeezer, setUseDeezer] = useState(true);
  const [useLocal, setUseLocal] = useState(true);
  const [localArtists, setLocalArtists] = useState<any[]>([]);

  // ── Clip editor state ─────────────────────────────────────────────────────────
  const [trackOffsets, setTrackOffsets] = useState<Map<string, number>>(new Map());
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const getAudioCtx = () => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const ensureBuffer = useCallback(async (trackId: string, url: string): Promise<AudioBuffer | null> => {
    if (bufferCacheRef.current.has(trackId)) return bufferCacheRef.current.get(trackId)!;
    setLoadingTrackId(trackId);
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const ctx = getAudioCtx();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      bufferCacheRef.current.set(trackId, audioBuf);
      return audioBuf;
    } catch (e) {
      console.error('Failed to decode audio', e);
      return null;
    } finally {
      setLoadingTrackId(null);
    }
  }, []);

  const playSliceAt = useCallback(async (track: any, offsetSec: number) => {
    const buf = await ensureBuffer(track.trackId.toString(), track.previewUrl);
    if (!buf) return;
    const ctx = getAudioCtx();
    const safeOffset = Math.max(0, Math.min(offsetSec, buf.duration - 1.0));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(1, now);
    gain.gain.setValueAtTime(1, now + 0.985);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    src.start(now, safeOffset, 1.0);
    src.stop(now + 1.0);
  }, [ensureBuffer]);

  const getBufferDuration = (trackId: string): number | null =>
    bufferCacheRef.current.get(trackId)?.duration ?? null;

  const getOffset = (trackId: string) => trackOffsets.get(trackId) ?? 0;
  const setOffset = (trackId: string, value: number) =>
    setTrackOffsets(prev => new Map(prev).set(trackId, Math.max(0, value)));
  const clampedOffset = (trackId: string, raw: number): number => {
    const dur = getBufferDuration(trackId);
    return Math.max(0, dur !== null ? Math.min(raw, dur - 1.0) : raw);
  };

  // ── History ───────────────────────────────────────────────────────────────────
  const loadHistory = () =>
    fetch('/api/dashboard/history')
      .then(r => r.json())
      .then(d => { if (!d.error) setHistory(d); });

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (localArtists.length === 0)
      fetch('/api/local-songs').then(r => r.json())
        .then(d => { if (Array.isArray(d)) setLocalArtists(d); })
        .catch(() => {});
  }, [localArtists.length]);

  // ── Normalise helpers ─────────────────────────────────────────────────────────
  const normaliseDeezer = (tracks: any[]): any[] =>
    tracks.map(t => ({
      trackId: t.trackId,               // already prefixed "deezer-xxx" by the API
      trackName: t.trackName,
      collectionName: t.collectionName,
      releaseDate: t.releaseDate,
      artworkUrl100: t.artworkUrl ?? '',  // Deezer returns cover_xl via artworkUrl
      previewUrl: t.previewUrl,
      primaryGenreName: 'Deezer',
      artistName: t.artistName,
      _source: 'deezer' as TrackSource,
      _sliceOffset: 0,
    }));

  const normaliseLocal = (songs: any[], artistData: any): any[] =>
    songs.map(s => ({
      trackId: `local-${s.id}`,
      trackName: s.title,
      collectionName: s.album,
      releaseDate: s.year ? `${s.year}-01-01` : undefined,
      artworkUrl100: s.artwork_url || artistData.image_url || '',
      previewUrl: s.file,
      primaryGenreName: 'Local',
      artistName: artistData.name,
      _source: 'local' as TrackSource,
      _sliceOffset: s.slice_offset_sec ?? 0,
    }));

  // ── Merged search ─────────────────────────────────────────────────────────────
  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!artistName || (!useDeezer && !useLocal)) return;

    setIsSearching(true);
    setSearchResults([]);
    setSelectedTracks(new Set());
    setTrackOffsets(new Map());
    setExpandedTrackId(null);

    let deezerTracks: any[] = [];
    let localTracks: any[] = [];
    let firstImage = '';
    let firstGenre = '';

    const [deezerResult, localResult] = await Promise.allSettled([
      // ── Deezer (via server-side proxy) ──
      useDeezer
        ? fetch(`/api/search-songs?artist=${encodeURIComponent(artistName)}&limit=200`).then(r => r.json())
        : Promise.resolve({ error: 'disabled' }),

      // ── Local ──
      useLocal
        ? fetch(`/api/local-songs?artist=${encodeURIComponent(artistName)}`).then(r => r.json()).catch(() => ({ error: 'not found' }))
        : Promise.resolve({ error: 'disabled' }),
    ]);

    if (deezerResult.status === 'fulfilled' && !deezerResult.value.error) {
      const dd = deezerResult.value;
      deezerTracks = normaliseDeezer(dd.tracks ?? []);
      firstImage = dd.artistImageUrl ?? '';       // real Deezer artist photo
      firstGenre = deezerTracks.length > 0 ? 'Deezer' : '';
    }

    if (localResult.status === 'fulfilled' && !localResult.value.error) {
      const ld = localResult.value;
      localTracks = normaliseLocal(ld.songs || [], ld);
      if (ld.image_url) firstImage = ld.image_url;   // local image takes priority
      if (localTracks.length > 0) firstGenre = firstGenre ? 'Mixed' : 'Local';
    }

    // Merge: local first, Deezer deduped by title
    const localTitles = new Set(localTracks.map(t => t.trackName.toLowerCase().trim()));
    const deduped = [
      ...localTracks,
      ...deezerTracks.filter(t => !localTitles.has(t.trackName.toLowerCase().trim())),
    ];

    setSearchResults(deduped);
    setArtistImage(firstImage);
    setGenre(firstGenre);

    if (deduped.length > 0) {
      setSelectedTracks(new Set(deduped.map(t => t.trackId)));
      const offsets = new Map<string, number>();
      deduped.forEach(t => offsets.set(t.trackId, t._sliceOffset ?? 0));
      setTrackOffsets(offsets);
    }

    if (deduped.length === 0)
      setStatus('No tracks found. Check the artist name or local manifest.');

    setIsSearching(false);
  };

  const selectLocalArtist = async (name: string) => {
    setArtistName(name);
    // Trigger a full merged search with that name
    // We set state and rely on the search function
    setIsSearching(true);
    setSearchResults([]);
    setSelectedTracks(new Set());
    setTrackOffsets(new Map());
    setExpandedTrackId(null);
    let deezerTracks: any[] = [];
    let localTracks: any[] = [];
    let firstImage = '';

    const [dRes, lRes] = await Promise.allSettled([
      useDeezer
        ? fetch(`/api/search-songs?artist=${encodeURIComponent(name)}&limit=200`).then(r => r.json())
        : Promise.resolve({ error: 'disabled' }),
      fetch(`/api/local-songs?artist=${encodeURIComponent(name)}`).then(r => r.json()).catch(() => ({ error: true })),
    ]);

    if (dRes.status === 'fulfilled' && !dRes.value.error) {
      deezerTracks = normaliseDeezer(dRes.value.tracks ?? []);
      firstImage = dRes.value.artistImageUrl ?? '';
    }
    if (lRes.status === 'fulfilled' && !lRes.value.error) {
      localTracks = normaliseLocal(lRes.value.songs || [], lRes.value);
      if (lRes.value.image_url) firstImage = lRes.value.image_url;
    }

    const localTitles = new Set(localTracks.map(t => t.trackName.toLowerCase().trim()));
    const deduped = [...localTracks, ...deezerTracks.filter(t => !localTitles.has(t.trackName.toLowerCase().trim()))];

    setSearchResults(deduped);
    setArtistImage(firstImage);
    setGenre(deduped.length > 0 ? (localTracks.length > 0 && deezerTracks.length > 0 ? 'Mixed' : localTracks.length > 0 ? 'Local' : 'Deezer') : '');
    setSelectedTracks(new Set(deduped.map(t => t.trackId)));
    const offsets = new Map<string, number>();
    deduped.forEach(t => offsets.set(t.trackId, t._sliceOffset ?? 0));
    setTrackOffsets(offsets);
    setIsSearching(false);
  };

  // ── Track selection ───────────────────────────────────────────────────────────
  const toggleTrack = (trackId: string) =>
    setSelectedTracks(prev => { const n = new Set(prev); n.has(trackId) ? n.delete(trackId) : n.add(trackId); return n; });

  // ── Queue helpers ─────────────────────────────────────────────────────────────
  const getNextQueueDate = () => {
    if (history.length === 0) return new Date().toISOString().split('T')[0];
    const latest = new Date([...history.map(h => h.play_date)].sort().reverse()[0]);
    latest.setUTCDate(latest.getUTCDate() + 1);
    return latest.toISOString().split('T')[0];
  };
  const nextQueueDate = getNextQueueDate();

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSaveChallenge = async () => {
    if (selectedTracks.size === 0) { setStatus('Please select at least 1 song!'); return; }
    setStatus('Saving custom challenge...');

    let targetDate = new Date().toISOString().split('T')[0];
    if (scheduleOption === 'A') targetDate = nextQueueDate;
    if (scheduleOption === 'B') targetDate = new Date().toISOString().split('T')[0];
    if (scheduleOption === 'C' && customDate) targetDate = customDate;

    const finalPool = searchResults
      .filter(t => selectedTracks.has(t.trackId))
      .map(track => ({
        id: track.trackId,
        title: track.trackName,
        album: track.collectionName,
        year: track.releaseDate ? track.releaseDate.substring(0, 4) : 'Unknown',
        preview_url: track.previewUrl,
        slice_offset_sec: getOffset(track.trackId),
        artwork_url: track.artworkUrl100?.replace('100x100bb', '600x600bb') || track.artworkUrl100 || '',
      }));

    const res = await fetch('/api/cron/generate-daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer secret' },
      body: JSON.stringify({ artistName, playDate: targetDate, customPool: finalPool, customTitles: finalPool.map(t => t.title), customImage: artistImage }),
    });
    const data = await res.json();
    if (data.success) {
      setStatus(''); setArtistName(''); setSearchResults([]); setTrackOffsets(new Map()); loadHistory(); setView('list');
    } else {
      setStatus(`Error: ${data.error}`);
    }
  };

  const selectedTracksList = searchResults.filter(t => selectedTracks.has(t.trackId));
  const localCount = selectedTracksList.filter(t => t._source === 'local').length;
  const itunesCount = selectedTracksList.filter(t => t._source === 'itunes').length;

  // ── LIST VIEW ─────────────────────────────────────────────────────────────────
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
                    {item.artist_image_url && <img src={item.artist_image_url} alt={item.artist_name} className="w-12 h-12 rounded object-cover" />}
                    <div className="flex-1">
                      <div className="font-bold text-white flex items-center gap-2">
                        {item.artist_name}
                        {isToday && <span className="bg-green-500 text-black text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Live Today</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2"><Calendar size={12} /> {item.play_date}</div>
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

  // ── CREATE VIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-4 md:p-8 font-sans flex items-center justify-center">
      <div className="w-full max-w-4xl bg-[#111] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-4 md:p-6 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="bg-white text-black font-bold text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">Workflow</span>
            <h1 className="text-lg md:text-xl font-bold text-white">Create Daily Challenge</h1>
          </div>
          <button onClick={() => setView('list')} className="text-zinc-500 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-8">

          {/* Source checkboxes */}
          <div>
            <div className="text-xs font-bold tracking-widest text-zinc-500 mb-3 uppercase">Audio Sources — select one or both</div>
            <div className="grid grid-cols-2 gap-3">
              {/* Deezer checkbox */}
              <button
                onClick={() => setUseDeezer(v => !v)}
                className={`p-3 rounded-lg border text-sm font-bold flex items-center gap-3 transition-all ${useDeezer ? 'bg-zinc-800/80 border-white text-white' : 'bg-zinc-900/50 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${useDeezer ? 'bg-white border-white' : 'border-zinc-600'}`}>
                  {useDeezer && <div className="w-2 h-2 bg-black rounded-sm" />}
                </div>
                <Music size={15} />
                Deezer Catalog
              </button>

              {/* Local checkbox */}
              <button
                onClick={() => setUseLocal(v => !v)}
                className={`p-3 rounded-lg border text-sm font-bold flex items-center gap-3 transition-all ${useLocal ? 'bg-zinc-800/80 border-white text-white' : 'bg-zinc-900/50 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${useLocal ? 'bg-white border-white' : 'border-zinc-600'}`}>
                  {useLocal && <div className="w-2 h-2 bg-black rounded-sm" />}
                </div>
                <FolderOpen size={15} />
                Local MP3 Files
              </button>
            </div>

            {/* Info pills */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {useDeezer && useLocal && (
                <span className="text-[10px] bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-1 rounded font-bold">
                  ✓ Both enabled — results merged, local songs prioritised on duplicates
                </span>
              )}
              {useLocal && (
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
                  Local: drop MP3s in <code className="text-zinc-200">public/songs/</code> + add to <code className="text-zinc-200">manifest.json</code>
                </span>
              )}
            </div>
          </div>

          {/* Step 1 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
                Select Featured Artist
              </h2>
              {searchResults.length > 0 && <span className="text-[10px] font-bold text-green-500 tracking-widest">STEP COMPLETE</span>}
            </div>

            {/* Local artist quick-picks */}
            {useLocal && localArtists.length > 0 && searchResults.length === 0 && (
              <div className="mb-4">
                <div className="text-[10px] font-bold tracking-widest text-zinc-500 mb-2 uppercase">Local Library</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {localArtists.map((a, i) => (
                    <button key={i} onClick={() => selectLocalArtist(a.name)}
                      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-3 text-left transition-colors">
                      <div className="text-sm font-bold text-white">{a.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                        <FolderOpen size={10} /> {a.song_count} local songs
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSearch} className="relative mb-4">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder="Artist name…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-3 pl-10 pr-24 text-sm text-white focus:outline-none focus:border-zinc-600"
              />
              <button type="submit" disabled={!useDeezer && !useLocal}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-3 py-1.5 rounded transition-colors">
                {isSearching ? '…' : 'Search'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {artistImage && <img src={artistImage} className="w-14 h-14 rounded object-cover shadow" alt="artist" />}
                  <div>
                    <div className="text-white font-bold text-lg flex items-center gap-2">
                      {searchResults[0].artistName} <CheckCircle2 size={16} className="text-green-500" />
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                      <span>{searchResults.length} songs found</span>
                      {localCount > 0 && <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold"><FolderOpen size={9} className="inline mr-1" />{localCount} local</span>}
                      {itunesCount > 0 && <span className="bg-zinc-700/50 text-zinc-300 border border-zinc-600/30 px-1.5 py-0.5 rounded text-[10px] font-bold"><Music size={9} className="inline mr-1" />{itunesCount} Deezer</span>}
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex text-xs font-bold text-zinc-400 items-center gap-1 bg-zinc-800/50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 size={14} className="text-green-500" /> {selectedTracks.size}-Track Pool
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Curate + Clip Editor */}
          {searchResults.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
                  Curate Song Pool &amp; Set Clip Points
                </h2>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">{selectedTracksList.length} / {searchResults.length} selected</span>
              </div>

              <div className="text-[11px] text-zinc-500 bg-zinc-900/30 border border-zinc-800/50 rounded-t-lg px-4 py-2 flex items-center gap-2">
                <Scissors size={12} className="text-zinc-400" />
                Click the <span className="text-zinc-300 font-bold">✂ badge</span> on any track to choose the 1-second clip start point.
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800/50 border-t-0 rounded-b-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-800/50">
                  {searchResults.map((track, idx) => {
                    const id = track.trackId;
                    const isSelected = selectedTracks.has(id);
                    const offset = getOffset(id);
                    const isExpanded = expandedTrackId === id;
                    const isLoading = loadingTrackId === id;
                    const bufDur = getBufferDuration(id);
                    const isLocal = track._source === 'local';
                    const maxOffset = bufDur !== null ? Math.floor(bufDur - 1) : (isLocal ? 600 : 28);

                    return (
                      <div key={id} className={`transition-opacity ${isSelected ? '' : 'opacity-40 hover:opacity-100'}`}>
                        {/* Main row */}
                        <div className="flex items-center justify-between p-3 hover:bg-zinc-800/30 group">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-xs font-bold text-zinc-500 bg-zinc-900 w-6 h-6 rounded flex items-center justify-center shrink-0">
                              {(idx + 1).toString().padStart(2, '0')}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-zinc-200 group-hover:text-white flex items-center gap-1.5 flex-wrap">
                                {!isSelected && <span className="bg-red-500 text-black text-[9px] px-1 rounded uppercase font-black">REMOVED</span>}
                                {/* Source badge */}
                                {isLocal
                                  ? <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] px-1 rounded font-black uppercase">Local</span>
                                  : <span className="bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 text-[9px] px-1 rounded font-black uppercase">Deezer</span>
                                }
                                <span className="truncate">{track.trackName}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500">{track.collectionName} ({track.releaseDate?.substring(0, 4) || '?'})</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {/* Clip badge */}
                            <button
                              onClick={() => { setExpandedTrackId(isExpanded ? null : id); ensureBuffer(id, track.previewUrl); }}
                              title="Edit clip start point"
                              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded transition-colors ${isExpanded ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'}`}
                            >
                              <Scissors size={11} />
                              <span className="font-mono">{offset.toFixed(1)}s</span>
                            </button>
                            {isSelected
                              ? <button onClick={() => toggleTrack(id)} className="text-zinc-600 hover:text-red-500 transition-colors p-1"><Trash2 size={14} /></button>
                              : <button onClick={() => toggleTrack(id)} className="text-green-500 hover:text-green-400 transition-colors p-1"><Plus size={16} /></button>
                            }
                          </div>
                        </div>

                        {/* Clip editor */}
                        {isExpanded && (
                          <div className="mx-3 mb-3 bg-[#0d0d0d] border border-amber-500/30 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between text-[10px] font-bold tracking-widest">
                              <span className="text-amber-400 flex items-center gap-1.5"><Scissors size={11} /> CLIP START POINT</span>
                              <span className="text-zinc-500">{isLoading ? 'LOADING AUDIO…' : bufDur ? `DURATION: ${bufDur.toFixed(1)}s` : 'CLICK PLAY TO LOAD'}</span>
                            </div>

                            {/* Slider */}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-zinc-500 w-6 text-right">0s</span>
                              <input type="range" min={0} max={maxOffset} step={0.5} value={offset}
                                onChange={e => setOffset(id, parseFloat(e.target.value))}
                                className="flex-1 h-1.5 accent-amber-400 cursor-pointer" />
                              <span className="text-[10px] text-zinc-500 w-12">{maxOffset}s</span>
                            </div>

                            {/* Fine controls */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {([-10, -5, -1] as const).map(d => (
                                <button key={d} onClick={() => setOffset(id, clampedOffset(id, offset + d))}
                                  className="text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1.5 rounded">{d}s</button>
                              ))}
                              <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2">
                                <button onClick={() => setOffset(id, clampedOffset(id, offset - 0.5))} className="text-zinc-400 hover:text-white py-1"><ChevronLeft size={14} /></button>
                                <input type="number" min={0} max={maxOffset} step={0.5} value={offset}
                                  onChange={e => setOffset(id, clampedOffset(id, parseFloat(e.target.value) || 0))}
                                  className="w-14 bg-transparent text-center text-sm font-mono text-white focus:outline-none" />
                                <span className="text-zinc-500 text-xs">s</span>
                                <button onClick={() => setOffset(id, clampedOffset(id, offset + 0.5))} className="text-zinc-400 hover:text-white py-1"><ChevronRight size={14} /></button>
                              </div>
                              {([1, 5, 10] as const).map(d => (
                                <button key={d} onClick={() => setOffset(id, clampedOffset(id, offset + d))}
                                  className="text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1.5 rounded">+{d}s</button>
                              ))}
                              <button onClick={() => playSliceAt(track, offset)} disabled={isLoading}
                                className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-[11px] font-black px-3 py-1.5 rounded">
                                <Play size={11} fill="currentColor" />
                                {isLoading ? 'Loading…' : 'Play 1s'}
                              </button>
                            </div>

                            {/* Visual timeline */}
                            <div className="relative h-6 bg-zinc-900 rounded overflow-hidden border border-zinc-800">
                              <div className="absolute inset-y-0 bg-zinc-700/40" style={{ left: 0, width: `${(offset / Math.max(maxOffset, 1)) * 100}%` }} />
                              <div className="absolute inset-y-0 bg-amber-500/50 border-l-2 border-r-2 border-amber-400"
                                style={{ left: `${(offset / Math.max(maxOffset, 1)) * 100}%`, width: `${(1 / Math.max(maxOffset, 1)) * 100}%` }} />
                              <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-zinc-400 tracking-widest pointer-events-none">
                                CLIP: {offset.toFixed(1)}s → {(offset + 1).toFixed(1)}s
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="bg-zinc-900 p-3 flex justify-between items-center text-[10px] text-zinc-500 border-t border-zinc-800/50">
                  <span>
                    {selectedTracksList.length} selected
                    {localCount > 0 && <span className="text-blue-400 ml-2">· {localCount} local</span>}
                    {itunesCount > 0 && <span className="text-zinc-400 ml-2">· {itunesCount} Deezer</span>}
                    {[...trackOffsets.values()].filter(v => v > 0).length > 0 &&
                      <span className="text-amber-400 ml-2">· {[...trackOffsets.values()].filter(v => v > 0).length} clips set</span>}
                  </span>
                  <span>Local songs override Deezer duplicates</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Schedule */}
          {searchResults.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="bg-white text-black w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
                  Schedule &amp; Publish
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div onClick={() => setScheduleOption('A')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'A' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-green-500">Option A • Next Slot</span>
                    {scheduleOption === 'A' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Next Available Date</div>
                  <div className="text-[10px] text-zinc-400">Queue: {nextQueueDate}</div>
                </div>
                <div onClick={() => setScheduleOption('B')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'B' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-orange-500">Option B • Override</span>
                    {scheduleOption === 'B' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Make Active Now</div>
                  <div className="text-[10px] text-zinc-400">Replaces today&apos;s challenge ({new Date().toISOString().split('T')[0]})</div>
                </div>
                <div onClick={() => setScheduleOption('C')} className={`cursor-pointer p-4 rounded-lg border transition-all ${scheduleOption === 'C' ? 'bg-zinc-800/80 border-white' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-blue-500">Option C • Calendar</span>
                    {scheduleOption === 'C' ? <CheckCircle2 size={16} className="text-white" /> : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="text-sm font-bold text-white mb-1">Pick Custom Date</div>
                  <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setScheduleOption('C'); }}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-zinc-900 border border-zinc-700 text-[10px] p-1.5 rounded text-white focus:outline-none" />
                </div>
              </div>
            </div>
          )}

          {status && (
            <div className={`text-sm font-bold p-3 rounded text-center ${status.includes('Error') ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Footer */}
        {searchResults.length > 0 && (
          <div className="p-4 md:p-6 border-t border-zinc-800 bg-[#0a0a0a] rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
            <button onClick={() => setView('list')} className="text-xs font-bold text-zinc-500 hover:text-white transition-colors">
              Cancel &amp; Discard
            </button>
            <div className="flex gap-3 w-full sm:w-auto">
              <button onClick={() => setView('list')} className="flex-1 sm:flex-none text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded">
                Save as Draft
              </button>
              <button onClick={handleSaveChallenge}
                className="flex-1 sm:flex-none text-xs font-bold bg-white hover:bg-zinc-200 text-black px-6 py-2.5 rounded flex items-center justify-center gap-2">
                <Calendar size={14} />
                {scheduleOption === 'A' ? `Queue (${nextQueueDate})` : scheduleOption === 'B' ? 'Make Live Today' : 'Save Custom Date'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
