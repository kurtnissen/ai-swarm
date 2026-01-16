/**
 * AI Swarm v3.0.0 - Folders API
 *
 * Lists available project folders and creates new ones.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readdir, mkdir, stat } from 'fs/promises';
import { join } from 'path';

const APPS_DIR = '/apps';

// GET /api/folders - List all folders in /apps
export async function GET() {
    try {
        const entries = await readdir(APPS_DIR, { withFileTypes: true });

        const folders = await Promise.all(
            entries
                .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
                .map(async (entry) => {
                    const folderPath = join(APPS_DIR, entry.name);
                    const stats = await stat(folderPath);

                    // Check if it's a git repo
                    let isGitRepo = false;
                    try {
                        await stat(join(folderPath, '.git'));
                        isGitRepo = true;
                    } catch {
                        // Not a git repo
                    }

                    return {
                        name: entry.name,
                        path: `/apps/${entry.name}`,
                        isGitRepo,
                        modifiedAt: stats.mtime.toISOString(),
                    };
                })
        );

        // Sort by modified date, most recent first
        folders.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        return NextResponse.json({ folders });
    } catch (error) {
        console.error('Failed to list folders:', error);
        return NextResponse.json(
            { error: 'Failed to list folders', folders: [] },
            { status: 500 }
        );
    }
}

// POST /api/folders - Create a new folder
export async function POST(request: NextRequest) {
    try {
        const { name } = await request.json();

        if (!name || typeof name !== 'string') {
            return NextResponse.json(
                { error: 'Folder name is required' },
                { status: 400 }
            );
        }

        // Sanitize folder name
        const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        const folderPath = join(APPS_DIR, safeName);

        // Check if already exists
        try {
            await stat(folderPath);
            return NextResponse.json(
                { error: 'Folder already exists', path: `/apps/${safeName}` },
                { status: 409 }
            );
        } catch {
            // Folder doesn't exist, create it
        }

        await mkdir(folderPath, { recursive: true });

        return NextResponse.json({
            success: true,
            folder: {
                name: safeName,
                path: `/apps/${safeName}`,
                isGitRepo: false,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to create folder:', error);
        return NextResponse.json(
            { error: 'Failed to create folder' },
            { status: 500 }
        );
    }
}
