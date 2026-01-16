/**
 * AI Swarm v3.0.2 - Health Guardian Service
 * 
 * Monitors system health and takes protective action to prevent crashes.
 * Runs in the Portal container and can shutdown workers if dangerous
 * conditions are detected.
 * 
 * Created: 2026-01-16 after repeated server crashes due to process leaks.
 * 
 * DESIGN PRINCIPLES:
 * 1. NO PROCESS SPAWNING for monitoring (learned the hard way!)
 * 2. File-based checks where possible
 * 3. Docker API for container control (via socket-proxy)
 * 4. Graceful degradation - shutdown workers, keep infrastructure
 */

import { promises as fs } from 'fs';
import { logger } from '../logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface HealthGuardianConfig {
    // Check interval in milliseconds (default: 30 seconds)
    checkIntervalMs: number;

    // Memory thresholds (percentage of total)
    memoryWarningPercent: number;      // Log warning
    memoryCriticalPercent: number;     // Shutdown workers

    // Process count thresholds
    maxClaudeProcesses: number;        // Kill orphans above this
    maxGeminiProcesses: number;        // Kill orphans above this
    maxTotalProcesses: number;         // Emergency shutdown above this

    // Load average threshold (multiplier of CPU count)
    loadWarningMultiplier: number;     // e.g., 10 = 40 on 4-CPU system
    loadCriticalMultiplier: number;    // e.g., 25 = 100 on 4-CPU system

    // Consecutive critical readings before action
    criticalCountBeforeShutdown: number;

    // Docker socket proxy URL
    dockerProxyUrl: string;

    // Enable automatic shutdown (can be disabled for testing)
    enableAutoShutdown: boolean;
}

const DEFAULT_CONFIG: HealthGuardianConfig = {
    checkIntervalMs: 30000,            // 30 seconds
    memoryWarningPercent: 80,
    memoryCriticalPercent: 90,
    maxClaudeProcesses: 8,
    maxGeminiProcesses: 8,
    maxTotalProcesses: 2000,
    loadWarningMultiplier: 10,
    loadCriticalMultiplier: 25,
    criticalCountBeforeShutdown: 2,    // 2 consecutive = 1 minute
    dockerProxyUrl: process.env.DOCKER_HOST || 'http://socket-proxy:2375',
    enableAutoShutdown: process.env.HEALTH_GUARDIAN_AUTO_SHUTDOWN !== 'false',
};

// =============================================================================
// HEALTH STATUS TYPES
// =============================================================================

export type HealthLevel = 'healthy' | 'warning' | 'critical' | 'emergency';

export interface HealthStatus {
    level: HealthLevel;
    timestamp: Date;

    // System metrics
    memoryUsedPercent: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    loadAverage1m: number;
    loadAverage5m: number;
    loadAverage15m: number;
    cpuCount: number;

    // Process counts (from /proc, no spawning)
    claudeProcessCount: number;
    geminiProcessCount: number;
    totalProcessCount: number;

    // Issues detected
    issues: string[];

    // Actions taken
    actionsTaken: string[];
}

// =============================================================================
// HEALTH GUARDIAN SERVICE
// =============================================================================

export class HealthGuardianService {
    private config: HealthGuardianConfig;
    private intervalHandle: NodeJS.Timeout | null = null;
    private consecutiveCriticalCount: number = 0;
    private lastStatus: HealthStatus | null = null;
    private isShutdownInProgress: boolean = false;

