import type pg from "pg";
import { toDbError, withUser, type DbError } from "./pool";

/**
 * Minimal re-implementation of the supabase-js query builder on top of `pg`.
 * Covers the subset the app uses: select (with count/head), insert, update, upsert,
 * delete, filters (eq, neq, gt, gte, lt, lte, is, in, like, ilike, contains, not, or),
 * order, limit, range, single, maybeSingle and rpc.
 * Results keep the supabase shape `{ data, error, count }` and never throw.
 */

export type QueryResult<T = any> = {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type UserResolver = () => Promise<string | null>;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(name: string): string {
  const trimmed = name.trim();
  if (!IDENT.test(trimmed)) throw new Error(`Identifiant invalide: ${name}`);
  return `"${trimmed}"`;
}

function selectList(columns: string): string {
  const cols = columns.trim();
  if (cols === "" || cols === "*") return "*";
  return cols
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      if (c === "*") return "*";
      const [alias, column] = c.includes(":") ? c.split(":") : [null, c];
      return alias ? `${ident(column!)} as ${ident(alias)}` : ident(column!);
    })
    .join(", ");
}

function toParam(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    return JSON.stringify(value);
  }
  return value;
}

class Params {
  values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(toParam(value));
    return `$${this.values.length}`;
  }
}

type Filter = (p: Params) => string;

const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

function isClause(column: string, value: unknown, negate = false): string {
  const v = value === null || value === "null" ? "null" : value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : null;
  if (v === null) throw new Error(`Valeur .is() invalide: ${String(value)}`);
  return `${ident(column)} is ${negate ? "not " : ""}${v}`;
}

function opClause(column: string, op: string, value: unknown, p: Params): string {
  if (op === "is") return isClause(column, value);
  if (op === "in") {
    const list = Array.isArray(value) ? value : parseInList(String(value));
    if (list.length === 0) return "false";
    return `${ident(column)} = any(${p.add(list)})`;
  }
  if (op === "cs") return `${ident(column)} @> ${p.add(value)}`;
  const sqlOp = OPS[op];
  if (!sqlOp) throw new Error(`Opérateur non supporté: ${op}`);
  return `${ident(column)} ${sqlOp} ${p.add(value)}`;
}

