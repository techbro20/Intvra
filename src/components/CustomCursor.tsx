import { useEffect, useRef, useState } from "react";
import { HandGrabIcon, MousePointer2 } from "lucide-react";

export const CustomCursor = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const isVisibleRef = useRef(false);
  const isDragHoverRef = useRef(false);
  const [isDragHover, setIsDragHover] = useState(false);

  useEffect(() => {
    let rafId: number | null = null;

    const updateCursorPosition = () => {
      rafId = null;
      if (cursorRef.current && isVisibleRef.current) {
        cursorRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      positionRef.current = { x: e.clientX, y: e.clientY };
      if (rafId === null) {
        rafId = requestAnimationFrame(updateCursorPosition);
      }
      const target = e.target as HTMLElement | null;
      const nextIsDragHover = Boolean(
        target?.closest('[data-tauri-drag-region="true"]')
      );

      if (isDragHoverRef.current !== nextIsDragHover) {
        isDragHoverRef.current = nextIsDragHover;
        setIsDragHover(nextIsDragHover);
      }

      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        if (cursorRef.current) {
          cursorRef.current.style.opacity = "1";
        }
      }
    };

    const handleMouseLeave = () => {
      isVisibleRef.current = false;
      if (cursorRef.current) {
        cursorRef.current.style.opacity = "0";
      }
    };

    const handleWindowBlur = () => {
      isVisibleRef.current = false;
      if (cursorRef.current) {
        cursorRef.current.style.opacity = "0";
      }
    };

    // Add event listeners
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("blur", handleWindowBlur);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-[9999] opacity-0 will-change-transform"
      style={{
        transform: "translate3d(0px, 0px, 0)",
        transition: "opacity 0.1s ease-out",
      }}
    >
      {isDragHover ? (
        <HandGrabIcon className="h-5 w-5 drop-shadow-2xl fill-secondary stroke-primary" />
      ) : (
        <MousePointer2 className="h-5 w-5 drop-shadow-2xl fill-secondary stroke-primary" />
      )}
    </div>
  );
};
