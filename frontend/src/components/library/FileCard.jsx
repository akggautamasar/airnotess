import React, { useState } from 'react';
import { BookOpen, MoreVertical, FolderInput, AlertTriangle } from 'lucide-react';
import { formatSize, formatRelativeDate, cleanFileName, getInitials, stringToColor } from '../../utils/format';
import { useApp } from '../../store/AppContext';
import { folderStore, recentStore } from '../../utils/storage';

const MB20 = 20 * 1024 * 1024;

export function FileCard({ file, progress }) {
  const { state, actions } = useApp();
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [folderPick, setFolderPick] = useState(false);

  const title    = cleanFileName(file.name);
  const initials = getInitials(file.name);
  const color    = stringToColor(file.id);
  const folder   = state.folders.find(f => f.id === state.fileAssignments[file.id]);
  const pct      = progress?.percent ?? 0;
  const isLarge  = (file.size ?? 0) > MB20;

  async function open(e) {
    e?.stopPropagation();
    actions.openFile(file);
    await recentStore.touch(file.id, file.name).catch(() => {});
    actions.addRecent({ fileId: file.id, fileName: file.name, openedAt: Date.now() });
  }

  async function assign(folderId) {
    await folderStore.assignFile(file.id, folderId);
    actions.assignFile(file.id, folderId);
    setFolderPick(false);
    setMenuOpen(false);
  }

  async function unassign() {
    await folderStore.unassignFile(file.id);
    actions.unassignFile(file.id);
    setMenuOpen(false);
  }

  /* ── LIST view ────────────────────────────────────────────────────────────── */
  if (state.viewMode === 'list') {
    return (
      <div
        onClick={open}
        className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                   border border-transparent hover:bg-ink-800/50 hover:border-ink-700/40
                   active:bg-ink-800/60 transition-all select-none"
      >
        {/* Mini cover */}
        <div
          className="w-9 h-11 rounded-lg flex-shrink-0 flex items-center justify-center
                     text-xs font-bold text-white/80 shadow-sm"
          style={{ background: `linear-gradient(135deg,${color},${color}99)` }}
        >
          {initials.slice(0, 2)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-ink-100 text-sm font-medium truncate">{title}</p>
            {isLarge && <AlertTriangle size={11} className="text-amber-500/80 flex-shrink-0" title="File > 20 MB"/>}
          </div>
          <p className="text-ink-500 text-xs">
            {formatSize(file.size)} · {formatRelativeDate(file.date)}
            {folder && <> · <span className="text-ink-600">📁 {folder.name}</span></>}
          </p>
        </div>

        {/* Progress bar (desktop only) */}
        {pct > 0 && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="w-16 h-1 bg-ink-800 rounded-full overflow-hidden">
              <div className="progress-bar h-full" style={{ width: `${pct}%` }}/>
            </div>
            <span className="text-ink-500 text-xs w-7 text-right">{pct}%</span>
          </div>
        )}

        <ContextMenu
          file={file} open={menuOpen} setOpen={setMenuOpen}
          folderPick={folderPick} setFolderPick={setFolderPick}
          folders={state.folders} assigned={state.fileAssignments[file.id]}
          onAssign={assign} onUnassign={unassign}
        />
      </div>
    );
  }

  /* ── GRID view ────────────────────────────────────────────────────────────── */
  return (
    <div
      onClick={open}
      className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer select-none
                 border border-ink-800/50 bg-ink-900/40
                 hover:bg-ink-800/60 hover:border-ink-600/50
                 active:scale-[0.97] transition-all duration-150 shadow-sm"
    >
      {/* Cover area */}
      <div
        className="relative flex items-end p-3"
        style={{
          height: 128,
          background: `linear-gradient(150deg,${color}22,${color}77)`,
        }}
      >
        {/* Book spine */}
        <div className="absolute left-0 inset-y-0 w-2.5 opacity-30"
          style={{ background: `linear-gradient(to right,${color}99,transparent)` }}/>

        {/* Cover letter block */}
        <div
          className="relative w-10 h-12 rounded-lg shadow-lg flex items-center justify-center
                     text-xs font-bold text-white/90 border border-white/10 z-10"
          style={{ background: color }}
        >
          {initials.slice(0, 2)}
        </div>

        {/* Progress ring */}
        {pct > 0 && (
          <svg width="28" height="28" className="absolute top-2 right-2 rotate-[-90deg]">
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5"/>
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5"
              strokeDasharray={`${2 * Math.PI * 11}`}
              strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
              strokeLinecap="round"
            />
            <text x="14" y="14" textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: 7, fill: 'rgba(255,255,255,0.7)', transform: 'rotate(90deg)', transformOrigin: '14px 14px' }}>
              {pct}%
            </text>
          </svg>
        )}

        {/* Large file badge */}
        {isLarge && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.35)' }}>
            <AlertTriangle size={9} className="text-amber-400"/>
            <span style={{ fontSize: 9 }} className="text-amber-400 font-medium">Large</span>
          </div>
        )}

        {/* Folder badge */}
        {folder && (
          <div className="absolute bottom-2 right-2 text-[9px] px-1.5 py-0.5 rounded-md max-w-[80px] truncate"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.55)' }}>
            📁 {folder.name}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 flex-1">
        <p className="text-ink-100 text-[11px] font-medium leading-snug line-clamp-2 mb-1">{title}</p>
        <p className="text-ink-600 text-[10px]">{formatSize(file.size)} · {formatRelativeDate(file.date)}</p>
      </div>

      {/* Hover open overlay */}
      <div className="absolute inset-0 flex items-center justify-center
                      bg-ink-950/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-2xl">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-100 shadow-xl"
          style={{ background: 'rgba(74,60,46,0.92)', border: '1px solid rgba(100,80,56,0.7)' }}>
          <BookOpen size={13}/>
          {pct > 0 ? 'Continue' : 'Open'}
        </div>
      </div>

      {/* Context menu trigger (top-left, visible on hover) */}
      <div
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onClick={e => e.stopPropagation()}
      >
        <ContextMenu
          file={file} open={menuOpen} setOpen={setMenuOpen}
          folderPick={folderPick} setFolderPick={setFolderPick}
          folders={state.folders} assigned={state.fileAssignments[file.id]}
          onAssign={assign} onUnassign={unassign}
          compact
        />
      </div>
    </div>
  );
}

