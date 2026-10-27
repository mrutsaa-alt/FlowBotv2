const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const dotenv = require('../backend/node_modules/dotenv');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');
const containerName = 'flowbot-local-auth-db';
const defaultVolume = 'flowbot_local_auth_db';
const envFile = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

function command(name, args, options = {}) {
  return spawnSync(name, args, { cwd: root, encoding: 'utf8', ...options });
}

function requireCommand(name, args, options = {}) {
  const result = command(name, args, options);
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || `${name} ${args[0]} failed`);
  }
  return result.stdout?.trim() || '';
}

function inspectContainer() {
  const result = command('docker', ['inspect', containerName]);
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout)[0];
}

function parseContainerEnv(container) {
  return Object.fromEntries((container.Config.Env || []).map(entry => {
    const index = entry.indexOf('=');
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
}

function writeLocalEnv(values) {
  const content = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  fs.writeFileSync(envPath, content, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}

function ensureDependencies() {
  for (const directory of ['backend/node_modules', 'frontend/node_modules']) {
    if (!fs.existsSync(path.join(root, directory))) {
      throw new Error(`Dependencies are missing. Run "npm run install:all" before "npm run dev:local".`);
    }
  }
}

async function waitForDatabase() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = command('docker', [
      'exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'flowbot', '-d', 'flowbot',
    ], { stdio: 'ignore' });
    if (result.status === 0) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('PostgreSQL did not become ready within 30 seconds. Check Docker logs for flowbot-local-auth-db.');
}

function launch(name, args, env, children) {
  const child = spawn(name, args, { cwd: root, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => {
    console.error(`${name} failed to start: ${error.message}`);
    stop(1, children);
  });
  child.on('exit', code => {
    if (!stopping) stop(code || 0, children);
  });
}

let stopping = false;
function stop(code, children) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
}

async function main() {
  if (process.platform !== 'linux') throw new Error('This local launcher uses Linux host networking; use docker compose on other platforms.');
  ensureDependencies();
  requireCommand('docker', ['info'], { stdio: 'ignore' });

  let local = {
    ...envFile,
    JWT_SECRET: envFile.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    TOKEN_ENCRYPTION_KEY: envFile.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
    WEBHOOK_VERIFY_TOKEN: envFile.WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(32).toString('hex'),
    META_APP_SECRET: envFile.META_APP_SECRET || crypto.randomBytes(32).toString('hex'),
  };
  const container = inspectContainer();
  let databasePassword = local.DB_PASSWORD;
  let databaseVolume = local.DB_VOLUME || defaultVolume;

  if (container) {
    if (container.HostConfig.NetworkMode !== 'host') {
      throw new Error(`Container ${containerName} is not using host networking. Remove or rename it before using the local launcher.`);
    }
    const containerEnv = parseContainerEnv(container);
    if (!containerEnv.POSTGRES_PASSWORD) throw new Error(`Container ${containerName} has no POSTGRES_PASSWORD.`);
    if (databasePassword && databasePassword !== containerEnv.POSTGRES_PASSWORD) {
      throw new Error('DB_PASSWORD in .env.local does not match the existing database container. Keep the existing credentials and volume.');
    }
    databasePassword = containerEnv.POSTGRES_PASSWORD;
    const mountedVolume = (container.Mounts || []).find(mount => mount.Destination === '/var/lib/postgresql/data')?.Name;
    if (mountedVolume) {
      if (local.DB_VOLUME && local.DB_VOLUME !== mountedVolume) {
        throw new Error('DB_VOLUME in .env.local does not match the existing database container.');
      }
      databaseVolume = mountedVolume;
    }
    if (container.State.Status !== 'running') requireCommand('docker', ['start', containerName]);
    requireCommand('docker', ['update', '--restart', 'unless-stopped', containerName]);
  } else {
    if (!databasePassword) databasePassword = crypto.randomBytes(32).toString('hex');
    const volumeExists = command('docker', ['volume', 'inspect', databaseVolume], { stdio: 'ignore' }).status === 0;
    if (volumeExists && !envFile.DB_PASSWORD) {
      throw new Error(`Database volume ${databaseVolume} exists but .env.local is missing its password. Restore the local env file instead of reinitializing the volume.`);
    }
    if (!volumeExists) requireCommand('docker', ['volume', 'create', databaseVolume]);
    requireCommand('docker', [
      'run', '--detach', '--name', containerName, '--network', 'host', '--restart', 'unless-stopped',
      '--mount', `type=volume,source=${databaseVolume},target=/var/lib/postgresql/data`,
      '--env', 'POSTGRES_DB=flowbot', '--env', 'POSTGRES_USER=flowbot', '--env', `POSTGRES_PASSWORD=${databasePassword}`,
      'postgres:16-alpine', '-c', 'listen_addresses=127.0.0.1',
    ]);
  }

  local = { ...local, DB_PASSWORD: databasePassword, DB_VOLUME: databaseVolume };
  writeLocalEnv(local);
  await waitForDatabase();

  if (container) {
    const passwordArg = `PGPASSWORD=${databasePassword}`;
    const listen = command('docker', [
      'exec', '-e', passwordArg, containerName, 'psql', '-h', '127.0.0.1', '-U', 'flowbot', '-d', 'flowbot', '-Atc', 'SHOW listen_addresses',
    ]);
    if (listen.status !== 0) throw new Error(listen.stderr?.trim() || 'Could not verify PostgreSQL listener configuration.');
    if (listen.stdout.trim() !== '127.0.0.1') {
      requireCommand('docker', [
        'exec', '-e', passwordArg, containerName, 'psql', '-h', '127.0.0.1', '-U', 'flowbot', '-d', 'flowbot',
        '-c', "ALTER SYSTEM SET listen_addresses = '127.0.0.1'",
      ]);
      requireCommand('docker', ['restart', containerName]);
      await waitForDatabase();
    }
  }

  const env = {
    ...process.env,
    ...local,
    NODE_ENV: 'development',
    DATABASE_URL: `postgresql://flowbot:${databasePassword}@127.0.0.1:5432/flowbot`,
    DATABASE_SSL: 'false',
    FRONTEND_URL: local.FRONTEND_URL || 'http://localhost:5173',
    BACKEND_URL: local.BACKEND_URL || 'http://localhost:5000',
  };
  requireCommand('npm', ['--prefix', 'backend', 'run', 'migrate'], { env, stdio: 'inherit' });

  console.log('\nFlowBot local development is ready at http://localhost:5173');
  console.log('Database storage is kept in Docker volume:', databaseVolume);
  console.log('Press Ctrl+C to stop the app servers; the database container remains available.\n');

  const children = [];
  process.on('SIGINT', () => stop(0, children));
  process.on('SIGTERM', () => stop(0, children));
  launch('npm', ['--prefix', 'backend', 'run', 'dev'], env, children);
  launch('npm', ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '0.0.0.0'], env, children);
}

main().catch(error => {
  console.error(`Local development setup failed: ${error.message}`);
  process.exitCode = 1;
});