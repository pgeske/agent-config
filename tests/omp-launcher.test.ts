import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../dotfiles/omp/bin/omp", import.meta.url));

test("OMP launcher preserves arguments and scopes optional CA trust", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "omp-launcher-"));
  try {
    const config = join(home, "config");
    const ca = join(config, "omp", "ca.pem");
    const binary = join(home, "fake omp");
    await mkdir(join(config, "omp"), { recursive: true });
    // A shell stand-in tests launch behavior without loading a real certificate.
    await writeFile(binary, '#!/bin/bash\nprintf "%s\\n" "${NODE_EXTRA_CA_CERTS:-unset}" "$@"\n', { mode: 0o755 });
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config, OMP_BINARY: binary, NODE_EXTRA_CA_CERTS: "" };
    const run = async (caOverride = "") => (await exec("bash", [launcher, "--model", "a model"], {
      env: { ...env, NODE_EXTRA_CA_CERTS: caOverride },
    })).stdout;
    assert.equal(await run(), "unset\n--model\na model\n");
    await writeFile(ca, "test fixture");
    assert.equal(await run(), `${ca}\n--model\na model\n`);
    assert.equal(await run("existing.pem"), "existing.pem\n--model\na model\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("OMP launcher falls back to the standalone install when Homebrew is absent", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(join(tmpdir(), "omp-launcher-standalone-"));
  try {
    const data = join(home, "data");
    const binary = join(data, "omp", "bin", "omp");
    await mkdir(join(data, "omp", "bin"), { recursive: true });
    await writeFile(binary, '#!/bin/bash\nprintf "standalone %s\\n" "$@"\n', { mode: 0o755 });
    // A PATH with only system directories hides any Homebrew install on the test machine.
    const env = { HOME: home, XDG_DATA_HOME: data, PATH: "/usr/bin:/bin" };
    const { stdout } = await exec("/bin/bash", [launcher, "--version"], { env });
    assert.equal(stdout, "standalone --version\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
