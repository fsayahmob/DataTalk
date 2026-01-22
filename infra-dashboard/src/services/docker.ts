import Docker from 'dockerode';
import type {
  ContainerInfo,
  NetworkInfo,
  ConnectionInfo,
  PortInfo,
  ContainerNetworkInfo,
  MountInfo,
  ResourceInfo,
  ProcessInfo,
  ContainerComposeInfo,
} from '../types/infra.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
  };
}

interface DockerNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
}

interface DockerVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
}

interface DockerVolumeList {
  Volumes: DockerVolume[] | null;
}

interface DockerImageInfo {
  name: string;
  tag: string;
  id: string;
  size: number;
  created: string;
}

interface DockerEngineInfo {
  detected: boolean;
  engine?: {
    version: string;
    api_version: string;
    os: string;
    arch: string;
  };
  containers?: ContainerInfo[];
  networks?: NetworkInfo[];
  volumes?: Array<{
    name: string;
    driver: string;
    mountpoint: string;
    usedBy: string[];
  }>;
  connections?: ConnectionInfo[];
  images?: DockerImageInfo[];
}

function calculateCpuPercent(stats: DockerStats): number {
  if (!stats.cpu_stats || !stats.precpu_stats) return 0;
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  if (systemDelta > 0 && cpuDelta > 0) {
    return Math.round((cpuDelta / systemDelta) * cpuCount * 100 * 100) / 100;
  }
  return 0;
}

function deduplicateConnections(connections: ConnectionInfo[]): ConnectionInfo[] {
  const seen = new Set<string>();
  return connections.filter((conn) => {
    const key = `${conn.from}-${conn.to}-${conn.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectConnections(
  containers: ContainerInfo[],
  networks: DockerNetwork[]
): ConnectionInfo[] {
  const connections: ConnectionInfo[] = [];

  for (const network of networks) {
    if (['bridge', 'host', 'none'].includes(network.Name)) continue;

    const containersOnNetwork = containers.filter((c) =>
      c.networks.some((cn) => cn.name === network.Name)
    );

    for (const source of containersOnNetwork) {
      for (const target of containersOnNetwork) {
        if (source.id === target.id) continue;

        for (const port of target.ports) {
          if (port.container) {
            connections.push({
              from: source.name,
              to: target.name,
              port: port.container,
              network: network.Name,
              internal: !port.exposed,
              token: false, // Will be enhanced later with env var heuristics
            });
          }
        }
      }
    }
  }

  return deduplicateConnections(connections);
}

export async function detectDocker(): Promise<DockerEngineInfo> {
  try {
    const engineInfo = await docker.version();

    const containers = await docker.listContainers({ all: true });
    const networks = (await docker.listNetworks()) as DockerNetwork[];
    const volumeList = (await docker.listVolumes()) as DockerVolumeList;

    const containersWithDetails: ContainerInfo[] = await Promise.all(
      containers.map(async (c) => {
        const container = docker.getContainer(c.Id);
        const inspect = await container.inspect();
        let stats: DockerStats | null = null;

        try {
          stats = (await container.stats({ stream: false })) as DockerStats;
        } catch {
          // Container might not be running
        }

        const ports: PortInfo[] = c.Ports.map((p) => ({
          container: p.PrivatePort,
          host: p.PublicPort || null,
          protocol: p.Type,
          exposed: !!p.PublicPort,
        }));

        const containerNetworks: ContainerNetworkInfo[] = Object.entries(
          inspect.NetworkSettings.Networks
        ).map(([name, config]) => ({
          name,
          ip: (config as { IPAddress: string }).IPAddress || '',
          gateway: (config as { Gateway: string }).Gateway || '',
        }));

        const mounts: MountInfo[] = inspect.Mounts.map((m) => ({
          type: m.Type,
          source: m.Source,
          destination: m.Destination,
          readOnly: m.RW === false,
        }));

        const resources: ResourceInfo | null = stats
          ? {
              cpu_percent: calculateCpuPercent(stats),
              memory_mb: Math.round(
                (stats.memory_stats.usage || 0) / 1024 / 1024
              ),
              memory_limit_mb: Math.round(
                (stats.memory_stats.limit || 0) / 1024 / 1024
              ),
            }
          : null;

        const compose: ContainerComposeInfo = {
          project:
            inspect.Config.Labels['com.docker.compose.project'] || null,
          service:
            inspect.Config.Labels['com.docker.compose.service'] || null,
        };

        const cmdArray = inspect.Config.Cmd;
        const entrypointArray = inspect.Config.Entrypoint;
        const cmdStr = Array.isArray(cmdArray) ? cmdArray.join(' ') : cmdArray;
        const entrypointStr = Array.isArray(entrypointArray)
          ? entrypointArray.join(' ')
          : entrypointArray;

        const process: ProcessInfo = {
          cmd: cmdStr || entrypointStr || 'unknown',
          workdir: inspect.Config.WorkingDir,
        };

        return {
          id: c.Id.substring(0, 12),
          name: c.Names[0]?.replace('/', '') || 'unknown',
          image: c.Image,
          status: c.State,
          ports,
          networks: containerNetworks,
          mounts,
          resources,
          compose,
          process,
        };
      })
    );

    const networkInfos: NetworkInfo[] = networks.map((n) => ({
      id: n.Id.substring(0, 12),
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      containers: containersWithDetails
        .filter((c) => c.networks.some((cn) => cn.name === n.Name))
        .map((c) => c.name),
    }));

    const volumes =
      volumeList.Volumes?.map((v) => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        usedBy: containersWithDetails
          .filter((c) =>
            c.mounts.some(
              (m) => m.source.includes(v.Name) || m.source === v.Mountpoint
            )
          )
          .map((c) => c.name),
      })) || [];

    const connections = detectConnections(containersWithDetails, networks);

    // Get list of images
    const imageList = await docker.listImages();
    const images: DockerImageInfo[] = imageList.map((img) => {
      const repoTag = img.RepoTags?.[0] || '<none>:<none>';
      const [name, tag] = repoTag.split(':');
      return {
        name: name || '<none>',
        tag: tag || 'latest',
        id: img.Id.replace('sha256:', '').substring(0, 12),
        size: Math.round(img.Size / 1024 / 1024),
        created: new Date(img.Created * 1000).toISOString(),
      };
    });

    return {
      detected: true,
      engine: {
        version: engineInfo.Version,
        api_version: engineInfo.ApiVersion,
        os: engineInfo.Os,
        arch: engineInfo.Arch,
      },
      containers: containersWithDetails,
      networks: networkInfos,
      volumes,
      connections,
      images,
    };
  } catch {
    return { detected: false };
  }
}
