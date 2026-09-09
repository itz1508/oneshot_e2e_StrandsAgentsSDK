import { ToolRegistry } from "../tool/registry.js";
import { RunRepository } from "../runtime/run-repository.js";
import { TaskManagement } from "../task/task-management.js";
import { projectStrandsGraph } from "../graph/strands-graph.js";
import { projectAuthorityGraph } from "../graph/authority-graph.js";
import { SkillCatalog } from "./catalog.js";

/**
 * Task Runtime Skill — exposes read-only processing evidence around the
 * canonical OneShot workflow.
 *
 * Tools: project_run, audit_run, project_strands_graph, project_authority_graph
 *
 * This skill does not own Agent execution, validation, confirmation, or hashing.
 */
export class TaskRuntimeSkill {
  private registry = new ToolRegistry();
  private descriptor;

  constructor(
    private task: TaskManagement,
    private runs: RunRepository,
    catalog = new SkillCatalog(),
  ) {
    this.descriptor = catalog.get("oneshot-task-runtime");

    this.registry.register(
      {
        name: "project_run",
        description: "Read replayed Task processing state",
      },
      ({ run_id }: { run_id: string }) =>
        this.task.projection(run_id, this.runs.get(run_id)),
    );

    this.registry.register(
      { name: "audit_run", description: "Read Task audit projection" },
      ({ run_id }: { run_id: string }) =>
        this.task.audit(run_id, this.runs.get(run_id)),
    );

    this.registry.register(
      {
        name: "project_strands_graph",
        description: "Read Strands Agents workflow graph projection",
      },
      ({ run_id }: { run_id: string }) =>
        projectStrandsGraph(this.task.events.list(run_id)),
    );

    this.registry.register(
      {
        name: "project_authority_graph",
        description:
          "Read authority/responsibility/Skill/Tool/capability trace projection",
      },
      ({ run_id }: { run_id: string }) =>
        projectAuthorityGraph(this.task.events.list(run_id)),
    );
  }

  async invoke<T>(name: string, input: unknown): Promise<T> {
    return (await this.registry.invoke(name, input)) as T;
  }

  definitions() {
    return this.registry.definitions();
  }
}
