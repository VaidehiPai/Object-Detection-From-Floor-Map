import React, { useRef, useState, useEffect } from "react";

const BACKEND_URL = import.meta.env.VITE_PREDICT_URL || "/predict";

export default function FloorplanDetector() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [jsonResult, setJsonResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [previewUrl, resultUrl]);

  useEffect(() => {
    if (jsonResult && imageRef.current) drawOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonResult, previewUrl]);

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
    setResultUrl(null);
    setJsonResult(null);
  };

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

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.startsWith("image/")) {
        const blob = await resp.blob();
        setResultUrl(URL.createObjectURL(blob));
      } else {
        const data = await resp.json();
        setJsonResult(data);
        if (data.image_base64) {
          const b = base64ToBlob(data.image_base64, data.image_mime || "image/png");
          setResultUrl(URL.createObjectURL(b));
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

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

  const clearAll = () => {
    setFile(null); setPreviewUrl(null); setResultUrl(null); setJsonResult(null); setError(null);
  };

  const drawOverlays = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !jsonResult) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const origW = jsonResult.width || img.naturalWidth;
    const origH = jsonResult.height || img.naturalHeight;

    const map = ([x, y]) => {
      return [x * (img.clientWidth / origW), y * (img.clientHeight / origH)];
    };

    const labelColor = (label) => {
      const colors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
      let h = 0;
      for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
      return colors[h % colors.length];
    };

    if (Array.isArray(jsonResult.polygons)) {
      jsonResult.polygons.forEach((poly) => {
        const label = poly.label || "obj";
        const pts = poly.points || [];
        if (pts.length < 2) return;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [mx, my] = map(p);
          if (i === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        });
        ctx.closePath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = labelColor(label);
        ctx.stroke();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = labelColor(label);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        const center = pts[Math.floor(pts.length / 2)];
        const [cx, cy] = map(center);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.font = "14px sans-serif";
        ctx.fillText(label, cx + 6, cy - 6);
      });
    }

    if (Array.isArray(jsonResult.boxes)) {
      jsonResult.boxes.forEach((b) => {
        const label = b.label || "obj";
        const xmin = b.xmin, ymin = b.ymin, xmax = b.xmax, ymax = b.ymax;
        const [x1, y1] = map([xmin, ymin]);
        const [x2, y2] = map([xmax, ymax]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = labelColor(label);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = labelColor(label);
        ctx.fillRect(x1, y1 - 20, ctx.measureText(label).width + 8, 20);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x1 + 4, y1 - 6);
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Floorplan Detector
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            Upload a floorplan image to detect doors and windows using AI
          </p>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Upload/Preview Section */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 flex flex-col h-full min-h-[600px]">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              {previewUrl ? "Preview" : "Upload Image"}
            </h2>

            {!previewUrl ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-12 transition-all duration-300 flex-1 flex items-center justify-center ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500"
                }`}
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-6">
                    <svg
                      className="w-20 h-20 text-indigo-500 dark:text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Drag & drop your image here
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    or click the button below to browse
                  </p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105">
                      Choose Image
                    </button>
                  </label>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                    Supported formats: PNG, JPG, JPEG
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex-1 min-h-[400px]">
                  <img
                    ref={imageRef}
                    src={previewUrl}
                    alt="preview"
                    className="w-full h-auto block"
                    onLoad={() => {
                      if (jsonResult) drawOverlays();
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute left-0 top-0 pointer-events-none"
                    style={{ width: "100%", height: "100%" }}
                  />
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                      <div className="bg-white dark:bg-slate-800 rounded-lg px-6 py-4 shadow-xl flex items-center gap-3">
                        <svg
                          className="animate-spin h-5 w-5 text-indigo-600"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          ></path>
                        </svg>
                        <span className="text-slate-700 dark:text-slate-200 font-medium">
                          Processing...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={uploadToBackend}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    {loading ? "Processing..." : "Run Model"}
                  </button>
                  <button
                    onClick={clearAll}
                    className="px-6 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-lg transition-all duration-200"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 flex flex-col h-full min-h-[600px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Output
              </h2>
              {jsonResult && (
                <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-semibold px-3 py-1 rounded-full">
                  {(jsonResult.polygons || []).length + (jsonResult.boxes || []).length} detections
                </span>
              )}
            </div>

            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50">
              {loading ? (
                <div className="text-center">
                  <svg
                    className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-3"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    ></path>
                  </svg>
                  <p className="text-slate-600 dark:text-slate-400 font-medium">
                    Processing on server...
                  </p>
                </div>
              ) : resultUrl ? (
                <img
                  src={resultUrl}
                  alt="result"
                  className="max-h-full max-w-full rounded-lg shadow-md"
                />
              ) : jsonResult ? (
                <div className="w-full">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Overlay drawn on preview. Detected objects:{" "}
                    <strong className="text-slate-900 dark:text-white">
                      {(jsonResult.polygons || []).length + (jsonResult.boxes || []).length}
                    </strong>
                  </p>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 overflow-auto max-h-64">
                    <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(jsonResult, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-400 dark:text-slate-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 opacity-50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-sm">
                    No result yet. Click <strong className="text-slate-600 dark:text-slate-300">Run Model</strong> to process.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            <span className="font-semibold">Endpoint:</span> {BACKEND_URL} •{" "}
            <span className="font-semibold">Tip:</span> Include width/height in JSON for accurate overlay scaling
          </p>
        </div>
      </div>
    </div>
  );
}
