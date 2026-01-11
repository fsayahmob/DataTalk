"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

export function DatabaseTab() {
  return (
    <div className="border border-border/30 rounded-md">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground w-32">Engine</TableCell>
            <TableCell className="text-xs font-mono text-foreground">DuckDB</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">File</TableCell>
            <TableCell className="text-xs font-mono text-foreground">data/g7_analytics.duckdb</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Status</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-[10px] h-5 text-emerald-400 border-emerald-400/30">
                connected
              </Badge>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Catalog</TableCell>
            <TableCell>
              <a href="/catalog" className="text-xs text-primary hover:underline">
                View semantic catalog →
              </a>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
