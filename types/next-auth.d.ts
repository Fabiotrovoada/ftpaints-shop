import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
      uid: number;
    };
  }

  interface User {
    uid: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: number;
  }
}
