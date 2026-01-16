'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, Loader2, X, Maximize2 } from 'lucide-react';

interface Mockup {
    id: string;
    title: string;
    description: string;
    html: string;
    style: string;
}

interface MockupGalleryProps {
    description: string;
    onSelect: (mockup: Mockup) => void;
    onCancel: () => void;
}

export default function MockupGallery({ description, onSelect, onCancel }: MockupGalleryProps) {
    const [mockups, setMockups] = useState<Mockup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);

    useEffect(() => {
        generateMockups();
    }, [description]);

    async function generateMockups() {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/chat/mockups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description }),
            });

            if (!res.ok) throw new Error('Failed to generate mockups');

            const data = await res.json();
            setMockups(data.mockups);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate mockups');
        } finally {
            setLoading(false);
        }
    }

    function handleSelect() {
        const selected = mockups.find(m => m.id === selectedId);
        if (selected) {
            onSelect(selected);
        }
    }

    const previewMockup = mockups.find(m => m.id === previewId);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-swarm-bg border border-swarm-border rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-swarm-border">
                    <div>
                        <h2 className="text-lg font-semibold">Choose a Design</h2>
                        <p className="text-sm text-muted-foreground">Select the mockup that best matches your vision</p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-swarm-surface rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-swarm-blue" />
                            <span className="ml-3 text-muted-foreground">Generating mockups...</span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-20">
                            <p className="text-swarm-red mb-4">{error}</p>
                            <button onClick={generateMockups} className="btn btn-secondary">
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {mockups.map((mockup) => (
                                <div
                                    key={mockup.id}
                                    onClick={() => setSelectedId(mockup.id)}
                                    className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                        selectedId === mockup.id
                                            ? 'border-swarm-blue ring-2 ring-swarm-blue/30'
                                            : 'border-swarm-border hover:border-swarm-blue/50'
                                    }`}
                                >
                                    {/* Selection indicator */}
                                    {selectedId === mockup.id && (
                                        <div className="absolute top-3 right-3 z-10 bg-swarm-blue text-white rounded-full p-1">
                                            <Check className="h-4 w-4" />
                                        </div>
                                    )}

                                    {/* Expand button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewId(mockup.id);
                                        }}
                                        className="absolute top-3 left-3 z-10 bg-black/50 text-white rounded-lg p-1.5 opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-opacity"
                                        style={{ opacity: 1 }}
                                    >
                                        <Maximize2 className="h-4 w-4" />
                                    </button>

                                    {/* Mockup preview */}
                                    <div className="aspect-[4/3] bg-white">
                                        <iframe
                                            srcDoc={mockup.html}
                                            className="w-full h-full pointer-events-none"
                                            sandbox=""
                                            title={mockup.title}
                                        />
                                    </div>

                                    {/* Info */}
                                    <div className="p-3 bg-swarm-surface">
                                        <h3 className="font-medium text-sm">{mockup.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">{mockup.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-swarm-border bg-swarm-surface/50">
                    <button onClick={generateMockups} disabled={loading} className="btn btn-ghost text-sm">
                        Regenerate Options
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onCancel} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button
                            onClick={handleSelect}
                            disabled={!selectedId}
                            className="btn btn-primary"
                        >
                            Use This Design
                        </button>
                    </div>
                </div>
            </div>

            {/* Full preview modal */}
            {previewMockup && (
                <div
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-60 p-8"
                    onClick={() => setPreviewId(null)}
                >
                    <div className="bg-white rounded-xl overflow-hidden max-w-4xl w-full max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
                            <span className="text-sm font-medium text-gray-700">{previewMockup.title}</span>
                            <button onClick={() => setPreviewId(null)} className="text-gray-500 hover:text-gray-700">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <iframe
                            srcDoc={previewMockup.html}
                            className="w-full h-[70vh]"
                            sandbox=""
                            title={previewMockup.title}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
