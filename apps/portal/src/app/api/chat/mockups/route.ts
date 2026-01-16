/**
 * AI Swarm - Mockup Generation API
 *
 * Generates UI mockup variations based on conversation context.
 * Uses the planner to create HTML/CSS mockups that are rendered as images.
 */

import { NextRequest, NextResponse } from 'next/server';

interface MockupRequest {
    description: string;
    context?: string;
    style?: 'minimal' | 'modern' | 'playful';
}

interface Mockup {
    id: string;
    title: string;
    description: string;
    html: string;
    style: string;
}

// POST /api/chat/mockups - Generate UI mockups
export async function POST(request: NextRequest) {
    try {
        const body: MockupRequest = await request.json();
        const { description, context } = body;

        if (!description) {
            return NextResponse.json(
                { error: 'Description is required' },
                { status: 400 }
            );
        }

        // Generate 3 different mockup variations using the planner
        const mockups = await generateMockups(description, context);

        return NextResponse.json({ mockups });
    } catch (error) {
        console.error('Failed to generate mockups:', error);
        return NextResponse.json(
            { error: 'Failed to generate mockups' },
            { status: 500 }
        );
    }
}

async function generateMockups(description: string, context?: string): Promise<Mockup[]> {
    // For now, generate HTML mockup templates
    // In production, this would call Claude to generate actual mockups based on the description

    const styles = [
        { name: 'Minimal', desc: 'Clean, minimal design with lots of whitespace', colors: { bg: '#ffffff', primary: '#000000', accent: '#3b82f6' } },
        { name: 'Modern', desc: 'Bold, modern design with gradients', colors: { bg: '#0f172a', primary: '#ffffff', accent: '#8b5cf6' } },
        { name: 'Friendly', desc: 'Warm, approachable design with rounded elements', colors: { bg: '#fef3c7', primary: '#78350f', accent: '#f59e0b' } },
    ];

    const mockups: Mockup[] = styles.map((style, index) => ({
        id: `mockup-${Date.now()}-${index}`,
        title: `Option ${index + 1}: ${style.name}`,
        description: style.desc,
        style: style.name.toLowerCase(),
        html: generateMockupHTML(description, style.colors, style.name),
    }));

    return mockups;
}

function generateMockupHTML(
    description: string,
    colors: { bg: string; primary: string; accent: string },
    styleName: string
): string {
    // Generate a simple mockup HTML based on keywords in the description
    const isForm = /form|input|login|signup|register/i.test(description);
    const isDashboard = /dashboard|analytics|chart|stats/i.test(description);
    const isList = /list|table|items|products/i.test(description);
    const isLanding = /landing|hero|home|welcome/i.test(description);

    let content = '';

    if (isForm) {
        content = `
            <div style="max-width: 400px; margin: 40px auto; padding: 32px; background: ${colors.bg}; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                <h2 style="color: ${colors.primary}; margin-bottom: 24px; font-size: 24px;">Sign In</h2>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; color: ${colors.primary}; opacity: 0.7; font-size: 14px; margin-bottom: 4px;">Email</label>
                    <div style="height: 44px; background: ${colors.primary}10; border-radius: 8px; border: 1px solid ${colors.primary}20;"></div>
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; color: ${colors.primary}; opacity: 0.7; font-size: 14px; margin-bottom: 4px;">Password</label>
                    <div style="height: 44px; background: ${colors.primary}10; border-radius: 8px; border: 1px solid ${colors.primary}20;"></div>
                </div>
                <button style="width: 100%; height: 48px; background: ${colors.accent}; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">Continue</button>
            </div>
        `;
    } else if (isDashboard) {
        content = `
            <div style="padding: 24px; background: ${colors.bg};">
                <h1 style="color: ${colors.primary}; margin-bottom: 24px;">Dashboard</h1>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div style="padding: 20px; background: ${colors.accent}20; border-radius: 12px;">
                        <div style="color: ${colors.primary}; opacity: 0.7; font-size: 14px;">Revenue</div>
                        <div style="color: ${colors.primary}; font-size: 28px; font-weight: bold;">$24,500</div>
                    </div>
                    <div style="padding: 20px; background: ${colors.accent}20; border-radius: 12px;">
                        <div style="color: ${colors.primary}; opacity: 0.7; font-size: 14px;">Users</div>
                        <div style="color: ${colors.primary}; font-size: 28px; font-weight: bold;">1,234</div>
                    </div>
                    <div style="padding: 20px; background: ${colors.accent}20; border-radius: 12px;">
                        <div style="color: ${colors.primary}; opacity: 0.7; font-size: 14px;">Orders</div>
                        <div style="color: ${colors.primary}; font-size: 28px; font-weight: bold;">567</div>
                    </div>
                </div>
                <div style="height: 200px; background: ${colors.primary}10; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: ${colors.primary}; opacity: 0.5;">Chart Area</div>
            </div>
        `;
    } else if (isList) {
        content = `
            <div style="padding: 24px; background: ${colors.bg};">
                <h1 style="color: ${colors.primary}; margin-bottom: 24px;">Items</h1>
                ${[1, 2, 3, 4].map(i => `
                    <div style="display: flex; align-items: center; padding: 16px; background: ${colors.primary}05; border-radius: 8px; margin-bottom: 8px;">
                        <div style="width: 48px; height: 48px; background: ${colors.accent}30; border-radius: 8px; margin-right: 16px;"></div>
                        <div style="flex: 1;">
                            <div style="color: ${colors.primary}; font-weight: 500;">Item ${i}</div>
                            <div style="color: ${colors.primary}; opacity: 0.6; font-size: 14px;">Description text here</div>
                        </div>
                        <div style="color: ${colors.accent}; font-weight: 600;">$${i * 25}</div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        // Default landing/hero section
        content = `
            <div style="padding: 60px 24px; background: ${colors.bg}; text-align: center;">
                <h1 style="color: ${colors.primary}; font-size: 48px; margin-bottom: 16px; font-weight: bold;">Welcome</h1>
                <p style="color: ${colors.primary}; opacity: 0.7; font-size: 18px; max-width: 500px; margin: 0 auto 32px;">Build something amazing with our platform. Fast, reliable, and easy to use.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button style="padding: 14px 28px; background: ${colors.accent}; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Get Started</button>
                    <button style="padding: 14px 28px; background: transparent; color: ${colors.primary}; border: 2px solid ${colors.primary}30; border-radius: 8px; font-size: 16px;">Learn More</button>
                </div>
            </div>
        `;
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
                body { background: ${colors.bg}; min-height: 400px; }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;
}
