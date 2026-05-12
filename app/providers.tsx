'use client';
import { SessionProvider as NextAuthProvider } from 'next-auth/react';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthProvider>{children}</NextAuthProvider>;
}

export function PayPalProvider({ children }: { children: React.ReactNode }) {
  return (
    <PayPalScriptProvider
      options={{
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '',
        currency: 'GBP',
        intent: 'CAPTURE',
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}
