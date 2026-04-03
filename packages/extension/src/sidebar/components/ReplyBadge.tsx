interface ReplyBadgeProps {
  hasReply: boolean;
  replyDate?: string;
}

/**
 * Small indicator badge showing that a contact has replied.
 * Shows on contact cards in the pipeline view.
 */
export function ReplyBadge({ hasReply, replyDate }: ReplyBadgeProps) {
  if (!hasReply) return null;

  const timeAgo = replyDate ? formatTimeAgo(new Date(replyDate)) : '';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        fontSize: '10px',
        fontWeight: 600,
        borderRadius: '4px',
        backgroundColor: '#DBEAFE',
        color: '#1D4ED8',
      }}
      title={replyDate ? `Replied ${timeAgo}` : 'Replied'}
    >
      <span style={{ fontSize: '9px' }}>&#8617;</span>
      Replied{timeAgo ? ` ${timeAgo}` : ''}
    </span>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
