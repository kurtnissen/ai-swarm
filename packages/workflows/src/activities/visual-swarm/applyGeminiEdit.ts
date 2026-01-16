/**
 * AI Swarm v3.0.0 - Apply Gemini Edit Activity
 *
 * Uses Gemini CLI to apply styling edits to a file.
 */

import { invokeGeminiCLI, logger, logActivityStart, logActivityComplete } from '@ai-swarm/shared';
import type { ApplyEditInput, ApplyEditOutput } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Apply a styling edit to a file using Gemini CLI.
 * Incorporates previous feedback if this is a retry attempt.
 */
export async function applyGeminiEdit(input: ApplyEditInput): Promise<ApplyEditOutput> {
    const startTime = Date.now();
    logActivityStart('visual-swarm', 'applyGeminiEdit', { filePath: input.filePath });

    try {
        // Build the prompt for Gemini
        let prompt = `You are a frontend styling expert. Apply the following styling change to the file.

**File to edit:** ${input.filePath}

**Styling Instruction:** ${input.instruction}

**Important Guidelines:**
1. Make ONLY the styling changes requested - do not modify functionality
2. Preserve all existing functionality and structure
3. Use appropriate styling approach (CSS, Tailwind, styled-components, etc.) based on the existing codebase
4. Ensure the changes are consistent with the existing code style
5. After making changes, run: git add . && git commit -m "style: apply visual swarm edit to ${input.filePath.split('/').pop()}"

Apply the changes now.`;

        // Add previous feedback if retrying
        if (input.previousFeedback) {
            prompt += `

**IMPORTANT - Previous Attempt Failed:**
The last edit attempt did not pass visual verification. Here's the feedback:
${input.previousFeedback}

Please address these issues in your edit.`;
        }

        // Invoke Gemini CLI
        const response = await invokeGeminiCLI(prompt, {
            role: 'coder',
            cwd: input.projectDir,
            timeout: 5 * 60 * 1000, // 5 minute timeout
        });

        // Get the list of changed files
        let filesChanged: string[] = [];
        try {
            const { stdout } = await execAsync('git diff --name-only HEAD~1', { cwd: input.projectDir });
            filesChanged = stdout.trim().split('\n').filter(Boolean);
        } catch {
            // If git diff fails (e.g., no commits), try to get staged files
            try {
                const { stdout } = await execAsync('git diff --cached --name-only', { cwd: input.projectDir });
                filesChanged = stdout.trim().split('\n').filter(Boolean);
            } catch {
                filesChanged = [input.filePath];
            }
        }

        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'applyGeminiEdit', durationMs, true);

        return {
            success: true,
            filesChanged,
            llmOutput: response,
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'applyGeminiEdit', durationMs, false);

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage, filePath: input.filePath }, 'Failed to apply Gemini edit');

        return {
            success: false,
            filesChanged: [],
            error: errorMessage,
        };
    }
}
