'use client';
import React, { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [schemaResult, setSchemaResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError('');
    setSchemaResult('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate schema');

      setSchemaResult(data.schema);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(schemaResult);
    alert('Schema copied to clipboard!');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-6 md:p-12">
      <div className="w-full max-w-3xl space-y-8">
        <header className="border-b border-slate-800 pb-4 flex justify-between items-center text-xs tracking-wider text-slate-400 font-mono">
          <span>SCHEMA-CRAFT AI // V1.0</span>
          <span className="text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            LIVE & OPERATIONAL
          </span>
        </header>

        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Automated JSON-LD Schema Generator
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            Paste any website URL or business description below to instantly generate valid Google-compliant structured data.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Yuma Solar Repair, https://mybusiness.com"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-lg transition-colors text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center min-w-[150px]"
            >
              {loading ? 'Crafting...' : 'Generate Schema'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        {schemaResult && (
          <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">Generated JSON-LD Output</span>
              <button
                onClick={copyToClipboard}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded transition-colors"
              >
                Copy Code
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {schemaResult}
            </pre>
          </div>
        )}

        <footer className="pt-8 border-t border-slate-900 text-xs text-slate-500 flex justify-between">
          <span>Powered by Gemini AI</span>
          <span>Zero human maintenance required</span>
        </footer>
      </div>
    </main>
  );
}
