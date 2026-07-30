import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveAccountPartner, getPartnerProfile, getPartnerInfo, updatePartnerProfile } from '@/lib/odoo';
import { DEMO_PROFILE } from '@/lib/demoData';
import type { Profile } from '@/types/account';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Loose on purpose — trade customers enter numbers with spaces, +44, brackets
// and extensions. This rejects obvious junk, it is not a validity check.
const PHONE_RE = /^[\d\s+()\-]{6,32}$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function formatAddress(p: Record<string, unknown>): string {
  const country = Array.isArray(p.country_id) ? (p.country_id as [number, string])[1] : '';
  return [p.street, p.street2, p.city, p.zip, country].map(str).filter(Boolean).join(', ');
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json(DEMO_PROFILE satisfies Profile);

  try {
    const { partnerId } = await resolveAccountPartner(session.user.uid);
    if (!partnerId) return NextResponse.json({ error: 'No partner record' }, { status: 404 });

    // getPartnerInfo carries the credit/terms fields too, so the overview page
    // can render profile + credit without a second round trip.
    const [profile, info] = await Promise.all([
      getPartnerProfile(partnerId),
      getPartnerInfo(session.user.uid, '', partnerId),
    ]);
    if (!profile) return NextResponse.json({ error: 'No partner record' }, { status: 404 });

    const commercial = profile.commercial_partner_id as [number, string] | false;
    const termEntry = info?.property_payment_term_id as [number, string] | false | undefined;

    const body: Profile = {
      name: str(profile.name),
      email: str(profile.email) || str(session.user.email),
      phone: str(profile.phone),
      mobile: str(profile.mobile),
      company: Array.isArray(commercial) ? commercial[1] : '',
      address: formatAddress(profile),
      vat: str(profile.vat),
      creditLimit: (info?.credit_limit as number) || 0,
      creditUsed: (info?.credit as number) || 0,
      paymentTermName: Array.isArray(termEntry) ? termEntry[1] : null,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: 'Could not load profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const input = (body ?? {}) as Record<string, unknown>;

  const updates: { name?: string; phone?: string; mobile?: string } = {};

  if ('name' in input) {
    const name = str(input.name).trim();
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    if (name.length > 128) return NextResponse.json({ error: 'Name is too long (max 128 characters)' }, { status: 400 });
    updates.name = name;
  }
  for (const field of ['phone', 'mobile'] as const) {
    if (field in input) {
      const value = str(input[field]).trim();
      if (value && !PHONE_RE.test(value)) {
        return NextResponse.json({ error: `Please enter a valid ${field} number` }, { status: 400 });
      }
      updates[field] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  if (DEMO_MODE) return NextResponse.json({ ...DEMO_PROFILE, ...updates });

  try {
    // Partner id comes from the session, never from the request body.
    const { partnerId } = await resolveAccountPartner(session.user.uid);
    if (!partnerId) return NextResponse.json({ error: 'No partner record' }, { status: 404 });

    const ok = await updatePartnerProfile(partnerId, updates);
    if (!ok) return NextResponse.json({ error: 'Could not save your details' }, { status: 502 });

    const profile = await getPartnerProfile(partnerId);
    return NextResponse.json({
      name: str(profile?.name),
      phone: str(profile?.phone),
      mobile: str(profile?.mobile),
    });
  } catch {
    return NextResponse.json({ error: 'Could not save your details' }, { status: 500 });
  }
}
