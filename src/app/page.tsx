'use client';

import { ReactFlowProvider } from '@xyflow/react';
import MainGraphCanvas from '@/components/MainGraphCanvas';

export default function Home() {
  return (
    <ReactFlowProvider>
      <MainGraphCanvas />
    </ReactFlowProvider>
  );
}
