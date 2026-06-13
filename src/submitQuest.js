import chalk from "chalk";
import { simpleGit } from "simple-git";

import { navigateToQuestDirectory } from "./utils/navigation.js";
import { currentWorkingQuest } from "./quest/index.js";

import {
  NoUpstreamBranchMessage,
  SUBMISSION_ERROR_BANNER,
  SUBMISSION_FAILED_BANNER,
  UNCOMMITTED_FILES_MESSAGE,
} from "./utils/messages.js";

import { getToken } from "./utils/token.js";

import {
  getWsClient,
  waitTopicMessage,
  waitTopicEventMessage,
  waitExclusiveTopicEventsMessage,
} from "./utils/websocket.js";

import { printPart } from "./utils/report.js";

import {
  createSpinner,
  startSpinner,
  stopSpinner,
  succeedSpinner,
} from "./utils/spinner.js";

const git = simpleGit();

export async function submitQuest(
  isSetUpstream,
  isListening,
  environment
) {

  let client = null;
  const spinner = createSpinner();

  try {

    navigateToQuestDirectory();

    console.log();

    const quest = currentWorkingQuest();

    validateQuestType(quest);

    await validateGitStatus();

    const currentBranch = await getCurrentBranch();

    await validateUpstreamBranch(
      currentBranch,
      isSetUpstream
    );

    if (isListening) {
      client = await connectToQuestplay(
        spinner,
        environment
      );
    }

    await commitChanges(
      spinner,
      quest.info.name
    );

    await pushChanges(
      spinner,
      currentBranch.name
    );

    if (isListening) {
      await handleVerificationResults(
        spinner,
        client
      );
    } else {
      printSubmissionSuccess(
        quest.info.name
      );
    }

  } catch (error) {

    spinner.stop();

    console.log(
      chalk.red(
        error?.message || error
      )
    );

    process.exit(1);

  } finally {

    stopSpinner(spinner);

    if (client) {
      client.close();
    }
  }
}

/* -------------------------- */
/* Validation Helpers */
/* -------------------------- */

function validateQuestType(quest) {

  if (quest.info.type === "ctf") {

    console.log(
      chalk.yellow(
        "Quest is a CTF quest. No need to submit via Questplay.\n"
      )
    );

    process.exit(0);
  }
}

async function validateGitStatus() {

  const status = await git.status();

  if (status.files.length > 0) {
    console.log(UNCOMMITTED_FILES_MESSAGE);
    process.exit(1);
  }
}

async function getCurrentBranch() {

  const branchSummary = await git.branch();

  return branchSummary.branches[
    branchSummary.current
  ];
}

async function validateUpstreamBranch(
  currentBranch,
  isSetUpstream
) {

  if (isSetUpstream) {
    return;
  }

  const result = await git.raw(
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    currentBranch.name
  );

  if (result === "") {

    console.log(
      NoUpstreamBranchMessage(
        currentBranch.name
      )
    );

    process.exit(1);
  }
}

/* -------------------------- */
/* Git Actions */
/* -------------------------- */

async function commitChanges(
  spinner,
  questName
) {

  startSpinner(
    spinner,
    "Committing files"
  );

  await git.commit(
    `#${questName}`,
    [],
    ["--allow-empty"]
  );

  succeedSpinner(
    spinner,
    "Committed files"
  );
}

async function pushChanges(
  spinner,
  branchName
) {

  startSpinner(
    spinner,
    "Pushing files"
  );

  await git.push([
    "-u",
    "origin",
    branchName
  ]);

  succeedSpinner(
    spinner,
    "Pushed files"
  );
}

/* -------------------------- */
/* WebSocket / Verification */
/* -------------------------- */

async function connectToQuestplay(
  spinner,
  environment
) {

  startSpinner(
    spinner,
    "Connecting to Questplay"
  );

  const token = await getToken(
    environment
  );

  const client = await getWsClient(
    token,
    environment
  );

  await waitTopicMessage(
    client,
    "connect"
  );

  succeedSpinner(
    spinner,
    "Connected to Questplay"
  );

  return client;
}

async function handleVerificationResults(
  spinner,
  client
) {

  startSpinner(
    spinner,
    "Waiting for server to start verification"
  );

  await waitTopicEventMessage(
    client,
    "quests",
    "offChainVerificationStarted"
  );

  succeedSpinner(
    spinner,
    "Server started verification"
  );

  startSpinner(
    spinner,
    "Waiting for results"
  );

  const message =
    await waitExclusiveTopicEventsMessage(
      client,
      "quests",
      [
        "offChainVerificationFinished",
        "offChainVerificationFailed",
      ],
      1000 * 90
    );

  succeedSpinner(
    spinner,
    "Received results"
  );

  await processVerificationMessage(
    message
  );
}

async function processVerificationMessage(
  message
) {

  if (
    message.event ===
    "offChainVerificationFailed"
  ) {

    console.log(
      SUBMISSION_FAILED_BANNER
    );

    console.log(
      chalk.red(
        message.data.error
      )
    );

    return;
  }

  if (
    message.data.result.error
  ) {

    console.log(
      SUBMISSION_ERROR_BANNER
    );

    console.log(
      chalk.red(
        message.data.result.error
      )
    );

    return;
  }

  console.log(
    chalk.green(
      "\nSubmission successful"
    )
  );

  const report =
    message.data.result.testReport.sort(
      (a, b) => a.part - b.part
    );

  for (const part of report) {
    await printPart(part);
  }
}

/* -------------------------- */
/* UI Helpers */
/* -------------------------- */

function printSubmissionSuccess(
  questName
) {

  console.log(
    chalk.green(
      `Quest ${questName} submitted, your results will be available on nodeguardians.io in a few seconds.\n`
    )
  );
}
