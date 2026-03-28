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

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function asOptionalString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function sanitizeLabel(label) {
  if (!label || typeof label !== 'object') return undefined;

  const text = asOptionalString(label.text)?.trim();
  if (!text) return undefined;

  const normalized = { text };

  if (Number.isFinite(label.fontSize)) normalized.fontSize = label.fontSize;
  if (Number.isFinite(label.fontFamily)) normalized.fontFamily = label.fontFamily;

  const strokeColor = asOptionalString(label.strokeColor);
  if (strokeColor) normalized.strokeColor = strokeColor;

  const textAlign = asOptionalString(label.textAlign);
  if (textAlign) normalized.textAlign = textAlign;

  const verticalAlign = asOptionalString(label.verticalAlign);
  if (verticalAlign) normalized.verticalAlign = verticalAlign;

  return normalized;
}

function sanitizeBindingEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return undefined;

  const normalized = {};
  const id = asOptionalString(endpoint.id);
  const type = asOptionalString(endpoint.type);
  const text = asOptionalString(endpoint.text);

  if (id) normalized.id = id;
  if (type) normalized.type = type;
  if (type === 'text' && text) normalized.text = text;

  if (Number.isFinite(endpoint.x)) normalized.x = endpoint.x;
  if (Number.isFinite(endpoint.y)) normalized.y = endpoint.y;
  if (Number.isFinite(endpoint.width)) normalized.width = endpoint.width;
  if (Number.isFinite(endpoint.height)) normalized.height = endpoint.height;

  if (!normalized.id && !normalized.type) return undefined;
  if (normalized.type === 'text' && !normalized.text && !normalized.id) return undefined;

  return normalized;
}

function normalizeElementSkeleton(element) {
  if (!element || typeof element !== 'object' || typeof element.type !== 'string') {
    return null;
  }

  const normalized = { ...element };
  normalized.x = asFiniteNumber(normalized.x, 0);
  normalized.y = asFiniteNumber(normalized.y, 0);

  if (normalized.id != null) {
    normalized.id = asOptionalString(normalized.id);
  }

  normalized.groupIds = Array.isArray(normalized.groupIds)
    ? normalized.groupIds.map(asOptionalString).filter(Boolean)
    : [];

  normalized.label = sanitizeLabel(normalized.label);
  normalized.start = sanitizeBindingEndpoint(normalized.start);
  normalized.end = sanitizeBindingEndpoint(normalized.end);

  const text = asOptionalString(normalized.text);
  if (normalized.type === 'text') {
    if (!text) return null;
    normalized.text = text;
  } else if (text) {
    normalized.text = text;
  } else {
    delete normalized.text;
  }

  const fileId = asOptionalString(normalized.fileId);
  if (normalized.type === 'image') {
    if (!fileId) return null;
    normalized.fileId = fileId;
  } else if (fileId) {
    normalized.fileId = fileId;
  }

  const stringProps = [
    'strokeColor',
    'backgroundColor',
    'fillStyle',
    'strokeStyle',
    'link',
    'name',
    'startArrowhead',
    'endArrowhead',
  ];

  for (const key of stringProps) {
    const value = asOptionalString(normalized[key]);
    if (value) normalized[key] = value;
    else delete normalized[key];
  }

  if (Number.isFinite(normalized.fontSize)) normalized.fontSize = normalized.fontSize;
  else delete normalized.fontSize;

  if (Number.isFinite(normalized.fontFamily)) normalized.fontFamily = normalized.fontFamily;
  else delete normalized.fontFamily;

  if (normalized.type === 'frame') {
    normalized.children = Array.isArray(normalized.children)
      ? normalized.children.map(asOptionalString).filter(Boolean)
      : [];
  }

  if (normalized.type === 'arrow' || normalized.type === 'line') {
    const width = asFiniteNumber(normalized.width, 100);
    const height = asFiniteNumber(normalized.height, 0);
    normalized.width = width;
    normalized.height = height;
    normalized.points = Array.isArray(normalized.points) && normalized.points.length > 0
      ? normalized.points
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map(([x, y]) => [asFiniteNumber(x, 0), asFiniteNumber(y, 0)])
      : [[0, 0], [width, height]];
    if (normalized.points.length === 0) {
      normalized.points = [[0, 0], [width, height]];
    }
  }

  if (normalized.type === 'freedraw') {
    normalized.points = Array.isArray(normalized.points) && normalized.points.length > 0
      ? normalized.points
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map(([x, y]) => [asFiniteNumber(x, 0), asFiniteNumber(y, 0)])
      : [[0, 0], [1, 1]];
    if (normalized.points.length === 0) {
      normalized.points = [[0, 0], [1, 1]];
    }
  }

  return normalized;
}

function convertElementsSafely(convertToExcalidrawElements, elements) {
  try {
    return convertToExcalidrawElements(elements);
  } catch (error) {
    console.error('Failed to convert elements as a batch:', error);
  }

  const converted = [];
  const accepted = [];

  for (const element of elements) {
    try {
      const nextAccepted = [...accepted, element];
      converted.splice(0, converted.length, ...convertToExcalidrawElements(nextAccepted));
      accepted.splice(0, accepted.length, ...nextAccepted);
    } catch (error) {
      console.error('Dropping element that fails Excalidraw conversion:', element, error);
    }
  }

  return converted;
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
      return convertElementsSafely(convertToExcalidrawElements, normalizedElements);
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
