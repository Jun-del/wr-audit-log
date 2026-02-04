import { describe, it, expect, vi } from "vitest";
import { BatchAuditWriter } from "../../src/storage/batch-writer.js";

describe("BatchAuditWriter", () => {
  it("does not emit unhandledRejection when writes fail and not awaited", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const db = {
      execute: vi.fn().mockRejectedValue(new Error("write failed")),
    };

    const writer = new BatchAuditWriter(db as any, {
      auditTable: "audit_logs",
      batchSize: 1,
      flushInterval: 60000,
      strictMode: false,
      waitForWrite: false,
      getUserId: () => undefined,
      getMetadata: () => ({}),
    });

    await writer.queueAuditLogs(
      [
        {
          action: "INSERT",
          tableName: "test_users",
          recordId: "1",
          values: { id: 1 },
        },
      ],
      undefined,
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();

    await writer.shutdown();

    process.off("unhandledRejection", unhandled);
  });

  it("stores null metadata when merged metadata is empty", async () => {
    const executeMock = vi.fn().mockResolvedValue({ rows: [] });
    const db = {
      execute: executeMock,
    };

    const writer = new BatchAuditWriter(db as any, {
      auditTable: "audit_logs",
      batchSize: 1,
      flushInterval: 60000,
      strictMode: false,
      waitForWrite: true,
      getUserId: () => undefined,
      getMetadata: () => ({}),
    });

    await writer.queueAuditLogs(
      [
        {
          action: "INSERT",
          tableName: "test_users",
          recordId: "1",
          values: { id: 1 },
        },
      ],
      { metadata: {} },
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    const callArg = executeMock.mock.calls[0][0];
    const params = callArg?.params || callArg?.values || [];
    const paramHit = params.find((param: any) => {
      const text = typeof param === "string" ? param : JSON.stringify(param);
      return typeof text === "string" && text.includes('"metadata"');
    });
    const chunkHit = callArg?.queryChunks?.find((chunk: any) => {
      const text =
        typeof chunk === "string"
          ? chunk
          : typeof chunk?.value === "string"
            ? chunk.value
            : JSON.stringify(chunk);
      return typeof text === "string" && text.includes('"metadata"');
    });
    const jsonParam = paramHit ?? chunkHit;

    expect(jsonParam).toBeDefined();
    const text =
      typeof jsonParam === "string"
        ? jsonParam
        : typeof jsonParam?.value === "string"
          ? jsonParam.value
          : JSON.stringify(jsonParam);
    const parsed = JSON.parse(text);
    expect(parsed[0].metadata).toBeNull();

    await writer.shutdown();
  });
});
