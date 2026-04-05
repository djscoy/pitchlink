import { useState, useEffect } from 'react';
import { GmailAdapter, ThreadViewData } from '../gmail-adapter/GmailAdapter';
import { useTheme } from './ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContactPanel } from './views/ContactPanel';
import { PipelineView } from './views/PipelineView';
import { DashboardView } from './views/DashboardView';
import { HistoryView } from './views/HistoryView';
import { TemplatePanel } from './views/TemplatePanel';
import { OnboardingView } from './views/OnboardingView';
import { BulkAssignView } from './views/BulkAssignView';
import { NudgesView } from './views/NudgesView';
import { MODE_CONFIG, TRANSACTION_MODES, SIDEBAR, APP_CONFIG } from '@pitchlink/shared';
import type { TransactionMode } from '@pitchlink/shared';
import { api } from '../utils/api';

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  // Check onboarding status on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await api.onboarding.getStatus() as { data: { onboarding_complete: boolean } };
        if (!result.data.onboarding_complete) {
          setShowOnboarding(true);
        }
      } catch {
        // If the check fails (e.g., not authenticated yet), skip onboarding
      } finally {
        setOnboardingChecked(true);
      }
    })();
  }, []);

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

      {/* Tabs — only show when no thread is open and not in onboarding/bulk assign */}
      {!currentThread && !showOnboarding && !showBulkAssign && (
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
        {showOnboarding && onboardingChecked ? (
          <ErrorBoundary section="onboarding-view">
            <OnboardingView
              onComplete={() => setShowOnboarding(false)}
              onSkip={() => setShowOnboarding(false)}
            />
          </ErrorBoundary>
        ) : showBulkAssign ? (
          <ErrorBoundary section="bulk-assign-view">
            <BulkAssignView
              mode={activeMode}
              onClose={() => setShowBulkAssign(false)}
            />
          </ErrorBoundary>
        ) : currentThread ? (
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
                    onBulkAssign={() => setShowBulkAssign(true)}
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
                <NudgesView mode={activeMode} />
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
