'use client';

import { useState, useEffect, useRef } from 'react';
import { Folder, FolderPlus, GitBranch, Check, ChevronDown } from 'lucide-react';

interface FolderOption {
    name: string;
    path: string;
    isGitRepo: boolean;
    modifiedAt?: string;
}

interface FolderComboboxProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function FolderCombobox({ value, onChange, placeholder = 'Select or create folder...' }: FolderComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [folders, setFolders] = useState<FolderOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [inputValue, setInputValue] = useState(value.replace('/apps/', ''));
    const [error, setError] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Fetch folders on mount
    useEffect(() => {
        fetchFolders();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    async function fetchFolders() {
        try {
            const res = await fetch('/api/folders');
            const data = await res.json();
            setFolders(data.folders || []);
        } catch (err) {
            console.error('Failed to fetch folders:', err);
        } finally {
            setLoading(false);
        }
    }

    async function createFolder(name: string) {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 409) {
                    // Folder exists, just select it
                    selectFolder(data.path);
                    return;
                }
                throw new Error(data.error || 'Failed to create folder');
            }

            // Add to list and select
            setFolders(prev => [data.folder, ...prev]);
            selectFolder(data.folder.path);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create folder');
        } finally {
            setCreating(false);
        }
    }

    function selectFolder(path: string) {
        const name = path.replace('/apps/', '');
        setInputValue(name);
        onChange(path);
        setIsOpen(false);
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue ? `/apps/${newValue}` : '');
        if (!isOpen) setIsOpen(true);
    }

    // Filter folders based on input
    const filteredFolders = folders.filter(f =>
        f.name.toLowerCase().includes(inputValue.toLowerCase())
    );

    // Check if input matches an existing folder
    const exactMatch = folders.find(f => f.name.toLowerCase() === inputValue.toLowerCase());
    const showCreateOption = inputValue && !exactMatch && !loading;

    return (
        <div ref={wrapperRef} className="relative">
            <div className="flex items-center">
                <span className="bg-swarm-surface/50 text-muted-foreground px-3 py-2 rounded-l border border-r-0 border-border text-sm">
                    /apps/
                </span>
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={() => setIsOpen(true)}
                        className="input w-full rounded-l-none pr-8"
                        placeholder={placeholder}
                    />
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Hidden input for form submission */}
            <input type="hidden" name="projectFolder" value={inputValue ? `/apps/${inputValue}` : ''} />

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-swarm-surface border border-border rounded-lg shadow-lg max-h-64 overflow-auto">
                    {loading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Loading folders...</div>
                    ) : (
                        <>
                            {error && (
                                <div className="px-3 py-2 text-sm text-swarm-red">{error}</div>
                            )}

                            {showCreateOption && (
                                <button
                                    type="button"
                                    onClick={() => createFolder(inputValue)}
                                    disabled={creating}
                                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-swarm-blue/10 text-swarm-blue border-b border-border"
                                >
                                    <FolderPlus className="h-4 w-4" />
                                    <span className="text-sm">
                                        {creating ? 'Creating...' : `Create "${inputValue}"`}
                                    </span>
                                </button>
                            )}

                            {filteredFolders.length === 0 && !showCreateOption ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                    No folders found. Type a name to create one.
                                </div>
                            ) : (
                                filteredFolders.map((folder) => (
                                    <button
                                        key={folder.path}
                                        type="button"
                                        onClick={() => selectFolder(folder.path)}
                                        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-swarm-surface/80"
                                    >
                                        {folder.isGitRepo ? (
                                            <GitBranch className="h-4 w-4 text-swarm-green" />
                                        ) : (
                                            <Folder className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="text-sm flex-1">{folder.name}</span>
                                        {folder.name === inputValue && (
                                            <Check className="h-4 w-4 text-swarm-green" />
                                        )}
                                    </button>
                                ))
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
