import { describe, it, expect, vi } from "vitest";
import { DEFAULT_AUDIT_COLUMN_MAP } from "../../src/storage/column-map.js";
import { extractPrimaryKey } from "../../src/utils/primary-key.js";

/**
 * Tests for critical bug fixes
 */
describe("Critical Bug Fixes", () => {
  describe("Fix #1: Race condition in batch writer", () => {
    it("should not lose logs when queueing during flush", async () => {
      // Mock setup
      const logs: any[] = [];
      const mockDb = {
        execute: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate slow write
        }),
      };

      const { BatchAuditWriter } = await import("../../src/storage/batch-writer.js");

      const writer = new BatchAuditWriter(mockDb as any, {
        auditTable: "audit_logs",
        auditColumnMap: DEFAULT_AUDIT_COLUMN_MAP,
        batchSize: 5,
        maxQueueSize: 100,
        flushInterval: 60000,
        strictMode: false,
        waitForWrite: false,
        getUserId: () => "test-user",
        getMetadata: () => ({}),
        logError: () => {},
      });

      // Queue 5 logs (triggers flush)
      const promises1 = Array.from({ length: 5 }, (_, i) =>
        writer.queueAuditLogs(
          [
            {
              action: "INSERT",
              tableName: "test",
              recordId: `${i}`,
              values: { id: i },
            },
          ],
          undefined,
        ),
      );

      // Immediately queue 3 more (during flush)
      const promises2 = Array.from({ length: 3 }, (_, i) =>
        writer.queueAuditLogs(
          [
            {
              action: "INSERT",
              tableName: "test",
              recordId: `${i + 5}`,
              values: { id: i + 5 },
            },
          ],
          undefined,
        ),
      );

      await Promise.all([...promises1, ...promises2]);
      await writer.shutdown();

      // All 8 logs should be written (2 batches: 5 + 3)
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("Fix #3: primary key serialization", () => {
    it("stringifies BigInt in composite keys", () => {
      const result = extractPrimaryKey(
        { orgId: BigInt(9007199254740991), entryId: "e1" },
        "ledger",
        { ledger: { primaryKey: ["orgId", "entryId"] } },
      );

      expect(result).toContain('"9007199254740991"');
      expect(result).toContain('"entryId":"e1"');
    });

    it('serializes circular composite key structures as "[Circular]"', () => {
      const circular: { id: number; self?: unknown } = { id: 1 };
      circular.self = circular;

      const result = extractPrimaryKey({ tenant: "acme", composite: circular }, "records", {
        records: { primaryKey: ["tenant", "composite"] },
      });

      expect(result).toContain('"self":"[Circular]"');
    });
  });

  describe("Fix #5: Error logging", () => {
    it("should log errors instead of silently swallowing them", async () => {
      const logError = vi.fn();

      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error("DB error")),
      };

      const { BatchAuditWriter } = await import("../../src/storage/batch-writer.js");

      const writer = new BatchAuditWriter(mockDb as any, {
        auditTable: "audit_logs",
        auditColumnMap: DEFAULT_AUDIT_COLUMN_MAP,
        batchSize: 5,
        maxQueueSize: 100,
        flushInterval: 60000,
        strictMode: false, // Non-strict mode
        waitForWrite: false, // Async mode
        getUserId: () => "test-user",
        getMetadata: () => ({}),
        logError,
      });

      // Queue logs
      await writer.queueAuditLogs(
        [
          {
            action: "INSERT",
            tableName: "test",
            recordId: "1",
            values: { id: 1 },
          },
        ],
        undefined,
      );

      // Trigger flush
      try {
        await writer.flush();
      } catch {
        // Expected to fail
      }

      // Error should be logged
      expect(logError).toHaveBeenCalledWith(expect.stringContaining("[AUDIT]"), expect.any(Error));
      await writer.shutdown();
    });
  });

  describe("Batch writer queue consistency", () => {
    it("should maintain correct queue size during concurrent operations", async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const { BatchAuditWriter } = await import("../../src/storage/batch-writer.js");

      const writer = new BatchAuditWriter(mockDb as any, {
        auditTable: "audit_logs",
        auditColumnMap: DEFAULT_AUDIT_COLUMN_MAP,
        batchSize: 100, // High batch size to avoid auto-flush
        maxQueueSize: 1000,
        flushInterval: 60000,
        strictMode: false,
        waitForWrite: false,
        getUserId: () => "test-user",
        getMetadata: () => ({}),
        logError: () => {},
      });

      // Queue 10 logs
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          writer.queueAuditLogs(
            [
              {
                action: "INSERT",
                tableName: "test",
                recordId: `${i}`,
                values: { id: i },
              },
            ],
            undefined,
          ),
        ),
      );

      const stats1 = writer.getStats();
      expect(stats1.queueSize).toBe(10);

      // Flush
      await writer.flush();

      const stats2 = writer.getStats();
      expect(stats2.queueSize).toBe(0);

      await writer.shutdown();
    });
  });
});
