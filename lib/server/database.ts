import 'server-only';
import {createClient, type Client, type InValue, type ResultSet} from '@libsql/client';

let client: Client | undefined;
export function databaseClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('Missing TURSO_DATABASE_URL. See DEPLOYMENT.md.');
    client = createClient({url, authToken: process.env.TURSO_AUTH_TOKEN});
  }
  return client;
}
function result<T>(value: ResultSet) {
  return {results: value.rows as unknown as T[], meta: {changes: value.rowsAffected}};
}
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: unknown[]) { return new Statement(this.sql, args as InValue[]); }
  async all<T = Record<string, unknown>>() {
    return result<T>(await databaseClient().execute({sql: this.sql, args: this.args}));
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run() { return this.all(); }
}
export const database = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    // libSQL executes this batch in one write transaction, including rollback.
    return (await databaseClient().batch(statements.map(s => ({sql:s.sql,args:s.args})), 'write')).map(result<Record<string, unknown>>);
  },
};
