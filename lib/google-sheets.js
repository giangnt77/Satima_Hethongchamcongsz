class GoogleSheetsQuery {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.columns = '*';
    this.values = null;
    this.filters = [];
    this.anyFilters = [];
    this.orders = [];
    this.conflict = '';
    this.cardinality = 'many';
    this.returning = false;
    this.rowLimit = null;
    this.rowOffset = 0;
    this.countMode = false;
    this.headOnly = false;
  }

  select(columns = '*', options = {}) {
    this.columns = columns;
    if (this.operation !== 'select') this.returning = true;
    this.countMode = options.count === 'exact';
    this.headOnly = options.head === true;
    return this;
  }

  insert(values) {
    this.operation = 'insert';
    this.values = values;
    return this;
  }

  upsert(values, options = {}) {
    this.operation = 'upsert';
    this.values = values;
    this.conflict = options.onConflict || '';
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  is(column, value) {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, operator: 'ilike', value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }

  or(expression) {
    this.anyFilters = expression.split(',').map((part) => {
      const match = part.match(/^([^.]+)\.(eq|neq|gte|lte|ilike|is)\.(.*)$/);
      if (!match) throw new Error(`Invalid OR filter: ${part}`);
      return { column: match[1], operator: match[2], value: match[3] };
    });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({
      column,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }

  limit(count) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('Google Sheets query limit must be a non-negative integer.');
    }
    this.rowLimit = count;
    return this;
  }

  range(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new RangeError('Google Sheets query range must use non-negative integer indexes.');
    }
    this.rowOffset = start;
    this.rowLimit = end - start + 1;
    return this;
  }

  single() {
    this.cardinality = 'one';
    return this;
  }

  maybeSingle() {
    this.cardinality = 'maybe-one';
    return this;
  }

  then(resolve, reject) {
    return runRequest({
      table: this.table,
      operation: this.operation,
      columns: this.columns,
      values: this.values,
      filters: this.filters,
      anyFilters: this.anyFilters,
      orders: this.orders,
      limit: this.rowLimit,
      offset: this.rowOffset,
      conflict: this.conflict,
      cardinality: this.cardinality,
      returning: this.returning,
      count: this.countMode,
      head: this.headOnly,
    }).then((result) => {
      if (result?.data && Number.isInteger(result.data.count) && Array.isArray(result.data.rows)) {
        result.count = result.data.count;
        result.data = result.data.rows;
      }
      return resolve ? resolve(result) : result;
    }, reject);
  }
}

async function runRequest(payload) {
  if (typeof window !== 'undefined' && window.google?.script?.run) {
    return new Promise((resolve) => {
      const request = {
        ...payload,
        sessionToken: sessionStorage.getItem('chems_gas_session') || '',
      };
      window.google.script.run
        .withSuccessHandler((result) => {
          if (result?.sessionToken) {
            sessionStorage.setItem('chems_gas_session', result.sessionToken);
          }
          if (payload.operation === 'logout') {
            sessionStorage.removeItem('chems_gas_session');
          }
          resolve(result || {
            data: null,
            error: { message: 'Google Apps Script returned an empty response.' },
          });
        })
        .withFailureHandler((error) => {
          resolve({
            data: null,
            error: { message: error?.message || 'Could not connect to Google Apps Script.' },
          });
        })
        .apiRequest(request);
    });
  }

  return {
    data: null,
    error: { message: 'This app must run as a Google Apps Script Web App.' },
  };
}

export const googleSheets = {
  from(table) {
    return new GoogleSheetsQuery(table);
  },

  async rpc(name, params = {}) {
    return runRequest({ operation: 'rpc', name, params });
  },

  async uploadEmployeeCccd(employeeId, base64, mimeType) {
    return runRequest({
      operation: 'upload_cccd',
      employee_id: employeeId,
      base64,
      mime_type: mimeType,
    });
  },

  async uploadNewsImage(base64, mimeType) {
    return runRequest({
      operation: 'upload_news_image',
      base64,
      mime_type: mimeType,
    });
  },

  async restoreBackup(backup) {
    return runRequest({
      operation: 'restore_backup',
      backup,
    });
  },

  async downloadEmployeeCccd(fileId) {
    return runRequest({ operation: 'get_cccd', file_id: fileId });
  },

  async logout() {
    return runRequest({ operation: 'logout' });
  },

  async getSalaryConfirmation(month) {
    return runRequest({ operation: 'salary_confirmation', action: 'get', month });
  },

  async confirmSalary(month) {
    return runRequest({ operation: 'salary_confirmation', action: 'confirm', month });
  },

  async sendShiftSwapEmail(swap, isTest = false) {
    if (typeof window !== 'undefined' && window.google?.script?.run) {
      const result = await runRequest({
        operation: 'send_shift_swap_email',
        swap,
        is_test: isTest,
      });
      if (result?.error) return { ok: false, error: result.error.message || 'Email notification failed.' };
      return result?.data || { ok: false, error: 'Apps Script returned an empty email response.' };
    }
    return { ok: false, error: 'Email notifications require a Google Apps Script Web App.' };
  },
};
