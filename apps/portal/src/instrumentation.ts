/**
 * AI Swarm v3.0.2 - Portal Instrumentation
 * 
 * This file runs once when the Next.js server starts.
 * We use it to initialize the Health Guardian monitoring service.
 * 
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Only run on the server (not during build or in Edge runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        console.log('[instrumentation] Initializing AI Swarm Portal services...');

        // Start the Health Guardian if enabled
        const ENABLE_HEALTH_GUARDIAN = process.env.HEALTH_GUARDIAN_ENABLED !== 'false';

        if (ENABLE_HEALTH_GUARDIAN) {
            try {
                // Dynamic import to avoid issues during build
                const { healthGuardianService } = await import('@ai-swarm/shared');

                console.log('[instrumentation] Starting Health Guardian...');
                healthGuardianService.start();
                console.log('[instrumentation] Health Guardian started successfully');

                // Log initial status after first check completes
                setTimeout(async () => {
                    const status = healthGuardianService.getLastStatus();
                    if (status) {
                        console.log(`[instrumentation] Initial health check: ${status.level}`);
                        console.log(`[instrumentation] Memory: ${status.memoryUsedPercent}% (${status.memoryUsedMB}MB / ${status.memoryTotalMB}MB)`);
                        console.log(`[instrumentation] Load: ${status.loadAverage1m.toFixed(2)} / ${status.loadAverage5m.toFixed(2)} / ${status.loadAverage15m.toFixed(2)}`);
                        console.log(`[instrumentation] Processes - Claude: ${status.claudeProcessCount}, Gemini: ${status.geminiProcessCount}, Total: ${status.totalProcessCount}`);

                        if (status.issues.length > 0) {
                            console.warn('[instrumentation] Health issues detected:', status.issues);
                        }
                    }
                }, 5000); // Wait 5 seconds for first check to complete

            } catch (err) {
                console.error('[instrumentation] Failed to start Health Guardian:', err);
            }
        } else {
            console.log('[instrumentation] Health Guardian DISABLED via HEALTH_GUARDIAN_ENABLED=false');
        }
    }
}
