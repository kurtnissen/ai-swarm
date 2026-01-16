/**
 * AI Swarm v3.0.0 - Visual Swarm Types
 *
 * Type definitions for the visual swarm fan-out workflow.
 */

/**
 * A target page for visual editing.
 */
export interface TargetPage {
    /** URL to verify, e.g., "http://localhost:3000/dashboard" */
    url: string;
    /** File path to edit, e.g., "/apps/my-project/src/app/dashboard/page.tsx" */
    filePath: string;
    /** Optional component name for context */
    componentName?: string;
}

/**
 * Input for the Visual Swarm workflow.
 */
export interface VisualSwarmInput {
    /** Target pages to process in parallel */
    targets: TargetPage[];
    /** Styling instruction to apply, e.g., "Change all buttons to have rounded corners and blue backgrounds" */
    stylingInstruction: string;
    /** Project ID for context and credential lookup */
    projectId: string;
    /** Maximum retries per target (default: 3) */
    maxRetries?: number;
    /** Project directory path */
    projectDir?: string;
}

/**
 * Result for a single target.
 */
export interface TargetResult {
    /** Target URL */
    url: string;
    /** File path that was edited */
    filePath: string;
    /** Whether all edits passed verification */
    success: boolean;
    /** Number of attempts made */
    attempts: number;
    /** Final screenshot as base64 */
    finalScreenshot?: string;
    /** Error message if failed */
    error?: string;
    /** AI verification feedback for each attempt */
    verificationHistory?: VerificationResult[];
}

/**
 * Result from AI verification of a screenshot.
 */
export interface VerificationResult {
    /** Whether the styling instruction was successfully applied */
    passed: boolean;
    /** Confidence score (0-1) */
    confidence: number;
    /** What the AI observed */
    observation: string;
    /** Specific issues found */
    issues?: string[];
    /** Suggestions for fixing issues */
    suggestions?: string[];
}

/**
 * Output from the Visual Swarm workflow.
 */
export interface VisualSwarmOutput {
    /** Workflow execution ID */
    workflowId: string;
    /** Results for each target */
    results: TargetResult[];
    /** Total workflow duration in ms */
    duration: number;
    /** Overall success (all targets passed) */
    allPassed: boolean;
    /** Summary message */
    summary: string;
}

/**
 * Input for the applyGeminiEdit activity.
 */
export interface ApplyEditInput {
    /** File path to edit */
    filePath: string;
    /** Styling instruction to apply */
    instruction: string;
    /** Project directory for context */
    projectDir: string;
    /** Previous verification feedback to incorporate */
    previousFeedback?: string;
}

/**
 * Output from the applyGeminiEdit activity.
 */
export interface ApplyEditOutput {
    /** Whether the edit was applied */
    success: boolean;
    /** Files that were changed */
    filesChanged: string[];
    /** Error message if failed */
    error?: string;
    /** Raw LLM output for debugging */
    llmOutput?: string;
}

/**
 * Input for the verifyWithAI activity.
 */
export interface VerifyWithAIInput {
    /** Base64 encoded screenshot */
    screenshotBase64: string;
    /** Original styling instruction */
    instruction: string;
    /** File path that was edited (for context) */
    filePath: string;
    /** Target URL (for context) */
    url: string;
}

/**
 * Input for parseTargets activity.
 */
export interface ParseTargetsInput {
    /** User's high-level instruction */
    userInstruction: string;
    /** Conversation context */
    conversationContext?: string;
    /** Project directory to search for files */
    projectDir: string;
}

/**
 * Output from parseTargets activity.
 */
export interface ParseTargetsOutput {
    /** Extracted styling instruction */
    stylingInstruction: string;
    /** Parsed target pages */
    targets: TargetPage[];
    /** Confidence in the parsing */
    confidence: number;
}
