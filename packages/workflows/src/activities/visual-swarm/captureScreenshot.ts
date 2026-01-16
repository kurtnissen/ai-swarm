/**
 * AI Swarm v3.0.0 - Capture Screenshot Activity
 *
 * Captures screenshots using the Playwright sidecar for visual verification.
 */

import { logger, logActivityStart, logActivityComplete } from '@ai-swarm/shared';
import { captureScreenshotAsBase64, captureAuthenticatedScreenshot, deleteScreenshot } from '../playwright-runner.js';

export interface CaptureScreenshotInput {
    url: string;
    authenticated?: boolean;
}

export interface CaptureScreenshotOutput {
    success: boolean;
    base64?: string;
    title?: string;
    error?: string;
}

/**
 * Capture a screenshot of a URL using Playwright.
 * Returns the screenshot as base64 for AI verification.
 */
export async function captureVisualScreenshot(input: CaptureScreenshotInput): Promise<CaptureScreenshotOutput> {
    const startTime = Date.now();
    logActivityStart('visual-swarm', 'captureVisualScreenshot', { url: input.url });

    try {
        // Use authenticated or regular screenshot based on input
        const result = input.authenticated
            ? await captureAuthenticatedScreenshot({ url: input.url })
            : await captureScreenshotAsBase64(input.url);

        if (!result.success) {
            throw new Error(result.error || 'Screenshot capture failed');
        }

        // Clean up the file after getting base64
        if (result.filePath) {
            await deleteScreenshot(result.filePath);
        }

        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'captureVisualScreenshot', durationMs, true);

        return {
            success: true,
            base64: result.base64,
            title: result.title,
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'captureVisualScreenshot', durationMs, false);

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage, url: input.url }, 'Failed to capture screenshot');

        return {
            success: false,
            error: errorMessage,
        };
    }
}
