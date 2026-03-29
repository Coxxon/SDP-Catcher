import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

interface GhostScrollProps {
  children: ReactNode;
  className?: string;
}

export function GhostScroll({ children, className = "" }: GhostScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isThumbHovered, setIsThumbHovered] = useState(false);
  const [showThumb, setShowThumb] = useState(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);
  const hideTimer = useRef<any>(null);

  // Calculate thumb geometry
  const updateThumb = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const { clientHeight, scrollHeight, scrollTop } = el;
    if (scrollHeight <= clientHeight) {
      setThumbHeight(0);
      return;
    }

    const ratio = clientHeight / scrollHeight;
    const tH = Math.max(ratio * clientHeight, 24); // Min 24px thumb
    const maxScroll = scrollHeight - clientHeight;
    const tTop = (scrollTop / maxScroll) * (clientHeight - tH);

    setThumbHeight(tH);
    setThumbTop(tTop);
  }, []);

  // Debounced show/hide
  const flashThumb = useCallback(() => {
    setShowThumb(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!isHovered && !isDragging) {
      hideTimer.current = setTimeout(() => setShowThumb(false), 1200);
    }
  }, [isHovered, isDragging]);

  // Sync on scroll
  const onScroll = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      updateThumb();
      flashThumb();
    });
  }, [updateThumb, flashThumb]);

  // Observe content size changes
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    updateThumb();

    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(el);
    // Also observe children size changes
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => ro.disconnect();
  }, [updateThumb]);

  // Mouse hover on container
  useEffect(() => {
    if (isHovered) {
      setShowThumb(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else if (!isDragging) {
      hideTimer.current = setTimeout(() => setShowThumb(false), 800);
    }
  }, [isHovered, isDragging]);

  // Drag logic
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartScroll.current = contentRef.current?.scrollTop || 0;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const el = contentRef.current;
      if (!el) return;

      const { clientHeight, scrollHeight } = el;
      const trackH = clientHeight - thumbHeight;
      const deltaY = e.clientY - dragStartY.current;
      const scrollDelta = (deltaY / trackH) * (scrollHeight - clientHeight);

      el.scrollTop = dragStartScroll.current + scrollDelta;
    };

    const onUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, thumbHeight]);

  // Click on track to jump
  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const el = contentRef.current;
    const track = e.currentTarget as HTMLElement;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = clickY / rect.height;
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, []);

  const canScroll = thumbHeight > 0;
  const thumbOpacity = !canScroll
    ? 0
    : isDragging
      ? 0.5
      : isThumbHovered
        ? 0.4
        : showThumb && isHovered
          ? 0.15
          : showThumb
            ? 0.1
            : 0;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Scrollable content — native scrollbar hidden via CSS */}
      <div
        ref={contentRef}
        onScroll={onScroll}
        className="h-full overflow-y-scroll overflow-x-hidden ghost-scroll-content"
        style={{ scrollbarWidth: "none" }} /* Firefox + standard */
      >
        {children}
      </div>

      {/* Custom ghost scrollbar track (invisible, click target) */}
      {canScroll && (
        <div
          className="absolute top-0 right-0 w-2.5 h-full z-50"
          style={{ cursor: isDragging ? "grabbing" : "default" }}
          onClick={onTrackClick}
        >
          {/* Thumb */}
          <div
            ref={thumbRef}
            onMouseDown={startDrag}
            onMouseEnter={() => setIsThumbHovered(true)}
            onMouseLeave={() => setIsThumbHovered(false)}
            className="absolute right-0.5 rounded-full transition-opacity duration-300 ease-out"
            style={{
              width: "4px",
              height: `${thumbHeight}px`,
              top: `${thumbTop}px`,
              backgroundColor: `rgba(255, 255, 255, ${thumbOpacity})`,
              cursor: isDragging ? "grabbing" : "grab",
              transition: isDragging
                ? "background-color 0.1s"
                : "background-color 0.3s ease-out, opacity 0.3s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}
