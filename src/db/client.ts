// ✅ In-memory database for MVP (no native dependencies)
// Will migrate to PostgreSQL for v1.0

interface DbRow {
  [key: string]: any;
}

interface DbTable {
  [tableName: string]: DbRow[];
}

class InMemoryDB {
  private tables: DbTable = {};
  private lastInsertId = 0;

  prepare(sql: string) {
    const self = this;
    return {
      run: (...params: any[]) => {
        try {
          self.executeQuery(sql, params);
          return { changes: 1 };
        } catch (err) {
          console.error('SQL Error:', err);
          return { changes: 0 };
        }
      },
      get: (...params: any[]) => {
        try {
          const results = self.executeQuery(sql, params);
          return results[0] || null;
        } catch (err) {
          console.error('SQL Error:', err);
          return null;
        }
      },
      all: (...params: any[]) => {
        try {
          return self.executeQuery(sql, params);
        } catch (err) {
          console.error('SQL Error:', err);
          return [];
        }
      }
    };
  }

  exec(sql: string) {
    const statements = sql.split(';').filter(s => s.trim());
    statements.forEach(stmt => {
      if (stmt.includes('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (match) {
          const tableName = match[1].toLowerCase();
          if (!this.tables[tableName]) {
            this.tables[tableName] = [];
          }
        }
      }
    });
  }

  pragma(setting: string) {
    // Ignore pragma commands
  }

  private executeQuery(sql: string, params: any[]): DbRow[] {
    const upperSql = sql.toUpperCase();

    if (upperSql.includes('INSERT')) {
      return this.handleInsert(sql, params);
    } else if (upperSql.includes('SELECT')) {
      return this.handleSelect(sql, params);
    } else if (upperSql.includes('UPDATE')) {
      return this.handleUpdate(sql, params);
    } else if (upperSql.includes('DELETE')) {
      return this.handleDelete(sql, params);
    }

    return [];
  }

  private handleInsert(sql: string, params: any[]): DbRow[] {
    const tableMatch = sql.match(/INSERT INTO (\w+)/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1].toLowerCase();
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }

    const columnsMatch = sql.match(/\(([\s\S]*?)\)\s*VALUES/i);
    const columns = columnsMatch ? columnsMatch[1].split(',').map(c => c.trim()) : [];

    console.log(`[DB] INSERT into ${tableName}: columns=${columns.join(', ')}, params=${params.length}`);

    const row: DbRow = {};
    columns.forEach((col, i) => {
      row[col] = params[i];
      console.log(`[DB] Set ${col} = ${params[i]}`);
    });

    this.tables[tableName].push(row);
    console.log(`[DB] Inserted row, total rows in ${tableName}: ${this.tables[tableName].length}`);
    return [];
  }

  private handleSelect(sql: string, params: any[]): DbRow[] {
    let query = sql.toLowerCase();
    const tableMatch = sql.match(/FROM (\w+)/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1].toLowerCase();
    let rows = [...(this.tables[tableName] || [])];

    console.log(`[DB] SELECT from ${tableName}: found ${rows.length} rows`);

    // ✅ Handle COUNT(*) aggregation
    if (query.includes('count(*)')) {
      console.log(`[DB] COUNT(*) aggregation`);

      // Apply WHERE filters first
      if (query.includes('where')) {
        const whereIndex = query.indexOf('where');
        const whereClause = sql.substring(whereIndex + 5).split(/GROUP|LIMIT|OFFSET|ORDER/i)[0];
        const condMatches = whereClause.matchAll(/(\w+)\s*=\s*\?/gi);
        let paramIdx = 0;

        for (const match of condMatches) {
          const col = match[1];
          const value = params[paramIdx++];
          rows = rows.filter(row => row[col] === value);
        }
      }

      return [{ count: rows.length }];
    }

    // ✅ Simple WHERE clause parsing
    if (query.includes('where')) {
      const whereIndex = query.indexOf('where');
      const whereClause = sql.substring(whereIndex + 5).split(/GROUP|LIMIT|OFFSET|ORDER/i)[0];

      // Parse WHERE conditions with simple regex
      const condMatches = whereClause.matchAll(/(\w+)\s*=\s*\?/gi);
      let paramIdx = 0;

      for (const match of condMatches) {
        const col = match[1];
        const value = params[paramIdx++];

        console.log(`[DB] WHERE ${col} = ${value}`);

        rows = rows.filter(row => {
          const rowValue = row[col];
          const match = rowValue === value;
          console.log(`[DB] Row ${col}=${rowValue}, match=${match}`);
          return match;
        });
      }
    }

    console.log(`[DB] After filtering: ${rows.length} rows`);

    // ✅ Handle GROUP BY
    if (query.includes('group by')) {
      const groupMatch = sql.match(/GROUP BY (\w+)/i);
      if (groupMatch) {
        const groupCol = groupMatch[1].toLowerCase();
        const grouped: { [key: string]: DbRow[] } = {};

        rows.forEach(row => {
          const key = String(row[groupCol]);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(row);
        });

        rows = Object.entries(grouped).map(([key, group]) => ({
          [groupCol]: key,
          count: group.length
        }));
      }
    }

    // ✅ Handle LIMIT and OFFSET
    if (query.includes('limit')) {
      const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
      if (limitMatch) {
        const limit = parseInt(limitMatch[1]);
        const offset = limitMatch[2] ? parseInt(limitMatch[2]) : 0;
        rows = rows.slice(offset, offset + limit);
      }
    }

    return rows;
  }

  private handleUpdate(sql: string, params: any[]): DbRow[] {
    const tableMatch = sql.match(/UPDATE (\w+)/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables[tableName];
    if (!table) return [];

    // Simple update: just update first match
    const whereIndex = sql.toLowerCase().indexOf('where');
    if (whereIndex > 0) {
      const whereClause = sql.substring(whereIndex);
      table.forEach(row => {
        // Update matching rows
        if (whereClause.includes('id = ?')) {
          const idParamIndex = [...sql.matchAll(/\?/g)].length - 1;
          if (row.id === params[idParamIndex]) {
            // Extract SET clause
            const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i);
            if (setMatch) {
              const setCols = setMatch[1].split(',');
              let paramIdx = 0;
              setCols.forEach(col => {
                const [colName] = col.split('=').map(c => c.trim());
                row[colName] = params[paramIdx++];
              });
            }
          }
        }
      });
    }

    return [];
  }

  private handleDelete(sql: string, params: any[]): DbRow[] {
    const tableMatch = sql.match(/DELETE FROM (\w+)/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables[tableName];
    if (!table) return [];

    const whereIndex = sql.toLowerCase().indexOf('where');
    if (whereIndex > 0) {
      // Simple delete: remove rows matching first WHERE condition
      this.tables[tableName] = table.filter(row => {
        if (sql.includes('id = ?')) {
          const idParamIndex = [...sql.matchAll(/\?/g)].length - 1;
          return row.id !== params[idParamIndex];
        }
        return true;
      });
    }

    return [];
  }
}

export const db = new InMemoryDB() as any;

export type DbResult<T> = T & { lastInsertRowid?: number };

// NOTE: This is in-memory storage for MVP development.
// v1.0 will use PostgreSQL for persistent storage.
