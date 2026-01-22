import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ProcessInfo {
  port: number;
  pid: number;
  command: string;
  runtime: 'docker' | 'process' | 'systemd' | 'unknown';
  name?: string;
}

export interface PortScanResult {
  port: number;
  listening: boolean;
  process?: ProcessInfo;
}

/**
 * Check if a process is running via systemd
 */
async function isSystemdService(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o unit= 2>/dev/null || true`);
    const unit = stdout.trim();
    if (unit && unit !== '-' && unit.endsWith('.service')) {
      return unit;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a process is running inside Docker
 */
async function isDockerProcess(pid: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`cat /proc/${pid}/cgroup 2>/dev/null || true`);
    return stdout.includes('docker') || stdout.includes('containerd');
  } catch {
    // On macOS, Docker runs in a VM so this won't work
    // We rely on Docker API detection instead
    return false;
  }
}

/**
 * Get process info by PID
 */
async function getProcessInfo(pid: number): Promise<{ command: string; name: string }> {
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o comm=,args= 2>/dev/null || true`);
    const parts = stdout.trim().split(/\s+/);
    const name = parts[0] || 'unknown';
    const command = parts.slice(1).join(' ') || name;
    return { command, name };
  } catch {
    return { command: 'unknown', name: 'unknown' };
  }
}

/**
 * Detect what's listening on a specific port using lsof
 */
export async function detectPortProcess(port: number): Promise<PortScanResult> {
  try {
    // Use lsof to find process listening on port
    const { stdout } = await execAsync(
      `lsof -i :${port} -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 | head -1 || true`
    );

    if (!stdout.trim()) {
      return { port, listening: false };
    }

    // Parse lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = stdout.trim().split(/\s+/);
    const command = parts[0] || 'unknown';
    const pid = parseInt(parts[1], 10);

    if (isNaN(pid)) {
      return { port, listening: true };
    }

    // Determine runtime type
    let runtime: ProcessInfo['runtime'] = 'process';

    // Check if it's a Docker process (com.docker.backend, vpnkit, etc.)
    // Note: lsof truncates COMMAND to ~9 chars, so "com.docker.backend" becomes "com.docke"
    if (
      command.includes('docker') ||
      command.includes('com.docker') ||
      command.startsWith('com.docke') ||
      command === 'vpnkit-bridge' ||
      command === 'com.docker.backend'
    ) {
      runtime = 'docker';
    }

    // Check systemd on Linux
    const systemdUnit = await isSystemdService(pid);
    if (systemdUnit) {
      runtime = 'systemd';
    }

    // Check if running in Docker container (Linux only)
    const inDocker = await isDockerProcess(pid);
    if (inDocker) {
      runtime = 'docker';
    }

    const processDetails = await getProcessInfo(pid);

    return {
      port,
      listening: true,
      process: {
        port,
        pid,
        command: processDetails.command || command,
        runtime,
        name: processDetails.name || command,
      },
    };
  } catch {
    return { port, listening: false };
  }
}

/**
 * Scan multiple ports and return their status
 */
export async function scanPorts(ports: number[]): Promise<PortScanResult[]> {
  return Promise.all(ports.map(detectPortProcess));
}

/**
 * Get all listening ports on the system
 */
export async function getAllListeningPorts(): Promise<PortScanResult[]> {
  try {
    const { stdout } = await execAsync(
      `lsof -i -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 || true`
    );

    const results: PortScanResult[] = [];
    const seen = new Set<number>();

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;

      const parts = line.split(/\s+/);
      const command = parts[0];
      const pid = parseInt(parts[1], 10);
      const nameField = parts[parts.length - 1]; // e.g., "*:3000" or "127.0.0.1:8000"

      // Extract port from name field
      const portMatch = nameField.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (seen.has(port)) continue;
      seen.add(port);

      let runtime: ProcessInfo['runtime'] = 'process';
      // Note: lsof truncates COMMAND to ~9 chars, so "com.docker.backend" becomes "com.docke"
      if (
        command.includes('docker') ||
        command.includes('com.docker') ||
        command.startsWith('com.docke') ||
        command === 'vpnkit-bridge'
      ) {
        runtime = 'docker';
      }

      results.push({
        port,
        listening: true,
        process: {
          port,
          pid,
          command,
          runtime,
          name: command,
        },
      });
    }

    return results;
  } catch {
    return [];
  }
}
