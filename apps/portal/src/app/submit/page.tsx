'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, X, Palette, Layers } from 'lucide-react';
import MockupGallery from '@/app/components/chat/MockupGallery';

interface ImageAttachment {
    id: string;
    name: string;
    base64: string;
    preview: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    images?: ImageAttachment[];
}

interface ConversationSummary {
    tag: string;
    title: string;
    summary: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

interface Conversation {
    tag: string;
    title: string;
    messages: Message[];
    planReady: boolean;
}

interface Project {
    id: string;
    name: string;
}

export default function ChatPage() {
    const router = useRouter();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [showMockupGallery, setShowMockupGallery] = useState(false);
    const [mockupDescription, setMockupDescription] = useState('');
    const [launchingSwarm, setLaunchingSwarm] = useState(false);
    const [agenticMode, setAgenticMode] = useState(true);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset height
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; // Set new height (max 200px)
        }
    }, [input]);

    // Load conversations and projects on mount
    useEffect(() => {
        loadConversations();
        loadProjects();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentConversation?.messages]);

    async function loadProjects() {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();
            if (data.projects?.length > 0) {
                setProjects(data.projects);
                // Select first project by default
                if (!selectedProject) {
                    setSelectedProject(data.projects[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to load projects:', err);
        }
    }

    async function loadConversations() {
        try {
            const res = await fetch('/api/chat');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (err) {
            console.error('Failed to load conversations:', err);
        }
    }

    async function selectConversation(tag: string) {
        try {
            setLoading(true);
            const res = await fetch(`/api/chat?tag=${encodeURIComponent(tag)}`);
            const data = await res.json();
            setCurrentConversation(data);
            setError(null);
        } catch (err) {
            setError('Failed to load conversation');
        } finally {
            setLoading(false);
        }
    }

    async function startNewConversation() {
        if (!input.trim() && attachedImages.length === 0) return;

        try {
            setLoading(true);
            setError(null);

            // Create new conversation
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'new', message: input || 'Image attached' }),
            });
            const newConv = await res.json();

            setCurrentConversation({
                tag: newConv.tag,
                title: newConv.title,
                messages: [],
                planReady: false,
            });

            // Send first message to Planner (with images if attached)
            await sendMessage(newConv.tag, input, attachedImages.length > 0 ? attachedImages : undefined);

            // Refresh conversation list
            await loadConversations();
            setInput('');
        } catch (err) {
            setError('Failed to start conversation');
        } finally {
            setLoading(false);
        }
    }

    async function sendMessage(tag: string, message: string, images?: ImageAttachment[]) {
        try {
            setLoading(true);
            setError(null);

            // Add user message optimistically
            setCurrentConversation((prev) => prev ? {
                ...prev,
                messages: [...prev.messages, {
                    role: 'user' as const,
                    content: message,
                    timestamp: new Date().toISOString(),
                    images: images,
                }],
            } : null);

            // Clear attached images after adding to message
            setAttachedImages([]);

            // Send to Planner
            const res = await fetch('/api/chat/planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tag,
                    message,
                    projectId: selectedProject,
                    images: images?.map(img => ({ name: img.name, base64: img.base64 })),
                }),
            });

            if (!res.ok) {
                // FIX: Added more descriptive error handling for API failures
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${res.status}`);
            }

            const data = await res.json();
            setCurrentConversation(data.conversation);
        } catch (err) {
            // FIX: Specific message for potential timeouts
            const msg = err instanceof Error ? err.message : 'Failed to send message';
            setError(msg.includes('504') || msg.includes('timeout')
                ? 'Planner is taking too long to respond. The task might still be processing, please refresh in a moment.'
                : msg);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if ((!input.trim() && attachedImages.length === 0) || loading) return;

        if (currentConversation) {
            await sendMessage(currentConversation.tag, input, attachedImages.length > 0 ? attachedImages : undefined);
            setInput('');
        } else {
            await startNewConversation();
        }
    }

    /**
     * Send a forcing prompt to generate the plan as JSON.
     * This recovers from cases where the Planner responds with prose instead of JSON.
     */
    async function generatePlan() {
        if (!currentConversation) return;

        const forcingPrompt = `Based on our conversation, output the implementation plan as pure JSON now.

IMPORTANT: Respond with ONLY the JSON object, no explanation or text before/after. Format:
{
    "proposedChanges": [{ "path": "...", "action": "modify|create|delete", "description": "..." }],
    "verificationPlan": "How to test",
    "estimatedEffort": "X hours"
}`;

        await sendMessage(currentConversation.tag, forcingPrompt);
    }

    // Helper to extract JSON from content - simple approach
    function extractPlanJSON(content: string): any | null {
        try {
            const trimmed = content.trim();

            // Extract from code fences if present
            const fenceMatch = trimmed.match(/```(?:\w+)?\s*([\s\S]*?)```/);
            const jsonContent = fenceMatch ? fenceMatch[1].trim() : trimmed;

            // Just try to parse it directly
            const parsed = JSON.parse(jsonContent);

            // Verify it has the required fields
            if (parsed.proposedChanges && parsed.verificationPlan) {
                return parsed;
            }
            return null;
        } catch {
            return null;
        }
    }

    async function createTask() {
        if (!currentConversation) return;

        // Find the plan JSON in messages (handles markdown code fences and explanatory text)
        const planMessage = currentConversation.messages
            .filter(m => m.role === 'assistant')
            .reverse()
            .find(m => extractPlanJSON(m.content) !== null);

        if (!planMessage) {
            setError('No plan found in conversation');
            return;
        }

        try {
            const plan = extractPlanJSON(planMessage.content);
            if (!plan) {
                setError('Invalid plan format');
                return;
            }

            // Create task via workflows API
            const context = currentConversation.messages
                .filter(m => m.role === 'user')
                .map(m => m.content)
                .join('\n');

            // Extract images from conversation
            const images: string[] = [];
            currentConversation.messages.forEach(m => {
                if (m.images) {
                    m.images.forEach(img => images.push(img.base64));
                }
            });

            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflowType: agenticMode ? 'planAndExecute' : 'developFeature',
                    task: {
                        id: `task-${Date.now()}`,
                        title: currentConversation.title,
                        context,
                        plan,
                        projectId: selectedProject,
                        createdAt: new Date().toISOString(),
                        images: images.length > 0 ? images : undefined
                    },
                    // PlanAndExecute specific fields
                    prompt: context,
                    projectId: selectedProject,
                    images: images.length > 0 ? images : undefined,
                    maxWorkers: 3,

                    skipApproval: true,
                    notifyOnComplete: true,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to create task');
            }

            const data = await res.json();
            router.push(`/workflows/${data.workflowId}`);
        } catch (err) {
            setError('Failed to create task');
        }
    }

    function newConversation() {
        setCurrentConversation(null);
        setInput('');
        setError(null);
        setAttachedImages([]);
    }

    async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files;
        if (!files) return;

        const newImages: ImageAttachment[] = [];

        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > 10 * 1024 * 1024) {
                setError('Image must be less than 10MB');
                continue;
            }

            const base64 = await fileToBase64(file);
            newImages.push({
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                base64,
                preview: URL.createObjectURL(file),
            });
        }

        setAttachedImages(prev => [...prev, ...newImages]);
        // Reset input so same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function removeImage(id: string) {
        setAttachedImages(prev => {
            const img = prev.find(i => i.id === id);
            if (img) URL.revokeObjectURL(img.preview);
            return prev.filter(i => i.id !== id);
        });
    }

    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer?.files;
        if (!files) return;

        const newImages: ImageAttachment[] = [];

        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > 10 * 1024 * 1024) {
                setError('Image must be less than 10MB');
                continue;
            }

            const base64 = await fileToBase64(file);
            newImages.push({
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                base64,
                preview: URL.createObjectURL(file),
            });
        }

        if (newImages.length > 0) {
            setAttachedImages(prev => [...prev, ...newImages]);
        }
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }

    function openMockupGallery() {
        // Use conversation context or input as description
        const description = input.trim() ||
            currentConversation?.messages
                .filter(m => m.role === 'user')
                .map(m => m.content)
                .join(' ')
                .slice(0, 500) ||
            'UI design';

        setMockupDescription(description);
        setShowMockupGallery(true);
    }

    async function handleMockupSelect(mockup: { id: string; title: string; description: string; html: string }) {
        setShowMockupGallery(false);

        // Create a message indicating the selected mockup
        const message = `I've selected the "${mockup.title}" design style (${mockup.description}). Please use this as the basis for the UI implementation.`;

        if (currentConversation) {
            await sendMessage(currentConversation.tag, message);
        } else {
            setInput(message);
        }
    }

    /**
     * Launch Visual Swarm for parallel visual editing.
     * Extracts targets from conversation and dispatches the workflow.
     */
    async function launchVisualSwarm() {
        if (!currentConversation || !selectedProject) {
            setError('Please select a project and have an active conversation');
            return;
        }

        try {
            setLaunchingSwarm(true);
            setError(null);

            // Gather conversation context for target parsing
            const conversationContext = currentConversation.messages
                .map(m => `${m.role}: ${m.content}`)
                .join('\n');

            // First, try to extract targets using the parse API
            const parseRes = await fetch('/api/chat/planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tag: currentConversation.tag,
                    message: `Based on our conversation, identify all the target pages/components that need styling changes. For each target, provide:
1. The file path (e.g., src/app/dashboard/page.tsx)
2. The URL where it can be previewed (e.g., http://localhost:3000/dashboard)

Format as a list of targets. Also clarify the exact styling instruction to apply to all targets.`,
                    projectId: selectedProject,
                }),
            });

            if (!parseRes.ok) {
                throw new Error('Failed to parse targets from conversation');
            }

            const parseData = await parseRes.json();

            // Extract the latest assistant message which should contain target info
            const latestAssistant = parseData.conversation?.messages
                ?.filter((m: any) => m.role === 'assistant')
                .pop();

            // For now, use a simple approach - extract file paths and URLs from the conversation
            // In a production system, this would use the parseTargets activity
            const targets = extractTargetsFromConversation(currentConversation.messages);
            const stylingInstruction = input.trim() ||
                currentConversation.messages
                    .filter(m => m.role === 'user')
                    .map(m => m.content)
                    .join(' ')
                    .slice(0, 500);

            if (targets.length === 0) {
                // If no targets found, ask user to specify
                setError('Could not identify target files/URLs. Please specify the files and URLs to modify in your message.');
                return;
            }

            // Dispatch the Visual Swarm workflow
            const res = await fetch('/api/swarm/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targets,
                    stylingInstruction,
                    projectId: selectedProject,
                    maxRetries: 3,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to launch Visual Swarm');
            }

            const data = await res.json();

            // Navigate to workflow view or show success
            router.push(`/workflows/${data.workflowId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to launch Visual Swarm');
        } finally {
            setLaunchingSwarm(false);
        }
    }

    /**
     * Extract targets from conversation messages.
     * Looks for file paths and URLs in the conversation.
     */
    function extractTargetsFromConversation(messages: Message[]): { url: string; filePath: string; componentName?: string }[] {
        const targets: { url: string; filePath: string; componentName?: string }[] = [];
        const seenPaths = new Set<string>();

        // Common patterns for file paths and URLs
        const filePathPattern = /(?:\/[\w.-]+)+\.(?:tsx?|jsx?|vue|svelte)/g;
        const urlPattern = /https?:\/\/localhost:\d+\/[\w/.-]*/g;

        for (const msg of messages) {
            // Extract file paths
            const filePaths = msg.content.match(filePathPattern) || [];
            const urls = msg.content.match(urlPattern) || [];

            for (const filePath of filePaths) {
                if (seenPaths.has(filePath)) continue;
                seenPaths.add(filePath);

                // Try to infer URL from file path
                let url = 'http://localhost:3000';
                if (filePath.includes('/app/')) {
                    // Next.js app router - extract route from path
                    const routeMatch = filePath.match(/\/app\/(.+?)\/page\./);
                    if (routeMatch) {
                        url = `http://localhost:3000/${routeMatch[1]}`;
                    }
                } else if (filePath.includes('/pages/')) {
                    // Next.js pages router
                    const routeMatch = filePath.match(/\/pages\/(.+?)\./);
                    if (routeMatch) {
                        const route = routeMatch[1].replace(/\/index$/, '');
                        url = `http://localhost:3000/${route}`;
                    }
                }

                targets.push({ url, filePath });
            }

            // Also add explicit URLs that might be in the conversation
            for (const url of urls) {
                // Check if we already have a target for this URL
                if (!targets.some(t => t.url === url)) {
                    // Try to infer file path from URL
                    const pathMatch = url.match(/localhost:\d+\/(.+)/);
                    if (pathMatch) {
                        const route = pathMatch[1];
                        const filePath = `/src/app/${route}/page.tsx`;
                        if (!seenPaths.has(filePath)) {
                            targets.push({ url, filePath });
                            seenPaths.add(filePath);
                        }
                    }
                }
            }
        }

        return targets;
    }

    async function deleteChat(tag: string) {
        if (!confirm('Are you sure you want to delete this conversation?')) return;

        try {
            setLoading(true);
            const res = await fetch(`/api/chat?tag=${encodeURIComponent(tag)}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Failed to delete conversation');

            // Reset UI
            if (currentConversation?.tag === tag) {
                newConversation();
            }

            // Refresh list
            await loadConversations();
        } catch (err) {
            setError('Failed to delete conversation');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-200px)]">
            {/* Header with conversation selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                <h1 className="text-xl md:text-2xl font-bold">Chat with Planner</h1>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Project Selector v3.0.0 */}
                    {projects.length > 0 && (
                        <select
                            value={selectedProject}
                            onChange={(e) => setSelectedProject(e.target.value)}
                            className="px-2 py-1.5 md:px-3 md:py-2 bg-card border border-border rounded-md text-sm focus:border-primary focus:outline-none"
                        >
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        value={currentConversation?.tag || ''}
                        onChange={(e) => e.target.value ? selectConversation(e.target.value) : newConversation()}
                        className="px-2 py-1.5 md:px-3 md:py-2 bg-card border border-border rounded-md text-sm focus:border-primary focus:outline-none max-w-[150px] md:max-w-none"
                    >
                        <option value="">New Conversation</option>
                        {conversations.map((conv) => (
                            <option key={conv.tag} value={conv.tag}>
                                {conv.title}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={newConversation}
                        className="btn btn-ghost text-xs md:text-sm px-2 h-8"
                    >
                        + New
                    </button>
                    {currentConversation && (
                        <button
                            onClick={() => deleteChat(currentConversation.tag)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete Chat"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Error display */}
            {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-md">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto card p-4 space-y-4">
                {!currentConversation && (
                    <div className="text-center text-swarm-muted py-8">
                        <p className="text-lg mb-2">Start a conversation with Planner</p>
                        <p className="text-sm">Describe your task and I&apos;ll ask clarifying questions until we have a solid plan.</p>
                    </div>
                )}

                {currentConversation?.messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2 md:px-4 md:py-3 ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card border border-border'
                                }`}
                        >
                            <div className="text-xs opacity-70 mb-1">
                                {msg.role === 'user' ? 'You' : 'Planner'}
                            </div>
                            {/* Display attached images */}
                            {msg.images && msg.images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {msg.images.map((img) => (
                                        <img
                                            key={img.id}
                                            src={img.preview || img.base64}
                                            alt={img.name}
                                            className="max-h-40 max-w-full rounded-md border border-border/50"
                                        />
                                    ))}
                                </div>
                            )}
                            <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-swarm-card border border-swarm-border rounded-lg px-4 py-3">
                            <div className="text-xs opacity-70 mb-1">Planner</div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-swarm-blue rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-swarm-blue rounded-full animate-bounce [animation-delay:0.1s]" />
                                <div className="w-2 h-2 bg-swarm-blue rounded-full animate-bounce [animation-delay:0.2s]" />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
                className={`mt-4 relative ${isDragging ? 'ring-2 ring-swarm-blue ring-offset-2 ring-offset-background rounded-lg' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {/* Drag overlay */}
                {isDragging && (
                    <div className="absolute inset-0 bg-swarm-blue/10 border-2 border-dashed border-swarm-blue rounded-lg flex items-center justify-center z-10">
                        <div className="text-swarm-blue font-medium">Drop images here</div>
                    </div>
                )}

                {/* Image previews */}
                {attachedImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3 p-2 bg-swarm-surface/30 rounded-lg border border-border">
                        {attachedImages.map((img) => (
                            <div key={img.id} className="relative group">
                                <img
                                    src={img.preview}
                                    alt={img.name}
                                    className="h-16 w-16 object-cover rounded-md border border-border"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeImage(img.id)}
                                    className="absolute -top-2 -right-2 bg-swarm-red text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 truncate rounded-b-md">
                                    {img.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex gap-3 items-end">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageSelect}
                        className="hidden"
                    />

                    {/* Image upload button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="p-3 bg-swarm-surface border border-swarm-border rounded-md hover:border-swarm-blue hover:text-swarm-blue transition-colors disabled:opacity-50"
                        title="Attach images"
                    >
                        <ImagePlus className="h-5 w-5" />
                    </button>

                    {/* Generate mockups button */}
                    <button
                        type="button"
                        onClick={openMockupGallery}
                        disabled={loading}
                        className="p-3 bg-swarm-surface border border-swarm-border rounded-md hover:border-swarm-purple hover:text-swarm-purple transition-colors disabled:opacity-50"
                        title="Generate UI mockups"
                    >
                        <Palette className="h-5 w-5" />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e as any);
                            }
                        }}
                        onPaste={async (e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;

                            const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
                            if (imageItems.length === 0) return;

                            e.preventDefault(); // Prevent pasting image as text

                            const newImages: ImageAttachment[] = [];
                            for (const item of imageItems) {
                                const file = item.getAsFile();
                                if (!file) continue;

                                const base64 = await fileToBase64(file);
                                newImages.push({
                                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    name: `pasted-image-${Date.now()}.png`,
                                    base64,
                                    preview: URL.createObjectURL(file),
                                });
                            }

                            if (newImages.length > 0) {
                                setAttachedImages(prev => [...prev, ...newImages]);
                            }
                        }}
                        placeholder={currentConversation ? "Reply to Planner... (paste images here)" : "Describe your task... (paste images here)"}
                        disabled={loading}
                        rows={1}
                        className="flex-1 px-4 py-3 bg-swarm-bg border border-swarm-border rounded-md focus:border-swarm-blue focus:outline-none disabled:opacity-50 resize-none overflow-y-auto min-h-[46px]"
                    />
                    <button
                        type="submit"
                        disabled={loading || (!input.trim() && attachedImages.length === 0)}
                        className="btn btn-primary px-6"
                    >
                        {loading ? '...' : 'Send'}
                    </button>
                </form>

                {/* Action buttons */}
                <div className="flex flex-col items-end mt-3 gap-2">
                    <div className="flex flex-wrap gap-3">
                        {/* Generate Plan button - shows when 2+ messages */}
                        {currentConversation &&
                            currentConversation.messages.length >= 2 && (
                                <button
                                    onClick={generatePlan}
                                    disabled={loading}
                                    className="btn btn-ghost border border-swarm-blue text-swarm-blue hover:bg-swarm-blue/10"
                                >
                                    Generate Plan
                                </button>
                            )}
                        {/* Visual Swarm button - for parallel styling edits */}
                        {currentConversation &&
                            currentConversation.messages.length >= 2 && (
                                <button
                                    onClick={launchVisualSwarm}
                                    disabled={loading || launchingSwarm}
                                    className="btn btn-ghost border border-swarm-purple text-swarm-purple hover:bg-swarm-purple/10 flex items-center gap-2"
                                    title="Launch Visual Swarm for parallel styling across multiple pages"
                                >
                                    <Layers className="h-4 w-4" />
                                    {launchingSwarm ? 'Launching...' : 'Visual Swarm'}
                                </button>
                            )}
                        {/* Submit Task button - shows when there's at least one assistant response */}
                        {currentConversation &&
                            currentConversation.messages.some(m => m.role === 'assistant') && (
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={agenticMode}
                                            onChange={(e) => setAgenticMode(e.target.checked)}
                                            className="form-checkbox h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        Agentic Mode (Auto-Breakdown)
                                    </label>
                                    <button
                                        onClick={createTask}
                                        disabled={loading}
                                        className="btn btn-primary"
                                    >
                                        {agenticMode ? 'Execute Agentic Plan' : 'Submit Single Task'}
                                    </button>
                                </div>
                            )}
                    </div>
                    {currentConversation &&
                        currentConversation.messages.some(m => m.role === 'assistant') && (
                            <p className="text-xs text-muted-foreground">
                                Submit only after a plan with JSON has been generated. Use Visual Swarm for parallel styling.
                            </p>
                        )}
                </div>
            </div>

            {/* Mockup Gallery Modal */}
            {showMockupGallery && (
                <MockupGallery
                    description={mockupDescription}
                    onSelect={handleMockupSelect}
                    onCancel={() => setShowMockupGallery(false)}
                />
            )}
        </div>
    );
}

