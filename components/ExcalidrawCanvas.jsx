'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import '@excalidraw/excalidraw/index.css';

// Dynamically import Excalidraw with no SSR
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

// Dynamically import convertToExcalidrawElements
const getConvertFunction = async () => {
  const excalidrawModule = await import('@excalidraw/excalidraw');
  return excalidrawModule.convertToExcalidrawElements;
};

function normalizeElementSkeleton(element) {
  if (!element || typeof element !== 'object' || typeof element.type !== 'string') {
    return null;
  }

  const normalized = { ...element };

  if (!Array.isArray(normalized.groupIds)) {
    normalized.groupIds = [];
  }

  if (normalized.type === 'frame' && !Array.isArray(normalized.children)) {
    normalized.children = [];
  }

  if (normalized.type === 'arrow' || normalized.type === 'line') {
    const width = Number.isFinite(normalized.width) ? normalized.width : 100;
    const height = Number.isFinite(normalized.height) ? normalized.height : 0;
    normalized.width = width;
    normalized.height = height;
    normalized.points = Array.isArray(normalized.points) && normalized.points.length > 0
      ? normalized.points
      : [[0, 0], [width, height]];
  }

  if (normalized.type === 'freedraw') {
    normalized.points = Array.isArray(normalized.points) && normalized.points.length > 0
      ? normalized.points
      : [[0, 0], [1, 1]];
  }

  return normalized;
}

export default function ExcalidrawCanvas({ elements }) {
  const [convertToExcalidrawElements, setConvertFunction] = useState(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);

  // Load convert function on mount
  useEffect(() => {
    getConvertFunction().then(fn => {
      setConvertFunction(() => fn);
    });
  }, []);

  // Convert elements to Excalidraw format
  const convertedElements = useMemo(() => {
    if (!elements || elements.length === 0 || !convertToExcalidrawElements) {
      return [];
    }

    try {
      const normalizedElements = elements
        .map(normalizeElementSkeleton)
        .filter(Boolean);
      return convertToExcalidrawElements(normalizedElements);
    } catch (error) {
      console.error('Failed to convert elements:', error);
      return [];
    }
  }, [elements, convertToExcalidrawElements]);

  // Auto zoom to fit content when API is ready and elements change
  useEffect(() => {
    if (excalidrawAPI && convertedElements.length > 0) {
      // Small delay to ensure elements are rendered
      setTimeout(() => {
        excalidrawAPI.scrollToContent(convertedElements, {
          fitToContent: true,
          animate: true,
          duration: 300,
        });
      }, 100);
    }
  }, [excalidrawAPI, convertedElements]);

  // Generate unique key when elements change to force remount
  const canvasKey = useMemo(() => {
    if (convertedElements.length === 0) return 'empty';
    // Create a hash from elements to detect changes
    return JSON.stringify(convertedElements.map(el => el.id)).slice(0, 50);
  }, [convertedElements]);

  return (
    <div className="w-full h-full">
      <Excalidraw
        key={canvasKey}
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        initialData={{
          elements: convertedElements,
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemFontFamily: 1,
          },
          scrollToContent: true,
        }}
      />
    </div>
  );
}
