import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware simplificado - autenticação é feita nas páginas/APIs
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Rotas públicas
  const publicRoutes = ["/login", "/register", "/api/auth", "/api/agents", "/api/knowledge"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  
  // Verifica se tem cookie de sessão
  const sessionCookie = request.cookies.get("authjs.session-token") || 
                        request.cookies.get("__Secure-authjs.session-token");
  const hasSession = !!sessionCookie;
  
  // Se não tem sessão e não é rota pública, redireciona para login
  if (!hasSession && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Se tem sessão e está em rota pública de auth, redireciona para home
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protege tudo exceto arquivos estáticos
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
