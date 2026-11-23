'use client';

import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedType, setCopiedType] = useState<'json' | 'script' | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError('');
    setSchema('');
    setCopiedType(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to generate schema.');
      } else {
        setSchema(data.schema);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const scriptWrappedSchema = schema
    ? `<script type="application/ld+json">\n${schema}\n</script>`
    : '';

  const handleCopy = (mode: 'json' | 'script') => {
    if (!schema) return;
    const textToCopy = mode === 'script' ? scriptWrappedSchema : schema;
    navigator.clipboard.writeText(textToCopy);
    setCopiedType(mode);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500/30">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            SchemaCraft AI // v1.0 Live &amp; Operational
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Automated JSON-LD Schema Generator
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            Paste any website URL or business description below to instantly generate valid Google-compliant structured data.
          </p>
        </div>

        {/* Input Card */}
        <form
          onSubmit={handleGenerate}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Desert Sun HVAC in Yuma, AZ — Mon-Fri 7am-6pm..."
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-semibold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? 'Crafting...' : 'Generate Schema'}
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>

        {/* Output Card */}
        {schema && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-zinc-900 border-b border-zinc-800">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Generated JSON-LD Output
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy('json')}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer"
                >
                  {copiedType === 'json' ? 'JSON Copied!' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy('script')}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition cursor-pointer"
                >
                  {copiedType === 'script' ? 'Script Copied!' : 'Copy with <script> Tag'}
                </button>
              </div>
            </div>
            <pre className="p-5 overflow-x-auto text-sm font-mono text-emerald-300 leading-relaxed">
              <code>{schema}</code>
            </pre>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-500 font-mono">
          Powered by Gemini AI • Zero human maintenance required
        </footer>
      </div>
    </main>
  );
}
