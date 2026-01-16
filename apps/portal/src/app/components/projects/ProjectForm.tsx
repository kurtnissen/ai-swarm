'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import FolderCombobox from './FolderCombobox';

export interface Project {
    id?: string;
    name: string;
    scmProvider: string;
    scmOrg: string;
    scmProject?: string;
    scmRepo: string;
    scmToken?: string;
    projectFolder: string;
    aiContextFolder: string;
    isActive?: boolean;
}

export interface Deployment {
    sshHost: string;
    sshUser: string;
    deployDir: string;
    appUrl?: string;
    metadata?: Record<string, any>;
}

interface ProjectFormProps {
    initialProject?: Project;
    initialDeployment?: Deployment;
    isEditing?: boolean;
}

export default function ProjectForm({ initialProject, initialDeployment, isEditing = false }: ProjectFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState<boolean>(Boolean(isEditing && (initialProject?.scmProvider || initialDeployment?.deployDir)));

    // For specialized SCM help text
    const [scmProvider, setScmProvider] = useState(initialProject?.scmProvider || '');
    const [projectFolder, setProjectFolder] = useState(initialProject?.projectFolder || '');

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!projectFolder) {
            setError('Please select or create a folder');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(false);

        const formData = new FormData(e.currentTarget);

        const data = {
            name: formData.get('name'),
            scmProvider: formData.get('scmProvider') || '',
            scmOrg: formData.get('scmOrg') || '',
            scmProject: formData.get('scmProject') || undefined,
            scmRepo: formData.get('scmRepo') || '',
            scmToken: formData.get('scmToken') as string,
            projectFolder: projectFolder,
            aiContextFolder: formData.get('aiContextFolder') || '.aicontext',
            isActive: initialProject?.isActive ?? true,
            deployment: {
                sshHost: formData.get('sshHost') || '',
                sshUser: formData.get('sshUser') || '',
                deployDir: formData.get('deployDir') || '',
                appUrl: formData.get('appUrl') || '',
                deployServices: formData.get('deployServices') || '',
            }
        };

        try {
            const endpoint = isEditing ? `/api/projects/${initialProject?.id}` : '/api/projects';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save project');
            }

            if (isEditing) {
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
            } else {
                router.push('/settings/projects');
                router.refresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
        setDeleting(true);
        setError(null);

        try {
            const res = await fetch(`/api/projects/${initialProject?.id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete project');
            router.push('/settings/projects');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setDeleting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            {error && (
                <div className="card border-swarm-red/50">
                    <p className="text-swarm-red">{error}</p>
                </div>
            )}

            {success && (
                <div className="card border-swarm-green/50 text-sm text-swarm-green">
                    Project saved successfully.
                </div>
            )}

            {/* Essential Settings - Always Visible */}
            <div className="card space-y-4">
                <h2 className="text-lg font-semibold border-b border-border pb-2">Project Setup</h2>

                <div>
                    <label className="block text-sm font-medium mb-1">Project Name <span className="text-swarm-red">*</span></label>
                    <input
                        type="text"
                        name="name"
                        required
                        defaultValue={initialProject?.name}
                        className="input w-full"
                        placeholder="My Awesome App"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">
                        Local Folder <span className="text-swarm-red">*</span>
                    </label>
                    <FolderCombobox
                        value={projectFolder}
                        onChange={setProjectFolder}
                        placeholder="Select or type folder name..."
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                        Maps to <code className="text-swarm-blue">~/Documents/dev/[folder]</code> on your Mac
                    </p>
                </div>

                <input type="hidden" name="aiContextFolder" value={initialProject?.aiContextFolder || '.aicontext'} />
            </div>

            {/* Advanced Settings - Collapsible */}
            <div className="card">
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <h2 className="text-lg font-semibold">Advanced Settings</h2>
                    {showAdvanced ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>
                <p className="text-xs text-muted-foreground mt-1">Git integration, deployment, and more</p>

                {showAdvanced && (
                    <div className="mt-4 pt-4 border-t border-border space-y-6">
                        {/* SCM Settings */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Source Control</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">SCM Provider</label>
                                    <select
                                        name="scmProvider"
                                        defaultValue={initialProject?.scmProvider}
                                        onChange={(e) => setScmProvider(e.target.value)}
                                        className="input w-full"
                                    >
                                        <option value="">None (Local Only)</option>
                                        <option value="github">GitHub</option>
                                        <option value="gitlab">GitLab</option>
                                        <option value="azure-devops">Azure DevOps</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Organization</label>
                                    <input
                                        type="text"
                                        name="scmOrg"
                                        defaultValue={initialProject?.scmOrg}
                                        className="input w-full"
                                        placeholder="my-org"
                                    />
                                </div>

                                {scmProvider === 'azure-devops' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Project</label>
                                        <input
                                            type="text"
                                            name="scmProject"
                                            defaultValue={initialProject?.scmProject}
                                            className="input w-full"
                                            placeholder="dev_ops"
                                        />
                                    </div>
                                )}

                                <div className={scmProvider === 'azure-devops' ? '' : 'md:col-span-2'}>
                                    <label className="block text-sm font-medium mb-1">Repository</label>
                                    <input
                                        type="text"
                                        name="scmRepo"
                                        defaultValue={initialProject?.scmRepo}
                                        className="input w-full"
                                        placeholder="my-repo"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">SCM Token</label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        name="scmToken"
                                        defaultValue={initialProject?.scmToken || ''}
                                        className="input w-full pr-10"
                                        placeholder="Leave blank to use global token"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Deployment Settings */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Deployment</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">SSH Host</label>
                                    <input
                                        type="text"
                                        name="sshHost"
                                        defaultValue={initialDeployment?.sshHost || ''}
                                        className="input w-full"
                                        placeholder="host.docker.internal"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">SSH User</label>
                                    <input
                                        type="text"
                                        name="sshUser"
                                        defaultValue={initialDeployment?.sshUser || ''}
                                        className="input w-full"
                                        placeholder="ubuntu"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium mb-1">Deploy Directory</label>
                                    <input
                                        type="text"
                                        name="deployDir"
                                        defaultValue={initialDeployment?.deployDir || ''}
                                        className="input w-full"
                                        placeholder="/home/ubuntu/apps/my-app"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Application URL</label>
                                    <input
                                        type="text"
                                        name="appUrl"
                                        defaultValue={initialDeployment?.appUrl || ''}
                                        className="input w-full"
                                        placeholder="https://my-app.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Rebuild Services</label>
                                    <input
                                        type="text"
                                        name="deployServices"
                                        defaultValue={initialDeployment?.metadata?.deployServices || ''}
                                        className="input w-full"
                                        placeholder="portal,worker"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
                <div className="flex gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                    >
                        {loading ? 'Saving...' : (isEditing ? 'Update Project' : 'Create Project')}
                    </button>
                    <Link href="/settings/projects" className="btn btn-secondary">
                        Cancel
                    </Link>
                </div>
                {isEditing && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="btn btn-danger"
                    >
                        {deleting ? 'Deleting...' : 'Delete Project'}
                    </button>
                )}
            </div>
        </form>
    );
}
