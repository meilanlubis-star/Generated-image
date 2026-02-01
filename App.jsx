import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Settings, 
  Download, 
  History, 
  Sparkles, 
  Trash2, 
  AlertCircle,
  Loader2,
  Upload,
  X,
  RefreshCw,
  Shirt,
  Layout,
  Camera,
  User,
  Home,
  Palette,
  Maximize2,
  ChevronRight,
  Info
} from 'lucide-react';

const App = () => {
  // State Management
  const [prompt, setPrompt] = useState('');
  const [inputImage, setInputImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('general');
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);

  // Studio Categories Definitions
  const categories = [
    { id: 'general', name: 'Umum', icon: Sparkles, keywords: "highly detailed, masterpiece, 8k, professional lighting" },
    { id: 'fashion', name: 'Fashion', icon: Shirt, keywords: "high-end fashion editorial, vogue style, detailed fabric texture, professional studio lighting, 8k resolution, elegant pose, haute couture" },
    { id: 'mockup', name: 'Mockup', icon: Layout, keywords: "minimalist product mockup, clean blank surface, studio lighting, front view, isolated on neutral background, professional photography, high quality render" },
    { id: 'ugc', name: 'UGC Content', icon: Camera, keywords: "user generated content style, shot on smartphone, natural lighting, authentic lifestyle, amateur photography, realistic everyday setting, unedited look" },
    { id: 'portrait', name: 'Portrait', icon: User, keywords: "cinematic portrait, bokeh background, sharp focus on eyes, 85mm lens, soft skin tones, dramatic lighting, detailed facial features" },
    { id: 'architecture', name: 'Arsitektur', icon: Home, keywords: "modern architectural photography, wide angle, structural detail, twilight lighting, clean lines, professional exterior rendering, architectural digest style" },
    { id: 'art', name: 'Digital Art', icon: Palette, keywords: "concept art, digital painting, intricate detail, fantasy world, vibrant colors, masterwork, trending on artstation, unreal engine 5 render" },
  ];

  // Configuration State
  const [config, setConfig] = useState({
    provider: 'imagen',
    apiKey: '', // Handled by environment
    aspectRatio: '1:1',
    quality: 'standard'
  });

  useEffect(() => {
    const saved = localStorage.getItem('image_craft_history_v2');
    if (saved) {
      try {
        setResults(JSON.parse(saved));
      } catch (e) {
        console.error("Gagal memuat riwayat", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('image_craft_history_v2', JSON.stringify(results));
  }, [results]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setError("Ukuran gambar terlalu besar. Maksimal 4MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImage(reader.result);
        // Switch to Gemini i2i if image is uploaded
        setConfig(prev => ({ ...prev, provider: 'gemini-i2i' }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeInputImage = () => {
    setInputImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (config.provider === 'gemini-i2i') {
      setConfig(prev => ({ ...prev, provider: 'imagen' }));
    }
  };

  const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  const generateImage = async () => {
    if (!prompt.trim() && !inputImage) {
      setError("Mohon masukkan deskripsi atau unggah gambar referensi.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    const categoryData = categories.find(c => c.id === selectedCategory);
    const finalPrompt = `${prompt}${categoryData.keywords ? `, ${categoryData.keywords}` : ''}`;

    try {
      let imageUrl = "";
      const apiKey = ""; // Provided by environment

      if (inputImage || config.provider === 'gemini-i2i') {
        // Use Gemini 2.5 Flash for Image-to-Image / Editing
        const base64Data = inputImage.split(',')[1];
        const payload = {
          contents: [{
            parts: [
              { text: `Edit or generate image based on this description: ${finalPrompt}` },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        };

        const result = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        const generatedBase64 = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!generatedBase64) throw new Error("Gagal menghasilkan gambar melalui Gemini.");
        imageUrl = `data:image/png;base64,${generatedBase64}`;

      } else {
        // Use Imagen 4.0 for Text-to-Image
        const response = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt: finalPrompt }],
              parameters: { 
                sampleCount: 1,
                aspectRatio: config.aspectRatio === '1:1' ? '1:1' : config.aspectRatio === '16:9' ? '16:9' : '3:4'
              }
            })
          }
        );
        
        if (!response.predictions?.[0]?.bytesBase64Encoded) throw new Error("Gagal menghasilkan gambar melalui Imagen.");
        imageUrl = `data:image/png;base64,${response.predictions[0].bytesBase64Encoded}`;
      }

      const newResult = {
        id: Date.now(),
        url: imageUrl,
        prompt: prompt || `Studio ${categoryData.name}`,
        category: categoryData.name,
        timestamp: new Date().toLocaleTimeString(),
        provider: inputImage ? 'Gemini i2i' : 'Imagen 4.0',
        config: { ...config }
      };

      setResults([newResult, ...results]);
      setPrompt('');
      // We keep the input image so users can iterate, or clear it if preferred.
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteResult = (id) => {
    setResults(results.filter(r => r.id !== id));
  };

  const downloadImage = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <div className="flex items-center gap-4 group">
            <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-3 rounded-2xl shadow-xl shadow-indigo-500/20 group-hover:rotate-6 transition-transform">
              <Sparkles className="w-8 h-8 text-white fill-white/20" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                ImageCraft <span className="text-indigo-500">Studio</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-[0.2em]">Next-Gen Visual Engine</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 border ${
                showSettings 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-600 backdrop-blur-md'
              }`}
            >
              <Settings className={`w-4 h-4 ${showSettings ? 'animate-spin-slow' : ''}`} />
              <span>Studio Engine</span>
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Controls Sidebar */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Category Grid */}
            <section className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                  <Layout className="w-3.5 h-3.5" /> Pilih Mode Studio
                </h3>
                <div className="h-px flex-1 bg-slate-800/60 mx-4"></div>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all duration-300 gap-2.5 group ${
                      selectedCategory === cat.id 
                      ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.15)] ring-1 ring-indigo-500/30' 
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg transition-colors ${selectedCategory === cat.id ? 'bg-indigo-500/20' : 'bg-slate-800/30 group-hover:bg-slate-800/50'}`}>
                      <cat.icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Config Panel */}
            {showSettings && (
              <div className="bg-slate-900/80 border border-indigo-500/40 rounded-3xl p-6 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 backdrop-blur-2xl">
                <div className="space-y-6">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      <ChevronRight className="w-3 h-3 text-indigo-500" /> Image Provider
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setConfig({...config, provider: 'imagen'})}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${config.provider === 'imagen' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                      >
                        Imagen 4.0
                      </button>
                      <button 
                        onClick={() => setConfig({...config, provider: 'gemini-i2i'})}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${config.provider === 'gemini-i2i' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                      >
                        Gemini i2i
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      <ChevronRight className="w-3 h-3 text-indigo-500" /> Aspek Rasio
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['1:1', '16:9', '4:5'].map(ratio => (
                        <button
                          key={ratio}
                          onClick={() => setConfig({...config, aspectRatio: ratio})}
                          className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                            config.aspectRatio === ratio 
                            ? 'bg-white text-slate-950 border-white' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Prompt & Upload Area */}
            <div className="bg-gradient-to-b from-slate-900/60 to-slate-950/60 border border-slate-800/80 rounded-[2rem] p-8 shadow-2xl space-y-6 backdrop-blur-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Sparkles className="w-24 h-24" />
              </div>

              <div className="relative">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-4 bg-indigo-500 rounded-full"></div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Studio Input
                    </label>
                  </div>
                  {!inputImage && (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-black text-indigo-400 flex items-center gap-1.5 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 uppercase tracking-tighter"
                    >
                      <Upload className="w-3 h-3" /> Referensi
                    </button>
                  )}
                </div>

                {!inputImage ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800/80 hover:border-indigo-500/40 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-950/40 group mb-6"
                  >
                    <div className="p-4 rounded-2xl bg-slate-900 group-hover:scale-110 transition-transform duration-500 mb-4 shadow-inner">
                      <ImageIcon className="w-8 h-8 text-slate-700 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-600 group-hover:text-slate-400 uppercase tracking-widest transition-colors">Tambah Gambar Referensi</p>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                  </div>
                ) : (
                  <div className="relative rounded-3xl overflow-hidden aspect-video bg-slate-950 border border-indigo-500/20 group mb-6 shadow-2xl">
                    <img src={inputImage} alt="Input" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                      <button 
                        onClick={removeInputImage} 
                        className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-600 transition-colors shadow-xl"
                      >
                        <X className="w-4 h-4" /> REMOVE
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your creative vision in detail..."
                    className="w-full h-36 bg-slate-950/80 border border-slate-800/80 rounded-3xl p-6 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all resize-none shadow-inner text-sm leading-relaxed font-medium"
                  />
                  <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-600 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                    {prompt.length} CHARS
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> 
                  <div>
                    <span className="font-bold block uppercase tracking-tighter mb-0.5 text-[10px]">Engine Error</span>
                    {error}
                  </div>
                </div>
              )}

              <button 
                onClick={generateImage}
                disabled={isGenerating}
                className={`w-full py-5 rounded-[1.5rem] flex items-center justify-center gap-3 font-black text-lg transition-all shadow-2xl relative overflow-hidden group ${
                  isGenerating 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:shadow-indigo-500/40 text-white'
                }`}
              >
                {!isGenerating && (
                  <div className="absolute inset-0 w-1/4 h-full bg-white/10 -skew-x-[45deg] -translate-x-full group-hover:translate-x-[500%] transition-transform duration-1000 ease-in-out"></div>
                )}
                {isGenerating ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="uppercase tracking-[0.2em] text-sm">Processing Neural Net...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                    <span className="uppercase tracking-[0.2em] text-sm">Start Generation</span>
                  </>
                )}
              </button>
              
              <div className="flex items-center gap-2 justify-center text-slate-600">
                <Info className="w-3 h-3" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Uses high-compute AI models</p>
              </div>
            </div>
          </div>

          {/* Gallery View */}
          <div className="lg:col-span-7 space-y-8">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-black flex items-center gap-3 tracking-tighter italic">
                <div className="bg-indigo-500 w-2 h-2 rounded-full shadow-[0_0_10px_rgba(79,70,229,1)]"></div>
                STUDIO GALLERY
              </h2>
              {results.length > 0 && (
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                  {results.length} Artifacts
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div className="h-[600px] border-2 border-dashed border-slate-800/60 rounded-[3rem] flex flex-col items-center justify-center text-slate-700 space-y-6 bg-slate-900/20 backdrop-blur-sm overflow-hidden relative">
                <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-5 pointer-events-none">
                   {[...Array(36)].map((_, i) => <div key={i} className="border-[0.5px] border-white/10"></div>)}
                </div>
                <div className="bg-slate-900/80 p-8 rounded-[2.5rem] shadow-2xl relative z-10 border border-slate-800/50">
                  <ImageIcon className="w-20 h-20 opacity-20 mx-auto mb-4" />
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-center max-w-[200px] leading-loose">
                    Waiting for your creative spark
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-20">
                {results.map((img) => (
                  <div key={img.id} className="group bg-slate-900/60 rounded-[2rem] overflow-hidden border border-slate-800/80 hover:border-indigo-500/50 transition-all duration-500 shadow-2xl relative animate-in zoom-in-95 fade-in duration-500">
                    <div className="relative aspect-square overflow-hidden bg-slate-950">
                      <img 
                        src={img.url} 
                        alt={img.prompt} 
                        className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" 
                        loading="lazy" 
                      />
                      
                      {/* Meta Overlay */}
                      <div className="absolute top-4 left-4 flex gap-2">
                        <div className="bg-indigo-600 px-3 py-1 rounded-full text-[10px] text-white font-black uppercase tracking-widest shadow-lg border border-indigo-400/30">
                          {img.category}
                        </div>
                        <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-slate-400 font-black uppercase tracking-widest shadow-lg border border-slate-700/50">
                          {img.provider}
                        </div>
                      </div>

                      {/* Hover Controls */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6">
                        <div className="flex gap-3 mb-6">
                          <button 
                            onClick={() => setSelectedImage(img)} 
                            className="p-3 bg-white/10 hover:bg-white text-white hover:text-slate-950 backdrop-blur-xl rounded-2xl transition-all shadow-xl"
                          >
                            <Maximize2 className="w-6 h-6" />
                          </button>
                          <button 
                            onClick={() => downloadImage(img.url, `craft-${img.id}.png`)} 
                            className="p-3 bg-white/10 hover:bg-white text-white hover:text-slate-950 backdrop-blur-xl rounded-2xl transition-all shadow-xl"
                          >
                            <Download className="w-6 h-6" />
                          </button>
                          <button 
                            onClick={() => deleteResult(img.id)} 
                            className="p-3 bg-red-500/20 hover:bg-red-500 text-white backdrop-blur-xl rounded-2xl transition-all shadow-xl"
                          >
                            <Trash2 className="w-6 h-6" />
                          </button>
                        </div>
                        <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-2 px-1">Studio Prompt</p>
                        <p className="text-xs text-slate-100 line-clamp-2 leading-relaxed font-medium italic px-1 drop-shadow-md">
                          "{img.prompt}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Full Image Modal */}
        {selectedImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl" onClick={() => setSelectedImage(null)}></div>
            <div className="relative max-w-5xl w-full bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-slate-800 animate-in zoom-in-95 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2 bg-black flex items-center justify-center">
                  <img src={selectedImage.url} alt="Large preview" className="max-h-[80vh] w-full object-contain" />
                </div>
                <div className="p-8 lg:p-12 space-y-8 flex flex-col justify-center">
                  <div>
                    <div className="inline-block bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4">
                      {selectedImage.category} STUDIO
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tighter mb-4 italic leading-tight">Visual Masterpiece</h2>
                    <p className="text-slate-400 text-sm leading-relaxed italic border-l-2 border-indigo-500/30 pl-4 py-2">
                      "{selectedImage.prompt}"
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Provider</p>
                      <p className="text-xs font-bold text-slate-300">{selectedImage.provider}</p>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Created</p>
                      <p className="text-xs font-bold text-slate-300">{selectedImage.timestamp}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => downloadImage(selectedImage.url, `studio-hq-${selectedImage.id}.png`)}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl"
                    >
                      <Download className="w-5 h-5" /> Download Asset
                    </button>
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-6 right-6 p-2 bg-black/50 text-white rounded-full hover:bg-black transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Background Decorative Elements */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default App;
