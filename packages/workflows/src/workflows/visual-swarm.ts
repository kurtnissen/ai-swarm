/**
 * AI Swarm v3.0.0 - Visual Swarm Workflow
 *
 * High-concurrency fan-out workflow for parallel visual editing tasks.
 * Uses Temporal child workflows for true parallel execution.
 *
 * Pattern:
 * VisualSwarmWorkflow (parent)
 * ├── VisualEditChildWorkflow (target 1) - runs in parallel
 * ├── VisualEditChildWorkflow (target 2) - runs in parallel
 * ├── VisualEditChildWorkflow (target 3) - runs in parallel
 * └── ... more targets
 *
 * Each child workflow:
 * 1. Apply edit using Gemini
 * 2. Capture screenshot
 * 3. Verify with AI
 * 4. Retry if failed (up to maxRetries)
 */

import {
    proxyActivities,
    executeChild,
    workflowInfo,
    defineSignal,
    setHandler,
} from '@temporalio/workflow';

// =============================================================================
// TYPE DEFINITIONS (inline to avoid bundler issues with activity imports)
// =============================================================================

interface TargetPage {
    url: string;
    filePath: string;
    componentName?: string;
}

interface VisualSwarmInput {
    targets: TargetPage[];
    stylingInstruction: string;
    projectId: string;
    maxRetries?: number;
    projectDir?: string;
    /** Max concurrent child workflows (default: 4) */
    concurrency?: number;
}

interface TargetResult {
    url: string;
    filePath: string;
    success: boolean;
    attempts: number;
    finalScreenshot?: string;
    error?: string;
    verificationHistory?: VerificationResult[];
}

interface VerificationResult {
    passed: boolean;
    confidence: number;
    observation: string;
    issues?: string[];
    suggestions?: string[];
}

interface VisualSwarmOutput {
    workflowId: string;
    results: TargetResult[];
    duration: number;
    allPassed: boolean;
    summary: string;
}

interface ApplyEditInput {
    filePath: string;
    instruction: string;
    projectDir: string;
    previousFeedback?: string;
}

interface ApplyEditOutput {
    success: boolean;
    filesChanged: string[];
    error?: string;
    llmOutput?: string;
}

interface VerifyWithAIInput {
    screenshotBase64: string;
    instruction: string;
    filePath: string;
    url: string;
}

interface CaptureScreenshotInput {
    url: string;
    authenticated?: boolean;
}

interface CaptureScreenshotOutput {
    success: boolean;
    base64?: string;
    title?: string;
    error?: string;
}

// Activity interfaces for proxyActivities
interface VisualActivities {
    applyGeminiEdit(input: ApplyEditInput): Promise<ApplyEditOutput>;
    captureVisualScreenshot(input: CaptureScreenshotInput): Promise<CaptureScreenshotOutput>;
    verifyWithAI(input: VerifyWithAIInput): Promise<VerificationResult>;
}

interface BaseActivities {
    sendNotification(input: { subject: string; body: string; priority?: string }): Promise<void>;
}

// =============================================================================
// ACTIVITY PROXIES
// =============================================================================

const {
    applyGeminiEdit,
    captureVisualScreenshot,
    verifyWithAI,
} = proxyActivities<VisualActivities>({
    startToCloseTimeout: '10 minutes',
    retry: {
        maximumAttempts: 2,
        initialInterval: '5s',
        backoffCoefficient: 2,
    },
});

const {
    sendNotification,
} = proxyActivities<BaseActivities>({
    startToCloseTimeout: '2 minutes',
});

// =============================================================================
// SIGNALS
// =============================================================================

/**
 * Signal to cancel all running child workflows.
 */
export const cancelSwarmSignal = defineSignal('cancelSwarm');

// =============================================================================
// CHILD WORKFLOW: Single Target Edit
// =============================================================================

export interface VisualEditChildInput {
    target: TargetPage;
    stylingInstruction: string;
    projectDir: string;
    maxRetries: number;
}

// Default concurrency limit - matches typical worker count
const DEFAULT_CONCURRENCY = 4;

/**
 * Child workflow for editing a single target.
 * Runs the edit -> screenshot -> verify loop with retries.
 */
