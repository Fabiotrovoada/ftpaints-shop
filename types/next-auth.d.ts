import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
      uid: number;
      password: string;
    };
  }

  interface User {
    uid: number;
    password: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: number;
    password: string;
  }
}