function parseInList(raw: string): string[] {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
    .filter((s) => s.length > 0);
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Parses PostgREST logic filters such as `a.eq.1,b.is.null,and(c.gte.2,d.lt.3)`. */
function parseLogic(expr: string, joiner: "or" | "and", p: Params): string {
  const clauses = splitTopLevel(expr).map((part) => {
    const nested = part.match(/^(not\.)?(and|or)\((.*)\)$/);
    if (nested) {
      const inner = parseLogic(nested[3]!, nested[2] as "or" | "and", p);
      return nested[1] ? `not (${inner})` : `(${inner})`;
    }
    const [column, ...rest] = part.split(".");
    let op = rest.shift()!;
    let negate = false;
    if (op === "not") {
      negate = true;
      op = rest.shift()!;
    }
    const value = rest.join(".");
    const clause = opClause(column!, op, value === "null" && op !== "is" ? null : value, p);
    return negate ? `not (${clause})` : clause;
  });
  return clauses.length ? `(${clauses.join(` ${joiner} `)})` : "true";
}

type Action = "select" | "insert" | "update" | "upsert" | "delete";

export class QueryBuilder<T = any[]> implements PromiseLike<QueryResult<T>> {
  private action: Action = "select";
  private columns = "*";
  private returning: string | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private payload: Record<string, unknown>[] = [];
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(
    private readonly table: string,
    private readonly resolveUser: UserResolver,
  ) {
    ident(table);
  }

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.action === "select") {
      this.columns = columns;
      if (options?.count) this.countMode = "exact";
      if (options?.head) this.head = true;
    } else {
      this.returning = columns;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.action = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.action = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.onConflict = options?.onConflict ?? "id";
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.action = "update";
    this.payload = [values];
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  private addOp(column: string, op: string, value: unknown): this {
    this.filters.push((p) => opClause(column, op, value, p));
    return this;
  }

  eq(column: string, value: unknown) {
    return this.addOp(column, "eq", value);
  }
  neq(column: string, value: unknown) {
    return this.addOp(column, "neq", value);
  }
  gt(column: string, value: unknown) {
    return this.addOp(column, "gt", value);
  }
  gte(column: string, value: unknown) {
    return this.addOp(column, "gte", value);
  }
  lt(column: string, value: unknown) {
    return this.addOp(column, "lt", value);
  }
  lte(column: string, value: unknown) {
    return this.addOp(column, "lte", value);
  }
  like(column: string, value: string) {
    return this.addOp(column, "like", value);
  }
  ilike(column: string, value: string) {
    return this.addOp(column, "ilike", value);
  }
  is(column: string, value: null | boolean) {
    return this.addOp(column, "is", value);
  }
  in(column: string, values: readonly unknown[]) {
    return this.addOp(column, "in", [...values]);
  }
  contains(column: string, value: unknown) {
    return this.addOp(column, "cs", value);
  }
  match(query: Record<string, unknown>) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  not(column: string, op: string, value: unknown): this {
    this.filters.push((p) => {
      if (op === "is") return isClause(column, value, true);
      return `not (${opClause(column, op, value, p)})`;
    });
    return this;
  }
  or(expr: string): this {
    this.filters.push((p) => parseLogic(expr, "or", p));
    return this;
  }
  filter(column: string, op: string, value: unknown) {
    return this.addOp(column, op, value);
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const dir = options?.ascending === false ? "desc" : "asc";
    const nulls =
      options?.nullsFirst === undefined ? "" : options.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${ident(column)} ${dir}${nulls}`);
    return this;
  }

  limit(n: number): this {
    this.limitN = Math.max(0, Math.floor(n));
    return this;
  }

  range(from: number, to: number): this {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  single(): QueryBuilder<any> {
    this.singleMode = "single";
    return this as QueryBuilder<any>;
  }

  maybeSingle(): QueryBuilder<any> {
    this.singleMode = "maybe";
    return this as QueryBuilder<any>;
  }

  private where(p: Params): string {
    if (this.filters.length === 0) return "";
    return ` where ${this.filters.map((f) => f(p)).join(" and ")}`;
  }

  private buildInsert(p: Params, upsert: boolean): string {
    const keys = [...new Set(this.payload.flatMap((row) => Object.keys(row)))];
    if (keys.length === 0) return `insert into public.${ident(this.table)} default values`;
    const rows = this.payload.map(
      (row) => `(${keys.map((k) => (k in row && row[k] !== undefined ? p.add(row[k]) : "default")).join(", ")})`,
    );
    let sql = `insert into public.${ident(this.table)} (${keys.map(ident).join(", ")}) values ${rows.join(", ")}`;
    if (upsert) {
      const conflict = this.onConflict!.split(",").map(ident).join(", ");
      const updates = keys
        .filter((k) => !this.onConflict!.split(",").map((s) => s.trim()).includes(k))
        .map((k) => `${ident(k)} = excluded.${ident(k)}`);
      sql +=
        this.ignoreDuplicates || updates.length === 0
          ? ` on conflict (${conflict}) do nothing`
          : ` on conflict (${conflict}) do update set ${updates.join(", ")}`;
    }
    return sql;
  }

  private async run(client: pg.PoolClient): Promise<QueryResult<T>> {
    const p = new Params();
    let sql: string;
    let count: number | null = null;
    const table = `public.${ident(this.table)}`;
    const returning = this.returning !== null ? ` returning ${selectList(this.returning)}` : "";

    switch (this.action) {
      case "select": {
        const where = this.where(p);
        if (this.countMode) {
          const res = await client.query(`select count(*)::int as c from ${table}${where}`, p.values);
          count = res.rows[0].c;
          if (this.head) return { data: null as T, error: null, count, status: 200, statusText: "OK" };
        }
        sql = `select ${selectList(this.columns)} from ${table}${where}`;
        if (this.orders.length) sql += ` order by ${this.orders.join(", ")}`;
        if (this.limitN !== null) sql += ` limit ${this.limitN}`;
        if (this.offsetN !== null) sql += ` offset ${this.offsetN}`;
        break;
      }
      case "insert":
        sql = this.buildInsert(p, false) + returning;
        break;
      case "upsert":
        sql = this.buildInsert(p, true) + returning;
        break;
      case "update": {
        const sets = Object.entries(this.payload[0] ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${ident(k)} = ${p.add(v)}`);
        if (sets.length === 0) throw new Error("Aucune valeur à mettre à jour");
        sql = `update ${table} set ${sets.join(", ")}${this.where(p)}${returning}`;
        break;
      }
      case "delete":
        sql = `delete from ${table}${this.where(p)}${returning}`;
        break;
    }

    const res = await client.query(sql, p.values);
    const rows = this.action === "select" || this.returning !== null ? res.rows : null;
    if (this.countMode === null && this.action !== "select") count = res.rowCount ?? null;

    if (this.singleMode && rows) {
      if (rows.length > 1 || (rows.length === 0 && this.singleMode === "single")) {
        return {
          data: null as T,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${rows.length} rows`,
          },
          count,
          status: 406,
          statusText: "Not Acceptable",
        };
      }
      return { data: (rows[0] ?? null) as T, error: null, count, status: 200, statusText: "OK" };
    }
    return { data: rows as T, error: null, count, status: 200, statusText: "OK" };
  }

  async execute(): Promise<QueryResult<T>> {
    try {
      const userId = await this.resolveUser();
      return await withUser(userId, (client) => this.run(client));
    } catch (err) {
      return { data: null as T, error: toDbError(err), count: null, status: 400, statusText: "Bad Request" };
    }
  }

  then<R1 = QueryResult<T>, R2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

type FnMeta = { returnsSet: boolean; composite: boolean; void: boolean };
const fnMetaCache = new Map<string, FnMeta>();

async function functionMeta(client: pg.PoolClient, name: string): Promise<FnMeta> {
  const cached = fnMetaCache.get(name);
  if (cached) return cached;
  const res = await client.query(
    `select p.proretset, t.typtype, t.typname
       from pg_proc p join pg_type t on t.oid = p.prorettype
      where p.proname = $1 and p.pronamespace = 'public'::regnamespace
      limit 1`,
    [name],
  );
  if (res.rowCount === 0) throw new Error(`Fonction introuvable: public.${name}`);
  const row = res.rows[0];
  const meta: FnMeta = {
    returnsSet: row.proretset,
    composite: row.typtype === "c" || row.typname === "record",
    void: row.typname === "void",
  };
  fnMetaCache.set(name, meta);
  return meta;
}

/** supabase.rpc(name, args) equivalent, with named arguments. */
export async function callRpc<T = any>(
  name: string,
  args: Record<string, unknown> | undefined,
  resolveUser: UserResolver,
): Promise<QueryResult<T>> {
  try {
    ident(name);
    const userId = await resolveUser();
    return await withUser(userId, async (client) => {
      const meta = await functionMeta(client, name);
      const p = new Params();
      const argSql = Object.entries(args ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${ident(k)} => ${p.add(v)}`)
        .join(", ");
      const call = `public.${ident(name)}(${argSql})`;

      let data: unknown;
      if (meta.returnsSet) {
        const res = await client.query(`select * from ${call}`, p.values);
        data = meta.composite ? res.rows : res.rows.map((r) => Object.values(r)[0]);
      } else if (meta.composite) {
        const res = await client.query(`select * from ${call}`, p.values);
        const row = res.rows[0];
        data = row && Object.values(row).some((v) => v !== null) ? row : null;
      } else {
        const res = await client.query(`select ${call} as v`, p.values);
        data = meta.void ? null : res.rows[0]?.v ?? null;
      }
      return { data: data as T, error: null, count: null, status: 200, statusText: "OK" };
    });
  } catch (err) {
    return { data: null as T, error: toDbError(err), count: null, status: 400, statusText: "Bad Request" };
  }
}
