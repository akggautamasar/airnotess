import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bookmark } from 'lucide-react';

export default function ThumbnailSidebar({ pdfDoc, numPages, currentPage, onGoTo, bookmarks, readerMode }) {
  const [thumbs,    setThumbs]    = useState({});
  const containerRef = useRef(null);
  const observerRef  = useRef(null);
  const queueRef     = useRef([]);
  const busyRef      = useRef(false);
  const thumbsRef    = useRef({});    // always-current reference to avoid stale closure

  thumbsRef.current = thumbs;

  const bookmarkedPages = new Set(bookmarks.map(b => b.page));

  // Drain render queue one at a time
  const drain = useCallback(async () => {
    if (busyRef.current || queueRef.current.length === 0) return;
    busyRef.current = true;
    const pageNum   = queueRef.current.shift();
    try {
      const page     = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.18 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const dataUrl  = canvas.toDataURL('image/jpeg', 0.65);
      setThumbs(prev => ({ ...prev, [pageNum]: dataUrl }));
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn('thumb:', e);
    } finally {
      busyRef.current = false;
      setTimeout(drain, 16); // ~60fps paced
    }
  }, [pdfDoc]);

  // Set up intersection observer — recreate when thumbs change so we don't re-queue already-rendered
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const n = parseInt(entry.target.dataset.page, 10);
          if (!thumbsRef.current[n] && !queueRef.current.includes(n)) {
            queueRef.current.push(n);
            drain();
          }
        });
      },
      { root: containerRef.current, rootMargin: '300px 0px', threshold: 0 },
    );

    // Observe all thumb items currently in DOM
    containerRef.current.querySelectorAll('[data-page]').forEach(el => {
      observerRef.current.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [numPages, drain, thumbs]); // re-run when thumbs changes to un-observe already-rendered

  // Scroll active thumb into view
  useEffect(() => {
    containerRef.current
      ?.querySelector(`[data-page="${currentPage}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage]);

  const bg     = readerMode === 'dark' ? '#0a0806' : readerMode === 'sepia' ? '#e5dfd5' : '#ddd';
  const border = readerMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
  const active = readerMode === 'sepia' ? '#7d6344' : '#967852';

  return (
    <div
      ref={containerRef}
      className="w-28 flex-shrink-0 overflow-y-auto border-r flex flex-col gap-1.5 py-2 px-1.5"
      style={{ background: bg, borderColor: border }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
        <div
          key={n}
          data-page={n}
          onClick={() => onGoTo(n)}
          className="relative cursor-pointer rounded-lg overflow-hidden flex-shrink-0 transition-all duration-150"
          style={{
            border: n === currentPage ? `2px solid ${active}` : '2px solid transparent',
          }}
        >
          {thumbs[n] ? (
            <img src={thumbs[n]} alt={`p${n}`} className="w-full block" loading="lazy" />
          ) : (
            <div
              className="w-full aspect-[3/4] flex items-center justify-center text-[10px] font-mono"
              style={{ background: readerMode === 'dark' ? '#1c1610' : '#ccc', opacity: 0.5 }}
            >
              {n}
            </div>
          )}

          {bookmarkedPages.has(n) && (
            <Bookmark size={9} className="absolute top-1 right-1 text-amber-400 fill-amber-400" />
          )}

          <div
            className="absolute bottom-0 left-0 right-0 text-center font-mono py-0.5"
            style={{
              fontSize: '8px',
              background: n === currentPage ? `${active}cc` : 'rgba(0,0,0,0.45)',
              color: '#fff',
            }}
          >
            {n}
          </div>
        </div>
      ))}
    </div>
  );
}
