/**
 * AI Swarm v3.0.0 - Parse Targets Activity
 *
 * Parses user instructions to extract target files and URLs for visual editing.
 */

import { invokeGeminiCLI, logger, logActivityStart, logActivityComplete } from '@ai-swarm/shared';
import type { ParseTargetsInput, ParseTargetsOutput, TargetPage } from './types.js';
import { readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';

/**
 * Parse a user's high-level instruction to extract:
 * 1. The styling instruction (what to change)
 * 2. Target pages (which files/URLs to modify)
 */
export async function parseTargets(input: ParseTargetsInput): Promise<ParseTargetsOutput> {
    const startTime = Date.now();
    logActivityStart('visual-swarm', 'parseTargets', { projectDir: input.projectDir });

    try {
        // First, try to discover component files in the project
        const componentFiles = await discoverComponentFiles(input.projectDir);

        const prompt = `You are an expert at understanding frontend development requests.

**User Request:**
${input.userInstruction}

${input.conversationContext ? `**Conversation Context:**\n${input.conversationContext}\n` : ''}

**Available Component Files in Project:**
${componentFiles.slice(0, 50).map(f => `- ${f}`).join('\n')}

Parse this request and extract:
1. The styling instruction (what visual changes to make)
2. Which files/pages need to be modified

Respond with a JSON object in this exact format:
{
    "stylingInstruction": "The specific styling change to apply",
    "targets": [
        {
            "url": "http://localhost:3000/path",
            "filePath": "/path/to/component.tsx",
            "componentName": "ComponentName"
        }
    ],
    "confidence": 0.0-1.0
}

**Rules:**
1. If specific files are mentioned, use those
2. If "all pages" or similar is mentioned, include multiple targets
3. Default to localhost:3000 for URL base unless specified otherwise
4. Match file paths to the available component files when possible
5. Set confidence based on how clear the instruction is`;

        const response = await invokeGeminiCLI(prompt, {
            role: 'planner',
            cwd: input.projectDir,
            timeout: 2 * 60 * 1000,
        });

        // Parse the response
        const result = parseResponse(response, componentFiles);

        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'parseTargets', durationMs, true);

        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;
        logActivityComplete('visual-swarm', 'parseTargets', durationMs, false);

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'Failed to parse targets');

        // Return a fallback with the original instruction
        return {
            stylingInstruction: input.userInstruction,
            targets: [],
            confidence: 0,
        };
    }
}

/**
 * Discover component files in the project recursively.
 */
async function discoverComponentFiles(projectDir: string): Promise<string[]> {
    const files: string[] = [];
    const validExtensions = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'];
    const ignoreDirs = ['node_modules', 'dist', 'build', '.next', '.git', 'coverage', '__tests__'];

    async function walkDir(dir: string, depth: number = 0): Promise<void> {
        // Limit recursion depth to avoid extremely deep trees
        if (depth > 10) return;

        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip ignored directories
                    if (ignoreDirs.includes(entry.name)) continue;
                    await walkDir(fullPath, depth + 1);
                } else if (entry.isFile()) {
                    // Check if it's a valid component file
                    const ext = extname(entry.name);
                    if (validExtensions.includes(ext)) {
                        // Prefer files in common component directories
                        if (fullPath.includes('/src/') ||
                            fullPath.includes('/app/') ||
                            fullPath.includes('/pages/') ||
                            fullPath.includes('/components/')) {
                            files.push(fullPath);
                        }
                    }
                }
            }
        } catch {
            // Directory might not exist or be readable
        }
    }

    await walkDir(projectDir);

    // Limit to first 100 files to avoid overwhelming the LLM
    return files.slice(0, 100).sort();
}

/**
 * Parse the LLM response into a ParseTargetsOutput.
 */
function parseResponse(response: string, availableFiles: string[]): ParseTargetsOutput {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and normalize targets
            const targets: TargetPage[] = [];
            if (Array.isArray(parsed.targets)) {
                for (const target of parsed.targets) {
                    if (target.filePath) {
                        // Try to match to an available file
                        const matchedFile = findBestMatch(target.filePath, availableFiles);
                        targets.push({
                            url: target.url || 'http://localhost:3000',
                            filePath: matchedFile || target.filePath,
                            componentName: target.componentName,
                        });
                    }
                }
            }

            return {
                stylingInstruction: parsed.stylingInstruction || response,
                targets,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
            };
        }
    } catch {
        // JSON parsing failed
    }

    // Fallback
    return {
        stylingInstruction: response,
        targets: [],
        confidence: 0.3,
    };
}

/**
 * Find the best matching file path from available files.
 */
function findBestMatch(searchPath: string, availableFiles: string[]): string | null {
    const searchName = basename(searchPath);

    // Exact match
    const exact = availableFiles.find(f => f.endsWith(searchPath) || f === searchPath);
    if (exact) return exact;

    // Filename match
    const byName = availableFiles.find(f => basename(f) === searchName);
    if (byName) return byName;

    // Partial match
    const partial = availableFiles.find(f => f.includes(searchName.replace(/\.[^.]+$/, '')));
    if (partial) return partial;

    return null;
}
