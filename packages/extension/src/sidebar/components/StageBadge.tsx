import type { PipelineStage } from '@pitchlink/shared';

interface StageBadgeProps {
  stage: PipelineStage;
  size?: 'sm' | 'md';
}

export function StageBadge({ stage, size = 'sm' }: StageBadgeProps) {
  const fontSize = size === 'sm' ? '10px' : '12px';
  const padding = size === 'sm' ? '2px 8px' : '3px 10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        fontSize,
        fontWeight: 600,
        borderRadius: '6px',
        backgroundColor: `${stage.color}20`,
        color: stage.color,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: size === 'sm' ? '6px' : '8px',
          height: size === 'sm' ? '6px' : '8px',
          borderRadius: '50%',
          backgroundColor: stage.color,
          flexShrink: 0,
        }}
      />
      {stage.name}
    </span>
  );
}
