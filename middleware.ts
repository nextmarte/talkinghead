import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware simplificado - autenticação é feita nas páginas/APIs
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Rotas públicas - não requerem autenticação
  // /api/agents é público para o backend poder buscar dados dos agentes
  const publicPaths = ["/login", "/register", "/api/auth", "/api/agents", "/_next", "/favicon.ico"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));
  
  // Assets estáticos
  if (pathname.includes(".") || isPublicPath) {
    return NextResponse.next();
  }
  
  // Verifica se tem cookie de sessão (vários nomes possíveis dependendo do ambiente)
  const cookies = request.cookies;
  const hasSession = cookies.has("authjs.session-token") || 
                     cookies.has("__Secure-authjs.session-token") ||
                     cookies.has("next-auth.session-token") ||
                     cookies.has("__Secure-next-auth.session-token");
  
  // Se não tem sessão e não é rota pública, redireciona para login
  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Evita loop: só adiciona callbackUrl se não for o próprio login
    if (pathname !== "/" && pathname !== "/login") {
      url.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(url);
  }
  
  // Se tem sessão e está em login/register, redireciona para home
  // Mas só se não veio de um redirect (evita loop)
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = ""; // Remove query params
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protege rotas, mas exclui arquivos estáticos
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
