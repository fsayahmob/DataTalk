/**
 * Types for infrastructure detection.
 * All types are agnostic - no hardcoded project-specific values.
 */

export interface ImageInfo {
  name: string;
  tag: string;
  id: string;
  size: number;
  created: string;
}

export interface InfraData {
  timestamp: string;
  cloud: CloudInfo;
  vm: VMInfo;
  docker_engine: DockerEngineInfo;
  compose: ComposeInfo;
  networks: NetworkInfo[];
  containers: ContainerInfo[];
  volumes: VolumeInfo[];
  connections: ConnectionInfo[];
  images?: ImageInfo[];
}

export interface CloudInfo {
  detected: boolean;
  provider?: 'gcp' | 'aws' | 'azure';
  project?: string;
  zone?: string;
  region?: string;
  hostname?: string;
  vmName?: string;
}

export interface VMInfo {
  detected: boolean;
  hostname?: string;
  os?: string;
}

export interface DockerEngineInfo {
  detected: boolean;
  version?: string;
  api_version?: string;
  os?: string;
  arch?: string;
}

export interface ComposeInfo {
  detected: boolean;
  project?: string | null;
  services: string[];
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: string[];
}

export interface PortInfo {
  container: number;
  host: number | null;
  protocol: string;
  exposed: boolean;
}

export interface MountInfo {
  type: string;
  source: string;
  destination: string;
  readOnly: boolean;
}

export interface ResourceInfo {
  cpu_percent: number;
  memory_mb: number;
  memory_limit_mb: number;
}

export interface ContainerNetworkInfo {
  name: string;
  ip: string;
  gateway: string;
}

export interface ContainerComposeInfo {
  project: string | null;
  service: string | null;
}

export interface ProcessInfo {
  cmd: string;
  workdir: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: PortInfo[];
  networks: ContainerNetworkInfo[];
  mounts: MountInfo[];
  resources: ResourceInfo | null;
  compose: ContainerComposeInfo;
  process: ProcessInfo;
}

export interface FileDetails {
  type: string;
  tables?: TableInfo[];
  table_count?: number;
  total_rows?: number;
  size_mb?: number;
  modified?: string;
  is_array?: boolean;
  length?: number;
  keys?: string[] | null;
  error?: string;
}

export interface TableInfo {
  name: string;
  rows: number;
}

export interface VolumeChild {
  name: string;
  path: string;
  type: string;
  size_mb: number;
  children?: VolumeChild[];
  details?: FileDetails | null;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  usedBy: string[];
  path?: string;
  exists?: boolean;
  size_mb?: number;
  children?: VolumeChild[];
}

export interface ConnectionInfo {
  from: string;
  to: string;
  port: number;
  network: string;
  internal: boolean;
  token: boolean;
}

export interface StatsUpdate {
  type: 'stats';
  data: ContainerStats[];
}

export interface ContainerStats {
  name: string;
  status: string;
  cpu: number | undefined;
  memory_mb: number | undefined;
}

export interface ErrorUpdate {
  type: 'error';
  message: string;
}

export type SSEUpdate = StatsUpdate | ErrorUpdate;
