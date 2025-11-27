import React, { useRef, useState, useEffect } from "react";

const BACKEND_URL = import.meta.env.VITE_PREDICT_URL || "http://localhost:8000/predict";

export default function FloorplanDetector() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [jsonResult, setJsonResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  
  const fileInputRef = useRef(null);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [previewUrl, resultUrl]);

  const handleFiles = (files) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    // Reset previous results when new file is selected
    setResultUrl(null);
    setJsonResult(null);

    if(fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag and Drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (dt && dt.files) handleFiles(dt.files);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  // Helper to convert Base64 from backend to a Blob URL
  const base64ToBlob = (b64Data, contentType = "image/png", sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  };

  const uploadToBackend = async () => {
    if (!file) { setError("No file to upload"); return; }
    setLoading(true);
    setError(null);
    setResultUrl(null);
    setJsonResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const resp = await fetch(BACKEND_URL, { method: "POST", body: form });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Server error: ${resp.status} ${text}`);
      }

      // Check content type to handle JSON response (which contains counts + image)
      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await resp.json();
        setJsonResult(data); 
        
        // Handle the Base64 image provided by the backend
        if (data.image_base64) {
          const b = base64ToBlob(data.image_base64, data.image_mime || "image/png");
          setResultUrl(URL.createObjectURL(b));
        }
      } else {
        // Fallback: If backend sends raw image bytes
        const blob = await resp.blob();
        setResultUrl(URL.createObjectURL(blob));
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setFile(null); 
    setPreviewUrl(null); 
    setResultUrl(null); 
    setJsonResult(null); 
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        
        {/* Header */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Floorplan Detector
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            Upload a floorplan to detect windows and doors automatically.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
          
          {/* --- LEFT COLUMN: Upload & Preview --- */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 flex flex-col h-full min-h-[500px]">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              {previewUrl ? "Original Image" : "Upload Floorplan"}
            </h2>

            {!previewUrl ? (
              // Upload State
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-12 transition-all duration-300 flex-1 flex items-center justify-center ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                }`}
              >
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-indigo-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-lg text-slate-700 dark:text-slate-300 mb-6">
                    Drag & drop or click to browse
                  </p>
                  <label className="cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg hover:scale-105 transition-transform">
                      Select Image
                    </button>
                  </label>
                </div>
              </div>
            ) : (
              // Preview State
              <div className="flex-1 flex flex-col">
                <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex-1 flex items-center justify-center p-2">
                  {/* CSS FIX: max-h-[500px] and object-contain ensures it doesn't cover screen */}
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="max-h-[500px] w-auto max-w-full object-contain shadow-sm rounded"
                  />
                  
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="bg-white dark:bg-slate-800 px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
                        <svg className="animate-spin h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        <span className="font-medium text-slate-800 dark:text-slate-200">Analyzing...</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 mt-4">
                  <button
                    onClick={uploadToBackend}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-colors"
                  >
                    {loading ? "Processing..." : "Detect Windows & Doors"}
                  </button>
                  <button
                    onClick={clearAll}
                    disabled={loading}
                    className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* --- RIGHT COLUMN: Results --- */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 flex flex-col h-full min-h-[500px]">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Detection Results
            </h2>

            {/* Counts Display Section */}
            {jsonResult && jsonResult.counts && (
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                 {Object.entries(jsonResult.counts).map(([label, count]) => (
                   <div key={label} className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 p-4 rounded-xl text-center shadow-sm">
                     <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                       {count}
                     </div>
                     <div className="text-sm font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                       {label}
                     </div>
                   </div>
                 ))}
               </div>
            )}

            {/* Output Image Area */}
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50">
              {resultUrl ? (
                <>
                  {/* CSS FIX: max-h constraint */}
                  <img
                    src={resultUrl}
                    alt="result"
                    className="max-h-[500px] w-auto max-w-full object-contain rounded shadow-lg mb-6"
                  />
                  
                  {/* Download Button */}
                  <a
                    href={resultUrl}
                    download={`annotated_${file?.name || "floorplan.png"}`}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Annotated Image
                  </a>
                </>
              ) : (
                // Empty State
                <div className="text-center text-slate-400 dark:text-slate-500 opacity-60">
                  <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No results yet. Run the model to see detections.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
        )}

      </div>
    </div>
  );
}