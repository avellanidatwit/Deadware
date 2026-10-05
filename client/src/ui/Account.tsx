import { Notification } from './Notification.js';
import { useState, type FormEvent } from 'react';
import { request } from '../api/client.js';
import type { User } from '../../../shared/src/types/api.js';

type Action = 'username' | 'email' | 'password' | 'delete';
export function Account({ user, onSignedOut }: { user: User; onSignedOut: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault();
    const form = event.currentTarget, fields = new FormData(form);
    if (action === 'password' && fields.get('password') !== fields.get('repeatPassword')) { setError('The new passwords do not match.'); return; }
    const body = { currentPassword: fields.get('currentPassword'), ...(action === 'delete' ? { confirmation: fields.get('confirmation') } : { [action]: fields.get(action) }) };
    setBusy(true); setError('');
    try {
      await request(`/account/${action}`, 'POST', body);
      form.reset();
      onSignedOut(action === 'delete' ? 'Your account and owned game data have been deleted.' : 'Account updated. Please log in again with your updated details.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Account change failed.'); }
    finally { setBusy(false); }
  }
  const currentPassword = <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" minLength={12} maxLength={128} required/></label>;
  return <><div className="page-heading"><p className="eyebrow">Your profile / 03</p><h1>Account</h1><p>Manage your sign-in details.</p></div>
    <article className="guide account-settings"><p>Signed in as <strong>{user.username}</strong> ({user.email}). Changes sign you out on all devices.</p>
      <Notification message={error} tone="error" onClose={() => setError('')}/>
      <section><h2>Change username</h2><form onSubmit={event => void submit(event, 'username')}><fieldset disabled={busy}>
        <label>New username<input name="username" defaultValue={user.username} autoComplete="username" pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} required/></label>
        <p>3–32 letters, numbers or underscores.</p>{currentPassword}<button>Save username</button></fieldset></form></section>
      <section><h2>Change email</h2><form onSubmit={event => void submit(event, 'email')}><fieldset disabled={busy}>
        <label>New email<input name="email" type="email" defaultValue={user.email} autoComplete="email" maxLength={254} required/></label>
        <p>You will use this address to log in.</p>{currentPassword}<button>Save email</button></fieldset></form></section>
      <section><h2>Reset password</h2><form onSubmit={event => void submit(event, 'password')}><fieldset disabled={busy}>
        {currentPassword}<label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label>Confirm new password<input name="repeatPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <p>Use 12–128 characters.</p><button>Reset password</button></fieldset></form></section>
      <section className="danger-zone"><h2>Delete account</h2><p>This permanently removes your account, survivors, zombies, queued spawns, saved programs and script history. This cannot be undone.</p>
        <form onSubmit={event => void submit(event, 'delete')}><fieldset disabled={busy}>{currentPassword}
          <label>Type DELETE to confirm<input name="confirmation" autoComplete="off" pattern="DELETE" required/></label>
          <button className="danger-button">Permanently delete account</button></fieldset></form></section>
    </article></>;
}
