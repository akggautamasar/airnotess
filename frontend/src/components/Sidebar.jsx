import React, { useState } from 'react';
import { BookOpen, Clock, Search, LogOut, Plus, ChevronRight, ChevronDown, Folder, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { folderStore } from '../utils/storage';

export default function Sidebar({ onSearch, onClose }) {
  const { state, actions } = useApp();
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal]   = useState('');
  const [expanded, setExpanded]     = useState(new Set());

  const rootFolders = state.folders.filter(f => !f.parentId);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const id = await folderStore.create(name);
    actions.addFolder({ id, name, parentId: null, createdAt: Date.now() });
    setNewName('');
    setCreating(false);
  }

  async function commitRename(id) {
    const name = renameVal.trim();
    if (name) {
      await folderStore.rename(id, name);
      actions.renFolder(id, name);
    }
    setRenamingId(null);
  }

  async function deleteFolder(id) {
    await folderStore.delete(id);
    actions.delFolder(id);
    if (state.activeFolderId === id) actions.setSection('library');
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function navigate(section) {
    actions.setSection(section);
    onClose?.();
  }

  function openFolder(id) {
    actions.setFolder(id);
    onClose?.();
  }

  const navItems = [
    { key: 'library', Icon: BookOpen, label: 'Library', count: state.files.length },
    { key: 'recent',  Icon: Clock,    label: 'Recent',  count: state.recentFiles.length },
  ];

  return (
    <div className="w-full h-full bg-ink-950 border-r border-ink-800/50 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-ink-800/40 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-ink-800 border border-ink-700/40 flex items-center justify-center text-lg flex-shrink-0">📚</div>
        <div>
          <h1 className="font-display text-sm font-bold text-paper-100 leading-none">AirNotes</h1>
          <div className="flex items-center gap-1 mt-1">
            {state.demoMode
              ? <><WifiOff size={9} className="text-amber-400"/><span className="text-[10px] text-amber-400">Demo mode</span></>
              : <><Wifi    size={9} className="text-emerald-400"/><span className="text-[10px] text-emerald-400">Connected</span></>
            }
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <button
          onClick={() => { onSearch(); onClose?.(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-ink-800/60 border border-ink-700/30
                     text-ink-400 hover:text-ink-200 hover:bg-ink-800 active:scale-95 transition-all text-sm"
        >
          <Search size={14} />
          <span className="flex-1 text-left text-xs">Search PDFs…</span>
          <kbd className="hidden md:block text-[10px] bg-ink-700/50 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>

      {/* Nav items */}
      <nav className="px-3 py-1 flex-shrink-0 space-y-0.5">
        {navItems.map(({ key, Icon, label, count }) => (
          <button
            key={key}
            onClick={() => navigate(key)}
            className={`nav-item ${state.activeSection === key && !state.activeFolderId ? 'active' : ''}`}
          >
            <Icon size={15} />
            <span className="flex-1 text-left">{label}</span>
            {count > 0 && (
              <span className="text-[10px] bg-ink-700/70 text-ink-400 px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Folders */}
      <div className="px-3 py-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-700">Folders</span>
          <button onClick={() => setCreating(true)} className="text-ink-600 hover:text-ink-300 p-1 transition-colors">
            <Plus size={13} />
          </button>
        </div>

        {creating && (
          <div className="mb-2 flex gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Folder name…"
              className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-xs text-ink-100 focus:outline-none focus:border-ink-500"
            />
            <button onClick={createFolder} className="text-ink-300 hover:text-ink-100 px-2 text-sm">✓</button>
            <button onClick={() => setCreating(false)} className="text-ink-600 hover:text-ink-400 px-1 text-sm">✕</button>
          </div>
        )}

        {rootFolders.length === 0 && !creating && (
          <p className="text-ink-700 text-xs px-1 py-2 italic">No folders yet</p>
        )}

        {rootFolders.map(folder => (
          <FolderRow
            key={folder.id}
            folder={folder}
            allFolders={state.folders}
            isActive={state.activeFolderId === folder.id}
            expanded={expanded.has(folder.id)}
            renamingId={renamingId}
            renameVal={renameVal}
            onRenameChange={setRenameVal}
            onToggle={() => toggleExpand(folder.id)}
            onOpen={() => openFolder(folder.id)}
            onStartRename={(id, name) => { setRenamingId(id); setRenameVal(name); }}
            onCommitRename={commitRename}
            onDelete={deleteFolder}
            fileAssignments={state.fileAssignments}
          />
        ))}
      </div>

      {/* Sign out */}
      <div className="px-3 py-3 border-t border-ink-800/40 flex-shrink-0">
        <button onClick={actions.logout} className="nav-item text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

function FolderRow({ folder, allFolders, isActive, expanded, renamingId, renameVal, onRenameChange,
  onToggle, onOpen, onStartRename, onCommitRename, onDelete, fileAssignments }) {
  const [menu, setMenu] = useState(false);
  const children  = allFolders.filter(f => f.parentId === folder.id);
  const fileCount = Object.values(fileAssignments).filter(v => v === folder.id).length;

  if (renamingId === folder.id) {
    return (
      <div className="flex gap-1 mb-0.5">
        <input
          autoFocus value={renameVal}
          onChange={e => onRenameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCommitRename(folder.id); if (e.key === 'Escape') onCommitRename(null); }}
          className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-2 py-1 text-xs text-ink-100 focus:outline-none"
        />
        <button onClick={() => onCommitRename(folder.id)} className="text-ink-300 px-1.5 text-sm">✓</button>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={onOpen}
        className={`group relative flex items-center gap-1.5 px-2 py-2 rounded-xl cursor-pointer transition-all duration-100 text-xs
          ${isActive ? 'bg-ink-800 text-ink-100 border border-ink-700/40' : 'text-ink-400 hover:text-ink-200 hover:bg-ink-800/50'}`}
      >
        {children.length > 0 && (
          <button onClick={e => { e.stopPropagation(); onToggle(); }} className="text-ink-600 flex-shrink-0 p-0.5">
            {expanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          </button>
        )}
        {children.length === 0 && <div className="w-4 flex-shrink-0"/>}

        <Folder size={12} className="flex-shrink-0"/>
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        {fileCount > 0 && <span className="text-[10px] bg-ink-700/60 text-ink-500 px-1 rounded">{fileCount}</span>}

        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => setMenu(v => !v)} className="text-ink-600 hover:text-ink-300 px-1 py-0.5 rounded">⋯</button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 z-50 glass rounded-xl shadow-xl min-w-[120px] py-1" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { onStartRename(folder.id, folder.name); setMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-ink-300 hover:bg-ink-700/50 hover:text-ink-100">Rename</button>
              <button onClick={() => { onDelete(folder.id); setMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10">Delete</button>
            </div>
          )}
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div className="ml-5 border-l border-ink-800/50 pl-1.5 mt-0.5 space-y-0.5">
          {children.map(c => (
            <FolderRow key={c.id} folder={c} allFolders={allFolders} isActive={false} expanded={false}
              renamingId={renamingId} renameVal={renameVal} onRenameChange={onRenameChange}
              onToggle={() => {}} onOpen={onOpen} onStartRename={onStartRename}
              onCommitRename={onCommitRename} onDelete={onDelete} fileAssignments={fileAssignments}/>
          ))}
        </div>
      )}
    </div>
  );
}
