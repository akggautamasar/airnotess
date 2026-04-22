import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Bookmark, BookmarkCheck, Highlighter, MessageSquare, Sun, Moon, Coffee, Layers,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { highlightStore, bookmarkStore, progressStore } from '../../utils/storage';
import { cleanFileName } from '../../utils/format';
import ThumbnailSidebar from './ThumbnailSidebar';
import AnnotationSidebar from './AnnotationSidebar';

// Wire bundled worker — never fetch from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfjsWorker;

const MODE = {
  dark:  { bg: '#0f0c09', pageArea: '#161210', text: '#e8ddd0', filter: 'brightness(0.87) contrast(1.05)' },
  sepia: { bg: '#f0ebe0', pageArea: '#e8e0d0', text: '#4a3820', filter: 'sepia(0.5) brightness(0.97)' },
  light: { bg: '#f0f0f0', pageArea: '#d8d8d8', text: '#111111', filter: 'none' },
};

// Is it a small screen?
function isMobile() { return window.innerWidth < 768; }

export default function PDFReader() {
  const { state, actions } = useApp();
  const file = state.openFile;
  const mode = MODE[state.readerMode] ?? MODE.dark;

  // ── Core PDF state ──────────────────────────────────────────────────────────
  const [pdfDoc,       setPdfDoc]       = useState(null);
  const [numPages,     setNumPages]     = useState(0);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [scale,        setScale]        = useState(1.0); // computed after load

  // ── UI panels ───────────────────────────────────────────────────────────────
  const [showThumbs,       setShowThumbs]       = useState(!isMobile()); // off by default on mobile
  const [showAnnotations,  setShowAnnotations]  = useState(false);
  const [highlightMode,    setHighlightMode]    = useState(false);
  const [hlColor,          setHlColor]          = useState('yellow');
  const [isBookmarked,     setIsBookmarked]     = useState(false);
  const [isFullscreen,     setIsFullscreen]     = useState(false);

  // ── Annotations ─────────────────────────────────────────────────────────────
  const [highlights, setHighlights] = useState([]);
  const [bookmarks,  setBookmarks]  = useState([]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef     = useRef(null);
  const wrapRef       = useRef(null);   // outer scrollable area — used for width measurement
  const containerRef  = useRef(null);
  const renderTask    = useRef(null);
  const pdfDocRef     = useRef(null);   // keep ref in sync for keyboard handler
  const numPagesRef   = useRef(0);
  const currentRef    = useRef(1);

  pdfDocRef.current  = pdfDoc;
  numPagesRef.current = numPages;
  currentRef.current  = currentPage;

  // ── Load PDF ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;

    // Reset everything
    setCurrentPage(1);
    setPdfDoc(null);
    setNumPages(0);
    setError('');
    setLoading(true);
    setHighlights([]);
    setBookmarks([]);

    let cancelled = false;

    async function load() {
      try {
        const url  = api.getStreamUrl(file.id);
        const task = pdfjsLib.getDocument({
          url,
          rangeChunkSize:    65536,
          disableAutoFetch:  false,
          disableStream:     false,
          cMapUrl:           'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/',
          cMapPacked:        true,
        });

        const doc = await task.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        if (cancelled) return;
        console.error('PDF load error:', e);
        // Give a clean message for the 413 large-file case
        if (e.status === 413 || String(e.message).includes('FILE_TOO_LARGE') || String(e.message).includes('Unexpected server response (413)')) {
          setError('This file is larger than 20 MB. Telegram Bot API cannot serve files over 20 MB.\n\nTo fix this: set up a Telegram Local Bot API Server on your backend (free & open source).');
        } else {
          setError(e.message || 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    loadAnnotations();
    restoreProgress();

    return () => { cancelled = true; };
  }, [file?.id]);

  // ── Restore progress (set page AFTER numPages is known) ─────────────────────
  async function restoreProgress() {
    const prog = await progressStore.get(file.id).catch(() => null);
    if (prog?.currentPage > 1) setCurrentPage(prog.currentPage);
  }

  async function loadAnnotations() {
    const [hl, bm] = await Promise.all([
      highlightStore.getByFile(file.id).catch(() => []),
      bookmarkStore.getByFile(file.id).catch(() => []),
    ]);
    setHighlights(hl);
    setBookmarks(bm);
  }

  // ── Auto-fit scale when doc loads ────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !wrapRef.current) return;
    computeFitScale(pdfDoc, 1);
  }, [pdfDoc]);

  async function computeFitScale(doc, pageNum) {
    try {
      const page     = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const available = wrapRef.current?.clientWidth ?? window.innerWidth;
      const padding   = isMobile() ? 16 : 64;
      const fitted    = (available - padding) / viewport.width;
      setScale(Math.min(Math.max(fitted, 0.5), 2.5));
    } catch {}
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pdfDoc && scale > 0) renderPage(currentPage);
  }, [pdfDoc, currentPage, scale, state.readerMode]);

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    if (renderTask.current) {
      try { renderTask.current.cancel(); } catch {}
      renderTask.current = null;
    }

    try {
      const page     = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas   = canvasRef.current;
      if (!canvas) return;

      // Set device pixel ratio for sharp rendering on retina screens
      const dpr  = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = viewport.width  * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width  = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const task = page.render({ canvasContext: ctx, viewport });
      renderTask.current = task;
      await task.promise;
      renderTask.current = null;

      // Update bookmark state and save progress
      const [bm] = await Promise.all([
        bookmarkStore.isBookmarked(file.id, pageNum).catch(() => false),
        progressStore.save(file.id, pageNum, pdfDocRef.current.numPages).catch(() => {}),
      ]);
      setIsBookmarked(bm);
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.error('render:', e);
    }
  }, [pdfDoc, scale, file, state.readerMode]);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    const handler = (e) => {
      // Don't steal keys from inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage(p => Math.min(p + 1, numPagesRef.current));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage(p => Math.max(p - 1, 1));
      } else if (e.key === 'Escape') {
        actions.closeFile();
      } else if (e.key === '+' || (e.key === '=' && e.shiftKey)) {
        setScale(s => +(Math.min(s + 0.15, 3.0)).toFixed(2));
      } else if (e.key === '-') {
        setScale(s => +(Math.max(s - 0.15, 0.4)).toFixed(2));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [file?.id]);

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Bookmarks ────────────────────────────────────────────────────────────────
  async function toggleBookmark() {
    if (isBookmarked) {
      await bookmarkStore.remove(file.id, currentPage);
      setIsBookmarked(false);
      setBookmarks(prev => prev.filter(b => b.page !== currentPage));
    } else {
      await bookmarkStore.add(file.id, currentPage, `Page ${currentPage}`);
      setIsBookmarked(true);
      setBookmarks(await bookmarkStore.getByFile(file.id));
    }
  }

  // ── Highlights (mouse/pointer up) ────────────────────────────────────────────
  async function handlePointerUp() {
    if (!highlightMode) return;
    const text = window.getSelection()?.toString().trim();
    if (!text || text.length < 2) return;
    try {
      const id  = await highlightStore.add(file.id, currentPage, text, hlColor);
      const hl  = { id, fileId: file.id, page: currentPage, text, color: hlColor, createdAt: Date.now() };
      setHighlights(prev => [...prev, hl]);
    } catch {}
    window.getSelection()?.removeAllRanges();
  }

  async function deleteHighlight(id) {
    await highlightStore.delete(id).catch(() => {});
    setHighlights(prev => prev.filter(h => h.id !== id));
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const progress      = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const pageHighlights = highlights.filter(h => h.page === currentPage);

  if (!file) return null;

  const borderCol = state.readerMode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: mode.bg, color: mode.text }}
    >
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-b"
        style={{ borderColor: borderCol }}
      >
        {/* Close */}
        <button
          onClick={() => actions.closeFile()}
          className="flex-shrink-0 p-2 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/10 active:scale-95 transition-all"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0 px-1">
          <p className="text-sm font-medium truncate leading-tight" style={{ opacity: 0.8 }}>
            {cleanFileName(file.name)}
          </p>
          <p className="text-[10px] leading-none mt-0.5" style={{ opacity: 0.4 }}>
            {numPages ? `${currentPage} of ${numPages}` : 'Loading…'}
          </p>
        </div>

        {/* Reading mode — hidden on very small screens, accessible via ... */}
        <div className="hidden xs:flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.12)' }}>
          {(['dark','sepia','light']).map((m, i) => {
            const icons = [Moon, Coffee, Sun];
            const Icon  = icons[i];
            return (
              <button
                key={m}
                onClick={() => actions.setReaderMode(m)}
                className={`p-1.5 rounded-md transition-all ${state.readerMode === m ? 'opacity-100' : 'opacity-35 hover:opacity-60'}`}
                style={state.readerMode === m ? { background: 'rgba(255,255,255,0.18)' } : {}}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 rounded-lg px-1.5 py-1" style={{ background: 'rgba(0,0,0,0.12)' }}>
          <button onClick={() => setScale(s => +(Math.max(s - 0.15, 0.4)).toFixed(2))}
            className="p-1 opacity-60 hover:opacity-100"><ZoomOut size={13} /></button>
          <button onClick={() => computeFitScale(pdfDoc, currentPage)}
            className="text-[11px] font-mono opacity-70 hover:opacity-100 w-9 text-center">
            {Math.round(scale * 100)}%
          </button>
          <button onClick={() => setScale(s => +(Math.min(s + 0.15, 3.0)).toFixed(2))}
            className="p-1 opacity-60 hover:opacity-100"><ZoomIn size={13} /></button>
        </div>

        {/* Bookmark */}
        <button
          onClick={toggleBookmark}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${isBookmarked ? '' : 'opacity-50 hover:opacity-100'}`}
          style={isBookmarked ? { color: '#fbbf24' } : {}}
        >
          {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        </button>

        {/* Highlight toggle */}
        <button
          onClick={() => setHighlightMode(v => !v)}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${highlightMode ? '' : 'opacity-50 hover:opacity-100'}`}
          style={highlightMode ? { background: 'rgba(251,191,36,0.2)', color: '#fbbf24' } : {}}
        >
          <Highlighter size={16} />
        </button>

        {/* Annotations panel */}
        <button
          onClick={() => { setShowAnnotations(v => !v); setShowThumbs(false); }}
          className={`hidden sm:flex flex-shrink-0 p-1.5 rounded-lg transition-all ${showAnnotations ? '' : 'opacity-50 hover:opacity-100'}`}
          style={showAnnotations ? { background: 'rgba(0,0,0,0.2)' } : {}}
        >
          <MessageSquare size={16} />
        </button>

        {/* Thumbnail panel */}
        <button
          onClick={() => { setShowThumbs(v => !v); setShowAnnotations(false); }}
          className={`hidden sm:flex flex-shrink-0 p-1.5 rounded-lg transition-all ${showThumbs ? '' : 'opacity-50 hover:opacity-100'}`}
          style={showThumbs ? { background: 'rgba(0,0,0,0.2)' } : {}}
        >
          <Layers size={16} />
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="hidden md:flex flex-shrink-0 p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] flex-shrink-0" style={{ background: 'rgba(0,0,0,0.15)' }}>
        <div className="progress-bar h-full" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Thumbnail sidebar — hidden on mobile */}
        {showThumbs && pdfDoc && !isMobile() && (
          <ThumbnailSidebar
            pdfDoc={pdfDoc}
            numPages={numPages}
            currentPage={currentPage}
            onGoTo={setCurrentPage}
            bookmarks={bookmarks}
            readerMode={state.readerMode}
          />
        )}

        {/* Main PDF view */}
        <div
          ref={wrapRef}
          className="flex-1 overflow-auto flex flex-col items-center"
          style={{ background: mode.pageArea, paddingTop: '24px', paddingBottom: '16px' }}
          onPointerUp={handlePointerUp}
        >
          {/* Loading */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
              <p className="text-sm opacity-40">Loading…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center max-w-md mx-auto">
              <div className="text-4xl">📄</div>
              <p className="font-medium" style={{ color: '#f87171' }}>Cannot open PDF</p>
              <p className="text-sm opacity-50 whitespace-pre-line leading-relaxed">{error}</p>
              <button
                onClick={() => { setError(''); setLoading(true); }}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Canvas */}
          {!loading && !error && (
            <>
              <div className="pdf-wrap mx-auto">
                <canvas
                  ref={canvasRef}
                  style={{
                    display: 'block',
                    filter: mode.filter !== 'none' ? mode.filter : undefined,
                  }}
                />
                {/* Highlight color picker overlay */}
                {highlightMode && (
                  <div className="absolute top-3 right-3 z-10 flex gap-1.5 rounded-xl p-1.5"
                    style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
                    {[
                      ['yellow', '#fbbf24'],
                      ['green',  '#4ade80'],
                      ['blue',   '#60a5fa'],
                      ['pink',   '#fb7185'],
                    ].map(([c, hex]) => (
                      <button
                        key={c}
                        onClick={() => setHlColor(c)}
                        className="w-5 h-5 rounded-full transition-transform"
                        style={{
                          background: hex,
                          transform: hlColor === c ? 'scale(1.3)' : 'scale(1)',
                          boxShadow: hlColor === c ? `0 0 0 2px rgba(255,255,255,0.6)` : 'none',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Page highlights */}
              {pageHighlights.length > 0 && (
                <div className="mt-4 w-full px-4 space-y-1.5" style={{ maxWidth: canvasRef.current?.style.width || '600px' }}>
                  {pageHighlights.map(h => (
                    <div
                      key={h.id}
                      className={`hl-${h.color} text-xs px-3 py-2 rounded-lg flex gap-2 items-start`}
                      style={{ color: mode.text }}
                    >
                      <span className="flex-1 italic line-clamp-3">"{h.text}"</span>
                      <button onClick={() => deleteHighlight(h.id)} className="opacity-40 hover:opacity-90 leading-none text-base flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Annotation sidebar — hidden on mobile */}
        {showAnnotations && !isMobile() && (
          <AnnotationSidebar
            highlights={highlights}
            bookmarks={bookmarks}
            currentPage={currentPage}
            onGoTo={setCurrentPage}
            onDeleteHighlight={deleteHighlight}
            readerMode={state.readerMode}
          />
        )}
      </div>

      {/* ── Bottom nav ───────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 border-t relative pb-safe"
        style={{ borderColor: borderCol }}
      >
        <button
          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
          disabled={currentPage <= 1}
          className="p-2.5 rounded-xl disabled:opacity-20 hover:bg-black/10 active:scale-90 transition-all"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={currentPage}
            min={1}
            max={numPages || 1}
            onChange={e => {
              const n = parseInt(e.target.value);
              if (n >= 1 && n <= numPages) setCurrentPage(n);
            }}
            className="w-12 text-center rounded-lg px-1 py-1.5 text-sm font-mono focus:outline-none"
            style={{
              background: 'rgba(0,0,0,0.12)',
              color: mode.text,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          <span className="text-sm" style={{ opacity: 0.4 }}>/ {numPages || '?'}</span>
        </div>

        <button
          onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))}
          disabled={currentPage >= numPages}
          className="p-2.5 rounded-xl disabled:opacity-20 hover:bg-black/10 active:scale-90 transition-all"
        >
          <ChevronRight size={20} />
        </button>

        {/* Progress % — right side */}
        <span className="absolute right-4 text-xs" style={{ opacity: 0.3 }}>{progress}%</span>
      </div>
    </div>
  );
}