/* ── Context menu ─────────────────────────────────────────────────────────── */
function ContextMenu({ file, open, setOpen, folderPick, setFolderPick,
  folders, assigned, onAssign, onUnassign, compact }) {
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className={`${compact ? 'p-1 rounded-lg' : 'p-2 rounded-xl'}
                    text-ink-400 hover:text-ink-100 transition-colors`}
        style={compact ? { background: 'rgba(14,11,8,0.75)' } : {}}
        aria-label="Options"
      >
        <MoreVertical size={13}/>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 glass rounded-xl shadow-2xl min-w-[160px] py-1.5 overflow-hidden"
          style={{ [compact ? 'left' : 'right']: 0, top: '100%' }}
          onMouseLeave={() => { setOpen(false); setFolderPick(false); }}
        >
          <button
            onClick={e => { e.stopPropagation(); setFolderPick(v => !v); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-ink-300
                       hover:bg-ink-700/50 hover:text-ink-100 transition-colors"
          >
            <FolderInput size={12}/> Move to folder
          </button>

          {folderPick && (
            <div className="border-t border-ink-800/50 py-1">
              {folders.length === 0
                ? <p className="px-3 py-2 text-xs text-ink-600 italic">No folders yet</p>
                : folders.map(f => (
                  <button key={f.id}
                    onClick={e => { e.stopPropagation(); onAssign(f.id); }}
                    className="w-full text-left px-4 py-2 text-xs text-ink-400 hover:bg-ink-700/50 hover:text-ink-100 transition-colors"
                  >
                    {assigned === f.id ? '✓ ' : '    '}{f.name}
                  </button>
                ))
              }
              {assigned && (
                <button
                  onClick={e => { e.stopPropagation(); onUnassign(); }}
                  className="w-full text-left px-3 py-2 text-xs text-red-400/70
                             hover:text-red-400 hover:bg-red-500/10 border-t border-ink-800/40 transition-colors"
                >
                  Remove from folder
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
