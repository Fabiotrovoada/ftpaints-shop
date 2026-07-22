import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/' },
});

export const config = {
  matcher: ['/shop/:path*', '/buy-again/:path*', '/account/:path*', '/basket/:path*', '/order/:path*'],
};
