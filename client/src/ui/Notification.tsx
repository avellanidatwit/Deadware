export function Notification({ message, onClose, tone = 'success' }: {
  message: string; onClose: () => void; tone?: 'success' | 'error';
}) {
  if (!message) return null;
  return <aside className={`notification notification-${tone}`} aria-label="Notification">
    <span className="notification-icon" aria-hidden="true">{tone === 'error' ? '!' : '✓'}</span>
    <div className="notification-copy" role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <strong>{tone === 'error' ? 'Something went wrong' : 'Update'}</strong>
      <p>{message}</p>
    </div>
    <button type="button" className="notification-close" onClick={onClose} aria-label="Dismiss notification" title="Dismiss">×</button>
  </aside>;
}
