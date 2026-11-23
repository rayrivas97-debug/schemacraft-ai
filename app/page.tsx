'use client';

import { useEffect, useState } from 'react';

const DAILY_FREE_LIMIT = 5;
const LOCAL_USAGE_KEY = 'schemacraft_daily_usage_v1';

const SCHEMA_TYPES = [
  {
    id: 'Auto-Detect',
    label: 'Auto-Detect',
    placeholder: 'e.g., Desert Sun HVAC in Yuma, AZ — Mon-Fri 7am-6pm...',
  },
  {
    id: 'LocalBusiness',
    label: 'LocalBusiness',
    placeholder: 'e.g., Borderline Comfort Cooling, 1450 S 4th Ave, Yuma, AZ, (928) 555-0194...',
  },
  {
    id: 'Product',
    label: 'Product',
    placeholder: 'e.g., Iron Wave 24V Portable Boombox — 2.1 Bluetooth speaker, $299 USD, in stock...',
  },
  {
    id: 'Organization',
    label: 'Organization',
    placeholder: 'e.g., SchemaCraft AI — Automated JSON-LD schema generator at schemacraft-ai-phi.vercel.app...',
  },
  {
    id: 'Article',
    label: 'Article',
    placeholder: 'e.g., Blog post "How JSON-LD Boosts Local SEO" by Ray Rivas, published Nov 23, 2026...',
  },
  {
    id: 'Service',
    label: 'Service',
    placeholder: 'e.g., Commercial solar panel recycling & nationwide freight pickup by We Recycle Solar...',
  },
  {
    id: 'Event',
    label: 'Event',
    placeholder: 'e.g., Yuma Desert Tech Meetup on Dec 12, 2026 at 6:00 PM, Main Street Hub, Yuma, AZ...',
  },
] as const;

