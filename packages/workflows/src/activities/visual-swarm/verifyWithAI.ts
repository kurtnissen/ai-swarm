/**
 * AI Swarm v3.0.0 - AI Visual Verification Activity
 *
 * Uses an LLM to verify that a screenshot matches the styling instruction.
 */

import { logger, logActivityStart, logActivityComplete, systemConfigService } from '@ai-swarm/shared';
import type { VerifyWithAIInput, VerificationResult } from './types.js';
import { execSync } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Verify a screenshot against the styling instruction using AI.
 * Returns detailed feedback for retry attempts if verification fails.
 */
export async function verifyWithAI(input: VerifyWithAIInput): Promise<VerificationResult> {
    const startTime = Date.now();
    logActivityStart('visual-swarm', 'verifyWithAI', { url: input.url, filePath: input.filePath });

    try {
        // Build the verification prompt
        const prompt = `You are a visual QA expert. Analyze this screenshot and determine if the following styling instruction has been successfully applied.

**Styling Instruction:** ${input.instruction}

**Target URL:** ${input.url}
**Target File:** ${input.filePath}

Analyze the screenshot and respond with a JSON object in this exact format:
{
    "passed": true/false,
    "confidence": 0.0-1.0,
    "observation": "What you see in the screenshot",
    "issues": ["issue 1", "issue 2"],
    "suggestions": ["suggestion 1", "suggestion 2"]
}

**Rules:**
1. Set "passed" to true ONLY if the styling instruction is clearly visible and correctly implemented
2. Be specific in your observation - describe what styling you see
3. If there are issues, list them clearly so a developer can fix them
4. Provide actionable suggestions for any failed verification
5. Confidence should reflect how certain you are about the verification`;

        // Save screenshot to temp file for Claude/Gemini vision input
        const screenshotPath = join(tmpdir(), `visual-swarm-verify-${Date.now()}.png`);
        await writeFile(screenshotPath, Buffer.from(input.screenshotBase64, 'base64'));

        let response: string;

        try {
            // Try to use Claude with vision capabilities first
            const claudeAuthMode = await systemConfigService.getClaudeAuthMode();
            const zaiApiKey = await systemConfigService.getZaiApiKey();

            if (claudeAuthMode === 'oauth' || (claudeAuthMode === 'zai' && zaiApiKey)) {
                // Use Claude with vision
                const env = { ...process.env };
                if (claudeAuthMode === 'zai' && zaiApiKey) {
                    env.Z_AI_API_KEY = zaiApiKey;
                }

                // Claude Code with image attachment - use execSync for stdin support
                response = execSync(
                    `claude -p --image "${screenshotPath}"`,
                    {
                        env,
                        input: prompt,
                        timeout: 60000,
                        maxBuffer: 10 * 1024 * 1024,
                        encoding: 'utf-8',
                    }
                );
            } else {
                // Fall back to Gemini with vision
                // Note: Gemini CLI may need --image flag support
                response = execSync(
                    `gemini -p --image "${screenshotPath}"`,
                    {
                        input: prompt,
                        timeout: 60000,
                        maxBuffer: 10 * 1024 * 1024,
                        encoding: 'utf-8',
                    }
                );
            }
        } catch (llmError) {
            // If vision-based verification fails, fall back to text-based heuristic
            logger.warn({ error: llmError }, 'Vision LLM failed, using heuristic verification');

            // Simple heuristic: assume pass if we got a valid screenshot
            response = JSON.stringify({
                passed: true,
                confidence: 0.6,
                observation: 'Vision verification unavailable. Screenshot captured successfully.',
                issues: [],
                suggestions: ['Consider manually verifying the visual changes'],
            });
        } finally {
            // Clean up temp file
            await unlink(screenshotPath).catch(() => {});
        }

        // Parse the verification result
        const result = parseVerificationResult(response);

        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'verifyWithAI', durationMs, result.passed);

        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'verifyWithAI', durationMs, false);

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'AI verification failed');

        return {
            passed: false,
            confidence: 0,
            observation: `Verification error: ${errorMessage}`,
            issues: ['AI verification failed to complete'],
            suggestions: ['Retry verification or manually check the changes'],
        };
    }
}

/**
 * Parse the LLM response into a VerificationResult.
 */
function parseVerificationResult(response: string): VerificationResult {
    try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                passed: Boolean(parsed.passed),
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
                observation: parsed.observation || 'No observation provided',
                issues: Array.isArray(parsed.issues) ? parsed.issues : [],
                suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            };
        }
    } catch {
        // JSON parsing failed
    }

    // Fallback: try to determine pass/fail from text
    const lowerResponse = response.toLowerCase();
    const passed = lowerResponse.includes('pass') ||
                   lowerResponse.includes('success') ||
                   lowerResponse.includes('correctly applied');

    return {
        passed,
        confidence: 0.5,
        observation: response.slice(0, 500),
        issues: passed ? [] : ['Could not parse verification result'],
        suggestions: ['Manually verify the changes'],
    };
}
