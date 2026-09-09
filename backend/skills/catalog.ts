import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SkillDescriptor } from "./types.js";
export type { SkillDescriptor } from "./types.js";

/** Canonical contract skill tools. */
export const CANONICAL_SKILL_TOOLS = [
  "validate_schema",
  "validate_artifact",
  "validate_references",
  "validate_parity",
  "validate_registry",
  "validate_graph",
  "resolve_artifact",
  "trace_artifact",
  "run_fixture",
  "canonicalize",
  "create_hash",
  "verify_hash",
] as const;

/** Task runtime skill tools. */
export const TASK_RUNTIME_SKILL_TOOLS = [
  "project_run",
  "audit_run",
  "project_strands_graph",
  "project_authority_graph",
] as const;

/** Intent collection skill tools. */
export const INTENT_COLLECTION_SKILL_TOOLS = [
  "get_intent",
  "project_intent_graph",
] as const;

/** Sandbox runtime skill tools. */
export const SANDBOX_RUNTIME_SKILL_TOOLS = [
  "verify_admission",
  "execute_sandbox",
  "audit_sandbox",
  "project_sandbox_graph",
] as const;

/** Init skill tools. */
export const INIT_SKILL_TOOLS = ["init_workspace", "check_preflight"] as const;

const BUILTIN_SKILLS: SkillDescriptor[] = [
  {
    skill_id: "oneshot-canonical-contracts",
    name: "OneShot Canonical Contracts",
    path: resolve("backend/skills/oneshot-canonical-contracts/SKILL.md"),
    capabilities: [
      "canonical-contracts",
      "contract-validation",
      "canonicalization",
      "hash-verification",
    ],
    responsibilities: [
      "contract validation",
      "runtime parity",
      "workflow graph proof",
      "fixture proof",
      "canonicalization",
      "hash verification",
    ],
    tools: CANONICAL_SKILL_TOOLS,
    runtime_type: "python",
  },
  {
    skill_id: "oneshot-task-runtime",
    name: "OneShot Task Runtime",
    path: resolve("backend/skills/oneshot-task-runtime/SKILL.md"),
    capabilities: [
      "task-runtime",
      "event-replay",
      "audit-projection",
      "graph-projection",
    ],
    responsibilities: [
      "processing event replay",
      "checkpoint projection",
      "audit projection",
      "ADK provider graph projection",
    ],
    tools: TASK_RUNTIME_SKILL_TOOLS,
    runtime_type: "typescript",
  },
  {
    skill_id: "oneshot-intent-collection",
    name: "OneShot Intent Collection",
    path: resolve("backend/skills/oneshot-intent-collection/SKILL.md"),
    capabilities: [
      "intent-collection",
      "prompt-projection",
      "intent-preservation",
    ],
    responsibilities: [
      "multi-turn intent preservation",
      "targeted clarification",
      "Prompt(id) readiness projection",
    ],
    tools: INTENT_COLLECTION_SKILL_TOOLS,
    runtime_type: "typescript",
  },
  {
    skill_id: "oneshot-sandbox-runtime",
    name: "OneShot Sandbox Runtime",
    path: resolve("backend/skills/oneshot-sandbox-runtime/SKILL.md"),
    capabilities: [
      "sandbox-runtime",
      "isolated-execution",
      "admission-verification",
      "evidence-recording",
    ],
    responsibilities: [
      "admission verification",
      "isolated execution boundary",
      "execution evidence recording",
      "sandbox canonical hash verification",
    ],
    tools: SANDBOX_RUNTIME_SKILL_TOOLS,
    runtime_type: "typescript",
  },
  {
    skill_id: "oneshot-init",
    name: "OneShot Workspace Init",
    path: resolve("backend/skills/init/SKILL.md"),
    capabilities: ["init", "workspace-initialization", "preflight-check"],
    responsibilities: [
      "workspace directory provisioning",
      "environment preflight diagnostics",
    ],
    tools: INIT_SKILL_TOOLS,
    runtime_type: "typescript",
  },
];

/**
 * Declarative and Dynamic Reusable Skill Catalog.
 * Supports static registry lookup as well as dynamic filesystem discovery.
 */
export class SkillCatalog {
  private indexed = new Map<string, SkillDescriptor>();

  constructor(initial: SkillDescriptor[] = BUILTIN_SKILLS) {
    for (const s of initial) {
      this.register(s);
    }
  }

  /** Register a validated Skill descriptor. */
  register(descriptor: SkillDescriptor): void {
    this.indexed.set(descriptor.skill_id, descriptor);
  }

  /** Retrieve descriptor by exact skill_id. */
  get(skillId: string): SkillDescriptor {
    const s = this.indexed.get(skillId);
    if (!s) throw new Error(`Unknown skill ${skillId}`);
    return s;
  }

  /** Check if exact skill_id exists in catalog. */
  has(skillId: string): boolean {
    return this.indexed.has(skillId);
  }

  /** Find descriptors that declare an exact capability. */
  findByCapability(capability: string): SkillDescriptor[] {
    const cap = capability.toLowerCase().trim();
    return Array.from(this.indexed.values()).filter((s) =>
      s.capabilities.map((c) => c.toLowerCase()).includes(cap),
    );
  }

  /** Find descriptor exposing a specific tool name. */
  findByTool(toolName: string): SkillDescriptor | undefined {
    return Array.from(this.indexed.values()).find((s) =>
      s.tools.includes(toolName),
    );
  }

  /** List all currently indexed Skill descriptors. */
  list(): SkillDescriptor[] {
    return Array.from(this.indexed.values());
  }

  /**
   * Dynamically discover reusable Skill definitions from `skills/` directories on disk.
   */
  discover(
    rootDir = process.env.ONESHOT_ROOT || process.cwd(),
  ): SkillDescriptor[] {
    const skillRoot = resolve(rootDir, "backend/skills");
    if (!existsSync(skillRoot)) return this.list();

    for (const entry of readdirSync(skillRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(skillRoot, entry.name, "SKILL.md");
      if (existsSync(skillPath)) {
        const skillId = entry.name.startsWith("oneshot-")
          ? entry.name
          : `oneshot-${entry.name}`;
        if (!this.indexed.has(skillId)) {
          const content = readFileSync(skillPath, "utf8");
          const firstLine = content.split("\n")[0] || "";
          const name = firstLine.replace(/^#\s*/, "").trim() || skillId;

          this.register({
            skill_id: skillId,
            name,
            path: skillPath,
            capabilities: [entry.name, skillId],
            responsibilities: [name],
            tools: [],
            runtime_type: "custom",
          });
        }
      }
    }

    return this.list();
  }
}
