export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-sm font-medium">
          SchemaCraft AI — Live & Operational
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Automated JSON-LD Schema Generator
        </h1>
        <p className="text-slate-400">
          Paste any website URL or business description below to instantly generate valid Google-compliant structured data.
        </p>
        
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left space-y-4 shadow-xl">
          <input 
            type="text" 
            placeholder="https://yourbusiness.com" 
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors">
            Generate Schema
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Powered by Gemini AI • Zero human maintenance required
        </p>
      </div>
    </main>
  );
}
