import Link from 'next/link';
import SettingsForm from '@/components/SettingsForm';
import {
  BORDER_COLOR,
  PAGE_BG,
  SURFACE_ALT,
  SURFACE_BG,
  FONT_STACK,
  BRAND_COLOR_DARK,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
} from '@/lib/constants';

export const metadata = {
  title: 'Settings — AutoDiagram',
};

export default function SettingsPage() {
  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', fontFamily: FONT_STACK, color: TEXT_PRIMARY }}>
      <main style={{ maxWidth: '880px', margin: '0 auto', padding: '36px 24px 48px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '20px' }}>
          <Link href="/" style={{ alignSelf: 'flex-start', textDecoration: 'none', color: BRAND_COLOR_DARK, fontSize: '13px', fontWeight: 500, padding: '10px 14px', borderRadius: '999px', background: SURFACE_ALT, border: `1px solid ${BORDER_COLOR}` }}>
            ← Back to AutoDiagram
          </Link>
          <div style={{ padding: '20px 22px', border: `1px solid ${BORDER_COLOR}`, borderRadius: '26px', background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,248,246,0.88) 100%)', boxShadow: '0 20px 60px rgba(17, 53, 60, 0.08)' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_MUTED, marginBottom: '8px' }}>AutoDiagram</div>
            <div style={{ fontSize: '36px', lineHeight: 1.08, letterSpacing: '-0.04em', fontWeight: 500 }}>Runtime settings</div>
            <p style={{ margin: '10px 0 0', fontSize: '15px', lineHeight: 1.7, color: TEXT_SECONDARY }}>
              Update the OpenRouter credentials and model used by the running app. The saved values persist in `.env.local` and are reused after container restarts.
            </p>
          </div>
        </div>

        <div style={{ background: SURFACE_BG, border: `1px solid ${BORDER_COLOR}`, borderRadius: '28px', padding: '32px', boxShadow: '0 24px 70px rgba(17, 53, 60, 0.08)' }}>
          <SettingsForm />
        </div>
      </main>
    </div>
  );
}
