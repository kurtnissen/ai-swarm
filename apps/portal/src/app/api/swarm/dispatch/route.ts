/**
 * AI Swarm v3.0.0 - Visual Swarm Dispatch API
 *
 * Starts a Visual Swarm workflow for parallel visual editing.
 *
 * POST /api/swarm/dispatch
 * Body: {
 *   targets: [{ url, filePath, componentName? }],
 *   stylingInstruction: string,
 *   projectId: string,
 *   maxRetries?: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTemporalClient } from '@/lib/temporal';

interface TargetPage {
    url: string;
    filePath: string;
    componentName?: string;
}

interface DispatchRequest {
    targets: TargetPage[];
    stylingInstruction: string;
    projectId: string;
    projectDir?: string;
    maxRetries?: number;
}

export async function POST(request: NextRequest) {
    // Check authorization
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: DispatchRequest = await request.json();
        const { targets, stylingInstruction, projectId, projectDir, maxRetries = 3 } = body;

        // Validate required fields
        if (!stylingInstruction) {
            return NextResponse.json(
                { error: 'stylingInstruction is required' },
                { status: 400 }
            );
        }

        if (!targets || targets.length === 0) {
            return NextResponse.json(
                { error: 'At least one target is required' },
                { status: 400 }
            );
        }

        if (!projectId) {
            return NextResponse.json(
                { error: 'projectId is required' },
                { status: 400 }
            );
        }

        // Validate each target
        for (const target of targets) {
            if (!target.url || !target.filePath) {
                return NextResponse.json(
                    { error: 'Each target must have url and filePath' },
                    { status: 400 }
                );
            }
        }

        // Start the Visual Swarm workflow
        const client = await getTemporalClient();
        const workflowId = `visual-swarm-${Date.now()}`;

        const handle = await client.workflow.start('visualSwarm', {
            taskQueue: 'ai-swarm-tasks',
            workflowId,
            args: [{
                targets,
                stylingInstruction,
                projectId,
                projectDir: projectDir || `/apps/${projectId}`,
                maxRetries,
            }],
        });

        return NextResponse.json({
            success: true,
            workflowId: handle.workflowId,
            runId: handle.firstExecutionRunId,
            targetCount: targets.length,
            message: `Visual Swarm started with ${targets.length} targets`,
        });
    } catch (error) {
        console.error('Failed to dispatch Visual Swarm:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to dispatch Visual Swarm' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/swarm/dispatch?workflowId=xxx
 * Get the status/result of a Visual Swarm workflow
 */
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get('workflowId');

        if (!workflowId) {
            return NextResponse.json(
                { error: 'workflowId query parameter is required' },
                { status: 400 }
            );
        }

        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(workflowId);

        // Get workflow description
        const description = await handle.describe();
        const status = (description.status as any).name || 'UNKNOWN';

        // If completed, get the result
        let result = null;
        if (status === 'COMPLETED') {
            try {
                result = await handle.result();
            } catch {
                // Could not get result
            }
        }

        return NextResponse.json({
            workflowId,
            runId: description.runId,
            status,
            startTime: description.startTime,
            closeTime: description.closeTime,
            result,
        });
    } catch (error) {
        console.error('Failed to get Visual Swarm status:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get workflow status' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/swarm/dispatch?workflowId=xxx
 * Cancel a running Visual Swarm workflow
 */
export async function DELETE(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get('workflowId');

        if (!workflowId) {
            return NextResponse.json(
                { error: 'workflowId query parameter is required' },
                { status: 400 }
            );
        }

        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(workflowId);

        // Send cancel signal then terminate
        await handle.signal('cancelSwarm');
        await handle.terminate('Cancelled by user');

        return NextResponse.json({
            success: true,
            message: `Visual Swarm ${workflowId} cancelled`,
        });
    } catch (error) {
        console.error('Failed to cancel Visual Swarm:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to cancel workflow' },
            { status: 500 }
        );
    }
}
