import type { CloudInfo } from '../types/infra.js';

const TIMEOUT_MS = 100;

interface GCPMetadata {
  detected: boolean;
  project?: string;
  zone?: string;
  hostname?: string;
}

interface AWSMetadata {
  detected: boolean;
  instanceId?: string;
  region?: string;
  instanceType?: string;
}

interface AzureMetadata {
  detected: boolean;
  subscriptionId?: string;
  resourceGroup?: string;
  vmName?: string;
  location?: string;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function detectGCP(): Promise<GCPMetadata> {
  try {
    const res = await fetchWithTimeout(
      'http://169.254.169.254/computeMetadata/v1/project/project-id',
      { headers: { 'Metadata-Flavor': 'Google' } },
      TIMEOUT_MS
    );

    if (!res?.ok) return { detected: false };

    const project = await res.text();

    const [zoneRes, hostnameRes] = await Promise.all([
      fetchWithTimeout(
        'http://169.254.169.254/computeMetadata/v1/instance/zone',
        { headers: { 'Metadata-Flavor': 'Google' } },
        TIMEOUT_MS
      ),
      fetchWithTimeout(
        'http://169.254.169.254/computeMetadata/v1/instance/hostname',
        { headers: { 'Metadata-Flavor': 'Google' } },
        TIMEOUT_MS
      ),
    ]);

    const zoneRaw = zoneRes?.ok ? await zoneRes.text() : null;
    const hostname = hostnameRes?.ok ? await hostnameRes.text() : undefined;

    return {
      detected: true,
      project,
      zone: zoneRaw?.split('/').pop(),
      hostname,
    };
  } catch {
    return { detected: false };
  }
}

async function detectAWS(): Promise<AWSMetadata> {
  try {
    // AWS IMDSv2 - first get a token
    const tokenRes = await fetchWithTimeout(
      'http://169.254.169.254/latest/api/token',
      {
        method: 'PUT',
        headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      },
      TIMEOUT_MS
    );

    const token = tokenRes?.ok ? await tokenRes.text() : null;
    const headers: Record<string, string> = token
      ? { 'X-aws-ec2-metadata-token': token }
      : {};

    const [instanceIdRes, regionRes, instanceTypeRes] = await Promise.all([
      fetchWithTimeout(
        'http://169.254.169.254/latest/meta-data/instance-id',
        { headers },
        TIMEOUT_MS
      ),
      fetchWithTimeout(
        'http://169.254.169.254/latest/meta-data/placement/region',
        { headers },
        TIMEOUT_MS
      ),
      fetchWithTimeout(
        'http://169.254.169.254/latest/meta-data/instance-type',
        { headers },
        TIMEOUT_MS
      ),
    ]);

    const instanceId = instanceIdRes?.ok
      ? await instanceIdRes.text()
      : undefined;

    if (!instanceId) return { detected: false };

    return {
      detected: true,
      instanceId,
      region: regionRes?.ok ? await regionRes.text() : undefined,
      instanceType: instanceTypeRes?.ok
        ? await instanceTypeRes.text()
        : undefined,
    };
  } catch {
    return { detected: false };
  }
}

async function detectAzure(): Promise<AzureMetadata> {
  try {
    const res = await fetchWithTimeout(
      'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
      { headers: { Metadata: 'true' } },
      TIMEOUT_MS
    );

    if (!res?.ok) return { detected: false };

    const data = (await res.json()) as {
      compute?: {
        subscriptionId?: string;
        resourceGroupName?: string;
        name?: string;
        location?: string;
      };
    };

    return {
      detected: true,
      subscriptionId: data.compute?.subscriptionId,
      resourceGroup: data.compute?.resourceGroupName,
      vmName: data.compute?.name,
      location: data.compute?.location,
    };
  } catch {
    return { detected: false };
  }
}

export async function detectCloud(): Promise<CloudInfo> {
  const [gcp, aws, azure] = await Promise.all([
    detectGCP(),
    detectAWS(),
    detectAzure(),
  ]);

  if (gcp.detected) {
    return {
      detected: true,
      provider: 'gcp',
      project: gcp.project,
      zone: gcp.zone,
      hostname: gcp.hostname,
    };
  }

  if (aws.detected) {
    return {
      detected: true,
      provider: 'aws',
      region: aws.region,
    };
  }

  if (azure.detected) {
    return {
      detected: true,
      provider: 'azure',
      region: azure.location,
      vmName: azure.vmName,
    };
  }

  return { detected: false };
}
