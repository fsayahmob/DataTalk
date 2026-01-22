import express from 'express';
import cors from 'cors';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDocker } from '../services/docker.js';
import { detectCloud } from '../services/cloud.js';
import { exploreVolume } from '../services/filesystem.js';
import { scanPorts, getAllListeningPorts } from '../services/process.js';
import type {
  InfraData,
  VMInfo,
  ComposeInfo,
  VolumeInfo,
  ContainerStats,
} from '../types/infra.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.INFRA_DASHBOARD_PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files in production
// __dirname = dist/server/server, so go up 2 levels to dist/, then into client/
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '..', '..', 'client');
  app.use(express.static(clientPath));
}

function detectVM(): VMInfo {
  return {
    detected: true,
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
  };
}

function extractComposeInfo(
  containers: Array<{ compose: { project: string | null; service: string | null } }>
): ComposeInfo {
  const projects = new Set<string>();
  const services: string[] = [];

  for (const container of containers) {
    if (container.compose.project) {
      projects.add(container.compose.project);
    }
    if (container.compose.service) {
      services.push(container.compose.service);
    }
  }

  const projectArray = Array.from(projects);

  return {
    detected: projectArray.length > 0,
    project: projectArray.length === 1 ? projectArray[0] : null,
    services,
  };
}

app.get('/api/detect', async (_req, res) => {
  try {
    const [docker, cloud] = await Promise.all([detectDocker(), detectCloud()]);

    const vm = detectVM();

    const dockerData = docker as {
      detected: boolean;
      engine?: {
        version: string;
        api_version: string;
        os: string;
        arch: string;
      };
      containers?: Array<{
        id: string;
        name: string;
        image: string;
        status: string;
        ports: Array<{
          container: number;
          host: number | null;
          protocol: string;
          exposed: boolean;
        }>;
        networks: Array<{ name: string; ip: string; gateway: string }>;
        mounts: Array<{
          type: string;
          source: string;
          destination: string;
          readOnly: boolean;
        }>;
        resources: { cpu_percent: number; memory_mb: number; memory_limit_mb: number } | null;
        compose: { project: string | null; service: string | null };
        process: { cmd: string; workdir: string };
      }>;
      networks?: Array<{
        id: string;
        name: string;
        driver: string;
        scope: string;
        containers: string[];
      }>;
      volumes?: Array<{
        name: string;
        driver: string;
        mountpoint: string;
        usedBy: string[];
      }>;
      connections?: Array<{
        from: string;
        to: string;
        port: number;
        network: string;
        internal: boolean;
        token: boolean;
      }>;
      images?: Array<{
        name: string;
        tag: string;
        id: string;
        size: number;
        created: string;
      }>;
    };

    const containers = dockerData.containers || [];
    const compose = extractComposeInfo(containers);

    const volumesWithDetails: VolumeInfo[] = await Promise.all(
      (dockerData.volumes || []).map(async (vol) => {
        const explored = await exploreVolume(vol.mountpoint);
        return {
          ...vol,
          path: explored.path,
          exists: explored.exists,
          size_mb: explored.size_mb,
          children: explored.children,
        };
      })
    );

    const infraData: InfraData = {
      timestamp: new Date().toISOString(),
      cloud,
      vm,
      docker_engine: {
        detected: dockerData.detected,
        version: dockerData.engine?.version,
        api_version: dockerData.engine?.api_version,
        os: dockerData.engine?.os,
        arch: dockerData.engine?.arch,
      },
      compose,
      networks: dockerData.networks || [],
      containers,
      volumes: volumesWithDetails,
      connections: dockerData.connections || [],
      images: dockerData.images || [],
    };

    res.json(infraData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStats = async (): Promise<void> => {
    try {
      const docker = await detectDocker();
      const dockerData = docker as {
        containers?: Array<{
          name: string;
          status: string;
          resources: { cpu_percent: number; memory_mb: number } | null;
        }>;
      };

      const stats: ContainerStats[] = (dockerData.containers || []).map((c) => ({
        name: c.name,
        status: c.status,
        cpu: c.resources?.cpu_percent,
        memory_mb: c.resources?.memory_mb,
      }));

      res.write(`data: ${JSON.stringify({ type: 'stats', data: stats })}\n\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stream error';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    }
  };

  sendStats();
  const interval = setInterval(sendStats, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Scan specific ports to detect what's running (Docker, local process, systemd)
app.get('/api/ports', async (req, res) => {
  try {
    const portsParam = req.query.ports as string;

    if (portsParam) {
      // Scan specific ports
      const ports = portsParam.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
      const results = await scanPorts(ports);
      res.json({ ports: results });
    } else {
      // Get all listening ports
      const results = await getAllListeningPorts();
      res.json({ ports: results });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// SPA fallback for client-side routing (production only)
// Express 5 / path-to-regexp v8 requires named wildcard pattern
if (process.env.NODE_ENV === 'production') {
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'client', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Infra Dashboard API running on port ${PORT}`);
});
