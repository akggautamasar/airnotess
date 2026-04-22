import React, { useState } from 'react';
import { Highlighter, Bookmark, Trash2 } from 'lucide-react';

const HEX = { yellow: '#fbbf24', green: '#4ade80', blue: '#60a5fa', pink: '#fb7185' };

export default function AnnotationSidebar({ highlights, bookmarks, currentPage, onGoTo, onDeleteHighlight, readerMode }) {
  const [tab, setTab] = useState('highlights');

  const bg   = readerMode === 'dark' ? '#0a0806' : readerMode === 'sepia' ? '#e5dfd5' : '#f0f0f0';
  const text = readerMode === 'dark' ? '#c4b396'  : readerMode === 'sepia' ? '#4a3820' : '#222';
  const bdr  = readerMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
  const act  = readerMode === 'sepia' ? '#7d6344' : '#967852';

  const tabs = [
    { key: 'highlights', Icon: Highlighter, label: 'Highlights', count: highlights.length },
    { key: 'bookmarks',  Icon: Bookmark,    label: 'Bookmarks',  count: bookmarks.length  },
  ];

  return (
    <div className="w-60 flex-shrink-0 border-l flex flex-col overflow-hidden" style={{ background: bg, borderColor: bdr, color: text }}>
      {/* Tabs */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: bdr }}>
        {tabs.map(({ key, Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-all"
            style={{
              opacity: tab === key ? 1 : 0.38,
              borderBottom: tab === key ? `2px solid ${act}` : '2px solid transparent',
            }}
          >
            <Icon size={13} />
            <span>{label}</span>
            <span style={{ opacity: 0.5, fontSize: 10 }}>({count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {tab === 'highlights' && (
          highlights.length === 0
            ? <Empty icon={<Highlighter size={22} />} text="Select text and tap the highlight button to annotate." />
            : highlights.slice().sort((a, b) => a.page - b.page || a.createdAt - b.createdAt).map(h => (
              <div
                key={h.id}
                className="rounded-xl p-3 cursor-pointer group"
                style={{ background: `${HEX[h.color]}18`, border: `1px solid ${HEX[h.color]}30` }}
                onClick={() => onGoTo(h.page)}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span style={{ fontSize: 10, opacity: 0.5 }}>Page {h.page}</span>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteHighlight(h.id); }}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <p className="text-xs italic leading-relaxed line-clamp-4">"{h.text}"</p>
                <div className="w-4 h-0.5 rounded-full mt-2" style={{ background: HEX[h.color] }} />
              </div>
            ))
        )}

        {tab === 'bookmarks' && (
          bookmarks.length === 0
            ? <Empty icon={<Bookmark size={22} />} text="Tap the bookmark icon to save your place." />
            : bookmarks.slice().sort((a, b) => a.page - b.page).map(b => (
              <div
                key={b.id}
                className="rounded-xl p-3 cursor-pointer flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.22)' }}
                onClick={() => onGoTo(b.page)}
              >
                <Bookmark size={13} style={{ color: '#fbbf24', fill: '#fbbf24', flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-medium">Page {b.page}</p>
                  {b.label && <p style={{ fontSize: 10, opacity: 0.5 }}>{b.label}</p>}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4" style={{ opacity: 0.35 }}>
      {icon}
      <p style={{ fontSize: 12, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}
