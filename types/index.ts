// ─── Automation Result Types ──────────────────────────────────────────────────

export type ResultStatus = 'pass' | 'error' | 'skipped';

export interface TestResult {
    type: string;
    element: string;
    status: ResultStatus;
    action?: string;
    reason?: string;
    screenshot?: string;
}

export interface AutomationSummary {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

export interface AutomationOutput {
    results: TestResult[];
    summary: AutomationSummary;
    screenshots: string[];
    recording?: string; // filename video di /recordings/
}

// ─── SSE Log Event Types ─────────────────────────────────────────────────────

export type LogType =
    | 'info'
    | 'success'
    | 'warn'
    | 'error'
    | 'section'
    | 'screenshot'
    | 'done';

export interface LogEvent {
    type: LogType | 'done';
    message: string;
    file?: string;
    timestamp: string;
    result?: AutomationOutput;
}

// ─── API Request/Response Types ───────────────────────────────────────────────

export interface RunTestRequest {
    url: string;
}

export interface RunTestError {
    error: string;
}