    constructor(config: Partial<HealthGuardianConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    /**
     * Start the health guardian monitoring loop
     */
    start(): void {
        if (this.intervalHandle) {
            logger.warn('Health Guardian already running');
            return;
        }

        logger.info({
            config: {
                checkIntervalMs: this.config.checkIntervalMs,
                memoryCriticalPercent: this.config.memoryCriticalPercent,
                maxClaudeProcesses: this.config.maxClaudeProcesses,
                enableAutoShutdown: this.config.enableAutoShutdown,
            }
        }, 'Health Guardian starting');

        // Run immediately, then on interval
        this.runHealthCheck();
        this.intervalHandle = setInterval(() => {
            this.runHealthCheck();
        }, this.config.checkIntervalMs);
    }

    /**
     * Stop the health guardian monitoring loop
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            logger.info('Health Guardian stopped');
        }
    }

    /**
     * Get the last health status (for API endpoints)
     */
    getLastStatus(): HealthStatus | null {
        return this.lastStatus;
    }

    // =========================================================================
    // HEALTH CHECK
    // =========================================================================

    /**
     * Run a single health check cycle
     */
    async runHealthCheck(): Promise<HealthStatus> {
        const status: HealthStatus = {
            level: 'healthy',
            timestamp: new Date(),
            memoryUsedPercent: 0,
            memoryUsedMB: 0,
            memoryTotalMB: 0,
            loadAverage1m: 0,
            loadAverage5m: 0,
            loadAverage15m: 0,
            cpuCount: 1,
            claudeProcessCount: 0,
            geminiProcessCount: 0,
            totalProcessCount: 0,
            issues: [],
            actionsTaken: [],
        };

        try {
            // Gather metrics (all file-based, no process spawning!)
            await this.gatherMemoryMetrics(status);
            await this.gatherLoadMetrics(status);
            await this.gatherProcessCounts(status);

            // Evaluate health level
            this.evaluateHealth(status);

            // Take action based on health level
            await this.takeAction(status);

            // Update state
            this.lastStatus = status;

            // Log based on level
            if (status.level === 'healthy') {
                logger.debug({ status }, 'Health check: healthy');
            } else if (status.level === 'warning') {
                logger.warn({ status }, 'Health check: WARNING');
            } else {
                logger.error({ status }, `Health check: ${status.level.toUpperCase()}`);
            }

        } catch (err) {
            logger.error({ err }, 'Health check failed');
            status.issues.push(`Health check error: ${err}`);
        }

        return status;
    }

    // =========================================================================
    // METRIC GATHERING (File-based only!)
    // =========================================================================

    /**
     * Read memory info from /proc/meminfo
     */
    private async gatherMemoryMetrics(status: HealthStatus): Promise<void> {
        try {
            const meminfo = await fs.readFile('/proc/meminfo', 'utf-8');
            const lines = meminfo.split('\n');

            let memTotal = 0;
            let memAvailable = 0;

            for (const line of lines) {
                if (line.startsWith('MemTotal:')) {
                    memTotal = parseInt(line.split(/\s+/)[1], 10); // kB
                } else if (line.startsWith('MemAvailable:')) {
                    memAvailable = parseInt(line.split(/\s+/)[1], 10); // kB
                }
            }

            const memUsed = memTotal - memAvailable;
            status.memoryTotalMB = Math.round(memTotal / 1024);
            status.memoryUsedMB = Math.round(memUsed / 1024);
            status.memoryUsedPercent = Math.round((memUsed / memTotal) * 100);

        } catch (err) {
            logger.debug({ err }, 'Could not read /proc/meminfo (may not be Linux)');
        }
    }

    /**
     * Read load average from /proc/loadavg
     */
    private async gatherLoadMetrics(status: HealthStatus): Promise<void> {
        try {
            const loadavg = await fs.readFile('/proc/loadavg', 'utf-8');
            const parts = loadavg.trim().split(/\s+/);

            status.loadAverage1m = parseFloat(parts[0]) || 0;
            status.loadAverage5m = parseFloat(parts[1]) || 0;
            status.loadAverage15m = parseFloat(parts[2]) || 0;

            // Get CPU count from /proc/cpuinfo
            const cpuinfo = await fs.readFile('/proc/cpuinfo', 'utf-8');
            const cpuMatches = cpuinfo.match(/^processor\s*:/gm);
            status.cpuCount = cpuMatches ? cpuMatches.length : 1;

        } catch (err) {
            logger.debug({ err }, 'Could not read /proc/loadavg (may not be Linux)');
        }
    }

    /**
     * Count processes by reading /proc filesystem
     * This is the safe way - no spawning ps or grep!
     */
    private async gatherProcessCounts(status: HealthStatus): Promise<void> {
        try {
            const procDir = '/proc';
            const entries = await fs.readdir(procDir);

            let totalProcesses = 0;
            let claudeCount = 0;
            let geminiCount = 0;

            for (const entry of entries) {
                // Process directories are numeric
                if (!/^\d+$/.test(entry)) continue;

                totalProcesses++;

                try {
                    // Read the command line for this process
                    const cmdlinePath = `${procDir}/${entry}/cmdline`;
                    const cmdline = await fs.readFile(cmdlinePath, 'utf-8');

                    // cmdline uses null bytes as separators
                    const cmd = cmdline.split('\0')[0].toLowerCase();

                    if (cmd.includes('claude')) {
                        claudeCount++;
                    } else if (cmd.includes('gemini')) {
                        geminiCount++;
                    }
                } catch {
                    // Process may have exited between readdir and readFile
                }
            }

            status.totalProcessCount = totalProcesses;
            status.claudeProcessCount = claudeCount;
            status.geminiProcessCount = geminiCount;

        } catch (err) {
            logger.debug({ err }, 'Could not read /proc (may not be Linux)');
        }
    }

    // =========================================================================
    // HEALTH EVALUATION
    // =========================================================================

    private evaluateHealth(status: HealthStatus): void {
        // Start healthy, escalate based on issues
        status.level = 'healthy';

        // Memory checks
        if (status.memoryUsedPercent >= this.config.memoryCriticalPercent) {
            status.level = 'critical';
            status.issues.push(`Memory CRITICAL: ${status.memoryUsedPercent}% used (${status.memoryUsedMB}MB / ${status.memoryTotalMB}MB)`);
        } else if (status.memoryUsedPercent >= this.config.memoryWarningPercent) {
            if (status.level === 'healthy') status.level = 'warning';
            status.issues.push(`Memory WARNING: ${status.memoryUsedPercent}% used`);
        }

        // Load average checks
        const loadWarningThreshold = this.config.loadWarningMultiplier * status.cpuCount;
        const loadCriticalThreshold = this.config.loadCriticalMultiplier * status.cpuCount;

        if (status.loadAverage1m >= loadCriticalThreshold) {
            status.level = 'critical';
            status.issues.push(`Load CRITICAL: ${status.loadAverage1m.toFixed(1)} (threshold: ${loadCriticalThreshold})`);
        } else if (status.loadAverage1m >= loadWarningThreshold) {
            if (status.level === 'healthy') status.level = 'warning';
            status.issues.push(`Load WARNING: ${status.loadAverage1m.toFixed(1)} (threshold: ${loadWarningThreshold})`);
        }

        // Process count checks
        if (status.claudeProcessCount > this.config.maxClaudeProcesses) {
            if (status.level !== 'critical') status.level = 'warning';
            status.issues.push(`Claude process leak: ${status.claudeProcessCount} processes (max: ${this.config.maxClaudeProcesses})`);
        }

        if (status.geminiProcessCount > this.config.maxGeminiProcesses) {
            if (status.level !== 'critical') status.level = 'warning';
            status.issues.push(`Gemini process leak: ${status.geminiProcessCount} processes (max: ${this.config.maxGeminiProcesses})`);
        }

        if (status.totalProcessCount > this.config.maxTotalProcesses) {
            status.level = 'emergency';
            status.issues.push(`EMERGENCY: ${status.totalProcessCount} total processes (max: ${this.config.maxTotalProcesses})`);
        }

        // Track consecutive critical readings
        if (status.level === 'critical' || status.level === 'emergency') {
            this.consecutiveCriticalCount++;
        } else {
            this.consecutiveCriticalCount = 0;
        }
    }

    // =========================================================================
    // PROTECTIVE ACTIONS
    // =========================================================================

    private async takeAction(status: HealthStatus): Promise<void> {
        // Emergency: immediate shutdown
        if (status.level === 'emergency') {
            await this.shutdownWorkers(status, 'EMERGENCY');
            return;
        }

        // Critical for consecutive readings: shutdown
        if (status.level === 'critical' &&
            this.consecutiveCriticalCount >= this.config.criticalCountBeforeShutdown) {
            await this.shutdownWorkers(status, 'CRITICAL (consecutive)');
            return;
        }

        // Warning with process leaks: kill orphans
        if (status.claudeProcessCount > this.config.maxClaudeProcesses ||
            status.geminiProcessCount > this.config.maxGeminiProcesses) {
            await this.killOrphanedProcesses(status);
        }
    }

    /**
     * Kill orphaned Claude/Gemini processes via Docker exec
     */
    private async killOrphanedProcesses(status: HealthStatus): Promise<void> {
        try {
            // We can't spawn pkill directly (that's what got us in trouble!)
            // Instead, restart the worker containers which will clean up their children
            logger.warn({
                claudeCount: status.claudeProcessCount,
                geminiCount: status.geminiProcessCount
            }, 'Orphaned processes detected, restarting workers');

            await this.restartWorkers(status);
            status.actionsTaken.push('Restarted workers to clean orphaned processes');

        } catch (err) {
            logger.error({ err }, 'Failed to kill orphaned processes');
        }
    }

    /**
     * Restart worker containers via Docker API
     */
    private async restartWorkers(status: HealthStatus): Promise<void> {
        if (!this.config.enableAutoShutdown) {
            logger.warn('Auto-shutdown disabled, skipping worker restart');
            status.actionsTaken.push('Worker restart SKIPPED (auto-shutdown disabled)');
            return;
        }

        try {
            const containers = await this.listContainers();
            const workerContainers = containers.filter((c: any) =>
                c.Names?.some((n: string) => n.includes('worker'))
            );

            for (const container of workerContainers) {
                const containerId = container.Id;
                const containerName = container.Names?.[0] || containerId;

                logger.warn({ containerId, containerName }, 'Restarting worker container');

                await fetch(`${this.config.dockerProxyUrl}/containers/${containerId}/restart`, {
                    method: 'POST',
                });

                status.actionsTaken.push(`Restarted ${containerName}`);
            }

        } catch (err) {
            logger.error({ err }, 'Failed to restart workers via Docker API');
            status.actionsTaken.push(`Worker restart FAILED: ${err}`);
        }
    }

    /**
     * Stop worker containers - the nuclear option
     */
    private async shutdownWorkers(status: HealthStatus, reason: string): Promise<void> {
        if (this.isShutdownInProgress) {
            logger.warn('Shutdown already in progress');
            return;
        }

        if (!this.config.enableAutoShutdown) {
            logger.error({ reason }, 'SHUTDOWN REQUIRED but auto-shutdown disabled!');
            status.actionsTaken.push(`Shutdown REQUIRED (${reason}) but auto-shutdown disabled`);
            return;
        }

        this.isShutdownInProgress = true;
        logger.error({ reason, status }, 'INITIATING WORKER SHUTDOWN');

        try {
            const containers = await this.listContainers();
            const workerContainers = containers.filter((c: any) =>
                c.Names?.some((n: string) => n.includes('worker'))
            );

            for (const container of workerContainers) {
                const containerId = container.Id;
                const containerName = container.Names?.[0] || containerId;

                logger.error({ containerId, containerName, reason }, 'STOPPING worker container');

                await fetch(`${this.config.dockerProxyUrl}/containers/${containerId}/stop`, {
                    method: 'POST',
                });

                status.actionsTaken.push(`STOPPED ${containerName} (${reason})`);
            }

            // Reset critical count after shutdown
            this.consecutiveCriticalCount = 0;

        } catch (err) {
            logger.error({ err }, 'Failed to shutdown workers via Docker API');
            status.actionsTaken.push(`Worker shutdown FAILED: ${err}`);
        } finally {
            this.isShutdownInProgress = false;
        }
    }

    /**
     * List running containers via Docker API
     */
    private async listContainers(): Promise<any[]> {
        const response = await fetch(`${this.config.dockerProxyUrl}/containers/json`);
        if (!response.ok) {
            throw new Error(`Docker API error: ${response.status}`);
        }
        return await response.json();
    }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const healthGuardianService = new HealthGuardianService();
