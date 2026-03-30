'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  CHART_TYPES,
  CHART_TYPE_DETAILS,
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
  const [chartType, setChartType] = useState('flowchart');
  const [textInput, setTextInput] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePrompt, setFilePrompt] = useState('');
  const [imageData, setImageData] = useState(null);
  const [imageName, setImageName] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const [llmStatus, setLlmStatus] = useState({
    checked: false,
    configured: true,
    missingFields: [],
  });
  const [configModalOpen, setConfigModalOpen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const loadSettingsStatus = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load settings');

        if (cancelled) return;

        const nextStatus = {
          checked: true,
          configured: Boolean(data.configured),
          missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
        };

        setLlmStatus(nextStatus);
        if (!nextStatus.configured) {
          setConfigModalOpen(true);
        }
      } catch {
        if (!cancelled) {
          setLlmStatus((current) => ({ ...current, checked: true }));
        }
      }
    };

    loadSettingsStatus();

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (llmStatus.checked && !llmStatus.configured) {
      setConfigModalOpen(true);
      return;
    }

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
          if (data?.error) message = data.error;
          if (data?.code === 'llm_not_configured') {
            setLlmStatus({
              checked: true,
              configured: false,
              missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
            });
            setConfigModalOpen(true);
            return;
          }
        } catch {}
        throw new Error(message);
      }

      const data = await response.json();
      if (!Array.isArray(data?.elements)) {
        throw new Error('The server returned an invalid diagram payload');
      }

      setElements(data.elements);
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Network error — check your connection' : e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const chartTypeDetail = CHART_TYPE_DETAILS[chartType];
  const missingFieldLabels = {
    apiKey: 'API key',
    baseUrl: 'base URL',
    model: 'model',
  };
  const missingFieldText = llmStatus.missingFields.length > 0
    ? llmStatus.missingFields.map((field) => missingFieldLabels[field] || field).join(', ')
    : 'API key and model';

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

      <main className="workspace-shell" style={{ width: 'min(1680px, calc(100vw - 32px))', margin: '0 auto', padding: '24px 20px 24px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, position: 'relative' }}>
        <section className="hero-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
          <div className="hero-copy" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: '10px' }}>AutoDiagram</div>
              <h1 className="hero-title" style={{ margin: '0 0 10px', fontSize: '56px', lineHeight: 0.94, letterSpacing: '-2.2px', fontWeight: 500, maxWidth: '900px' }}>
                Turn rough ideas into
                <span style={{ display: 'block', color: BRAND_COLOR_DARK }}> polished diagrams you can edit.</span>
              </h1>
              <p className="hero-lead" style={{ margin: 0, maxWidth: '760px', fontSize: '16px', lineHeight: 1.65, color: TEXT_SECONDARY }}>
                AutoDiagram converts prompts, codebases, and screenshots into structured Excalidraw scenes with the calm, clinical clarity of a modern scheduling product.
              </p>
            </div>
          </div>
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
                    <div ref={chartMenuRef} style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
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
                            const detail = CHART_TYPE_DETAILS[key];
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
                                  padding: '12px',
                                  borderRadius: '14px',
                                  border: 'none',
                                  background: selected ? BRAND_COLOR_SOFT : 'transparent',
                                  color: selected ? BRAND_COLOR_DARK : TEXT_PRIMARY,
                                  fontSize: '13px',
                                  fontWeight: selected ? 600 : 400,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'grid', gap: '4px' }}>
                                  <span>{label}</span>
                                  {detail && (
                                    <span style={{ fontSize: '12px', fontWeight: 400, color: selected ? BRAND_COLOR_DARK : TEXT_SECONDARY, lineHeight: 1.45 }}>
                                      {detail.meaning}
                                    </span>
                                  )}
                                </div>
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

                {chartTypeDetail && (
                  <div style={{ padding: '14px 16px', borderRadius: '18px', border: `1px solid ${BORDER_COLOR}`, background: SURFACE_ALT, display: 'grid', gap: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: TEXT_PRIMARY }}>{CHART_TYPES[chartType]}</div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: TEXT_SECONDARY }}>{chartTypeDetail.meaning}</div>
                    <div style={{ fontSize: '12px', lineHeight: 1.6, color: TEXT_MUTED }}>
                      Best for: {chartTypeDetail.bestFor}
                    </div>
                  </div>
                )}

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

      {configModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 24, 30, 0.26)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: '24px', zIndex: 100 }}>
          <div style={{ width: 'min(560px, 100%)', background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(244,251,249,0.96) 100%)', border: `1px solid ${BORDER_COLOR}`, borderRadius: '30px', padding: '28px', boxShadow: '0 30px 80px rgba(17, 53, 60, 0.18)', display: 'grid', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: '10px' }}>Runtime configuration required</div>
              <div style={{ fontSize: '32px', lineHeight: 1.05, letterSpacing: '-0.04em', fontWeight: 500, color: TEXT_PRIMARY }}>Add an API key and model before generating diagrams.</div>
            </div>
            <div style={{ fontSize: '14px', lineHeight: 1.7, color: TEXT_SECONDARY }}>
              This app does not have a working LLM configured yet. Open Settings and fill in the missing runtime fields so generation requests can be sent successfully.
            </div>
            <div style={{ padding: '14px 16px', borderRadius: '20px', border: `1px solid ${BORDER_COLOR}`, background: SURFACE_BG, fontSize: '13px', lineHeight: 1.6, color: TEXT_SECONDARY }}>
              Missing fields: {missingFieldText}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Link
                href="/settings"
                onClick={() => setConfigModalOpen(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 18px',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  border: 'none',
                  background: `linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_DARK} 100%)`,
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: `0 18px 38px ${BRAND_GLOW}`,
                }}
              >
                Open settings
              </Link>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                style={{
                  padding: '12px 18px',
                  borderRadius: '999px',
                  border: `1px solid ${BORDER_COLOR}`,
                  background: SURFACE_BG,
                  color: TEXT_PRIMARY,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
