import React, { useState } from 'react';
import { generateImage, editImage, generateVideo, checkVeoAuth, triggerVeoAuth } from '../services/geminiService';
import { Image, Video, Wand2, RefreshCw, Upload, Download, Film, Layers, Sparkles } from 'lucide-react';

type Mode = 'generate' | 'edit' | 'video';

export const CreativeStudio: React.FC = () => {
  const [mode, setMode] = useState<Mode>('generate');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "4:3" | "9:16" | "16:9">("16:9");
  const [isLoading, setIsLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  
  // File handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setResultUrl(null); // Clear previous result
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAction = async () => {
    if (!prompt && mode === 'generate') return;
    if (!uploadedImage && (mode === 'edit' || mode === 'video')) return;
    
    setIsLoading(true);
    setResultUrl(null);

    try {
      if (mode === 'generate') {
        const url = await generateImage(prompt, aspectRatio);
        setResultUrl(url);
      } else if (mode === 'edit' && uploadedImage) {
        const url = await editImage(uploadedImage, prompt);
        setResultUrl(url);
      } else if (mode === 'video' && uploadedImage) {
        // Veo Check
        const hasKey = await checkVeoAuth();
        if (!hasKey) {
            await triggerVeoAuth();
        }
        // Aspect ratio for Veo: 16:9 or 9:16
        const veoRatio = aspectRatio === "9:16" ? "9:16" : "16:9"; 
        const url = await generateVideo(uploadedImage, prompt, veoRatio);
        setResultUrl(url);
      }
    } catch (e) {
      console.error(e);
      alert("Operation failed. See console.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
      {/* Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-cyan-400" />
          Creative Studio
        </h2>

        <div className="flex bg-slate-800 p-1 rounded-lg mb-8">
          <button 
            onClick={() => { setMode('generate'); setResultUrl(null); setUploadedImage(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'generate' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Generate
          </button>
          <button 
            onClick={() => { setMode('edit'); setResultUrl(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'edit' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Edit
          </button>
          <button 
            onClick={() => { setMode('video'); setResultUrl(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'video' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Animate
          </button>
        </div>

        <div className="space-y-6">
          {(mode === 'edit' || mode === 'video') && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Source Image</label>
              <div className="border-2 border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-cyan-500 transition-colors">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                   {uploadedImage ? (
                     <img src={uploadedImage} alt="Source" className="max-h-32 rounded-lg mb-2 object-cover" />
                   ) : (
                     <Upload className="w-8 h-8 text-slate-500 mb-2" />
                   )}
                   <span className="text-sm text-slate-300">{uploadedImage ? 'Change Image' : 'Upload Image'}</span>
                </label>
              </div>
            </div>
          )}

          <div>
             <label className="block text-sm font-medium text-slate-400 mb-2">
               {mode === 'edit' ? 'Editing Instruction' : mode === 'video' ? 'Animation Prompt' : 'Image Description'}
             </label>
             <textarea 
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none h-32 resize-none"
               placeholder={
                 mode === 'generate' ? "A futuristic server room with neon lights..." :
                 mode === 'edit' ? "Add a retro film grain filter..." :
                 "Camera pans slowly to the right..."
               }
             />
          </div>

          {(mode === 'generate' || mode === 'video') && (
             <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                  {["16:9", "9:16", "1:1", "4:3", "3:4"].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio as any)}
                      disabled={mode === 'video' && !["16:9", "9:16"].includes(ratio)}
                      className={`py-2 text-xs rounded border ${
                        aspectRatio === ratio 
                          ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      } ${mode === 'video' && !["16:9", "9:16"].includes(ratio) ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                {mode === 'video' && <p className="text-xs text-slate-500 mt-2">Veo supports 16:9 and 9:16 only.</p>}
             </div>
          )}
          
          <button
            onClick={handleAction}
            disabled={isLoading || (!prompt && mode === 'generate') || (!uploadedImage && mode !== 'generate')}
            className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
          >
            {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {mode === 'generate' ? 'Generate Image' : mode === 'edit' ? 'Apply Edit' : 'Generate Video'}
          </button>
          
          {mode === 'video' && (
             <p className="text-xs text-center text-slate-500">
               Video generation (Veo) requires a paid API key selection.
             </p>
          )}
        </div>
      </div>

      {/* Result View */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col relative min-h-[500px]">
         <div className="flex-1 flex items-center justify-center bg-slate-950/50 rounded-xl border border-dashed border-slate-800 overflow-hidden relative">
            {isLoading ? (
               <div className="text-center">
                  <div className="w-16 h-16 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-400 animate-pulse">Creating masterpiece...</p>
                  {mode === 'video' && <p className="text-xs text-slate-600 mt-2">This may take a minute...</p>}
               </div>
            ) : resultUrl ? (
               mode === 'video' ? (
                 <video src={resultUrl} controls className="max-h-full max-w-full rounded-lg shadow-2xl" autoPlay loop />
               ) : (
                 <img src={resultUrl} alt="Generated" className="max-h-full max-w-full rounded-lg shadow-2xl object-contain" />
               )
            ) : (
               <div className="text-slate-600 flex flex-col items-center">
                  <Layers className="w-16 h-16 mb-4 opacity-50" />
                  <p>No content generated yet</p>
               </div>
            )}
         </div>

         {resultUrl && (
            <div className="mt-4 flex justify-end">
               <a 
                 href={resultUrl} 
                 download={`blankdigi-generated.${mode === 'video' ? 'mp4' : 'png'}`}
                 className="flex items-center gap-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors"
               >
                 <Download className="w-4 h-4" />
                 Download
               </a>
            </div>
         )}
         
         <div className="absolute top-4 right-4 flex gap-2">
            {mode === 'generate' && <span className="bg-green-500/10 text-green-400 text-xs px-2 py-1 rounded border border-green-500/20">Gemini 3 Pro</span>}
            {mode === 'edit' && <span className="bg-yellow-500/10 text-yellow-400 text-xs px-2 py-1 rounded border border-yellow-500/20">Nano Banana</span>}
            {mode === 'video' && <span className="bg-pink-500/10 text-pink-400 text-xs px-2 py-1 rounded border border-pink-500/20">Veo 3.1</span>}
         </div>
      </div>
    </div>
  );
};