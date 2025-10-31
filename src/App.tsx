import { useCallback, useEffect, useRef, useState } from 'react';
import { type Vec2 } from './types';
import Floor2D from './components/Floor2D.tsx';
import Floor3D from './components/Floor3D.tsx';

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [vertices, setVertices] = useState<Vec2[]>([
    { x: -2, y: -1.5 },
    { x:  2, y: -1.5 },
    { x:  2, y:  1.5 },
    { x: -2, y:  1.5 },
  ]);

  const updateVertex = useCallback((index: number, v: Vec2) => {
    setVertices(prev => prev.map((p, i) => (i === index ? v : p)));
  }, []);

  const addVertex = useCallback((v: Vec2) => {
    setVertices(prev => [...prev, v]);
  }, []);

  const deleteVertex = useCallback((index: number) => {
    setVertices(prev => {
      if (prev.length <= 3) return prev; 
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const insertVertex = useCallback((index: number, v: Vec2) => {
    setVertices(prev => {
      const next = prev.slice();
      next.splice(index, 0, v);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clamped = Math.max(10, Math.min(90, (x / rect.width) * 100));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const startDrag = useCallback(() => setIsDragging(true), []);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}
    >
      <div style={{ width: `${splitPercent}%`, borderRight: '1px solid #ddd', minWidth: 0 }}>
        <Floor2D
          vertices={vertices}
          onMove={updateVertex}
          onAdd={addVertex}
          onInsert={insertVertex}
          onDelete={deleteVertex}
        />
      </div>
      <div
        onMouseDown={startDrag}
        title="Kéo để thay đổi tỉ lệ"
        style={{
          width: '2px',
          cursor: 'col-resize',
          background: isDragging ? '#f5f5f5' : '#ffffff',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Floor3D vertices={vertices} />
      </div>
    </div>
  );
}