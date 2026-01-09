import { exec } from "child_process";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "query.py");

export async function executeQuery(sql: string): Promise<Record<string, unknown>[]> {
  // Échapper les guillemets dans le SQL
  const escapedSql = sql.replace(/"/g, '\\"');

  try {
    const { stdout, stderr } = await execAsync(`python3 "${SCRIPT_PATH}" "${escapedSql}"`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.error("Python stderr:", stderr);
    }

    const result = JSON.parse(stdout);

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  } catch (error) {
    console.error("Query execution error:", error);
    throw error;
  }
}
