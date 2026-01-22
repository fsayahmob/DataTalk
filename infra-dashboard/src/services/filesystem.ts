import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { VolumeChild, FileDetails, TableInfo } from '../types/infra.js';

const FILE_TYPE_MAP: Record<string, string> = {
  '.sqlite': 'sqlite',
  '.sqlite3': 'sqlite',
  '.db': 'sqlite',
  '.duckdb': 'duckdb',
  '.parquet': 'parquet',
  '.csv': 'csv',
  '.json': 'json',
  '.xlsx': 'excel',
  '.xls': 'excel',
  '.log': 'log',
  '.txt': 'text',
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
};

function detectFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return FILE_TYPE_MAP[ext] || 'file';
}

async function inspectSQLite(filePath: string): Promise<FileDetails> {
  try {
    const db = new Database(filePath, { readonly: true });

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all() as Array<{ name: string }>;

    const tableDetails: TableInfo[] = tables.map((t) => {
      const result = db
        .prepare(`SELECT COUNT(*) as count FROM "${t.name}"`)
        .get() as { count: number } | undefined;
      return {
        name: t.name,
        rows: result?.count || 0,
      };
    });

    db.close();

    return {
      type: 'sqlite',
      tables: tableDetails,
      table_count: tableDetails.length,
      total_rows: tableDetails.reduce((sum, t) => sum + t.rows, 0),
    };
  } catch {
    return { type: 'sqlite', error: 'Cannot read database' };
  }
}

async function inspectDuckDB(filePath: string): Promise<FileDetails> {
  try {
    const stats = await fs.stat(filePath);
    return {
      type: 'duckdb',
      size_mb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
      modified: stats.mtime.toISOString(),
    };
  } catch {
    return { type: 'duckdb', error: 'Cannot read file' };
  }
}

async function inspectJSON(filePath: string): Promise<FileDetails> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(content);

    return {
      type: 'json',
      is_array: Array.isArray(data),
      length: Array.isArray(data)
        ? data.length
        : Object.keys(data as object).length,
      keys: Array.isArray(data)
        ? null
        : Object.keys(data as object).slice(0, 10),
    };
  } catch {
    return { type: 'json', error: 'Cannot parse JSON' };
  }
}

async function getFileDetails(
  filePath: string,
  type: string
): Promise<FileDetails | null> {
  switch (type) {
    case 'sqlite':
      return inspectSQLite(filePath);
    case 'duckdb':
      return inspectDuckDB(filePath);
    case 'json':
      return inspectJSON(filePath);
    default:
      return null;
  }
}

async function exploreDirectory(
  dirPath: string,
  maxDepth: number
): Promise<VolumeChild[]> {
  if (maxDepth <= 0) return [];

  const children: VolumeChild[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries.slice(0, 20)) {
      const entryPath = path.join(dirPath, entry.name);

      try {
        const stats = await fs.stat(entryPath);

        if (entry.isDirectory()) {
          children.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
            size_mb: 0,
            children: await exploreDirectory(entryPath, maxDepth - 1),
          });
        } else {
          children.push({
            name: entry.name,
            path: entryPath,
            type: detectFileType(entry.name),
            size_mb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Directory not accessible
  }

  return children;
}

export interface VolumeExploreResult {
  path: string;
  exists: boolean;
  size_mb: number;
  children: VolumeChild[];
}

export async function exploreVolume(
  mountPath: string
): Promise<VolumeExploreResult> {
  const result: VolumeExploreResult = {
    path: mountPath,
    exists: false,
    size_mb: 0,
    children: [],
  };

  try {
    const stats = await fs.stat(mountPath);
    if (!stats.isDirectory()) return result;

    result.exists = true;

    const entries = await fs.readdir(mountPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(mountPath, entry.name);

      try {
        const entryStats = await fs.stat(entryPath);

        const child: VolumeChild = {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : detectFileType(entry.name),
          size_mb: Math.round((entryStats.size / 1024 / 1024) * 100) / 100,
        };

        if (entry.isDirectory()) {
          child.children = await exploreDirectory(entryPath, 2);
        } else if (entry.isFile()) {
          child.details = await getFileDetails(entryPath, child.type);
        }

        result.children.push(child);
      } catch {
        // Skip inaccessible entries
      }
    }

    result.size_mb = result.children.reduce(
      (sum, c) => sum + (c.size_mb || 0),
      0
    );
  } catch {
    // Volume inaccessible
  }

  return result;
}