export async function visualEditChild(input: VisualEditChildInput): Promise<TargetResult> {
    const { target, stylingInstruction, projectDir, maxRetries } = input;
    const verificationHistory: VerificationResult[] = [];

    let lastError: string | undefined;
    let finalScreenshot: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Build feedback from previous attempts
        const previousFeedback = verificationHistory.length > 0
            ? verificationHistory.map((v, i) =>
                `Attempt ${i + 1}: ${v.passed ? 'PASSED' : 'FAILED'}\n` +
                `Observation: ${v.observation}\n` +
                `Issues: ${v.issues?.join(', ') || 'None'}\n` +
                `Suggestions: ${v.suggestions?.join(', ') || 'None'}`
            ).join('\n\n')
            : undefined;

        // Step 1: Apply the edit
        const editInput: ApplyEditInput = {
            filePath: target.filePath,
            instruction: stylingInstruction,
            projectDir,
            previousFeedback,
        };

        const editResult: ApplyEditOutput = await applyGeminiEdit(editInput);

        if (!editResult.success) {
            lastError = editResult.error || 'Edit failed';
            verificationHistory.push({
                passed: false,
                confidence: 0,
                observation: `Edit failed: ${lastError}`,
                issues: ['Gemini edit failed to complete'],
            });
            continue;
        }

        // Step 2: Capture screenshot
        const screenshotInput: CaptureScreenshotInput = {
            url: target.url,
            authenticated: false, // TODO: Make configurable
        };

        const screenshotResult: CaptureScreenshotOutput = await captureVisualScreenshot(screenshotInput);

        if (!screenshotResult.success || !screenshotResult.base64) {
            lastError = screenshotResult.error || 'Screenshot capture failed';
            verificationHistory.push({
                passed: false,
                confidence: 0,
                observation: `Screenshot failed: ${lastError}`,
                issues: ['Could not capture screenshot for verification'],
            });
            continue;
        }

        finalScreenshot = screenshotResult.base64;

        // Step 3: Verify with AI
        const verifyInput: VerifyWithAIInput = {
            screenshotBase64: screenshotResult.base64,
            instruction: stylingInstruction,
            filePath: target.filePath,
            url: target.url,
        };

        const verifyResult: VerificationResult = await verifyWithAI(verifyInput);
        verificationHistory.push(verifyResult);

        if (verifyResult.passed) {
            // Success!
            return {
                url: target.url,
                filePath: target.filePath,
                success: true,
                attempts: attempt,
                finalScreenshot,
                verificationHistory,
            };
        }

        // Verification failed, will retry
        lastError = verifyResult.issues?.join('; ') || 'Verification failed';
    }

    // All retries exhausted
    return {
        url: target.url,
        filePath: target.filePath,
        success: false,
        attempts: maxRetries,
        finalScreenshot,
        error: lastError || 'Max retries exceeded',
        verificationHistory,
    };
}

// =============================================================================
// MAIN WORKFLOW: Fan-Out Orchestrator
// =============================================================================

/**
 * Visual Swarm Workflow
 *
 * Orchestrates parallel visual editing across multiple targets.
 * Uses executeChild() for true concurrent execution.
 */
export async function visualSwarm(input: VisualSwarmInput): Promise<VisualSwarmOutput> {
    const { workflowId } = workflowInfo();
    const startTime = Date.now();

    const {
        targets,
        stylingInstruction,
        projectId,
        projectDir = '/apps',
        maxRetries = 3,
        concurrency = DEFAULT_CONCURRENCY,
    } = input;

    let cancelled = false;

    // Signal handler for cancellation
    setHandler(cancelSwarmSignal, () => {
        cancelled = true;
    });

    // Check for empty targets
    if (targets.length === 0) {
        return {
            workflowId,
            results: [],
            duration: Date.now() - startTime,
            allPassed: false,
            summary: 'No targets provided for visual swarm',
        };
    }

    // ==========================================================================
    // FAN-OUT WITH CONCURRENCY LIMIT
    // Process targets in batches to respect worker capacity
    // ==========================================================================

    const results: TargetResult[] = [];
    const batchSize = Math.min(concurrency, targets.length);

    // Process in batches
    for (let i = 0; i < targets.length; i += batchSize) {
        if (cancelled) break;

        const batch = targets.slice(i, i + batchSize);
        const batchPromises = batch.map((target, batchIndex) =>
            executeChild(visualEditChild, {
                workflowId: `${workflowId}-child-${i + batchIndex}`,
                args: [{
                    target,
                    stylingInstruction,
                    projectDir,
                    maxRetries,
                }],
            })
        );

        // Wait for this batch to complete before starting next
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    // ==========================================================================
    // AGGREGATE RESULTS
    // ==========================================================================

    const duration = Date.now() - startTime;
    const passedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const allPassed = failedCount === 0;

    const summary = allPassed
        ? `All ${passedCount} targets passed visual verification`
        : `${passedCount}/${targets.length} targets passed, ${failedCount} failed`;

    // Send notification with results
    if (failedCount > 0) {
        const failedTargets = results.filter(r => !r.success);
        await sendNotification({
            subject: `[AI Swarm] Visual Swarm Completed with Failures`,
            body: `
Visual Swarm workflow completed.

**Summary:** ${summary}
**Duration:** ${Math.round(duration / 1000)}s

**Failed Targets:**
${failedTargets.map(t => `- ${t.url} (${t.filePath}): ${t.error}`).join('\n')}

Review the changes and retry failed targets if needed.
            `.trim(),
            priority: 'normal',
        });
    }

    return {
        workflowId,
        results,
        duration,
        allPassed,
        summary,
    };
}
