import React, { useEffect, useState, useMemo } from 'react';
import { Grid, List, RefreshCw, AlertCircle, BookOpen } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { progressStore, folderStore, recentStore } from '../../utils/storage';
import { FileCard } from './FileCard';

export default function LibraryView() {
  const { state, actions } = useApp();
  const [progresses, setProgresses] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchFiles();
    loadLocal();
  }, []);

  async function fetchFiles() {
    actions.setFilesLoading(true);
    try {
      const res = await api.getFiles();
      actions.setFiles(res.files ?? []);
      if (res.demo_mode != null) actions.setAuth(state.isAuthenticated, res.demo_mode);
    } catch (e) {
      actions.setFilesError(e.message);
    }
  }

  async function loadLocal() {
    try {
      // Progress map
      const progs = await progressStore.getAll();
      const pm = {};
      for (const p of progs) pm[p.fileId] = p;
      setProgresses(pm);

      // Folders
      const folders = await folderStore.getAll();
      actions.setFolders(folders);

      // File assignments — load ALL at once, no per-folder loop
      const assignments = {};
      for (const folder of folders) {
        const rows = await folderStore.getFilesInFolder(folder.id);
        for (const row of rows) assignments[row.fileId] = row.folderId;
      }
      actions.setAssignments(assignments);

      // Recent
      const recent = await recentStore.getAll(30);
      actions.setRecent(recent);
    } catch (e) {
      console.error('loadLocal error:', e);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await api.refreshFiles();
      actions.setFiles(res.files ?? []);
    } catch {
      await fetchFiles();
    } finally {
      setRefreshing(false);
    }
  }

  // Derive displayed file list from active section
  const displayedFiles = useMemo(() => {
    switch (state.activeSection) {
      case 'search':
        return state.searchResults;

      case 'recent': {
        const recentMap = Object.fromEntries(state.files.map(f => [f.id, f]));
        return state.recentFiles
          .map(r => recentMap[r.fileId])
          .filter(Boolean);
      }

      case 'folder': {
        if (!state.activeFolderId) return state.files;
        const inFolder = new Set(
          Object.entries(state.fileAssignments)
            .filter(([, fid]) => fid === state.activeFolderId)
            .map(([fileId]) => fileId)
        );
        return state.files.filter(f => inFolder.has(f.id));
      }

      default:
        return state.files;
    }
  }, [
    state.files, state.activeSection, state.searchResults,
    state.recentFiles, state.activeFolderId, state.fileAssignments,
  ]);

  const emptyMessage = useMemo(() => {
    if (state.activeSection === 'folder') return { title: 'Folder is empty', body: 'Move PDFs here from your library using the ⋯ menu on any book.' };
    if (state.activeSection === 'recent') return { title: 'Nothing opened yet', body: 'Open any PDF from your library to see it here.' };
    if (state.activeSection === 'search') return { title: 'No results', body: `No PDFs match "${state.searchQuery}".` };
    return { title: 'Library is empty', body: 'Upload PDF files to your Telegram channel — they will appear here automatically.' };
  }, [state.activeSection, state.searchQuery]);

  const isGrid = state.viewMode === 'grid';

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* ── Toolbar strip ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2
                      border-b border-ink-800/40 bg-ink-950/95 backdrop-blur-sm flex-shrink-0">
        <span className="text-ink-600 text-xs font-medium">
          {displayedFiles.length} {displayedFiles.length === 1 ? 'document' : 'documents'}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing || state.filesLoading}
            className="p-1.5 text-ink-500 hover:text-ink-200 rounded-lg hover:bg-ink-800/50 active:scale-90 transition-all disabled:opacity-30"
            title="Refresh"
          >
            <RefreshCw size={14} className={refreshing || state.filesLoading ? 'animate-spin' : ''}/>
          </button>

          {/* Grid / list toggle */}
          <div className="flex bg-ink-900 border border-ink-800/50 rounded-lg p-0.5">
            {[['grid', Grid], ['list', List]].map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => actions.setViewMode(mode)}
                className={`p-1.5 rounded-md transition-all ${
                  state.viewMode === mode ? 'bg-ink-700 text-ink-100' : 'text-ink-500 hover:text-ink-300'
                }`}
              >
                <Icon size={13}/>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 p-3 sm:p-5">
        {/* Loading skeletons */}
        {state.filesLoading && (
          <div className={isGrid
            ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
            : 'space-y-1'
          }>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} list={!isGrid}/>)}
          </div>
        )}

        {/* Error */}
        {!state.filesLoading && state.filesError && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3 px-4">
            <AlertCircle size={36} className="text-red-400"/>
            <p className="text-ink-200 font-medium">Failed to load files</p>
            <p className="text-ink-500 text-sm max-w-xs">{state.filesError}</p>
            <button onClick={fetchFiles} className="btn-primary text-sm mt-2">Try again</button>
          </div>
        )}

        {/* Empty */}
        {!state.filesLoading && !state.filesError && displayedFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3 px-6">
            <BookOpen size={40} className="text-ink-800"/>
            <p className="text-ink-300 font-medium">{emptyMessage.title}</p>
            <p className="text-ink-600 text-sm max-w-xs leading-relaxed">{emptyMessage.body}</p>
          </div>
        )}

        {/* Files */}
        {!state.filesLoading && !state.filesError && displayedFiles.length > 0 && (
          isGrid ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 animate-fade-in">
              {displayedFiles.map(f => (
                <FileCard key={f.id} file={f} progress={progresses[f.id]}/>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5 animate-fade-in">
              {displayedFiles.map(f => (
                <FileCard key={f.id} file={f} progress={progresses[f.id]}/>
              ))}
            </div>
          )
        )}
      </div>

      {/* Space for mobile bottom nav */}
      <div className="h-16 md:h-0 flex-shrink-0"/>
    </div>
  );
}

function Skeleton({ list }) {
  if (list) return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl">
      <div className="w-9 h-11 rounded-lg shimmer flex-shrink-0"/>
      <div className="flex-1 space-y-2">
        <div className="h-3 w-4/5 shimmer rounded"/>
        <div className="h-2 w-1/2 shimmer rounded"/>
      </div>
    </div>
  );
  return (
    <div className="rounded-2xl overflow-hidden border border-ink-800/30">
      <div className="shimmer" style={{ height: 128 }}/>
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 w-4/5 shimmer rounded"/>
        <div className="h-2 w-1/2 shimmer rounded"/>
      </div>
    </div>
  );
}
