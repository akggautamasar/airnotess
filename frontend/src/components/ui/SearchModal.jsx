import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileText, Clock } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { cleanFileName, formatSize, formatRelativeDate } from '../../utils/format';
import { recentStore } from '../../utils/storage';

export default function SearchModal({ onClose }) {
  const { state, actions } = useApp();
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [cursor,   setCursor]   = useState(-1);      // keyboard-selected index
  const inputRef   = useRef(null);
  const listRef    = useRef(null);
  const debounce   = useRef(null);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape; navigate with ↑↓; open on Enter
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(c => Math.min(c + 1, displayList.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(c => Math.max(c - 1, 0));
      }
      if (e.key === 'Enter' && cursor >= 0 && displayList[cursor]) {
        e.preventDefault();
        openFile(displayList[cursor]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Debounced search
  useEffect(() => {
    setCursor(-1);
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await api.search(query);
        setResults(res.files ?? []);
      } catch {
        // Client-side fallback
        const q = query.toLowerCase();
        setResults(state.files.filter(f =>
          f.name.toLowerCase().includes(q) ||
          (f.caption && f.caption.toLowerCase().includes(q))
        ));
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(debounce.current);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return;
    const el = listRef.current.children[cursor];
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  async function openFile(file) {
    actions.openFile(file);
    await recentStore.touch(file.id, file.name).catch(() => {});
    actions.addRecent({ fileId: file.id, fileName: file.name, openedAt: Date.now() });
    onClose();
  }

  // What to show: search results or recent files
  const displayList = query.trim()
    ? results
    : state.recentFiles
        .map(r => state.files.find(f => f.id === r.fileId))
        .filter(Boolean)
        .slice(0, 8);

  const showRecent = !query.trim() && displayList.length > 0;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4"
      style={{ paddingTop: '12vh', background: 'rgba(14,11,8,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-lg glass rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-800/50">
          {busy
            ? <div className="w-4 h-4 border-2 border-ink-600 border-t-ink-300 rounded-full animate-spin flex-shrink-0"/>
            : <Search size={16} className="text-ink-500 flex-shrink-0"/>
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your library…"
            className="flex-1 bg-transparent text-ink-100 placeholder-ink-600 text-sm focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-ink-600 hover:text-ink-300 transition-colors">
              <X size={14}/>
            </button>
          )}
          <kbd className="text-[10px] bg-ink-800 text-ink-600 px-2 py-1 rounded-lg border border-ink-700/50 flex-shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto" ref={listRef}>
          {/* Section label */}
          {(displayList.length > 0 || query) && (
            <div className="px-4 pt-3 pb-1.5">
              <p className="text-[10px] uppercase tracking-widest text-ink-700 font-semibold flex items-center gap-1.5">
                {showRecent ? <><Clock size={10}/> Recent</> : `${results.length} result${results.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          )}

          {/* Empty state */}
          {query && !busy && results.length === 0 && (
            <div className="py-10 text-center text-ink-600 text-sm">
              No PDFs found for "<span className="text-ink-400">{query}</span>"
            </div>
          )}

          {/* File rows */}
          {displayList.map((file, i) => (
            <button
              key={file.id}
              onClick={() => openFile(file)}
              onMouseEnter={() => setCursor(i)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left
                ${cursor === i ? 'bg-ink-800/70' : 'hover:bg-ink-800/40'}`}
            >
              <div className="w-8 h-9 rounded-lg bg-ink-800 border border-ink-700/40 flex items-center justify-center flex-shrink-0">
                <FileText size={14} className="text-ink-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink-100 text-sm truncate">{cleanFileName(file.name)}</p>
                <p className="text-ink-600 text-xs mt-0.5">
                  {formatSize(file.size)} · {formatRelativeDate(file.date)}
                  {file.large && <span className="ml-2 text-amber-500/70">⚠ &gt;20 MB</span>}
                </p>
              </div>
              <span className="text-ink-700 text-xs flex-shrink-0">↵</span>
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2.5 border-t border-ink-800/40 flex items-center gap-4 text-[11px] text-ink-700">
          <span><kbd className="bg-ink-800 px-1.5 py-0.5 rounded border border-ink-700/50">↑↓</kbd> navigate</span>
          <span><kbd className="bg-ink-800 px-1.5 py-0.5 rounded border border-ink-700/50">↵</kbd> open</span>
          <span><kbd className="bg-ink-800 px-1.5 py-0.5 rounded border border-ink-700/50">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