const PLATFORM_GUIDES = [
  {
    id: 'wordpress',
    name: 'WordPress',
    copyButton: 'Copy with <script> Tag',
    steps: [
      'Open the page or post in the WordPress Block Editor and add a Custom HTML block (or use a header/footer plugin like WPCode for sitewide schema).',
      'Paste the full <script type="application/ld+json"> snippet into the block and click Update / Publish.',
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    copyButton: 'Copy with <script> Tag',
    steps: [
      'In Shopify Admin, go to Online Store → Themes → ••• → Edit code, and open layout/theme.liquid (or a specific product/page section).',
      'Paste the full <script type="application/ld+json"> snippet right before the closing </head> tag and click Save.',
    ],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    copyButton: 'Copy with <script> Tag',
    steps: [
      'Open your project in Webflow Designer, click Pages (P), and click the gear icon next to the page you want to mark up.',
      'Scroll down to Custom Code → Inside <head> tag, paste the full <script type="application/ld+json"> snippet, save, and publish.',
    ],
  },
] as const;

const VALUE_CARDS = [
  {
    title: 'Zero Syntax Errors',
    description:
      'Every output is validated for strict JSON-LD compliance before display, eliminating broken brackets, missing @context tags, and invalid properties.',
  },
  {
    title: 'Rich Result Eligibility',
    description:
      'Structured data helps Google display business hours, product pricing, availability, and article metadata directly in search results.',
  },
  {
    title: 'Built for Non-Coders',
    description:
      'One-click <script> wrapping and step-by-step placement guides for WordPress, Shopify, and Webflow—no developer required.',
  },
];

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [selectedType, setSelectedType] = useState<string>('Auto-Detect');
  const [schema, setSchema] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [remainingFree, setRemainingFree] = useState<number>(DAILY_FREE_LIMIT);
  const [copiedMode, setCopiedMode] = useState<'json' | 'script' | null>(null);
  const [showPasteGuide, setShowPasteGuide] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'wordpress' | 'shopify' | 'webflow'>('wordpress');

  useEffect(() => {
    try {
      const today = getTodayKey();
      const raw = localStorage.getItem(LOCAL_USAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.day === today && typeof parsed?.used === 'number') {
          const left = Math.max(0, DAILY_FREE_LIMIT - parsed.used);
          setRemainingFree(left);
          setLimitReached(left === 0);
          return;
        }
      }
      localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify({ day: today, used: 0 }));
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const syncLocalRemaining = (left: number) => {
    setRemainingFree(left);
    setLimitReached(left === 0);
    try {
      const used = Math.max(0, DAILY_FREE_LIMIT - left);
      localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify({ day: getTodayKey(), used }));
    } catch {
      // Ignore storage access errors
    }
  };

  const activeOption =
    SCHEMA_TYPES.find((t) => t.id === selectedType) || SCHEMA_TYPES[0];

  const currentGuide =
    PLATFORM_GUIDES.find((p) => p.id === activePlatform) || PLATFORM_GUIDES[0];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || limitReached) return;

    setLoading(true);
    setError('');
    setSchema('');
    setCopiedMode(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schemaType: selectedType }),
      });

      const data = await res.json();

      if (typeof data?.remainingFree === 'number') {
        syncLocalRemaining(data.remainingFree);
      }

      if (!res.ok) {
        if (res.status === 429 || data?.limitReached) {
          syncLocalRemaining(0);
          setLimitReached(true);
        }
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

  const handleCopy = async (mode: 'json' | 'script') => {
    if (!schema) return;
    const textToCopy = mode === 'script' ? scriptWrappedSchema : schema;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 2000);
    } catch {
      setError('Unable to copy to clipboard. Please copy manually.');
    }
  };

  const scrollToGenerator = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-6 py-14 sm:py-20 selection:bg-emerald-500/30">
      <div className="w-full max-w-4xl space-y-20">
        {/* Hero & Interactive Generator */}
        <section className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              SchemaCraft AI // v1.4 Live &amp; Operational
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
            {/* Daily Free Quota Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-zinc-800/70 text-xs font-mono">
              <span className="text-zinc-400">
                Starter Plan:{' '}
                <strong
                  className={
                    remainingFree === 0 ? 'text-amber-400' : 'text-emerald-400'
                  }
                >
                  {remainingFree} / {DAILY_FREE_LIMIT} free schemas left today
                </strong>
              </span>
              <span className="text-zinc-500">Resets daily</span>
            </div>

            {/* Schema Type Quick-Pick Pills */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Schema Type
                </span>
                <span className="text-xs text-zinc-500">
                  {selectedType === 'Auto-Detect'
                    ? 'AI picks best match'
                    : `Forcing @type: ${selectedType}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SCHEMA_TYPES.map((type) => {
                  const isSelected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedType(type.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                          : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={limitReached}
                placeholder={
                  limitReached
                    ? 'Daily free limit reached (5/5 used today)'
                    : activeOption.placeholder
                }
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim() || limitReached}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-semibold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading
                  ? 'Crafting...'
                  : limitReached
                    ? 'Daily Limit Reached'
                    : 'Generate Schema'}
              </button>
            </div>

            {limitReached && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-emerald-300">
                    You&apos;ve reached today&apos;s 5 free schema generations.
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Pro ($12/mo) with unlimited generations, multi-schema @graph bundles, and saved history is coming soon.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const pricingEl = document.getElementById('pricing');
                    pricingEl?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  View Pro Plan ↓
                </button>
              </div>
            )}

            {error && !limitReached && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
          </form>

          {/* Output Card */}
          {schema && (
            <div className="space-y-4">
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
                      {copiedMode === 'json' ? 'JSON Copied!' : 'Copy JSON'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('script')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition cursor-pointer"
                    >
                      {copiedMode === 'script' ? 'Script Copied!' : 'Copy with <script> Tag'}
                    </button>
                  </div>
                </div>
                <pre className="p-5 whitespace-pre-wrap break-words text-sm font-mono text-emerald-300 leading-relaxed">
                  <code>{schema}</code>
                </pre>
              </div>

              {/* Where do I paste this? Collapsible Helper */}
              <div className="bg-zinc-900/60 border border-zinc-800/90 rounded-2xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setShowPasteGuide((prev) => !prev)}
                    className="flex items-center gap-2 text-left text-sm font-medium text-zinc-200 hover:text-emerald-300 transition cursor-pointer"
                  >
                    <span className="text-emerald-400 font-mono text-xs">
                      {showPasteGuide ? '▼' : '▶'}
                    </span>
                    <span>Where do I paste this? (WordPress, Shopify &amp; Webflow)</span>
                  </button>

                  <a
                    href="https://search.google.com/test/rich-results"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition"
                  >
                    Verify in Google Rich Results Test ↗
                  </a>
                </div>

                {showPasteGuide && (
                  <div className="px-5 pb-5 pt-2 border-t border-zinc-800/80 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {PLATFORM_GUIDES.map((platform) => {
                        const isActive = activePlatform === platform.id;
                        return (
                          <button
                            key={platform.id}
                            type="button"
                            onClick={() => setActivePlatform(platform.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                              isActive
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                            }`}
                          >
                            {platform.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-4 space-y-2.5 text-sm text-zinc-300">
                      <div className="text-xs font-mono text-zinc-400">
                        Recommended button:{' '}
                        <span className="text-emerald-300">{currentGuide.copyButton}</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-zinc-300 leading-relaxed">
                        {currentGuide.steps.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* How It Works & Value Props */}
        <section className="space-y-8 border-t border-zinc-900 pt-16">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
              Why Structured Data Matters
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Turn Plain Business Details Into Search-Ready JSON-LD
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-2xl mx-auto">
              Search engines rely on Schema.org markup to understand your business, products, and content. SchemaCraft AI builds clean code in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VALUE_CARDS.map((card, idx) => (
              <div
                key={card.title}
                className="bg-zinc-900/50 border border-zinc-800/90 rounded-2xl p-6 space-y-3"
              >
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                  0{idx + 1}
                </div>
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {card.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Simple Pricing Tiers */}
        <section id="pricing" className="space-y-8 border-t border-zinc-900 pt-16">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
              Simple Plans
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Start Generating Free. Upgrade When You Scale.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free Tier */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Starter</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-mono">
                    Free Forever
                  </span>
                </div>
                <div className="text-3xl font-bold text-white">
                  $0 <span className="text-sm font-normal text-zinc-400">/ month</span>
                </div>
                <ul className="space-y-2.5 text-sm text-zinc-300">
                  <li>✓ {DAILY_FREE_LIMIT} free schema generations per day</li>
                  <li>✓ All 7 schema types &amp; Auto-Detect</li>
                  <li>✓ WordPress, Shopify &amp; Webflow guides</li>
                  <li>✓ Validated for Google Rich Results</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={scrollToGenerator}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold transition cursor-pointer"
              >
                Use Starter Free ↑
              </button>
            </div>

            {/* Pro Tier */}
            <div className="bg-zinc-900/90 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Pro</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                    Coming Soon
                  </span>
                </div>
                <div className="text-3xl font-bold text-white">
                  $12 <span className="text-sm font-normal text-zinc-400">/ month</span>
                </div>
                <ul className="space-y-2.5 text-sm text-zinc-300">
                  <li>✓ Unlimited daily schema generations</li>
                  <li>✓ Live URL auto-scan &amp; metadata extraction</li>
                  <li>✓ Multi-schema page bundles (@graph)</li>
                  <li>✓ Saved schema history &amp; client exports</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={scrollToGenerator}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-sm font-semibold transition cursor-pointer"
              >
                Try Free While Pro Launches
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-500 font-mono border-t border-zinc-900 pt-8">
          SchemaCraft AI • Powered by Gemini AI • Built for WordPress, Shopify &amp; Webflow
        </footer>
      </div>
    </main>
  );
}
