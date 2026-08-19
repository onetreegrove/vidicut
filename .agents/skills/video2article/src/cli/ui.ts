import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
  });
}

export function logTitle(title: string) {
  console.log(chalk.bold.magenta(`\n=== ${title} ===\n`));
}

export function logSuccess(message: string) {
  console.log(chalk.green(`✔ ${message}`));
}

export function logInfo(message: string) {
  console.log(chalk.blue(`ℹ ${message}`));
}

export function logWarning(message: string) {
  console.log(chalk.yellow(`⚠ ${message}`));
}

export function logError(message: string) {
  console.log(chalk.red(`✖ ${message}`));
}
