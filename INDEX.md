# Repository index

A navigable inventory of the files in this repository. Select a section, then expand its file list. Generated build output and local runtime data are not listed.

[Back to README](README.md)

## Sections

| Section | What is available | Files |
| --- | --- | ---: |
| [Root and repository guidance](#root-and-repository-guidance) | Project entrypoints, package manifests, configuration, and contributor guidance. | 13 |
| [Web application](#web-application) | Next.js routes, components, browser API clients, and web build scripts. | 29 |
| [Reference console](#reference-console) | Retained HTML, CSS, and JavaScript console files. | 20 |
| [Provider integrations](#provider-integrations) | Provider manager, adapters, configuration, credential stores, and Python workers. | 32 |
| [Workspace API](#workspace-api) | Standalone workspace service, models, authentication, and API checks. | 19 |
| [Application support](#application-support) | Bootstrap, packaging tools, fixtures, dependency requirements, and bundled assets. | 31 |
| [Workflow agents](#workflow-agents) | Agent operating instructions, workflows, and agent-owned tools. | 28 |
| [Pipeline and workflow](#pipeline-and-workflow) | Stage queues, durable checkpoints, recovery, transitions, and Strands graph nodes. | 32 |
| [Runtime and HTTP server](#runtime-and-http-server) | Run state, artifact storage, human review gates, HTTP handlers, and workspace access. | 15 |
| [Contracts and validation](#contracts-and-validation) | JSON schemas, contract representations, deterministic validators, and hashing. | 51 |
| [Skills and sandbox](#skills-and-sandbox) | Reusable skill bindings and governed execution services. | 37 |
| [Python backend service](#python-backend-service) | Standalone Python service and its own package, container, and tests. | 12 |
| [Backend support](#backend-support) | Intent, task management, graph projections, shared utilities, and backend entrypoints. | 30 |
| [Tests and browser checks](#tests-and-browser-checks) | Backend/frontend test suites and browser automation scripts. | 89 |
| [Launchers and operations](#launchers-and-operations) | Installers, bootstrap, deployment, health probes, and repository maintenance. | 31 |
| [Containers](#containers) | Dockerfiles, Compose configurations, and container documentation. | 7 |
| [Documentation and evidence](#documentation-and-evidence) | Product requirements, workflow documents, handoffs, notices, and recorded evidence. | 15 |
| [Automation and agent metadata](#automation-and-agent-metadata) | GitHub workflows, repository rules, and agent skills. | 4 |

## Root and repository guidance

Project entrypoints, package manifests, configuration, and contributor guidance.

<details>
<summary>Browse 13 files</summary>

- [.dockerignore](.dockerignore)
- [.gitattributes](.gitattributes)
- [.gitignore](.gitignore)
- [AGENTS.md](AGENTS.md)
- [INDEX.md](INDEX.md)
- [LICENSE](LICENSE)
- [MANIFEST.sha256](MANIFEST.sha256)
- [README.md](README.md)
- [package-lock.json](package-lock.json)
- [package.json](package.json)
- [start-web.ps1](start-web.ps1)
- [tsconfig.json](tsconfig.json)
- [tsconfig.test.json](tsconfig.test.json)

</details>

## Web application

Next.js routes, components, browser API clients, and web build scripts.

<details>
<summary>Browse 29 files</summary>

- [app/web/.gitignore](app/web/.gitignore)
- [app/web/AGENTS.md](app/web/AGENTS.md)
- [app/web/MANIFEST.json](app/web/MANIFEST.json)
- [app/web/README.md](app/web/README.md)
- [app/web/__init__.py](app/web/__init__.py)
- [app/web/app/globals.css](app/web/app/globals.css)
- [app/web/app/layout.tsx](app/web/app/layout.tsx)
- [app/web/app/page.tsx](app/web/app/page.tsx)
- [app/web/components/file-browser.tsx](app/web/components/file-browser.tsx)
- [app/web/components/icon.tsx](app/web/components/icon.tsx)
- [app/web/components/modal.tsx](app/web/components/modal.tsx)
- [app/web/components/review-cards.tsx](app/web/components/review-cards.tsx)
- [app/web/components/workspace.tsx](app/web/components/workspace.tsx)
- [app/web/lib/api.ts](app/web/lib/api.ts)
- [app/web/lib/contracts.ts](app/web/lib/contracts.ts)
- [app/web/lib/event-stream.ts](app/web/lib/event-stream.ts)
- [app/web/lib/http-client.ts](app/web/lib/http-client.ts)
- [app/web/lib/projections.ts](app/web/lib/projections.ts)
- [app/web/next-env.d.ts](app/web/next-env.d.ts)
- [app/web/next.config.mjs](app/web/next.config.mjs)
- [app/web/package-lock.json](app/web/package-lock.json)
- [app/web/package.json](app/web/package.json)
- [app/web/postcss.config.mjs](app/web/postcss.config.mjs)
- [app/web/scripts/build.mjs](app/web/scripts/build.mjs)
- [app/web/scripts/check.mjs](app/web/scripts/check.mjs)
- [app/web/scripts/export.mjs](app/web/scripts/export.mjs)
- [app/web/scripts/serve.mjs](app/web/scripts/serve.mjs)
- [app/web/tsconfig.json](app/web/tsconfig.json)
- [app/web/vite.config.js](app/web/vite.config.js)

</details>

## Reference console

Retained HTML, CSS, and JavaScript console files.

<details>
<summary>Browse 20 files</summary>

- [app/web/src/active-run-panel.js](app/web/src/active-run-panel.js)
- [app/web/src/app.js](app/web/src/app.js)
- [app/web/src/backend.css](app/web/src/backend.css)
- [app/web/src/console-interactions.js](app/web/src/console-interactions.js)
- [app/web/src/human-gates.js](app/web/src/human-gates.js)
- [app/web/src/index.html](app/web/src/index.html)
- [app/web/src/job-history.js](app/web/src/job-history.js)
- [app/web/src/live-activity.js](app/web/src/live-activity.js)
- [app/web/src/oneshot-v8.css](app/web/src/oneshot-v8.css)
- [app/web/src/oneshot-v8.html](app/web/src/oneshot-v8.html)
- [app/web/src/oneshot-v8.js](app/web/src/oneshot-v8.js)
- [app/web/src/providers-panel.js](app/web/src/providers-panel.js)
- [app/web/src/run-atmosphere.js](app/web/src/run-atmosphere.js)
- [app/web/src/runtime-view-state.js](app/web/src/runtime-view-state.js)
- [app/web/src/styles.css](app/web/src/styles.css)
- [app/web/src/task-management.js](app/web/src/task-management.js)
- [app/web/src/terminal-message.js](app/web/src/terminal-message.js)
- [app/web/src/visual-settings.js](app/web/src/visual-settings.js)
- [app/web/src/workflow-trace-panel.js](app/web/src/workflow-trace-panel.js)
- [app/web/src/workflow-trace.js](app/web/src/workflow-trace.js)

</details>

## Provider integrations

Provider manager, adapters, configuration, credential stores, and Python workers.

<details>
<summary>Browse 32 files</summary>

- [app/web/cloud/README.md](app/web/cloud/README.md)
- [app/web/cloud/__init__.py](app/web/cloud/__init__.py)
- [app/web/cloud/provider-manager.ts](app/web/cloud/provider-manager.ts)
- [app/web/cloud/provider-resolver.ts](app/web/cloud/provider-resolver.ts)
- [app/web/cloud/provider-runtime-config.ts](app/web/cloud/provider-runtime-config.ts)
- [app/web/cloud/provider-secret-store.ts](app/web/cloud/provider-secret-store.ts)
- [app/web/cloud/provider.ts](app/web/cloud/provider.ts)
- [app/web/cloud/provider/_worker_common.py](app/web/cloud/provider/_worker_common.py)
- [app/web/cloud/provider/anthropic/provider.ts](app/web/cloud/provider/anthropic/provider.ts)
- [app/web/cloud/provider/anthropic/types.ts](app/web/cloud/provider/anthropic/types.ts)
- [app/web/cloud/provider/anthropic/worker-bridge.ts](app/web/cloud/provider/anthropic/worker-bridge.ts)
- [app/web/cloud/provider/featherless/provider.ts](app/web/cloud/provider/featherless/provider.ts)
- [app/web/cloud/provider/featherless/types.ts](app/web/cloud/provider/featherless/types.ts)
- [app/web/cloud/provider/featherless/worker-bridge.ts](app/web/cloud/provider/featherless/worker-bridge.ts)
- [app/web/cloud/provider/featherless/worker.py](app/web/cloud/provider/featherless/worker.py)
- [app/web/cloud/provider/fixture-provider.ts](app/web/cloud/provider/fixture-provider.ts)
- [app/web/cloud/provider/gemini/provider.ts](app/web/cloud/provider/gemini/provider.ts)
- [app/web/cloud/provider/gemini/types.ts](app/web/cloud/provider/gemini/types.ts)
- [app/web/cloud/provider/gemini/worker-bridge.ts](app/web/cloud/provider/gemini/worker-bridge.ts)
- [app/web/cloud/provider/native_worker.py](app/web/cloud/provider/native_worker.py)
- [app/web/cloud/provider/openai/provider.ts](app/web/cloud/provider/openai/provider.ts)
- [app/web/cloud/provider/openai/types.ts](app/web/cloud/provider/openai/types.ts)
- [app/web/cloud/provider/openai/worker-bridge.ts](app/web/cloud/provider/openai/worker-bridge.ts)
- [app/web/cloud/provider/shared/env.ts](app/web/cloud/provider/shared/env.ts)
- [app/web/cloud/provider/shared/registry.ts](app/web/cloud/provider/shared/registry.ts)
- [app/web/cloud/provider/shared/research-provider.ts](app/web/cloud/provider/shared/research-provider.ts)
- [app/web/cloud/provider/shared/types.ts](app/web/cloud/provider/shared/types.ts)
- [app/web/cloud/provider/shared/worker-bridge.ts](app/web/cloud/provider/shared/worker-bridge.ts)
- [app/web/cloud/provider/structured-draft.ts](app/web/cloud/provider/structured-draft.ts)
- [app/web/cloud/providers.json](app/web/cloud/providers.json)
- [app/web/cloud/workspace/__init__.py](app/web/cloud/workspace/__init__.py)
- [app/web/cloud/workspace/providers.py](app/web/cloud/workspace/providers.py)

</details>

## Workspace API

Standalone workspace service, models, authentication, and API checks.

<details>
<summary>Browse 19 files</summary>

- [app/workspace_api/__init__.py](app/workspace_api/__init__.py)
- [app/workspace_api/api.py](app/workspace_api/api.py)
- [app/workspace_api/auth.py](app/workspace_api/auth.py)
- [app/workspace_api/chat.py](app/workspace_api/chat.py)
- [app/workspace_api/config.py](app/workspace_api/config.py)
- [app/workspace_api/database.py](app/workspace_api/database.py)
- [app/workspace_api/errors.py](app/workspace_api/errors.py)
- [app/workspace_api/main.py](app/workspace_api/main.py)
- [app/workspace_api/models.py](app/workspace_api/models.py)
- [app/workspace_api/observability.py](app/workspace_api/observability.py)
- [app/workspace_api/rate_limit.py](app/workspace_api/rate_limit.py)
- [app/workspace_api/router.py](app/workspace_api/router.py)
- [app/workspace_api/schemas.py](app/workspace_api/schemas.py)
- [app/workspace_api/scripts/verify.py](app/workspace_api/scripts/verify.py)
- [app/workspace_api/security.py](app/workspace_api/security.py)
- [app/workspace_api/services.py](app/workspace_api/services.py)
- [app/workspace_api/tests/__init__.py](app/workspace_api/tests/__init__.py)
- [app/workspace_api/tests/test_workspace_api.py](app/workspace_api/tests/test_workspace_api.py)
- [app/workspace_api/usage.py](app/workspace_api/usage.py)

</details>

## Application support

Bootstrap, packaging tools, fixtures, dependency requirements, and bundled assets.

<details>
<summary>Browse 31 files</summary>

- [app/bootstrap/demo.mjs](app/bootstrap/demo.mjs)
- [app/bootstrap/readme.ts](app/bootstrap/readme.ts)
- [app/bootstrap/setup.bat](app/bootstrap/setup.bat)
- [app/bootstrap/setup.sh](app/bootstrap/setup.sh)
- [app/deploy/docker/Dockerfile.sandbox](app/deploy/docker/Dockerfile.sandbox)
- [app/deploy/docker/docker-compose.gpu.yml](app/deploy/docker/docker-compose.gpu.yml)
- [app/deploy/docker/docker-compose.local-ai.yml](app/deploy/docker/docker-compose.local-ai.yml)
- [app/deploy/docker/docker-compose.sandbox.yml](app/deploy/docker/docker-compose.sandbox.yml)
- [app/env/.env.example](app/env/.env.example)
- [app/fixtures/e2e/complete-004.json](app/fixtures/e2e/complete-004.json)
- [app/fixtures/e2e/complete-005.json](app/fixtures/e2e/complete-005.json)
- [app/fixtures/e2e/complete-006.json](app/fixtures/e2e/complete-006.json)
- [app/fixtures/e2e/complete-007.json](app/fixtures/e2e/complete-007.json)
- [app/fixtures/e2e/complete-success.json](app/fixtures/e2e/complete-success.json)
- [app/fixtures/fixture-suite.json](app/fixtures/fixture-suite.json)
- [app/fixtures/product/complete-success-seed.json](app/fixtures/product/complete-success-seed.json)
- [app/fixtures/provider/research-draft.json](app/fixtures/provider/research-draft.json)
- [app/legal/third-party/Strands-Agents-Apache-2.0.txt](app/legal/third-party/Strands-Agents-Apache-2.0.txt)
- [app/requirements/base.txt](app/requirements/base.txt)
- [app/requirements/featherless.txt](app/requirements/featherless.txt)
- [app/requirements/workspace-api.txt](app/requirements/workspace-api.txt)
- [app/scripts/bootstrap.py](app/scripts/bootstrap.py)
- [app/scripts/build_deterministic_zip.py](app/scripts/build_deterministic_zip.py)
- [app/scripts/generate_manifest.py](app/scripts/generate_manifest.py)
- [app/scripts/source_file_policy.py](app/scripts/source_file_policy.py)
- [app/scripts/verify_all.py](app/scripts/verify_all.py)
- [app/scripts/verify_dependencies.py](app/scripts/verify_dependencies.py)
- [app/scripts/verify_manifest.py](app/scripts/verify_manifest.py)
- [app/vendor/npm/types-node-24.0.4.tgz](app/vendor/npm/types-node-24.0.4.tgz)
- [app/vendor/npm/typescript-5.8.3.tgz](app/vendor/npm/typescript-5.8.3.tgz)
- [app/vendor/npm/undici-types-7.8.0.tgz](app/vendor/npm/undici-types-7.8.0.tgz)

</details>

## Workflow agents

Agent operating instructions, workflows, and agent-owned tools.

<details>
<summary>Browse 28 files</summary>

- [backend/agents/builder/SKILL.md](backend/agents/builder/SKILL.md)
- [backend/agents/builder/agent.ts](backend/agents/builder/agent.ts)
- [backend/agents/builder/workflow.ts](backend/agents/builder/workflow.ts)
- [backend/agents/evaluation/SKILL.md](backend/agents/evaluation/SKILL.md)
- [backend/agents/evaluation/agent.ts](backend/agents/evaluation/agent.ts)
- [backend/agents/evaluation/tool/evaluate-plan.ts](backend/agents/evaluation/tool/evaluate-plan.ts)
- [backend/agents/evaluation/workflow.ts](backend/agents/evaluation/workflow.ts)
- [backend/agents/gap-analysis/SKILL.md](backend/agents/gap-analysis/SKILL.md)
- [backend/agents/gap-analysis/agent.ts](backend/agents/gap-analysis/agent.ts)
- [backend/agents/gap-analysis/tool/coverage.ts](backend/agents/gap-analysis/tool/coverage.ts)
- [backend/agents/gap-analysis/tool/validation-feedback.ts](backend/agents/gap-analysis/tool/validation-feedback.ts)
- [backend/agents/gap-analysis/workflow.ts](backend/agents/gap-analysis/workflow.ts)
- [backend/agents/planner/SKILL.md](backend/agents/planner/SKILL.md)
- [backend/agents/planner/agent.ts](backend/agents/planner/agent.ts)
- [backend/agents/planner/tool/coverage.ts](backend/agents/planner/tool/coverage.ts)
- [backend/agents/planner/workflow.ts](backend/agents/planner/workflow.ts)
- [backend/agents/refactor/SKILL.md](backend/agents/refactor/SKILL.md)
- [backend/agents/refactor/agent.ts](backend/agents/refactor/agent.ts)
- [backend/agents/refactor/tool/apply-audit.ts](backend/agents/refactor/tool/apply-audit.ts)
- [backend/agents/refactor/workflow.ts](backend/agents/refactor/workflow.ts)
- [backend/agents/researcher/SKILL.md](backend/agents/researcher/SKILL.md)
- [backend/agents/researcher/agent.ts](backend/agents/researcher/agent.ts)
- [backend/agents/researcher/tool/evidence/collector.ts](backend/agents/researcher/tool/evidence/collector.ts)
- [backend/agents/researcher/tool/registry.ts](backend/agents/researcher/tool/registry.ts)
- [backend/agents/researcher/tool/tavily/bridge.ts](backend/agents/researcher/tool/tavily/bridge.ts)
- [backend/agents/researcher/tool/tavily/evidence.ts](backend/agents/researcher/tool/tavily/evidence.ts)
- [backend/agents/researcher/tool/tavily/worker.py](backend/agents/researcher/tool/tavily/worker.py)
- [backend/agents/researcher/workflow.ts](backend/agents/researcher/workflow.ts)

</details>

## Pipeline and workflow

Stage queues, durable checkpoints, recovery, transitions, and Strands graph nodes.

<details>
<summary>Browse 32 files</summary>

- [backend/pipeline/agent-pipeline.ts](backend/pipeline/agent-pipeline.ts)
- [backend/pipeline/apply-transition.ts](backend/pipeline/apply-transition.ts)
- [backend/pipeline/bootstrap.ts](backend/pipeline/bootstrap.ts)
- [backend/pipeline/checkpoints.ts](backend/pipeline/checkpoints.ts)
- [backend/pipeline/confirm-plan.ts](backend/pipeline/confirm-plan.ts)
- [backend/pipeline/context.ts](backend/pipeline/context.ts)
- [backend/pipeline/events.ts](backend/pipeline/events.ts)
- [backend/pipeline/fault-controller.ts](backend/pipeline/fault-controller.ts)
- [backend/pipeline/faults.ts](backend/pipeline/faults.ts)
- [backend/pipeline/history.ts](backend/pipeline/history.ts)
- [backend/pipeline/idempotency.ts](backend/pipeline/idempotency.ts)
- [backend/pipeline/index.ts](backend/pipeline/index.ts)
- [backend/pipeline/processors.ts](backend/pipeline/processors.ts)
- [backend/pipeline/queue.ts](backend/pipeline/queue.ts)
- [backend/pipeline/reconcile.ts](backend/pipeline/reconcile.ts)
- [backend/pipeline/run-stage.ts](backend/pipeline/run-stage.ts)
- [backend/pipeline/stage-outcome.ts](backend/pipeline/stage-outcome.ts)
- [backend/pipeline/stage-scope.ts](backend/pipeline/stage-scope.ts)
- [backend/pipeline/transition-services.ts](backend/pipeline/transition-services.ts)
- [backend/pipeline/types.ts](backend/pipeline/types.ts)
- [backend/pipeline/worker.ts](backend/pipeline/worker.ts)
- [backend/workflow/strands/canonical-workflow.ts](backend/workflow/strands/canonical-workflow.ts)
- [backend/workflow/strands/dependencies.ts](backend/workflow/strands/dependencies.ts)
- [backend/workflow/strands/gap-graph.ts](backend/workflow/strands/gap-graph.ts)
- [backend/workflow/strands/proof-graph.ts](backend/workflow/strands/proof-graph.ts)
- [backend/workflow/strands/stage-node.ts](backend/workflow/strands/stage-node.ts)
- [backend/workflow/strands/state.ts](backend/workflow/strands/state.ts)
- [backend/workflow/canonical-transition.ts](backend/workflow/canonical-transition.ts)
- [backend/workflow/confirmation.ts](backend/workflow/confirmation.ts)
- [backend/workflow/graph.json](backend/workflow/graph.json)
- [backend/workflow/hash.ts](backend/workflow/hash.ts)
- [backend/workflow/triple-validation.ts](backend/workflow/triple-validation.ts)

</details>

## Runtime and HTTP server

Run state, artifact storage, human review gates, HTTP handlers, and workspace access.

<details>
<summary>Browse 15 files</summary>

- [backend/runtime/artifact-store.ts](backend/runtime/artifact-store.ts)
- [backend/runtime/build-review.ts](backend/runtime/build-review.ts)
- [backend/runtime/event-bus.ts](backend/runtime/event-bus.ts)
- [backend/runtime/plan-review.ts](backend/runtime/plan-review.ts)
- [backend/runtime/queue.ts](backend/runtime/queue.ts)
- [backend/runtime/redis-connection.ts](backend/runtime/redis-connection.ts)
- [backend/runtime/run-repository.ts](backend/runtime/run-repository.ts)
- [backend/runtime/runtime-config.ts](backend/runtime/runtime-config.ts)
- [backend/runtime/target-workspace.ts](backend/runtime/target-workspace.ts)
- [backend/runtime/workflow-runtime.ts](backend/runtime/workflow-runtime.ts)
- [backend/server/http-response.ts](backend/server/http-response.ts)
- [backend/server/http-security.ts](backend/server/http-security.ts)
- [backend/server/http-server.ts](backend/server/http-server.ts)
- [backend/server/workspace-inspection.ts](backend/server/workspace-inspection.ts)
- [backend/server/workspace-path-policy.ts](backend/server/workspace-path-policy.ts)

</details>

## Contracts and validation

JSON schemas, contract representations, deterministic validators, and hashing.

<details>
<summary>Browse 51 files</summary>

- [backend/contracts/schema/types.ts](backend/contracts/schema/types.ts)
- [backend/schema/README.md](backend/schema/README.md)
- [backend/schema/audit.schema.json](backend/schema/audit.schema.json)
- [backend/schema/build-review-action.schema.json](backend/schema/build-review-action.schema.json)
- [backend/schema/common.schema.json](backend/schema/common.schema.json)
- [backend/schema/confirmed-package.schema.json](backend/schema/confirmed-package.schema.json)
- [backend/schema/contract-registry.json](backend/schema/contract-registry.json)
- [backend/schema/contract-registry.schema.json](backend/schema/contract-registry.schema.json)
- [backend/schema/evaluation.schema.json](backend/schema/evaluation.schema.json)
- [backend/schema/execution-evidence.schema.json](backend/schema/execution-evidence.schema.json)
- [backend/schema/fixture-validation.schema.json](backend/schema/fixture-validation.schema.json)
- [backend/schema/fixture.schema.json](backend/schema/fixture.schema.json)
- [backend/schema/gap.schema.json](backend/schema/gap.schema.json)
- [backend/schema/goal-validation.schema.json](backend/schema/goal-validation.schema.json)
- [backend/schema/goal.schema.json](backend/schema/goal.schema.json)
- [backend/schema/hash-proof.schema.json](backend/schema/hash-proof.schema.json)
- [backend/schema/plan.schema.json](backend/schema/plan.schema.json)
- [backend/schema/processing-event.schema.json](backend/schema/processing-event.schema.json)
- [backend/schema/prompt.schema.json](backend/schema/prompt.schema.json)
- [backend/schema/reasoning/fixtures/invalid-request-missing-goal.json](backend/schema/reasoning/fixtures/invalid-request-missing-goal.json)
- [backend/schema/reasoning/fixtures/invalid-response-confidence.json](backend/schema/reasoning/fixtures/invalid-response-confidence.json)
- [backend/schema/reasoning/fixtures/valid-request.json](backend/schema/reasoning/fixtures/valid-request.json)
- [backend/schema/reasoning/fixtures/valid-response.json](backend/schema/reasoning/fixtures/valid-response.json)
- [backend/schema/reasoning/request.schema.json](backend/schema/reasoning/request.schema.json)
- [backend/schema/reasoning/response.schema.json](backend/schema/reasoning/response.schema.json)
- [backend/schema/researcher.schema.json](backend/schema/researcher.schema.json)
- [backend/schema/run-snapshot.schema.json](backend/schema/run-snapshot.schema.json)
- [backend/schema/sandbox-execution.schema.json](backend/schema/sandbox-execution.schema.json)
- [backend/schema/schema-artifact.schema.json](backend/schema/schema-artifact.schema.json)
- [backend/schema/schema-validation.schema.json](backend/schema/schema-validation.schema.json)
- [backend/schema/triple-validation.schema.json](backend/schema/triple-validation.schema.json)
- [backend/schema/validation.schema.json](backend/schema/validation.schema.json)
- [backend/schema/workflow-graph.schema.json](backend/schema/workflow-graph.schema.json)
- [backend/validation/deterministic-validation.ts](backend/validation/deterministic-validation.ts)
- [backend/validation/python-bridge.ts](backend/validation/python-bridge.ts)
- [backend/validation/python/validation/__init__.py](backend/validation/python/validation/__init__.py)
- [backend/validation/python/validation/artifact_resolver.py](backend/validation/python/validation/artifact_resolver.py)
- [backend/validation/python/validation/canonicalize.py](backend/validation/python/validation/canonicalize.py)
- [backend/validation/python/validation/cli.py](backend/validation/python/validation/cli.py)
- [backend/validation/python/validation/evaluation.py](backend/validation/python/validation/evaluation.py)
- [backend/validation/python/validation/fixture_runner.py](backend/validation/python/validation/fixture_runner.py)
- [backend/validation/python/validation/graph_validator.py](backend/validation/python/validation/graph_validator.py)
- [backend/validation/python/validation/hash_proof.py](backend/validation/python/validation/hash_proof.py)
- [backend/validation/python/validation/models.py](backend/validation/python/validation/models.py)
- [backend/validation/python/validation/parity.py](backend/validation/python/validation/parity.py)
- [backend/validation/python/validation/reference_validator.py](backend/validation/python/validation/reference_validator.py)
- [backend/validation/python/validation/registry.py](backend/validation/python/validation/registry.py)
- [backend/validation/python/validation/rpc.py](backend/validation/python/validation/rpc.py)
- [backend/validation/python/validation/schema_validator.py](backend/validation/python/validation/schema_validator.py)
- [backend/validation/python/validation/triple_validation.py](backend/validation/python/validation/triple_validation.py)
- [backend/validation/validation-lane-pool.ts](backend/validation/validation-lane-pool.ts)

</details>

## Skills and sandbox

Reusable skill bindings and governed execution services.

<details>
<summary>Browse 37 files</summary>

- [backend/sandbox/admission.ts](backend/sandbox/admission.ts)
- [backend/sandbox/graph/sandbox-graph.ts](backend/sandbox/graph/sandbox-graph.ts)
- [backend/sandbox/runner/container-runner.ts](backend/sandbox/runner/container-runner.ts)
- [backend/sandbox/runner/process-runner.ts](backend/sandbox/runner/process-runner.ts)
- [backend/sandbox/runner/runner.ts](backend/sandbox/runner/runner.ts)
- [backend/sandbox/sandbox-service.ts](backend/sandbox/sandbox-service.ts)
- [backend/sandbox/types.ts](backend/sandbox/types.ts)
- [backend/skills/activation.ts](backend/skills/activation.ts)
- [backend/skills/bootstrap.ts](backend/skills/bootstrap.ts)
- [backend/skills/canonical-contract-skill.ts](backend/skills/canonical-contract-skill.ts)
- [backend/skills/catalog.ts](backend/skills/catalog.ts)
- [backend/skills/init-skill.ts](backend/skills/init-skill.ts)
- [backend/skills/init/SKILL.md](backend/skills/init/SKILL.md)
- [backend/skills/intent-collection-skill.ts](backend/skills/intent-collection-skill.ts)
- [backend/skills/oneshot-canonical-contracts/SKILL.md](backend/skills/oneshot-canonical-contracts/SKILL.md)
- [backend/skills/oneshot-canonical-contracts/scripts/_invoke.py](backend/skills/oneshot-canonical-contracts/scripts/_invoke.py)
- [backend/skills/oneshot-canonical-contracts/scripts/canonicalize.py](backend/skills/oneshot-canonical-contracts/scripts/canonicalize.py)
- [backend/skills/oneshot-canonical-contracts/scripts/create_hash.py](backend/skills/oneshot-canonical-contracts/scripts/create_hash.py)
- [backend/skills/oneshot-canonical-contracts/scripts/resolve_artifact.py](backend/skills/oneshot-canonical-contracts/scripts/resolve_artifact.py)
- [backend/skills/oneshot-canonical-contracts/scripts/run_fixture.py](backend/skills/oneshot-canonical-contracts/scripts/run_fixture.py)
- [backend/skills/oneshot-canonical-contracts/scripts/trace_artifact.py](backend/skills/oneshot-canonical-contracts/scripts/trace_artifact.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_artifact.py](backend/skills/oneshot-canonical-contracts/scripts/validate_artifact.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_graph.py](backend/skills/oneshot-canonical-contracts/scripts/validate_graph.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_parity.py](backend/skills/oneshot-canonical-contracts/scripts/validate_parity.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_references.py](backend/skills/oneshot-canonical-contracts/scripts/validate_references.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_registry.py](backend/skills/oneshot-canonical-contracts/scripts/validate_registry.py)
- [backend/skills/oneshot-canonical-contracts/scripts/validate_schema.py](backend/skills/oneshot-canonical-contracts/scripts/validate_schema.py)
- [backend/skills/oneshot-canonical-contracts/scripts/verify_hash.py](backend/skills/oneshot-canonical-contracts/scripts/verify_hash.py)
- [backend/skills/oneshot-canonical-contracts/tool/registry.py](backend/skills/oneshot-canonical-contracts/tool/registry.py)
- [backend/skills/oneshot-intent-collection/SKILL.md](backend/skills/oneshot-intent-collection/SKILL.md)
- [backend/skills/oneshot-sandbox-runtime/SKILL.md](backend/skills/oneshot-sandbox-runtime/SKILL.md)
- [backend/skills/oneshot-task-runtime/SKILL.md](backend/skills/oneshot-task-runtime/SKILL.md)
- [backend/skills/registry.ts](backend/skills/registry.ts)
- [backend/skills/resolver.ts](backend/skills/resolver.ts)
- [backend/skills/sandbox-skill.ts](backend/skills/sandbox-skill.ts)
- [backend/skills/task-runtime-skill.ts](backend/skills/task-runtime-skill.ts)
- [backend/skills/types.ts](backend/skills/types.ts)

</details>

## Python backend service

Standalone Python service and its own package, container, and tests.

<details>
<summary>Browse 12 files</summary>

- [backend/python/Dockerfile](backend/python/Dockerfile)
- [backend/python/README.md](backend/python/README.md)
- [backend/python/app/__init__.py](backend/python/app/__init__.py)
- [backend/python/app/contracts.py](backend/python/app/contracts.py)
- [backend/python/app/export_schema.py](backend/python/app/export_schema.py)
- [backend/python/app/main.py](backend/python/app/main.py)
- [backend/python/app/models.py](backend/python/app/models.py)
- [backend/python/app/reasoner.py](backend/python/app/reasoner.py)
- [backend/python/app/reasoning/__init__.py](backend/python/app/reasoning/__init__.py)
- [backend/python/app/validators/__init__.py](backend/python/app/validators/__init__.py)
- [backend/python/pyproject.toml](backend/python/pyproject.toml)
- [backend/python/tests/test_reasoning_contract.py](backend/python/tests/test_reasoning_contract.py)

</details>

## Backend support

Intent, task management, graph projections, shared utilities, and backend entrypoints.

<details>
<summary>Browse 30 files</summary>

- [backend/core/clone.ts](backend/core/clone.ts)
- [backend/core/id.ts](backend/core/id.ts)
- [backend/core/information-required-error.ts](backend/core/information-required-error.ts)
- [backend/core/root-cause-error.ts](backend/core/root-cause-error.ts)
- [backend/environment.ts](backend/environment.ts)
- [backend/graph/strands-graph.ts](backend/graph/strands-graph.ts)
- [backend/graph/authority-graph.ts](backend/graph/authority-graph.ts)
- [backend/graph/intent-graph.ts](backend/graph/intent-graph.ts)
- [backend/index.ts](backend/index.ts)
- [backend/intent/conversation-store.ts](backend/intent/conversation-store.ts)
- [backend/intent/intent-collection.ts](backend/intent/intent-collection.ts)
- [backend/intent/prompt-generator.ts](backend/intent/prompt-generator.ts)
- [backend/intent/types.ts](backend/intent/types.ts)
- [backend/python-runtime.ts](backend/python-runtime.ts)
- [backend/reasoning/index.ts](backend/reasoning/index.ts)
- [backend/reasoning/python-client.ts](backend/reasoning/python-client.ts)
- [backend/requirements-ledger.txt](backend/requirements-ledger.txt)
- [backend/scripts/run-pipeline-worker.ts](backend/scripts/run-pipeline-worker.ts)
- [backend/scripts/run-worker-cli.ts](backend/scripts/run-worker-cli.ts)
- [backend/scripts/test-pipeline-checkpoint-recovery.mjs](backend/scripts/test-pipeline-checkpoint-recovery.mjs)
- [backend/scripts/test-pipeline-e2e.mjs](backend/scripts/test-pipeline-e2e.mjs)
- [backend/scripts/test-pipeline-recovery.mjs](backend/scripts/test-pipeline-recovery.mjs)
- [backend/scripts/test-pipeline-refinement-recovery.mjs](backend/scripts/test-pipeline-refinement-recovery.mjs)
- [backend/task/checkpoint/checkpoint-store.ts](backend/task/checkpoint/checkpoint-store.ts)
- [backend/task/event/event-store.ts](backend/task/event/event-store.ts)
- [backend/task/guard/ordering.ts](backend/task/guard/ordering.ts)
- [backend/task/projection/audit-projection.ts](backend/task/projection/audit-projection.ts)
- [backend/task/projection/run-projection.ts](backend/task/projection/run-projection.ts)
- [backend/task/task-management.ts](backend/task/task-management.ts)
- [backend/tool/registry.ts](backend/tool/registry.ts)

</details>

## Tests and browser checks

Backend/frontend test suites and browser automation scripts.

<details>
<summary>Browse 89 files</summary>

- [app/web/tests/console-interactions.test.mjs](app/web/tests/console-interactions.test.mjs)
- [app/web/tests/human-gates.test.mjs](app/web/tests/human-gates.test.mjs)
- [app/web/tests/live-activity.test.mjs](app/web/tests/live-activity.test.mjs)
- [app/web/tests/next-projections.test.mjs](app/web/tests/next-projections.test.mjs)
- [app/web/tests/review-cards-react.test.mjs](app/web/tests/review-cards-react.test.mjs)
- [app/web/tests/source.test.mjs](app/web/tests/source.test.mjs)
- [app/web/tests/task-management.test.mjs](app/web/tests/task-management.test.mjs)
- [app/web/tests/visual-settings.test.mjs](app/web/tests/visual-settings.test.mjs)
- [app/web/tests/workflow-observability.test.mjs](app/web/tests/workflow-observability.test.mjs)
- [backend/tests/python/__init__.py](backend/tests/python/__init__.py)
- [backend/tests/python/test_additional_proofs.py](backend/tests/python/test_additional_proofs.py)
- [backend/tests/python/test_canonicalize.py](backend/tests/python/test_canonicalize.py)
- [backend/tests/python/test_dependency_verifier.py](backend/tests/python/test_dependency_verifier.py)
- [backend/tests/python/test_e2e.py](backend/tests/python/test_e2e.py)
- [backend/tests/python/test_fixture.py](backend/tests/python/test_fixture.py)
- [backend/tests/python/test_fixture_operators.py](backend/tests/python/test_fixture_operators.py)
- [backend/tests/python/test_graph.py](backend/tests/python/test_graph.py)
- [backend/tests/python/test_parity.py](backend/tests/python/test_parity.py)
- [backend/tests/python/test_registry.py](backend/tests/python/test_registry.py)
- [backend/tests/python/test_runtime_parity_extended.py](backend/tests/python/test_runtime_parity_extended.py)
- [backend/tests/python/test_sandbox_admission.py](backend/tests/python/test_sandbox_admission.py)
- [backend/tests/python/test_schemas.py](backend/tests/python/test_schemas.py)
- [backend/tests/python/test_skill_surface.py](backend/tests/python/test_skill_surface.py)
- [backend/tests/python/test_source_file_policy.py](backend/tests/python/test_source_file_policy.py)
- [backend/tests/ts/strands-workflow-structure.test.ts](backend/tests/ts/strands-workflow-structure.test.ts)
- [backend/tests/ts/strands-gap-loop.test.ts](backend/tests/ts/strands-gap-loop.test.ts)
- [backend/tests/ts/strands-refinement-loop.test.ts](backend/tests/ts/strands-refinement-loop.test.ts)
- [backend/tests/ts/strands-workflow-runtime.test.ts](backend/tests/ts/strands-workflow-runtime.test.ts)
- [backend/tests/ts/agent-pipeline.test.ts](backend/tests/ts/agent-pipeline.test.ts)
- [backend/tests/ts/authority-graph.test.ts](backend/tests/ts/authority-graph.test.ts)
- [backend/tests/ts/build-review.test.ts](backend/tests/ts/build-review.test.ts)
- [backend/tests/ts/builder-single-execution.test.ts](backend/tests/ts/builder-single-execution.test.ts)
- [backend/tests/ts/canonical-graph-parity.test.ts](backend/tests/ts/canonical-graph-parity.test.ts)
- [backend/tests/ts/canonical-matrix.test.ts](backend/tests/ts/canonical-matrix.test.ts)
- [backend/tests/ts/conversation-routing.test.ts](backend/tests/ts/conversation-routing.test.ts)
- [backend/tests/ts/featherless-provider.test.ts](backend/tests/ts/featherless-provider.test.ts)
- [backend/tests/ts/full-chain.test.ts](backend/tests/ts/full-chain.test.ts)
- [backend/tests/ts/harness.ts](backend/tests/ts/harness.ts)
- [backend/tests/ts/help-request.test.ts](backend/tests/ts/help-request.test.ts)
- [backend/tests/ts/intent-collection.test.ts](backend/tests/ts/intent-collection.test.ts)
- [backend/tests/ts/intent-http.test.ts](backend/tests/ts/intent-http.test.ts)
- [backend/tests/ts/native-gemini-session-e2e.test.ts](backend/tests/ts/native-gemini-session-e2e.test.ts)
- [backend/tests/ts/pipeline-durable-state.test.ts](backend/tests/ts/pipeline-durable-state.test.ts)
- [backend/tests/ts/plan-review.test.ts](backend/tests/ts/plan-review.test.ts)
- [backend/tests/ts/process-runner-mutations.test.ts](backend/tests/ts/process-runner-mutations.test.ts)
- [backend/tests/ts/prompt-generator.test.ts](backend/tests/ts/prompt-generator.test.ts)
- [backend/tests/ts/provider-cloud-paths.test.ts](backend/tests/ts/provider-cloud-paths.test.ts)
- [backend/tests/ts/provider-config-domain.test.ts](backend/tests/ts/provider-config-domain.test.ts)
- [backend/tests/ts/provider-http.test.ts](backend/tests/ts/provider-http.test.ts)
- [backend/tests/ts/provider-infra.test.ts](backend/tests/ts/provider-infra.test.ts)
- [backend/tests/ts/provider-manager.test.ts](backend/tests/ts/provider-manager.test.ts)
- [backend/tests/ts/provider.test.ts](backend/tests/ts/provider.test.ts)
- [backend/tests/ts/reasoning-adapter.test.ts](backend/tests/ts/reasoning-adapter.test.ts)
- [backend/tests/ts/reconciled-deliverable.test.ts](backend/tests/ts/reconciled-deliverable.test.ts)
- [backend/tests/ts/research-again-scope.test.ts](backend/tests/ts/research-again-scope.test.ts)
- [backend/tests/ts/run-job-contract.test.ts](backend/tests/ts/run-job-contract.test.ts)
- [backend/tests/ts/sandbox-admission.test.ts](backend/tests/ts/sandbox-admission.test.ts)
- [backend/tests/ts/sandbox-execution.test.ts](backend/tests/ts/sandbox-execution.test.ts)
- [backend/tests/ts/sandbox-negative.test.ts](backend/tests/ts/sandbox-negative.test.ts)
- [backend/tests/ts/server.test.ts](backend/tests/ts/server.test.ts)
- [backend/tests/ts/session-transcript-e2e.test.ts](backend/tests/ts/session-transcript-e2e.test.ts)
- [backend/tests/ts/skill-system.test.ts](backend/tests/ts/skill-system.test.ts)
- [backend/tests/ts/task-management.test.ts](backend/tests/ts/task-management.test.ts)
- [backend/tests/ts/tavily-researcher-evidence.test.ts](backend/tests/ts/tavily-researcher-evidence.test.ts)
- [backend/tests/ts/ui-behavior-fixtures.test.ts](backend/tests/ts/ui-behavior-fixtures.test.ts)
- [backend/tests/ts/validation-lane-pool.test.ts](backend/tests/ts/validation-lane-pool.test.ts)
- [backend/tests/ts/workspace-endpoints.test.ts](backend/tests/ts/workspace-endpoints.test.ts)
- [backend/tests/ts/workspace-http.test.ts](backend/tests/ts/workspace-http.test.ts)
- [backend/tests/ts/workspace-security.test.ts](backend/tests/ts/workspace-security.test.ts)
- [scripts/e2e/browser/browser-diag.mjs](scripts/e2e/browser/browser-diag.mjs)
- [scripts/e2e/browser/browser-e2e.mjs](scripts/e2e/browser/browser-e2e.mjs)
- [scripts/e2e/browser/cdp-core.mjs](scripts/e2e/browser/cdp-core.mjs)
- [scripts/e2e/browser/cdp-run.mjs](scripts/e2e/browser/cdp-run.mjs)
- [scripts/e2e/browser/cdp-session.mjs](scripts/e2e/browser/cdp-session.mjs)
- [scripts/e2e/browser/debug-send.mjs](scripts/e2e/browser/debug-send.mjs)
- [scripts/e2e/browser/free_port_8787.bat](scripts/e2e/browser/free_port_8787.bat)
- [scripts/e2e/browser/health_probe.mjs](scripts/e2e/browser/health_probe.mjs)
- [scripts/e2e/browser/inspect-state.mjs](scripts/e2e/browser/inspect-state.mjs)
- [scripts/e2e/browser/inspect-ws.mjs](scripts/e2e/browser/inspect-ws.mjs)
- [scripts/e2e/browser/next-smoke-server.mjs](scripts/e2e/browser/next-smoke-server.mjs)
- [scripts/e2e/browser/rebuild_test.bat](scripts/e2e/browser/rebuild_test.bat)
- [scripts/e2e/browser/run_driver.bat](scripts/e2e/browser/run_driver.bat)
- [scripts/e2e/browser/run_server.bat](scripts/e2e/browser/run_server.bat)
- [scripts/e2e/browser/run_verify.bat](scripts/e2e/browser/run_verify.bat)
- [scripts/e2e/browser/state-adaptive-e2e.mjs](scripts/e2e/browser/state-adaptive-e2e.mjs)
- [scripts/e2e/browser/verify-approved-phases.mjs](scripts/e2e/browser/verify-approved-phases.mjs)
- [scripts/e2e/browser/verify-build-card.mjs](scripts/e2e/browser/verify-build-card.mjs)
- [scripts/e2e/browser/verify-v3-visual.mjs](scripts/e2e/browser/verify-v3-visual.mjs)
- [scripts/e2e/browser/workspace-e2e.mjs](scripts/e2e/browser/workspace-e2e.mjs)

</details>

## Launchers and operations

Installers, bootstrap, deployment, health probes, and repository maintenance.

<details>
<summary>Browse 31 files</summary>

- [scripts/audit-branches.py](scripts/audit-branches.py)
- [scripts/bootstrap.mjs](scripts/bootstrap.mjs)
- [scripts/bootstrap/build.mjs](scripts/bootstrap/build.mjs)
- [scripts/bootstrap/index.mjs](scripts/bootstrap/index.mjs)
- [scripts/bootstrap/install.mjs](scripts/bootstrap/install.mjs)
- [scripts/bootstrap/preflight.mjs](scripts/bootstrap/preflight.mjs)
- [scripts/bootstrap/redis-readiness.mjs](scripts/bootstrap/redis-readiness.mjs)
- [scripts/bootstrap/verify.mjs](scripts/bootstrap/verify.mjs)
- [scripts/deploy-cloud-run.sh](scripts/deploy-cloud-run.sh)
- [scripts/docker-entrypoint-gemma.sh](scripts/docker-entrypoint-gemma.sh)
- [scripts/guard/layout.mjs](scripts/guard/layout.mjs)
- [scripts/install-e2e.ps1](scripts/install-e2e.ps1)
- [scripts/install-e2e.sh](scripts/install-e2e.sh)
- [scripts/installation/mac/install-e2e.sh](scripts/installation/mac/install-e2e.sh)
- [scripts/installation/mac/judge-launch.sh](scripts/installation/mac/judge-launch.sh)
- [scripts/installation/windows/install-e2e.ps1](scripts/installation/windows/install-e2e.ps1)
- [scripts/installation/windows/judge-launch.ps1](scripts/installation/windows/judge-launch.ps1)
- [scripts/judge-launch.ps1](scripts/judge-launch.ps1)
- [scripts/judge-launch.sh](scripts/judge-launch.sh)
- [scripts/judge.mjs](scripts/judge.mjs)
- [scripts/kill-server.ps1](scripts/kill-server.ps1)
- [scripts/lib/terminal-colors.mjs](scripts/lib/terminal-colors.mjs)
- [scripts/oneshot.mjs](scripts/oneshot.mjs)
- [scripts/preflight-cloud-deploy.sh](scripts/preflight-cloud-deploy.sh)
- [scripts/preflight-local-adc.ps1](scripts/preflight-local-adc.ps1)
- [scripts/run-local-oneshot.ps1](scripts/run-local-oneshot.ps1)
- [scripts/setup-local-adc.ps1](scripts/setup-local-adc.ps1)
- [scripts/smoke/bullmq-redis-smoke.mjs](scripts/smoke/bullmq-redis-smoke.mjs)
- [scripts/verify-cloud-run.sh](scripts/verify-cloud-run.sh)
- [scripts/verify-gemini-models.py](scripts/verify-gemini-models.py)
- [scripts/verify-local-health.ps1](scripts/verify-local-health.ps1)

</details>

## Containers

Dockerfiles, Compose configurations, and container documentation.

<details>
<summary>Browse 7 files</summary>

- [docker/Dockerfile](docker/Dockerfile)
- [docker/Dockerfile.dev](docker/Dockerfile.dev)
- [docker/Dockerfile.gemma](docker/Dockerfile.gemma)
- [docker/README.md](docker/README.md)
- [docker/docker-compose.dev.yml](docker/docker-compose.dev.yml)
- [docker/docker-compose.gemma.yml](docker/docker-compose.gemma.yml)
- [docker/docker-compose.local.yml](docker/docker-compose.local.yml)

</details>

## Documentation and evidence

Product requirements, workflow documents, handoffs, notices, and recorded evidence.

<details>
<summary>Browse 15 files</summary>

- [docs/APP_REVIEW.md](docs/APP_REVIEW.md)
- [docs/CANONICAL_WORKFLOW.md](docs/CANONICAL_WORKFLOW.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md)
- [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md)
- [docs/SUBMISSION.md](docs/SUBMISSION.md)
- [docs/JUDGE_AGENT_PROMPT.txt](docs/JUDGE_AGENT_PROMPT.txt)
- [docs/LLM WorkFlow CALL.txt](docs/LLM%20WorkFlow%20CALL.txt)
- [docs/ONESHOT_APP_REVIEW_HANDOFF.md](docs/ONESHOT_APP_REVIEW_HANDOFF.md)
- [docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md](docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md)
- [docs/WEB_APP_REQUIREMENTS_RECONCILIATION.md](docs/WEB_APP_REQUIREMENTS_RECONCILIATION.md)
- [docs/WORKFLOW_TREE](docs/WORKFLOW_TREE)
- [docs/evidence/video/oneshot-live-processing-demo.mp4](docs/evidence/video/oneshot-live-processing-demo.mp4)
- [docs/license/LICENSE](docs/license/LICENSE)
- [docs/license/NOTICE](docs/license/NOTICE)

</details>

## Automation and agent metadata

GitHub workflows, repository rules, and agent skills.

<details>
<summary>Browse 4 files</summary>

- [.agents/rules/oneshot-skill-architecture.md](.agents/rules/oneshot-skill-architecture.md)
- [.agents/skills/oneshot-judge/SKILL.md](.agents/skills/oneshot-judge/SKILL.md)
- [.github/workflows/pipeline-e2e.yml](.github/workflows/pipeline-e2e.yml)
- [.github/workflows/tavily-researcher-verify.yml](.github/workflows/tavily-researcher-verify.yml)

</details>

This inventory reflects checked-in files plus this index. Update it when files are added, removed, or moved.