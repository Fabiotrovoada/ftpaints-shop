import { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticate, getPartnerByUid } from './odoo';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'FTPaints Trade Portal',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const auth = await authenticate(credentials.email, credentials.password);
          if (!auth) return null;
          // Odoo login only returns ids, so fetch the partner's real name for display.
          // Fall back through res.users name → partner display name → email.
          let displayName = credentials.email;
          try {
            const u = await getPartnerByUid(auth.user_id, credentials.password);
            const partner = u?.partner_id as [number, string] | undefined;
            displayName = (u?.name as string) || (Array.isArray(partner) ? partner[1] : '') || credentials.email;
          } catch {
            // Non-fatal — keep the email as the display name if the lookup fails.
          }
          return {
            id: String(auth.user_id),
            email: credentials.email,
            name: displayName,
            uid: auth.user_id,
          };
        } catch (err) {
          console.error('Auth error:', err instanceof Error ? err.message : err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as User;
        token.uid = u.uid;
        token.email = u.email;
        token.name = u.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // pricelist loaded lazily on checkout, not at login
      }
      // Lets the profile page push a renamed partner into the session via
      // useSession().update({ name }) — without this the navbar keeps the old
      // name until the next sign-in.
      if (trigger === 'update' && typeof session?.name === 'string') {
        token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        name: token.name,
        uid: token.uid,
        // pricelist is fetched lazily on checkout page
      };
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: { strategy: 'jwt' },
};
