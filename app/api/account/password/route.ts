import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { authenticate, changeUserPassword } from '@/lib/odoo';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

const MIN_LENGTH = 8;

// Verifying the current password makes this endpoint a password oracle, so it
// gets its own limiter. Same in-memory Map idiom as lib/cache.ts — good enough
// for a single-instance deployment; it resets on redeploy.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<number, { count: number; resetAt: number }>();

function tooManyAttempts(uid: number): boolean {
  const entry = attempts.get(uid);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(uid: number): void {
  const entry = attempts.get(uid);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(uid, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const { currentPassword, newPassword } = (body ?? {}) as Record<string, unknown>;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 });
  }
  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json({ error: `New password must be at least ${MIN_LENGTH} characters` }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'New password must be different from your current one' }, { status: 400 });
  }

  const uid = session.user.uid;
  if (tooManyAttempts(uid)) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Please try again in 15 minutes.' },
      { status: 429 }
    );
  }

  if (DEMO_MODE) return NextResponse.json({ ok: true });

  try {
    // authenticate() resolves the login itself, so also confirm it resolved to
    // *this* session's user before trusting it as proof of the old password.
    const verified = await authenticate(session.user.email ?? '', currentPassword);
    if (!verified || verified.user_id !== uid) {
      recordFailure(uid);
      return NextResponse.json({ error: 'Your current password is incorrect' }, { status: 400 });
    }

    const ok = await changeUserPassword(uid, newPassword);
    if (!ok) return NextResponse.json({ error: 'Could not change your password' }, { status: 502 });

    attempts.delete(uid);
    // The NextAuth JWT never held the password, so the session stays valid.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not change your password' }, { status: 500 });
  }
}
