import chalk from "chalk";
import fs from "fs";
import path from "path";

import { simpleGit } from "simple-git";

import {
  navigateToMainDirectory,
  readSettings,
  writeSettings,
} from "./utils/navigation.js";

import { QuestDownloader } from "./utils/downloader.js";

import {
  UNCOMMITTED_FILES_BEFORE_UPDATE_MESSAGE,
} from "./utils/messages.js";

import {
  isLatestVersion,
  remoteVersion,
} from "./utils/versions.js";

const git = simpleGit();

export async function updateQuestplay(
  newRemote = null
) {

  try {

    navigateToMainDirectory();

    console.log();

    const settings = await prepareSettings(
      newRemote
    );

    const { devMode } = settings;

    await validateGitStatus(devMode);

    await checkForUpdates();

    await performUpdate();

    await installGitHook();

    await initializeSubmodules();

    await createUpdateCommit(devMode);

  } catch (error) {

    console.log(
      chalk.red(
        error?.message || error
      )
    );

    process.exit(1);
  }
}

/* -------------------------- */
/* Settings */
/* -------------------------- */

async function prepareSettings(
  newRemote
) {

  const settings = readSettings();

  if (newRemote) {

    settings.remote = newRemote;

    writeSettings(settings);
  }

  return settings;
}

/* -------------------------- */
/* Validation */
/* -------------------------- */

async function validateGitStatus(
  devMode
) {

  if (devMode) {
    return;
  }

  const status = await git.status();

  if (status.files.length > 0) {

    console.log(
      UNCOMMITTED_FILES_BEFORE_UPDATE_MESSAGE
    );

    process.exit(1);
  }
}

async function checkForUpdates() {

  const latest =
    await isLatestVersion();

  if (latest) {

    console.log(
      chalk.yellow(
        "Questplay is up-to-date.\n"
      )
    );

    process.exit(0);
  }
}

/* -------------------------- */
/* Update Process */
/* -------------------------- */

async function performUpdate() {

  console.log(
    chalk.green(
      "\nUpdating Questplay..."
    )
  );

  const downloader =
    new QuestDownloader();

  const remoteBranch =
    readSettings().remote;

  const options =
    remoteBranch
      ? { sha: remoteBranch }
      : {};

  await downloader.downloadQuestplay(
    options
  );

  console.log(
    chalk.green(
      "\nInstalling Questplay..."
    )
  );

  await downloader.installSubpackage();
}

async function installGitHook() {

  const sourceHook = path.join(
    process.cwd(),
    "hooks",
    "pre-commit"
  );

  const targetHook = path.join(
    process.cwd(),
    ".git",
    "hooks",
    "pre-commit"
  );

  if (!fs.existsSync(sourceHook)) {

    throw new Error(
      "Pre-commit hook file not found."
    );
  }

  fs.copyFileSync(
    sourceHook,
    targetHook
  );

  console.log(
    chalk.green(
      "\nPre-commit hook updated."
    )
  );
}

async function initializeSubmodules() {

  console.log(
    chalk.green(
      "\nUpdating submodules..."
    )
  );

  await git.submoduleUpdate([
    "--init",
    "--recursive",
  ]);
}

/* -------------------------- */
/* Git Commit */
/* -------------------------- */

async function createUpdateCommit(
  devMode
) {

  if (devMode) {
    return;
  }

  try {

    const version =
      await remoteVersion();

    await git.add("--all");

    await git.commit(
      `Update Questplay to ${version}`
    );

    console.log(
      chalk.green(
        "\nUpdate committed.\n"
      )
    );

  } catch (error) {

    console.log(
      chalk.grey(
        "\nGit commit failed. Please commit the Questplay update manually.\n"
      )
    );
  }
}
