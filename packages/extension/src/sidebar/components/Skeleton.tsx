/**
 * Skeleton loading components — loading states use skeletons, not spinners.
 */

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '16px', borderRadius = '4px', style }: SkeletonProps) {
  return (
    <div
      className="pl-skeleton"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function ContactCardSkeleton() {
  return (
    <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--pl-border-primary)' }}>
      <Skeleton width="60%" height="16px" />
      <Skeleton width="80%" height="12px" style={{ marginTop: '6px' }} />
      <Skeleton width="40%" height="12px" style={{ marginTop: '4px' }} />
      <Skeleton width="70px" height="20px" borderRadius="6px" style={{ marginTop: '10px' }} />
    </div>
  );
}

export function CampaignCardSkeleton() {
  return (
    <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--pl-border-primary)', marginBottom: '8px' }}>
      <Skeleton width="70%" height="16px" />
      <Skeleton width="100%" height="6px" borderRadius="3px" style={{ marginTop: '10px' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <Skeleton width="50px" height="12px" />
        <Skeleton width="50px" height="12px" />
      </div>
    </div>
  );
}
