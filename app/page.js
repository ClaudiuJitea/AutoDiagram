'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  CHART_TYPES,
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  BRAND_COLOR_SOFT,
  BRAND_GLOW,
  BORDER_COLOR,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  PAGE_BG,
  SURFACE_BG,
  SURFACE_ALT,
} from '@/lib/constants';
import { optimizeExcalidrawCode } from '@/lib/optimizeArrows';
import { repairJsonClosure, safeParseJsonWithRepair } from '@/lib/json-repair';

const ExcalidrawCanvas = dynamic(() => import('@/components/ExcalidrawCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#fafafa',
      backgroundImage: 'radial-gradient(circle, #d0cdc8 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    }} />
  ),
});

export default function Home() {
  const [activeTab, setActiveTab] = useState('text');
  const [chartType, setChartType] = useState('auto');
  const [textInput, setTextInput] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePrompt, setFilePrompt] = useState('');
  const [imageData, setImageData] = useState(null);
  const [imageName, setImageName] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [chartMenuOpen, setChartMenuOpen] = useState(false);

  const [panelWidth, setPanelWidth] = useState(550);

  const [elements, setElements] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const panelRef = useRef(null);
  const canvasRef = useRef(null);
  const chartMenuRef = useRef(null);

  // Scroll to top whenever any Excalidraw modal opens (container is inserted fresh each time)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.classList?.contains('excalidraw-modal-container')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isGenerating) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isGenerating]);

  // Sync inputs panel width to Excalidraw toolbar width once it renders,
  // and attach a click listener to the hamburger menu trigger to scroll to canvas
  useEffect(() => {
    let menuTriggerListener = null;

    const measure = () => {
      // NOTE: '.App-toolbar' is an undocumented Excalidraw internal class — may change in future Excalidraw versions
      const toolbar = document.querySelector('.App-toolbar');
      if (toolbar) {
        const w = toolbar.getBoundingClientRect().width;
        if (w > 0) {
          setPanelWidth(Math.round(w));

          // Attach hamburger click listener — scroll to canvas only if at top of page
          const trigger = document.querySelector('.main-menu-trigger');
          if (trigger && !trigger._scrollListenerAttached) {
            menuTriggerListener = () => {
              if (window.scrollY === 0) {
                canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            };
            trigger.addEventListener('click', menuTriggerListener);
            trigger._scrollListenerAttached = true;
          }

          return true;
        }
      }
      return false;
    };

    if (measure()) return;

    const observer = new MutationObserver(() => {
      if (measure()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!chartMenuRef.current?.contains(event.target)) {
        setChartMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setChartMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const fixUnescapedQuotes = (jsonString) => {
    let result = '';
    let inString = false;
    let escapeNext = false;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      if (escapeNext) { result += char; escapeNext = false; continue; }
      if (char === '\\') { result += char; escapeNext = true; continue; }
      if (char === '"') {
        if (!inString) {
          inString = true;
          result += char;
        } else {
          const nextNonWS = jsonString.slice(i + 1).match(/^\s*(.)/);
          const next = nextNonWS ? nextNonWS[1] : '';
          if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
            inString = false;
            result += char;
          } else {
            result += '\\"';
          }
        }
      } else {
        result += char;
      }
    }
    return result;
  };

  const postProcessCode = (code) => {
    if (!code || typeof code !== 'string') return code;
    let processed = code.trim();
    processed = processed.replace(/^```(?:json|javascript|js)?\s*\n?/i, '');
    processed = processed.replace(/\n?```\s*$/, '');
    processed = processed.trim();
    processed = repairJsonClosure(processed);
    const initialParse = safeParseJsonWithRepair(processed);
    if (initialParse.ok) {
      return JSON.stringify(initialParse.value, null, 2);
    }

    processed = fixUnescapedQuotes(processed);
    const repairedParse = safeParseJsonWithRepair(processed);
    if (repairedParse.ok) {
      return JSON.stringify(repairedParse.value, null, 2);
    }

    return processed;
  };

  const tryParseAndApply = (code) => {
    const arrayMatch = code.trim().match(/\[[\s\S]*\]/);
    if (!arrayMatch) return;

    const parsed = safeParseJsonWithRepair(arrayMatch[0]);
    if (parsed.ok && Array.isArray(parsed.value)) {
      setElements(parsed.value);
      return;
    }

    console.error('Parse failed:', parsed.error);
    console.error('Raw JSON snippet:', arrayMatch[0].slice(0, 300));
    setError('Failed to parse diagram — the AI response contained invalid JSON. Please try again.');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target.result);
    reader.readAsText(file);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(',')[1];
      setImageData({ data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const canGenerate = !isGenerating && (
    (activeTab === 'text' && textInput.trim().length > 0) ||
    (activeTab === 'file' && fileContent.length > 0) ||
    (activeTab === 'image' && imageData !== null)
  );

  const handleGenerate = async () => {
    let userInput;
    if (activeTab === 'text') userInput = textInput.trim();
    else if (activeTab === 'file') userInput = filePrompt.trim()
      ? `${fileContent}\n\nInstruction: ${filePrompt.trim()}`
      : fileContent;
    else if (activeTab === 'image') userInput = { text: imageCaption || 'Generate a diagram from this image', image: imageData };

    if (!userInput) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, chartType }),
      });

      if (!response.ok) {
        let message = 'Failed to generate diagram';
        try {
          const data = await response.json();
          if (data.error) message = data.error;
        } catch {}
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedCode = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) accumulatedCode += data.content;
              else if (data.error) throw new Error(data.error);
            } catch (e) {
              if (e.message && !e.message.includes('Unexpected')) console.error('SSE parse error:', e);
            }
          }
        }
      }

      const processed = postProcessCode(accumulatedCode);
      const optimized = optimizeExcalidrawCode(processed);
      tryParseAndApply(optimized);
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Network error — check your connection' : e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const textareaStyle = {
    width: '100%',
    height: '88px',
    fontSize: '13px',
    padding: '14px 16px',
    border: `1px solid ${BORDER_COLOR}`,
    borderRadius: '18px',
    resize: 'none',
    background: '#f8fcfb',
    color: TEXT_PRIMARY,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    outline: 'none',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
  };

  const dropZoneStyle = {
    width: '100%',
    height: '88px',
    border: `1px dashed ${BRAND_COLOR}`,
    borderRadius: '20px',
    background: BRAND_COLOR_SOFT,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    color: BRAND_COLOR_DARK,
    fontWeight: 500,
  };

  const inputWidth = `${panelWidth}px`;

  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', fontFamily: "var(--font-rubik), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: TEXT_PRIMARY, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 960px) {
          .workspace-shell { padding: 28px 18px 24px !important; }
          .hero-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .hero-copy { text-align: left !important; }
          .hero-title { font-size: 42px !important; letter-spacing: -1.4px !important; }
          .studio-card { padding: 22px !important; }
          .workspace-card { border-radius: 28px !important; padding: 18px !important; }
          .canvas-shell { height: 72vh !important; min-height: 360px !important; }
        }
        @media (max-width: 640px) {
          .hero-title { font-size: 34px !important; line-height: 1.05 !important; }
          .hero-lead { font-size: 15px !important; }
          .studio-card { padding: 18px !important; }
          .workspace-card { padding: 14px !important; border-radius: 24px !important; }
          .workspace-meta { flex-direction: column !important; align-items: flex-start !important; }
          .chart-row { flex-direction: column !important; align-items: stretch !important; }
          .chart-row button, .chart-row select { width: 100% !important; }
          .canvas-shell { height: 68vh !important; min-height: 320px !important; }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-120px', left: '-80px', width: '420px', height: '420px', background: 'radial-gradient(circle, rgba(22,179,167,0.16) 0%, rgba(22,179,167,0) 70%)' }} />
        <div style={{ position: 'absolute', top: '140px', right: '-110px', width: '360px', height: '360px', background: 'radial-gradient(circle, rgba(125,211,200,0.22) 0%, rgba(125,211,200,0) 72%)' }} />
      </div>

      <main className="workspace-shell" style={{ width: 'min(1680px, calc(100vw - 32px))', margin: '0 auto', padding: '36px 20px 24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, position: 'relative' }}>
        <section className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px', alignItems: 'center' }}>
          <div className="hero-copy" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: '14px' }}>AutoDiagram</div>
              <h1 className="hero-title" style={{ margin: '0 0 14px', fontSize: '64px', lineHeight: 0.96, letterSpacing: '-2.8px', fontWeight: 500, maxWidth: '720px' }}>
                Turn rough ideas into
                <span style={{ display: 'block', color: BRAND_COLOR_DARK }}> polished diagrams you can edit.</span>
              </h1>
              <p className="hero-lead" style={{ margin: 0, maxWidth: '620px', fontSize: '17px', lineHeight: 1.7, color: TEXT_SECONDARY }}>
                AutoDiagram converts prompts, codebases, and screenshots into structured Excalidraw scenes with the calm, clinical clarity of a modern scheduling product.
              </p>
            </div>
          </div>

          <aside className="studio-card" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(244,251,249,0.92) 100%)', border: `1px solid ${BORDER_COLOR}`, borderRadius: '34px', padding: '28px', boxShadow: '0 24px 70px rgba(17, 53, 60, 0.10)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-40px', right: '-10px', width: '140px', height: '140px', borderRadius: '999px', background: 'radial-gradient(circle, rgba(22,179,167,0.24) 0%, rgba(22,179,167,0) 72%)' }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div>
                  <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: '8px' }}>Workflow</div>
                  <div style={{ fontSize: '28px', lineHeight: 1.15, fontWeight: 500, color: TEXT_PRIMARY }}>Prompt in. Diagram out.</div>
                </div>
              </div>

              {[
                ['1', 'Describe the system, process, or image'],
                ['2', 'Select a chart style or let AutoDiagram decide'],
                ['3', 'Iterate directly in Excalidraw after generation'],
              ].map(([step, label]) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '20px', background: SURFACE_BG, border: `1px solid ${BORDER_COLOR}` }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '999px', background: BRAND_COLOR, color: '#fff', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 600, boxShadow: `0 10px 24px ${BRAND_GLOW}` }}>{step}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.5, color: TEXT_SECONDARY }}>{label}</div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="workspace-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px', background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(247,252,251,0.92) 100%)', border: `1px solid ${BORDER_COLOR}`, borderRadius: '36px', padding: '22px', boxShadow: '0 30px 80px rgba(17, 53, 60, 0.08)', backdropFilter: 'blur(16px)' }}>
          <div className="workspace-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.09em', color: TEXT_MUTED, marginBottom: '8px' }}>Workspace</div>
              <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 500, letterSpacing: '-0.03em' }}>Build an Excalidraw-ready scene</h2>
            </div>
            <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '999px', background: SURFACE_BG, border: `1px solid ${BORDER_COLOR}`, color: BRAND_COLOR_DARK, fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}>
              Settings
            </Link>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              ref={panelRef}
              onFocusCapture={(e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                  panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              style={{ width: inputWidth, maxWidth: '100%', background: SURFACE_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: '28px', overflow: 'visible', boxShadow: '0 20px 50px rgba(17, 53, 60, 0.08)' }}
            >

              <div style={{ display: 'flex', padding: '12px 12px 0', gap: '8px' }}>
                {['text', 'file', 'image'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '13px',
                      color: activeTab === tab ? BRAND_COLOR_DARK : TEXT_SECONDARY,
                      fontWeight: activeTab === tab ? 500 : 400,
                      cursor: 'pointer',
                      background: activeTab === tab ? BRAND_COLOR_SOFT : 'transparent',
                      border: activeTab === tab ? `1px solid ${BORDER_COLOR}` : '1px solid transparent',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {activeTab === 'text' && (
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleGenerate(); return; }
                      if (e.key === 'Enter' && !e.shiftKey && canGenerate) { e.preventDefault(); handleGenerate(); }
                    }}
                    placeholder="Describe the workflow, architecture, or concept you want AutoDiagram to map out..."
                    style={textareaStyle}
                  />
                )}

                {activeTab === 'file' && (
                  <>
                    <div onClick={() => fileInputRef.current?.click()} style={dropZoneStyle}>
                      {fileName ? `📄 ${fileName}` : 'Click to upload a file (.txt, .md, .json, .py, .js, .ts, .rs, .css, .sh...)'}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.csv,.json,.xml,.html,.js,.ts,.jsx,.tsx,.py,.java,.go,.rb,.php,.sql,.yaml,.yml,.css,.scss,.sass,.less,.rs,.c,.cpp,.h,.swift,.kt,.sh,.bash,.zsh,.toml,.ini,.env,.vue,.svelte,.graphql,.gql,.tsv,.jsonl"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    <textarea
                      value={filePrompt}
                      onChange={e => setFilePrompt(e.target.value)}
                      placeholder="Optional: tell AutoDiagram what it should extract or emphasize from this file..."
                      style={textareaStyle}
                    />
                  </>
                )}

                {activeTab === 'image' && (
                  <>
                    {!imageData ? (
                      <div onClick={() => imageInputRef.current?.click()} style={dropZoneStyle}>
                        Click to upload an image (.png, .jpg, .gif, .webp...)
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: `1px solid ${BORDER_COLOR}`, borderRadius: '18px', background: SURFACE_ALT, fontSize: '13px', color: TEXT_PRIMARY }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🖼 {imageName}</span>
                        <button onClick={() => { setImageData(null); setImageName(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED, fontSize: '18px', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                      </div>
                    )}
                    <textarea
                      value={imageCaption}
                      onChange={e => setImageCaption(e.target.value)}
                      placeholder="Optional: explain what should be extracted or redrawn from this image..."
                      style={textareaStyle}
                    />
                    <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </>
                )}

                <div className="chart-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: TEXT_SECONDARY, whiteSpace: 'nowrap' }}>Chart type:</span>
                    <div ref={chartMenuRef} style={{ position: 'relative', width: '180px' }}>
                      <button
                        type="button"
                        onClick={() => setChartMenuOpen((open) => !open)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          fontSize: '13px',
                          padding: '10px 14px',
                          border: `1px solid ${chartMenuOpen ? BRAND_COLOR : BORDER_COLOR}`,
                          borderRadius: '999px',
                          background: SURFACE_ALT,
                          color: TEXT_PRIMARY,
                          outline: 'none',
                          boxShadow: chartMenuOpen ? `0 10px 24px ${BRAND_GLOW}` : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{CHART_TYPES[chartType]}</span>
                        <span style={{ color: TEXT_MUTED, fontSize: '11px', transform: chartMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▼</span>
                      </button>
                      {chartMenuOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 10px)',
                            left: 0,
                            width: '100%',
                            maxHeight: '280px',
                            overflowY: 'auto',
                            padding: '8px',
                            borderRadius: '20px',
                            border: `1px solid ${BORDER_COLOR}`,
                            background: 'rgba(255,255,255,0.98)',
                            boxShadow: '0 22px 44px rgba(17, 53, 60, 0.14)',
                            zIndex: 30,
                            backdropFilter: 'blur(18px)',
                          }}
                        >
                          {Object.entries(CHART_TYPES).map(([key, label]) => {
                            const selected = chartType === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setChartType(key);
                                  setChartMenuOpen(false);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  borderRadius: '14px',
                                  border: 'none',
                                  background: selected ? BRAND_COLOR_SOFT : 'transparent',
                                  color: selected ? BRAND_COLOR_DARK : TEXT_PRIMARY,
                                  fontSize: '13px',
                                  fontWeight: selected ? 600 : 400,
                                  cursor: 'pointer',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    style={{
                      padding: '12px 18px',
                      background: canGenerate ? `linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_DARK} 100%)` : BORDER_COLOR,
                      color: canGenerate ? '#fff' : TEXT_MUTED,
                      border: 'none',
                      borderRadius: '999px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: canGenerate ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      boxShadow: canGenerate ? `0 18px 38px ${BRAND_GLOW}` : 'none',
                    }}
                  >
                    {isGenerating
                      ? `Generating... ${elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, '0')}s`}`
                      : 'Generate diagram'}
                  </button>
                </div>

              </div>
            </div>
          </div>

        {/* Error banner */}
        {error && (
          <div style={{ width: inputWidth, maxWidth: '100%', padding: '12px 16px', background: '#fff3f1', border: '1px solid #f4c8c4', borderRadius: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#b42318' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b42318', fontSize: '18px', lineHeight: 1, padding: '0 0 0 12px' }}>×</button>
          </div>
        )}

        {/* Excalidraw canvas */}
        <div className="canvas-shell" ref={canvasRef} style={{ width: '100%', height: 'calc(100vh - 250px)', minHeight: '420px', overflow: 'hidden', position: 'relative', borderRadius: '30px', border: `1px solid ${BORDER_COLOR}`, background: 'rgba(255,255,255,0.76)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
          <ExcalidrawCanvas elements={elements} />
        </div>
        </section>
      </main>
    </div>
  );
}
