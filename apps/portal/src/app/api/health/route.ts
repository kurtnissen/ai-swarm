/**
 * AI Swarm v3.0.2 - Health Guardian API
 * 
 * GET /api/health - Get current health status
 * POST /api/health - Trigger immediate health check or control guardian
 */

import { NextRequest, NextResponse } from 'next/server';
import { healthGuardianService, HealthStatus } from '@ai-swarm/shared';

/**
 * GET /api/health
 * Get the current health status from the Health Guardian
 * Always runs a fresh check (cached singleton doesn't work with standalone bundle)
 */
export async function GET() {
    try {
        // Run a fresh health check each time (standalone bundle has separate module instances)
        const status = await healthGuardianService.runHealthCheck();

        return NextResponse.json({
            guardian: {
                enabled: true,
                lastCheck: status.timestamp,
            },
            health: {
                level: status.level,
                issues: status.issues,
                actionsTaken: status.actionsTaken,
            },
            system: {
                memory: {
                    usedPercent: status.memoryUsedPercent,
                    usedMB: status.memoryUsedMB,
                    totalMB: status.memoryTotalMB,
                },
                load: {
                    avg1m: status.loadAverage1m,
                    avg5m: status.loadAverage5m,
                    avg15m: status.loadAverage15m,
                    cpuCount: status.cpuCount,
                },
                processes: {
                    claude: status.claudeProcessCount,
                    gemini: status.geminiProcessCount,
                    total: status.totalProcessCount,
                },
            },
        });

    } catch (error) {
        console.error('Health API error:', error);
        return NextResponse.json(
            { error: 'Failed to get health status' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/health
 * Control the Health Guardian or trigger immediate check
 * Body: { action: 'check' | 'stop' | 'start' }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'check':
                // Trigger immediate health check
                const status = await healthGuardianService.runHealthCheck();
                return NextResponse.json({
                    success: true,
                    message: 'Health check completed',
                    status,
                });

            case 'stop':
                healthGuardianService.stop();
                return NextResponse.json({
                    success: true,
                    message: 'Health Guardian stopped',
                });

            case 'start':
                healthGuardianService.start();
                return NextResponse.json({
                    success: true,
                    message: 'Health Guardian started',
                });

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Use "check", "start", or "stop".' },
                    { status: 400 }
                );
        }

    } catch (error) {
        console.error('Health API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process request' },
            { status: 500 }
        );
    }
}
