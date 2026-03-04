import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope:
                        "openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
                    access_type: "offline",
                    prompt: "consent",
                },
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            // Auto-assign admin role on first login for seeded emails
            if (user.email && ADMIN_EMAILS.includes(user.email)) {
                const dbUser = await prisma.user.findUnique({
                    where: { email: user.email },
                });
                if (dbUser && dbUser.role !== "ADMIN") {
                    await prisma.user.update({
                        where: { email: user.email },
                        data: { role: "ADMIN" },
                    });
                }
            }
            return true;
        },
        async session({ session, user }) {
            if (session.user) {
                session.user.id = user.id;
                // Fetch role from DB
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    select: { role: true },
                });
                (session.user as any).role = dbUser?.role || "USER";
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
});
