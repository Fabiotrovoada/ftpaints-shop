import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/odoo';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const debug = {
    nodeEnv: process.env.NODE_ENV,
    nextAuthSecret: process.env.NEXTAUTH_SECRET ? '[SET]' : '[UNDEFINED]',
    nextAuthUrl: process.env.NEXTAUTH_URL,
    authOptionsSecret: authOptions.secret ? '[SET]' : '[UNDEFINED]',
    authOptionsProviders: Array.isArray(authOptions.providers) ? authOptions.providers.length : 0,
    authOptionsSessionStrategy: authOptions.session?.strategy,
  };

  try {
    const result = await authenticate(email, password);
    return NextResponse.json({ success: !!result, result, debug });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      debug,
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    nextAuthSecret: process.env.NEXTAUTH_SECRET ? '[SET]' : '[UNDEFINED]',
    nextAuthUrl: process.env.NEXTAUTH_URL,
    authOptionsSecret: authOptions.secret ? '[SET]' : '[UNDEFINED]',
    authOptionsProviders: Array.isArray(authOptions.providers) ? authOptions.providers.length : 0,
  });
}
