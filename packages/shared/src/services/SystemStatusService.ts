/**
 * AI Swarm v3.0.0 - System Status Service
 * 
 * Handles real-time status checks (CLI auth, etc.)
 * 
 * IMPORTANT (2026-01-16): All checks MUST be file-based only.
 * DO NOT spawn external processes here - this runs every 30 seconds
 * per worker and will cause memory exhaustion if processes leak.
 */

import { access, constants } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '../logger.js';

export class SystemStatusService {
    /**
     * Check authentication status for Claude Code and Gemini CLI
     * 
     * IMPORTANT: This method is called every 30 seconds by worker heartbeats.
     * It MUST NOT spawn any external processes to avoid resource leaks.
     * All checks are file-based only.
     * 
     * Bug fix (2026-01-16): Previously used `claude doctor` which spawned
     * orphaned processes causing server crashes due to memory exhaustion.
     */
    async checkAuthStatus() {
        const results = {
            claude: { authenticated: false, message: '' },
            gemini: { authenticated: false, message: '' }
        };

        // =====================================================================
        // CLAUDE AUTH CHECK (File-based only - NO process spawning!)
        // =====================================================================
        // Check for Claude credential files in common locations
        // Reference: Claude stores OAuth in ~/.claude/ directory
        try {
            const claudeDir = join(homedir(), '.claude');

            // Check for credential files that indicate authentication
            const claudeCredentialPaths = [
                join(claudeDir, 'credentials.json'),  // OAuth credentials
                join(claudeDir, 'oauth.json'),        // Alternative OAuth location
                join(claudeDir, 'settings.json'),     // Settings with API key
            ];

            let claudeAuthenticated = false;
            let claudeCredentialType = '';

            for (const credPath of claudeCredentialPaths) {
                try {
                    await access(credPath, constants.R_OK);
                    claudeAuthenticated = true;
                    claudeCredentialType = credPath.split('/').pop() || 'credentials';
                    break;
                } catch {
                    // Continue checking other paths
                }
            }

            if (claudeAuthenticated) {
                results.claude.authenticated = true;
                results.claude.message = 'Authenticated';
                logger.debug({ credentialType: claudeCredentialType }, 'Claude credentials found');
            } else {
                results.claude.message = 'Requires Login';
            }
        } catch (err: any) {
            logger.debug({ err }, 'Claude auth check failed');
            results.claude.message = 'Requires Login';
        }

        // =====================================================================
        // GEMINI AUTH CHECK (File-based only - NO process spawning!)
        // =====================================================================
        // Reference: GEMINI_CLI.md - settings stored in ~/.gemini/settings.json
        try {
            const geminiDir = join(homedir(), '.gemini');
            const googleGeminiDir = join(homedir(), '.config', 'google-gemini-cli');

            // Check for credential files in both possible locations
            const geminiCredentialPaths = [
                join(geminiDir, 'credentials.json'),
                join(geminiDir, 'settings.json'),
                join(geminiDir, 'oauth_credentials.json'),
                join(googleGeminiDir, 'credentials.json'),
                join(googleGeminiDir, 'settings.json'),
            ];

            let geminiAuthenticated = false;
            for (const credPath of geminiCredentialPaths) {
                try {
                    await access(credPath, constants.R_OK);
                    geminiAuthenticated = true;
                    break;
                } catch {
                    // Continue checking other paths
                }
            }

            if (geminiAuthenticated) {
                results.gemini.authenticated = true;
                results.gemini.message = 'Authenticated';
            } else {
                results.gemini.message = 'Requires Login';
            }
        } catch (err: any) {
            logger.debug({ err }, 'Gemini auth check failed');
            results.gemini.message = 'Requires Login';
        }

        return results;
    }
}

export const systemStatusService = new SystemStatusService();
