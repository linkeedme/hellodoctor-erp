import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // tests/lint/*.test.ts spawnam `npx eslint` como subprocesso; sob a
    // concorrência de várias suítes de lint rodando junto, o cold-start
    // passa dos 5s default do vitest.
    testTimeout: 15000,
  },
});
