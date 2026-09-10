"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, optional, request, streamEvents } from "../lib/api";
import type {
    BuildReview,
    Bundle,
    Conversation,
    Edits,
    Mutation,
    Provider,
    ResearchReview,
    Run,
    TreeNode,
} from "../lib/contracts";
import {
    builderStarted,
    currentPhase,
    eventNeedsSnapshot,
    mergeEvents,
    phaseLabel,
    researchWaiting,
    readiness,
    stageState,
} from "../lib/projections";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { CodeViewerModal, FileNode } from "./file-browser";
import { BuildCard, Mutations, ResearchCard, ResultCard } from "./review-cards";

type AssistantTurnStatus =
    | "working"
    | "waiting_for_user"
    | "completed"
    | "failed";
type TurnVM = {
    key: string;
    time: string;
    kind: "user" | "assistant";
    turnId?: string;
    text?: string;
    status?: AssistantTurnStatus;
    content?: string;
    embedded?: "research" | "build" | "sandbox" | "result" | null;
};

const STAGE_ORDER = [
    "Researcher",
    "Planner",
    "Refactor",
    "Gap Analysis",
    "Evaluation",
    "Triple Validation",
    "Confirmed",
    "Builder",
    "Hash Verification",
    "Done",
];

export default function Workspace() {
    const [leftOpen, setLeftOpen] = useState(true);
    const [rightOpen, setRightOpen] = useState(true);
    const [draft, setDraft] = useState("");
    const [mode, setMode] = useState<"normal" | "research-again">("normal");
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [runId, setRunId] = useState("");
    const [run, setRun] = useState<Run | null>(null);
    const [review, setReview] = useState<ResearchReview | null>(null);
    const [build, setBuild] = useState<BuildReview | null>(null);
    const [bundle, setBundle] = useState<Bundle | null>(null);
    const [plan, setPlan] = useState<Bundle["plan"] | undefined>(undefined);
    const [bundleVersion, setBundleVersion] = useState<string>("");
    const [mutations, setMutations] = useState<Mutation[] | null>(null);
    const [nodes, setNodes] = useState<TreeNode[]>([]);
    const [treeStatus, setTreeStatus] = useState("");
    const [status, setStatus] = useState("Connecting");
    const [target, setTarget] = useState<{
        root: string;
        source: string;
    } | null>(null);
    const [workspaceDigest, setWorkspaceDigest] = useState("");
    const [file, setFile] = useState<{ path: string; content: string } | null>(
        null,
    );
    const [history, setHistory] = useState(false);
    const [jobs, setJobs] = useState<Run[]>([]);
    const [selectedJob, setSelectedJob] = useState("");
    const [historical, setHistorical] = useState<Run | null>(null);
    const [historicalMutations, setHistoricalMutations] = useState<
        Mutation[] | null
    >(null);
    const [historyStatus, setHistoryStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [gateLoading, setGateLoading] = useState(false);
    const [error, setError] = useState("");
    const [settings, setSettings] = useState(false);
    const [auth, setAuth] = useState(false);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [activeProvider, setActiveProvider] = useState("");
    const [providerBusy, setProviderBusy] = useState(false);
    const [providerMessage, setProviderMessage] = useState("");
    const providerLock = useRef(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [authKey, setAuthKey] = useState(0);
    const [settingsProvider, setSettingsProvider] = useState("");
    const [showCredential, setShowCredential] = useState(false);
    const [newChat, setNewChat] = useState(false);
    const epoch = useRef(0);
    const input = useRef<HTMLTextAreaElement>(null);
    const bottom = useRef<HTMLDivElement>(null);
    const fileRequest = useRef(0);

    // Floating Composer dynamic resizing
    const [composerHeight, setComposerHeight] = useState(150);
    const isResizing = useRef(false);
    const startY = useRef(0);
    const startH = useRef(0);

    const onMouseDownResize = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        startY.current = e.clientY;
        startH.current = composerHeight;
        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return;
            const dy = startY.current - moveEvent.clientY;
            setComposerHeight(
                Math.max(110, Math.min(420, startH.current + dy)),
            );
        };
        const onMouseUp = () => {
            isResizing.current = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    };

    // Derive file mutations map
    const mutationsMap = useMemo(() => {
        const map = new Map<string, Mutation>();
        const source =
            mutations;
        if (source) {
            for (const m of source) {
                if (m.path) map.set(m.path, m);
            }
        }
        return map;
    }, [mutations]);

    const loadTree = useCallback(async () => {
        setTreeStatus("Reading target workspace…");
        try {
            const data = await request<{ nodes: TreeNode[] }>(
                "/v1/workspace/tree?path=.&depth=1",
            );
            setNodes(data.nodes || []);
            setTreeStatus(
                data.nodes?.length ? "" : "Target workspace is empty.",
            );
        } catch {
            setTreeStatus("Target workspace unavailable");
        }
        try {
            const info = await request<{
                digest?: string;
                file_count?: number;
                root?: string;
            }>("/v1/workspace/info");
            if (info?.digest) setWorkspaceDigest(info.digest);
            if (info?.root) {
                const rootStr = info.root;
                setTarget((prev) =>
                    prev
                        ? { ...prev, root: rootStr }
                        : { root: rootStr, source: "workspace-root" },
                );
            }
        } catch {
            // workspace info is optional
        }
    }, []);

    const loadProviders = useCallback(async () => {
        try {
            const data = await request<{
                providers: Provider[];
                activeProvider: string;
            }>("/api/providers");
            setProviders(data.providers || []);
            setActiveProvider(data.activeProvider || "");
        } catch (cause) {
            setProviderMessage(cause instanceof Error ? cause.message : "Provider catalog unavailable.");
            throw cause;
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        setLeftOpen(window.innerWidth > 760);
        setRightOpen(window.innerWidth > 1150);

        void request<{ status: string }>(
            "/api/health",
            undefined,
            "GET",
            signal,
        )
            .then((d) =>
                setStatus(d.status === "ok" ? "Connected" : "Degraded"),
            )
            .catch((e) => {
                if (!signal.aborted)
                    setStatus(
                        e instanceof ApiError && e.status === 401
                            ? "Authentication required"
                            : "Disconnected",
                    );
            });

        void request<{ root: string; source: string }>(
            "/api/workspace-context",
            undefined,
            "GET",
            signal,
        )
            .then(setTarget)
            .catch(() => {
                // workspace-context optional when backend disconnected
            });

        void loadTree();
        void loadProviders().catch(() => {});

        const cid = localStorage.getItem("oneshot.currentConversationId");
        if (cid) {
            void request<Conversation>(
                `/api/conversations/${encodeURIComponent(cid)}`,
                undefined,
                "GET",
                signal,
            )
                .then((c) => {
                    setConversation(c);
                    setRunId(
                        localStorage.getItem("oneshot.currentRunId") || "",
                    );
                })
                .catch((cause) => {
                    if (signal.aborted) return;
                    if (cause instanceof ApiError && cause.status === 404) {
                        localStorage.removeItem("oneshot.currentConversationId");
                        localStorage.removeItem("oneshot.currentRunId");
                    } else {
                        setError("Could not restore the saved session. Check your connection or session token, then reload to retry.");
                    }
                });
        }
        return () => controller.abort();
    }, [loadTree, loadProviders, authKey]);

    useEffect(() => {
        if (!runId) return;
        const controller = new AbortController();
        const signal = controller.signal;
        let inFlight = false,
            pending = false;
        const base = `/api/runs/${encodeURIComponent(runId)}`;

        async function refresh() {
            if (inFlight) {
                pending = true;
                return;
            }
            inFlight = true;
            setGateLoading(true);
            try {
                do {
                    pending = false;
                    const snapshot = await request<Run>(
                        base,
                        undefined,
                        "GET",
                        signal,
                    );
                    const [
                        researchReview,
                        buildReview,
                        researchBundle,
                        mutationArtifact,
                        currentPlan,
                    ] = await Promise.all([
                        optional<ResearchReview>(base + "/review", signal),
                        optional<BuildReview>(base + "/build-review", signal),
                        snapshot.artifacts?.research_bundle
                            ? optional<Bundle>(
                                  base + "/artifacts/research_bundle",
                                  signal,
                              )
                            : Promise.resolve(null),
                        snapshot.pipeline_status === "Done"
                            ? optional<{ records: Mutation[] }>(
                                  base + "/artifacts/file-mutations",
                                  signal,
                              )
                            : Promise.resolve(null),
                        snapshot.artifacts?.plan
                            ? optional<Bundle["plan"]>(
                                  base + "/artifacts/plan",
                                  signal,
                              )
                            : Promise.resolve(null),
                    ]);
                    if (signal.aborted) return;
                    setRun((previous) => ({
                        ...snapshot,
                        events: mergeEvents(
                            previous?.run_id === runId ? previous.events : [],
                            snapshot.events,
                        ),
                    }));
                    setReview(researchReview);
                    setBuild(buildReview);
                    setBundle(researchReview?.research || researchBundle);
                    setMutations(mutationArtifact?.records || null);
                    setPlan(
                        currentPlan ||
                            researchReview?.research.plan ||
                            researchBundle?.plan,
                    );
                    setBundleVersion(
                        String(
                            snapshot.events
                                .filter(
                                    (e) =>
                                        e.processor === "Researcher" &&
                                        e.execution_status === "Completed",
                                )
                                .at(-1)?.sequence || "",
                        ),
                    );
                    if (snapshot.pipeline_status === "Done") {
                        setStatus("Connected");
                        void loadTree();
                        controller.abort();
                    }
                } while (pending && !signal.aborted);
            } catch (e) {
                if (!signal.aborted)
                    setError(e instanceof Error ? e.message : String(e));
            } finally {
                inFlight = false;
                setGateLoading(false);
            }
        }

        const seen = new Set<string>();
        void streamEvents(
            base + "/events",
            signal,
            (event) => {
                if (!event) {
                    void refresh();
                    return;
                }
                if (seen.has(event.event_id)) return;
                seen.add(event.event_id);
                setRun((previous) =>
                    previous?.run_id === runId
                        ? {
                              ...previous,
                              events: mergeEvents(previous.events, [event]),
                              ...(event.scope === "WORKFLOW"
                                  ? { current_processor: event.processor }
                                  : {}),
                          }
                        : previous,
                );
                if (eventNeedsSnapshot(event)) void refresh();
            },
            setStatus,
        );
        return () => controller.abort();
    }, [runId, refreshKey, authKey, loadTree]);

    useEffect(() => {
        if (!history) return;
        const c = new AbortController();
        setHistoryStatus("Loading saved jobs…");
        void request<{ runs: Run[] }>("/api/runs", undefined, "GET", c.signal)
            .then((d) => {
                setJobs(d.runs || []);
                setHistoryStatus(d.runs?.length ? "" : "No saved jobs.");
            })
            .catch((e) => {
                if (!c.signal.aborted) setHistoryStatus(e.message);
            });
        return () => c.abort();
    }, [history, refreshKey]);

    useEffect(() => {
        setHistorical(null);
        setHistoricalMutations(null);
        if (!selectedJob) return;
        const c = new AbortController();
        const base = `/api/runs/${encodeURIComponent(selectedJob)}`;
        void Promise.all([
            request<Run>(base, undefined, "GET", c.signal),
            optional<{ records: Mutation[] }>(
                base + "/artifacts/file-mutations",
                c.signal,
            ),
        ])
            .then(([r, m]) => {
                if (!c.signal.aborted) {
                    setHistorical(r);
                    setHistoricalMutations(m?.records || null);
                }
            })
            .catch((e) => {
                if (!c.signal.aborted) setHistoryStatus(e.message);
            });
        return () => c.abort();
    }, [selectedJob]);

    async function perform(action: () => Promise<void>) {
        if (busyRef.current) return false;
        busyRef.current = true;
        setBusy(true);
        setError("");
        try {
            await action();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }

    async function send() {
        const text = draft.trim();
        if (!text) return;
        await perform(async () => {
            const current = epoch.current;
            const data = await request<Conversation>(
                conversation
                    ? `/api/conversations/${encodeURIComponent(conversation.conversation_id)}/messages`
                    : "/api/conversations",
                conversation
                    ? {
                          message: text,
                          ...(runId ? { run_id: runId } : {}),
                          intent_kind: mode,
                      }
                    : { message: text },
            );
            if (epoch.current !== current) return;
            setConversation(data);
            localStorage.setItem(
                "oneshot.currentConversationId",
                data.conversation_id,
            );
            setDraft("");
            setMode("normal");
            if (mode === "research-again") {
                setReview(null);
                setBundle(null);
                setRefreshKey((v) => v + 1);
            }
            bottom.current?.scrollIntoView({ block: "end" });
        });
    }

    async function startRun() {
        if (!conversation || runId) return;
        if (target?.source !== "configured") {
            setError("Select a target by setting ONESHOT_WORKSPACE_ROOT and restarting OneShot before starting Research.");
            return;
        }
        await perform(async () => {
            const data = await request<{ run_id: string }>(
                `/api/conversations/${encodeURIComponent(conversation.conversation_id)}/run`,
                { review_plan: true },
            );
            setRunId(data.run_id);
            localStorage.setItem("oneshot.currentRunId", data.run_id);
        });
    }

    async function accept(edits: Edits) {
        await perform(async () => {
            const base = `/api/runs/${encodeURIComponent(runId)}`;
            const execution = await request<{ mode: string }>(
                base + "/artifacts/execution-mode",
            );
            if (execution.mode === "pipeline") {
                await request(base + "/confirm-plan", { edits });
            } else if (review) {
                await request(base + "/review", {
                    action: "approve",
                    revision: review.revision,
                    edits,
                });
            } else {
                throw new Error(
                    "No revision-aware review is available for this execution mode.",
                );
            }
            setReview(review ? { ...review, status: "approved" } : null);
            setRefreshKey((v) => v + 1);
        });
    }

    async function decideBuild(action: "approve" | "return") {
        if (!build) return false;
        return perform(async () => {
            const result = await request<BuildReview>(
                `/api/runs/${encodeURIComponent(runId)}/build-review`,
                { action, hash: build.hash },
            );
            setBuild(result);
            setRefreshKey((v) => v + 1);
        });
    }

    function resetSelection() {
        epoch.current++;
        setConversation(null);
        setRunId("");
        setRun(null);
        setReview(null);
        setBundle(null);
        setPlan(undefined);
        setBuild(null);
        setDraft("");
        setMode("normal");
        setMutations(null);
        setError("");
        localStorage.removeItem("oneshot.currentConversationId");
        localStorage.removeItem("oneshot.currentRunId");
        setNewChat(false);
        input.current?.focus();
    }

    async function openFile(path: string) {
        const id = ++fileRequest.current;
        setFile({ path, content: "Loading file…" });
        try {
            const f = await request<{ path: string; content: string }>(
                `/v1/workspace/file?path=${encodeURIComponent(path)}`,
            );
            if (fileRequest.current === id) setFile(f);
        } catch (e) {
            if (fileRequest.current === id)
                setFile({
                    path,
                    content: e instanceof Error ? e.message : String(e),
                });
        }
    }

    const waiting =
        !!run && researchWaiting(run) && review?.status !== "approved";
    const active = providers.find((p) => p.id === activeProvider);

    const progressPct = Math.round(STAGE_ORDER.filter(stage => stageState(run, stage) === "Completed").length / STAGE_ORDER.length * 100);
    const { score: intentScore, label: readyLabel } = readiness(run, conversation, build, waiting, status);

    // Provider dot style
    const providerClass = useMemo(() => {
        const name = (
            active?.displayName ||
            activeProvider ||
            ""
        ).toLowerCase();
        if (name.includes("anthropic") || name.includes("claude"))
            return "anthropic";
        if (name.includes("openai") || name.includes("gpt")) return "openai";
        return "";
    }, [active, activeProvider]);

    // ----- Conversation turn view model -----
    // One user send = one user turn; ONE assistant turn per exchange that
    // evolves as real backend state (run snapshot / review / build / SSE
    // events) updates. Derived view only — no new persistence, no new
    // workflow engine, no simulated progress.
    const userTurns: TurnVM[] = (conversation?.turns || []).map((t) => ({
        key: t.turn_id,
        time: t.created_at,
        kind: "user" as const,
        turnId: t.turn_id,
        text: t.user_message,
    }));

    const runFailed =
        run?.pipeline_status === "Done" && run.test_result !== "Passed";
    const runCompleted =
        run?.pipeline_status === "Done" && run.test_result === "Passed";
    const buildPending = build?.status === "pending";
    const researchGate = !!run && waiting;
    const intentReady =
        !!conversation?.intent?.ready_for_prompt && !runId && !busy;
    const builderLive = !!run && builderStarted(run);

    let assistantTurn: TurnVM | null = null;
    if (runFailed || runCompleted) {
        assistantTurn = {
            key: "assistant-current",
            time: run?.events.at(-1)?.created_at || "",
            kind: "assistant",
            status: runFailed ? "failed" : "completed",
            content: runFailed
                ? `I hit a blocker and stopped: ${
                      run?.root_cause?.issue || "the pipeline failed"
                  }${run?.root_cause?.actual ? ` — ${run.root_cause.actual}` : ""}`
                : "Build verified — the sandbox output hash matches the hash you approved. The job is complete.",
            embedded: "result",
        };
    } else if (buildPending) {
        assistantTurn = {
            key: "assistant-current",
            time: build?.created_at || "",
            kind: "assistant",
            status: "waiting_for_user",
            content:
                "The build package is validated and ready. Confirm the build to execute it in the sandbox.",
            embedded: "build",
        };
    } else if (run && bundle && !builderLive) {
        // Research review embedded from research-complete through the plan
        // stages; the card's own pill tracks gate vs accepted (baseline).
        assistantTurn = {
            key: "assistant-current",
            time:
                review?.created_at ||
                run.events
                    .filter((e) => e.processor === "Researcher")
                    .at(-1)?.created_at ||
                "",
            kind: "assistant",
            status: researchGate ? "waiting_for_user" : "working",
            content: researchGate
                ? "Research is complete. Review the findings before I continue."
                : `Working — ${currentPhase(run)}…`,
            embedded: "research",
        };
    } else if (builderLive) {
        assistantTurn = {
            key: "assistant-current",
            time:
                run?.events.find(
                    (e) =>
                        e.processor === "Builder" &&
                        e.execution_status !== "Pending",
                )?.created_at || "",
            kind: "assistant",
            status: "working",
            content: `Working — executing the confirmed build in the isolated sandbox (${currentPhase(run!)}).`,
            embedded: "sandbox",
        };
    } else if (run) {
        assistantTurn = {
            key: "assistant-current",
            time: run.events.at(-1)?.created_at || "",
            kind: "assistant",
            status: "working",
            content: run.current_processor
                ? `Working — ${currentPhase(run)}…`
                : "Working…",
            embedded: null,
        };
    } else if (intentReady) {
        assistantTurn = {
            key: "assistant-current",
            time: "",
            kind: "assistant",
            status: "waiting_for_user",
            content:
                "I have everything I need. Generate the run and I'll take it from here.",
            embedded: null,
        };
    } else if (busy) {
        assistantTurn = {
            key: "assistant-current",
            time: "",
            kind: "assistant",
            status: "working",
            content: "Working…",
            embedded: null,
        };
    }

    const turns: TurnVM[] = [
        ...userTurns,
        ...(assistantTurn ? [assistantTurn] : []),
    ];

    // Determine Task Management badge
    let panelBadge = "Idle";
    if (run) {
        if (waiting || build?.status === "pending") panelBadge = "Gate Waiting";
        else if (run.pipeline_status === "Running") panelBadge = "Running";
        else if (run.pipeline_status === "Done")
            panelBadge = run.test_result === "Passed" ? "Done" : "Failed";
    }

    return (
        <div className="app-root">
            {/* Top Bar (§10) */}
            <header className="topbar top-bar" id="topbar">
                <div className="brand brand-badge">
                    <span className="brand-mark">1S</span>
                    <span className="brand-title">OneShot</span>
                    <span className="brand-tag">v3.0</span>
                </div>

                <div
                    className="target-chip"
                    id="target-chip"
                    title="Selected Target Workspace"
                >
                    <span className="chip-icon">📁</span>
                    <span className="chip-label">Target</span>
                    <span
                        className="chip-val"
                        id="target-name"
                        title={target?.root || "Target Workspace"}
                    >
                        {target?.root
                            ? target.root.split(/[\\/]/).filter(Boolean).pop()
                            : "Not selected"}
                    </span>
                </div>

                {runId ? (
                    <div
                        className="job-chip"
                        id="job-chip"
                        title="Active Job ID"
                    >
                        <span className="chip-icon">⚡</span>
                        <span className="chip-label">JobId</span>
                        <span className="chip-val mono" id="topbar-job-id">
                            {runId}
                        </span>
                    </div>
                ) : null}

                <div className="top-context">
                    <div
                        className={`pipeline-pulse ${status === "Connected" ? "live" : ""}`}
                        title="Live Pipeline Pulse"
                    >
                        <i />
                        <span>
                            {status === "Connected" ? "Pipeline Ready" : status}
                        </span>
                    </div>
                    <div
                        className="readiness-bar"
                        id="readiness"
                        data-testid="readiness"
                        title="Prompt Intent Readiness"
                    >
                        <span className="readiness-label" id="ready-label">
                            {readyLabel}
                        </span>
                        <div className="leds">
                            <span
                                className={`led ${intentScore >= 1 ? "lit" : ""}`}
                                title="Intent Captured"
                            />
                            <span
                                className={`led ${intentScore >= 2 ? "lit" : waiting || busy ? "next" : ""}`}
                                title="Scope Defined"
                            />
                            <span
                                className={`led ${intentScore >= 3 ? "lit" : ""}`}
                                title="Plan Validated"
                            />
                        </div>
                    </div>
                </div>

                <div className="topbar-right">
                    <button
                        type="button"
                        className="provider-chip"
                        id="topbar-provider"
                        title="Active LLM Provider"
                        onClick={() => setSettings(true)}
                    >
                        <span className={`provider-dot ${providerClass}`} />
                        <span
                            className="provider-label"
                            id="provider-name-display"
                        >
                            {active
                                ? `${active.displayName} · ${active.runtime?.model || active.model || ""}`
                                : "Provider"}
                        </span>
                    </button>
                    <div
                        className={`connection-pill ${status.toLowerCase()}`}
                        id="connection-pill"
                        title="Backend Health"
                    >
                        {status}
                    </div>
                    <button
                        type="button"
                        className="topbar-btn"
                        id="generate"
                        disabled={
                            !conversation?.intent?.ready_for_prompt ||
                            !!runId ||
                            target?.source !== "configured" ||
                            busy
                        }
                        onClick={startRun}
                        title="Generate Run from Intent"
                    >
                        ⚡ Generate
                    </button>
                    <button
                        type="button"
                        className="topbar-btn new-job-btn"
                        id="new-job-btn"
                        title="Start a fresh conversation and job"
                        disabled={busy}
                        onClick={() => setNewChat(true)}
                    >
                        <span className="btn-icon">＋</span>
                        <span>New Job</span>
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setAuth(true)}
                        title="Session access token"
                        aria-label="Session access token"
                    >
                        ⌘
                    </button>
                </div>
            </header>

            {/* 5-Region Shell Layout (§9) */}
            <div
                className={`shell-layout ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}
                id="shell"
            >
                {/* 1. Left Rail (§11) */}
                <aside
                    className="left-rail"
                    id="left-rail"
                    aria-label="Left Rail Navigation"
                >
                    <button
                        type="button"
                        className={`rail-btn ${leftOpen ? "active" : ""}`}
                        id="explorer-toggle"
                        data-testid="left-rail-toggle-explorer"
                        title="Workspace Explorer"
                        aria-pressed={leftOpen}
                        aria-label="Toggle Explorer"
                        onClick={() => setLeftOpen(!leftOpen)}
                    >
                        <Icon kind="files" />
                    </button>
                    <button
                        type="button"
                        className="rail-btn"
                        title="Focus Conversation"
                        aria-label="Focus Conversation"
                        onClick={() => input.current?.focus()}
                    >
                        <Icon kind="chat" />
                    </button>
                    <div className="rail-spacer" />
                    <span
                        className="rail-count"
                        id="rail-file-count"
                        title="Workspace File Count"
                    >
                        {nodes.length ? `${nodes.length}` : "—"}
                    </span>
                    <span
                        className={`rail-indicator ${status.toLowerCase()}`}
                        id="left-rail-status"
                        title="Target connected"
                    />
                </aside>

                {/* 2. Target Workspace Explorer (§12) */}
                <aside
                    className="explorer-panel"
                    id="explorer"
                    aria-label="Target Workspace Explorer"
                    inert={!leftOpen}
                >
                    <div className="explorer-header">
                        <div className="explorer-heading">
                            <h2 className="explorer-title">Explorer</h2>
                            <span
                                className="explorer-badge"
                                id="explorer-badge"
                            >
                                {nodes.length
                                    ? `${nodes.length} files`
                                    : "Workspace"}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="icon-btn"
                            id="refresh-tree-btn"
                            title="Refresh Target Workspace"
                            onClick={loadTree}
                        >
                            <Icon kind="refresh" />
                        </button>
                    </div>

                    <div
                        className="explorer-provenance"
                        id="explorer-provenance"
                    >
                        <div className="prov-row">
                            <span className="prov-label">Root:</span>
                            <span
                                className="prov-path mono"
                                id="prov-path"
                                title={target?.root || "."}
                            >
                                {target?.root || "."}
                            </span>
                        </div>
                        {workspaceDigest && (
                            <div className="prov-row">
                                <span className="prov-label">Digest:</span>
                                <span
                                    className="prov-digest mono"
                                    id="prov-digest"
                                    title={workspaceDigest}
                                >
                                    {workspaceDigest.slice(0, 16)}…
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="explorer-content">
                        {treeStatus && (
                            <div
                                className="explorer-status-msg"
                                id="explorer-state"
                            >
                                {treeStatus}
                            </div>
                        )}
                        <ul
                            className="tree-container"
                            id="workspace-tree"
                            role="tree"
                            data-testid="workspace-tree"
                        >
                            {nodes.map((n) => (
                                <FileNode
                                    key={n.path}
                                    node={n}
                                    openFile={openFile}
                                    mutationsMap={mutationsMap}
                                />
                            ))}
                        </ul>
                    </div>

                    <div className="explorer-footer">
                        <div className="mutation-legend">
                            <span
                                className="legend-badge legend-c"
                                title="Created by build"
                            >
                                + Created
                            </span>
                            <span
                                className="legend-badge legend-m"
                                title="Modified by build"
                            >
                                ~ Modified
                            </span>
                            <span
                                className="legend-badge legend-d"
                                title="Deleted by build"
                            >
                                - Deleted
                            </span>
                        </div>
                    </div>
                </aside>

                {/* 3. Center Conversation & PromptBar (§14–§25) */}
                <main
                    className="conversation-panel conversation-pane"
                    id="conversation"
                    aria-label="Conversation Panel"
                >
                    <header className="conversation-header">
                        <span>Conversation</span>
                        <small title={runId}>
                            {runId ? `Job ${runId}` : "New conversation"}
                        </small>
                    </header>

                    <div
                        className="conversation-scroll"
                        id="conversation-scroll"
                        data-testid="chat-view"
                    >
                        {target && target.source !== "configured" && (
                            <div role="alert" className="promptbar-error-banner">
                                No target selected. Set ONESHOT_WORKSPACE_ROOT to your project folder and restart OneShot to enable Research.
                            </div>
                        )}
                        {!turns.length && (
                            <div
                                className="conversation-empty"
                                id="empty-state"
                            >
                                <div className="empty-icon-shield">1S</div>
                                <h1>Describe what you want to build</h1>
                                <p>
                                    OneShot will research the selected target,
                                    review findings with you, prepare a
                                    validated plan, and build in an isolated
                                    sandbox with cryptographic verification.
                                </p>
                                <div className="empty-hints">
                                    <div
                                        className="hint-card"
                                        onClick={() => {
                                            setDraft(
                                                "Fix the validation path while preserving legacy test fixtures",
                                            );
                                            input.current?.focus();
                                        }}
                                    >
                                        <strong>Fix regression fixture</strong>
                                        <span>
                                            Inspect tests and patch missing
                                            assertions
                                        </span>
                                    </div>
                                    <div
                                        className="hint-card"
                                        onClick={() => {
                                            setDraft(
                                                "Add a structured JSON export endpoint with strict schema validation",
                                            );
                                            input.current?.focus();
                                        }}
                                    >
                                        <strong>Add structured endpoint</strong>
                                        <span>
                                            Generate typed contracts and wire
                                            runtime route
                                        </span>
                                    </div>
                                    <div
                                        className="hint-card"
                                        onClick={() => {
                                            setDraft(
                                                "Perform full validation and compile canonical contracts",
                                            );
                                            input.current?.focus();
                                        }}
                                    >
                                        <strong>Validate contracts</strong>
                                        <span>
                                            Run triple validation on target
                                            workspace
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="messages-stream" id="messages-stream">
                        <div className="messages-stream" id="messages-stream">
                            {turns.map((t) =>
                                t.kind === "user" ? (
                                    <div
                                        key={t.key}
                                        className="message-turn"
                                        data-testid={`chat-message-${t.turnId}`}
                                    >
                                        <div className="message-bubble user">
                                            <div className="bubble-author">
                                                You
                                            </div>
                                            <div className="bubble-text">
                                                {t.text}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div key={t.key} className="message-turn">
                                        <div
                                            className="message-bubble assistant"
                                            data-status={t.status}
                                        >
                                            <div className="bubble-author">
                                                <span className="brand-mark-mini">
                                                    1S
                                                </span>{" "}
                                                OneShot
                                                <span
                                                    className={`turn-status turn-status-${t.status}`}
                                                    data-testid="assistant-turn-status"
                                                >
                                                    {t.status === "working" && (
                                                        <span className="turn-spinner" />
                                                    )}
                                                    {t.status === "working"
                                                        ? "Working…"
                                                        : t.status ===
                                                              "waiting_for_user"
                                                          ? "Waiting for you"
                                                          : t.status ===
                                                                "completed"
                                                            ? "Completed"
                                                            : "Failed"}
                                                </span>
                                            </div>
                                            {t.content ? (
                                                <div className="bubble-text turn-content">
                                                    {t.content}
                                                </div>
                                            ) : null}
                                            {t.embedded === "research" &&
                                                bundle && (
                                                    <ResearchCard
                                                        key={`${runId}:${bundleVersion}:${review?.created_at}:${review?.revision}`}
                                                        bundle={bundle}
                                                        review={review}
                                                        waiting={waiting}
                                                        busy={busy || gateLoading}
                                                        onAccept={accept}
                                                        onAgain={() => {
                                                            setMode(
                                                                "research-again",
                                                            );
                                                            input.current?.focus();
                                                        }}
                                                    />
                                                )}
                                            {t.embedded === "build" &&
                                                build &&
                                                run && (
                                                    <BuildCard
                                                        review={build}
                                                        terminal={
                                                            run.pipeline_status ===
                                                            "Done"
                                                        }
                                                        busy={busy}
                                                        onDecision={decideBuild}
                                                    />
                                                )}
                                            {t.embedded === "sandbox" &&
                                                run && (
                                                    <div
                                                        className="card"
                                                        id="sandbox-card"
                                                    >
                                                        <div className="card-topbar">
                                                            <div>
                                                                <span className="card-tagline">
                                                                    Sandbox
                                                                    Execution
                                                                </span>
                                                                <h2 className="card-title">
                                                                    Isolated
                                                                    Process
                                                                    Runner
                                                                </h2>
                                                            </div>
                                                            <span className="card-status-pill running">
                                                                Running
                                                            </span>
                                                        </div>
                                                        <p className="card-lead">
                                                            Executing confirmed
                                                            plan mutations in
                                                            HardenedProcessRunner
                                                            with workspace
                                                            boundary
                                                            enforcement.
                                                        </p>
                                                        <div className="hash-proof-box">
                                                            <div className="hash-row">
                                                                <span className="hash-label">
                                                                    Status:
                                                                </span>
                                                                <span className="hash-val">
                                                                    {run.events
                                                                        .filter(
                                                                            (
                                                                                e,
                                                                            ) =>
                                                                                e.processor ===
                                                                                "Builder",
                                                                        )
                                                                        .at(
                                                                            -1,
                                                                        )
                                                                        ?.execution_status ||
                                                                        "Running"}{" "}
                                                                    ·{" "}
                                                                    {run
                                                                        .current_processor
                                                                        ? currentPhase(
                                                                              run,
                                                                          )
                                                                        : run.pipeline_status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            {t.embedded === "result" &&
                                                run && (
                                                    <ResultCard
                                                        run={run}
                                                        mutations={mutations}
                                                    />
                                                )}
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                        </div>

                        {conversation &&
                            !runId &&
                            !conversation.intent.ready_for_prompt && (
                                <p
                                    className="intent-note"
                                    style={{
                                        textAlign: "center",
                                        color: "var(--accent-amber)",
                                        fontSize: "11px",
                                        marginTop: "12px",
                                    }}
                                >
                                    More detail needed:{" "}
                                    {conversation.intent.missing_required_information.join(
                                        ", ",
                                    )}
                                </p>
                            )}

                        {run &&
                            run.pipeline_status !== "Done" &&
                            !waiting &&
                            build?.status !== "pending" && (
                                <p
                                    className="runtime-summary"
                                    role="status"
                                    style={{
                                        textAlign: "center",
                                        color: "var(--text-muted)",
                                        fontSize: "11.5px",
                                        marginTop: "12px",
                                    }}
                                >
                                    <span
                                        className="spinner"
                                        style={{ marginRight: "6px" }}
                                    />
                                    {currentPhase(run)} · {run.pipeline_status}
                                </p>
                            )}

                        <div ref={bottom} />
                    </div>

                    {/* Floating Resizable Composer */}
                    <div
                        className="promptbar prompt-bar"
                        id="promptbar"
                        style={{ height: `${composerHeight}px` }}
                    >
                        {error && (
                            <div
                                role="alert"
                                className="promptbar-error-banner"
                            >
                                <span>{error}</span>
                                <button
                                    type="button"
                                    aria-label="Dismiss error"
                                    onClick={() => setError("")}
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {mode === "research-again" && (
                            <div
                                className="promptbar-mode-banner"
                                id="promptbar-mode"
                            >
                                <div className="mode-info">
                                    <strong>Research Again mode:</strong> Tell
                                    OneShot what to research differently on this
                                    Job
                                </div>
                                <button
                                    type="button"
                                    className="mode-close-btn"
                                    id="mode-close"
                                    onClick={() => setMode("normal")}
                                    aria-label="Cancel Research Again"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {run && run.pipeline_status === "Running" && (
                            <div
                                className="promptbar-active-banner"
                                id="promptbar-active-banner"
                            >
                                <span className="active-dot" />
                                <span>
                                    Job active: you can chat without
                                    interrupting the build
                                </span>
                            </div>
                        )}

                        <form
                            className="composer-box"
                            id="composer"
                            style={{ height: "100%" }}
                            onSubmit={(e) => {
                                e.preventDefault();
                                void send();
                            }}
                        >
                            <div className="composer-head">
                                <span
                                    className="composer-grip"
                                    title="Drag Grip"
                                >
                                    <i />
                                    <i />
                                    <i />
                                </span>
                                <span className="composer-title">
                                    Message OneShot
                                </span>
                                <span className="composer-turn">
                                    Turn{" "}
                                    {conversation?.turns?.length
                                        ? conversation.turns.length + 1
                                        : 1}
                                </span>
                                {draft && (
                                    <button
                                        type="button"
                                        className="composer-reset-btn"
                                        onClick={() => setDraft("")}
                                        title="Clear draft"
                                    >
                                        ↺
                                    </button>
                                )}
                            </div>
                            <label className="sr-only" htmlFor="composer-input">
                                Message OneShot
                            </label>
                            <textarea
                                ref={input}
                                id="message"
                                data-mode={mode}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder={
                                    mode === "research-again"
                                        ? "Instruction for Research Again…"
                                        : "Describe the outcome, features, and constraints…"
                                }
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        !e.shiftKey &&
                                        !e.nativeEvent.isComposing
                                    ) {
                                        e.preventDefault();
                                        void send();
                                    }
                                }}
                            />
                            <div className="composer-controls">
                                <button
                                    type="button"
                                    className="composer-provider-btn"
                                    onClick={() => setSettings(true)}
                                >
                                    {active
                                        ? `${active.displayName} · ${active.runtime?.model || active.model || ""}`
                                        : "Configure Provider"}{" "}
                                    ⌄
                                </button>
                                <span className="grow" />
                                {conversation?.intent.ready_for_prompt &&
                                    !runId && (
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={busy || target?.source !== "configured"}
                                            onClick={startRun}
                                        >
                                            Start Research
                                        </button>
                                    )}
                                <button
                                    type="submit"
                                    className="composer-send"
                                    id="send"
                                    disabled={busy || !draft.trim()}
                                    title="Send message"
                                    aria-label="Send message"
                                >
                                    <Icon kind="send" />
                                </button>
                            </div>
                            <div
                                className="resize-handle-se"
                                onMouseDown={onMouseDownResize}
                                title="Drag to resize composer"
                            />
                        </form>
                        <p className="composer-note">
                            Enter to send · Shift+Enter for a new line. Research
                            and Build each require explicit approval.
                        </p>
                    </div>
                </main>

                {/* 4. Task Management Panel (§26–§30) with 3D Perspective Flip */}
                <aside
                    className="task-panel"
                    id="task-panel"
                    aria-label="Task Management"
                    inert={!rightOpen}
                >
                    <div className="task-panel-header">
                        <div className="panel-title-wrap">
                            <h2 id="panel-title" className="task-panel-title">
                                {history ? "Job History" : "Current Job"}
                            </h2>
                            <span className="panel-badge" id="panel-badge">
                                {panelBadge}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="panel-flip-toggle job-flip-toggle"
                            id="panel-flip-toggle"
                            data-testid="flip-card-btn"
                            onClick={() => setHistory(!history)}
                        >
                            <span id="flip-btn-label">
                                {history ? "Current Job ⇄" : "Job History ⇄"}
                            </span>
                        </button>
                    </div>

                    <div
                        className={`flip-perspective-container task-card-3d ${history ? "is-flipped flipped" : ""}`}
                        id="flip-container"
                    >
                        <div className="flip-card-inner">
                            {/* Front Face: Current Job */}
                            <div
                                className="flip-face front card-front"
                                id="current-job-face"
                                aria-hidden={history}
                            >
                                <div
                                    className="task-panel-title"
                                    style={{ display: "none" }}
                                >
                                    Current Job
                                </div>
                                {!run ? (
                                    <div
                                        className="job-empty-note"
                                        id="job-empty-state"
                                    >
                                        <span className="empty-clock">⏱</span>
                                        <h3>Ready when you are</h3>
                                        <p>
                                            Your Job, normalized phases, and
                                            validation steps will appear here
                                            once Research begins.
                                        </p>
                                    </div>
                                ) : (
                                    <div
                                        className="job-live-view"
                                        id="job-live-view"
                                    >
                                        <div className="live-meta-row">
                                            <div className="meta-item">
                                                <span className="meta-label">
                                                    Job ID
                                                </span>
                                                <span
                                                    className="meta-id mono"
                                                    id="live-job-id"
                                                >
                                                    {run.run_id}
                                                </span>
                                            </div>
                                            <span
                                                className={`live-status-pill ${
                                                    run.pipeline_status ===
                                                    "Running"
                                                        ? "running"
                                                        : run.pipeline_status ===
                                                            "Done"
                                                          ? run.test_result ===
                                                            "Passed"
                                                              ? "done"
                                                              : "failed"
                                                          : ""
                                                }`}
                                                id="live-status-pill"
                                            >
                                                {waiting ||
                                                build?.status === "pending"
                                                    ? "Waiting for User"
                                                    : run.pipeline_status ||
                                                      "Pending"}
                                            </span>
                                        </div>

                                        {/* Timeline Stage Tracker (from oneshot.html) */}
                                        <div
                                            className="stage-track"
                                            id="stage-track"
                                        >
                                            <div className="stage-track-header">
                                                <span className="stage-track-title">
                                                    Pipeline Stages
                                                </span>
                                                <span className="stage-track-step">
                                                    {currentPhase(run)}
                                                </span>
                                            </div>
                                            <div className="stage-nodes">
                                                {STAGE_ORDER.map(
                                                    (stage, idx) => {
                                                        const recorded = stageState(run, stage);
                                                        const isDone = recorded === "Completed";
                                                        const isActive = recorded === "Running";
                                                        const isFailed = recorded === "Failed";
                                                        return (
                                                            <div
                                                                key={stage}
                                                                className={`stage-node ${isDone ? "done" : ""} ${isActive ? "active" : ""} ${isFailed ? "failed" : ""}`}
                                                            >
                                                                <span className="stage-dot">
                                                                    {isDone
                                                                        ? "✓"
                                                                        : isFailed
                                                                          ? "✕"
                                                                          : idx +
                                                                            1}
                                                                </span>
                                                                <span className="stage-name">
                                                                    {stage}
                                                                </span>
                                                                {isActive && (
                                                                    <span className="stage-pulse-badge">
                                                                        RUNNING
                                                                    </span>
                                                                )}
                                                                {isDone && (
                                                                    <span className="stage-done-badge">
                                                                        DONE
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="progress-section">
                                            <div className="progress-labels">
                                                <span>Progress</span>
                                                <span id="progress-pct">
                                                    {progressPct}%
                                                </span>
                                            </div>
                                            <div className="progress-bar-track">
                                                <div
                                                    className="progress-bar-fill"
                                                    id="progress-bar-fill"
                                                    style={{
                                                        width: `${progressPct}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Hook Alert Box */}
                                        {(waiting ||
                                            build?.status === "pending") && (
                                            <div
                                                className="hook-alert-box"
                                                id="hook-alert"
                                            >
                                                <span className="hook-pulse-dot" />
                                                <div className="hook-text-wrap">
                                                    <strong>
                                                        Waiting for you
                                                    </strong>
                                                    <span id="hook-alert-desc">
                                                        {waiting
                                                            ? "Awaiting Research Review acceptance"
                                                            : "Awaiting Build Ready authorization"}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Confirmed Tasks from Plan */}
                                        {plan?.steps &&
                                            plan.steps.length > 0 && (
                                                <div
                                                    className="card"
                                                    style={{
                                                        padding: "10px 12px",
                                                    }}
                                                    id="tasks-container"
                                                >
                                                    <span className="card-tagline">
                                                        Confirmed Tasks (
                                                        {plan.steps.length})
                                                    </span>
                                                    <ul
                                                        style={{
                                                            listStyle: "none",
                                                            padding: 0,
                                                            margin: "6px 0 0",
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            gap: "6px",
                                                        }}
                                                        id="tasks-list"
                                                    >
                                                        {plan.steps.map((s) => {
                                                            const lastEv =
                                                                run.events
                                                                    .filter(
                                                                        (e) =>
                                                                            e.step_id ===
                                                                            s.step_id,
                                                                    )
                                                                    .at(-1);
                                                            return (
                                                                <li
                                                                    key={
                                                                        s.step_id
                                                                    }
                                                                    style={{
                                                                        fontSize:
                                                                            "11px",
                                                                        lineHeight: 1.4,
                                                                    }}
                                                                >
                                                                    <strong
                                                                        style={{
                                                                            color: "var(--text-primary)",
                                                                        }}
                                                                    >
                                                                        {
                                                                            s.responsibility
                                                                        }
                                                                        :
                                                                    </strong>{" "}
                                                                    <span
                                                                        style={{
                                                                            color: "var(--text-secondary)",
                                                                        }}
                                                                    >
                                                                        {
                                                                            s.description
                                                                        }
                                                                    </span>
                                                                    {lastEv?.execution_status && (
                                                                        <small
                                                                            className="block text-blue"
                                                                            style={{
                                                                                fontSize:
                                                                                    "10px",
                                                                            }}
                                                                        >
                                                                            {
                                                                                lastEv.execution_status
                                                                            }
                                                                        </small>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}

                                        {/* Root Cause Card if Failed */}
                                        {run.pipeline_status === "Done" &&
                                            run.test_result === "Failed" &&
                                            run.root_cause && (
                                                <div className="root-cause-card">
                                                    <h2>
                                                        Root Cause Diagnosis
                                                    </h2>
                                                    <p>
                                                        {run.root_cause.issue}
                                                    </p>
                                                    <div className="cause-box">
                                                        <div>
                                                            <strong>
                                                                Expected:
                                                            </strong>{" "}
                                                            {
                                                                run.root_cause
                                                                    .expected
                                                            }
                                                        </div>
                                                        <div>
                                                            <strong>
                                                                Actual:
                                                            </strong>{" "}
                                                            {
                                                                run.root_cause
                                                                    .actual
                                                            }
                                                        </div>
                                                        <div>
                                                            <strong>
                                                                Correction:
                                                            </strong>{" "}
                                                            {
                                                                run.root_cause
                                                                    .required_correction
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        <details className="card-collapsible">
                                            <summary>
                                                Recorded Events (
                                                {run.events.length})
                                            </summary>
                                            <ol
                                                style={{
                                                    listStyle: "none",
                                                    padding: "6px 0 0",
                                                    margin: 0,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "4px",
                                                }}
                                            >
                                                {run.events.map((e) => (
                                                    <li
                                                        key={e.event_id}
                                                        style={{
                                                            fontSize: "10.5px",
                                                            color: "var(--text-muted)",
                                                        }}
                                                    >
                                                        <strong
                                                            style={{
                                                                color: "var(--text-secondary)",
                                                            }}
                                                        >
                                                            {phaseLabel(
                                                                e.processor,
                                                            )}
                                                            :
                                                        </strong>{" "}
                                                        {e.execution_status}
                                                    </li>
                                                ))}
                                            </ol>
                                        </details>
                                    </div>
                                )}
                            </div>

                            {/* Back Face: Job History (§30, §30.1 Split View) */}
                            <div
                                className="flip-face back card-back"
                                id="job-history-face"
                                aria-hidden={!history}
                            >
                                <div className="history-split-container history-split-view">
                                    <div className="history-list-pane">
                                        <div className="history-pane-header">
                                            <span className="pane-title task-panel-title">
                                                Saved Jobs ({jobs.length})
                                            </span>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                title="Reload saved jobs"
                                                onClick={() =>
                                                    setRefreshKey((v) => v + 1)
                                                }
                                            >
                                                ↻
                                            </button>
                                        </div>
                                        <select
                                            id="history-job-select"
                                            value={selectedJob}
                                            onChange={(e) =>
                                                setSelectedJob(e.target.value)
                                            }
                                            style={{ display: "none" }}
                                            aria-label="Select history job"
                                        >
                                            <option value="">
                                                Select a job…
                                            </option>
                                            {jobs.map((j) => (
                                                <option
                                                    key={j.run_id}
                                                    value={j.run_id}
                                                >
                                                    {j.run_id}
                                                </option>
                                            ))}
                                        </select>
                                        {historyStatus && (
                                            <p
                                                style={{
                                                    padding: "8px 12px",
                                                    fontSize: "11px",
                                                    color: "var(--text-dim)",
                                                }}
                                            >
                                                {historyStatus}
                                            </p>
                                        )}
                                        <div
                                            className="history-runs-scroll"
                                            id="history-runs-scroll"
                                        >
                                            {jobs.map((j) => (
                                                <div
                                                    key={j.run_id}
                                                    className={`history-run-item ${selectedJob === j.run_id ? "selected" : ""}`}
                                                    onClick={() =>
                                                        setSelectedJob(j.run_id)
                                                    }
                                                >
                                                    <span className="item-run-id mono">
                                                        {j.run_id}
                                                    </span>
                                                    <span
                                                        className="item-badge"
                                                        style={{
                                                            background:
                                                                j.test_result ===
                                                                "Passed"
                                                                    ? "var(--accent-emerald-bg)"
                                                                    : j.test_result ===
                                                                        "Failed"
                                                                      ? "var(--accent-rose-bg)"
                                                                      : "var(--bg-surface)",
                                                            color:
                                                                j.test_result ===
                                                                "Passed"
                                                                    ? "var(--accent-emerald)"
                                                                    : j.test_result ===
                                                                        "Failed"
                                                                      ? "var(--accent-rose)"
                                                                      : "var(--text-muted)",
                                                        }}
                                                    >
                                                        {j.test_result ||
                                                            j.pipeline_status ||
                                                            "—"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div
                                        className="history-detail-pane"
                                        id="history-job-detail"
                                    >
                                        {!selectedJob ? (
                                            <p
                                                className="detail-empty-msg"
                                                id="detail-empty-msg"
                                            >
                                                Select a job from above to
                                                inspect its recorded state and
                                                workspace changes.
                                            </p>
                                        ) : !historical ? (
                                            <p
                                                className="text-dim"
                                                style={{
                                                    padding: "16px",
                                                    fontSize: "11px",
                                                }}
                                            >
                                                Loading job details and file
                                                mutations…
                                            </p>
                                        ) : (
                                            <div className="detail-content-wrap">
                                                <div
                                                    className="detail-header-row"
                                                    style={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        alignItems: "center",
                                                        marginBottom: "8px",
                                                    }}
                                                >
                                                    <span
                                                        className="mono"
                                                        style={{
                                                            fontSize: "11.5px",
                                                            color: "var(--text-primary)",
                                                        }}
                                                    >
                                                        {historical.run_id}
                                                    </span>
                                                    <span
                                                        className="item-badge"
                                                        style={{
                                                            background:
                                                                historical.test_result ===
                                                                "Passed"
                                                                    ? "var(--accent-emerald-bg)"
                                                                    : "var(--accent-rose-bg)",
                                                            color:
                                                                historical.test_result ===
                                                                "Passed"
                                                                    ? "var(--accent-emerald)"
                                                                    : "var(--accent-rose)",
                                                        }}
                                                    >
                                                        {historical.test_result ||
                                                            historical.pipeline_status}
                                                    </span>
                                                </div>

                                                {historical.hash_proof && (
                                                    <div className="hash-proof-box">
                                                        <div className="hash-row">
                                                            <span className="hash-label">
                                                                Hash Proof:
                                                            </span>
                                                            <span className="hash-val">
                                                                {(
                                                                    historical
                                                                        .hash_proof
                                                                        .created_hash ||
                                                                    ""
                                                                ).slice(0, 16)}
                                                                …
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                <Mutations
                                                    records={
                                                        historicalMutations
                                                    }
                                                />

                                                <details className="card-collapsible">
                                                    <summary>
                                                        History Events (
                                                        {
                                                            historical.events
                                                                .length
                                                        }
                                                        )
                                                    </summary>
                                                    <ol
                                                        style={{
                                                            listStyle: "none",
                                                            padding: "6px 0 0",
                                                            margin: 0,
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            gap: "4px",
                                                        }}
                                                    >
                                                        {historical.events.map(
                                                            (e) => (
                                                                <li
                                                                    key={
                                                                        e.event_id
                                                                    }
                                                                    style={{
                                                                        fontSize:
                                                                            "10px",
                                                                        color: "var(--text-muted)",
                                                                    }}
                                                                >
                                                                    <strong
                                                                        style={{
                                                                            color: "var(--text-secondary)",
                                                                        }}
                                                                    >
                                                                        {phaseLabel(
                                                                            e.processor,
                                                                        )}
                                                                        :
                                                                    </strong>{" "}
                                                                    {
                                                                        e.execution_status
                                                                    }
                                                                </li>
                                                            ),
                                                        )}
                                                    </ol>
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* 5. Right Rail (§31) */}
                <aside
                    className="right-rail"
                    id="right-rail"
                    aria-label="Right Rail Controls"
                >
                    <button
                        type="button"
                        className={`rail-btn ${rightOpen ? "active" : ""}`}
                        id="task-panel-toggle"
                        title="Task Management"
                        aria-pressed={rightOpen}
                        aria-label="Toggle Task Management"
                        onClick={() => setRightOpen(!rightOpen)}
                    >
                        <Icon kind="tasks" />
                    </button>
                    <button
                        type="button"
                        className={`rail-btn ${history ? "active" : ""}`}
                        id="flip-rail-btn"
                        title="Toggle Current Job / Job History"
                        aria-label="Toggle History Flip"
                        onClick={() => setHistory(!history)}
                    >
                        <Icon kind="history" />
                    </button>
                    <div className="rail-spacer" />
                    <button
                        type="button"
                        className="rail-btn"
                        id="settings-rail-btn"
                        title="Provider Configuration"
                        aria-label="Provider Configuration"
                        onClick={() => setSettings(true)}
                    >
                        <Icon kind="settings" />
                    </button>
                </aside>
            </div>

            {/* File Code Viewer Dialog */}
            {file && (
                <CodeViewerModal file={file} close={() => setFile(null)} />
            )}

            {/* New Job Confirmation Modal */}
            {newChat && (
                <Modal title="Start New Job" close={() => setNewChat(false)}>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "14px",
                        }}
                    >
                        <p
                            style={{
                                fontSize: "12.5px",
                                color: "var(--text-secondary)",
                                lineHeight: 1.6,
                            }}
                        >
                            Are you sure you want to start a fresh conversation?
                            This will clear the active prompt and Job context
                            while preserving recorded history.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "8px",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setNewChat(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={resetSelection}
                            >
                                Start New Job
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Provider Configuration Modal */}
            {settings && (
                <Modal
                    title="Provider Configuration"
                    close={() => {
                        setSettings(false);
                        setShowCredential(false);
                    }}
                >
                    <div className="prov-config">
                        <p className="prov-intro">
                            Configure the active model provider and runtime.
                            Credentials are stored on the backend and never
                            returned to the browser.
                        </p>
                        {providerMessage && (
                            <div
                                className={`prov-status-row ${
                                    providerMessage.match(
                                        /failed|Could not|unable/i,
                                    )
                                        ? "error"
                                        : "connected"
                                }`}
                                role="status"
                            >
                                {providerMessage}
                            </div>
                        )}
                        {!providers.length && (
                            <button
                                type="button"
                                className="prov-retry"
                                disabled={providerBusy}
                                onClick={() =>
                                    void loadProviders().catch(() => {})
                                }
                            >
                                Retry provider catalog
                            </button>
                        )}
                        <div className="prov-tiles">
                            {providers.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`prov-tile ${
                                        p.id === settingsProvider
                                            ? "selected"
                                            : ""
                                    } ${
                                        p.id === activeProvider ? "active" : ""
                                    }`}
                                    onClick={() => {
                                        setSettingsProvider(p.id);
                                        setShowCredential(false);
                                    }}
                                >
                                    <span
                                        className={`prov-dot ${
                                            p.id === activeProvider
                                                ? "live"
                                                : ""
                                        }`}
                                    />
                                    <span className="prov-name">
                                        {p.displayName}
                                    </span>
                                    <span className="prov-sub">
                                        {p.runtime?.model ||
                                            p.model ||
                                            "default model"}
                                    </span>
                                    <span
                                        className={`prov-badge ${
                                            p.id === activeProvider
                                                ? "active"
                                                : p.configured
                                                  ? "configured"
                                                  : ""
                                        }`}
                                    >
                                        {p.id === activeProvider
                                            ? "Active"
                                            : p.configured
                                              ? "Configured"
                                              : "Not set"}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {(() => {
                            const selected =
                                providers.find(
                                    (p) => p.id === settingsProvider,
                                ) ||
                                providers.find(
                                    (p) => p.id === activeProvider,
                                ) ||
                                providers[0];
                            if (!selected) return null;
                            const isSelected = selected.id === activeProvider;
                            return (
                                <form
                                    key={selected.id}
                                    className="prov-form"
                                    onSubmit={async (event) => {
                                        event.preventDefault();
                                        if (providerLock.current) return;
                                        providerLock.current = true;
                                        const form = event.currentTarget;
                                        const fields = new FormData(form);
                                        const credential = form.elements.namedItem("credential") as HTMLInputElement | null;
                                        setProviderBusy(true);
                                        setProviderMessage("");
                                        try {
                                            const path = `/api/providers/${encodeURIComponent(selected.id)}`;
                                            if (credential?.value.trim()) {
                                                await request(`${path}/credential`, { value: credential.value.trim() }, "PUT");
                                                credential.value = "";
                                            }
                                            await request(path, {
                                                model: String(fields.get("model") || "").trim(),
                                                apiBase: String(fields.get("apiBase") || "").trim(),
                                            }, "PUT");
                                            const activated = await request<{ activeProvider: string }>(`${path}/activate`, {}, "POST");
                                            setActiveProvider(activated.activeProvider);
                                            void loadProviders().catch(() => {});
                                        } catch (cause) {
                                            setProviderMessage(cause instanceof Error ? cause.message : "Provider configuration failed.");
                                        } finally {
                                            if (credential) credential.value = "";
                                            providerLock.current = false;
                                            setProviderBusy(false);
                                        }
                                    }}
                                >
                                    <div className="prov-form-head">
                                        <strong>{selected.displayName}</strong>
                                        <span className="prov-form-sub">
                                            {selected.credentialType !== "none"
                                                ? "Credential stored server-side · never returned"
                                                : "No credential required"}
                                        </span>
                                    </div>
                                    <div className="field">
                                        <label>Model</label>
                                        <input name="model" aria-label={`${selected.displayName} model`} defaultValue={selected.runtime?.model || selected.model || ""} required disabled={providerBusy} />
                                    </div>
                                    <div className="field">
                                        <label>
                                            API base URL{" "}
                                            <span className="req">(optional)</span>
                                        </label>
                                        <input name="apiBase" type="url" aria-label={`${selected.displayName} API base URL`} defaultValue={selected.runtime?.apiBase || selected.apiBaseUrl || ""} disabled={providerBusy} />
                                    </div>
                                    {selected.credentialType !== "none" && (
                                        <div className="field">
                                            <label>
                                                Credential{" "}
                                                {selected.configured ? (
                                                    <span className="req">
                                                        (saved — leave blank to
                                                        keep)
                                                    </span>
                                                ) : null}
                                            </label>
                                            <div className="secret-field">
                                                <input
                                                    name="credential"
                                                    aria-label={`${selected.displayName} credential`}
                                                    type={
                                                        showCredential
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    autoComplete="off"
                                                    disabled={providerBusy}
                                                    placeholder={
                                                        selected.configured
                                                            ? "••••••••"
                                                            : ""
                                                    }
                                                />
                                                <button
                                                    type="button"
                                                    className="secret-toggle"
                                                    onClick={() =>
                                                        setShowCredential(
                                                            (v) => !v,
                                                        )
                                                    }
                                                    aria-label="Toggle credential visibility"
                                                >
                                                    {showCredential
                                                        ? "Hide"
                                                        : "Show"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="prov-actions">
                                        <span
                                            className={`prov-status-row ${
                                                providerBusy
                                                    ? "testing"
                                                    : isSelected
                                                      ? "connected"
                                                      : ""
                                            }`}
                                            role="status"
                                        >
                                            {providerBusy
                                                ? "Saving…"
                                                : isSelected
                                                  ? "Active provider — requests route here"
                                                  : "Saved — activate to route requests"}
                                        </span>
                                        <button
                                            type="submit"
                                            disabled={providerBusy}
                                            className={`prov-save ${
                                                isSelected ? "primary" : ""
                                            }`}
                                        >
                                            {providerBusy
                                                ? "Saving…"
                                                : "Save & activate"}
                                        </button>
                                    </div>
                                </form>
                            );
                        })()}
                        <div className="prov-list">
                            {providers.map((p) => (
                                <div
                                    key={p.id}
                                    className={`prov-list-row ${
                                        p.id === activeProvider ? "active" : ""
                                    }`}
                                >
                                    <span
                                        className={`prov-dot ${
                                            p.id === activeProvider
                                                ? "live"
                                                : ""
                                        }`}
                                    />
                                    <span className="prov-list-name">
                                        {p.displayName}
                                    </span>
                                    <span className="prov-list-model">
                                        {p.runtime?.model || p.model || "default"}
                                    </span>
                                    <span className="prov-list-state">
                                        {p.id === activeProvider
                                            ? "active"
                                            : p.configured
                                              ? "configured"
                                              : "not set"}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="prov-note">
                            OneShot only calls the provider marked active. You
                            can configure all providers and switch the active
                            one at any time.
                        </p>
                    </div>
                </Modal>
            )}

            {/* Session Access Token Modal */}
            {auth && (
                <Modal
                    title="Session Access Token"
                    close={() => setAuth(false)}
                >
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const input = form.elements.namedItem(
                                "token",
                            ) as HTMLInputElement;
                            if (input.value.trim()) {
                                sessionStorage.setItem(
                                    "oneshot.accessToken",
                                    input.value.trim(),
                                );
                            } else {
                                sessionStorage.removeItem(
                                    "oneshot.accessToken",
                                );
                            }
                            setAuthKey((v) => v + 1);
                            setAuth(false);
                        }}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "14px",
                        }}
                    >
                        <p
                            style={{
                                fontSize: "12px",
                                color: "var(--text-muted)",
                            }}
                        >
                            Enter an optional Bearer token if the OneShot server
                            has ONESHOT_API_TOKEN configured.
                        </p>
                        <input
                            name="token"
                            type="password"
                            defaultValue={
                                sessionStorage.getItem("oneshot.accessToken") ||
                                ""
                            }
                            placeholder="API Access Token"
                            style={{
                                padding: "8px 10px",
                                background: "var(--bg-input)",
                                border: "1px solid var(--line-subtle)",
                                borderRadius: "var(--radius-sm)",
                                color: "var(--text-primary)",
                                fontSize: "12px",
                            }}
                        />
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "8px",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setAuth(false)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary">
                                Save Token
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
