import { createRequire } from "node:module";
import nodemailer from "nodemailer";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

it("preserves the alert mail envelope and content through ESM and CommonJS stream transports", async () => {
  expect(require("nodemailer/package.json").version).toBe("10.0.12");
  const commonJs: typeof nodemailer = require("nodemailer");
  for (const client of [nodemailer, commonJs]) {
    const transport = client.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    try {
      const result = await transport.sendMail({
        from: "ops@example.invalid",
        to: ["admin@example.invalid"],
        subject: "Ops job needs attention",
        text: "Notification only. Backend approval is required."
      });
      expect(result.envelope).toEqual({ from: "ops@example.invalid", to: ["admin@example.invalid"] });
      expect(result.messageId).toMatch(/^<.+>$/);
      expect(Buffer.isBuffer(result.message)).toBe(true);
      const message = result.message.toString();
      expect(message).toContain("Subject: Ops job needs attention");
      expect(message).toContain("Notification only. Backend approval is required.");
    } finally {
      transport.close();
    }
  }
});
