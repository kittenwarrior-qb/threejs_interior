import { useCallback, useState } from 'react';
import { type Vec2 } from './types';
import Floor2D from './components/Floor2D.tsx';
import Floor3D from './components/Floor3D.tsx';

export default function App() {
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid #ddd' }}>
        <Floor2D
          vertices={vertices}
          onMove={updateVertex}
          onAdd={addVertex}
        />
      </div>
      <div>
        <Floor3D vertices={vertices} />
      </div>
    </div>
  );
}