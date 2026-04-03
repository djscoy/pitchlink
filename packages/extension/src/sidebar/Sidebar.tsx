import { useState, useEffect } from 'react';
import { GmailAdapter, ThreadViewData } from '../gmail-adapter/GmailAdapter';
import { useTheme } from './ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContactPanel } from './views/ContactPanel';
import { PipelineView } from './views/PipelineView';
import { DashboardView } from './views/DashboardView';
import { HistoryView } from './views/HistoryView';
import { TemplatePanel } from './views/TemplatePanel';
import { MODE_CONFIG, TRANSACTION_MODES, SIDEBAR, APP_CONFIG } from '@pitchlink/shared';
import type { TransactionMode } from '@pitchlink/shared';

interface SidebarProps {
  gmailAdapter: GmailAdapter;
}

type SidebarTab = 'pipeline' | 'templates' | 'nudges' | 'history';

export function Sidebar({ gmailAdapter }: SidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [activeMode, setActiveMode] = useState<TransactionMode>('buy');
  const [activeTab, setActiveTab] = useState<SidebarTab>('pipeline');
  const [currentThread, setCurrentThread] = useState<ThreadViewData | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  // Listen for thread view changes
  useEffect(() => {
    const unsubscribe = gmailAdapter.onThreadView((data) => {
      setCurrentThread(data);
    });
    return unsubscribe;
  }, [gmailAdapter]);

  const modeConfig = MODE_CONFIG[activeMode];

  return (
    <div className="pl-sidebar" style={{ minHeight: '100%' }}>
      {/* Top Bar */}
      <div
        className="pl-topbar"
        style={{
          height: `${SIDEBAR.TOP_BAR_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid var(--pl-border-primary)',
          backgroundColor: 'var(--pl-bg-primary)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        {/* Wordmark */}
        <span
          style={{
            fontWeight: 700,
            fontSize: '14px',
            color: 'var(--pl-text-primary)',
            letterSpacing: '-0.3px',
          }}
        >
          {APP_CONFIG.APP_NAME}
        </span>

        {/* Mode Pills */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {TRANSACTION_MODES.map((mode) => {
            const config = MODE_CONFIG[mode];
            const isActive = mode === activeMode;
            return (
              <button
                key={mode}
                onClick={() => {
                  setActiveMode(mode);
                  setActiveCampaignId(null); // Reset campaign selection on mode switch
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? config.color : 'transparent',
                  color: isActive ? '#FFFFFF' : 'var(--pl-text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px',
            color: 'var(--pl-text-secondary)',
          }}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {resolvedTheme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
        </button>
      </div>

      {/* Tabs — only show when no thread is open (dashboard/pipeline mode) */}
      {!currentThread && (
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--pl-border-primary)',
            backgroundColor: 'var(--pl-bg-secondary)',
          }}
        >
          {(['pipeline', 'templates', 'nudges', 'history'] as SidebarTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                fontSize: '12px',
                fontWeight: activeTab === tab ? 600 : 400,
                border: 'none',
                borderBottom:
                  activeTab === tab
                    ? `2px solid ${modeConfig.color}`
                    : '2px solid transparent',
                backgroundColor: 'transparent',
                color:
                  activeTab === tab ? 'var(--pl-text-primary)' : 'var(--pl-text-secondary)',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          minHeight: '200px',
        }}
      >
        {currentThread ? (
          /* Thread is open — show contact panel */
          <ErrorBoundary section="contact-panel">
            <ContactPanel thread={currentThread} mode={activeMode} />
          </ErrorBoundary>
        ) : (
          /* No thread — show dashboard/pipeline/history */
          <>
            {activeTab === 'pipeline' && (
              <ErrorBoundary section="pipeline-view">
                {activeCampaignId ? (
                  <PipelineView
                    mode={activeMode}
                    activeCampaignId={activeCampaignId}
                    onSelectCampaign={(id) => setActiveCampaignId(id || null)}
                  />
                ) : (
                  <DashboardView
                    mode={activeMode}
                    onNavigateToCampaign={(id) => {
                      setActiveCampaignId(id);
                    }}
                  />
                )}
              </ErrorBoundary>
            )}
            {activeTab === 'templates' && (
              <ErrorBoundary section="templates-view">
                <TemplatePanel mode={activeMode} />
              </ErrorBoundary>
            )}
            {activeTab === 'nudges' && (
              <ErrorBoundary section="nudges-view">
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#128276;</div>
                  <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
                    Nudge Queue
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--pl-text-tertiary)',
                      marginTop: '4px',
                    }}
                  >
                    Follow-up sequences will appear here (Phase 4).
                  </div>
                </div>
              </ErrorBoundary>
            )}
            {activeTab === 'history' && (
              <ErrorBoundary section="history-view">
                <HistoryView mode={activeMode} />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>
    </div>
  );
}
