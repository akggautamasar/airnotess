import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/ui/TopBar';
import LibraryView from '../components/library/LibraryView';
import PDFReader from '../components/reader/PDFReader';
import SearchModal from '../components/ui/SearchModal';
import { BookOpen, Clock, Search, Menu } from 'lucide-react';

export default function MainApp() {
  const { state, actions } = useApp();
  const [showSearch,  setShowSearch]  = useState(false);
  const [drawerOpen,  setDrawerOpen]  = useState(false);

  // Verify token on mount
  useEffect(() => {
    api.verify().catch(() => actions.logout());
  }, []);

  // Global ⌘K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!state.openFile) setShowSearch(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.openFile]);

  // Close drawer whenever section changes
  useEffect(() => { setDrawerOpen(false); }, [state.activeSection, state.activeFolderId]);

  const openSearch = useCallback(() => setShowSearch(true), []);
  const closeSearch = useCallback(() => setShowSearch(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="h-full flex overflow-hidden bg-ink-950">

      {/* ── Desktop sidebar (md and up) ─────────────────────────────────── */}
      <div className="hidden md:flex md:w-60 md:flex-shrink-0">
        <Sidebar onSearch={openSearch} />
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: 'rgba(14,11,8,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={closeDrawer}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div
            className="fixed left-0 top-0 bottom-0 z-50 w-72 md:hidden animate-slide-in"
            role="dialog"
            aria-modal="true"
          >
            <Sidebar onSearch={openSearch} onClose={closeDrawer} />
          </div>
        </>
      )}

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onSearch={openSearch} onMenuOpen={openDrawer} />
        <LibraryView />
        <BottomNav onSearch={openSearch} onMenu={openDrawer} />
      </div>

      {/* ── Reader overlay ────────────────────────────────────────────────── */}
      {state.openFile && <PDFReader />}

      {/* ── Search modal ──────────────────────────────────────────────────── */}
      {showSearch && !state.openFile && <SearchModal onClose={closeSearch} />}
    </div>
  );
}

/* ── Mobile bottom navigation ─────────────────────────────────────────────── */
function BottomNav({ onSearch, onMenu }) {
  const { state, actions } = useApp();

  const tabs = [
    { key: 'library', Icon: BookOpen, label: 'Library' },
    { key: 'recent',  Icon: Clock,    label: 'Recent'  },
  ];

  return (
    <nav
      className="md:hidden flex-shrink-0 border-t border-ink-800/60 bg-ink-950 pb-safe"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around px-1 py-1">
        {/* Section tabs */}
        {tabs.map(({ key, Icon, label }) => {
          const active = state.activeSection === key && !state.activeFolderId;
          return (
            <button
              key={key}
              onClick={() => actions.setSection(key)}
              className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all active:scale-90 select-none"
              style={{ color: active ? '#c4b396' : '#4a3c2e' }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6}/>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}

        {/* Search */}
        <button
          onClick={onSearch}
          className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all active:scale-90 select-none"
          style={{ color: '#4a3c2e' }}
        >
          <Search size={20} strokeWidth={1.6}/>
          <span className="text-[10px] font-medium">Search</span>
        </button>

        {/* Menu (opens folder/settings drawer) */}
        <button
          onClick={onMenu}
          className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all active:scale-90 select-none"
          style={{ color: '#4a3c2e' }}
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={1.6}/>
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
