"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./CeramicReports.module.css";
export function CeramicReportViewport({ children, onSize, resetKey }: { children: ReactNode; resetKey: string; onSize: (size: { width: number; height: number }) => void }) {
  const viewport = useRef<HTMLDivElement>(null), top = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ width: 0, client: 0, left: 0 });
  useEffect(() => {
    const node = viewport.current, content = canvas.current; if (!node || !content) return;
    let lastWidth = -1, lastHeight = -1;
    const measure = () => {
      setMetrics(old => old.width === node.scrollWidth && old.client === node.clientWidth && old.left === node.scrollLeft ? old : { width: node.scrollWidth, client: node.clientWidth, left: node.scrollLeft });
      if (lastWidth !== node.clientWidth || lastHeight !== node.clientHeight) {
        lastWidth = node.clientWidth; lastHeight = node.clientHeight; onSize({ width: lastWidth, height: lastHeight });
      }
      if (top.current && top.current.scrollLeft !== node.scrollLeft) top.current.scrollLeft = node.scrollLeft;
    };
    const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(content); measure();
    return () => observer.disconnect();
  }, [onSize]);
  useEffect(() => { viewport.current?.scrollTo({ left: 0, top: 0 }); }, [resetKey]);
  const sync = (source: HTMLDivElement, destination: HTMLDivElement | null) => {
    if (destination && destination.scrollLeft !== source.scrollLeft) destination.scrollLeft = source.scrollLeft;
    const node = viewport.current; if (node) setMetrics(old => old.left === node.scrollLeft ? old : ({ ...old, left: node.scrollLeft }));
  };
  const move = (direction: number) => { const node = viewport.current; if (node) node.scrollLeft += direction * Math.max(240, node.clientWidth * .7); };
  const overflows = metrics.width > metrics.client + 1;
  return <div className={styles.viewportFrame}>
    <div className={styles.scrollTools} aria-label="Move report columns">
      <button type="button" aria-label="Move columns left" disabled={!overflows || metrics.left <= 0} onClick={() => move(-1)}>←</button>
      <div ref={top} className={styles.topScroll} aria-label="Top horizontal report scrollbar" onScroll={event => sync(event.currentTarget, viewport.current)}><div style={{ width: metrics.width, height: 1 }} /></div>
      <button type="button" aria-label="Move columns right" disabled={!overflows || metrics.left >= metrics.width - metrics.client - 1} onClick={() => move(1)}>→</button>
    </div>
    <div ref={viewport} className={styles.viewport} role="region" aria-label="Report data" tabIndex={0} onScroll={event => sync(event.currentTarget, top.current)}><div ref={canvas} className={styles.canvas}>{children}</div></div>
  </div>;
}
