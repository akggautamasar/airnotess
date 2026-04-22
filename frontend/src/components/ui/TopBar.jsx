import React from 'react';
import { Search, Menu } from 'lucide-react';
import { useApp } from '../../store/AppContext';

export default function TopBar({ onSearch, onMenuOpen }) {
  const { state } = useApp();

  const title =
    state.activeSection === 'recent' ? 'Recent' :
    state.activeSection === 'folder' ? (state.folders.find(f => f.id === state.activeFolderId)?.name ?? 'Folder') :
    state.activeSection === 'search' ? `"${state.searchQuery}"` :
    'My Library';

  return (
    <header className="h-14 flex-shrink-0 flex items-center gap-3 px-4 border-b border-ink-800/50 bg-ink-950/95 backdrop-blur-sm">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuOpen}
        className="md:hidden p-2 -ml-1 rounded-xl text-ink-500 hover:text-ink-100 hover:bg-ink-800/60 active:scale-90 transition-all"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-base font-semibold text-paper-100 truncate leading-tight">{title}</h2>
        <p className="text-ink-600 text-[11px] hidden sm:block">
          {state.files.length} documents {state.demoMode ? '· demo' : ''}
        </p>
      </div>

      {/* Search */}
      <button
        onClick={onSearch}
        className="flex items-center gap-2 bg-ink-900 border border-ink-800/50 rounded-xl
                   px-3 py-2 text-ink-500 hover:text-ink-200 hover:border-ink-700
                   active:scale-95 transition-all"
        aria-label="Search"
      >
        <Search size={14} />
        <span className="hidden sm:block text-xs">Search…</span>
        <kbd className="hidden lg:block text-[10px] bg-ink-800 px-1.5 py-0.5 rounded text-ink-600">⌘K</kbd>
      </button>
    </header>
  );
}
