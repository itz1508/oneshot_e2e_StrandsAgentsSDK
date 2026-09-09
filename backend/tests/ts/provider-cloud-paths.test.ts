import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePythonExecutable } from "../../python-runtime.js";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const cloud = new URL("../../../app/web/cloud/", import.meta.url).href;

test("cloud catalog and native workers resolve from a foreign working directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oneshot-cloud-paths-"));
  try {
    const script = `
      import assert from 'node:assert/strict';
      const root = ${JSON.stringify(projectRoot)};
      const base = ${JSON.stringify(cloud)};
      const { ProviderManager } = await import(base + 'provider-manager.js');
      const sample = await new ProviderManager({ projectRoot: root, mode: 'sample' }).createProvider();
      try { assert.equal((await sample.ready('cloud-sample')).ready, true); }
      finally { sample.close?.(); }
      for (const [id, name] of [['openai', 'OpenAIModelProvider'], ['anthropic', 'AnthropicModelProvider'], ['gemini', 'GeminiModelProvider']]) {
        const module = await import(base + 'provider/' + id + '/provider.js');
        const provider = new module[name](root);
        try {
          const readiness = await provider.ready('cloud-' + id);
          assert.equal(readiness.ready, true, id + ': ' + readiness.detail);
          const bundle = await provider.research({ prompt_id: 'prompt:cloud-' + id,
            intent: 'Verify provider relocation', requested_outcome: 'Return a valid research bundle',
            context: [], research_direction: ['contracts'] }, 'cloud-' + id);
          assert.equal(bundle.prompt.prompt_id, 'prompt:cloud-' + id);
        } finally { provider.close(); }
      }
      console.log('CLOUD_WORKERS_VERIFIED');
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        ONESHOT_MODE: "test",
        ONESHOT_TAVILY_MODE: "off",
        ONESHOT_TAVILY_REQUIRED: "false",
        ONESHOT_RESEARCH_EVIDENCE_FILES: "",
        ONESHOT_OPENAI_TEST_DRAFT_FILE: "app/fixtures/provider/research-draft.json",
        ONESHOT_ANTHROPIC_TEST_DRAFT_FILE: "app/fixtures/provider/research-draft.json",
        ONESHOT_GEMINI_TEST_DRAFT_FILE: "app/fixtures/provider/research-draft.json",
      },
    });
    assert.match(output, /CLOUD_WORKERS_VERIFIED/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("workspace API imports cloud clients using only the app Python import root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oneshot-cloud-python-"));
  try {
    const output = execFileSync(resolvePythonExecutable(projectRoot), ["-c",
      "from workspace_api.api import create_app; from web.cloud.workspace.providers import ModelRequest; assert callable(create_app); assert ModelRequest(messages=[]).messages == []; print('CLOUD_IMPORT_VERIFIED')",
    ], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: join(projectRoot, "app") },
    });
    assert.match(output, /CLOUD_IMPORT_VERIFIED/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
