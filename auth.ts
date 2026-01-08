import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt", // Usar JWT para suportar credentials
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        console.log('[AUTH DEBUG] User found:', user ? 'YES' : 'NO');
        console.log('[AUTH DEBUG] Has password:', user?.password ? 'YES' : 'NO');
        console.log('[AUTH DEBUG] DB hash:', user?.password);
        console.log('[AUTH DEBUG] Input password:', password);

        if (!user || !user.password) {
          console.log('[AUTH DEBUG] Returning null - no user or password');
          return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log('[AUTH DEBUG] Password valid:', isValidPassword);
        
        if (!isValidPassword) {
          console.log('[AUTH DEBUG] Returning null - invalid password');
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
          forcePasswordChange: user.forcePasswordChange,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role || "USER";
        token.forcePasswordChange = (user as { forcePasswordChange?: boolean }).forcePasswordChange || false;
      }

      // Permite atualizar o token quando a sessão é atualizada (ex: após trocar senha)
      if (trigger === "update") {
        // Busca dados atualizados do banco
        const updatedUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { forcePasswordChange: true, role: true }
        });
        if (updatedUser) {
          token.forcePasswordChange = updatedUser.forcePasswordChange;
          token.role = updatedUser.role;
        }

        // Se houver dados manuais passados no update({ ... })
        if (session) {
          if (session.name) token.name = session.name;
          if (session.email) token.email = session.email;
          if (session.image) token.image = session.image;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.forcePasswordChange = token.forcePasswordChange as boolean;
      }
      return session;
    },
  },
});
