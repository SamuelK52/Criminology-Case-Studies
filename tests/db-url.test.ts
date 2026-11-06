import { describe, expect, it } from "vitest";
import { appDatabaseUrl } from "@/lib/db";

describe("appDatabaseUrl", () => {
  it("swaps the owner credentials for caselab_app", () => {
    const url = appDatabaseUrl({
      DATABASE_URL: "postgresql://postgres:ownerpw@postgres.railway.internal:5432/railway",
      APP_DB_PASSWORD: "app pw/with:chars",
    });
    const u = new URL(url!);
    expect(u.username).toBe("caselab_app");
    expect(decodeURIComponent(u.password)).toBe("app pw/with:chars");
    expect(u.host).toBe("postgres.railway.internal:5432");
    expect(u.pathname).toBe("/railway");
    expect(url).not.toContain("ownerpw");
  });
  it("is null until both variables are set", () => {
    expect(appDatabaseUrl({ DATABASE_URL: "postgresql://a:b@h/d" })).toBeNull();
    expect(appDatabaseUrl({ APP_DB_PASSWORD: "x" })).toBeNull();
  });
  it("APP_DATABASE_URL overrides", () => {
    expect(appDatabaseUrl({ APP_DATABASE_URL: "postgresql://x@y/z" })).toBe("postgresql://x@y/z");
  });
});
