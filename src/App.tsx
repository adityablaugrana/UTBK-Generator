import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Image as ImageIcon, FileText, X, Loader2, Brain, Sparkles, PlusCircle, BookOpen, Settings2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { motion, AnimatePresence } from 'motion/react';
import mammoth from 'mammoth';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Tab = 'solver' | 'generator';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('solver');
  const [selectedModel, setSelectedModel] = useState<'pro' | 'flash'>('pro');
  const [hasKey, setHasKey] = useState<boolean>(true);
  
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    } else {
      alert("Fitur ini hanya tersedia di lingkungan AI Studio. Di Netlify, silakan atur GEMINI_API_KEY di Site Settings.");
    }
  };
  const [textQuestion, setTextQuestion] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          setFile(blob);
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix (e.g., "data:image/png;base64,")
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!textQuestion.trim() && !file && activeTab === 'solver') {
      setError('Harap masukkan teks soal atau unggah gambar/PDF/Word.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey && !window.aistudio) {
        throw new Error("API Key tidak ditemukan. Pastikan Anda sudah mengatur GEMINI_API_KEY di environment variables Netlify dan melakukan re-deploy.");
      }

      // Create a fresh instance right before the call to ensure the latest key is used
      const currentAi = new GoogleGenAI({ apiKey: apiKey || '' });
      const promptParts: any[] = [];
      
      const solverInstruction = `
        Anda adalah seorang tutor UTBK dan Seleksi Mandiri PTN yang jenius dengan IQ di atas 150. 
        Tugas Anda adalah menyelesaikan soal yang diberikan.
        
        PENTING: 
        - Gunakan notasi LaTeX untuk rumus matematika, fungsi, dan simbol teknis.
        - Gunakan tanda dollar ganda ($$) untuk rumus yang ingin ditampilkan di baris baru (display mode).
        - Gunakan tanda dollar tunggal ($) untuk rumus di dalam kalimat (inline mode).
        - Pastikan output bersih, rapi, dan profesional.

        ATURAN FORMATTING KHUSUS:
        - Jika ada opsi jawaban (A, B, C, D, E), buatlah dalam bentuk LIST KE BAWAH (satu baris per opsi).
        - Setiap kalimat atau poin pembahasan dalam penjelasan HARUS dibuat per baris (gunakan double newline atau bullet points) agar mudah dibaca. JANGAN menumpuk teks dalam satu paragraf panjang.

        FORMAT OUTPUT HARUS SANGAT RAPI:
        
        ### 1. KUNCI JAWABAN
        [Sebutkan opsi yang benar secara langsung]

        ### 2. ANALISIS SOAL
        [Jelaskan konsep apa yang sedang diuji]

        ### 3. PENJELASAN KOMPREHENSIF
        [Jelaskan step-by-step mengapa jawaban tersebut benar, dan mengapa opsi lain salah secara logis dan mendalam].
        
        ---
        Gunakan bahasa Indonesia yang baku namun mudah dipahami.
      `;

      const generatorInstruction = `
        Anda adalah seorang pembuat soal UTBK dan Seleksi Mandiri PTN yang sangat berpengalaman.
        Tugas Anda adalah membuat ${numQuestions} butir soal UTBK yang berkualitas tinggi.
        
        PENTING:
        - Gunakan notasi LaTeX ($ atau $$) untuk semua rumus matematika dan simbol teknis.
        - Soal harus memiliki tingkat kesulitan yang setara dengan UTBK asli (HOTS).
        - Jika user memberikan referensi (teks, gambar, atau dokumen), buatlah soal yang TERINSPIRASI atau BERDASARKAN topik dari referensi tersebut.
        - Jika tidak ada referensi, buatlah soal secara otomatis dengan topik yang bervariasi (TPS, Literasi, atau Penalaran Matematika).

        ATURAN FORMATTING KHUSUS:
        - Opsi jawaban (A, B, C, D, E) HARUS dibuat LIST KE BAWAH.
        - Setiap kalimat atau poin pembahasan dalam penjelasan HARUS dibuat per baris (gunakan double newline atau bullet points).

        FORMAT OUTPUT HARUS SANGAT RAPI DENGAN JARAK BARIS (DOUBLE NEWLINE):
        
        ### SOAL [Nomor]
        [Teks Pertanyaan Lengkap]

        A. [Opsi A]
        B. [Opsi B]
        C. [Opsi C]
        D. [Opsi D]
        E. [Opsi E]

        ---
        **KUNCI JAWABAN:** [Opsi yang benar]
        
        **PEMBAHASAN:**
        [Penjelasan langkah demi langkah yang mendalam namun mudah dipahami]
        
        ---
        (Berikan jarak baris yang cukup antar soal)
        
        Gunakan bahasa Indonesia yang baku.
      `;

      const systemInstruction = activeTab === 'solver' ? solverInstruction : generatorInstruction;

      if (textQuestion.trim()) {
        promptParts.push({ text: `Berikut adalah teks input/referensi dari user:\n${textQuestion}` });
      }

      if (file) {
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const docxText = await extractTextFromDocx(file);
          promptParts.push({ text: `Berikut adalah teks yang diekstrak dari file Word (.docx):\n${docxText}` });
        } else if (file.type === 'application/pdf') {
          const base64Data = await fileToBase64(file);
          promptParts.push({
            inlineData: {
              data: base64Data,
              mimeType: 'application/pdf'
            }
          });
          promptParts.push({ text: "Tolong baca konten dari dokumen PDF ini sebagai referensi." });
        } else if (file.type.startsWith('image/')) {
          const base64Data = await fileToBase64(file);
          promptParts.push({
            inlineData: {
              data: base64Data,
              mimeType: file.type
            }
          });
          promptParts.push({ text: "Tolong baca konten dari gambar ini sebagai referensi." });
        }
      }

      if (activeTab === 'generator') {
        promptParts.push({ text: `Buatlah ${numQuestions} soal UTBK sekarang.` });
      } else {
        promptParts.push({ text: "Selesaikan soal yang diberikan di atas." });
      }

      const modelName = selectedModel === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
      
      const response = await currentAi.models.generateContent({
        model: modelName,
        contents: { parts: promptParts },
        config: {
          systemInstruction: systemInstruction,
        }
      });

      setResult(response.text || 'Tidak ada konten yang dihasilkan.');
    } catch (err: any) {
      console.error("Error processing request:", err);
      let message = err.message || "Terjadi kesalahan saat memproses permintaan.";
      
      if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
        message = "Kuota API telah habis atau limit tercapai. Silakan pilih API Key lain dengan billing yang aktif atau tunggu beberapa saat.";
      } else if (message.includes("Requested entity was not found")) {
        setHasKey(false);
        message = "API Key tidak valid atau tidak ditemukan. Silakan pilih kembali.";
      }
      
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
            <Brain className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-4">
            UTBK Genius Hub
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Platform AI all-in-one untuk memecahkan soal dan membuat latihan UTBK secara instan.
          </p>
          
          {!hasKey && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl max-w-md mx-auto"
            >
              <p className="text-sm text-amber-800 mb-3">
                Anda perlu memilih API Key (Paid Project) untuk menggunakan model Gemini Pro.
              </p>
              <button
                onClick={handleSelectKey}
                className="px-6 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 transition-colors shadow-sm"
              >
                Pilih API Key
              </button>
              <p className="text-[10px] text-amber-600 mt-2">
                Info billing: <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">ai.google.dev/gemini-api/docs/billing</a>
              </p>
            </motion.div>
          )}
        </header>

        <div className="flex p-1 bg-slate-200 rounded-2xl mb-4 max-w-md mx-auto">
          <button
            onClick={() => { setActiveTab('solver'); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'solver' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Solver
          </button>
          <button
            onClick={() => { setActiveTab('generator'); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'generator' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Generator
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 mb-8">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pilih Model API:</span>
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setSelectedModel('pro')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                selectedModel === 'pro' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Gemini Pro (Genius)
            </button>
            <button
              onClick={() => setSelectedModel('flash')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                selectedModel === 'flash' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Gemini Flash (Cepat)
            </button>
          </div>
        </div>

        <main className="space-y-8">
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="p-6 sm:p-8">
              
              <div className="space-y-6">
                {activeTab === 'generator' && (
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Settings2 className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm font-medium text-slate-700">Jumlah Soal:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[3, 5, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setNumQuestions(num)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            numQuestions === num 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="textQuestion" className="block text-sm font-medium text-slate-700 mb-2">
                    {activeTab === 'solver' 
                      ? 'Ketik atau Paste Teks Soal / Gambar (Ctrl+V)' 
                      : 'Topik Spesifik atau Referensi Teks (Opsional)'}
                  </label>
                  <textarea
                    id="textQuestion"
                    rows={5}
                    className="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 p-4 text-slate-900 transition-colors border outline-none resize-y"
                    placeholder={activeTab === 'solver' 
                      ? "Masukkan teks soal di sini, atau langsung paste gambar dari clipboard..." 
                      : "Contoh: Buat soal tentang Logika Matematika, atau paste materi di sini..."}
                    value={textQuestion}
                    onChange={(e) => setTextQuestion(e.target.value)}
                    onPaste={handlePaste}
                  />
                </div>

                <AnimatePresence>
                  {file && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="relative rounded-xl border border-slate-200 bg-slate-50 p-4 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={removeFile}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded-full text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                        title="Hapus file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      
                      <div className="flex items-center gap-4">
                        {previewUrl ? (
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 border border-slate-200">
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                            <FileText className="w-8 h-8 text-indigo-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Unknown type'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {activeTab === 'solver' 
                      ? 'Atau Unggah File (PDF / JPG / PNG / Word)' 
                      : 'Unggah Referensi Materi (Opsional: PDF / JPG / Word)'}
                  </label>
                  <div 
                    className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer" 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        setFile(e.dataTransfer.files[0]);
                      }
                    }}
                  >
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-slate-400" />
                      <div className="flex text-sm text-slate-600 justify-center">
                        <span className="relative cursor-pointer bg-transparent rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                          <span>Upload a file</span>
                          <input
                            id="fileInput"
                            name="fileInput"
                            type="file"
                            className="sr-only"
                            accept=".pdf, .docx, image/png, image/jpeg, image/jpg"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                          />
                        </span>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-slate-500">
                        PNG, JPG, PDF, DOCX up to 10MB
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || (activeTab === 'solver' && !textQuestion.trim() && !file)}
                  className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      AI sedang memproses...
                    </>
                  ) : (
                    <>
                      {activeTab === 'solver' ? (
                        <>
                          <Sparkles className="-ml-1 mr-2 h-5 w-5" />
                          Pecahkan Soal Ini
                        </>
                      ) : (
                        <>
                          <PlusCircle className="-ml-1 mr-2 h-5 w-5" />
                          Buat Soal Latihan
                        </>
                      )}
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Brain className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {activeTab === 'solver' ? 'Analisis & Kunci Jawaban' : 'Hasil Latihan Soal'}
                    </h2>
                  </div>
                  <button 
                    onClick={() => window.print()}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    Cetak / Simpan PDF
                  </button>
                </div>
                <div className="p-6 sm:p-8 prose prose-slate prose-indigo max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {result}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        <footer className="mt-16 text-center text-sm text-slate-500">
          <p>Ditenagai oleh Google Gemini 3.1 Pro</p>
        </footer>
      </div>
    </div>
  );
}
