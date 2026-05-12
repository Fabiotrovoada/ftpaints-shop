import { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticate } from './odoo';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'FTPaints Trade Portal',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const auth = await authenticate(credentials.email, credentials.password);
        if (!auth) return null;
        return {
          id: String(auth.user_id),
          email: credentials.email,
          name: credentials.email,
          uid: auth.user_id,
          password: credentials.password,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as User;
        token.uid = u.uid;
        token.password = u.password;
        token.email = u.email;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // pricelist loaded lazily on checkout, not at login
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        uid: token.uid,
        password: token.password,
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
