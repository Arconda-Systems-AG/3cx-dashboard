import { NextResponse } from "next/server";
import { createPool } from "@/lib/pg";
import { tabQueries, tabDeptConfig, type TabId, type DeptFilterType } from "../queries";
import { xapiFetch } from "@/lib/threecx-client";
import type { ODataList, Queue } from "@3cx-dash/types";

function buildDeptCondition(filter: DeptFilterType, alias: string): string {
  const p = alias ? `${alias}.` : "";
  switch (filter) {
    case "queue_dn":
      return `AND ${p}destination_dn_number = $3`;
    case "agents":
      return `AND (${p}source_dn_number = ANY($3::text[]) OR ${p}destination_dn_number = ANY($3::text[]))`;
    case "both":
      // $3 = queueNumber, $4 = agentNumbers
      return `AND (${p}destination_dn_number = $3 OR ${p}source_dn_number = ANY($4::text[]) OR ${p}destination_dn_number = ANY($4::text[]))`;
  }
}

function injectDeptFilter(sql: string, filter: DeptFilterType, alias: string): string {
  const prefix = alias ? `${alias}.` : "";
  const pattern = `AND ${prefix}cdr_started_at <= $2`;
  const condition = buildDeptCondition(filter, alias);
  return sql.replaceAll(pattern, `${pattern}\n\t${condition}`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tab: string }> }
) {
  const { tab } = await params;
  const { searchParams } = new URL(request.url);

  const tabId = tab as TabId;
  const queries = tabQueries[tabId];
  if (!queries) {
    return NextResponse.json({ error: `Unbekannter Tab: ${tab}` }, { status: 400 });
  }

  const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
  const fromDate = searchParams.get("from")
    ? new Date(searchParams.get("from")!)
    : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Warteschlangen-Filter: ?queue=QUEUE_NUMBER
  const queueNumber = searchParams.get("queue") ?? "";
  // Abteilungs-Filter: ?group=GROUP_ID (überschreibt queue-Filter)
  const groupId = searchParams.get("group") ?? "";

  const deptConfig = tabDeptConfig[tabId];
  let agentNumbers: string[] = [];

  if (groupId && deptConfig) {
    // Gruppen-Mitglieder von 3CX laden
    try {
      const groupData = await xapiFetch<{ value: { Members?: { Number?: string }[] }[] }>(
        `Groups?$filter=Id eq ${groupId}&$expand=Members($select=Number)`
      );
      agentNumbers = (groupData.value[0]?.Members ?? [])
        .map((m) => m.Number)
        .filter(Boolean) as string[];
    } catch {
      // Ohne Agenten-Filter fortfahren
    }
  } else if (queueNumber && deptConfig) {
    // Agenten der ausgewählten Queue von 3CX laden
    try {
      const queueData = await xapiFetch<ODataList<Queue>>(
        `Queues?$filter=Number eq '${queueNumber}'&$expand=Agents`
      );
      agentNumbers = (queueData.value[0]?.Agents ?? []).map((a) => a.Number);
    } catch {
      // Ohne Agenten-Filter fortfahren
    }
  }

  const pool = await createPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Keine Datenbankverbindung konfiguriert. Bitte PostgreSQL-Quelle in den Einstellungen eintragen." },
      { status: 503 }
    );
  }

  const client = await pool.connect();
  try {
    const results: Record<string, unknown> = {};

    await Promise.all(
      queries.map(async (q) => {
        try {
          let sql = q.sql;
          const sqlParams: unknown[] = [fromDate.toISOString(), toDate.toISOString()];

          if (groupId && deptConfig) {
            // Gruppen-Filter: immer agents-basiert (unabhängig von deptConfig.filter)
            sql = injectDeptFilter(sql, "agents", deptConfig.alias);
            sqlParams.push(agentNumbers); // $3 = array
          } else if (queueNumber && deptConfig) {
            sql = injectDeptFilter(sql, deptConfig.filter, deptConfig.alias);

            if (deptConfig.filter === "queue_dn") {
              sqlParams.push(queueNumber); // $3
            } else if (deptConfig.filter === "agents") {
              sqlParams.push(agentNumbers); // $3 = array
            } else {
              // 'both'
              sqlParams.push(queueNumber); // $3
              sqlParams.push(agentNumbers); // $4 = array
            }
          }

          const res = await client.query(sql, sqlParams);
          results[q.key] = {
            title: q.title,
            type: q.type,
            rows: res.rows,
            fields: res.fields.map((f) => f.name),
          };
        } catch (err) {
          results[q.key] = {
            title: q.title,
            type: q.type,
            error: String(err),
            rows: [],
            fields: [],
          };
        }
      })
    );

    return NextResponse.json({
      tab: tabId,
      from: fromDate,
      to: toDate,
      queueFilter: queueNumber || groupId || null,
      results,
    });
  } finally {
    client.release();
    await pool.end();
  }
}
