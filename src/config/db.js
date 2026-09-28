const sql = require('mssql');
const config = require('./config');
const logger = require('../utils/logger');

let poolPromise;

/**
 * Get or initialize the singleton MSSQL Connection Pool
 */
const getPool = async () => {
  if (!poolPromise) {
    logger.info(`Connecting to MS SQL Server: ${config.db.server}:${config.db.port} [Database: ${config.db.database}]`);
    poolPromise = new sql.ConnectionPool(config.db)
      .connect()
      .then((pool) => {
        logger.info('Connected to MS SQL Server successfully (Connection pool initialized)');
        
        pool.on('error', (err) => {
          logger.error(`MSSQL Pool Error: ${err.message}`);
          poolPromise = null; // reset pool on error so next call reconnects
        });

        return pool;
      })
      .catch((err) => {
        logger.error(`Database Connection Failed: ${err.message}`);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
};

/**
 * Execute a query using the connection pool
 * @param {string} queryString - SQL query or procedure call
 * @param {Object} [params] - Optional query parameters
 */
const query = async (queryString, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  // Bind input parameters if provided
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }

  return await request.query(queryString);
};

/**
 * Execute a stored procedure using the connection pool
 * @param {string} procedureName - Stored procedure name (e.g. 'dbo.USP_APP_TOP30_CUSTOMERS')
 * @param {Object} [params] - Optional input parameters
 */
const executeProcedure = async (procedureName, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  // Bind input parameters if provided
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }

  return await request.execute(procedureName);
};

/**
 * Close the connection pool gracefully (e.g. on server shutdown)
 */
const closePool = async () => {
  try {
    if (poolPromise) {
      const pool = await poolPromise;
      await pool.close();
      poolPromise = null;
      logger.info('MSSQL Connection pool closed.');
    }
  } catch (err) {
    logger.error(`Error closing MSSQL pool: ${err.message}`);
  }
};

module.exports = {
  sql,
  getPool,
  query,
  executeProcedure,
  closePool
};

