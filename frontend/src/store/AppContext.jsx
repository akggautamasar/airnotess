import React, { createContext, useContext, useReducer, useCallback } from 'react';

const Ctx = createContext(null);

function safeStorage(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

const init = {
  isAuthenticated: !!safeStorage('airnotes_token', ''),
  demoMode:        false,

  files:        [],
  filesLoading: false,
  filesError:   null,

  viewMode:      safeStorage('viewMode', 'grid'),
  activeSection: 'library',

  searchQuery:   '',
  searchResults: [],
  isSearching:   false,

  folders:         [],
  activeFolderId:  null,
  fileAssignments: {},

  openFile:   null,
  readerMode: safeStorage('readerMode', 'dark'),

  recentFiles: [],
  highlights:  {},
  bookmarks:   {},
};

function reducer(s, a) {
  switch (a.type) {
    case 'SET_AUTH':    return { ...s, isAuthenticated: a.v, demoMode: a.demo ?? false };
    case 'LOGOUT':      return { ...init, isAuthenticated: false };

    case 'SET_FILES':        return { ...s, files: a.v, filesLoading: false, filesError: null };
    case 'SET_FILES_LOADING':return { ...s, filesLoading: a.v };
    case 'SET_FILES_ERROR':  return { ...s, filesError: a.v, filesLoading: false };

    case 'SET_VIEW_MODE':
      try { localStorage.setItem('viewMode', a.v); } catch {}
      return { ...s, viewMode: a.v };

    case 'SET_READER_MODE':
      try { localStorage.setItem('readerMode', a.v); } catch {}
      return { ...s, readerMode: a.v };

    case 'SET_SECTION':      return { ...s, activeSection: a.v, activeFolderId: null };
    case 'SET_FOLDER':       return { ...s, activeFolderId: a.v, activeSection: 'folder' };

    case 'SET_SEARCH_Q':     return { ...s, searchQuery: a.v };
    case 'SET_SEARCH_RES':   return { ...s, searchResults: a.v, isSearching: false };
    case 'SET_SEARCHING':    return { ...s, isSearching: a.v };

    case 'SET_FOLDERS':  return { ...s, folders: a.v };
    case 'ADD_FOLDER':   return { ...s, folders: [...s.folders, a.v] };
    case 'DEL_FOLDER':   return { ...s, folders: s.folders.filter(f => f.id !== a.v) };
    case 'REN_FOLDER':   return { ...s, folders: s.folders.map(f => f.id === a.id ? { ...f, name: a.name } : f) };

    case 'SET_ASSIGNMENTS': return { ...s, fileAssignments: a.v };
    case 'ASSIGN_FILE':     return { ...s, fileAssignments: { ...s.fileAssignments, [a.fileId]: a.folderId } };
    case 'UNASSIGN_FILE': {
      const n = { ...s.fileAssignments };
      delete n[a.fileId];
      return { ...s, fileAssignments: n };
    }

    case 'OPEN_FILE':  return { ...s, openFile: a.v };
    case 'CLOSE_FILE': return { ...s, openFile: null };

    case 'SET_RECENT': return { ...s, recentFiles: a.v };
    case 'ADD_RECENT':
      return { ...s, recentFiles: [a.v, ...s.recentFiles.filter(r => r.fileId !== a.v.fileId)].slice(0, 30) };

    case 'SET_HIGHLIGHTS': return { ...s, highlights: { ...s.highlights, [a.fid]: a.v } };
    case 'ADD_HIGHLIGHT':  return { ...s, highlights: { ...s.highlights, [a.fid]: [...(s.highlights[a.fid] ?? []), a.v] } };
    case 'DEL_HIGHLIGHT':  return { ...s, highlights: { ...s.highlights, [a.fid]: (s.highlights[a.fid] ?? []).filter(h => h.id !== a.id) } };

    case 'SET_BOOKMARKS': return { ...s, bookmarks: { ...s.bookmarks, [a.fid]: a.v } };

    default: return s;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);

  /* eslint-disable react-hooks/exhaustive-deps */
  const actions = {
    setAuth:       useCallback((v, demo) => dispatch({ type: 'SET_AUTH', v, demo }), []),
    logout:        useCallback(() => { try { localStorage.removeItem('airnotes_token'); } catch {} dispatch({ type: 'LOGOUT' }); }, []),

    setFiles:        useCallback(v  => dispatch({ type: 'SET_FILES', v }),         []),
    setFilesLoading: useCallback(v  => dispatch({ type: 'SET_FILES_LOADING', v }), []),
    setFilesError:   useCallback(v  => dispatch({ type: 'SET_FILES_ERROR', v }),   []),

    setViewMode:   useCallback(v  => dispatch({ type: 'SET_VIEW_MODE', v }),   []),
    setReaderMode: useCallback(v  => dispatch({ type: 'SET_READER_MODE', v }), []),
    setSection:    useCallback(v  => dispatch({ type: 'SET_SECTION', v }),     []),
    setFolder:     useCallback(v  => dispatch({ type: 'SET_FOLDER', v }),      []),

    setSearchQ:    useCallback(v  => dispatch({ type: 'SET_SEARCH_Q', v }),   []),
    setSearchRes:  useCallback(v  => dispatch({ type: 'SET_SEARCH_RES', v }), []),
    setSearching:  useCallback(v  => dispatch({ type: 'SET_SEARCHING', v }),  []),

    setFolders:  useCallback(v              => dispatch({ type: 'SET_FOLDERS', v }),                     []),
    addFolder:   useCallback(v              => dispatch({ type: 'ADD_FOLDER', v }),                      []),
    delFolder:   useCallback(v              => dispatch({ type: 'DEL_FOLDER', v }),                      []),
    renFolder:   useCallback((id, name)     => dispatch({ type: 'REN_FOLDER', id, name }),               []),

    setAssignments: useCallback(v            => dispatch({ type: 'SET_ASSIGNMENTS', v }),                 []),
    assignFile:     useCallback((fileId, folderId) => dispatch({ type: 'ASSIGN_FILE', fileId, folderId }),[]),
    unassignFile:   useCallback(fileId       => dispatch({ type: 'UNASSIGN_FILE', fileId }),              []),

    openFile:  useCallback(v => dispatch({ type: 'OPEN_FILE', v }),  []),
    closeFile: useCallback(() => dispatch({ type: 'CLOSE_FILE' }),   []),

    setRecent: useCallback(v => dispatch({ type: 'SET_RECENT', v }), []),
    addRecent: useCallback(v => dispatch({ type: 'ADD_RECENT', v }), []),

    setHighlights: useCallback((fid, v)  => dispatch({ type: 'SET_HIGHLIGHTS', fid, v }),  []),
    addHighlight:  useCallback((fid, v)  => dispatch({ type: 'ADD_HIGHLIGHT',  fid, v }),  []),
    delHighlight:  useCallback((fid, id) => dispatch({ type: 'DEL_HIGHLIGHT',  fid, id }), []),
    setBookmarks:  useCallback((fid, v)  => dispatch({ type: 'SET_BOOKMARKS',  fid, v }),  []),
    setDemoMode:   useCallback(v         => dispatch({ type: 'SET_AUTH', v: state.isAuthenticated, demo: v }), [state.isAuthenticated]),
  };
  /* eslint-enable */

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
}
