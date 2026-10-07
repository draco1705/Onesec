'use client';

import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [artistName, setArtistName] = useState('');
  const [playDate, setPlayDate] = useState('');
  const [status, setStatus] = useState('');

  // Fetch history (mocked for now since we don't have direct supabase select endpoint exposed)
  // We'll create a quick API route for this.
  useEffect(() => {
    fetch('/api/dashboard/history')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setHistory(data);
      });
  }, []);

  const handleAddArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Adding...');
    const res = await fetch('/api/cron/generate-daily', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer secret` // default secret
      },
      body: JSON.stringify({ artistName, playDate })
    });
    const data = await res.json();
    if (data.success) {
      setStatus('Added successfully!');
      setHistory([data.challenge, ...history]);
      setArtistName('');
      setPlayDate('');
    } else {
      setStatus(`Error: ${data.error}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#111] p-6 rounded-lg border border-zinc-800">
          <h2 className="text-xl font-bold mb-4">Add Next Day's Artist</h2>
          <form onSubmit={handleAddArtist} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Artist Name (e.g. Drake)</label>
              <input 
                type="text" 
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Play Date (YYYY-MM-DD)</label>
              <input 
                type="date" 
                value={playDate}
                onChange={e => setPlayDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                required
              />
            </div>
            <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded transition-colors">
              Add to Schedule
            </button>
            {status && <div className="text-sm text-zinc-400 mt-2">{status}</div>}
          </form>
        </div>

        <div className="bg-[#111] p-6 rounded-lg border border-zinc-800">
          <h2 className="text-xl font-bold mb-4">Challenge History</h2>
          <div className="space-y-4">
            {history.length > 0 ? history.map((item, i) => (
              <div key={i} className="bg-zinc-900 p-3 rounded flex items-center gap-4">
                <img src={item.artist_image_url} alt={item.artist_name} className="w-12 h-12 rounded object-cover" />
                <div>
                  <div className="font-bold">{item.artist_name}</div>
                  <div className="text-sm text-zinc-400">Date: {item.play_date}</div>
                </div>
              </div>
            )) : <div className="text-zinc-500">No history found or database not connected.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
