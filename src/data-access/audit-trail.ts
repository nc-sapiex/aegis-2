import "server-only";

import { prisma } from "@/lib/prisma";
import type { AuditLogEntry } from "@/types";
import { headers } from "next/headers";

/**
 * Audit trail filters for the CAE viewer.
 */
export interface AuditTrailFilters {
  tableName?: string;
  userId?: string;
  actionType?: string;
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result for audit trail entries.
 */
export interface AuditTrailResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get paginated audit trail entries with filters.
 *
 * DAL pattern:
 * 1. tenantId from session (passed in)
 * 2. Explicit WHERE tenantId (belt-and-suspenders, Skeptic S1)
 * 3. Runtime assertion on returned data
 *
 * @param tenantId - Tenant ID from authenticated session
 * @param filters - Optional filters for the query
 */
export async function getAuditTrailEntries(
  tenantId: string,
  filters: AuditTrailFilters = {},
): Promise<AuditTrailResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId, // Belt-and-suspenders (Skeptic S1)
  };

  if (filters.tableName) {
    where.tableName = filters.tableName;
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.actionType) {
    where.actionType = filters.actionType;
  }

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) {
      createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      // Set to end of day for inclusive range
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }
    where.createdAt = createdAt;
  }

  // Execute count and query in parallel
  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { sequenceNumber: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        sequenceNumber: true,
        tenantId: true,
        tableName: true,
        recordId: true,
        operation: true,
        actionType: true,
        oldData: true,
        newData: true,
        userId: true,
        justification: true,
        ipAddress: true,
        sessionId: true,
        retentionExpiresAt: true,
        createdAt: true,
      },
    }),
  ]);

  // Look up user names for entries that have userId
  const userIds = [
    ...new Set(entries.filter((e) => e.userId).map((e) => e.userId!)),
  ];

  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        tenantId, // Belt-and-suspenders
      },
      select: { id: true, name: true },
    });
    userMap = new Map(users.map((u) => [u.id, u.name]));
  }

  // Map entries with user names and runtime assertion
  const mappedEntries: AuditLogEntry[] = entries.map((entry) => {
    // Runtime assertion (Skeptic S1)
    if (entry.tenantId !== tenantId) {
      console.error("CRITICAL: Tenant ID mismatch in getAuditTrailEntries", {
        expected: tenantId,
        received: entry.tenantId,
      });
      throw new Error("Data isolation violation detected");
    }

    return {
      ...entry,
      userName: entry.userId ? (userMap.get(entry.userId) ?? null) : null,
    };
  });

  return {
    entries: mappedEntries,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get distinct table names for filter dropdown.
 */
export async function getAuditTableNames(tenantId: string): Promise<string[]> {
  const result = await prisma.auditLog.findMany({
    where: { tenantId },
    distinct: ["tableName"],
    select: { tableName: true },
    orderBy: { tableName: "asc" },
  });
  return result.map((r) => r.tableName);
}

/**
 * Get distinct action types for filter dropdown.
 */
export async function getAuditActionTypes(tenantId: string): Promise<string[]> {
  const result = await prisma.auditLog.findMany({
    where: {
      tenantId,
      actionType: { not: null },
    },
    distinct: ["actionType"],
    select: { actionType: true },
    orderBy: { actionType: "asc" },
  });
  return result.map((r) => r.actionType).filter((a): a is string => a !== null);
}

/**
 * Detect gaps in sequence numbers for tampering detection.
 *
 * Uses raw SQL to generate series and find missing numbers.
 * Only checks within the tenant's own sequence space.
 */
export async function detectAuditGaps(
  tenantId: string,
): Promise<{ missingSequence: bigint }[]> {
  // LIMIT 100 prevents O(max-min) work when sequence range is very large.
  // Returns first 100 gaps only — sufficient for tamper detection alerts.
  const gaps = await prisma.$queryRaw<{ missing_sequence: bigint }[]>`
    SELECT s.i AS missing_sequence
    FROM generate_series(
      (SELECT MIN("sequenceNumber") FROM "AuditLog" WHERE "tenantId" = ${tenantId}::uuid),
      (SELECT MAX("sequenceNumber") FROM "AuditLog" WHERE "tenantId" = ${tenantId}::uuid)
    ) AS s(i)
    WHERE NOT EXISTS (
      SELECT 1 FROM "AuditLog"
      WHERE "sequenceNumber" = s.i AND "tenantId" = ${tenantId}::uuid
    )
    LIMIT 100
  `;
  return gaps.map((g) => ({ missingSequence: g.missing_sequence }));
}

/**
 * Get client IP address from request headers.
 *
 * Extracts IP from X-Forwarded-For header (reverse proxy)
 * or falls back to X-Real-IP header.
 *
 * @returns IP address string or empty string
 */
export async function getClientIpAddress(): Promise<string> {
  const headersList = await headers();
  const xForwardedFor = headersList.get("x-forwarded-for");
  const xRealIp = headersList.get("x-real-ip");

  // Prefer X-Forwarded-For (reverse proxy)
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    return xForwardedFor.split(",")[0].trim();
  }

  // Fallback to X-Real-IP
  if (xRealIp) {
    return xRealIp;
  }

  return "";
}
