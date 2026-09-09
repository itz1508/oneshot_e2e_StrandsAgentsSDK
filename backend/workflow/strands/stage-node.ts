import {
  Node,
  Status,
  type MultiAgentStreamEvent,
  type NodeResultUpdate,
} from "@strands-agents/sdk/multiagent";
import type { WorkflowRunState } from "./state.js";

export interface StageOutcome {
  stateDelta?: Record<string, unknown>;
}

export type StageHandler = (
  state: WorkflowRunState,
) => Promise<StageOutcome | void>;

/**
 * Deterministic OneShot stage as a real Strands multi-agent node.
 *
 * Strands owns node scheduling, lifecycle, and graph traversal. The handler
 * activates and runs one canonical OneShot agent/workflow and returns a state
 * delta applied to the shared run state. A node skips itself once a canonical
 * ROOT_CAUSE exists unless it is marked runAfterRootCause.
 */
export class OneShotStageNode extends Node {
  private readonly handler: StageHandler;
  private readonly runAfterRootCause: boolean;
  private readonly runState: WorkflowRunState;

  constructor(config: {
    id: string;
    description: string;
    handler: StageHandler;
    state: WorkflowRunState;
    runAfterRootCause?: boolean;
  }) {
    super(config.id, { description: config.description });
    this.handler = config.handler;
    this.runState = config.state;
    this.runAfterRootCause = config.runAfterRootCause ?? false;
  }

  async *handle(
    _input: unknown,
    _graphState: unknown,
    _options?: unknown,
  ): AsyncGenerator<MultiAgentStreamEvent, NodeResultUpdate, undefined> {
    if (!this.runAfterRootCause && this.runState.rootCause()) {
      return { status: Status.COMPLETED, content: [] };
    }

    const outcome = ((await this.handler(this.runState)) ?? {}) as StageOutcome;
    this.runState.applyDelta(outcome.stateDelta ?? {});
    return { status: Status.COMPLETED, content: [] };
  }
}
