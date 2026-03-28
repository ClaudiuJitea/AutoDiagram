'use client';

import { useEffect, useState } from 'react';
import {
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  BRAND_GLOW,
  BORDER_COLOR,
  PAGE_BG,
  SURFACE_ALT,
  SURFACE_BG,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '@/lib/constants';

const ACCESS_PASSWORD = process.env.NEXT_PUBLIC_ACCESS_PASSWORD;

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '18px',
  border: `1px solid ${BORDER_COLOR}`,
  background: SURFACE_ALT,
  color: TEXT_PRIMARY,
  fontSize: '14px',
  outline: 'none',
};

export default function SettingsForm() {
  const [form, setForm] = useState({
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/settings', {
          headers: ACCESS_PASSWORD ? { 'x-access-password': ACCESS_PASSWORD } : {},
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load settings');
        setForm(data.config);
      } catch (error) {
        setStatus({ type: 'error', message: error.message });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ACCESS_PASSWORD ? { 'x-access-password': ACCESS_PASSWORD } : {}),
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save settings');
      setForm(data.config);
      setStatus({ type: 'success', message: 'Settings updated. New generations will use the saved runtime config.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'grid', gap: '16px' }}>
        <label style={{ display: 'grid', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: TEXT_PRIMARY }}>OpenRouter API key</span>
          <input
            type="password"
            value={form.apiKey}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder="sk-or-v1-..."
            style={inputStyle}
            autoComplete="off"
          />
        </label>

        <label style={{ display: 'grid', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: TEXT_PRIMARY }}>Base URL</span>
          <input
            type="text"
            value={form.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: TEXT_PRIMARY }}>Model</span>
          <input
            type="text"
            value={form.model}
            onChange={(event) => updateField('model', event.target.value)}
            placeholder="xiaomi/mimo-v2-pro"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: '20px', border: `1px solid ${BORDER_COLOR}`, background: PAGE_BG, color: TEXT_SECONDARY, fontSize: '13px', lineHeight: 1.7 }}>
        Changes are written to the container&apos;s `.env.local` and applied to the current runtime immediately for future generations.
      </div>

      {status.message && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '18px',
            border: status.type === 'error' ? '1px solid #f4c8c4' : `1px solid ${BORDER_COLOR}`,
            background: status.type === 'error' ? '#fff3f1' : 'rgba(22,179,167,0.08)',
            color: status.type === 'error' ? '#b42318' : BRAND_COLOR_DARK,
            fontSize: '13px',
          }}
        >
          {status.message}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={saving || loading}
          style={{
            padding: '12px 18px',
            borderRadius: '999px',
            border: 'none',
            background: `linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_DARK} 100%)`,
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving || loading ? 'wait' : 'pointer',
            boxShadow: `0 18px 38px ${BRAND_GLOW}`,
          }}
        >
          {saving ? 'Saving...' : loading ? 'Loading...' : 'Save settings'}
        </button>
        <span style={{ fontSize: '12px', color: TEXT_MUTED }}>Protected by the same access password as generation.</span>
      </div>
    </form>
  );
}
