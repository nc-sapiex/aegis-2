import "server-only";

// Re-export from @/lib/prisma which has the fixed implementation
// (application-level tenant isolation, no transaction wrapping)
export { prisma, prismaForTenant } from "@/lib/prisma";
