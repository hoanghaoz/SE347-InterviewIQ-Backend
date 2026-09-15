import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import pc from 'picocolors';

const execFileAsync = promisify(execFile);
type CheckResult = {
  name: string;
  good: boolean;
  hint?: string | null;
};

async function checkDocker(): Promise<CheckResult> {
  try {
    await execFileAsync('docker', ['info']);
    return {
      name: 'Docker',
      good: true,
    };
  } catch {
    return {
      name: 'Docker',
      good: false,
      hint: 'Docker is not installed or not running',
    };
  }
}

function checkEnvFileExists(): CheckResult {
  try {
    if (!existsSync('.env')) {
      return {
        name: '.env file',
        good: false,
        hint: 'The .env file is missing. Please create it from .env.example',
      };
    }
    return {
      name: '.env file',
      good: true,
    };
  } catch {
    return {
      name: '.env file',
      good: false,
      hint: 'An error occurred while checking the .env file',
    };
  }
}

function checkEnvKeys(requiredKeys: string[]): CheckResult {
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  if (missingKeys.length > 0) {
    return {
      name: 'Environment Variables',
      good: false,
      hint: `Missing required environment variables: ${missingKeys.join(', ')}`,
    };
  }
  return {
    name: 'Environment Variables',
    good: true,
  };
}

async function main() {
  console.log(pc.bold('Checking dev environment...\n'));
  const envFileCheck = checkEnvFileExists();
  if (envFileCheck.good) {
    process.loadEnvFile('.env');
  }

  const checks: CheckResult[] = [
    envFileCheck,
    await checkDocker(),
    // change the required keys as needed for your project
    checkEnvKeys([
      'DATABASE_URL',
      'JWT_SECRET',
      'S3_BUCKET_NAME',
      'CLOUDFLARE_ACCESS_KEY_ID',
      'CLOUDFLARE_SECRET_ACCESS_KEY',
      'S3_API_ENDPOINT',
    ]),
  ];

  let allGood = true;
  for (const check of checks) {
    if (!check.good) {
      allGood = false;
      console.error(`❌ ${check.name} check failed: ${check.hint}`);
    } else {
      console.log(`✅ ${check.name} check passed`);
    }
  }

  if (!allGood) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(pc.red('doctor-cli crashed:'), error);
  process.exit(1);
});
