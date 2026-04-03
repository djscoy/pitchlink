import { useState } from 'react';
import type { PipelineStage } from '@pitchlink/shared';
import { StageBadge } from './StageBadge';

interface StageSelectorProps {
  stages: PipelineStage[];
  currentStageId: string;
  onSelect: (stageId: string) => void;
}

export function StageSelector({ stages, currentStageId, onSelect }: StageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentStage = stages.find((s) => s.id === currentStageId);

  if (!currentStage) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
        title="Change stage"
      >
        <StageBadge stage={currentStage} size="md" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
            }}
          />
          {/* Dropdown */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              backgroundColor: 'var(--pl-surface-raised)',
              border: '1px solid var(--pl-border-primary)',
              borderRadius: '8px',
              boxShadow: 'var(--pl-shadow-md)',
              padding: '4px',
              zIndex: 11,
              minWidth: '160px',
            }}
          >
            {stages.map((stage) => (
              <button
                key={stage.id}
                onClick={() => {
                  onSelect(stage.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor:
                    stage.id === currentStageId ? 'var(--pl-bg-active)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--pl-text-primary)',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: stage.color,
                    flexShrink: 0,
                  }}
                />
                {stage.name}
                {stage.id === currentStageId && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--pl-text-tertiary)' }}>
                    current
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
