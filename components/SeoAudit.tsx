import React, { useState, useRef, useEffect } from 'react';
import { generateSeoAdvice } from '../services/geminiService';
import { ChatMessage } from '../types';
import { Send, Bot, User, Globe, Loader2, Sparkles, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export const SeoAudit: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  const [useThinking, setUseThinking] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text: string = prompt) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      text: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    setIsLoading(true);

    try {
      const systemInstruction = "You are a DevOps + Technical SEO engineer specialized in static site hosting, Nginx, Apache, and Cloudflare configurations. You provide strictly technical, production-ready code.";
      const { text: responseText, groundingUrls } = await generateSeoAdvice(text, useThinking, useSearch, systemInstruction);
      
      const botMessage: ChatMessage = {
        role: 'model',
        text: responseText,
        isThinking: useThinking,
        groundingUrls,
        timestamp: Date.now(),
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        role: 'model',
        text: "I encountered an error analyzing your request. Please try again.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const runBlankDigiAudit = () => {
    const auditPrompt = `You are a DevOps + Technical SEO engineer for a static HTML website hosted from /var/www/blankdigi/.

Site files (authoritative):
/index.html
/about.html
/contact.html
/cookies.html
/privacy.html
/terms.html
/robots.txt
/sitemap.xml
/ads.txt
/css/style.css
/js/*.js
/brand/logo-navbar.png

Canonical goals (must be single-hop):
1) Force HTTPS.
2) Force non-www (blankdigi.com).
3) Use extensionless URLs as canonical:
   - /about instead of /about.html
   - /privacy instead of /privacy.html
   Serve /about by internally mapping to about.html.
4) Normalize trailing slash:
   - /about/ -> /about
5) Return 410 for common bot/junk endpoints (wp-login, wp-json, xmlrpc, .env, .git, etc.) but do NOT assume WordPress exists.

Tasks:
A) Output Nginx rules (preferred), Apache .htaccess alternative, and Cloudflare Redirect Rules.
B) Provide a sitemap.xml containing ONLY the canonical URLs from the file list above (no .html).
C) Provide robots.txt referencing the sitemap and blocking junk endpoints.
D) Provide verification checklist using curl (must confirm no redirect chains) + Google Search Console steps.

Output: code blocks + step-by-step checklist. Keep it specific to this static site.`;
    handleSendMessage(auditPrompt);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">SEO & DevOps Agent</h2>
          <p className="text-slate-400">Powered by Gemini 3 Pro (Thinking) & Google Search</p>
        </div>
        <button 
          onClick={runBlankDigiAudit}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg hover:shadow-cyan-500/25"
        >
          <Terminal className="w-4 h-4" />
          Run BlankDigi Audit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-900/50 rounded-2xl border border-slate-800 p-6 mb-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
            <Bot className="w-16 h-16 mb-4" />
            <p className="text-lg">Ready to analyze blankdigi.com</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-cyan-600'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            
            <div className={`max-w-[85%] rounded-2xl p-6 ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-800 text-slate-200 border border-slate-700'
            }`}>
              {msg.role === 'model' && msg.isThinking && (
                 <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-3 bg-cyan-950/30 px-2 py-1 rounded w-fit">
                    <Sparkles className="w-3 h-3" />
                    <span>Thinking Process Active (32k Budget)</span>
                 </div>
              )}
              
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>

              {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Globe className="w-3 h-3" />
                    Sources
                  </h4>
                  <div className="grid gap-2">
                    {msg.groundingUrls.map((url, i) => (
                      <a 
                        key={i} 
                        href={url.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm text-cyan-400 hover:text-cyan-300 truncate block hover:underline"
                      >
                        {url.title || url.uri}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
             <div className="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center flex-shrink-0">
               <Bot className="w-5 h-5" />
             </div>
             <div className="bg-slate-800 rounded-2xl p-6 flex items-center gap-3">
               <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
               <span className="text-slate-400">Analyzing architecture...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex gap-4 items-end">
         <div className="flex-1">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask for Nginx rules, sitemap structure, or current SEO status..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none h-24"
            />
            <div className="flex gap-4 mt-2">
               <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-cyan-400 transition-colors">
                 <input 
                  type="checkbox" 
                  checked={useThinking} 
                  onChange={(e) => setUseThinking(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                 />
                 Enable Deep Thinking
               </label>
               <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-cyan-400 transition-colors">
                 <input 
                  type="checkbox" 
                  checked={useSearch} 
                  onChange={(e) => setUseSearch(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                 />
                 Enable Google Search
               </label>
            </div>
         </div>
         <button
           onClick={() => handleSendMessage()}
           disabled={isLoading || !prompt.trim()}
           className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors h-12 w-12 flex items-center justify-center mb-6 shadow-lg shadow-blue-900/20"
         >
           <Send className="w-5 h-5" />
         </button>
      </div>
    </div>
  );
};