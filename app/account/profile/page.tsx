'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Profile } from '@/types/account';

const MIN_PASSWORD = 8;

function Alert({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const styles = kind === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${styles}`}>{children}</div>;
}

export default function ProfilePage() {
  const { data: session, update } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Details form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch('/api/account/profile')
      .then(r => r.json())
      .then((d: Profile) => {
        if (!d || 'error' in d) { setLoading(false); return; }
        setProfile(d);
        setName(d.name || '');
        setPhone(d.phone || '');
        setMobile(d.mobile || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setDetailsError('');
    setDetailsSaved(false);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), mobile: mobile.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetailsError(data.error || 'Could not save your details.');
        return;
      }
      setProfile(p => (p ? { ...p, ...data } : p));
      setDetailsSaved(true);
      // Push the new name into the session so the navbar updates without a
      // re-login (handled by the `trigger === 'update'` branch in lib/auth.ts).
      if (data.name && data.name !== session?.user?.name) await update({ name: data.name });
    } catch {
      setDetailsError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordChanged(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Your new passwords do not match.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD) {
      setPasswordError(`Your new password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setChanging(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || 'Could not change your password.');
        return;
      }
      setPasswordChanged(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordError('Something went wrong. Please try again.');
    } finally {
      setChanging(false);
    }
  }

  if (loading) return <div className="card p-12 text-center text-gray-400">Loading profile...</div>;

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475] focus:border-transparent';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Profile</h1>
      <p className="text-gray-500 text-sm mb-6">Your contact details and sign-in password</p>

      <div className="space-y-6">
        {/* Your details */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-4">Your details</h2>

          {detailsError && <Alert kind="error">{detailsError}</Alert>}
          {detailsSaved && <Alert kind="success">✓ Your details have been saved.</Alert>}

          <form onSubmit={saveDetails} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" required maxLength={128} value={name}
                onChange={e => setName(e.target.value)} className={inputClass} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="024 7509 7860" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)}
                  placeholder="07700 900123" className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input type="email" value={profile?.email || session?.user?.email || ''} disabled
                className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`} />
              <p className="text-xs text-gray-400 mt-1">
                This is your sign-in address. To change it, email{' '}
                <a href="mailto:sales@ftpaints.co.uk" className="text-[#004475] font-medium hover:underline">
                  sales@ftpaints.co.uk
                </a>.
              </p>
            </div>

            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>

        {/* Account details (read-only) */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-1">Account details</h2>
          <p className="text-xs text-gray-500 mb-4">
            Held by FT Paints. Contact us to update any of these.
          </p>

          <dl className="divide-y divide-gray-100 text-sm">
            {[
              { label: 'Company', value: profile?.company },
              { label: 'Billing address', value: profile?.address },
              { label: 'VAT number', value: profile?.vat },
              { label: 'Payment terms', value: profile?.paymentTermName },
              {
                label: 'Credit limit',
                value: profile?.creditLimit ? `£${profile.creditLimit.toFixed(2)}` : null,
              },
            ].map(row => (
              <div key={row.label} className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-gray-500">{row.label}</dt>
                <dd className="text-gray-900 sm:col-span-2 mt-0.5 sm:mt-0">{row.value || '—'}</dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-gray-400 mt-4">
            Something wrong here? Email{' '}
            <a href="mailto:sales@ftpaints.co.uk" className="text-[#004475] font-medium hover:underline">
              sales@ftpaints.co.uk
            </a>{' '}
            and we&apos;ll put it right.
          </p>
        </div>

        {/* Change password */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-4">Change password</h2>

          {passwordError && <Alert kind="error">{passwordError}</Alert>}
          {passwordChanged && <Alert kind="success">✓ Your password has been changed. You&apos;ll need it next time you sign in.</Alert>}

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input type="password" required autoComplete="current-password" value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input type="password" required autoComplete="new-password" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} className={inputClass} />
              <p className={`text-xs mt-1 ${
                newPassword.length === 0 ? 'text-gray-400'
                  : newPassword.length >= MIN_PASSWORD ? 'text-green-600' : 'text-amber-600'
              }`}>
                {newPassword.length === 0
                  ? `At least ${MIN_PASSWORD} characters.`
                  : newPassword.length >= MIN_PASSWORD
                    ? '✓ Long enough'
                    : `${MIN_PASSWORD - newPassword.length} more character${MIN_PASSWORD - newPassword.length !== 1 ? 's' : ''} needed`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input type="password" required autoComplete="new-password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-xs text-amber-600 mt-1">Passwords do not match yet</p>
              )}
            </div>

            <button type="submit" disabled={changing} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
              {changing ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
