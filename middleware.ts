import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const allowedIPs = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [];
  
  if (allowedIPs.length === 0) {
    return NextResponse.next();
  }
  
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const clientIP = forwarded 
    ? forwarded.split(',')[0].trim() 
    : realIP || '127.0.0.1';
  
  // En développement local, autoriser localhost/127.0.0.1
  const isLocalhost = ['127.0.0.1', '::1', 'localhost'].includes(clientIP) || 
                     clientIP.startsWith('::ffff:127.0.0.1');
  
  if (process.env.NODE_ENV === 'development' && isLocalhost) {
    return NextResponse.next();
  }
  
  if (!allowedIPs.includes(clientIP)) {
    return new NextResponse('Accès refusé', { status: 403 });
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};