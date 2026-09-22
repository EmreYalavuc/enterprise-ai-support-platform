"use client";

import { useEffect, useRef } from "react";

export function CursorFollower() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  // Ring lags behind dot for trailing effect
  const pos = useRef({ x: 0, y: 0 });
  const ring = useRef({ x: 0, y: 0 });
  const raf  = useRef<number>(0);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      pos.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.left = `${e.clientX}px`;
        dotRef.current.style.top  = `${e.clientY}px`;
      }
    }

    function onDown() { ringRef.current?.classList.add("clicking"); }
    function onUp()   { ringRef.current?.classList.remove("clicking"); }

    function onEnter(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("a, button, [role=button], label, select")) {
        ringRef.current?.classList.add("hovering");
      }
    }
    function onLeave() {
      ringRef.current?.classList.remove("hovering");
    }

    // Smooth ring follow
    function animate() {
      ring.current.x += (pos.current.x - ring.current.x) * 0.12;
      ring.current.y += (pos.current.y - ring.current.y) * 0.12;
      if (ringRef.current) {
        ringRef.current.style.left = `${ring.current.x}px`;
        ringRef.current.style.top  = `${ring.current.y}px`;
      }
      raf.current = requestAnimationFrame(animate);
    }
    raf.current = requestAnimationFrame(animate);

    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mousedown",  onDown);
    document.addEventListener("mouseup",    onUp);
    document.addEventListener("mouseover",  onEnter);
    document.addEventListener("mouseout",   onLeave);

    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mousedown",  onDown);
      document.removeEventListener("mouseup",    onUp);
      document.removeEventListener("mouseover",  onEnter);
      document.removeEventListener("mouseout",   onLeave);
    };
  }, []);

  return (
    <>
      <div ref={dotRef}  className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </>
  );
}
